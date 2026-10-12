#!/usr/bin/env python3
"""ad.py — propaganda de produto que converte, a partir de um briefing simples em JSON.

  python ad.py briefing.json anuncio.mp4              # renderiza
  python ad.py briefing.json anuncio.mp4 --stills 8   # folha de contato para revisar antes
  python ad.py briefing.json x --dump projeto.json    # gera o projeto do motion.py para ajuste fino

Cada cena do briefing vira uma cena de motion graphics (motion.py) com layout, animações,
efeitos sonoros e transições já pensados para anúncio vertical (Reels/TikTok/Shorts),
quadrado (feed) ou horizontal (YouTube). Tipos de cena:
  hook, text, product, spin3d, features, compare, proof, offer, video, cta
Campos de cada tipo: references/ad_reference.md
"""
import argparse
import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import motion  # noqa: E402
from common import layout_words  # noqa: E402


def text_h(txt, size, max_w, fmt, weight="black", upper=True):
    """Altura (fração do quadro) que um bloco de texto vai ocupar — para empilhar sem sobrepor."""
    W, H = motion.FORMATS.get(fmt, (1080, 1920))
    U = min(W, H) / 1080
    lines, f, lh = layout_words(txt.upper() if upper else txt, max_w * W, size * U, weight, 4)
    return len(lines) * lh / H

DUR = {"layers": 5.2, "hook": 2.2, "text": 2.4, "product": 2.8, "spin3d": 3.2, "features": 4.2, "compare": 3.4, "proof": 3.0,
       "offer": 3.4, "video": 3.0, "cta": 3.0}
TRANS = {"layers": "whip", "hook": "none", "text": "zoom", "product": "flash", "spin3d": "zoom", "features": "whip", "compare": "slide",
         "proof": "zoom", "offer": "bars", "video": "zoom", "cta": "zoom"}


class L:
    """Posições por formato. Em vertical respeita as zonas seguras do Reels/TikTok
    (nada importante nos 12% de cima nem nos ~22% de baixo)."""

    def __init__(self, fmt):
        self.fmt = fmt
        self.wide = fmt in ("16:9", "4:3")
        self.square = fmt in ("1:1", "4:5")

    def title_y(self):
        return 0.18 if not self.wide else 0.2

    def big_text_y(self):
        return 0.40 if not self.wide else 0.42


def scene_bg(sc, brand, variant=0):
    if sc.get("background"):
        return sc["background"]
    if sc.get("bg_image"):
        return {"type": "image", "src": sc["bg_image"], "blur": sc.get("bg_blur", 0), "darken": sc.get("bg_darken", 0.45)}
    if sc.get("bg_video"):
        return {"type": "video", "src": sc["bg_video"], "start": sc.get("bg_start", 0), "darken": 0.4}
    cols = [["secondary", "primary"], ["primary", "secondary"]][variant % 2]
    return {"type": "gradient", "colors": cols, "angle": 160 if variant % 2 == 0 else 200, "glow": ["primary", "accent"] if variant % 3 == 2 else ["primary"],
            "glow_strength": 0.5}


