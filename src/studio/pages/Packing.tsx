// Separação: um pacote por vez, com a foto grande de cada item e a voz falando o que vai na caixa.
// Junta os pedidos a embalar do Mercado Livre, da Shopee e do site. Lendo o código de barras da etiqueta
// (câmera do celular ou leitor USB), a tela abre aquele pedido e fala tudo.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type Channel = "mercadolivre" | "shopee" | "nuvemshop";
type Item = { title: string; short: string; qty: number; variation?: string; image?: string };
type Order = { channel: Channel; id: string; number: string; name: string; created_at: string; status?: string; items: Item[]; codes: string[] };
type ChannelInfo = { channel: Channel; connected: boolean; count: number; error?: string };
type Queue = { orders: Order[]; channels: ChannelInfo[]; at: string };

const CH: Record<Channel, { label: string; spoken: string; cls: string }> = {
  mercadolivre: { label: "Mercado Livre", spoken: "Mercado Livre", cls: "ml" },
  shopee: { label: "Shopee", spoken: "Shopee", cls: "sp" },
  nuvemshop: { label: "Site", spoken: "site", cls: "ns" },
};
const keyOf = (o: Order) => `${o.channel}:${o.id}`;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const shortNumber = (o: Order) => (o.channel === "nuvemshop" ? `#${o.number}` : o.number.length > 8 ? `…${o.number.slice(-6)}` : o.number);
const pieces = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);

// ---------- voz ----------
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.find((v) => v.lang === "pt-BR" && /google|luciana|francisca|antonio/i.test(v.name))
    ?? voices.find((v) => v.lang === "pt-BR") ?? voices.find((v) => v.lang.startsWith("pt"));
}
function speak(text: string) {
  const s = window.speechSynthesis;
  if (!s) return false;
  s.cancel();
  // alguns navegadores perdem a fala dita logo depois do cancel
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 0.95;
    s.speak(u);
  }, 60);
  return true;
}
const itemPhrase = (i: Item) => `${i.qty} ${i.short}${i.variation ? `, ${i.variation}` : ""}`;
const orderPhrase = (o: Order) =>
  `Pedido${o.name ? ` de ${o.name}` : ""}, ${CH[o.channel].spoken}. ${o.items.length > 1 ? `${o.items.length} itens: ` : ""}${o.items.map(itemPhrase).join("; ")}.`;

// ---------- etiqueta ----------
function candidates(raw: string): string[] {
  const out = new Set<string>([norm(raw)]);
  try {
    const j = JSON.parse(raw);
    for (const k of ["id", "shipment_id", "order_id", "tracking_number"]) if (j?.[k]) out.add(norm(String(j[k])));
  } catch {
    /* não é JSON */
  }
  for (const m of raw.match(/\d{6,}/g) ?? []) out.add(m);
  for (const m of raw.toUpperCase().match(/[A-Z0-9]{8,}/g) ?? []) out.add(m);
  return [...out].filter(Boolean);
}
function findOrder(orders: Order[], raw: string): Order | undefined {
  const cands = candidates(raw);
  const codes = orders.map((o) => ({ o, codes: o.codes.map(norm).filter(Boolean) }));
  for (const c of cands) {
    const hit = codes.find((x) => x.codes.includes(c));
    if (hit) return hit.o;
  }
  for (const c of cands) {
    const hit = codes.find((x) => x.codes.some((k) => (k.length >= 8 && c.includes(k)) || (c.length >= 8 && k.includes(c))));
    if (hit) return hit.o;
  }
  return undefined;
}

const FORMATS = ["code_128", "qr_code", "code_39", "data_matrix", "itf"] as const;
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Leitor rápido: o do próprio navegador quando existe (Chrome no Android), senão o zxing em WebAssembly (iPhone e o resto). */
async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (Native) {
    const ok = await Native.getSupportedFormats().catch(() => [] as string[]);
    if (ok.includes("code_128") && ok.includes("qr_code")) return new Native({ formats: FORMATS.filter((f) => ok.includes(f)) });
  }
  const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) });
  return new BarcodeDetector({ formats: [...FORMATS] }) as unknown as Detector;
}

