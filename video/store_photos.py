#!/usr/bin/env python3
"""Fotos temáticas dos produtos que já estão na loja (fila store_photo_jobs) — roda no GitHub Actions
(workflow store-photos.yml). Para cada produto: baixa a foto atual do site, recorta o produto (rembg, sem redesenhar),
a IA (Claude) escreve a cena pelo nome/tema do produto e a fal.ai (Bria Product Shot) monta o cenário em volta.
Resultado em media/<user>/loja-tema/ e a linha fica "ready" para o dono aprovar no Studio.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, FAL_KEY, ANTHROPIC_API_KEY. Uso: python3 video/store_photos.py [--check]
"""
import datetime as dt
import os
import random
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "engine", "scripts"))
import product_photos as pp  # noqa: E402
from worker import KEY, URL, rest  # noqa: E402

MAX_ATTEMPTS = 3


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def queued(limit=10):
    return rest("GET", f"store_photo_jobs?status=eq.queued&attempts=lt.{MAX_ATTEMPTS}&order=created_at&limit={limit}&select=*") or []


def white_background(im):
    """Capa de fundo branco (as que o dono quer trocar): a moldura da foto (borda de 6%) é quase toda branca/clara."""
    import numpy as np

    a = np.asarray(im.convert("RGB")).astype(float)
    h, w = a.shape[:2]
    b = max(4, int(min(h, w) * 0.06))
    frame = np.concatenate([a[:b].reshape(-1, 3), a[-b:].reshape(-1, 3), a[:, :b].reshape(-1, 3), a[:, -b:].reshape(-1, 3)])
    light = (frame.min(axis=1) > 215) & (frame.max(axis=1) - frame.min(axis=1) < 30)
    return light.mean() > 0.85


def main():
    if not URL or not KEY:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY")
    if "--check" in sys.argv:
        print("queued" if queued(1) else "empty")
        return
    if not os.environ.get("FAL_KEY"):
        sys.exit("Falta o secret FAL_KEY (fal.ai)")
    started = time.time()
    with tempfile.TemporaryDirectory() as folder:
        while time.time() - started < 45 * 60:
            rows = queued()
            if not rows:
                break
            random.shuffle(rows)  # vários jobs em paralelo: cada um começa por um produto diferente
            for row in rows:
                claimed = rest("PATCH", f"store_photo_jobs?id=eq.{row['id']}&status=eq.queued",
                               {"status": "processing", "attempts": row["attempts"] + 1, "updated_at": now()})
                if not claimed:
                    continue
                pp.log(f"▶ {row['name']}")
                try:
                    im = pp.download(row["source_url"])
                    if row.get("auto_apply") and not white_background(im):
                        # pedido "trocar todas as de fundo branco": esta capa já tem cenário, não gasta crédito
                        rest("PATCH", f"store_photo_jobs?id=eq.{row['id']}", {"status": "skipped", "error": None, "updated_at": now()})
                        pp.log("   capa já tem cenário: pulei")
                        continue
                    piece = pp.products(im, kit=True)[0][0]  # a foto inteira do produto (kit fica junto)
                    theme = row.get("theme") or row.get("name") or "produto"
                    scene = pp.scene_prompt(theme, piece)
                    shot = pp.fal_shot(piece, scene)
                    if shot is None:
                        raise RuntimeError("a fal.ai não devolveu a foto (confira o crédito em fal.ai/dashboard/billing)")
                    path = f"{row['user_id']}/loja-tema/{row['product_id']}-{int(time.time())}.jpg"
                    url = pp.upload(shot, path)
                    rest("PATCH", f"store_photo_jobs?id=eq.{row['id']}", {"status": "ready", "result_url": url, "error": None, "updated_at": now()})
                    pp.log(f"   ok {url}")
                except Exception as e:  # noqa: BLE001
                    last = row["attempts"] + 1 >= MAX_ATTEMPTS
                    rest("PATCH", f"store_photo_jobs?id=eq.{row['id']}",
                         {"status": "failed" if last else "queued", "error": str(e)[:400], "updated_at": now()})
                    pp.log(f"   erro: {e}")
    if queued(1):
        print("restam produtos na fila", flush=True)


if __name__ == "__main__":
    main()
