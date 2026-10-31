"""Louvor animado no estilo desenho pintado (video/painted.py): melodia instrumental sintetizada + letra em karaokê
(cada palavra acende no tempo da nota) + cenas que acompanham a letra.

Amostra: melodia "New Britain" (Amazing Grace, 1829, domínio público) com letra própria inspirada no Salmo 23.
Música de cantor/gravadora tem direito autoral: para usar uma, só com áudio liberado (próprio ou com licença).

  python3 louvor.py <saída.mp4>
"""
import math
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import painted as P

SR, BEAT = 44100, 0.78  # ~77 batidas por minuto, compasso 3/4
NOTE = {"D4": 293.66, "E4": 329.63, "G4": 392.0, "A4": 440.0, "B4": 493.88, "D5": 587.33}
# melodia por verso (nota, tempos); cada verso = 4 frases
PHRASES = [
    [("D4", 1), ("G4", 2), ("B4", .5), ("G4", .5), ("B4", 2), ("A4", 1), ("G4", 2), ("E4", 1), ("D4", 2)],
    [("D4", 1), ("G4", 2), ("B4", .5), ("G4", .5), ("B4", 2), ("A4", 1), ("D5", 3), ("D5", 2)],
    [("D5", 1), ("B4", 1.5), ("D5", .5), ("B4", 1), ("G4", 2), ("D4", 1), ("E4", 1.5), ("G4", .5), ("E4", 1), ("D4", 2)],
    [("D4", 1), ("G4", 2), ("B4", .5), ("G4", .5), ("B4", 2), ("A4", 1), ("G4", 3), ("G4", 2)],
]
CHORDS = [["G", "G", "C", "G"], ["G", "G", "D", "D"], ["G", "G", "C", "G"], ["G", "D", "G", "G"]]  # um por compasso (3 tempos)
TRIAD = {"G": (196.0, 246.94, 293.66), "C": (261.63, 329.63, 392.0), "D": (293.66, 369.99, 440.0)}
LYRICS = [
    ["O Senhor é o meu pastor,", "nada me faltará;", "em pastos verdes vou deitar,", "em paz me guiará."],
    ["No vale escuro que eu passar,", "não temerei o mal;", "Tu estás comigo, meu Senhor,", "teu amor é sem igual."],
]
INTRO = 3 * BEAT * 2  # dois compassos só de instrumental


# ------------------------------------------------------------------------------------------------ música
def piano(f, dur, vol):
    t = np.arange(int((dur + 1.2) * SR)) / SR
    env = np.minimum(1, t / 0.008) * np.exp(-t * 2.2)
    wv = sum(np.sin(2 * np.pi * f * k * t) / k ** 1.6 for k in (1, 2, 3, 4))
    return (wv * env * vol).astype(np.float32)


def pad(freqs, dur, vol):
    t = np.arange(int(dur * SR)) / SR
    env = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.6)
    wv = sum(np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * 5 * t) * 0.002 * f) + 0.4 * np.sin(4 * np.pi * f * t) for f in freqs)
    return (wv * env * vol).astype(np.float32)


def add(buf, at, x):
    a = int(at * SR)
    if a >= len(buf):
        return
    buf[a:a + len(x)] += x[: len(buf) - a]


def timeline():
    """Começo de cada nota, de cada frase e de cada palavra (karaokê)."""
    t, lines = INTRO, []
    for verse in LYRICS:
        for pi, (phrase, text) in enumerate(zip(PHRASES, verse)):
            onsets, tt = [], t
            for n, d in phrase:
                onsets.append((tt, n, d))
                tt += d * BEAT
            words = text.split()
            # palavra k começa na nota proporcional (melodia tem mais notas que palavras)
            wstart = [onsets[min(len(onsets) - 1, int(k * len(onsets) / len(words)))][0] for k in range(len(words))]
            lines.append({"t0": t, "t1": tt, "notes": onsets, "words": words, "wt": wstart, "pi": pi})
            t = tt
    return lines, t


