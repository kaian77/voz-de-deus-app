import { useState } from "react";
import { Loader2 } from "lucide-react";
import { functionsBaseUrl } from "../lib/api";

// Página pública "Avalie e ganhe 10%" (link no site da loja e no e-mail). Quem tem pedido com o mesmo e-mail
// avalia e recebe o cupom na hora e por e-mail. A função `reviews` confere o pedido na Nuvemshop.

const STORE_ID = "7107588"; // Brax Pins Mania na Nuvemshop
const SITE = "https://braxpinsmania.com.br";
const RED = "#E3262E";
const BLACK = "#111111";
const GOLD = "#FFC72C";

type Done = { coupon: string; emailed: boolean; already?: boolean };

export default function Review() {
  const [rating, setRating] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", order: "", comment: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!rating) return setError("Escolha de 1 a 5 estrelas.");
    setBusy(true);
    try {
      const res = await fetch(`${functionsBaseUrl}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store: STORE_ID, rating, ...form }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Não deu certo. Tente de novo em instantes.");
      setDone(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!done) return;
    await navigator.clipboard?.writeText(done.coupon).catch(() => {});
    setCopied(true);
  };

  const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-[15px] text-neutral-900 outline-none focus:border-[#111111] focus:ring-2 focus:ring-[#FFC72C]";

  return (
    <div className="min-h-screen" style={{ background: "#f6f6f6", color: BLACK }}>
      <header style={{ background: BLACK, borderBottom: `4px solid ${RED}` }}>
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
          <a href={SITE} className="text-xl uppercase tracking-wide text-white" style={{ fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif" }}>
            Brax <span style={{ color: RED }}>Pins</span> Mania
          </a>
          <a href={SITE} className="text-xs text-white/70 hover:text-white">Voltar à loja</a>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8">
        {done ? (
          <div className="rounded-lg bg-white p-6 text-center" style={{ borderTop: `4px solid ${RED}` }}>
            <p className="text-sm font-bold uppercase tracking-widest" style={{ color: RED }}>{done.already ? "Esse pedido já foi avaliado" : "Obrigado pela avaliação!"}</p>
            <h1 className="mt-2 text-3xl uppercase" style={{ fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif" }}>
              Seus <span style={{ color: RED }}>10% de desconto</span>
            </h1>
            <button type="button" onClick={copy} className="mx-auto mt-5 block rounded-lg px-8 py-4" style={{ background: BLACK, border: `2px dashed ${GOLD}` }}>
              <span className="block text-[11px] uppercase tracking-[0.2em]" style={{ color: GOLD }}>{copied ? "Copiado!" : "Toque para copiar"}</span>
              <span className="block text-3xl tracking-widest text-white" style={{ fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif" }}>{done.coupon}</span>
            </button>
            <p className="mt-4 text-sm text-neutral-600">
              Use no carrinho, no campo "Cupom de desconto".{done.emailed ? " Também mandamos o cupom para o seu e-mail." : ""}
            </p>
            <a href={`${SITE}/lancamentos/`} className="mt-6 inline-block rounded-md px-6 py-3 font-bold text-white" style={{ background: RED }}>
              Usar meu cupom agora
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-lg bg-white p-6" style={{ borderTop: `4px solid ${RED}` }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: RED }}>Avalie e ganhe</p>
            <h1 className="mt-1 text-3xl uppercase leading-tight" style={{ fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif" }}>
              Conte como foi e ganhe <span style={{ color: RED }}>10% off</span>
            </h1>
            <p className="mt-2 text-sm text-neutral-600">Avalie sua compra na Brax Pins Mania e receba um cupom de 10% para o próximo pedido.</p>

            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-bold">Sua nota</legend>
              <div className="flex gap-1" role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
                    onClick={() => setRating(n)}
                    className="text-4xl leading-none transition-transform hover:scale-110"
                    style={{ color: n <= rating ? GOLD : "#d4d4d4" }}
                  >
                    ★
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="mt-5 block text-sm font-bold">
              O que achou dos pins?
              <textarea value={form.comment} onChange={set("comment")} rows={4} maxLength={1500} placeholder="Qualidade, acabamento, entrega…" className={`${input} mt-1.5 font-normal`} />
            </label>
            <label className="mt-4 block text-sm font-bold">
              Seu nome
              <input value={form.name} onChange={set("name")} required maxLength={80} autoComplete="name" className={`${input} mt-1.5 font-normal`} />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold">
                E-mail da compra
                <input type="email" value={form.email} onChange={set("email")} required autoComplete="email" className={`${input} mt-1.5 font-normal`} />
              </label>
              <label className="block text-sm font-bold">
                Número do pedido
                <input value={form.order} onChange={set("order")} required inputMode="numeric" placeholder="ex.: 1234" className={`${input} mt-1.5 font-normal`} />
              </label>
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">O número está no e-mail de confirmação do pedido. Usamos só para confirmar a compra.</p>

            {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm" style={{ color: RED }}>{error}</p>}

            <button type="submit" disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-md py-3.5 text-base font-bold text-white disabled:opacity-60" style={{ background: RED }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Enviar e ganhar meu cupom
            </button>
            <p className="mt-3 text-center text-xs text-neutral-500">Um cupom por pedido. Sua avaliação pode aparecer no site com seu primeiro nome.</p>
          </form>
        )}
      </main>
    </div>
  );
}
