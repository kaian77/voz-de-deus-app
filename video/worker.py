#!/usr/bin/env python3
"""Renderiza os vídeos de produto da fila (tabela product_videos) — roda no GitHub Actions.

Fluxo: o Studio enfileira o vídeo (status "queued") com o roteiro escrito pela IA (campo brief);
este script baixa a foto, monta o briefing do motor de vídeo (video/engine/scripts/ad.py), renderiza o MP4
vertical, envia para o storage público do Studio e marca "rendered". O cron do Studio cria o post depois.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY. Uso: python3 video/worker.py [--check]
"""
import datetime as dt
import io
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request


HERE = os.path.dirname(os.path.abspath(__file__))
AD = os.path.join(HERE, "engine", "scripts", "ad.py")
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
MAX_ATTEMPTS = 3
BATCH = 6

# Cores da marca Brax Pins Mania (vermelho, preto e dourado); o brief pode trazer as de um tema (ex.: Outubro Rosa)
COLORS = {"primary": "#E3262E", "secondary": "#111111", "accent": "#FFC72C", "text": "#FFFFFF"}


def http(method, url, body=None, headers=None, raw=False):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")
    if not raw:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            out = r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url.split('?')[0]} -> {e.code}: {e.read()[:300].decode(errors='replace')}") from None
    if raw:
        return out
    return json.loads(out) if out else None


def rest(method, path, body=None):
    return http(method, f"{URL}/rest/v1/{path}", body, {"Prefer": "return=representation"})


def queued():
    return rest("GET", f"product_videos?status=eq.queued&attempts=lt.{MAX_ATTEMPTS}&order=created_at&limit={BATCH}&select=*") or []


def requeue_stuck():
    """Renderização interrompida (ex.: job cancelado) volta para a fila depois de 1 hora."""
    limit = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)).isoformat()
    rest("PATCH", f"product_videos?status=eq.rendering&updated_at=lt.{urllib.parse.quote(limit)}", {"status": "queued"})


def download_photo(url, path):
    from PIL import Image  # só no render (o --check roda sem dependências)

    req = urllib.request.Request(url, headers={"User-Agent": "BraxStudio/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        im = Image.open(io.BytesIO(r.read()))
    im.convert("RGB").save(path, quality=95)


def briefing(brief, name, handle):
    colors = {**COLORS, **{k: v for k, v in (brief.get("colors") or {}).items() if isinstance(v, str) and v.startswith("#")}}
    features = [f for f in (brief.get("features") or []) if f][:3]
    scenes = [
        {"type": "hook", "text": brief.get("hook") or f"Chegou *{name}*", "sub": brief.get("hook_sub") or "", "transition": "fade"},
    ]
    # Vista explodida: a tinta, o metal e a tarraxa se separam em 3D e se juntam com impacto
    if brief.get("layers", True):
        scenes.append({"type": "layers", "title": brief.get("layers_title") or "Por dentro do *pin*",
                       "subtitle": brief.get("detail_title") or "", "transition": "whip"})
    scenes.append({"type": "product", "title": brief.get("title") or name, "subtitle": brief.get("subtitle") or "",
                   "badge": brief.get("badge") or "NOVO", "transition": "zoom"})
    if not brief.get("layers", True):
        scenes.append({"type": "product", "image": "photo.jpg", "cutout": False, "title": brief.get("detail_title") or "Cada detalhe",
                       "subtitle": brief.get("detail_sub") or "", "transition": "whip"})
    if features:
        scenes.append({"type": "features", "title": brief.get("features_title") or "Por que você vai *amar*", "items": features, "transition": "slide"})
    cta = {"type": "cta", "text": brief.get("cta") or "Garanta o seu", "sub": " · ".join(x for x in ["Link na bio", handle] if x),
           "show_product": True, "confetti": True, "transition": "zoom"}
    if brief.get("urgency"):
        cta["urgency"] = brief["urgency"]
    scenes.append(cta)
    return {
        "format": "9:16", "fps": 30,
        "brand": {"name": brief.get("brand") or "", **colors},
        "watermark": False,
        "product": {"name": name, "image": "photo.jpg", "cutout": True},
        "music": "auto", "bpm": 118, "style": "pop", "sfx": True, "snap_to_beat": True,
        "scenes": scenes,
    }


def render(row):
    with tempfile.TemporaryDirectory() as tmp:
        download_photo(row["images"][0], os.path.join(tmp, "photo.jpg"))
        brief = row.get("brief") or {}
        with open(os.path.join(tmp, "briefing.json"), "w", encoding="utf-8") as f:
            json.dump(briefing(brief, row["name"], brief.get("handle") or ""), f, ensure_ascii=False)
        out = os.path.join(tmp, "video.mp4")
        p = subprocess.run([sys.executable, AD, "briefing.json", "video.mp4"], cwd=tmp, capture_output=True, text=True, timeout=900)
        if p.returncode != 0 or not os.path.exists(out):
            raise RuntimeError(f"render falhou: {(p.stderr or p.stdout)[-400:]}")
        with open(out, "rb") as f:
            data = f.read()
    path = f"{row['user_id']}/videos/{row['id']}.mp4"
    http("POST", f"{URL}/storage/v1/object/media/{path}", data, {"Content-Type": "video/mp4", "x-upsert": "true"}, raw=True)
    return f"{URL}/storage/v1/object/public/media/{path}"


def main():
    if not URL or not KEY:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY")
    if "--check" in sys.argv:  # usado pelo workflow para pular a instalação quando a fila está vazia
        requeue_stuck()
        print("queued" if queued() else "empty")
        return
    for row in queued():
        claimed = rest("PATCH", f"product_videos?id=eq.{row['id']}&status=eq.queued",
                       {"status": "rendering", "attempts": row["attempts"] + 1, "error": None})
        if not claimed:
            continue
        print(f"-> {row['name']} ({row['id']})", flush=True)
        try:
            url = render(row)
            rest("PATCH", f"product_videos?id=eq.{row['id']}", {"status": "rendered", "video_url": url, "error": None})
            print(f"   ok {url}", flush=True)
        except Exception as e:  # noqa: BLE001 — registra o erro na linha e segue para o próximo
            last = row["attempts"] + 1 >= MAX_ATTEMPTS
            rest("PATCH", f"product_videos?id=eq.{row['id']}", {"status": "failed" if last else "queued", "error": str(e)[:500]})
            print(f"   erro: {e}", flush=True)


if __name__ == "__main__":
    main()
