"""Estilos de animação dos vídeos do YouTube (usados por video/youtube.py).

- parallax ("Animação 2.5D"): o personagem é recortado da imagem (rembg) e se mexe por cima do fundo desfocado,
  que anda no sentido contrário — sensação de profundidade, como animação em camadas.
- whiteboard ("Desenho à mão"): a cena vira traço de lápis num papel, uma mão desenha a cena aos poucos, as cores
  entram e, na troca de cena, o papel amassa e sai da tela.
Tudo local (numpy + PIL + ffmpeg), sem serviço pago.
"""
import math
import os
import subprocess

FPS = 30

# ------------------------------------------------------------------------------------------------ recorte

_SESSION = []


def cutout(src, out):
    """Personagem/objeto principal com fundo transparente. None quando não há um sujeito claro."""
    from PIL import Image

    try:
        from rembg import new_session, remove
    except ImportError:
        return None
    if not _SESSION:
        _SESSION.append(new_session("u2net"))
    im = Image.open(src).convert("RGB")
    cut = remove(im, session=_SESSION[0])
    import numpy as np

    a = np.asarray(cut.split()[-1], dtype=np.float32) / 255
    cover = a.mean()
    if cover < 0.04 or cover > 0.8:  # nada recortado, ou recortou a cena inteira
        return None
    cut.save(out)
    return out


# ------------------------------------------------------------------------------------------------ 2.5D

def parallax_clip(img, fg, seconds, motion, w, h, out, fps=FPS):
    """Fundo desfocado com zoom lento + personagem nítido por cima, entrando de baixo e "respirando"."""
    frames = max(2, round(seconds * fps))
    e = f"(3*pow(on/{frames},2)-2*pow(on/{frames},3))"
    z = f"1.10-0.08*{e}" if motion == "zoom_out" else f"1.02+0.08*{e}"
    if motion == "pan_left":
        x = f"(iw-iw/zoom)*(1-{e})"
    elif motion == "pan_right":
        x = f"(iw-iw/zoom)*{e}"
    else:
        x = "(iw-iw/zoom)/2"
    bw, bh = int(w * 1.5) // 2 * 2, int(h * 1.5) // 2 * 2
    bg = (f"[0:v]scale={bw}:{bh},gblur=sigma=5,eq=brightness=-0.06:saturation=1.05,"
          f"zoompan=z='{z}':x='{x}':y='(ih-ih/zoom)/2':d={frames}:s={w}x{h}:fps={fps},format=yuv420p[bg]")
    if not fg:
        fc = bg + ";[bg]null[v]"
        inputs = ["-loop", "1", "-i", img]
    else:
        # Personagem um pouco maior que a tela; o fundo anda num sentido e ele no outro (paralaxe)
        sway = -1 if motion == "pan_right" else 1
        ent = "if(lt(t,0.45),(1-pow(t/0.45,2))*90,0)"  # entra subindo nos primeiros 0,45 s
        fc = (bg + f";[1:v]scale={int(w * 1.08)}:-2,format=rgba[fg];"
              f"[bg][fg]overlay=x='(W-w)/2+{sway}*22*sin(2*PI*t/{max(seconds, 1):.2f})':"
              f"y='(H-h)/2+{int(h * 0.04)}+8*sin(2*PI*t/2.2)+{ent}':shortest=1:eval=frame,format=yuv420p[v]")
        inputs = ["-loop", "1", "-i", img, "-loop", "1", "-i", fg]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[v]", "-frames:v", str(frames),
                    "-r", str(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out], check=True)


# ------------------------------------------------------------------------------------------------ desenho à mão

