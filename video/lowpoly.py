"""Estilo "3D low-poly explicativo" para o StickWise (inglês): narra cada fala (edge-tts, palavra a palavra),
monta a linha do tempo, grava a cena three.js (video/lowpoly/scene.html, via render.cjs) e junta voz + trilha + whoosh.

Uso: python3 lowpoly.py <pasta> [tema ...] [--silent]   (--silent = sem voz, tempos estimados, para testar a imagem)
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

import youtube as yt

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = "en-US-AndrewNeural"
TOPICS = os.path.join(HERE, "lowpoly", "topics")  # <tema>.json (falas + legenda) + <tema>.js (cena)


def render(topic, out, silent=False):
    spec = json.load(open(os.path.join(TOPICS, f"{topic}.json")))
    LINES, CAPTION = spec["lines"], f"{spec['title']}\n\n{spec['caption']}"
    work = tempfile.mkdtemp()
    SR = yt.SR
    lines, voice_parts, cur = [], [], 0.6
    for i, text in enumerate(LINES):
        if silent:
            ws, n = [], 0.0
            for w in text.split():
                ws.append({"t": n, "d": 0.3, "w": w})
                n += 0.33 + (0.15 if w[-1] in ".,!" else 0)
            audio = np.zeros(int(n * SR), dtype=np.float32)
        else:
            mp3 = os.path.join(work, f"v{i}.mp3")
            ws = yt.speak(text, VOICE, mp3)
            audio = yt.pcm(mp3)
        dur = len(audio) / SR
        lines.append({"start": cur, "end": cur + dur, "words": [{**w, "t": w["t"] + cur} for w in ws]})
        voice_parts.append((cur, audio))
        cur += dur + 0.45
    total = cur + 1.2
    tl = os.path.join(work, "timeline.json")
    json.dump({"topic": topic, "lines": lines, "total": total}, open(tl, "w"))

    silent_mp4 = os.path.join(work, "silent.mp4")
    subprocess.run(["node", os.path.join(HERE, "lowpoly", "render.cjs"), tl, silent_mp4], check=True)

    n = int(total * SR)
    mix = yt.music_bed(total)[:n] * 0.35
    mix = np.pad(mix, (0, n - len(mix)))
    for st, a in voice_parts:
        s = int(st * SR)
        seg = a[: n - s]
        mix[s:s + len(seg)] += seg
    wh = yt.sfx_whoosh() * 0.5
    for ln in lines[1:]:
        s = int((ln["start"] - 0.35) * SR)
        seg = wh[: n - s]
        mix[s:s + len(seg)] += seg
    mix = np.clip(mix / max(1.0, np.abs(mix).max() / 0.95), -1, 1)
    wav = os.path.join(work, "mix.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", wav],
                   input=mix.astype(np.float32).tobytes(), check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", silent_mp4, "-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                    "-shortest", "-movflags", "+faststart", out], check=True)
    with open(os.path.splitext(out)[0] + ".txt", "w") as f:
        f.write(CAPTION)
    print(f"ok: {out} ({total:.0f}s)")


def main():
    """python3 lowpoly.py <pasta de saída> [tema ...] [--silent]  (sem tema = todos)"""
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    outdir = os.path.abspath(args[0] if args else "out")
    os.makedirs(outdir, exist_ok=True)
    topics = args[1:] or sorted(f[:-5] for f in os.listdir(TOPICS) if f.endswith(".json"))
    for t in topics:
        render(t, os.path.join(outdir, f"{t}.mp4"), "--silent" in sys.argv)


if __name__ == "__main__":
    main()
