import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTable } from "../lib/hooks";
import { api, isDemo } from "../lib/api";
import type { SalesSummary } from "../lib/types";
import { PageHeader } from "../components/bits";

/**
 * Escritório: cada setor do Studio é um bonequinho numa mesa (pixel art desenhada por código, sem imagens).
 * Trabalhando = digita e o monitor pisca; pronto = acordado esperando; dormindo = nada na fila; alerta = precisa de você.
 */

type State = "work" | "ready" | "sleep" | "alert";
type Desk = { key: string; label: string; to: string; shirt: string; hair: string; screen: string; state: State; text: string };

const W = 192;
const H = 336;
const TOP = 52;
const ROW = 70;
const REFRESH = { refetchInterval: 30_000 };
const HOUR = 3600_000;
const recent = (iso: string | null | undefined, ms: number) => !!iso && Date.now() - new Date(iso).getTime() < ms;
const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;

function useDesks(): Desk[] {
  const { data: posts } = useTable("posts", undefined, REFRESH);
  const { data: convs } = useTable("conversations", { order: "last_message_at" }, REFRESH);
  const { data: accounts } = useTable("social_accounts", undefined, REFRESH);
  const { data: storePhotos } = useTable("store_photo_jobs", undefined, REFRESH);
  const { data: photoJobs } = useTable("photo_jobs", undefined, REFRESH);
  const { data: yt } = useTable("yt_videos", undefined, REFRESH);
  const { data: landings } = useTable("landing_pages", undefined, REFRESH);

  return useMemo(() => {
    const desks: Desk[] = [];

    // Instagram e TikTok: posts
    const ps = posts ?? [];
    const publishing = ps.filter((p) => p.status === "publishing").length;
    const failed = ps.filter((p) => p.status === "failed" && recent(p.updated_at, 24 * HOUR)).length;
    const scheduled = ps.filter((p) => p.status === "scheduled").length;
    const approvals = ps.filter((p) => p.status === "pending_approval").length;
    desks.push({
      key: "posts", label: "Posts", to: failed ? "/studio/calendario" : approvals ? "/studio/aprovacoes" : "/studio/calendario",
      shirt: "#E3262E", hair: "#3b2416", screen: "#ff7ab0",
      ...(publishing ? { state: "work" as State, text: "Publicando agora" }
        : failed ? { state: "alert" as State, text: n(failed, "post falhou", "posts falharam") }
        : approvals ? { state: "alert" as State, text: n(approvals, "post para aprovar", "posts para aprovar") }
        : scheduled ? { state: "ready" as State, text: n(scheduled, "agendado", "agendados") }
        : { state: "sleep" as State, text: "Nada agendado" }),
    });

    // Atendente das DMs
    const cs = convs ?? [];
    const waiting = cs.filter((c) => c.status === "needs_human").length;
    const busy = cs.some((c) => recent(c.last_message_at, 10 * 60_000));
    desks.push({
      key: "dm", label: "Atendente", to: "/studio/mensagens", shirt: "#2f7de1", hair: "#111", screen: "#7fd3ff",
      ...(waiting ? { state: "alert" as State, text: n(waiting, "esperando você", "esperando você") }
        : busy ? { state: "work" as State, text: "Respondendo DMs" }
        : { state: "sleep" as State, text: "Sem mensagens novas" }),
    });

    // Mercado Livre e Shopee: filas da sincronização
    const acc = (p: string) => accounts?.find((a) => a.platform === p);
    const market = (key: string, label: string, sync: { queue: number[]; errors: { id: number }[] } | undefined, connected: boolean, shirt: string, screen: string) => {
      const queue = sync?.queue.length ?? 0;
      const errors = sync?.errors.filter((e) => e.id > 0).length ?? 0;
      desks.push({
        key, label, to: "/studio/contas", shirt, hair: key === "ml" ? "#c8962c" : "#5a2d0c", screen,
        ...(!connected ? { state: "sleep" as State, text: "Não conectado" }
          : queue ? { state: "work" as State, text: `Fila: ${n(queue, "produto", "produtos")}` }
          : errors ? { state: "alert" as State, text: n(errors, "com erro", "com erro") }
          : { state: "ready" as State, text: "Tudo em dia" }),
      });
    };
    const ml = acc("mercadolivre");
    const sp = acc("shopee");
    market("ml", "Mercado Livre", ml?.meta?.ml_sync, !!ml, "#FFC72C", "#fff38a");
    market("shopee", "Shopee", sp?.meta?.shopee_sync, !!sp, "#ee4d2d", "#ffb199");

    // Fotos
    const sj = storePhotos ?? [];
    const pj = photoJobs ?? [];
    const making = sj.filter((j) => j.status === "queued" || j.status === "processing" || j.status === "applying").length
      + pj.filter((j) => j.status === "queued" || j.status === "processing").length;
    const toReview = sj.filter((j) => j.status === "ready").length;
    const photoFail = sj.filter((j) => j.status === "failed" && recent(j.updated_at, 24 * HOUR)).length;
    desks.push({
      key: "fotos", label: "Fotos", to: toReview || making ? "/studio/produtos" : "/studio/fotos", shirt: "#8e5bd8", hair: "#e8c07a", screen: "#d6b8ff",
      ...(making ? { state: "work" as State, text: `Fazendo ${n(making, "foto", "fotos")}` }
        : toReview ? { state: "alert" as State, text: n(toReview, "para aprovar", "para aprovar") }
        : photoFail ? { state: "alert" as State, text: n(photoFail, "falhou", "falharam") }
        : { state: "sleep" as State, text: "Sem fotos na fila" }),
    });

    // YouTube
    const vs = (yt ?? []).filter((v) => v.status !== "deleted");
    const rendering = vs.filter((v) => v.status === "scripting" || v.status === "queued" || v.status === "rendering").length;
    const ytFail = vs.filter((v) => v.status === "failed" && recent(v.updated_at, 24 * HOUR)).length;
    const sent = vs.filter((v) => v.status === "uploaded" && recent(v.updated_at, 24 * HOUR)).length;
    desks.push({
      key: "yt", label: "YouTube", to: "/studio/youtube", shirt: "#d62020", hair: "#2a1a0e", screen: "#ff9a9a",
      ...(rendering ? { state: "work" as State, text: `Fazendo ${n(rendering, "vídeo", "vídeos")}` }
        : ytFail ? { state: "alert" as State, text: n(ytFail, "vídeo falhou", "vídeos falharam") }
        : sent ? { state: "ready" as State, text: `${n(sent, "enviado", "enviados")} hoje` }
        : { state: "sleep" as State, text: "Esperando o próximo" }),
    });

    // PáginasPro
    const ls = landings ?? [];
    const building = ls.filter((l) => l.auto_status === "queued" || l.auto_status === "working").length;
    const lpFail = ls.filter((l) => l.auto_status === "failed" && recent(l.updated_at, 24 * HOUR)).length;
    const previews = ls.filter((l) => l.status === "preview").length;
    desks.push({
      key: "pp", label: "PáginasPro", to: "/studio/landing", shirt: "#173B2C", hair: "#111", screen: "#D4FF3F",
      ...(building ? { state: "work" as State, text: `Montando ${n(building, "site", "sites")}` }
        : lpFail ? { state: "alert" as State, text: n(lpFail, "site falhou", "sites falharam") }
        : previews ? { state: "ready" as State, text: `${n(previews, "prévia", "prévias")} no ar` }
        : { state: "sleep" as State, text: "Sem sites na fila" }),
    });

    return desks;
  }, [posts, convs, accounts, storePhotos, photoJobs, yt, landings]);
}

