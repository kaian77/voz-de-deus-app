#!/usr/bin/env python3
"""audio.py — trilha e efeitos sonoros sintetizados (sem direitos autorais) + mixagem.

  python audio.py beat --bpm 120 --style pop --seconds 20 --out trilha.wav
  python audio.py sfx whoosh --out whoosh.wav      (whoosh, pop, impact, riser, ding, tick, click)

Usado por motion.py/ad.py: mix(...) junta música (arquivo ou "auto"), locução com
ducking automático, efeitos nos cortes e fade-out, e grava WAV 48 kHz estéreo.
"""
import argparse
import os
import subprocess
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ffmpeg_bin  # noqa: E402

SR = 48000
RNG = np.random.default_rng(7)


def _t(sec):
    return np.arange(int(sec * SR)) / SR


def _lp(x, k):
    """passa-baixa simples (média móvel de k amostras)."""
    k = max(1, int(k))
    return np.convolve(x, np.ones(k) / k, mode="same")


def _hp(x, k):
    return x - _lp(x, k)


def kick():
    t = _t(0.45)
    f = 45 + 115 * np.exp(-t * 30)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    s += RNG.standard_normal(len(t)) * np.exp(-t * 350) * 0.25
    return np.tanh(s * 1.6) * 0.9


def clap():
    t = _t(0.3)
    n = _hp(RNG.standard_normal(len(t)), 6)
    env = np.exp(-t * 22)
    for d in (0.008, 0.017):
        i = int(d * SR)
        env[:i] += np.exp(-t[:i] * 400) * 0.7
    return n * env * 0.5


def hat(open_=False):
    t = _t(0.25 if open_ else 0.06)
    n = _hp(_hp(RNG.standard_normal(len(t)), 3), 3)
    return n * np.exp(-t * (14 if open_ else 70)) * 0.32


def whoosh(d=0.55):
    t = _t(d)
    n = RNG.standard_normal(len(t))
    lo, hi = _lp(n, 60), _lp(n, 6)
    k = np.sin(np.pi * t / d)  # abre o filtro no meio
    s = (lo * (1 - k) + hi * k) * np.sin(np.pi * t / d) ** 2
    s /= np.abs(s).max() + 1e-9
    pan = t / d
    return np.stack([s * (1 - 0.6 * pan), s * (0.4 + 0.6 * pan)], 1) * 0.55


def pop():
    t = _t(0.12)
    f = 420 + 700 * (1 - np.exp(-t * 60))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 38)
    return s * 0.6


def tick():
    t = _t(0.03)
    return np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 200) * 0.35


def click():
    t = _t(0.02)
    return _hp(RNG.standard_normal(len(t)), 2) * np.exp(-t * 400) * 0.5


def impact():
    t = _t(1.4)
    f = 32 + 70 * np.exp(-t * 9)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6)
    s += _lp(RNG.standard_normal(len(t)), 25) * np.exp(-t * 9) * 1.2
    return np.tanh(s * 2.2) * 0.85


def riser(d=1.5):
    t = _t(d)
    f = 200 * (8 ** (t / d))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25 + _hp(RNG.standard_normal(len(t)), 4) * 0.35
    return s * (t / d) ** 2 * 0.7


def ding():
    t = _t(1.3)
    s = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * dcy)
            for f, a, dcy in ((1318.5, 0.5, 3), (1975.5, 0.3, 4.5), (2637, 0.18, 6), (3951, 0.08, 8)))
    s += np.sin(2 * np.pi * 1760 * t) * np.exp(-t * 30) * 0.2 * (t < 0.08)
    return s * 0.6


SFX = {"whoosh": whoosh, "pop": pop, "impact": impact, "riser": riser, "ding": ding, "tick": tick,
       "click": click, "kick": kick}


def _stereo(x):
    return x if x.ndim == 2 else np.stack([x, x], 1)


def _add(buf, x, pos, gain=1.0):
    x = _stereo(x) * gain
    i = int(pos * SR)
    if i >= len(buf) or i + len(x) <= 0:
        return
    if i < 0:
        x, i = x[-i:], 0
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


