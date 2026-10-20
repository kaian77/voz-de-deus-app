// Trilha do Reel da PáginasPro, sintetizada no navegador (Web Audio, sem arquivo nem licença): batida leve a
// 112 BPM com baixo e acordes, mais efeitos nos momentos da animação (whoosh nas trocas de cena, pop nas palavras
// e cartões, "ding" quando dá certo, tique nos contadores). Funciona igual num AudioContext (gravação) e num
// OfflineAudioContext (prévia).

export type Cue = { t: number; kind: "whoosh" | "pop" | "ding" | "tick" | "sad" };

const BPM = 112;
const BEAT = 60 / BPM;
// Dó maior / Lá menor / Fá / Sol: alegre e neutro
const CHORDS = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
const BASS = [65.4, 55.0, 43.7, 49.0];

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function env(ctx: BaseAudioContext, out: AudioNode, at: number, attack: number, hold: number, release: number, peak: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  g.connect(out);
  return g;
}

function tone(ctx: BaseAudioContext, out: AudioNode, at: number, freq: number, type: OscillatorType, len: number, peak: number, slideTo?: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + len);
  o.connect(env(ctx, out, at, 0.005, len * 0.3, len * 0.7, peak));
  o.start(at);
  o.stop(at + len + 0.05);
}

/** Agenda a trilha e os efeitos em `out`, começando em `start` (segundos do relógio do contexto). */
export function scheduleReelAudio(ctx: BaseAudioContext, out: AudioNode, total: number, cues: Cue[], start = ctx.currentTime) {
  const master = ctx.createGain();
  master.gain.value = 0.9;
  // Compressor suave: nada estoura quando os efeitos somam com a batida
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(out);
  const noise = noiseBuffer(ctx, 1);
  const music = ctx.createGain();
  music.connect(master);
  // Música baixa no começo e no fim (fade)
  music.gain.setValueAtTime(0.0001, start);
  music.gain.exponentialRampToValueAtTime(0.55, start + 0.6);
  music.gain.setValueAtTime(0.55, start + total - 1.2);
  music.gain.exponentialRampToValueAtTime(0.0001, start + total);

  const beats = Math.floor(total / BEAT);
  for (let b = 0; b < beats; b++) {
    const at = start + b * BEAT;
    const bar = Math.floor(b / 4) % 4;
    // Bumbo nos tempos 1 e 3, palma no 2 e 4
    if (b % 2 === 0) tone(ctx, music, at, 150, "sine", 0.22, 0.9, 45);
    else {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      src.connect(bp).connect(env(ctx, music, at, 0.002, 0.02, 0.12, 0.35));
      src.start(at);
      src.stop(at + 0.2);
    }
    // Chimbal no contratempo
    const hat = ctx.createBufferSource();
    hat.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    hat.connect(hp).connect(env(ctx, music, at + BEAT / 2, 0.001, 0.01, 0.05, 0.18));
    hat.start(at + BEAT / 2);
    hat.stop(at + BEAT / 2 + 0.1);
    // Baixo em colcheias e acorde no começo de cada compasso
    tone(ctx, music, at, BASS[bar], "triangle", BEAT * 0.45, 0.45);
    if (b % 4 === 0) for (const f of CHORDS[bar]) tone(ctx, music, at, f, "sawtooth", BEAT * 3.6, 0.035);
    // Sininho da melodia
    if (b % 2 === 1) tone(ctx, music, at, CHORDS[bar][(b >> 1) % 3] * 2, "sine", BEAT * 0.5, 0.08);
  }

  const sfx = ctx.createGain();
  sfx.gain.value = 0.8;
  sfx.connect(master);
  for (const c of cues) {
    const at = start + Math.max(0, c.t);
    if (at > start + total) continue;
    if (c.kind === "whoosh") {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, at);
      bp.frequency.exponentialRampToValueAtTime(5000, at + 0.35);
      src.connect(bp).connect(env(ctx, sfx, at, 0.12, 0.05, 0.25, 0.7));
      src.start(at);
      src.stop(at + 0.5);
    } else if (c.kind === "pop") {
      tone(ctx, sfx, at, 520, "sine", 0.09, 0.5, 980);
    } else if (c.kind === "tick") {
      tone(ctx, sfx, at, 1800, "square", 0.02, 0.08);
    } else if (c.kind === "ding") {
      tone(ctx, sfx, at, 1046.5, "sine", 0.6, 0.35);
      tone(ctx, sfx, at + 0.08, 1568, "sine", 0.6, 0.25);
    } else if (c.kind === "sad") {
      tone(ctx, sfx, at, 392, "triangle", 0.35, 0.3, 300);
    }
  }
}
