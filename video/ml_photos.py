#!/usr/bin/env python3
"""Fotos dos anúncios do Mercado Livre no padrão exigido — roda no GitHub Actions (workflow "Fotos do Mercado Livre").

O ML pausa anúncios cuja foto de capa "descumpre o tamanho mínimo, posição e proporção do produto": ele quer
1200x1200, fundo branco, produto de frente, centralizado e ocupando quase toda a foto, sem textos nem logos.

Fila: tabela ml_photos (status "queued"). Para cada foto:
- cover: recorta o fundo (rembg) e põe o pin grande e centralizado num quadrado branco de 1200x1200;
- extra: só deixa a foto quadrada (completa com branco) em 1200x1200;
- detail / angle: fotos geradas da capa quando a loja tem menos de 3 (o ML pede no mínimo 3):
  detail = close no centro do pin; angle = pin girado de lado, com sombra suave.
O resultado vai para o storage público do Studio (media/<user>/ml/...) e a linha fica "done" com result_url.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY. Uso: python3 video/ml_photos.py [--check]
"""
import datetime as dt
import hashlib
import io
import os
import random
import sys
import time
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine", "scripts"))
from worker import KEY, URL, http, rest  # noqa: E402

MAX_ATTEMPTS = 3
SIZE = 1200
FILL = 0.9  # o pin ocupa 90% do lado maior da foto


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def queued(limit=40):
    return rest("GET", f"ml_photos?status=eq.queued&attempts=lt.{MAX_ATTEMPTS}&order=created_at&limit={limit}&select=*") or []


def download(url):
    from PIL import Image, ImageOps

    req = urllib.request.Request(url, headers={"User-Agent": "BraxStudio/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        im = Image.open(io.BytesIO(r.read()))
    return ImageOps.exif_transpose(im).convert("RGBA")


def on_white(im, fill):
    """Centraliza a imagem (com transparência) num quadrado branco SIZE x SIZE, com o lado maior em fill*SIZE."""
    from PIL import Image

    k = SIZE * fill / max(im.width, im.height)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    canvas = Image.new("RGB", (SIZE, SIZE), (255, 255, 255))
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    return canvas


_SESSION = []


def cutout(im):
    """Recorte com rembg, com o modelo carregado uma vez só (sem sessão, o rembg recarrega o modelo a cada foto)."""
    from common import cutout as flat_cutout, trim

    try:
        from rembg import new_session, remove
    except ImportError:
        return flat_cutout(im, method="flat")
    if not _SESSION:
        _SESSION.append(new_session("u2net"))
    return trim(remove(im, session=_SESSION[0]))


def cover(im):
    cut = cutout(im)
    import numpy as np

    solid = float((np.asarray(cut.getchannel("A")) > 128).mean())
    # Recorte que sumiu com quase tudo (ou não tirou nada de uma foto com fundo): usa a foto inteira
    if cut.width * cut.height < 0.02 * im.width * im.height or solid < 0.15:
        print("   recorte duvidoso; usando a foto inteira", flush=True)
        return on_white(im, 1.0)
    return on_white(cut, FILL)


def detail(im):
    """Close no pin: corta o miolo do recorte (75% do lado) e amplia no branco."""
    cut = cutout(im)
    w, h = cut.size
    k = 0.75
    box = (round(w * (1 - k) / 2), round(h * (1 - k) / 2), round(w * (1 + k) / 2), round(h * (1 + k) / 2))
    return on_white(cut.crop(box), 0.96)


def angle(im):
    """Pin visto de lado: perspectiva de uns 25 graus e uma sombra suave embaixo."""
    from PIL import Image, ImageFilter

    cut = cutout(im)
    w, h = cut.size
    squeeze = 0.28  # quanto o lado de trás encolhe
    # Coeficientes da perspectiva: o lado direito fica mais baixo e estreito
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(0, 0), (w * 0.75, h * squeeze / 2), (w * 0.75, h * (1 - squeeze / 2)), (0, h)]
    coeffs = _perspective(dst, src)
    tilted = cut.transform((round(w * 0.75), h), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    shadow = Image.new("RGBA", (tilted.width, tilted.height + 60), (0, 0, 0, 0))
    alpha = tilted.getchannel("A").point(lambda a: int(a * 0.22))
    shadow.paste((0, 0, 0, 255), (18, 40), alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    shadow.alpha_composite(tilted, (0, 0))
    return on_white(shadow, 0.86)


def _perspective(pa, pb):
    import numpy as np

    m = []
    for (x, y), (u, v) in zip(pa, pb):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    a = np.array(m, dtype=float)
    b = np.array(pb, dtype=float).reshape(8)
    return np.linalg.solve(a, b).tolist()


KINDS = {"cover": cover, "detail": detail, "angle": angle}


def process(row):
    im = download(row["source_url"])
    out = KINDS.get(row["kind"], lambda i: on_white(i, 1.0))(im)
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=92)
    name = hashlib.sha1(f"{row['source_url']}|{row['kind']}".encode()).hexdigest()[:20]
    path = f"{row['user_id']}/ml/{name}.jpg"
    http("POST", f"{URL}/storage/v1/object/media/{path}", buf.getvalue(), {"Content-Type": "image/jpeg", "x-upsert": "true"}, raw=True)
    return f"{URL}/storage/v1/object/public/media/{path}"


def main():
    if not URL or not KEY:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY")
    if "--check" in sys.argv:  # o workflow pula a instalação quando a fila está vazia
        print("queued" if queued(1) else "empty")
        return
    started = time.time()
    while time.time() - started < 50 * 60:
        rows = queued()
        if not rows:
            break
        random.shuffle(rows)  # vários jobs em paralelo: cada um começa por uma foto diferente
        for row in rows:
            attempts = row["attempts"] + 1
            claimed = rest("PATCH", f"ml_photos?id=eq.{row['id']}&status=eq.queued&attempts=eq.{row['attempts']}", {"attempts": attempts})
            if not claimed:
                continue
            try:
                url = process(row)
                rest("PATCH", f"ml_photos?id=eq.{row['id']}", {"status": "done", "result_url": url, "error": None, "updated_at": now()})
                print(f"ok {row['kind']} {url}", flush=True)
            except Exception as e:  # noqa: BLE001 — registra o erro e segue
                rest("PATCH", f"ml_photos?id=eq.{row['id']}",
                     {"status": "failed" if attempts >= MAX_ATTEMPTS else "queued", "error": str(e)[:500], "updated_at": now()})
                print(f"erro {row['source_url']}: {e}", flush=True)


if __name__ == "__main__":
    main()
