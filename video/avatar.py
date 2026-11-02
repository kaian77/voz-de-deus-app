"""Vídeo com o avatar do dono apresentando (estilo "personagem + cartão"): o avatar fica embaixo e a boca mexe com a
voz (6 poses em video/avatar/pose0-5.png: 0 boca fechada, 1 aberta, 2 bem aberta, 3 "o", 4 sorriso, 5 piscando),
o cartão no meio mostra um vídeo de apoio (ex.: o 3D do Stick_Wise) e o título de cada fala fica no alto.
Voz: edge-tts grátis com tom ajustado (a voz do personagem, sem clonar ninguém).

Uso: python3 avatar.py <roteiro.json> <saida.mp4> [--silent]
Roteiro: {"voice", "rate", "pitch", "tag", "header", "clip": "caminho do vídeo do cartão",
          "lines": [{"say": "fala", "head": "título com *destaque*"}], "caption"}
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "engine", "assets", "fonts")
W, H, FPS, SR = 1080, 1920, 30, 24000
BG, INK, ACC = (242, 238, 230), (24, 24, 28), (59, 75, 216)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


async def _tts(text, voice, rate, pitch, mp3):
    import edge_tts
    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
    words = []
    with open(mp3, "wb") as f:
        async for ch in comm.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "w": ch["text"]})
    return words


def tts(text, voice, rate, pitch, mp3):
    for _ in range(4):
        try:
            words = asyncio.run(_tts(text, voice, rate, pitch, mp3))
            if os.path.getsize(mp3) > 1000:
                return words
        except Exception as e:  # noqa: BLE001
            print("voz:", e)
    raise RuntimeError("a narração falhou")


def pcm(path):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                         stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(out, dtype=np.int16).astype(np.float32) / 32768


def wrap_rich(draw, text, f, maxw):
    """Quebra o título em linhas; *palavra* = destaque (azul). Devolve [[(palavra, destaque)]]."""
    toks = [(m.group(1) or m.group(2), bool(m.group(1))) for m in re.finditer(r"\*([^*]+)\*|(\S+)", text)]
    words = []
    for t, acc in toks:
        for w in t.split():
            if words and re.fullmatch(r"[.,!?:;…]+", w):  # pontuação gruda na palavra anterior
                words[-1] = (words[-1][0] + w, words[-1][1])
            else:
                words.append((w, acc))
    lines, cur = [], []
    for w in words:
        test = " ".join(x for x, _ in cur + [w])
        if cur and draw.textlength(test, font=f) > maxw:
            lines.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def rounded(size, r, fill, outline=None, width=0):
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], r, fill=fill, outline=outline, width=width)
    return im


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def main():
    spec_path, out = sys.argv[1], sys.argv[2]
    silent = "--silent" in sys.argv
    spec = json.load(open(spec_path))
    work = tempfile.mkdtemp()
    voice, rate, pitch = spec.get("voice", "pt-BR-AntonioNeural"), spec.get("rate", "+8%"), spec.get("pitch", "+6Hz")

    # ---- voz e linha do tempo
    lines, parts, cur = [], [], 0.5
    for i, ln in enumerate(spec["lines"]):
        if silent:
            n = len(ln["say"].split()) * 0.34
            audio = (np.sin(np.arange(int(n * SR)) / SR * 2 * np.pi * 3) > 0).astype(np.float32) * 0.3  # "fala" de mentira
        else:
            mp3 = os.path.join(work, f"v{i}.mp3")
            tts(ln["say"], voice, rate, pitch, mp3)
            audio = pcm(mp3)
        dur = len(audio) / SR
        lines.append({**ln, "start": cur, "end": cur + dur})
        parts.append((cur, audio))
        cur += dur + 0.35
    total = cur + 1.0
    n = int(total * SR)
    voice_track = np.zeros(n, np.float32)
    for st, a in parts:
        s = int(st * SR)
        voice_track[s:s + len(a)] += a[: n - s]
    # volume da voz por quadro -> abertura da boca
    hop = SR // FPS
    env = np.array([np.sqrt(np.mean(voice_track[k * hop:(k + 1) * hop] ** 2) + 1e-9) for k in range(int(total * FPS))])
    env = env / (np.percentile(env[env > 0.01], 90) if (env > 0.01).any() else 1)

    # ---- peças fixas
    poses = [Image.open(os.path.join(HERE, "avatar", f"pose{k}.png")).convert("RGBA") for k in range(6)]
    # avatar do peito para cima, grande, encostado embaixo
    scale = 1.45
    crop_h = 640
    poses = [p.crop((0, 0, p.width, crop_h)).resize((int(p.width * scale), int(crop_h * scale)), Image.LANCZOS) for p in poses]
    ax, ay = (W - poses[0].width) // 2, H - poses[0].height + 30
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cw, ch = 940, 560
    cx, cy = (W - cw) // 2, 420
    card_bg = rounded((cw, ch), 34, (255, 255, 255, 255), (20, 20, 24, 255), 5)
    card_shadow = rounded((cw, ch), 34, (20, 20, 24, 255)).filter(ImageFilter.GaussianBlur(2))
    mask = rounded((cw - 36, ch - 36), 22, (255, 255, 255, 255)).split()[3]
    f_head = font("InterDisplay-Black.otf", 74)
    f_small = font("Poppins-Medium.ttf", 26)
    f_tag = font("Poppins-Bold.ttf", 28)

    # vídeo do cartão: quadros extraídos no tamanho do cartão (recorte do meio)
    clip_frames = []
    clip = spec.get("clip")
    if clip and os.path.exists(clip):
        cdir = os.path.join(work, "clip")
        os.makedirs(cdir)
        subprocess.run(["ffmpeg", "-v", "error", "-i", clip, "-vf",
                        f"scale={cw - 36}:-2,crop={cw - 36}:{ch - 36}:0:(ih-{ch - 36})/2-80,fps={FPS}", "-q:v", "3",
                        os.path.join(cdir, "%05d.jpg")], check=True)
        clip_frames = sorted(os.path.join(cdir, x) for x in os.listdir(cdir))

    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                           "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                           os.path.join(work, "silent.mp4")], stdin=subprocess.PIPE)
    blink_at = {int(s * FPS) for s in np.arange(2.3, total, 3.7)}
    blink = 0
    for fi in range(int(total * FPS)):
        t = fi / FPS
        li = max([i for i, ln in enumerate(lines) if t >= ln["start"] - 0.25] or [0])
        ln = lines[li]
        k = (t - (ln["start"] - 0.25))
        frame = Image.new("RGBA", (W, H), BG + (255,))
        d = ImageDraw.Draw(frame)
        # cabeçalho fininho
        d.text((60, 52), f"// {spec.get('header', 'CURIOSIDADE')}", font=f_small, fill=(140, 136, 128))
        d.line([(60, 100), (W - 60, 100)], fill=(214, 208, 198), width=2)
        # título da fala (entra subindo)
        pop = ease(k / 0.35)
        rows = wrap_rich(d, ln["head"], f_head, W - 140)
        y = 150 + (1 - pop) * 30
        for row in rows:
            x = 70
            for w, acc in row:
                d.text((x, y), w, font=f_head, fill=(ACC if acc else INK) + (int(255 * pop),))
                x += d.textlength(w + " ", font=f_head)
            y += 86
        # cartão com o vídeo (leve inclinação que balança)
        card = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0))
        card.paste(card_shadow, (14, 16), card_shadow)
        card.alpha_composite(card_bg, (4, 4))
        if clip_frames:
            idx = min(len(clip_frames) - 1, int(t / total * len(clip_frames)))
            img = Image.open(clip_frames[idx]).convert("RGB")
            card.paste(img, (22, 22), mask)
        tag = spec.get("tag", "")
        if tag:
            tw = int(d.textlength(tag, font=f_tag)) + 36
            pill = rounded((tw, 50), 25, ACC + (255,))
            ImageDraw.Draw(pill).text((18, 7), tag, font=f_tag, fill=(255, 255, 255))
            card.alpha_composite(pill, (30, 0))
        ang = 1.2 * np.sin(t * 0.9)
        card = card.rotate(ang, resample=Image.BICUBIC, expand=False)
        frame.alpha_composite(card, (cx - 20, cy - 20 + int(6 * np.sin(t * 1.3))))
        # boca: volume -> pose; pisca quando cala
        e = env[min(fi, len(env) - 1)]
        talking = any(l2["start"] <= t <= l2["end"] for l2 in lines)
        if fi in blink_at:
            blink = 4
        if blink > 0 and e < 0.15:
            pose = 5
            blink -= 1
        elif not talking:
            pose = 4 if t > lines[-1]["end"] or (t - ln["end"]) > 0.1 else 0
        elif e < 0.12:
            pose = 0
        elif e < 0.4:
            pose = 3
        elif e < 0.8:
            pose = 1
        else:
            pose = 2
        bob = int(5 * np.sin(t * 4.2)) if talking else 0
        frame.alpha_composite(poses[pose], (ax, ay + bob))
        ff.stdin.write(frame.convert("RGB").tobytes())
    ff.stdin.close()
    ff.wait()

    # ---- som: voz + batida leve
    sys.path.insert(0, HERE)
    import youtube as yt
    mix = yt.music_bed(total)[:n] * 0.28
    mix = np.pad(mix, (0, n - len(mix))) + voice_track
    wh = yt.sfx_whoosh() * 0.35
    for ln in lines[1:]:
        s = int((ln["start"] - 0.3) * SR)
        seg = wh[: n - s]
        mix[s:s + len(seg)] += seg
    mix = np.clip(mix / max(1.0, np.abs(mix).max() / 0.95), -1, 1)
    wav = os.path.join(work, "mix.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", wav],
                   input=mix.astype(np.float32).tobytes(), check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(work, "silent.mp4"), "-i", wav, "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out], check=True)
    with open(os.path.splitext(out)[0] + ".txt", "w") as f:
        f.write(spec.get("caption", ""))
    print(f"ok: {out} ({total:.0f}s)")


if __name__ == "__main__":
    main()
