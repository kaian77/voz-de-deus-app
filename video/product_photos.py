#!/usr/bin/env python3
"""Fotos de produto (Studio → Loja → Fotos de produto) — roda no GitHub Actions (workflow "Fotos de produto").

O dono sobe várias fotos de uma vez com um tema. Para cada foto:
- recorta o fundo (rembg) SEM redesenhar o produto (os pixels do pin são os da foto original);
- separa os produtos da foto só quando são o mesmo produto em cores diferentes (prata e dourado); vários da
  mesma cor, ou a foto marcada como Kit, ficam juntos numa foto só;
- faz 2 fotos de cada produto: fundo branco (1200x1200, padrão de loja) e fundo do tema (cenário gerado por IA
  grátis, sem produto, com o pin colado por cima com sombra e reflexo; nome em cima, se houver).
O cenário é gerado uma vez por lote (todas as fotos do lote combinam) e reaproveitado.

Fila: tabela photo_jobs (status "queued"). Resultado em photo_jobs.results:
  [{source, index, color: "prata"|"dourado"|"kit", name, white_url, theme_url}]

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY (opcionais: CF_ACCOUNT_ID, CF_API_TOKEN, POLLINATIONS_TOKEN).
Uso: python3 video/product_photos.py [--check] | --local <foto> <tema> [nome]  (teste sem banco)
"""
import datetime as dt
import io
import os
import random
import sys
import tempfile
import time
import urllib.request
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "engine", "scripts"))
from worker import KEY, URL, http, rest  # noqa: E402

SIZE = 1200
MAX_ATTEMPTS = 3
FONT = os.path.join(HERE, "engine", "assets", "fonts", "PlayfairDisplay-Italic.ttf")
INK = (22, 30, 74)  # azul-marinho do título
GOLD = (196, 152, 64)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def log(msg):
    print(msg, flush=True)


# ------------------------------------------------------------------------------------------- recorte