/** Câmera sempre ligada: cada leitura chama onRead com os códigos achados no quadro. O mesmo código só conta de novo depois de 6 segundos. */
function LiveCamera({ onRead, onRetry }: { onRead: (texts: string[]) => void; onRetry: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const read = useRef(onRead);
  read.current = onRead;
  const [error, setError] = useState("");
  const [torch, setTorch] = useState<null | boolean>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    const seen = new Map<string, number>();
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!alive) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        const t = stream.getVideoTracks()[0];
        track.current = t;
        const caps = (t.getCapabilities?.() ?? {}) as Record<string, unknown>;
        const adv: Record<string, unknown>[] = [];
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) adv.push({ focusMode: "continuous" });
        if (adv.length) await t.applyConstraints({ advanced: adv } as MediaTrackConstraints).catch(() => undefined);
        if (caps.torch) setTorch(false);
        const detector = await makeDetector();
        // Quadro inteiro e o miolo ampliado, alternando: o miolo pega código pequeno ou longe
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        let crop = false;
        while (alive) {
          if (v.readyState >= 2 && v.videoWidth) {
            let src: CanvasImageSource = v;
            if (crop) {
              const w = v.videoWidth, h = v.videoHeight;
              const cw = Math.round(w * 0.8), ch = Math.round(h * 0.5);
              canvas.width = cw;
              canvas.height = ch;
              ctx.drawImage(v, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
              src = canvas;
            }
            crop = !crop;
            const found = await detector.detect(src).catch(() => []);
            const now = Date.now();
            const fresh = [...new Set(found.map((b) => b.rawValue).filter(Boolean))].filter((x) => now - (seen.get(x) ?? 0) > 6000);
            if (fresh.length) {
              fresh.forEach((x) => seen.set(x, now));
              navigator.vibrate?.(80);
              read.current(fresh);
            }
          }
          await new Promise((r) => setTimeout(r, 60));
        }
      } catch (e) {
        const name = e instanceof Error ? e.name + e.message : String(e);
        setError(/Permission|NotAllowed|Security/i.test(name)
          ? "A câmera está bloqueada. Permita a câmera para este site (cadeado ao lado do endereço → Permissões) e toque em Tentar de novo."
          : "Não consegui abrir a câmera. Feche outros apps que usam a câmera e toque em Tentar de novo.");
      }
    })();
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const toggleTorch = () => {
    const t = track.current;
    if (!t || torch === null) return;
    t.applyConstraints({ advanced: [{ torch: !torch }] } as unknown as MediaTrackConstraints).then(() => setTorch(!torch)).catch(() => undefined);
  };
  return (
    <div className="cam">
      <video ref={video} playsInline muted autoPlay />
      <div className="aim" aria-hidden />
      <p>{error || "Mostre o código de barras ou o QR da etiqueta"}</p>
      {error && <button type="button" className="retry" onClick={onRetry}>Tentar de novo</button>}
      {torch !== null && !error && <button type="button" className="torch" aria-pressed={torch} onClick={toggleTorch}>{torch ? "Luz ligada" : "Luz"}</button>}
    </div>
  );
}