# --------------------------------------------------------- trilha sintetizada
PROG = {  # progressões (fundamental em Hz, tríade)
    "pop": [(110.0, (0, 3, 7)), (87.31, (0, 4, 7)), (130.81, (0, 4, 7)), (98.0, (0, 4, 7))],      # Am F C G
    "house": [(110.0, (0, 3, 7, 10)), (110.0, (0, 3, 7, 10)), (98.0, (0, 4, 7)), (87.31, (0, 4, 7, 11))],
    "trap": [(110.0, (0, 3, 7)), (110.0, (0, 3, 7)), (82.41, (0, 4, 7)), (87.31, (0, 4, 7))],
    "chill": [(130.81, (0, 4, 7, 11)), (110.0, (0, 3, 7, 10)), (87.31, (0, 4, 7, 11)), (98.0, (0, 4, 7, 10))],
    "corporate": [(130.81, (0, 4, 7)), (98.0, (0, 4, 7)), (110.0, (0, 3, 7)), (87.31, (0, 4, 7))],
}
PATTERNS = {  # posições em semicolcheias (16 por compasso)
    "pop": {"kick": [0, 4, 8, 12], "clap": [4, 12], "hat": [2, 6, 10, 14], "bass": [0, 3, 6, 8, 11, 14]},
    "house": {"kick": [0, 4, 8, 12], "clap": [4, 12], "ohat": [2, 6, 10, 14], "hat": [1, 3, 5, 7, 9, 11, 13, 15], "bass": [2, 6, 10, 14]},
    "trap": {"kick": [0, 7, 10], "clap": [8], "hat": list(range(0, 16, 2)) + [13, 15], "bass": [0, 7, 10]},
    "chill": {"kick": [0, 10], "clap": [8], "hat": [4, 12], "bass": [0, 10]},
    "corporate": {"kick": [0, 8], "clap": [4, 12], "hat": list(range(0, 16, 2)), "bass": [0, 4, 8, 12]},
}


def music_bed(seconds, bpm=120, style="pop", intro_beats=0):
    """Trilha original por síntese (livre de direitos)."""
    style = style if style in PATTERNS else "pop"
    n = int((seconds + 2) * SR)
    drums = np.zeros((n, 2))
    bass = np.zeros((n, 2))
    pad = np.zeros((n, 2))
    step = 60 / bpm / 4
    bar = step * 16
    k, c, h, oh = kick(), clap(), hat(), hat(True)
    pat = PATTERNS[style]
    prog = PROG[style]
    nbars = int(seconds / bar) + 2
    for b in range(nbars):
        t0 = b * bar
        root, tri = prog[b % len(prog)]
        drop = t0 < intro_beats * step * 4
        for s in pat.get("kick", []):
            if not drop:
                _add(drums, k, t0 + s * step, 0.9)
        for s in pat.get("clap", []):
            _add(drums, c, t0 + s * step, 0.6)
        for s in pat.get("hat", []):
            _add(drums, np.stack([h * 0.8, h], 1), t0 + s * step, 0.7)
        for s in pat.get("ohat", []):
            _add(drums, oh, t0 + s * step, 0.5)
        # baixo
        for s in pat.get("bass", []):
            d = step * 2.5
            tt = _t(d)
            f = root
            note = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt * 5)
            note *= np.minimum(1, tt / 0.005)
            _add(bass, np.tanh(note * 1.4) * 0.45, t0 + s * step)
        # pad (acorde suave, largo no estéreo)
        tt = _t(bar)
        env = np.minimum(1, tt / 0.25) * np.minimum(1, (bar - tt) / 0.3)
        L = sum(np.sin(2 * np.pi * root * 2 * 2 ** (iv / 12) * tt * 1.002) for iv in tri)
        R = sum(np.sin(2 * np.pi * root * 2 * 2 ** (iv / 12) * tt * 0.998) for iv in tri)
        _add(pad, np.stack([L, R], 1) * env[:, None] * (0.09 / len(tri) * 3), t0)
    # sidechain: pad e baixo "respiram" com o bumbo (som de anúncio moderno)
    sc = np.ones(n)
    for b in range(nbars):
        for s in pat.get("kick", []):
            i = int((b * bar + s * step) * SR)
            L = int(0.18 * SR)
            if i < n:
                j = min(n, i + L)
                sc[i:j] = np.minimum(sc[i:j], 0.35 + 0.65 * (np.arange(j - i) / L))
    out = drums + (bass + pad) * sc[:, None]
    out = out[: int(seconds * SR)]
    return out / (np.abs(out).max() + 1e-9) * 0.8