def download(url):
    from PIL import Image, ImageOps

    req = urllib.request.Request(url, headers={"User-Agent": "BraxStudio/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        im = Image.open(io.BytesIO(r.read()))
    return ImageOps.exif_transpose(im).convert("RGBA")


_SESSION = []


def cutout(im):
    """Fundo removido (máscara do rembg); os pixels de cor do produto continuam os da foto."""
    from rembg import new_session, remove

    if not _SESSION:
        _SESSION.append(new_session("u2net"))
    mask = remove(im, session=_SESSION[0], only_mask=True)
    out = im.copy()
    out.putalpha(mask.convert("L"))
    return out


def components(alpha, min_share=0.12):
    """Caixas de cada objeto separado na máscara (grade reduzida para ser rápido). Ignora pedacinhos soltos."""
    import numpy as np

    k = max(1, max(alpha.shape) // 320)
    small = alpha[::k, ::k] > 128
    h, w = small.shape
    label = np.zeros((h, w), dtype=np.int32)
    boxes = []
    n = 0
    for y0 in range(h):
        for x0 in range(w):
            if not small[y0, x0] or label[y0, x0]:
                continue
            n += 1
            label[y0, x0] = n
            q = deque([(y0, x0)])
            area, x1, y1, x2, y2 = 0, x0, y0, x0, y0
            while q:
                y, x = q.popleft()
                area += 1
                x1, x2, y1, y2 = min(x1, x), max(x2, x), min(y1, y), max(y2, y)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = n
                        q.append((ny, nx))
            boxes.append((area, n, (x1 * k, y1 * k, (x2 + 1) * k, (y2 + 1) * k)))
    if not boxes:
        return [], label, k
    biggest = max(b[0] for b in boxes)
    keep = [b for b in boxes if b[0] >= biggest * min_share]
    keep.sort(key=lambda b: (b[2][0] + b[2][2]) / 2)  # da esquerda para a direita
    return keep, label, k


def split(cut):
    """Um recorte RGBA por produto da foto (só os pixels daquele objeto)."""
    import numpy as np
    from PIL import Image

    a = np.asarray(cut.getchannel("A"))
    keep, label, k = components(a)
    if len(keep) <= 1:
        return [trim(cut)]
    full = np.kron(label, np.ones((k, k), dtype=np.int32))[: a.shape[0], : a.shape[1]]
    pad = np.zeros_like(a, dtype=np.int32)
    pad[: full.shape[0], : full.shape[1]] = full
    out = []
    for _, n, (x1, y1, x2, y2) in keep:
        m = (pad == n)
        # a grade reduzida perde a borda fina: engorda a máscara um pouco e usa o alfa original dentro dela
        mm = Image.fromarray((m * 255).astype("uint8")).filter(_max_filter(k * 2 + 1))
        alpha = np.minimum(a, np.asarray(mm))
        piece = cut.copy()
        piece.putalpha(Image.fromarray(alpha.astype("uint8")))
        out.append(trim(piece))
    return out


def _max_filter(size):
    from PIL import ImageFilter

    return ImageFilter.MaxFilter(size if size % 2 else size + 1)


def trim(im, pad=6):
    bbox = im.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))


def products(im, kit=False):
    """[(recorte, cor)] da foto. Kit = tudo junto numa foto só. Sem marcar kit, só separa quando são cores
    diferentes (o mesmo produto em prata e dourado); vários da mesma cor ficam juntos (é um kit)."""
    cut = cutout(im)
    box = backing_box(cut)
    if box:  # pins presos num cartão: o recorte pegou o cartão; recorta de novo só a área dos pins
        log("   cartão atrás dos pins: recortando de novo só os pins")
        cut = cutout(im.crop(box))
    whole = trim(cut)
    if kit:
        return [(whole, "kit")]
    pieces = split(cut)
    if len(pieces) > 1:
        # compara as peças entre si: dourado claro (champanhe) não passa no teste absoluto, mas é bem mais
        # "quente" que o prata ao lado
        w = [warmth(p) for p in pieces]
        if max(w) - min(w) > 0.08:
            mid = (max(w) + min(w)) / 2
            return [(p, "dourado" if x > mid else "prata") for p, x in zip(pieces, w)]
        colors = [metal_color(p) for p in pieces]
        if len(set(colors)) > 1:
            return list(zip(pieces, colors))
    halves = split_by_color(whole) or split_touching(whole)
    if halves:
        return halves
    return [(whole, metal_color(whole))]


def backing_box(cut):
    """Foto de pins presos num cartão/papel: o rembg recorta o cartão inteiro. Se a maior parte do recorte é uma cor
    lisa só (o cartão) e o que destoa dela (os pins) ocupa uma área pequena, devolve a caixa dos pins na foto."""
    import numpy as np
    from PIL import Image, ImageFilter

    a = np.asarray(cut.getchannel("A")) > 128
    if a.mean() < 0.2:
        return None
    rgb = np.asarray(cut.convert("RGB")).astype(float)
    med = np.median(rgb[a], axis=0)
    d = np.sqrt(((rgb - med) ** 2).sum(-1))
    if (d[a] < 35).mean() < 0.4:
        return None
    m = Image.fromarray(((a & (d >= 42)) * 255).astype("uint8")).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    keep, _, _ = components(np.asarray(m), min_share=0.15)
    h, w = a.shape
    keep = [b for b in keep if b[2][0] > 2 and b[2][1] > 2 and b[2][2] < w - 3 and b[2][3] < h - 3]  # borda do cartão/sombra
    if not keep:
        return None
    x1, y1 = min(b[2][0] for b in keep), min(b[2][1] for b in keep)
    x2, y2 = max(b[2][2] for b in keep), max(b[2][3] for b in keep)
    ys, xs = np.nonzero(a)
    cut_area = (xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1)
    if (x2 - x1) * (y2 - y1) > cut_area * 0.55:  # o "destoante" é quase tudo: é o próprio produto, não um cartão
        return None
    pad = int(max(x2 - x1, y2 - y1) * 0.08)
    return (max(0, x1 - pad), max(0, y1 - pad), min(w, x2 + pad), min(h, y2 + pad))


def split_by_color(piece):
    """Pin prata e pin dourado encostados/sobrepostos: separa ponto a ponto pela cor (dourado = mais quente e mais
    claro), limpa os filetes de brilho e fica com a maior parte de cada cor. None se não forem dois pins."""
    import numpy as np
    from PIL import Image, ImageFilter

    alpha0 = np.asarray(piece.getchannel("A"))
    a = alpha0 > 128
    if a.sum() < 500:
        return None
    rgb = np.asarray(piece.convert("RGB")).astype(float) / 255
    feat = (rgb[..., 0] - rgb[..., 2]) + 0.5 * rgb.mean(-1)
    k = max(3, int(max(piece.size) * 0.012)) | 1
    blur = lambda x: np.asarray(Image.fromarray((x * 255).clip(0, 255).astype("uint8")).filter(ImageFilter.BoxBlur(k))).astype(float) / 255
    den = blur(a.astype(float))
    sw = np.where(den > 0.05, (blur(feat * a * 0.5 + 0.25) - 0.25 * den) / np.maximum(den, 1e-3) * 2, 0)
    v = sw[a]
    c1, c2 = np.percentile(v, 15), np.percentile(v, 85)
    for _ in range(20):
        t = (c1 + c2) / 2
        lo, hi = v[v <= t], v[v > t]
        if not len(lo) or not len(hi):
            return None
        c1, c2 = lo.mean(), hi.mean()
    t = (c1 + c2) / 2
    hot = a & (sw > t)
    share = hot.sum() / a.sum()
    if c2 - c1 < 0.12 or not 0.2 < share < 0.8:
        return None
    o = max(3, int(max(piece.size) * 0.009)) | 1  # some com o filete de brilho de um pin que encosta no outro
    parts, boxes = [], []
    for mask, color in ((a & ~hot, "prata"), (hot, "dourado")):
        m = Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.MinFilter(o)).filter(ImageFilter.MaxFilter(o))
        keep, label, kk = components(np.asarray(m), min_share=0.5)
        if not keep:
            return None
        big = max(keep, key=lambda b: b[0])
        full = np.kron(label == big[1], np.ones((kk, kk), dtype=bool))[: a.shape[0], : a.shape[1]]
        sel = np.zeros_like(a)
        sel[: full.shape[0], : full.shape[1]] = full
        grown = np.asarray(Image.fromarray((sel * 255).astype("uint8")).filter(ImageFilter.MaxFilter(kk * 2 + 1))) > 0
        p = piece.copy()
        p.putalpha(Image.fromarray(np.where(grown, alpha0, 0).astype("uint8")))
        bb = Image.fromarray((grown & a).astype("uint8") * 255).getbbox()
        if not bb:
            return None
        boxes.append(bb)
        parts.append((trim(p), color))
    # cada parte tem que ser um pin de verdade (não um detalhe dourado de um pin só): tamanho parecido e separados
    area = lambda b: (b[2] - b[0]) * (b[3] - b[1])
    if min(area(b) for b in boxes) < 0.35 * max(area(b) for b in boxes):
        return None
    cx = [(b[0] + b[2]) / 2 for b in boxes]
    cy = [(b[1] + b[3]) / 2 for b in boxes]
    if max(abs(cx[0] - cx[1]) / piece.width, abs(cy[0] - cy[1]) / piece.height) < 0.2:
        return None
    return parts