def music(lines, total):
    buf = np.zeros(int((total + 2) * SR), np.float32)
    for k in range(2):  # introdução: acordes de G
        add(buf, k * 3 * BEAT, pad(TRIAD["G"], 3 * BEAT + .4, .035))
        add(buf, k * 3 * BEAT, piano(TRIAD["G"][0] / 2, 1.5, .18))
    for ln in lines:
        for (t, n, d) in ln["notes"]:
            add(buf, t, piano(NOTE[n], d * BEAT, .22))
        # acordes por compasso (a frase começa no tempo fraco: o compasso cai depois da 1ª nota)
        start = ln["notes"][1][0] if len(ln["notes"]) > 1 else ln["t0"]
        for bi, ch in enumerate(CHORDS[ln["pi"]]):
            at = start + bi * 3 * BEAT
            if at < ln["t1"] + 2 * BEAT:
                add(buf, at, pad(TRIAD[ch], 3 * BEAT + .5, .03))
                add(buf, at, piano(TRIAD[ch][0] / 2, 2.0, .14))
                for j, f in enumerate(TRIAD[ch][1:]):
                    add(buf, at + (j + 1) * BEAT, piano(f, .8, .07))
    add(buf, total - 2.5, pad(TRIAD["G"], 4.0, .04))
    # sala: eco curto
    out = buf.copy()
    for d, g in ((0.11, .35), (0.23, .22), (0.41, .12)):
        k = int(d * SR)
        out[k:] += buf[:-k] * g
    return np.clip(out / max(1e-6, np.abs(out).max()) * 0.8, -1, 1)


# ------------------------------------------------------------------------------------------------ cenas
def scene(line_i, lt, t):
    """0-3: pastos verdes (dia); 4-5: vale escuro; 6-7: a luz chega."""
    P.T = t
    img = Image.fromarray(P.PAPER.astype(np.uint8)).convert("RGBA")
    dark = 0.0
    if line_i >= 4:
        dark = 1.0 if line_i < 6 else max(0.0, 1 - lt / 3)
    P.sky(img, warm=0.15)
    if line_i < 4 or dark < 1:
        P.sun(img, 820 - 60 * (line_i % 4), 520, 100)
    P.hills(img, 1180)
    if line_i >= 4:  # paredões do vale
        left = [(-80, 420), (150, 470), (250, 700), (200, 900), (330, 1150), (280, 1400), (380, 1700), (-80, 1900)]
        for side in (-1, 1):
            pts = [(x if side < 0 else P.W - x, y) for x, y in left]
            P.wash(img, P.poly(*pts), (92, 86, 118), ("cliff", side), alpha=0.97)
            P.ink(img, P.poly(*pts[1:-1]), ("cliffi", side), 2.6)
            for j in range(4):  # rachaduras da rocha
                x0, y0 = pts[2 + j % 4]
                P.ink(img, [(x0 - side * 30, y0 + 40), (x0 - side * 90, y0 + 90)], ("crack", side, j), 1.8, (60, 56, 80))
    shepherd_x = (240 if line_i < 4 else 400) + (lt * 25 if line_i % 2 == 0 else 0)
    if line_i in (2, 3):  # ovelhas deitadas no pasto, riacho calmo
        P.stream(img, 1560)
    for k in range(4):
        x = (shepherd_x + 200 + k * 150 if line_i < 4 else 380 + k * 110) if line_i not in (2, 3) else 200 + k * 220
        P.sheep(img, x, 1520 + (k % 2) * 60, 1.1, hop=(t * 4 + k) if line_i not in (2, 3, 4, 5) else 0, key=k)
    P.david(img, shepherd_x, 1080, 1.3, "happy" if dark < 0.5 else "firm", arm=-1.2, bob=t * 3)
    P.ink(img, [(shepherd_x + 150, 950), (shepherd_x + 160, 1400)], "staff", 4.5, P.PAL["belt"])  # cajado
    P.ink(img, [(shepherd_x + 150, 950), (shepherd_x + 120, 900), (shepherd_x + 90, 930)], "crook", 4.5, P.PAL["belt"])
    frame = P.finish(img)
    if dark > 0:
        a = np.asarray(frame, np.float32)
        night = np.array([40, 44, 80], np.float32)
        frame = Image.fromarray(np.clip(a * (1 - 0.55 * dark) + night * 0.55 * dark * 0.6, 0, 255).astype(np.uint8))
    if line_i >= 6:  # luz que desce do céu
        d = ImageDraw.Draw(frame, "RGBA")
        k = min(1, lt / 2)
        for i in range(9):
            x = 540 + (i - 4) * 120
            d.polygon([(540, -50), (x - 40, 1900), (x + 40, 1900)], fill=(255, 236, 170, int(26 * k)))
    return frame


