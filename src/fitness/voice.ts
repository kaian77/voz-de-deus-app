// Voz no fone (a voz do próprio celular, grátis) e bipes sintetizados.
// Os bipes também entram na gravação do treino (saída `recDest`).

let enabled = true;
let lastAt = 0;
const lastSaid = new Map<string, number>();
let ptVoice: SpeechSynthesisVoice | null = null;

function pickVoice() {
  const vs = speechSynthesis.getVoices();
  ptVoice = vs.find((v) => v.lang === "pt-BR" && /google|luciana|francisca|natural/i.test(v.name))
    ?? vs.find((v) => v.lang.startsWith("pt-BR")) ?? vs.find((v) => v.lang.startsWith("pt")) ?? null;
}
if (typeof speechSynthesis !== "undefined") {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function setVoice(on: boolean) { enabled = on; if (!on) try { speechSynthesis.cancel(); } catch { /* */ } }

/**
 * Fala uma frase. `now` corta o que estiver falando (contagem de repetição).
 * Correções iguais só repetem depois de `gap` ms, para não virar papagaio.
 */
export function say(text: string, opts: { now?: boolean; gap?: number } = {}) {
  if (!enabled || typeof speechSynthesis === "undefined") return;
  const t = Date.now();
  const gap = opts.gap ?? 4500;
  if (!opts.now) {
    if (t - (lastSaid.get(text) ?? 0) < gap) return;
    if (t - lastAt < 1400 || speechSynthesis.speaking) return;
  }
  lastSaid.set(text, t);
  lastAt = t;
  try {
    if (opts.now) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    if (ptVoice) u.voice = ptVoice;
    u.rate = 1.12;
    speechSynthesis.speak(u);
  } catch { /* sem voz no aparelho */ }
}

let ctx: AudioContext | null = null;
export let recDest: MediaStreamAudioDestinationNode | null = null;

export function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    recDest = ctx.createMediaStreamDestination();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function beep(kind: "rep" | "bad" | "go" | "done" | "tick" | "laugh") {
  const c = audio();
  if (kind === "laugh") return laugh(c);
  const notes: Record<typeof kind, [number, number, number][]> = {
    rep: [[880, 0, 0.09]],
    bad: [[220, 0, 0.18]],
    tick: [[660, 0, 0.06]],
    go: [[660, 0, 0.12], [990, 0.14, 0.25]],
    done: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.35]],
  };
  for (const [f, at, d] of notes[kind]) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = kind === "bad" ? "sawtooth" : "triangle";
    o.frequency.value = f;
    const t = c.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(c.destination);
    if (recDest) g.connect(recDest);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}

/** Risada sintetizada: "ha-ha-ha-ha" descendo (vogal com 2 formantes). */
function laugh(c: AudioContext) {
  for (let i = 0; i < 6; i++) {
    const t = c.currentTime + i * 0.17;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(260 - i * 14, t);
    o.frequency.linearRampToValueAtTime(200 - i * 14, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    for (const [f, q, v] of [[800, 6, 1], [1250, 8, 0.6]] as const) {
      const bp = c.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q;
      const gg = c.createGain(); gg.gain.value = v;
      o.connect(bp); bp.connect(gg); gg.connect(g);
    }
    g.connect(c.destination);
    if (recDest) g.connect(recDest);
    o.start(t); o.stop(t + 0.15);
  }
}

const NUM = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
export function numberWord(n: number) { return n <= 10 ? NUM[n] : String(n); }
