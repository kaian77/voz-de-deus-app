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


# ------------------------------------------------------------------------------------------------ colagem (estilo Vox)

# Fundos de papel colorido (creme, mostarda, azul, verde-escuro, carvão, vermelho-tijolo)
COLLAGE_BG = [(236, 226, 204), (226, 172, 58), (33, 74, 132), (44, 70, 56), (38, 38, 40), (178, 66, 48)]
TAG_COLORS = [((245, 197, 24), (17, 17, 17)), ((236, 226, 204), (17, 17, 17)), ((17, 17, 17), (245, 197, 24))]


def _font(names, size):
    from PIL import ImageFont

    for n in names:
        for p in (n, f"/usr/share/fonts/truetype/dejavu/{n}", f"/usr/share/fonts/truetype/liberation/{n}"):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def _paper(w, h, color, seed):
    """Papel colorido com fibras (fundo da colagem)."""
    import numpy as np
    from PIL import Image, ImageFilter

    rng = np.random.default_rng(seed)
    noise = Image.fromarray((rng.random((h // 3, w // 3)) * 255).astype("uint8")).resize((w, h), Image.BICUBIC)
    n = (np.asarray(noise.filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32) / 255 - 0.5) * 18
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    vig = 1 - 0.18 * (((xx / w - 0.5) ** 2 + (yy / h - 0.5) ** 2) * 2)  # bordas um pouco mais escuras
    arr = np.array(color, dtype=np.float32)[None, None, :] * vig[..., None] + n[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype("uint8")).convert("RGBA")


def _engrave(im, tint=(1.0, 0.95, 0.86)):
    """Foto antiga: preto e branco com contraste e um tom sépia leve."""
    import numpy as np
    from PIL import ImageOps

    g = ImageOps.autocontrast(ImageOps.grayscale(im.convert("RGB")), cutoff=1)
    a = np.asarray(g, dtype=np.float32)[..., None] * np.array(tint, dtype=np.float32)[None, None, :]
    from PIL import Image
    return Image.fromarray(np.clip(a, 0, 255).astype("uint8"))


def _contain(im, bw, bh):
    from PIL import Image

    k = min(bw / im.width, bh / im.height)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


def _shadowed(rgba, blur=14, off=(10, 16), alpha=110):
    """Cola uma sombra suave embaixo do recorte (como papel sobre papel)."""
    from PIL import Image, ImageFilter

    pad = blur * 3
    out = Image.new("RGBA", (rgba.width + pad * 2, rgba.height + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", rgba.size, (0, 0, 0, alpha))
    sh.putalpha(rgba.split()[-1].point(lambda v: v * alpha // 255))
    out.paste(sh, (pad + off[0], pad + off[1]), sh)
    out = out.filter(ImageFilter.GaussianBlur(blur))
    out.alpha_composite(rgba, (pad, pad))
    return out


def _torn(mask, rng, edge="bottom", amp=10):
    """Borda rasgada: recorta um zigue-zague irregular num lado da máscara."""
    from PIL import ImageDraw

    w, h = mask.size
    d = ImageDraw.Draw(mask)
    pts, x = [], 0
    while x <= w:
        pts.append((x, h - amp - rng.uniform(0, amp)) if edge == "bottom" else (x, amp + rng.uniform(0, amp)))
        x += rng.uniform(8, 22)
    if edge == "bottom":
        d.polygon(pts + [(w, h), (0, h)], fill=0)
    else:
        d.polygon(pts + [(w, 0), (0, 0)], fill=0)
    return mask


def _card(im, bw, bh, rng, border=0.035, torn=True):
    """Foto antiga com borda branca, borda de baixo rasgada e sombra."""
    from PIL import Image

    ph = _contain(_engrave(im), bw, bh)
    b = max(8, int(min(ph.size) * border))
    card = Image.new("RGBA", (ph.width + 2 * b, ph.height + 2 * b), (247, 243, 232, 255))
    card.paste(ph, (b, b))
    if torn:
        card.putalpha(_torn(Image.new("L", card.size, 255), rng, "bottom", amp=max(6, b // 2)))
    return card


def _sticker(cut, bh):
    """Recorte do personagem em P&B com contorno branco grosso (adesivo)."""
    from PIL import Image, ImageFilter

    cut = cut.crop(cut.getbbox() or (0, 0, cut.width, cut.height))
    k = bh / cut.height
    cut = cut.resize((max(1, int(cut.width * k)), max(1, int(cut.height * k))), Image.LANCZOS)
    alpha = cut.split()[-1]
    g = _engrave(cut).convert("RGBA")
    g.putalpha(alpha)
    pad = max(10, int(bh * 0.02))
    big = Image.new("L", (cut.width + pad * 2, cut.height + pad * 2), 0)
    big.paste(alpha, (pad, pad))
    ring = big.filter(ImageFilter.MaxFilter(pad // 2 * 2 + 1)).point(lambda v: 255 if v > 40 else 0)
    out = Image.new("RGBA", big.size, (250, 248, 240, 0))
    out.putalpha(ring)
    out.alpha_composite(g, (pad, pad))
    return out


def _tag(text, size, colors):
    """Etiqueta de papel com letra de máquina de escrever."""
    from PIL import Image, ImageDraw

    f = _font(["DejaVuSansMono-Bold.ttf", "LiberationMono-Bold.ttf"], size)
    text = text.upper()
    x0, y0, x1, y1 = ImageDraw.Draw(Image.new("L", (1, 1))).textbbox((0, 0), text, font=f)
    px, py = int(size * 0.55), int(size * 0.35)
    im = Image.new("RGBA", (x1 - x0 + 2 * px, y1 - y0 + 2 * py), colors[0] + (255,))
    ImageDraw.Draw(im).text((px - x0, py - y0), text, font=f, fill=colors[1])
    return im


def _stamp(im, size, rng):
    """Selo postal: recorte quadrado em duas cores com picote nas bordas."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageOps

    s = min(im.size)
    sq = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((size, size))
    ink = [(38, 120, 128), (176, 52, 52), (40, 70, 140)][int(rng.integers(0, 3))]
    duo = ImageOps.colorize(ImageOps.grayscale(sq), black=ink, white=(240, 236, 222)).convert("RGBA")
    b = int(size * 0.09)
    st = Image.new("RGBA", (size + 2 * b, size + 2 * b), (244, 240, 228, 255))
    st.paste(duo, (b, b))
    m = Image.new("L", st.size, 255)
    d = ImageDraw.Draw(m)
    r, step = max(3, b // 3), max(8, b)
    for x in np.arange(0, st.width + 1, step):
        d.ellipse([x - r, -r, x + r, r], fill=0)
        d.ellipse([x - r, st.height - r, x + r, st.height + r], fill=0)
    for y in np.arange(0, st.height + 1, step):
        d.ellipse([-r, y - r, r, y + r], fill=0)
        d.ellipse([st.width - r, y - r, st.width + r, y + r], fill=0)
    st.putalpha(m)
    return st


def _tape(w, h):
    from PIL import Image

    return Image.new("RGBA", (w, h), (236, 222, 186, 170))


def _tv(im, width):
    """TV antiga de madeira com a foto na tela."""
    from PIL import Image, ImageDraw

    h = int(width * 0.74)
    tv = Image.new("RGBA", (width, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(tv)
    d.rounded_rectangle([0, 0, width, h], radius=int(width * 0.08), fill=(120, 72, 40, 255), outline=(70, 40, 22, 255), width=6)
    sx0, sy0, sx1, sy1 = int(width * 0.07), int(h * 0.1), int(width * 0.74), int(h * 0.9)
    screen = _engrave(im).resize((sx1 - sx0, sy1 - sy0), Image.LANCZOS).convert("RGBA")
    lines = Image.new("RGBA", screen.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    for y in range(0, screen.height, 4):
        ld.line([(0, y), (screen.width, y)], fill=(0, 0, 0, 40))
    screen.alpha_composite(lines)
    m = Image.new("L", screen.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, screen.width, screen.height], radius=int(width * 0.05), fill=255)
    tv.paste(screen, (sx0, sy0), m)
    kx = int(width * 0.86)
    for ky in (0.3, 0.55):
        r = int(width * 0.045)
        d.ellipse([kx - r, int(h * ky) - r, kx + r, int(h * ky) + r], fill=(200, 176, 120, 255), outline=(60, 40, 20, 255), width=3)
    for i in range(5):
        y = int(h * (0.72 + i * 0.035))
        d.line([(kx - int(width * 0.06), y), (kx + int(width * 0.06), y)], fill=(60, 36, 20, 255), width=3)
    return tv


def _back(x):
    """Entrada com leve passada do ponto (ease out back)."""
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def _zoom_crop(im, k=1.7):
    """Close no meio da imagem (segunda foto da cena, como um detalhe ampliado)."""
    cw, ch = int(im.width / k), int(im.height / k)
    x, y = (im.width - cw) // 2, int((im.height - ch) * 0.4)
    return im.crop((x, y, x + cw, y + ch))


def _scene_layers(sc, w, h, rng, si):
    """Monta as camadas de uma cena (imagem final de cada elemento + onde e quando entra).
    Vertical: tudo entre 4% e 64% da altura, para não brigar com as legendas (que ficam perto dos 70%)."""
    from PIL import Image

    im = Image.open(sc["img"]).convert("RGB")
    u = min(w, h)
    vertical = h > w
    layers = []
    layout = sc.get("layout") or "photo"
    label = (sc.get("label") or "").strip()
    tag_c = TAG_COLORS[si % len(TAG_COLORS)]
    cy = 0.35 if vertical else 0.47
    top = 0.09 if vertical else 0.1  # linha das etiquetas e do selo

    def add(img, cx, cy_, delay, kind="drop", angle=0.0):
        if angle:
            img = img.rotate(angle, expand=True, resample=Image.BICUBIC)
        layers.append({"img": img, "x": int(cx * w - img.width / 2), "y": int(cy_ * h - img.height / 2),
                       "delay": delay, "kind": kind, "phase": float(rng.uniform(0, 6.28))})

    if layout == "map":
        card = _card(im, int(w * 0.94), int(h * (0.56 if vertical else 0.8)), rng, torn=False)
        add(_shadowed(card), 0.5, cy, 0.0, "pop")
        layers[-1]["route"] = True
        parts = [p.strip() for p in label.replace("->", "→").split("→") if p.strip()]
        layers[-1]["route_tags"] = [_tag(p, int(u * 0.036), TAG_COLORS[0]) for p in parts[:2]]
        return layers

    if layout == "tv":
        add(_shadowed(_tv(im, int(w * (0.96 if vertical else 0.62)))), 0.5, cy + 0.02, 0.0, "drop", float(rng.uniform(-2, 2)))
    elif layout == "sticker" and sc.get("cut"):
        back = _shadowed(_card(im, int(w * 0.62), int(h * 0.3), rng))
        add(back, 0.68 if vertical else 0.64, cy - 0.06, 0.0, "slide", float(rng.uniform(4, 8)))
        stick = _shadowed(_sticker(Image.open(sc["cut"]).convert("RGBA"), int(h * (0.5 if vertical else 0.78))))
        add(stick, 0.4, cy + 0.03, 0.25, "pop", float(rng.uniform(-4, 2)))
    else:
        card = _shadowed(_card(im, int(w * (0.92 if vertical else 0.62)), int(h * (0.5 if vertical else 0.72)), rng))
        add(card, 0.48, cy, 0.0, "drop", float(rng.uniform(-3, 3)))
        add(_tape(int(u * 0.24), int(u * 0.06)), 0.5 + float(rng.uniform(-0.15, 0.15)), cy - (0.25 if vertical else 0.36),
            0.2, "pop", float(rng.uniform(-12, 12)))
        # Segunda foto: detalhe ampliado entrando de lado por cima do canto de baixo
        detail = _shadowed(_card(_zoom_crop(im), int(w * (0.4 if vertical else 0.26)), int(h * (0.2 if vertical else 0.34)), rng))
        add(detail, 0.76 if vertical else 0.8, cy + (0.22 if vertical else 0.3), 1.1, "slide", float(rng.uniform(4, 9)))
    # Selo no canto e etiqueta com o lugar/nome em cima (fora do caminho das legendas)
    add(_shadowed(_stamp(im, int(u * 0.17), rng), blur=6, off=(4, 6)), 0.86, top + 0.01, 0.45, "pop", float(rng.uniform(-14, 14)))
    if label:
        add(_shadowed(_tag(label, int(u * 0.046), tag_c), blur=5, off=(3, 5)), 0.32, top, 0.55, "slide", float(rng.uniform(-3, 3)))
    return layers


def collage_video(scenes, w, h, out, fps=FPS, seed=7):
    """scenes: [{img, cut?, layout, label, length, advance}] -> vídeo mudo no estilo colagem de papel (estilo Vox):
    fundo de papel colorido, fotos antigas com borda e sombra que caem girando, adesivo do personagem recortado,
    selo, fita, etiqueta datilografada, TV antiga e mapa com a rota sendo desenhada."""
    import numpy as np
    from PIL import Image, ImageDraw

    rng = np.random.default_rng(seed)
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
                             "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17",
                             "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    ent = 0.42  # tempo de entrada de cada elemento
    for si, sc in enumerate(scenes):
        last = si == len(scenes) - 1
        dur = sc["length"] if last else sc["advance"]
        n = max(1, round(dur * fps))
        color = COLLAGE_BG[si % len(COLLAGE_BG)] if (sc.get("layout") or "photo") != "map" else COLLAGE_BG[2]
        bg = _paper(w, h, color, seed + si)
        layers = _scene_layers(sc, w, h, rng, si)
        for f in range(n):
            t = f / fps
            frame = bg.copy()
            for li, L in enumerate(layers):
                q = (t - L["delay"]) / ent
                if q <= 0:
                    continue
                q = min(1.0, q)
                e = _back(q)
                img, x, y = L["img"], L["x"], L["y"]
                # Respiro contínuo depois de entrar (camadas andam um pouco em sentidos diferentes)
                x += int(6 * math.sin(t * 0.7 + L["phase"]))
                y += int(5 * math.cos(t * 0.6 + L["phase"]))
                if q < 1:
                    if L["kind"] == "drop":
                        y -= int((1 - e) * h * 0.55)
                    elif L["kind"] == "slide":
                        x += int((1 - e) * w * 0.7)
                    else:  # pop
                        s = max(0.05, 0.55 + 0.45 * e)
                        img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.BILINEAR)
                        x += (L["img"].width - img.width) // 2
                        y += (L["img"].height - img.height) // 2
                frame.paste(img, (x, y), img)
                if L.get("route") and q >= 1:  # rota vermelha sendo desenhada no mapa
                    cw, ch = L["img"].size
                    ax, ay = x + cw * 0.3, y + ch * 0.7
                    bx, by = x + cw * 0.72, y + ch * 0.3
                    mx, my = (ax + bx) / 2 + ch * 0.12, (ay + by) / 2 - ch * 0.18
                    p = min(1.0, max(0.0, (t - ent - 0.2) / 1.6))
                    d = ImageDraw.Draw(frame)
                    pts = [((1 - k) ** 2 * ax + 2 * (1 - k) * k * mx + k * k * bx, (1 - k) ** 2 * ay + 2 * (1 - k) * k * my + k * k * by)
                           for k in np.linspace(0, p, max(2, int(60 * p)))]
                    for j in range(0, len(pts) - 1, 2):  # tracejado
                        d.line([pts[j], pts[j + 1]], fill=(214, 40, 40), width=max(4, w // 160))
                    r = max(8, w // 90)
                    d.ellipse([ax - r, ay - r, ax + r, ay + r], fill=(214, 40, 40), outline=(255, 255, 255), width=3)
                    if p >= 1:
                        d.ellipse([bx - r, by - r, bx + r, by + r], fill=(214, 40, 40), outline=(255, 255, 255), width=3)
                    tags = L.get("route_tags") or []
                    for k, tg in enumerate(tags):
                        if k == 1 and p < 1:
                            continue
                        px, py = (ax, ay) if k == 0 else (bx, by)
                        frame.paste(tg, (int(min(max(0, px - tg.width / 2), w - tg.width)), int(py + r * 1.6)), tg)
            proc.stdin.write(frame.convert("RGB").tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("falha ao gerar o vídeo em colagem")
