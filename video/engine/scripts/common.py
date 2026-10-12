"""Utilitários compartilhados: fontes, cores, easing, recorte de produto, texto."""
import math
import os
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "..", "assets", "fonts")

FONTS = {
    "black": "InterDisplay-Black.otf",      # títulos/hook gigantes
    "heavy": "InterDisplay-ExtraBold.otf",
    "bold": "Poppins-Bold.ttf",             # botões, preços
    "medium": "Poppins-Medium.ttf",         # textos de apoio
    "regular": "Poppins-Regular.ttf",
}
_font_cache = {}


def font(weight="bold", size=60, path=None):
    key = (path or weight, int(size))
    if key not in _font_cache:
        p = path or os.path.join(FONT_DIR, FONTS.get(weight, FONTS["bold"]))
        try:
            _font_cache[key] = ImageFont.truetype(p, int(size))
        except OSError:
            _font_cache[key] = ImageFont.truetype("DejaVuSans-Bold.ttf", int(size))
    return _font_cache[key]


def ffmpeg_bin():
    b = shutil.which("ffmpeg")
    if not b:
        raise SystemExit("ffmpeg não encontrado. Instale (apt install ffmpeg / brew install ffmpeg).")
    return b


def run(cmd, quiet=True):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        tail = "\n".join(r.stderr.strip().splitlines()[-25:])
        raise SystemExit(f"Falhou: {' '.join(cmd[:6])} ...\n{tail}")
    return r


# ---------- cores ----------
def rgb(c, a=None):
    if isinstance(c, (tuple, list)):
        t = tuple(int(x) for x in c)
    else:
        c = c.lstrip("#")
        if len(c) == 3:
            c = "".join(ch * 2 for ch in c)
        t = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    return t if a is None else t[:3] + (int(a),)


def mix(c1, c2, k):
    return tuple(int(a + (b - a) * k) for a, b in zip(rgb(c1), rgb(c2)))


def luminance(c):
    r, g, b = [x / 255 for x in rgb(c)]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def readable_on(bg):
    """Cor de texto legível sobre um fundo."""
    return (17, 17, 17) if luminance(bg) > 0.6 else (255, 255, 255)


# ---------- easing ----------
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out_cubic(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out(t):
    t = clamp(t)
    return 3 * t * t - 2 * t * t * t


def ease_out_back(t, s=1.70158):
    t = clamp(t) - 1
    return t * t * ((s + 1) * t + s) + 1


def ease_out_elastic(t):
    t = clamp(t)
    if t in (0, 1):
        return t
    return 2 ** (-10 * t) * math.sin((t * 10 - 0.75) * (2 * math.pi) / 3) + 1


def prog(t, start, dur):
    """Progresso 0..1 de uma animação que começa em `start` e dura `dur`."""
    return clamp((t - start) / dur) if dur > 0 else float(t >= start)


# ---------- imagens ----------
def load_image(path):
    im = Image.open(path)
    try:
        from PIL import ImageOps
        im = ImageOps.exif_transpose(im)
    except Exception:
        pass
    return im.convert("RGBA")


def has_transparency(im):
    return im.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 250


_CUT_CACHE = {}


def cutout_cached(path, method="auto"):
    key = (os.path.abspath(path), method, os.path.getmtime(path))
    if key not in _CUT_CACHE:
        _CUT_CACHE[key] = cutout(load_image(path), method=method)
    return _CUT_CACHE[key]


def cutout(im, tol=38, method="auto"):
    """Remove fundo de foto de produto.
    - Se a imagem já tem transparência, mantém.
    - Se `rembg` estiver instalado e method in (auto, rembg), usa IA (fundos complexos).
    - Senão, remove fundo liso (branco/cinza/colorido uniforme) por flood-fill das bordas.
    Retorna RGBA recortado ao conteúdo."""
    im = im.convert("RGBA")
    if has_transparency(im) or method == "none":
        return trim(im)
    if method in ("auto", "rembg"):
        try:
            from rembg import remove  # opcional
            return trim(remove(im))
        except Exception:
            if method == "rembg":
                print("[aviso] rembg indisponível; usando remoção de fundo liso.")
    arr = np.asarray(im.convert("RGB")).astype(np.int16)
    h, w = arr.shape[:2]
    border = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
    if border.std(axis=0).mean() > 28:  # fundo não é liso: não arrisca
        print("[aviso] fundo da foto não é liso; mantendo a foto inteira (use rembg ou PNG sem fundo).")
        return im
    bgc = np.median(border, axis=0)
    near = np.abs(arr - bgc).max(axis=2) <= tol  # pixels com a cor do fundo
    # só remove o fundo conectado às bordas (branco dentro do produto fica)
    k = max(1, max(h, w) // 320)
    small = near[::k, ::k]
    reach = np.zeros_like(small)
    reach[0, :], reach[-1, :], reach[:, 0], reach[:, -1] = small[0, :], small[-1, :], small[:, 0], small[:, -1]
    for _ in range(4 * max(small.shape)):
        grown = reach.copy()
        grown[1:] |= reach[:-1]
        grown[:-1] |= reach[1:]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= small
        if np.array_equal(grown, reach):
            break
        reach = grown
    full = np.repeat(np.repeat(reach, k, 0), k, 1)[:h, :w]
    # completa na resolução cheia (bordas finas) e suaviza
    full = full | (near & np.asarray(Image.fromarray(full.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(2 * k + 1))) > 0)
    alpha = Image.fromarray(np.where(full, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    im.putalpha(alpha)
    return trim(im)


def trim(im, pad=4):
    bbox = im.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))


def fit(im, max_w, max_h):
    k = min(max_w / im.width, max_h / im.height)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


def cover(im, w, h, fx=0.5, fy=0.5):
    """Redimensiona preenchendo w×h (corta o excesso)."""
    k = max(w / im.width, h / im.height)
    nw, nh = int(math.ceil(im.width * k)), int(math.ceil(im.height * k))
    im = im.resize((nw, nh), Image.LANCZOS)
    x = int((nw - w) * fx)
    y = int((nh - h) * fy)
    return im.crop((x, y, x + w, y + h))


def drop_shadow(im, blur=24, offset=(0, 26), opacity=0.45, color=(0, 0, 0)):
    """Retorna (camada_com_sombra, deslocamento) — sombra suave de estúdio."""
    pad = blur * 3
    a = im.getchannel("A").point(lambda v: int(v * opacity))
    sh = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), color + (0,))
    sha = Image.new("L", sh.size, 0)
    sha.paste(a, (pad + offset[0], pad + offset[1]))
    sha = sha.filter(ImageFilter.GaussianBlur(blur))
    sh.putalpha(sha)
    sh.alpha_composite(im, (pad, pad))
    return sh, pad


