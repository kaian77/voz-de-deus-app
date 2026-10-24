"""Vídeos explicativos em 3D low poly ("por dentro das coisas"): voz, plano 3D, render no Blender e montagem.

Três etapas, porque o render é dividido entre vários jobs do GitHub (cada quadro leva ~1 s na CPU):
  prepare  roteiro -> narração (edge-tts), tempos de cada cena, plano.json, áudio e legendas
  render   (lowpoly/scene.py, no Python com o pacote bpy) renderiza um pedaço dos quadros
  assemble quadros + áudio + legendas + etiquetas -> MP4 final e capa

Uso: python youtube3d.py prepare roteiro.json pasta [idioma]
     python youtube3d.py assemble pasta quadros/ saida.mp4
"""
import json
import os
import subprocess
import sys

import youtube as yt

FPS = 24
W, H = 1080, 1920
LEAD = 0.15  # respiro antes da fala de cada cena (s)


def prepare(script, work, lang="pt"):
    import numpy as np
    import wave

    os.makedirs(work, exist_ok=True)
    voice = {"pt": "pt-BR-AntonioNeural", "en": "en-US-AndrewNeural", "es": "es-MX-JorgeNeural"}.get(lang, "pt-BR-AntonioNeural")
    scenes, voices, words, t = [], [], [], 0.0
    for i, sc in enumerate(script["scenes"]):
        yt.log(f"  voz {i + 1}/{len(script['scenes'])}")
        mp3 = os.path.join(work, f"v{i}.mp3")
        ws = yt.speak(sc["narration"], voice, mp3)
        audio = yt.pcm(mp3)
        dur = round((LEAD + len(audio) / yt.SR + yt.PAUSE) * FPS) / FPS  # corte cai num quadro inteiro
        voices.append((t + LEAD, audio))
        words += [{**x, "t": x["t"] + t + LEAD} for x in ws]
        scenes.append({**sc, "start": t, "dur": dur})
        t += dur
    total = t
    plan = {"fps": FPS, "samples": 2, "scenes": scenes}
    with open(os.path.join(work, "plan.json"), "w") as f:
        json.dump(plan, f, ensure_ascii=False)

    # Áudio: narração + trilha + whoosh nos cortes
    mix = np.zeros(int((total + 0.5) * yt.SR), dtype=np.float32)
    talk = np.zeros_like(mix)
    for start, a in voices:
        i0 = int(start * yt.SR)
        mix[i0:i0 + len(a)] += a[: len(mix) - i0]
        talk[i0:i0 + len(a)] = 1
    bed = yt.music_bed(len(mix) / yt.SR)[: len(mix)]
    duck = np.convolve(talk, np.ones(yt.SR // 4) / (yt.SR // 4), mode="same")
    mix += bed * (0.24 - 0.13 * duck)
    wh = yt.sfx_whoosh(0.35)
    for sc in scenes[1:]:
        i0 = max(0, int((sc["start"] - 0.2) * yt.SR))
        seg = wh[: max(0, len(mix) - i0)]
        mix[i0:i0 + len(seg)] += seg * 0.15
    pop = yt.sfx_pop()
    for sc in scenes:
        if sc.get("label"):
            i0 = int((sc["start"] + 0.3) * yt.SR)
            seg = pop[: max(0, len(mix) - i0)]
            mix[i0:i0 + len(seg)] += seg * 0.3
    mix = np.clip(mix / max(1e-6, np.abs(mix).max()) * 0.95, -1, 1)
    with wave.open(os.path.join(work, "audio.wav"), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(yt.SR)
        f.writeframes((mix * 32767).astype(np.int16).tobytes())

    # Legendas palavra a palavra + etiquetas (número/nome em amarelo no alto, como "100 °C")
    ass = os.path.join(work, "cap.ass")
    yt.captions(words, True, W, H, ass, hook=None)
    with open(ass, "a", encoding="utf-8") as f:
        for sc in scenes:
            if sc.get("label"):
                txt = sc["label"].upper().replace("{", "").replace("}", "")
                f.write(f"Dialogue: 1,{yt.ass_time(sc['start'] + 0.3)},{yt.ass_time(sc['start'] + sc['dur'] - 0.1)},Hook,,0,0,0,,"
                        f"{{\\pos({W // 2},{int(H * 0.22)})\\fscx40\\fscy40\\t(0,180,\\fscx105\\fscy105)\\t(180,280,\\fscx100\\fscy100)}}{txt}\n")
    meta = {"frames": int(round(total * FPS)), "total": total, "title": script.get("title"), "thumbnail_text": script.get("thumbnail_text"),
            "thumb_frame": int((scenes[0]["start"] + scenes[0]["dur"] * 0.6) * FPS) + 1}
    with open(os.path.join(work, "meta.json"), "w") as f:
        json.dump(meta, f)
    yt.log(f"  {meta['frames']} quadros ({total:.1f}s)")
    return meta


def assemble(work, frames, out):
    with open(os.path.join(work, "meta.json")) as f:
        meta = json.load(f)
    total = meta["total"]
    ass = os.path.join(work, "cap.ass")
    fc = (f"[0:v]scale={W}:{H}:flags=lanczos,subtitles={ass}:fontsdir={yt.FONTS}[s];"
          f"[2:v]format=rgba[bar];[s][bar]overlay=x='-w+w*t/{total:.2f}':y='H-h':shortest=1[v]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-start_number", "1", "-i", os.path.join(frames, "f%04d.jpg"),
                    "-i", os.path.join(work, "audio.wav"), "-f", "lavfi", "-i", f"color=c=0xFFD700:s={W}x12:r={FPS}:d={total + 1:.2f}",
                    "-filter_complex", fc, "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], check=True)
    # Capa: um quadro da 1ª cena com o texto grande
    src = os.path.join(frames, f"f{meta['thumb_frame']:04d}.jpg")
    if not os.path.exists(src):
        src = os.path.join(frames, "f0001.jpg")
    thumb = os.path.splitext(out)[0] + ".jpg"
    yt.thumbnail(src, meta.get("thumbnail_text") or "", thumb)
    return out, thumb


def main():
    cmd = sys.argv[1]
    if cmd == "prepare":
        with open(sys.argv[2]) as f:
            script = json.load(f)
        prepare(script, sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "pt")
    elif cmd == "assemble":
        assemble(sys.argv[2], sys.argv[3], sys.argv[4])


if __name__ == "__main__":
    main()