def build_scene(sc, idx, spec, lay):
    t = sc.get("type", "text")
    brand = spec.get("brand", {})
    prod = spec.get("product", {})
    img = sc.get("image", prod.get("image"))
    cut = sc.get("cutout", prod.get("cutout", True))
    dur = float(sc.get("duration", DUR.get(t, 3)))
    W = lay.wide
    layers = []

    def text(txt, y, size, **kw):
        d = {"type": "text", "text": txt, "y": y, "size": size}
        d.update(kw)
        return d

    if t == "hook":
        prod_on = bool(img and sc.get("show_product", True))
        mw = 0.88 if not W else (0.58 if prod_on else 0.75)
        tx = 0.5 if not W else (0.4 if prod_on else 0.5)
        y = sc.get("y", lay.big_text_y())
        size = sc.get("size", 132)
        layers.append(text(sc["text"], y, size, x=tx, anim="pop-words", upper=True,
                           hl_box=sc.get("hl_box", True), idle=["shake"], sfx="impact", max_w=mw))
        if sc.get("sub"):
            sy = y + text_h(sc["text"], size, mw, spec.get("format", "9:16")) / 2 + (0.045 if not W else 0.07)
            layers.append(text(sc["sub"], sy, 58, x=tx, max_w=mw, weight="bold", color="accent", anim="slide-up",
                               **{"in": 0.75}))
        if img and sc.get("show_product", True):
            layers.append({"type": "image", "src": img, "cutout": cut, "y": 0.71 if not W else 0.5, "x": 0.5 if not W else 0.82,
                           "w": 0.5 if not W else 0.3, "h": 0.17 if not W else 0.6, "anim": "slide-up", "in": 0.45,
                           "idle": ["float"], "glow": "accent", "glow_strength": 0.5})
    elif t == "layers":  # vista explodida do pin: tinta, metal e tarraxa se separam e se juntam
        layers += [
            {"type": "particles", "kind": "bokeh", "count": 16},
            {"type": "explode", "src": img, "cutout": cut, "x": 0.5, "y": 0.55 if not W else 0.5, "w": 1.0 if not W else 0.6,
             "fill": sc.get("fill", 0.62), "labels": sc.get("labels", ["TINTA", "METAL", "TARRAXA"]), "anim": "none", "in": 0,
             "sfx": "whoosh", "sfx_offset": 1.0},
            # impacto quando as camadas se juntam (camada invisível só para o efeito sonoro)
            {"type": "shape", "shape": "circle", "w": 0.01, "opacity": 0, "anim": "none", "in": 3.15, "sfx": "impact"},
        ]
        if sc.get("title"):
            layers.append(text(sc["title"], 0.13 if not W else 0.12, sc.get("size", 84), max_w=0.88, anim="mask-up", **{"in": 0.2}))
        if sc.get("subtitle"):
            layers.append(text(sc["subtitle"], 0.9 if not W else 0.9, 48, max_w=0.88, weight="bold", color="accent",
                               anim="slide-up", **{"in": 3.4}))
    elif t == "text":
        y = sc.get("y", lay.big_text_y())
        size = sc.get("size", 104)
        layers.append(text(sc["text"], y, size, anim=sc.get("anim", "pop-words"),
                           upper=sc.get("upper", True), hl_box=sc.get("hl_box", False), sfx=sc.get("sfx", "pop")))
        if sc.get("sub"):
            sy = y + text_h(sc["text"], size, 0.86, spec.get("format", "9:16"), upper=sc.get("upper", True)) / 2 + (0.04 if not W else 0.07)
            layers.append(text(sc["sub"], sy, 52, weight="medium", anim="slide-up", **{"in": 0.6}))
    elif t == "product":
        layers += [
            {"type": "particles", "kind": "sparkle", "count": 22},
            {"type": "image", "src": img, "cutout": cut, "x": 0.5 if not W else 0.33, "y": 0.45 if not W else 0.52,
             "w": 0.82 if not W else 0.42, "h": 0.46 if not W else 0.78, "anim": "zoom-out", "in_dur": 0.6,
             "idle": ["float", "kenburns"], "glow": "accent", "glow_strength": 0.75},
        ]
        if sc.get("title") or prod.get("name"):
            layers.append(text(sc.get("title", prod.get("name")), 0.76 if not W else 0.42, sc.get("size", 92), x=0.5 if not W else 0.72,
                               max_w=0.86 if not W else 0.5, anim="mask-up", **{"in": 0.35}, sfx="pop"))
        if sc.get("subtitle"):
            layers.append(text(sc["subtitle"], 0.83 if not W else 0.58, 46, x=0.5 if not W else 0.72, max_w=0.86 if not W else 0.5,
                               weight="medium", anim="slide-up", color="accent", **{"in": 0.6}))
        if sc.get("badge"):
            layers.append({"type": "badge", "text": sc["badge"], "x": 0.8 if not W else 0.52, "y": 0.22 if not W else 0.25,
                           "w": 0.26 if not W else 0.16, "in": 0.7, "idle": ["wiggle"], "sfx": "pop"})
    elif t == "spin3d":
        o = {k: v for k, v in sc.items() if k not in ("type", "duration", "title", "subtitle", "transition", "background")}
        if "front" not in o and "label" not in o and "cap" not in o and img and o.get("shape", "box") in ("box", "card"):
            o["front"] = img
        o.update(type="object3d", x=0.5 if not W else 0.33, y=0.5, w=0.95 if not W else 0.5, **{"in": 0})
        o.setdefault("motion", "reveal")
        o.setdefault("anim", "fade" if o["motion"] == "reveal" else "zoom-out")
        o.setdefault("sfx", "whoosh")
        layers.append({"type": "particles", "kind": "bokeh", "count": 18})
        layers.append(o)
        if sc.get("title"):
            layers.append(text(sc["title"], lay.title_y() if not W else 0.4, 84, x=0.5 if not W else 0.72, max_w=0.86 if not W else 0.48,
                               anim="mask-up", **{"in": 0.3}))
        if sc.get("subtitle"):
            layers.append(text(sc["subtitle"], 0.8 if not W else 0.56, 46, x=0.5 if not W else 0.72, max_w=0.86 if not W else 0.48,
                               weight="medium", color="accent", anim="slide-up", **{"in": 0.6}))
    elif t == "features":
        items = sc.get("items", [])
        if img:
            layers.append({"type": "image", "src": img, "cutout": cut, "x": 0.5 if not W else 0.28, "y": 0.29 if not W else 0.52,
                           "w": 0.6 if not W else 0.4, "h": 0.27 if not W else 0.75, "anim": "pop", "idle": ["float"],
                           "glow": "accent", "glow_strength": 0.5})
        if sc.get("title"):
            layers.append(text(sc["title"], 0.13 if not W else 0.16, 70, x=0.5 if not W else 0.66, anim="mask-up", max_w=0.9 if not W else 0.6))
        y0 = 0.52 if not W else 0.32
        gap = min(0.085, 0.3 / max(1, len(items) - 1)) if not W else min(0.15, 0.5 / max(1, len(items) - 1))
        step = (dur - 0.8) / max(1, len(items))
        for i, it in enumerate(items):
            layers.append(text(it, y0 + i * gap, sc.get("size", 50), x=0.08 if not W else 0.5, anchor="left", align="left",
                               max_w=0.78 if not W else 0.44, weight="bold", anim="slide-left",
                               **{"in": 0.35 + i * min(0.5, step)}, box={"color": "#FFFFFF", "opacity": 0.12, "pad": 24},
                               check="accent", shadow=False, max_lines=2, sfx="pop", sfx_db=-6))
    elif t == "compare":
        lbl = sc.get("labels", ["ANTES", "DEPOIS"])
        for k, (src, y) in enumerate(((sc["before"], 0.3), (sc["after"], 0.67))):
            pos = dict(x=0.5, y=y, w=0.86, h=0.32) if not W else dict(x=0.27 + k * 0.46, y=0.52, w=0.42, h=0.7)
            layers.append(dict(type="image", src=src, cutout=False, radius=30, anim="wipe" if k else "fade",
                               **{"in": 0.9 * k}, in_dur=0.7, **pos))
            lp = dict(x=0.5, y=y - 0.13) if not W else dict(x=0.27 + k * 0.46, y=0.12)
            layers.append(text(lbl[k], size=48, anim="pop", **{"in": 0.9 * k + 0.2},
                               box={"color": "accent" if k else "#000000", "opacity": 1 if k else 0.7},
                               color="#111111" if k else "#FFFFFF", shadow=False, sfx="whoosh" if k else None, **lp))
    elif t == "proof":
        Y = dict(r=0.27, s=0.37, c=0.44, q=0.58, a=0.7) if not W else dict(r=0.2, s=0.37, c=0.48, q=0.66, a=0.82)
        if sc.get("rating"):
            layers.append({"type": "counter", "from": 0, "to": float(sc["rating"]), "decimals": 1, "size": 190 if not W else 150,
                           "y": Y["r"], "color": "accent", "count_dur": 1.0})
            layers.append({"type": "stars", "value": float(sc["rating"]), "y": Y["s"], "size": 84 if not W else 70,
                           "sfx": "ding", "sfx_offset": 0.5})
        if sc.get("count"):
            layers.append(text(sc["count"], Y["c"], 56 if not W else 50, weight="bold", anim="slide-up", **{"in": 0.5}))
        if sc.get("quote"):
            layers.append(text("“" + sc["quote"] + "”", Y["q"], 48 if not W else 42, weight="medium", anim="pop", **{"in": 0.9},
                               max_w=0.78 if not W else 0.6, box={"color": "#FFFFFF", "opacity": 0.12, "pad": 34},
                               max_lines=5 if not W else 3))
        if sc.get("author"):
            layers.append(text("— " + sc["author"], Y["a"], 38, weight="medium", color="accent", anim="fade", **{"in": 1.2}))
    elif t == "offer":
        if img:
            layers.append({"type": "image", "src": img, "cutout": cut, "x": 0.5 if not W else 0.3, "y": 0.27 if not W else 0.5,
                           "w": 0.55 if not W else 0.4, "h": 0.25 if not W else 0.7, "anim": "pop", "idle": ["float"], "glow": "accent"})
        layers.append({"type": "price", "old": sc.get("old_price"), "new": sc["price"], "label": sc.get("label", "por apenas"),
                       "x": 0.5 if not W else 0.7, "y": 0.55 if not W else 0.4, "sfx": "ding", "sfx_offset": 0.45,
                       "size": sc.get("size", 170 if not W else 150)})
        if sc.get("badge"):
            layers.append({"type": "badge", "text": sc["badge"], "x": 0.8 if not W else 0.46, "y": 0.17 if not W else 0.22, "w": 0.27 if not W else 0.17,
                           "in": 0.9, "idle": ["wiggle"], "sfx": "pop"})
        if sc.get("installments"):
            layers.append(text(sc["installments"], 0.685 if not W else 0.66, 44, x=0.5 if not W else 0.7, weight="medium", anim="fade", **{"in": 1.0}))
        if sc.get("note"):
            layers.append(text(sc["note"], 0.765 if not W else 0.8, 46, x=0.5 if not W else 0.7, weight="bold", anim="pop", **{"in": 1.2},
                               box={"color": "accent", "opacity": 1}, color="#111111", shadow=False, idle=["pulse"]))
    elif t == "video":
        layers.append({"type": "video", "src": sc["src"], "start": sc.get("start", 0), "fit": sc.get("fit", "cover"),
                       "grade": sc.get("grade", "punchy"), "audio": sc.get("audio", True), "volume_db": sc.get("volume_db", 0),
                       "speed": sc.get("speed", 1.0)})
        if sc.get("caption"):
            layers.append(text(sc["caption"], sc.get("caption_y", 0.72 if not W else 0.82), sc.get("size", 64), anim="pop-words",
                               upper=True, stroke=0, hl_box=True, box={"color": "#000000", "opacity": 0.55}))
    elif t == "cta":
        logo = brand.get("logo")
        if logo:
            layers.append({"type": "image", "src": logo, "cutout": False, "y": 0.2, "w": 0.32, "h": 0.12, "shadow": False, "anim": "elastic"})
        elif brand.get("name"):
            layers.append(text(brand["name"], 0.2, 80, anim="elastic"))
        if img and sc.get("show_product", True):
            layers.append({"type": "image", "src": img, "cutout": cut, "y": 0.37 if not W else 0.5, "x": 0.5 if not W else 0.25,
                           "w": 0.45 if not W else 0.35, "h": 0.2 if not W else 0.6, "anim": "pop", "idle": ["float"],
                           "glow": "accent", **{"in": 0.15}})
        if sc.get("urgency"):
            layers.append(text(sc["urgency"], 0.53 if not W else 0.34, 54, x=0.5 if not W else 0.65, weight="bold", color="accent",
                               anim="slide-up", idle=["blink"], **{"in": 0.3}))
        layers.append({"type": "button", "text": sc.get("text", "COMPRE AGORA"), "x": 0.5 if not W else 0.65, "y": 0.62 if not W else 0.5,
                       "size": 66, "color": "accent", "in": 0.45, "idle": ["heartbeat"], "sfx": "pop"})
        if sc.get("sub"):
            layers.append(text(sc["sub"], 0.71 if not W else 0.66, 46, x=0.5 if not W else 0.65, weight="medium", anim="fade", **{"in": 0.8}))
        if sc.get("confetti", True):
            layers.append({"type": "particles", "kind": "confetti", "count": 70, "in": 0.45})
    else:
        raise SystemExit(f"tipo de cena desconhecido: {t}")

    layers = [l for l in layers if l]
    for l in layers:  # remove sfx vazios
        if l.get("sfx") is None:
            l.pop("sfx", None)
    if brand.get("logo") and spec.get("watermark", True) and t not in ("cta",):
        layers.append({"type": "image", "src": brand["logo"], "cutout": False, "x": 0.88 if not W else 0.93, "y": 0.065 if not W else 0.09,
                       "w": 0.13 if not W else 0.08, "h": 0.06 if not W else 0.1, "shadow": False, "anim": "none", "opacity": 0.85})
    layers += sc.get("extra_layers", [])
    return {"duration": dur, "background": scene_bg(sc, brand, idx), "transition": sc.get("transition", TRANS.get(t, "zoom")),
            "layers": layers}