def split_touching(piece):
    """Dois pins encostados viram uma peça só no recorte. Se a peça é larga, corta na coluna mais "fina" do meio
    e, se um lado é bem mais quente (dourado) que o outro, devolve os dois lados."""
    import numpy as np

    if piece.width < piece.height * 1.25:
        return None
    a = np.asarray(piece.getchannel("A")) > 128
    cols = a.sum(0).astype(float)
    lo, hi = int(piece.width * 0.3), int(piece.width * 0.7)
    cut = lo + int(np.argmin(cols[lo:hi]))
    if cols[cut] > a.shape[0] * 0.45:  # o meio é cheio: é uma peça larga só, não dois pins
        return None
    left, right = trim(piece.crop((0, 0, cut, piece.height))), trim(piece.crop((cut, 0, piece.width, piece.height)))
    wl, wr = warmth(left), warmth(right)
    if abs(wl - wr) <= 0.08:
        return None
    return [(left, "dourado" if wl > wr else "prata"), (right, "dourado" if wr > wl else "prata")]


def warmth(piece):
    """Média de (vermelho - azul) no produto: positivo = dourado/quente, negativo = prata/frio."""
    import numpy as np

    rgb = np.asarray(piece.convert("RGB")).astype(float) / 255
    a = np.asarray(piece.getchannel("A")) > 200
    if not a.any():
        return 0.0
    return float((rgb[..., 0][a] - rgb[..., 2][a]).mean())