# --------------------------------------------------------- arquivos
def load(path, seconds=None, start=0.0):
    cmd = [ffmpeg_bin(), "-v", "error", "-ss", str(start), "-i", path]
    if seconds:
        cmd += ["-t", str(seconds)]
    cmd += ["-f", "f32le", "-ac", "2", "-ar", str(SR), "-"]
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        return np.zeros((0, 2))
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2).astype(np.float64)


def write_wav(path, x):
    x = _stereo(x)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def db(v):
    return 10 ** (v / 20)


def mix(seconds, out, music=None, bpm=120, style="pop", music_db=-4.0, sfx_events=(), clips=(),
        voice=None, voice_db=0.0, duck=True, fade_out=1.2, sfx_db=-3.0):
    """music: None | "auto" | caminho. sfx_events: [(t, nome, ganho_db)]. clips: [(t, array_estéreo, ganho_db)]."""
    n = int(seconds * SR)
    buf = np.zeros((n, 2))
    mus = np.zeros((n, 2))
    if music == "auto":
        mus = music_bed(seconds, bpm, style)
    elif music:
        m = load(music)
        if len(m):
            reps = int(np.ceil(n / len(m)))
            mus = np.tile(m, (reps, 1))[:n]
            mus = mus / (np.abs(mus).max() + 1e-9) * 0.8
    if len(mus) < n:
        mus = np.vstack([mus, np.zeros((n - len(mus), 2))])
    vox = np.zeros((n, 2))
    if voice:
        v = load(voice) if isinstance(voice, str) else voice
        v = v[:n]
        vox[: len(v)] = v * db(voice_db)
    for t, arr, g in clips:
        _add(vox, arr, t, db(g))
    if duck and np.abs(vox).max() > 1e-4:
        env = _lp(np.abs(vox).mean(1), int(0.12 * SR))
        thr = max(1e-4, np.percentile(env[env > 1e-4], 60) * 0.5) if (env > 1e-4).any() else 1
        g = 1 - 0.7 * np.clip(env / thr, 0, 1)
        g = _lp(g, int(0.08 * SR))
        mus = mus * g[:, None]
    buf += mus * db(music_db) + vox
    for t, name, g in sfx_events:
        if name in SFX:
            _add(buf, SFX[name](), t, db(sfx_db + g))
    if fade_out and n:
        k = min(n, int(fade_out * SR))
        buf[-k:] *= np.linspace(1, 0, k)[:, None] ** 1.5
    peak = np.abs(buf).max()
    if peak > 0.95:
        buf = buf / peak * 0.95
    write_wav(out, buf)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("beat")
    b.add_argument("--bpm", type=float, default=120)
    b.add_argument("--style", default="pop", choices=list(PATTERNS))
    b.add_argument("--seconds", type=float, default=20)
    b.add_argument("--out", default="trilha.wav")
    s = sub.add_parser("sfx")
    s.add_argument("name", choices=list(SFX))
    s.add_argument("--out", default=None)
    a = ap.parse_args()
    if a.cmd == "beat":
        x = music_bed(a.seconds, a.bpm, a.style)
        k = int(1.0 * SR)
        x[-k:] *= np.linspace(1, 0, k)[:, None]
        write_wav(a.out, x)
        print(a.out)
    else:
        out = a.out or f"{a.name}.wav"
        write_wav(out, SFX[a.name]())
        print(out)


if __name__ == "__main__":
    main()