export default function Packing() {
  const q = useQuery({
    queryKey: ["packing-queue"],
    queryFn: () => api.invoke<Queue>("ai", { action: "packing_queue" }),
    retry: false,
    refetchInterval: 3 * 60 * 1000,
    staleTime: 60 * 1000,
  });
  const [started, setStarted] = useState(false);
  const [camera, setCamera] = useState(true);
  const [camTry, setCamTry] = useState(0);
  const [order, setOrder] = useState<Order | null>(null);
  const [miss, setMiss] = useState("");
  const [typed, setTyped] = useState("");
  const [recent, setRecent] = useState<Order[]>([]);
  const all = useMemo(() => q.data?.orders ?? [], [q.data]);
  const allRef = useRef(all);
  allRef.current = all;

  useEffect(() => {
    const id = "pk-fonts";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Barlow:wght@500;600&family=Barlow+Condensed:wght@600;800&display=swap";
    document.head.appendChild(l);
    window.speechSynthesis?.getVoices();
  }, []);

  const show = useCallback((o: Order) => {
    setOrder(o);
    setMiss("");
    speak(orderPhrase(o));
    setRecent((r) => [o, ...r.filter((x) => keyOf(x) !== keyOf(o))].slice(0, 6));
  }, []);

  const lastShown = useRef({ key: "", at: 0 });
  const lastRefetch = useRef(0);
  const lookup = useCallback(async (input: string | string[]) => {
    const texts = Array.isArray(input) ? input : [input];
    const find = (list: Order[]) => {
      for (const t of texts) {
        const o = findOrder(list, t) ?? list.find((x) => norm(x.number) === norm(t));
        if (o) return o;
      }
    };
    let o = find(allRef.current);
    if (!o && Date.now() - lastRefetch.current > 15000) {
      // Venda que entrou depois da última busca: atualiza a lista e tenta de novo
      lastRefetch.current = Date.now();
      const fresh = await q.refetch();
      o = find(fresh.data?.orders ?? []);
    }
    if (o) {
      // O código de barras e o QR da mesma etiqueta não repetem a fala
      if (lastShown.current.key === keyOf(o) && Date.now() - lastShown.current.at < 6000) return;
      lastShown.current = { key: keyOf(o), at: Date.now() };
      return show(o);
    }
    setOrder(null);
    setMiss(texts[0]);
    speak("Não achei esse pedido na lista de pacotes a enviar.");
  }, [q, show]);

  const goTyped = (e: FormEvent) => {
    e.preventDefault();
    const t = typed.trim();
    setTyped("");
    if (t) lookup(t);
  };

  const counts = q.data?.channels ?? [];

  if (!started) {
    return (
      <div className="pk">
        <style>{CSS}</style>
        <div className="start">
          <h2>Separação de pedidos</h2>
          <p>Mostre a etiqueta para a câmera e a página fala o que vai no pacote. Deixe esta página aberta e o som do celular ligado.</p>
          <button type="button" onClick={() => { speak("Pronto. Pode mostrar a etiqueta."); setStarted(true); }}>Começar</button>
          <Link to="/studio" className="back">Voltar ao Studio</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pk">
      <style>{CSS}</style>
      <header>
        <div className="top">
          <Link to="/studio" className="back" aria-label="Voltar ao Studio">←</Link>
          <h1>Separação</h1>
          <form className="go" onSubmit={goTyped}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Nº ou etiqueta" aria-label="Número do pedido ou código da etiqueta" enterKeyHint="go" />
          </form>
          <button type="button" className="vbtn" aria-pressed={camera} onClick={() => setCamera(!camera)}>{camera ? "Câmera ligada" : "Câmera desligada"}</button>
        </div>
        <p className="counts">
          {q.isLoading ? "Buscando os pedidos…" : q.isError ? "Não consegui buscar os pedidos agora." : (
            <>{all.length} pacotes a enviar: {counts.map((c) => `${CH[c.channel].label} ${c.error ? "com erro" : c.connected ? c.count : "não conectado"}`).join(" · ")}</>
          )}
        </p>
        {counts.filter((c) => c.error).map((c) => (
          <p key={c.channel} className="warnline">{CH[c.channel].label}: não consegui ler os pedidos ({c.error}).</p>
        ))}
      </header>

      <main>
        {camera && <LiveCamera key={camTry} onRead={lookup} onRetry={() => setCamTry((n) => n + 1)} />}
        {miss && <p className="alert" role="alert">Não achei o pedido dessa etiqueta ({miss.slice(0, 40)}). Tente o outro código da etiqueta ou digite o número do pedido.</p>}
        {order && (
          <section aria-live="polite">
            <div className="label">
              <div>
                <div className="num">{order.name || shortNumber(order)}</div>
                <div className="who">Pedido {shortNumber(order)}</div>
                <span className={`src ${CH[order.channel].cls}`}>{CH[order.channel].label}</span>
              </div>
              <div className="tot"><b>{pieces(order)}</b><span>{pieces(order) === 1 ? "peça" : "peças"}</span></div>
            </div>
            <ol>
              {order.items.map((it, i) => (
                <li key={i} className="it">
                  {it.image ? <img src={it.image} alt={it.short} /> : <div className="noimg">sem foto</div>}
                  <div className="tx">
                    <div className={`qn ${it.qty > 1 ? "many" : ""}`}>{it.qty}<small> un.</small></div>
                    <div className="nm">{it.short}</div>
                    {it.variation && <div className="hn">{it.variation}</div>}
                    <div className="full">{it.title}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
        {recent.length > 1 && (
          <nav className="recent" aria-label="Últimos lidos">
            <span>Últimos lidos:</span>
            {recent.slice(1).map((o) => (
              <button key={keyOf(o)} type="button" onClick={() => show(o)}>{o.name || shortNumber(o)}</button>
            ))}
          </nav>
        )}
      </main>

      {order && (
        <div className="bar">
          <button type="button" className="rep" onClick={() => speak(orderPhrase(order))}>Repetir</button>
        </div>
      )}
    </div>
  );
}

const CSS = `
.pk{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;--bg:#d9bf94;--card:#fbf8f1;--ink:#151310;--muted:#5c5143;--ok:#1f7a3a;--warn:#b3261e;--chip:#efe3cb;
  color-scheme:light;min-height:100dvh;background:var(--bg);color:var(--ink);font:17px/1.4 Barlow,system-ui,sans-serif;padding-bottom:130px}
.pk *{box-sizing:border-box;min-width:0}
.pk button{font:inherit;color:inherit;cursor:pointer}
.pk button:focus-visible,.pk input:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.pk header{padding:12px max(4vw,12px) 0;max-width:900px;margin:0 auto}
.pk .top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pk .back{font:800 26px/1 "Barlow Condensed",sans-serif;text-decoration:none;color:var(--ink);padding:4px 6px}
.pk h1{font:800 26px/1 "Barlow Condensed",sans-serif;margin:0;flex:1}
.pk .go input{width:150px;height:44px;border:2px solid var(--ink);background:var(--card);color:var(--ink);font:600 17px Barlow,sans-serif;padding:0 10px;border-radius:6px}
.pk .vbtn{height:44px;padding:0 14px;border:2px solid var(--ink);background:var(--card);border-radius:6px;font-weight:600}
.pk .vbtn[aria-pressed=false]{opacity:.55}
.pk .warnline{margin:8px 0 0;font-size:14px;color:var(--warn);font-weight:600}
.pk main{max-width:900px;margin:0 auto;padding:8px max(4vw,12px)}
.pk .label{background:var(--card);border:3px solid var(--ink);border-radius:4px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;padding:14px 16px;margin:10px 0 16px}
.pk .label .num{font:800 clamp(44px,12vw,72px)/.95 "Barlow Condensed",sans-serif;overflow-wrap:anywhere}
.pk .label .who{font:600 18px/1.2 Barlow,sans-serif;color:var(--muted)}
.pk .label .tot{text-align:right;align-self:center}
.pk .label .tot b{display:block;font:800 clamp(40px,10vw,60px)/.9 "Barlow Condensed",sans-serif}
.pk .label .tot span{font-size:14px;color:var(--muted)}
.pk .src{display:inline-block;font:600 14px Barlow,sans-serif;padding:2px 8px;border-radius:3px;margin-top:6px;border:2px solid currentColor}
.pk .ml{color:#6b5600}.pk .sp{color:#c2401f}.pk .ns{color:#1d3fa8}
.pk ol{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.pk .it{display:grid;grid-template-columns:clamp(130px,38vw,240px) minmax(0,1fr);background:var(--card);border:2px solid var(--ink);border-radius:4px;overflow:hidden;position:relative}
.pk .it img,.pk .noimg{width:100%;aspect-ratio:1;object-fit:cover;display:block;border-right:2px solid var(--ink);background:#fff}
.pk .noimg{display:grid;place-items:center;color:var(--muted)}
.pk .tx{padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.pk .qn{font:800 clamp(48px,13vw,80px)/.85 "Barlow Condensed",sans-serif}
.pk .qn small{font-size:.38em;font-weight:600}
.pk .qn.many{color:var(--warn)}
.pk .nm{font:800 clamp(24px,6.4vw,34px)/1.05 "Barlow Condensed",sans-serif}
.pk .hn{font:600 18px Barlow,sans-serif}
.pk .full{font-size:13px;color:var(--muted)}
.pk .alert{background:var(--warn);color:#fff;font-weight:600;padding:12px 14px;border-radius:4px;margin:0 0 12px}
.pk .bar{position:fixed;inset:auto 0 0 0;background:var(--ink);color:var(--card);padding:10px max(4vw,12px) calc(10px + env(safe-area-inset-bottom));display:flex;gap:10px;z-index:30}
.pk .bar button{min-height:60px;border:0;border-radius:6px;padding:0 16px;font:800 21px "Barlow Condensed",sans-serif}
.pk .counts{margin:8px 0 0;font-size:15px;color:var(--muted);font-weight:600}
.pk .cam{position:relative;height:clamp(170px,32vh,300px);border:3px solid var(--ink);border-radius:6px;overflow:hidden;background:#000;margin:6px 0 14px}
.pk .cam video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pk .cam .aim{position:absolute;left:10%;right:10%;top:28%;bottom:28%;border:3px solid #fff;border-radius:8px;box-shadow:0 0 0 100vmax rgba(0,0,0,.3)}
.pk .cam p{position:absolute;left:8px;right:8px;bottom:8px;margin:0;color:#fff;font:600 16px/1.3 Barlow,sans-serif;text-align:center}
.pk .go input{-webkit-user-select:text;user-select:text}
.pk .cam .torch{position:absolute;right:8px;top:8px;min-height:40px;padding:0 14px;border:0;border-radius:6px;background:rgba(255,255,255,.9);color:#000;font:700 16px Barlow,sans-serif}
.pk .cam .torch[aria-pressed=true]{background:#ffd84d}
.pk .cam .retry{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-height:52px;padding:0 20px;border:0;border-radius:8px;background:#fff;color:#000;font:800 22px "Barlow Condensed",sans-serif}
.pk .recent{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:18px;font-size:15px;color:var(--muted)}
.pk .recent button{height:40px;padding:0 12px;border:2px solid var(--ink);background:var(--chip);border-radius:6px;font-weight:600;color:var(--ink)}
.pk .start{min-height:100dvh;display:grid;place-content:center;gap:16px;padding:24px;max-width:460px;margin:0 auto;text-align:center}
.pk .start h2{font:800 42px/1.05 "Barlow Condensed",sans-serif;margin:0}
.pk .start p{margin:0;font-size:18px}
.pk .start button{min-height:68px;border:3px solid var(--ink);background:var(--ink);color:var(--card);border-radius:8px;font:800 28px "Barlow Condensed",sans-serif}
.pk .bar .rep{flex:1;background:var(--card);color:var(--ink);border:0}
`;
