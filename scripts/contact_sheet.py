#!/usr/bin/env python3
"""Folhas de contato de imagens (ex.: capas dos produtos da loja) para conferir de longe: lê uma lista JSON
[{id, name, image}], baixa cada imagem e monta folhas 5x4 numeradas. Uso: python3 scripts/contact_sheet.py lista.json pasta"""
import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont

items = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
T, COLS, ROWS = 300, 5, 4
font = ImageFont.load_default(size=18)
thumbs = []
for i, it in enumerate(items):
    try:
        req = urllib.request.Request(it["image"], headers={"User-Agent": "Mozilla/5.0"})
        im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert("RGB")
        im.thumbnail((T, T))
        th = Image.new("RGB", (T, T + 26), "white")
        th.paste(im, ((T - im.width) // 2, (T - im.height) // 2))
    except Exception as e:  # noqa: BLE001
        th = Image.new("RGB", (T, T + 26), "gray")
        print("falhou", it.get("name"), e)
    d = ImageDraw.Draw(th)
    d.rectangle((0, T, T, T + 26), fill="black")
    d.text((4, T + 3), f"{i}: {it.get('name', '')[:30]}", fill="white", font=font)
    thumbs.append(th)
per = COLS * ROWS
for s in range(0, len(thumbs), per):
    sheet = Image.new("RGB", (COLS * T, ROWS * (T + 26)), "black")
    for k, th in enumerate(thumbs[s:s + per]):
        sheet.paste(th, ((k % COLS) * T, (k // COLS) * (T + 26)))
    sheet.save(os.path.join(out, f"sheet-{s // per:02d}.jpg"), quality=80)
print(len(thumbs), "imagens")