def radial_glow(size, color, strength=1.0):
    """Sprite RGBA de brilho radial suave."""
    n = 256
    y, x = np.mgrid[-1:1:n * 1j, -1:1:n * 1j]
    d = np.sqrt(x * x + y * y)
    a = np.clip(1 - d, 0, 1) ** 2.2 * 255 * strength
    arr = np.zeros((n, n, 4), np.uint8)
    arr[..., :3] = rgb(color)
    arr[..., 3] = a.astype(np.uint8)
    return Image.fromarray(arr, "RGBA").resize((int(size), int(size)), Image.BILINEAR)


def gradient(w, h, c1, c2, angle=135):
    a = math.radians(angle)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (x / w - 0.5) * math.cos(a) + (y / h - 0.5) * math.sin(a)
    t = (t - t.min()) / max(1e-6, t.max() - t.min())
    c1, c2 = np.array(rgb(c1), np.float32), np.array(rgb(c2), np.float32)
    arr = c1 + (c2 - c1) * t[..., None]
    return Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")


def transform(layer, scale=1.0, rotate=0.0, opacity=1.0):
    big = layer.width * layer.height > 500_000
    if abs(scale - 1.0) > 1e-3:
        w, h = max(1, int(layer.width * scale)), max(1, int(layer.height * scale))
        layer = layer.resize((w, h), Image.BILINEAR if big else Image.BICUBIC)
    if abs(rotate) > (2.0 if big else 0.05):  # micro-rotação em sprite grande não compensa o custo
        layer = layer.rotate(rotate, resample=Image.BILINEAR, expand=True)
    if opacity < 1.0:
        a = layer.getchannel("A").point(lambda v: int(v * clamp(opacity)))
        layer = layer.copy()
        layer.putalpha(a)
    return layer


def safe_composite(canvas, layer, x, y):
    """alpha_composite que aceita posições negativas/fora do quadro."""
    x, y = int(round(x)), int(round(y))
    l, t = max(0, -x), max(0, -y)
    r = min(layer.width, canvas.width - x)
    b = min(layer.height, canvas.height - y)
    if r <= l or b <= t:
        return
    if (l, t, r, b) != (0, 0, layer.width, layer.height):
        layer = layer.crop((l, t, r, b))
    canvas.alpha_composite(layer, (x + l, y + t))


def paste_center(canvas, layer, cx, cy, **tf):
    if tf.get("opacity", 1) <= 0.003 or tf.get("scale", 1) <= 0.01:
        return
    l2 = transform(layer, **tf)
    safe_composite(canvas, l2, cx - l2.width / 2, cy - l2.height / 2)


