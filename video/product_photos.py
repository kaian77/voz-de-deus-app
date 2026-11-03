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
    whole = trim(cut)
    if kit:
        return [(whole, "kit")]
    pieces = split(cut)
    colors = [metal_color(p) for p in pieces]
    if len(pieces) > 1 and len(set(colors)) > 1:
        return list(zip(pieces, colors))
    return [(whole, colors[0] if len(set(colors)) == 1 else metal_color(whole))]


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
    return "dourado" if ng > ns * 0.6 and ng > a.sum() * 0.03 else "prata"


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
    """Foto do tema: cenário gerado + produto colado por cima (com sombra e reflexo) + nome no alto."""
    from PIL import Image

    canvas = bg.convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    top = 0.25 if name else 0.1
    p = fit(piece, SIZE * 0.7, SIZE * (0.9 - top))
    layer, (ox, oy) = shadowed(p, SIZE, SIZE, reflect=True)
    x = (SIZE - p.width) // 2 - ox
    y = int(SIZE * top + (SIZE * (0.92 - top) - p.height) / 2) - oy
    canvas.alpha_composite(layer, (x, y))
    if name:
        title(canvas, name, int(SIZE * 0.13))
    return canvas.convert("RGB")


# ------------------------------------------------------------------------------------------- cenário

def background(theme, seed, folder):
    """Cenário do tema sem produto (Cloudflare/Pollinations grátis, as mesmas do canal do YouTube)."""
    from PIL import Image

    prompt = (f"Product photography backdrop for jewelry, theme: {theme}. Empty soft-focus scene, "
              "a clean reflective surface in the foreground center left EMPTY for a product, "
              "decorative elements only at the edges and corners, soft natural light, shallow depth of field, "
              "high-end advertising photo, no text, no letters, no people, no products, no pins")
    path = os.path.join(folder, f"bg-{seed}.jpg")
    try:
        import youtube

        got = youtube.image(prompt, SIZE, SIZE, path, seed, style="photorealistic, 85mm lens, bokeh")
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
    http("POST", f"{URL}/storage/v1/object/media/{path}", buf.getvalue(), {"Content-Type": "image/jpeg", "x-upsert": "true"}, raw=True)
    return f"{URL}/storage/v1/object/public/media/{path}"


def queued(limit=5):
    return rest("GET", f"photo_jobs?status=eq.queued&attempts=lt.{MAX_ATTEMPTS}&order=created_at&limit={limit}&select=*") or []


def process(job, folder):
    names = job.get("names") or []
    kits = job.get("kits") or []
    sources = job.get("source_urls") or []
    bg_seed = job.get("seed") or random.randint(1, 10**6)
    bg = background(job.get("theme") or "elegant soft studio", bg_seed, folder)
    results = []
    stamp = int(time.time())
    for si, src in enumerate(sources):
        log(f"  foto {si + 1}/{len(sources)}")
        im = download(src)
        for pi, (piece, color) in enumerate(products(im, si < len(kits) and bool(kits[si]))):
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
        bg = background(theme, 7, out) if "--no-ai" not in sys.argv else gradient()
        for pi, (piece, color) in enumerate(products(Image.open(src).convert("RGBA"), "--kit" in sys.argv)):
            on_white(piece).save(os.path.join(out, f"r{pi}-{color}-branco.jpg"), quality=92)
            on_theme(piece, bg, name).save(os.path.join(out, f"r{pi}-{color}-tema.jpg"), quality=92)
            log(f"produto {pi + 1}: {color}")
        return
    if not URL or not KEY:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY")
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