/** Posição da mesa i (2 colunas; a 7ª fica no meio da última fileira). */
function deskPos(i: number, total: number) {
  const row = Math.floor(i / 2);
  const alone = i === total - 1 && total % 2 === 1;
  const x = alone ? W / 2 : i % 2 === 0 ? W * 0.27 : W * 0.73;
  return { x, y: TOP + row * ROW + 14 };
}

function draw(ctx: CanvasRenderingContext2D, desks: Desk[], t: number) {
  const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

  // chão
  for (let y = TOP - 4; y < H; y += 12) for (let x = 0; x < W; x += 12) px(x, y, 12, 12, ((x + y) / 12) % 2 ? "#a9b1bd" : "#b3bbc6");
  for (let y = TOP - 4; y < H; y += 12) px(0, y, W, 1, "#9aa2ae");

  // parede de madeira, janela, quadro e relógio
  px(0, 0, W, TOP - 4, "#d9b77e");
  for (let y = 0; y < TOP - 4; y += 6) { px(0, y, W, 1, "#c9a56b"); for (let x = (y / 6) % 2 ? 0 : 10; x < W; x += 20) px(x, y, 1, 6, "#c9a56b"); }
  px(0, TOP - 6, W, 2, "#8a6a3a");
  px(14, 8, 48, 28, "#5b5f66"); px(16, 10, 44, 24, "#9fd6ff"); px(16, 10, 44, 10, "#bfe6ff"); px(37, 10, 2, 24, "#5b5f66");
  const cloud = (t / 400) % 60;
  px(16 + cloud % 40, 14, 10, 3, "#fff"); px(18 + cloud % 40, 12, 6, 2, "#fff");
  px(86, 10, 34, 22, "#3a2a1a"); px(88, 12, 30, 18, "#f4f1ea");
  [[90, 14, "#E3262E"], [97, 18, "#FFC72C"], [104, 15, "#2f7de1"], [110, 20, "#22a35a"]].forEach(([x, y, c]) => px(x as number, y as number, 5, 30 - (y as number), c as string));
  px(140, 10, 16, 16, "#333"); px(142, 12, 12, 12, "#fff");
  const ang = (t / 1000) * (Math.PI / 30);
  px(148 + Math.round(Math.sin(ang) * 4), 18 - Math.round(Math.cos(ang) * 4), 1, 1, "#E3262E");
  px(148, 18, 1, 1, "#111");

  // plantas nos cantos
  const plant = (x: number, y: number) => {
    px(x + 2, y + 10, 10, 8, "#7a4b2a"); px(x + 2, y + 10, 10, 2, "#5e3820");
    [[0, 4], [4, 0], [8, 3], [2, 7], [9, 7], [5, 5]].forEach(([dx, dy]) => px(x + dx, y + dy, 5, 5, "#2f8f46"));
    px(x + 5, y + 2, 3, 3, "#4cb865");
  };
  plant(168, 30); plant(4, H - 22);

  desks.forEach((d, i) => {
    const { x, y } = deskPos(i, desks.length);
    const work = d.state === "work";
    const blink = Math.floor(t / 300) % 2 === 0;

    // mesa e monitor
    px(x - 28, y + 2, 56, 14, "#ececec"); px(x - 28, y + 14, 56, 3, "#c8c8c8");
    px(x - 26, y + 17, 2, 6, "#6b6b6b"); px(x + 24, y + 17, 2, 6, "#6b6b6b");
    px(x - 11, y - 10, 22, 14, "#2b2b2b");
    const screenColor = d.state === "sleep" ? "#1a1d22" : d.state === "alert" ? (blink ? "#ff3b3b" : "#7a1010") : d.screen;
    px(x - 9, y - 8, 18, 10, screenColor);
    if (work) for (let l = 0; l < 3; l++) px(x - 7, y - 6 + l * 3, 4 + ((Math.floor(t / 120) + l * 5 + i) % 10), 1, "#ffffff");
    px(x - 2, y + 4, 4, 2, "#2b2b2b");
    // teclado e caneca
    px(x - 8, y + 7, 16, 4, "#3d3d3d"); if (work && Math.floor(t / 90) % 2) px(x - 6 + ((Math.floor(t / 90) * 3) % 12), y + 8, 2, 2, "#9a9a9a");
    px(x + 17, y + 5, 5, 6, "#fff"); px(x + 22, y + 7, 2, 3, "#fff"); px(x + 18, y + 6, 3, 1, "#6b3e1f");

    // cadeira
    px(x - 9, y + 30, 18, 12, "#2f3540"); px(x - 7, y + 42, 14, 3, "#1f242c"); px(x - 1, y + 45, 2, 3, "#1f242c");

    // bonequinho de costas
    const bob = work ? Math.floor(t / 180) % 2 : d.state === "sleep" ? 2 : 0;
    const by = y + 20 + bob;
    px(x - 9, by + 6, 18, 10, d.shirt); px(x - 9, by + 6, 18, 2, "rgba(255,255,255,.25)");
    if (work) {
      const a = Math.floor(t / 120) % 2;
      px(x - 11, by + 4 - a * 2, 4, 6, d.shirt); px(x + 7, by + 2 + a * 2, 4, 6, d.shirt);
      px(x - 11, by + 2 - a * 2, 4, 2, "#f1c27d"); px(x + 7, by + a * 2, 4, 2, "#f1c27d");
    } else {
      px(x - 11, by + 8, 3, 7, d.shirt); px(x + 8, by + 8, 3, 7, d.shirt);
    }
    px(x - 6, by - 4, 12, 11, "#f1c27d");
    px(x - 6, by - 5, 12, 8, d.hair); px(x - 7, by - 3, 1, 5, d.hair); px(x + 6, by - 3, 1, 5, d.hair);

    // Zzz / alerta
    if (d.state === "sleep") {
      const k = Math.floor(t / 500) % 3;
      for (let z = 0; z <= k; z++) { const zx = x + 8 + z * 4, zy = by - 8 - z * 5; px(zx, zy, 3, 1, "#eef2ff"); px(zx + 1, zy + 1, 1, 1, "#eef2ff"); px(zx, zy + 2, 3, 1, "#eef2ff"); }
    }
    if (d.state === "alert" && blink) { px(x + 10, by - 14, 7, 9, "#E3262E"); px(x + 13, by - 12, 1, 4, "#fff"); px(x + 13, by - 7, 1, 1, "#fff"); }
  });
}