def cover(im, w, h):
    from PIL import Image

    k = max(w / im.width, h / im.height)
    im = im.resize((math.ceil(im.width * k), math.ceil(im.height * k)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def paper_texture(w, h, seed=5):
    """Papel creme com fibras suaves."""
    import numpy as np
    from PIL import Image, ImageFilter

    rng = np.random.default_rng(seed)
    noise = Image.fromarray((rng.random((h // 4, w // 4)) * 255).astype("uint8")).resize((w, h), Image.BICUBIC)
    noise = noise.filter(ImageFilter.GaussianBlur(2))
    n = (np.asarray(noise, dtype=np.float32) / 255 - 0.5) * 10
    base = np.array([250, 247, 240], dtype=np.float32)
    return np.clip(base[None, None, :] + n[..., None], 0, 255)


def sketch(color_rgb):
    """Imagem colorida -> desenho a lápis (técnica 'color dodge'), cinza escuro sobre branco."""
    import numpy as np
    from PIL import Image, ImageFilter, ImageOps

    gray = ImageOps.grayscale(Image.fromarray(color_rgb.astype("uint8")))
    inv = ImageOps.invert(gray).filter(ImageFilter.GaussianBlur(9))
    g = np.asarray(gray, dtype=np.float32)
    b = np.asarray(inv, dtype=np.float32)
    dodge = np.clip(g * 255 / np.maximum(1, 255 - b), 0, 255)
    dodge = 255 - np.clip((255 - dodge) * 1.9, 0, 255)  # traço mais forte
    return dodge  # 0 = traço, 255 = papel


def crumple_map(w, h, seed=9):
    """Sombras de papel amassado (vincos), valores ~0.55..1.15 para multiplicar a imagem."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter

    rng = np.random.default_rng(seed)
    im = Image.new("L", (w // 2, h // 2), 128)
    d = ImageDraw.Draw(im)
    for _ in range(60):
        x0, y0 = rng.uniform(0, w // 2), rng.uniform(0, h // 2)
        ang = rng.uniform(0, math.pi)
        ln = rng.uniform(w * 0.1, w * 0.5)
        x1, y1 = x0 + math.cos(ang) * ln, y0 + math.sin(ang) * ln
        d.line([(x0, y0), (x1, y1)], fill=int(rng.uniform(60, 200)), width=int(rng.uniform(2, 6)))
    im = im.filter(ImageFilter.GaussianBlur(6)).resize((w, h), Image.BICUBIC)
    a = np.asarray(im, dtype=np.float32) / 128
    return np.clip(0.55 + (a - 0.55) * 0.9, 0.5, 1.2)


def pencil(size):
    """Lápis desenhado (reserva quando não há a mão): ponta em (0, 0) da imagem, corpo para baixo-direita."""
    from PIL import Image, ImageDraw

    s = size
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = s / 400
    body = [(60, 20), (380, 340), (340, 380), (20, 60)]
    d.polygon([(x * k, y * k) for x, y in body], fill=(244, 196, 48, 255), outline=(150, 110, 20, 255))
    d.polygon([(x * k, y * k) for x, y in [(0, 0), (60, 20), (20, 60)]], fill=(222, 184, 135, 255))
    d.polygon([(x * k, y * k) for x, y in [(0, 0), (22, 8), (8, 22)]], fill=(40, 40, 40, 255))
    d.polygon([(x * k, y * k) for x, y in [(380, 340), (400, 360), (360, 400), (340, 380)]], fill=(230, 120, 140, 255))
    return im


def stroke_path(w, h, rows):
    """Caminho em zigue-zague que cobre a imagem (como alguém desenhando de cima para baixo)."""
    pts = []
    m = 0.06
    for r in range(rows):
        y = h * (m + (1 - 2 * m) * (r + 0.5) / rows)
        xs = (w * m, w * (1 - m)) if r % 2 == 0 else (w * (1 - m), w * m)
        for k in range(9):
            x = xs[0] + (xs[1] - xs[0]) * k / 8
            yy = y + math.sin(k * 1.7 + r) * h / rows * 0.25  # traço irregular, mão humana
            pts.append((x, yy))
    return pts


def whiteboard_video(scenes, w, h, out, hand=None, fps=FPS):
    """scenes: [{img, length, advance}] -> vídeo mudo com desenho à mão, cor e papel amassando entre cenas.
    `length` é o tempo da cena e `advance` quanto ela ocupa antes da próxima (o resto é a transição de 0,45 s
    que fica por conta do amassado)."""
    import numpy as np
    from PIL import Image, ImageDraw

    paper = paper_texture(w, h)
    crum = crumple_map(w, h)
    sw, sh = w // 4, h // 4  # máscara do traço em baixa resolução (rápido)
    tool = hand or pencil(int(min(w, h) * 0.42))
    tw, th = tool.size
    tip = getattr(tool, "tip", (0, 0))
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
                             "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17",
                             "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    for si, sc in enumerate(scenes):
        color = np.asarray(cover(Image.open(sc["img"]).convert("RGB"), w, h), dtype=np.float32)
        sk = sketch(color)[..., None] / 255  # 1 = papel
        drawn = paper * sk  # traço por cima do papel
        last = si == len(scenes) - 1
        dur = sc["length"] if last else sc["advance"]
        n = max(1, round(dur * fps))
        draw_t = min(dur * 0.55, 3.2 if h > w else 4.5)
        fill_t = 0.55
        crumple_t = 0 if last else 0.45
        rows = 7 if h > w else 5
        path = stroke_path(sw, sh, rows)
        mask = Image.new("L", (sw, sh), 0)
        md = ImageDraw.Draw(mask)
        brush = int(sh / rows * 1.35)
        drawn_upto = 0
        for f in range(n):
            t = f / fps
            p = min(1.0, t / draw_t)
            k = int(p * (len(path) - 1))
            for j in range(drawn_upto, k):  # avança o traço
                md.line([path[j], path[j + 1]], fill=255, width=brush, joint="curve")
            drawn_upto = max(drawn_upto, k)
            if p >= 1 and drawn_upto < len(path) - 1:
                md.rectangle([0, 0, sw, sh], fill=255)
                drawn_upto = len(path) - 1
            m = np.asarray(mask.resize((w, h), Image.BILINEAR), dtype=np.float32)[..., None] / 255
            frame = paper * (1 - m) + drawn * m
            c = min(1.0, max(0.0, (t - draw_t) / fill_t))  # cores entram depois do desenho
            if c > 0:
                c = c * c * (3 - 2 * c)
                frame = frame * (1 - c * 0.92) + color * (c * 0.92)
            img = Image.fromarray(frame.astype("uint8"))
            if p < 1:  # mão/lápis na ponta do traço
                px, py = path[k]
                img.paste(tool, (int(px * 4 - tip[0]), int(py * 4 - tip[1])), tool)
            if crumple_t and t > dur - crumple_t:  # papel amassa, encolhe girando e sai
                q = (t - (dur - crumple_t)) / crumple_t
                q = q * q
                arr = np.asarray(img, dtype=np.float32) * (1 + (crum - 1) * min(1.0, q * 2.2))[..., None]
                ball = Image.fromarray(np.clip(arr, 0, 255).astype("uint8")).convert("RGBA")
                s = max(0.02, 1 - 0.92 * q)
                ball = ball.resize((max(2, int(w * s)), max(2, int(h * s))), Image.BILINEAR).rotate(
                    40 * q, expand=True, resample=Image.BILINEAR, fillcolor=(0, 0, 0, 0))
                bg = Image.fromarray(paper.astype("uint8"))
                bx = int((w - ball.width) / 2 + q * w * 0.35)
                by = int((h - ball.height) / 2 - q * h * 0.25)
                bg.paste(ball, (bx, by), ball)
                img = bg
            proc.stdin.write(img.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("falha ao gerar o vídeo desenhado")


def load_hand(path):
    """Mão segurando a caneta (PNG com transparência); a ponta da caneta é o pixel visível mais acima-à-esquerda."""
    import numpy as np
    from PIL import Image

    im = Image.open(path).convert("RGBA")
    a = np.asarray(im.split()[-1])
    ys, xs = np.nonzero(a > 128)
    if not len(xs):
        return None
    i = int(np.argmin(xs + ys))
    im.tip = (int(xs[i]), int(ys[i]))
    return im


def sfx_paper(seconds=0.45, sr=24000):
    """Som de papel amassando: estalos curtos de ruído."""
    import numpy as np

    rng = np.random.default_rng(21)
    n = int(seconds * sr)
    out = np.zeros(n, dtype=np.float32)
    for _ in range(40):
        i = int(rng.uniform(0, n - 400))
        ln = int(rng.uniform(80, 400))
        out[i:i + ln] += rng.standard_normal(ln).astype(np.float32) * np.exp(-np.arange(ln) / (ln / 4)) * rng.uniform(0.3, 1)
    return out / (np.abs(out).max() + 1e-9)


def sfx_pencil(seconds, sr=24000):
    """Raspar do lápis no papel enquanto desenha (ruído agudo e baixo)."""
    import numpy as np

    n = int(seconds * sr)
    noise = np.random.default_rng(4).standard_normal(n).astype(np.float32)
    hp = noise - np.convolve(noise, np.ones(6) / 6, mode="same")
    env = 0.6 + 0.4 * np.abs(np.sin(np.arange(n) / sr * 2 * np.pi * 3.1))
    return hp * env / (np.abs(hp).max() + 1e-9)