# ---------- texto ----------
def parse_highlight(text):
    """'Pare de *perder tempo*' -> [(palavra, destaque?)]"""
    out, hl = [], False
    for raw in text.replace("\n", " \n ").split(" "):
        if raw == "":
            continue
        if raw == "\n":
            out.append(("\n", False))
            continue
        w = raw
        start = w.startswith("*")
        end = w.endswith("*") and len(w) > 1
        w = w.strip("*")
        if start:
            hl = True
        out.append((w, hl))
        if end:
            hl = False
    return out


def layout_words(text, max_w, size, weight="black", max_lines=4, min_size=28, line_gap=0.08, font_path=None):
    """Quebra o texto e reduz a fonte até caber. Retorna (linhas, fonte, altura_total)
    linhas = [[(palavra, destaque, x, largura), ...], ...] com x relativo ao início da linha."""
    words = parse_highlight(text)
    size = int(size)
    while True:
        f = font(weight, size, font_path)
        space = f.getlength(" ")
        lines, cur, cur_w = [], [], 0
        for w, hl in words:
            if w == "\n":
                lines.append(cur)
                cur, cur_w = [], 0
                continue
            ww = f.getlength(w)
            add = ww if not cur else cur_w + space + ww
            if cur and add > max_w:
                lines.append(cur)
                cur, cur_w = [], 0
                add = ww
            cur.append([w, hl, cur_w + (space if cur else 0), ww])
            cur_w = add
        if cur:
            lines.append(cur)
        widest = max((ln[-1][2] + ln[-1][3]) for ln in lines if ln) if lines else 0
        if (len(lines) <= max_lines and widest <= max_w) or size <= min_size:
            asc, desc = f.getmetrics()
            lh = int((asc + desc) * (1 + line_gap))
            return lines, f, lh
        size = int(size * 0.92)


def render_text(text, max_w, size, color="#FFFFFF", hl_color="#FFD600", weight="black", align="center",
                stroke=0, stroke_color=(0, 0, 0), max_lines=4, hl_box=False, hl_box_color=None,
                shadow=True, font_path=None, upper=False):
    """Renderiza um bloco de texto como camada RGBA (com destaque em *palavras*)."""
    size = int(size)
    if upper:
        text = text.upper()
    lines, f, lh = layout_words(text, max_w, size, weight, max_lines, font_path=font_path)
    pad = int(size * 0.35) + stroke
    widths = [(ln[-1][2] + ln[-1][3]) if ln else 0 for ln in lines]
    W = int(max(widths + [1]) + pad * 2)
    H = int(lh * len(lines) + pad * 2)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i, ln in enumerate(lines):
        lw = widths[i]
        x0 = pad + (0 if align == "left" else (W - 2 * pad - lw) / (2 if align == "center" else 1))
        y = pad + i * lh
        for w, hl, x, ww in ln:
            if hl and hl_box:
                bc = rgb(hl_box_color or hl_color)
                d.rounded_rectangle((x0 + x - size * 0.12, y + size * 0.02, x0 + x + ww + size * 0.12, y + lh * 0.95),
                                    radius=int(size * 0.14), fill=bc + (255,))
                col = readable_on(bc)
            else:
                col = rgb(hl_color) if hl else rgb(color)
            d.text((x0 + x, y), w, font=f, fill=col + (255,), stroke_width=stroke, stroke_fill=rgb(stroke_color))
    if shadow:
        sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        a = layer.getchannel("A").filter(ImageFilter.GaussianBlur(max(2, size // 14))).point(lambda v: int(v * 0.55))
        sh.putalpha(a)
        out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        out.alpha_composite(sh, (0, max(2, size // 22)))
        out.alpha_composite(layer)
        layer = out
    return layer


def word_layers(text, max_w, size, color="#FFFFFF", hl_color="#FFD600", weight="black", stroke=0,
                max_lines=4, font_path=None, upper=True, hl_box=False):
    """Para animação palavra-a-palavra: retorna [(camada, cx, cy)] relativos ao centro do bloco + altura."""
    if upper:
        text = text.upper()
    lines, f, lh = layout_words(text, max_w, size, weight, max_lines, font_path=font_path)
    total_h = lh * len(lines)
    out = []
    for i, ln in enumerate(lines):
        lw = (ln[-1][2] + ln[-1][3]) if ln else 0
        for w, hl, x, ww in ln:
            lay = render_text(("*" + w + "*") if hl else w, ww + 10 + size, size, color, hl_color, weight,
                              stroke=stroke, max_lines=1, font_path=font_path, hl_box=hl_box)
            cx = -lw / 2 + x + ww / 2
            cy = -total_h / 2 + i * lh + lh / 2
            out.append((lay, cx, cy))
    return out, total_h
