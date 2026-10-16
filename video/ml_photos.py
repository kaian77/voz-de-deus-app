#!/usr/bin/env python3
"""Fotos dos anúncios do Mercado Livre no padrão exigido — roda no GitHub Actions (workflow "Fotos do Mercado Livre").

O ML pausa anúncios cuja foto de capa "descumpre o tamanho mínimo, posição e proporção do produto": ele quer
1200x1200, fundo branco, produto de frente, centralizado e ocupando quase toda a foto, sem textos nem logos.

Fila: tabela ml_photos (status "queued"). Para cada foto:
- cover: recorta o fundo (rembg) e põe o pin grande e centralizado num quadrado branco de 1200x1200;
- extra: só deixa a foto quadrada (completa com branco) em 1200x1200.
O resultado vai para o storage público do Studio (media/<user>/ml/...) e a linha fica "done" com result_url.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY. Uso: python3 video/ml_photos.py [--check]
"""
import datetime as dt
import hashlib
import io
import os
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


def cover(im):
    from common import cutout  # recorte com rembg (cai para fundo liso se faltar)

    cut = cutout(im, method="auto")
    import numpy as np

    solid = float((np.asarray(cut.getchannel("A")) > 128).mean())
    # Recorte que sumiu com quase tudo (ou não tirou nada de uma foto com fundo): usa a foto inteira
    if cut.width * cut.height < 0.02 * im.width * im.height or solid < 0.15:
        print("   recorte duvidoso; usando a foto inteira", flush=True)
        return on_white(im, 1.0)
    return on_white(cut, FILL)


def process(row):
    im = download(row["source_url"])
    out = cover(im) if row["kind"] == "cover" else on_white(im, 1.0)
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