def karaoke(frame, ln, t, nxt):
    d = ImageDraw.Draw(frame, "RGBA")
    words = ln["words"]
    size = 64
    while True:  # diminui até a linha caber na faixa
        f = ImageFont.truetype(P.FONT, size)
        widths = [f.getlength(w_ + " ") for w_ in words]
        total = sum(widths)
        if total <= P.W - 160 or size <= 40:
            break
        size -= 3
    x = (P.W - total) / 2
    y = 230
    d.rounded_rectangle((50, y - 80, P.W - 50, y + 170), 34, fill=(250, 240, 214, 225), outline=P.INK + (255,), width=4)
    for w_, wd, ws in zip(words, widths, ln["wt"]):
        on = t >= ws
        k = min(1, max(0, (t - ws) / 0.18))
        col = (196, 120, 30) if on else (70, 60, 52)
        dy = -8 * math.sin(math.pi * k) if on and k < 1 else 0
        d.text((x, y + dy), w_, font=f, fill=col, anchor="lm")
        x += wd
    if nxt:  # próxima linha, menor e apagada
        f2 = ImageFont.truetype(P.FONT, 40)
        d.text((P.W / 2, y + 100), nxt, font=f2, fill=(110, 100, 90), anchor="mm")
    return frame


def render(out):
    P.PAPER = P.make_paper()
    lines, end = timeline()
    total = end + 4.5
    audio = music(lines, total)
    work = tempfile.mkdtemp()
    wav = os.path.join(work, "m.wav")
    with wave.open(wav, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((audio * 32767).astype(np.int16).tobytes())
    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{P.W}x{P.H}", "-r", str(P.FPS), "-i", "-",
                           "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
                           "-shortest", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    big = ImageFont.truetype(P.FONT, 86)
    for fi in range(int(total * P.FPS)):
        t = fi / P.FPS
        cur = max([i for i, ln in enumerate(lines) if ln["t0"] <= t] or [-1])
        if cur < 0:  # abertura
            frame = scene(0, 0, t)
            d = ImageDraw.Draw(frame, "RGBA")
            a = int(255 * min(1, t / 0.8))
            d.text((P.W / 2, 300), "Salmo 23", font=big, fill=P.INK + (a,), anchor="mm")
            d.text((P.W / 2, 400), "cante junto", font=ImageFont.truetype(P.FONT, 54), fill=(196, 120, 30, a), anchor="mm")
        elif t < end:
            ln = lines[cur]
            frame = scene(cur, t - ln["t0"], t)
            nxt = " ".join(lines[cur + 1]["words"]) if cur + 1 < len(lines) and cur % 4 != 3 else ""
            frame = karaoke(frame, ln, t, nxt)
        else:  # final
            frame = scene(7, 3, t)
            d = ImageDraw.Draw(frame, "RGBA")
            d.rounded_rectangle((80, 180, P.W - 80, 520), 34, fill=(250, 240, 214, 235), outline=P.INK + (255,), width=4)
            d.text((P.W / 2, 270), "Salmo 23", font=big, fill=P.INK, anchor="mm")
            d.text((P.W / 2, 370), "Comente: Amém", font=ImageFont.truetype(P.FONT, 58), fill=(196, 120, 30), anchor="mm")
            d.text((P.W / 2, 450), "Siga para mais louvores", font=ImageFont.truetype(P.FONT, 46), fill=P.INK, anchor="mm")
        ff.stdin.write(frame.convert("RGB").tobytes())
    ff.stdin.close()
    ff.wait()
    print("ok", out, f"{total:.1f}s")


if __name__ == "__main__":
    render(sys.argv[1])