def metal_color(piece):
    """'dourado' ou 'prata' pelo brilho do metal: pixels quentes e saturados (dourado) × cinza metálico (prata)."""
    import numpy as np

    rgb = np.asarray(piece.convert("RGB")).astype(float) / 255
    a = np.asarray(piece.getchannel("A")) > 200
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # tom (graus) só onde há cor
    hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
    gold = a & (sat > 0.28) & (mx > 0.35) & (hue > 28) & (hue < 62) & (r > b + 0.12)
    silver = a & (sat < 0.12) & (mx > 0.3) & (mx < 0.93)  # cinza do metal (sem o branco do esmalte)
    ng, ns = int(gold.sum()), int(silver.sum())
    if ng > ns * 0.6 and ng > a.sum() * 0.03:
        return "dourado"
    return "dourado" if warmth(piece) > 0.07 else "prata"


# ------------------------------------------------------------------------------------------- montagem

def shadowed(piece, w, h, reflect=True):
    """Produto com sombra suave embaixo e (opcional) reflexo apagado, numa camada RGBA."""
    from PIL import Image, ImageDraw, ImageFilter

    pw, ph = piece.size
    extra = int(ph * (0.45 if reflect else 0.18))
    layer = Image.new("RGBA", (pw + 80, ph + extra + 40), (0, 0, 0, 0))
    ox, oy = 40, 10
    # sombra de contato: elipse borrada embaixo
    sh = Image.new("L", layer.size, 0)
    ImageDraw.Draw(sh).ellipse((ox + pw * 0.12, oy + ph - ph * 0.05, ox + pw * 0.88, oy + ph + ph * 0.07), fill=120)
    sh = sh.filter(ImageFilter.GaussianBlur(max(6, ph // 40)))
    # sombra do próprio recorte, deslocada
    drop = Image.new("L", layer.size, 0)
    drop.paste(piece.getchannel("A").point(lambda v: int(v * 0.35)), (ox + pw // 40, oy + ph // 30))
    drop = drop.filter(ImageFilter.GaussianBlur(max(8, ph // 30)))
    shadow = Image.new("RGBA", layer.size, (20, 20, 30, 0))
    shadow.putalpha(Image.fromarray(__import__("numpy").maximum(__import__("numpy").asarray(sh), __import__("numpy").asarray(drop))))
    layer.alpha_composite(shadow)
    if reflect:
        import numpy as np

        ref = piece.transpose(Image.FLIP_TOP_BOTTOM)
        fade = np.linspace(0.32, 0, ref.height)[:, None] ** 1.4
        ra = (np.asarray(ref.getchannel("A")).astype(float) * fade).astype("uint8")
        ref.putalpha(Image.fromarray(ra))
        ref = ref.filter(ImageFilter.GaussianBlur(2))
        layer.alpha_composite(ref, (ox, oy + ph + 2))
    layer.alpha_composite(piece, (ox, oy))
    return layer, (ox, oy)


def fit(piece, max_w, max_h):
    from PIL import Image

    k = min(max_w / piece.width, max_h / piece.height)
    return piece.resize((max(1, round(piece.width * k)), max(1, round(piece.height * k))), Image.LANCZOS)


def on_white(piece):
    """Foto de loja: fundo branco puro, produto centralizado (~80%), sombra leve de contato."""
    from PIL import Image

    p = fit(piece, SIZE * 0.78, SIZE * 0.78)
    layer, (ox, oy) = shadowed(p, SIZE, SIZE, reflect=False)
    canvas = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 255))
    x = (SIZE - p.width) // 2 - ox
    y = (SIZE - p.height) // 2 - oy
    canvas.alpha_composite(layer, (x, y))
    return canvas.convert("RGB")


def title(canvas, text, cy):
    """Nome em cima do produto, itálico serifado com um enfeite dourado (estilo das fotos do ChatGPT)."""
    from PIL import ImageDraw, ImageFont

    d = ImageDraw.Draw(canvas)
    size = 92
    while size > 40:
        f = ImageFont.truetype(FONT, size)
        try:
            f.set_variation_by_name("SemiBold Italic")
        except Exception:
            pass
        bw = d.textbbox((0, 0), text, font=f)[2]
        if bw < SIZE * 0.84:
            break
        size -= 4
    box = d.textbbox((SIZE / 2, cy), text, font=f, anchor="mm")
    # brilho claro atrás para ler em qualquer cenário
    from PIL import Image, ImageFilter

    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.text((SIZE / 2, cy), text, font=f, anchor="mm", fill=(255, 255, 255, 150), stroke_width=8, stroke_fill=(255, 255, 255, 150))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(canvas)
    d.text((SIZE / 2, cy), text, font=f, anchor="mm", fill=INK + (255,))
    # linhas douradas com um losango no meio, acima do nome
    y = box[1] - 26
    half = min(220, (box[2] - box[0]) / 2 + 30)
    d.line((SIZE / 2 - half, y, SIZE / 2 - 18, y), fill=GOLD + (255,), width=3)
    d.line((SIZE / 2 + 18, y, SIZE / 2 + half, y), fill=GOLD + (255,), width=3)
    d.polygon([(SIZE / 2, y - 11), (SIZE / 2 + 9, y), (SIZE / 2, y + 11), (SIZE / 2 - 9, y)], fill=GOLD + (255,))


def on_theme(piece, bg, name=None):
    """Foto do tema no estilo "produto herói" (referência do dono: pin do SAMU na frente da ambulância):
    pin grande e nítido em pé na frente, cenário bem desfocado atrás, chão claro e brilhante com o reflexo do pin,
    luz/cor do cenário puxada para o pin (light wrap) e sombra de contato. Nome opcional no alto."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter

    S = SIZE
    base = bg.convert("RGB").resize((S, S), Image.LANCZOS)
    # profundidade de campo: o cenário fica bem desfocado (o pin é a única coisa nítida)
    canvas = base.filter(ImageFilter.GaussianBlur(9)).convert("RGBA")
    floor_y = int(S * 0.80)  # onde o pin "pisa"
    # chão claro e brilhante: degradê suave do horizonte para baixo
    floor = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fa = np.zeros((S, S), dtype=np.uint8)
    ramp = np.clip((np.arange(S) - (floor_y - S * 0.10)) / (S * 0.22), 0, 1) * 150
    fa[:, :] = ramp[:, None].astype(np.uint8)
    tone = np.asarray(base.resize((1, 1))).reshape(3)
    floor_rgb = (tone * 0.15 + np.array([246, 246, 248]) * 0.85).astype(int)
    floor.paste(tuple(floor_rgb) + (255,), (0, 0, S, S), Image.fromarray(fa))
    canvas.alpha_composite(floor)

    top = 0.2 if name else 0.07
    p = fit(piece, S * 0.62, (floor_y - S * top) * 0.86)
    x = (S - p.width) // 2
    y = floor_y - p.height
    # cor do cenário um pouco por cima do pin (sem mudar o desenho) + brilho nas bordas vindo do cenário
    rgb = np.asarray(p.convert("RGB")).astype(float)
    a = np.asarray(p.getchannel("A")).astype(float) / 255
    env = np.asarray(canvas.convert("RGB").crop((x, y, x + p.width, y + p.height)).filter(ImageFilter.GaussianBlur(30))).astype(float)
    rgb = rgb * 0.94 + env * 0.06
    edge = np.asarray(p.getchannel("A").filter(ImageFilter.GaussianBlur(6))).astype(float) / 255
    wrap = np.clip((1 - edge) * a, 0, 1)[..., None] * 0.35  # só a beirada do pin pega a luz do cenário
    rgb = rgb * (1 - wrap) + env * wrap
    lit = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    lit.putalpha(p.getchannel("A"))

    # reflexo no chão (mais forte perto do pin, some para baixo) e sombra de contato
    ref = lit.transpose(Image.FLIP_TOP_BOTTOM)
    fade = (np.linspace(0.42, 0, ref.height) ** 1.6)[:, None]
    ref.putalpha(Image.fromarray((np.asarray(ref.getchannel("A")).astype(float) * fade).astype(np.uint8)))
    canvas.alpha_composite(ref.filter(ImageFilter.GaussianBlur(3)), (x, floor_y + 2))
    sh = Image.new("L", (S, S), 0)
    ImageDraw.Draw(sh).ellipse((x + p.width * 0.18, floor_y - p.height * 0.015, x + p.width * 0.82, floor_y + p.height * 0.035), fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(max(5, p.height // 50)))
    shadow = Image.new("RGBA", (S, S), (25, 25, 30, 0))
    shadow.putalpha(sh)
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(lit, (x, y))
    if name:
        title(canvas, name, int(S * 0.1))
    return canvas.convert("RGB")


# ------------------------------------------------------------------------------------------- cenário

def scene_prompt(theme, sample=None):
    """A IA (Claude) transforma o tema do dono (em português, curto) numa cena de fundo em inglês, no estilo da
    foto de referência: objetos do tema atrás e nos cantos, centro vazio, chão claro e brilhante. Sem chave = texto fixo."""
    fixed = (f"Professional product photography background, theme: {theme}. Themed objects and scenery related to "
             f"{theme} in the far background and at the left and right edges, the center foreground EMPTY, glossy light "
             "reflective table surface, soft studio light, shallow depth of field, bokeh")
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key or not theme:
        return fixed
    import base64
    import json

    content = []
    if sample is not None:
        buf = io.BytesIO()
        sample.convert("RGB").resize((384, 384)).save(buf, "JPEG", quality=80)
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(buf.getvalue()).decode()}})
    content.append({"type": "text", "text": (
        "You write prompts for an AI image generator. Write ONE English prompt (max 70 words) for the BACKGROUND of a "
        "product photo of an enamel pin (shown in the image, it will be pasted later in the center, so do NOT include it). "
        f"Theme from the shop owner (Portuguese): \"{theme}\". Style reference: a pin standing on a glossy white table, "
        "behind it a blurred themed scene (e.g. theme SAMU: a white ambulance with red stripes on the left, a red star of life "
        "on the wall at right, a stethoscope in the bottom-left corner, a red rescue bag in the bottom-right corner). "
        "Pick 3-4 concrete, recognizable objects of the theme, place them at the far background and the corners, keep the "
        "center empty, match colors that suit the pin, bright clean light, shallow depth of field, photorealistic. "
        "No text, no letters, no logos, no people. Reply with the prompt only.")})
    body = json.dumps({"model": os.environ.get("CLAUDE_MODEL") or "claude-opus-5-5", "max_tokens": 300,
                       "messages": [{"role": "user", "content": content}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST", headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read())
        try:
            u = data.get("usage") or {}
            rest("POST", "ai_usage", {"source": "fotos-de-produto", "model": data.get("model"),
                                      "input_tokens": u.get("input_tokens") or 0, "output_tokens": u.get("output_tokens") or 0})
        except Exception:  # noqa: BLE001
            pass
        text = " ".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        if text:
            log(f"   cena: {text[:200]}")
            return text
    except Exception as e:  # noqa: BLE001
        log(f"   cena pela IA falhou ({e}); usando o texto fixo")
    return fixed


def background(theme, seed, folder, sample=None):
    """Cenário do tema sem produto (Cloudflare/Pollinations grátis, as mesmas do canal do YouTube)."""
    from PIL import Image

    prompt = scene_prompt(theme, sample)
    path = os.path.join(folder, f"bg-{seed}.jpg")
    try:
        import youtube

        got = youtube.image(prompt, SIZE, SIZE, path, seed, style="photorealistic commercial product photography, 85mm lens, soft bokeh, no text")
    except Exception as e:  # noqa: BLE001
        log(f"   cenário: {e}")
        got = None
    if got:
        log(f"   cenário por {got}")
        return Image.open(path).convert("RGB")
    log("   sem IA de imagem agora: cenário em degradê")
    return gradient()


def gradient():
    import numpy as np
    from PIL import Image

    y = np.linspace(0, 1, SIZE)[:, None, None]
    top, bottom = np.array([236, 232, 244]), np.array([250, 246, 238])
    arr = top * (1 - y) + bottom * y
    return Image.fromarray(np.repeat(arr, SIZE, axis=1).astype("uint8"))


# ------------------------------------------------------------------------------------------- fila

def upload(im, path):
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=92)
    for attempt in range(4):  # o storage às vezes dá 504: tenta de novo só esta foto, não o lote inteiro
        try:
            http("POST", f"{URL}/storage/v1/object/media/{path}", buf.getvalue(), {"Content-Type": "image/jpeg", "x-upsert": "true"}, raw=True)
            break
        except RuntimeError as e:
            if attempt == 3 or not any(c in str(e) for c in ("-> 5", "timed out")):
                raise
            log(f"   envio falhou ({str(e)[:60]}), tentando de novo")
            time.sleep(5 * (attempt + 1))
    return f"{URL}/storage/v1/object/public/media/{path}"


def queued(limit=5):
    return rest("GET", f"photo_jobs?status=eq.queued&attempts=lt.{MAX_ATTEMPTS}&order=created_at&limit={limit}&select=*") or []


def process(job, folder, only=None):
    names = job.get("names") or []
    kits = job.get("kits") or []
    sources = job.get("source_urls") or []
    bg_seed = job.get("seed") or random.randint(1, 10**6)
    bg = None
    results = []
    stamp = int(time.time())
    for si, src in enumerate(sources):
        if only is not None and si not in only:
            continue
        log(f"  foto {si + 1}/{len(sources)}")
        im = download(src)
        for pi, (piece, color) in enumerate(products(im, si < len(kits) and bool(kits[si]))):
            if bg is None:  # um cenário por lote, escrito vendo o 1º produto
                bg = background(job.get("theme") or "elegant soft studio", bg_seed, folder, piece)
            name = (names[si] if si < len(names) else "") or None
            base = f"{job['user_id']}/fotos/{job['id']}/{si}-{pi}-{stamp}"
            results.append({
                "source": si, "index": pi, "color": color, "name": name,
                "white_url": upload(on_white(piece), base + "-branco.jpg"),
                "theme_url": upload(on_theme(piece, bg, name), base + "-tema.jpg"),
            })
            log(f"    produto {pi + 1}: {color}")
    return results, bg_seed


def main():
    if "--local" in sys.argv:
        i = sys.argv.index("--local")
        src, theme = sys.argv[i + 1], sys.argv[i + 2]
        name = sys.argv[i + 3] if len(sys.argv) > i + 3 else None
        from PIL import Image

        out = os.path.dirname(os.path.abspath(src))
        tag = os.path.splitext(os.path.basename(src))[0]
        bg = None
        for pi, (piece, color) in enumerate(products(Image.open(src).convert("RGBA"), "--kit" in sys.argv)):
            if bg is None:
                bg = gradient() if "--no-ai" in sys.argv else background(theme, random.randint(1, 10**6), out, piece)
            on_white(piece).save(os.path.join(out, f"{tag}-r{pi}-{color}-branco.jpg"), quality=92)
            on_theme(piece, bg, name or None).save(os.path.join(out, f"{tag}-r{pi}-{color}-tema.jpg"), quality=92)
            log(f"produto {pi + 1}: {color}")
        return
    if not URL or not KEY:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY")
    if "--job" in sys.argv:  # refaz só algumas fotos de um lote: --job <id> --sources 11,3 [--theme "tema"]
        arg = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
        job = (rest("GET", f"photo_jobs?id=eq.{arg('--job')}&select=*") or [None])[0]
        if not job:
            sys.exit("lote não encontrado")
        only = {int(x) for x in (arg("--sources") or "").split(",") if x.strip()}
        if arg("--theme"):
            job["theme"] = arg("--theme")
        keep = [r for r in (job.get("results") or []) if r["source"] not in only]
        with tempfile.TemporaryDirectory() as folder:
            new, _ = process({**job, "source_urls": job["source_urls"]}, folder, only)
        # as fotos refeitas ficam sem rascunho: o próximo "cadastrar" troca o produto antigo delas
        results = sorted(keep + new, key=lambda r: (r["source"], r["index"]))
        rest("PATCH", f"photo_jobs?id=eq.{job['id']}", {"results": results, "updated_at": now()})
        log(f"refeitas: {sorted(only)} → {len(new)} produto(s)")
        return
    if "--check" in sys.argv:
        print("queued" if queued(1) else "empty")
        return
    started = time.time()
    with tempfile.TemporaryDirectory() as folder:
        while time.time() - started < 45 * 60:
            jobs = queued()
            if not jobs:
                break
            for job in jobs:
                claimed = rest("PATCH", f"photo_jobs?id=eq.{job['id']}&status=eq.queued",
                               {"status": "processing", "attempts": job["attempts"] + 1, "error": None, "updated_at": now()})
                if not claimed:
                    continue
                log(f"▶ lote {job['id']} ({len(job.get('source_urls') or [])} fotos, tema: {job.get('theme')})")
                try:
                    results, seed = process(job, folder)
                    rest("PATCH", f"photo_jobs?id=eq.{job['id']}",
                         {"status": "ready", "results": results, "seed": seed, "error": None, "updated_at": now()})
                    n = len(results)
                    rest("POST", "notifications", {"user_id": job["user_id"], "title": "Fotos prontas",
                                                   "body": f"📸 {n} produto(s) com fundo branco e do tema", "url": "/studio/fotos"})
                except Exception as e:  # noqa: BLE001
                    last = job["attempts"] + 1 >= MAX_ATTEMPTS
                    rest("PATCH", f"photo_jobs?id=eq.{job['id']}",
                         {"status": "failed" if last else "queued", "error": str(e)[:500], "updated_at": now()})
                    log(f"  erro: {e}")


if __name__ == "__main__":
    main()