function Scene({ desks }: { desks: Desk[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const desksRef = useRef(desks);
  desksRef.current = desks;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const loop = (t: number) => { draw(ctx, desksRef.current, t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={W} height={H} className="block h-auto w-full" style={{ imageRendering: "pixelated" }} />;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const DOT: Record<State, string> = { work: "bg-emerald-400", ready: "bg-sky-300", sleep: "bg-slate-400", alert: "bg-red-500 animate-pulse" };

export default function Office() {
  const navigate = useNavigate();
  const desks = useDesks();
  const { data: sales } = useQuery({
    queryKey: ["sales-summary"],
    queryFn: () => api.invoke<SalesSummary>("ai", { action: "sales_summary" }),
    enabled: !isDemo,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const working = desks.filter((d) => d.state === "work").length;
  const alerts = desks.filter((d) => d.state === "alert").length;

  return (
    <div className="mx-auto max-w-[560px] pb-24 lg:pb-0">
      <PageHeader title="Escritório" description="Cada bonequinho é um setor do Studio. Toque numa mesa para abrir." />
      <div className="relative overflow-hidden rounded-xl border-4 border-[#3a2a1a] bg-[#a9b1bd] font-mono shadow-lg">
        <Scene desks={desks} />

        {/* placar */}
        <div className="absolute inset-x-2 top-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          <span className="rounded-full bg-black/75 px-2 py-0.5 text-[#FFC72C]">🪙 {sales ? brl(sales.total.today.revenue) : "…"} hoje</span>
          <span className="rounded-full bg-black/75 px-2 py-0.5 text-white">{sales ? n(sales.total.today.orders, "pedido", "pedidos") : "…"}</span>
          <span className="rounded-full bg-black/75 px-2 py-0.5 text-emerald-300">{n(working, "trabalhando", "trabalhando")}</span>
          {alerts > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-white">{n(alerts, "precisa de você", "precisam de você")}</span>}
        </div>

        {/* mesas: plaquinha + balão, por cima do desenho */}
        {desks.map((d, i) => {
          const { x, y } = deskPos(i, desks.length);
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => navigate(d.to)}
              aria-label={`${d.label}: ${d.text}`}
              className="absolute flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-md p-1 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              style={{ left: `${(x / W) * 100}%`, top: `${((y - 22) / H) * 100}%`, width: `${(88 / W) * 100}%`, height: `${(ROW / H) * 100}%` }}
            >
              <span className={`max-w-full truncate rounded px-1.5 py-px text-[10px] font-bold leading-tight shadow sm:text-[11px] ${d.state === "alert" ? "bg-red-600 text-white" : "bg-white text-black"}`}>{d.text}</span>
              <span className="mt-auto flex max-w-full items-center gap-1 truncate rounded-full bg-black/80 px-1.5 py-px text-[10px] font-semibold text-white">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[d.state]}`} />
                {d.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Digitando = trabalhando · acordado = pronto · Zzz = nada na fila · ❗ = precisa de você. Atualiza a cada 30 s.
      </p>
    </div>
  );
}