def build_project(spec):
    fmt = spec.get("format", "9:16")
    lay = L(fmt)
    proj = {"format": fmt, "fps": spec.get("fps", 30), "brand": spec.get("brand", {}),
            "audio": {"music": spec.get("music", "auto"), "bpm": spec.get("bpm", 124), "style": spec.get("style", "pop"),
                      "sfx": spec.get("sfx", True), "voice": spec.get("voice"), "snap_to_beat": spec.get("snap_to_beat", True),
                      "music_db": spec.get("music_db", -4 if not spec.get("voice") else -12)},
            "scenes": [build_scene(sc, i, spec, lay) for i, sc in enumerate(spec["scenes"])]}
    if proj["audio"]["voice"] is None:
        proj["audio"].pop("voice")
    return proj


def palette(path):
    """Sugere cores de marca a partir do logo/embalagem."""
    import colorsys
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    im.thumbnail((200, 200))
    import numpy as np
    arr = np.asarray(im).reshape(-1, 4)
    px = [tuple(int(v) for v in p[:3]) for p in arr[arr[:, 3] > 200]]
    if not px:
        raise SystemExit("imagem sem pixels visíveis")
    q = Image.new("RGB", (len(px), 1))
    q.putdata(px)
    cols = sorted(q.quantize(8).convert("RGB").getcolors(4096) or [], reverse=True)
    def hsv(c):
        return colorsys.rgb_to_hsv(*[x / 255 for x in c])
    vivid = [c for n, c in cols if hsv(c)[1] > 0.35 and 0.25 < hsv(c)[2]]
    primary = vivid[0] if vivid else cols[0][1]
    h, s_, v = hsv(primary)
    sec = tuple(int(x * 255) for x in colorsys.hsv_to_rgb(h, min(1, s_ * 0.6), 0.11))
    others = [c for c in vivid[1:] if abs(hsv(c)[0] - h) > 0.08]
    accent = others[0] if others else tuple(int(x * 255) for x in colorsys.hsv_to_rgb((h + 0.5) % 1 if s_ > 0.5 else 0.13, 0.85, 1.0))
    hx = lambda c: "#%02X%02X%02X" % tuple(c)
    print(json.dumps({"primary": hx(primary), "secondary": hx(sec), "accent": hx(accent), "text": "#FFFFFF"}, indent=2))


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "palette":
        return palette(sys.argv[2])
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("briefing")
    ap.add_argument("out")
    ap.add_argument("--stills", type=int, default=0)
    ap.add_argument("--dump", help="salva o projeto motion.json gerado (para ajustes finos) e não renderiza")
    ap.add_argument("--format", help="sobrescreve o formato: 9:16, 1:1, 4:5, 16:9")
    a = ap.parse_args()
    with open(a.briefing) as f:
        spec = json.load(f)
    if a.format:
        spec["format"] = a.format
    proj = build_project(copy.deepcopy(spec))
    base = os.path.dirname(os.path.abspath(a.briefing))
    if a.dump:
        with open(a.dump, "w") as f:
            json.dump(proj, f, indent=2, ensure_ascii=False)
        print(a.dump)
        return
    motion.render_project(proj, a.out, base, a.stills)


if __name__ == "__main__":
    main()
