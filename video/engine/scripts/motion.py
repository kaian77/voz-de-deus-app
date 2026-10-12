#!/usr/bin/env python3
"""motion.py — motor de motion graphics por camadas (estilo After Effects, via JSON).

USO
  python motion.py render projeto.json saida.mp4          # vídeo final (com áudio)
  python motion.py render projeto.json overlay.mov        # fundo "transparent" -> vídeo com alfa
  python motion.py render projeto.json x --stills 6       # folha de contato PNG para conferir
  python motion.py preset title --text "Oferta *imperdível*" --out titulo.mov
  python motion.py preset list                            # lista os presets

PROJETO (JSON) — ver references/motion_reference.md para todos os campos
{
  "format": "9:16", "fps": 30,
  "audio": {"music": "auto", "bpm": 120, "style": "pop", "sfx": true, "voice": "locucao.mp3"},
  "transition": "zoom",
  "scenes": [
    {"duration": 2.5, "background": {"type": "gradient", "colors": ["#111", "#3a0ca3"], "glow": ["#f72585"]},
     "layers": [
       {"type": "text", "text": "Pare de *perder tempo*", "y": 0.42, "size": 120, "anim": "pop-words", "sfx": "pop"},
       {"type": "image", "src": "produto.png", "y": 0.7, "w": 0.6, "anim": "pop", "idle": ["float"], "glow": "#f72585"}
     ]}
  ]
}
Um projeto sem "scenes" é tratado como uma cena única (as chaves da cena ficam na raiz).
"""
import argparse
import copy
import json
import math
import os
import random
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import (clamp, cover, cutout, cutout_cached, drop_shadow, ease_in_out, ease_out_back, ease_out_cubic,  # noqa: E402
                    ease_out_elastic, ffmpeg_bin, fit, font, gradient, load_image, paste_center,
                    prog, radial_glow, readable_on, render_text, rgb, safe_composite, word_layers)
import audio as audio_mod  # noqa: E402

FORMATS = {"9:16": (1080, 1920), "1:1": (1080, 1080), "4:5": (1080, 1350), "16:9": (1920, 1080),
           "4:3": (1440, 1080)}
EASE = {"linear": lambda t: clamp(t), "out": ease_out_cubic, "inout": ease_in_out, "back": ease_out_back,
        "elastic": ease_out_elastic, "in": lambda t: clamp(t) ** 3}


def resolve_size(spec):
    if "size" in spec:
        return tuple(int(v) for v in spec["size"])
    return FORMATS.get(spec.get("format", "9:16"), (1080, 1920))


def interp_keys(keys, t, default):
    """keys: [[tempo, valor, easing?], ...] com tempo relativo à cena."""
    if not keys:
        return default
    if t <= keys[0][0]:
        return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            k = EASE.get(b[2] if len(b) > 2 else "inout", ease_in_out)((t - a[0]) / max(1e-6, b[0] - a[0]))
            if isinstance(a[1], (list, tuple)):
                return [x + (y - x) * k for x, y in zip(a[1], b[1])]
            return a[1] + (b[1] - a[1]) * k
    return keys[-1][1]


# ============================================================ animações
def anim_state(name, v, W, H, exiting=False):
    """v = visibilidade 0..1. Retorna modificadores de transformação."""
    st = {}
    if name in (None, "none", "cut"):
        return st
    if exiting:  # v vai de 1 a 0: saída rápida e limpa
        e = ease_in_out(v)
        bk = e
    else:
        e = ease_out_cubic(v)
        bk = ease_out_back(v)
    if name == "fade":
        st["op"] = e
    elif name in ("pop", "pop-words"):
        st["scale"] = max(0.0, bk)
        st["op"] = clamp(v * 3)
    elif name == "elastic":
        st["scale"] = max(0.0, ease_out_elastic(v) if not exiting else e)
        st["op"] = clamp(v * 4)
    elif name == "zoom":  # punch-in: vem grande e assenta
        st["scale"] = 1 + 0.7 * (1 - e)
        st["op"] = e
    elif name == "zoom-out":
        st["scale"] = 0.4 + 0.6 * e
        st["op"] = e
    elif name == "slide-up":
        st["dy"] = (1 - e) * 0.09 * H
        st["op"] = e
    elif name == "slide-down":
        st["dy"] = -(1 - e) * 0.09 * H
        st["op"] = e
    elif name == "slide-left":  # entra pela direita
        st["dx"] = (1 - e) * 0.6 * W
        st["op"] = clamp(v * 2)
    elif name == "slide-right":
        st["dx"] = -(1 - e) * 0.6 * W
        st["op"] = clamp(v * 2)
    elif name == "drop":
        st["dy"] = -(1 - bk) * 0.35 * H
        st["op"] = clamp(v * 3)
    elif name == "mask-up":
        st["reveal_up"] = e
    elif name == "wipe":
        st["reveal_x"] = e
    elif name == "blur":
        st["blur"] = (1 - e) * 22
        st["op"] = e
        st["scale"] = 1 + 0.12 * (1 - e)
    elif name == "spin":
        st["rot"] = (1 - e) * -200
        st["scale"] = max(0.0, bk)
        st["op"] = clamp(v * 3)
    elif name == "typewriter":
        st["chars"] = clamp(v)
    elif name == "draw":
        st["draw"] = e
    else:
        st["op"] = e
    return st


def idle_state(idles, lt, dur, W, H, seed=0):
    st = {"dx": 0.0, "dy": 0.0, "scale": 1.0, "rot": 0.0, "op": 1.0}
    for it in idles or []:
        name, amt = (it, 1.0) if isinstance(it, str) else (it.get("type"), it.get("amount", 1.0))
        if name == "float":
            st["dy"] += math.sin(2 * math.pi * lt / 2.6 + seed) * 0.009 * H * amt
            st["rot"] += math.sin(2 * math.pi * lt / 3.7 + seed) * 1.2 * amt
        elif name == "pulse":
            st["scale"] *= 1 + 0.05 * amt * (0.5 + 0.5 * math.sin(2 * math.pi * lt / 0.85))
        elif name == "heartbeat":
            ph = (lt % 1.0)
            st["scale"] *= 1 + 0.07 * amt * (math.exp(-((ph - 0.1) / 0.05) ** 2) + 0.6 * math.exp(-((ph - 0.3) / 0.05) ** 2))
        elif name == "wiggle":
            st["rot"] += math.sin(2 * math.pi * lt / 1.1 + seed) * 3.5 * amt
        elif name == "kenburns":
            st["scale"] *= 1 + 0.08 * amt * (lt / max(dur, 0.1))
        elif name == "spin":
            st["rot"] += -60 * amt * lt
        elif name == "shake":  # tremor de impacto que diminui
            k = math.exp(-lt * 4) * amt
            st["dx"] += math.sin(lt * 90 + seed) * 14 * k
            st["dy"] += math.cos(lt * 77 + seed) * 10 * k
        elif name == "jitter":  # tremor contínuo leve
            st["dx"] += math.sin(lt * 50 + seed) * 3 * amt
            st["dy"] += math.cos(lt * 43 + seed) * 3 * amt
        elif name == "blink":
            st["op"] *= 0.35 + 0.65 * (math.sin(2 * math.pi * lt / 0.8) > -0.2)
    return st


def place(canvas, spr, cx, cy, scale=1.0, rot=0.0, op=1.0, reveal_up=None, reveal_x=None, blur=0.0):
    if spr is None or op <= 0.003 or scale <= 0.01:
        return
    if reveal_up is not None and reveal_up < 0.999:
        w, h = spr.size
        tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        tmp.paste(spr, (0, int(round((1 - reveal_up) * h))))
        spr = tmp
    if reveal_x is not None and reveal_x < 0.999:
        w, h = spr.size
        tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        cw = int(w * reveal_x)
        if cw > 0:
            tmp.paste(spr.crop((0, 0, cw, h)), (0, 0))
        spr = tmp
    if blur > 0.6:
        pad = int(blur * 2)
        tmp = Image.new("RGBA", (spr.width + 2 * pad, spr.height + 2 * pad), (0, 0, 0, 0))
        tmp.paste(spr, (pad, pad))
        spr = tmp.filter(ImageFilter.GaussianBlur(blur))
    paste_center(canvas, spr, cx, cy, scale=scale, rotate=rot, opacity=op)


# ============================================================ camadas
class Layer:
    default_anim = "fade"

    def __init__(self, s, comp):
        self.s, self.c = s, comp
        self.W, self.H, self.U = comp.W, comp.H, comp.U
        self.t_in = float(s.get("in", 0))
        self.t_out = float(s.get("out", comp.duration + 1))
        self.anim = s.get("anim", self.default_anim)
        self.exit = s.get("exit", "fade" if "out" in s else None)
        self.in_dur = float(s.get("in_dur", 0.5))
        self.out_dur = float(s.get("out_dur", 0.3))
        idle = s.get("idle", [])
        self.idle = [idle] if isinstance(idle, str) else idle
        self.keys = s.get("keys", {})
        self.seed = random.Random(json.dumps(s, sort_keys=True, default=str)).random() * 10
        self._spr = None

    def px(self, v):
        return v * self.U

    def color(self, key, default):
        return self.c.color(self.s.get(key, default))

    def sprite(self, t, lt, st):
        if self._spr is None:
            self._spr = self.build()
        return self._spr

    def build(self):
        return None

    def state(self, t):
        lt = t - self.t_in
        st = {"dx": 0.0, "dy": 0.0, "scale": 1.0, "rot": 0.0, "op": 1.0}
        ins = anim_state(self.anim, prog(lt, 0, self.in_dur), self.W, self.H)
        outs = {}
        if self.exit:
            outs = anim_state(self.exit, 1 - prog(t, self.t_out - self.out_dur, self.out_dur), self.W, self.H, True)
        idl = idle_state(self.idle, lt, self.t_out - self.t_in, self.W, self.H, self.seed)
        for d in (ins, outs, idl):
            for k, v in d.items():
                if k in ("scale", "op"):
                    st[k] = st.get(k, 1.0) * v
                elif k in ("dx", "dy", "rot"):
                    st[k] = st.get(k, 0.0) + v
                elif k in ("reveal_up", "reveal_x", "chars", "draw"):
                    st[k] = min(st.get(k, 1.0), v)
                elif k == "blur":
                    st[k] = max(st.get(k, 0.0), v)
        return st, lt

    def draw(self, canvas, t):
        if t < self.t_in or t > self.t_out:
            return
        st, lt = self.state(t)
        x = interp_keys(self.keys.get("x"), t, self.s.get("x", 0.5)) * self.W + st["dx"]
        y = interp_keys(self.keys.get("y"), t, self.s.get("y", 0.5)) * self.H + st["dy"]
        sc = interp_keys(self.keys.get("scale"), t, self.s.get("scale", 1.0)) * st["scale"]
        rot = interp_keys(self.keys.get("rot"), t, self.s.get("rot", 0.0)) + st["rot"]
        op = interp_keys(self.keys.get("opacity"), t, self.s.get("opacity", 1.0)) * st["op"]
        spr = self.sprite(t, lt, st)
        anchor = self.s.get("anchor", "center")
        if spr is not None and anchor != "center":  # x passa a ser a borda esquerda/direita
            x += (spr.width * sc / 2) * (1 if anchor == "left" else -1)
        place(canvas, spr, x, y, sc, rot, op, st.get("reveal_up"), st.get("reveal_x"), st.get("blur", 0))


class TextLayer(Layer):
    default_anim = "slide-up"

    def opts(self, text=None):
        s = self.s
        return dict(text=text if text is not None else s.get("text", ""), max_w=s.get("max_w", 0.86) * self.W,
                    size=self.px(s.get("size", 80)), color=self.color("color", "text"),
                    hl_color=self.color("hl_color", "accent"), weight=s.get("weight", "black"),
                    align=s.get("align", "center"), stroke=int(self.px(s.get("stroke", 0))),
                    stroke_color=self.color("stroke_color", "#000000"), max_lines=s.get("max_lines", 4),
                    hl_box=s.get("hl_box", False), shadow=s.get("shadow", True), font_path=self.c.font_path(s),
                    upper=s.get("upper", False))

    def boxed(self, spr):
        b = self.s.get("box")
        if not b or spr is None:
            return spr
        b = {"color": b} if isinstance(b, str) else b
        pad = self.px(b.get("pad", 22))
        col = rgb(self.c.color(b.get("color", "#000000")), int(255 * b.get("opacity", 0.85)))
        chk = self.s.get("check")  # item de lista com ícone de check
        icon = spr.height * 0.62 if chk else 0
        lead = icon + pad * 0.6 if chk else 0
        w, h = spr.width + 2 * pad + lead, spr.height + pad
        bg = Image.new("RGBA", (int(w), int(h)), (0, 0, 0, 0))
        d = ImageDraw.Draw(bg)
        d.rounded_rectangle((0, 0, w - 1, h - 1), radius=int(self.px(b.get("radius", 26))), fill=col)
        if chk:
            cc = rgb(self.c.color(chk if isinstance(chk, str) else "accent"))
            cx, cy, r = pad + icon / 2, h / 2, icon / 2
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=cc + (255,))
            k = readable_on(cc)
            lw = max(3, int(r / 4))
            d.line((cx - r * 0.45, cy + r * 0.02, cx - r * 0.1, cy + r * 0.38, cx + r * 0.5, cy - r * 0.35), fill=k,
                   width=lw, joint="curve")
        bg.alpha_composite(spr, (int(pad + lead), int(pad * 0.5)))
        return bg

    def build(self):
        o = self.opts()
        txt = o.pop("text")
        return self.boxed(render_text(txt, **o))

    def sprite(self, t, lt, st):
        if "chars" in st and st["chars"] < 1:
            full = self.s.get("text", "")
            n = int(round(len(full) * st["chars"]))
            o = self.opts(full[:n] + ("|" if int(lt * 3) % 2 == 0 else ""))
            txt = o.pop("text")
            return self.boxed(render_text(txt, **o)) if txt.strip() else None
        return super().sprite(t, lt, st)

    def draw(self, canvas, t):
        if self.anim != "pop-words":
            return super().draw(canvas, t)
        if t < self.t_in or t > self.t_out:
            return
        if not hasattr(self, "_words"):
            o = self.opts()
            self._words, _ = word_layers(o["text"], o["max_w"], o["size"], o["color"], o["hl_color"], o["weight"],
                                         o["stroke"], o["max_lines"], o["font_path"], o["upper"], o["hl_box"])
        anim = self.anim
        self.anim = None
        st, lt = self.state(t)
        self.anim = anim
        x0 = self.s.get("x", 0.5) * self.W + st["dx"]
        y0 = self.s.get("y", 0.5) * self.H + st["dy"]
        stag = float(self.s.get("stagger", 0.085))
        for i, (lay, cx, cy) in enumerate(self._words):
            p = prog(lt, i * stag, 0.32)
            if p <= 0:
                continue
            sc = max(0.0, ease_out_back(p, 2.2)) * st["scale"]
            place(canvas, lay, x0 + cx, y0 + cy + (1 - ease_out_cubic(p)) * self.px(30), sc, st["rot"],
                  clamp(p * 3) * st["op"])


class ImageLayer(Layer):
    default_anim = "pop"

    def build(self):
        s = self.s
        if s.get("cutout", False):
            im = cutout_cached(self.c.path(s["src"]), s.get("cutout_method", "auto")).copy()
        else:
            im = load_image(self.c.path(s["src"]))
        w = s.get("w", 0.6) * self.W
        h = s.get("h", 0.45 if self.H > self.W else 0.6) * self.H
        im = fit(im, w, h)
        if s.get("radius"):
            m = Image.new("L", im.size, 0)
            ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=int(self.px(s["radius"])), fill=255)
            a = Image.fromarray(np.minimum(np.asarray(im.getchannel("A")), np.asarray(m)))
            im.putalpha(a)
        if s.get("border"):
            bw = int(self.px(s.get("border_width", 8)))
            bd = Image.new("RGBA", (im.width + 2 * bw, im.height + 2 * bw), (0, 0, 0, 0))
            ImageDraw.Draw(bd).rounded_rectangle((0, 0, bd.width - 1, bd.height - 1),
                                                 radius=int(self.px(s.get("radius", 0)) + bw), fill=rgb(self.c.color(s["border"])) + (255,))
            bd.alpha_composite(im, (bw, bw))
            im = bd
        if s.get("shadow", True):
            im, _ = drop_shadow(im, blur=int(self.px(26)), offset=(0, int(self.px(28))), opacity=s.get("shadow_opacity", 0.5))
        g = s.get("glow")
        if g:
            size = max(im.width, im.height) * 1.5
            glow = radial_glow(size, self.c.color(g), s.get("glow_strength", 0.9))
            out = Image.new("RGBA", (int(size), int(size)), (0, 0, 0, 0))
            out.alpha_composite(glow)
            safe_composite(out, im, (size - im.width) / 2, (size - im.height) / 2)
            im = out
        return im


class ShapeLayer(Layer):
    default_anim = "pop"

    def build(self, draw_p=1.0):
        s = self.s
        shape = s.get("shape", "rect")
        w = s.get("w", 0.3) * self.W
        h = s.get("h", s.get("w", 0.3)) * self.W if shape not in ("rect", "pill", "line", "arrow") else s.get("h", 0.08) * self.W
        if shape in ("line", "arrow"):
            h = max(h, self.px(s.get("stroke", 10)) * 4)
        col = rgb(self.c.color(s.get("color", "accent")), int(255 * s.get("alpha", 1.0)))
        sw = int(self.px(s.get("stroke", 10)))
        pad = sw * 2 + 4
        im = Image.new("RGBA", (int(w + 2 * pad), int(h + 2 * pad)), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        box = (pad, pad, pad + w, pad + h)
        if shape == "rect":
            d.rounded_rectangle(box, radius=int(self.px(s.get("radius", 0))), fill=col)
        elif shape == "pill":
            d.rounded_rectangle(box, radius=int(h / 2), fill=col)
        elif shape == "circle":
            d.ellipse(box, fill=col)
        elif shape == "ring":
            d.arc(box, -90, -90 + 360 * draw_p, fill=col, width=sw)
        elif shape in ("line", "arrow"):
            y = pad + h / 2
            x1 = pad + w * draw_p
            d.line((pad, y, x1, y), fill=col, width=sw)
            if shape == "arrow" and draw_p > 0.15:
                hs = sw * 3
                d.polygon([(x1 + sw, y), (x1 - hs, y - hs), (x1 - hs, y + hs)], fill=col)
        elif shape in ("burst", "star"):
            n = s.get("points", 14 if shape == "burst" else 5)
            cx, cy = pad + w / 2, pad + h / 2
            ro, ri = w / 2, w / 2 * (0.8 if shape == "burst" else 0.45)
            pts = [(cx + (ro if i % 2 == 0 else ri) * math.cos(math.pi * i / n - math.pi / 2),
                    cy + (ro if i % 2 == 0 else ri) * math.sin(math.pi * i / n - math.pi / 2)) for i in range(2 * n)]
            d.polygon(pts, fill=col)
        elif shape == "triangle":
            d.polygon([(pad + w / 2, pad), (pad + w, pad + h), (pad, pad + h)], fill=col)
        if s.get("outline"):
            oc = rgb(self.c.color(s["outline"]))
            if shape in ("rect", "pill"):
                d.rounded_rectangle(box, radius=int(h / 2 if shape == "pill" else self.px(s.get("radius", 0))), outline=oc, width=sw)
            elif shape == "circle":
                d.ellipse(box, outline=oc, width=sw)
        return im

    def sprite(self, t, lt, st):
        if "draw" in st and st["draw"] < 0.999:
            return self.build(st["draw"])
        return super().sprite(t, lt, st)


class CounterLayer(TextLayer):
    default_anim = "pop"

    def sprite(self, t, lt, st):
        s = self.s
        a, b = float(s.get("from", 0)), float(s.get("to", 100))
        p = ease_out_cubic(prog(lt, s.get("delay", 0.1), s.get("count_dur", 1.4)))
        v = a + (b - a) * p
        dec = int(s.get("decimals", 0))
        txt = f"{v:,.{dec}f}"
        if s.get("locale", "pt") == "pt":
            txt = txt.replace(",", "§").replace(".", ",").replace("§", ".")
        key = txt
        if getattr(self, "_last", None) != key:
            o = self.opts(f"{s.get('prefix', '')}{txt}{s.get('suffix', '')}")
            o.pop("text")
            self._last, self._last_spr = key, self.boxed(render_text(f"{s.get('prefix', '')}{txt}{s.get('suffix', '')}", **o))
        return self._last_spr


class StarsLayer(Layer):
    default_anim = "fade"

    def sprite(self, t, lt, st):
        s = self.s
        n = int(s.get("count", 5))
        val = float(s.get("value", 5))
        size = self.px(s.get("size", 80))
        gap = size * 0.18
        im = Image.new("RGBA", (int(n * size + (n - 1) * gap + 8), int(size + 8)), (0, 0, 0, 0))
        on = rgb(self.c.color(s.get("color", "#FFC62E")))
        off = rgb(self.c.color(s.get("off_color", "#FFFFFF")), 70)
        for i in range(n):
            p = ease_out_back(prog(lt, 0.08 + i * 0.09, 0.3))
            fill_frac = clamp(val - i)
            cx, cy = 4 + i * (size + gap) + size / 2, 4 + size / 2
            r = size / 2 * max(0.0, p)
            if r < 1:
                continue
            pts = [(cx + (r if k % 2 == 0 else r * 0.45) * math.cos(math.pi * k / 5 - math.pi / 2),
                    cy + (r if k % 2 == 0 else r * 0.45) * math.sin(math.pi * k / 5 - math.pi / 2)) for k in range(10)]
            star = Image.new("RGBA", im.size, (0, 0, 0, 0))
            ImageDraw.Draw(star).polygon(pts, fill=off)
            im.alpha_composite(star)
            if fill_frac > 0:
                full = Image.new("RGBA", im.size, (0, 0, 0, 0))
                ImageDraw.Draw(full).polygon(pts, fill=on + (255,))
                if fill_frac < 1:
                    m = Image.new("L", im.size, 0)
                    ImageDraw.Draw(m).rectangle((0, 0, cx - r + 2 * r * fill_frac, im.height), fill=255)
                    full.putalpha(Image.fromarray(np.minimum(np.asarray(full.getchannel("A")), np.asarray(m))))
                im.alpha_composite(full)
        return im


class ButtonLayer(Layer):
    default_anim = "pop"

    def build(self):
        s = self.s
        size = self.px(s.get("size", 64))
        f = font(s.get("weight", "bold"), size, self.c.font_path(s))
        txt = s.get("text", "COMPRE AGORA")
        tw = f.getlength(txt)
        asc, desc = f.getmetrics()
        padx, pady = size * 0.9, size * 0.55
        w, h = tw + 2 * padx + (size * 1.1 if s.get("icon", "arrow") else 0), asc + desc + 2 * pady
        col = rgb(self.c.color(s.get("color", "accent")))
        tc = rgb(self.c.color(s["text_color"])) if s.get("text_color") else readable_on(col)
        im = Image.new("RGBA", (int(w + 40), int(h + 50)), (0, 0, 0, 0))
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle((20, 34, 20 + w, 34 + h), radius=int(h / 2), fill=(0, 0, 0, 110))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12)))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((20, 20, 20 + w, 20 + h), radius=int(h / 2), fill=col + (255,))
        d.rounded_rectangle((20, 20, 20 + w, 20 + h * 0.5), radius=int(h / 2), fill=(255, 255, 255, 38))
        d.text((20 + padx, 20 + pady), txt, font=f, fill=tc)
        if s.get("icon", "arrow"):
            ax, ay = 20 + padx + tw + size * 0.45, 20 + h / 2
            L = size * 0.42
            d.line((ax, ay, ax + L, ay), fill=tc, width=max(3, int(size / 9)))
            d.line((ax + L * 0.55, ay - L * 0.45, ax + L, ay, ax + L * 0.55, ay + L * 0.45), fill=tc,
                   width=max(3, int(size / 9)), joint="curve")
        self._bw, self._bh = w, h
        return im

    def sprite(self, t, lt, st):
        base = super().sprite(t, lt, st)
        if not self.s.get("shine", True):
            return base
        per = 2.2
        p = (lt % per) / 0.7
        if p > 1:
            return base
        im = base.copy()
        w, h = im.size
        band = Image.new("L", (w, h), 0)
        x = -w * 0.3 + p * w * 1.6
        ImageDraw.Draw(band).polygon([(x, 0), (x + h * 0.5, 0), (x, h), (x - h * 0.5, h)], fill=120)
        band = band.filter(ImageFilter.GaussianBlur(8))
        a = np.minimum(np.asarray(band), np.asarray(im.getchannel("A")))
        white = Image.new("RGBA", (w, h), (255, 255, 255, 0))
        white.putalpha(Image.fromarray(a))
        im.alpha_composite(white)
        return im

    def draw(self, canvas, t):
        if self._spr is None:
            self._spr = self.build()
        if self.s.get("ripple", True) and self.t_in + self.in_dur <= t <= self.t_out:
            self._ripple(canvas, t - self.t_in)  # ondas atrás do botão
        super().draw(canvas, t)

    def _ripple(self, canvas, lt):
        p = ((lt - self.in_dur) % 1.4) / 1.4
        x, y = self.s.get("x", 0.5) * self.W, self.s.get("y", 0.5) * self.H
        rw = self._bw * (0.5 + 0.35 * ease_out_cubic(p))
        rh = self._bh * (0.5 + 0.9 * ease_out_cubic(p))
        ov = Image.new("RGBA", (int(rw * 2 + 20), int(rh * 2 + 20)), (0, 0, 0, 0))
        col = rgb(self.c.color(self.s.get("color", "accent")), int(200 * (1 - p)))
        ImageDraw.Draw(ov).rounded_rectangle((10, 10, 10 + rw * 2, 10 + rh * 2), radius=int(rh), outline=col, width=int(self.px(6)))
        safe_composite(canvas, ov, x - ov.width / 2, y - ov.height / 2)


class PriceLayer(Layer):
    """Preço antigo riscado (risco animado) + preço novo grande."""
    default_anim = "pop"

    def draw(self, canvas, t):
        if t < self.t_in or t > self.t_out:
            return
        s = self.s
        st, lt = self.state(t)
        x, y = s.get("x", 0.5) * self.W + st["dx"], s.get("y", 0.5) * self.H + st["dy"]
        if not hasattr(self, "_old"):
            fp = self.c.font_path(s)
            self._old = render_text(s.get("old", ""), self.W * 0.8, self.px(s.get("old_size", 64)),
                                    self.c.color(s.get("old_color", "text")), weight="bold", font_path=fp) if s.get("old") else None
            self._new = render_text(s.get("new", ""), self.W * 0.9, self.px(s.get("size", 170)),
                                    self.color("color", "accent"), weight="black", font_path=fp, stroke=int(self.px(s.get("stroke", 0))))
            self._lbl = render_text(s["label"], self.W * 0.8, self.px(s.get("label_size", 44)), self.color("label_color", "text"),
                                    weight="medium", font_path=fp) if s.get("label") else None
        gap = self.px(8)
        oh = self._old.height if self._old else 0
        lh = self._lbl.height if self._lbl else 0
        total = oh + self._new.height + lh
        top = y - total / 2
        if self._lbl:
            place(canvas, self._lbl, x, top + lh / 2, st["scale"], 0, st["op"] * clamp(lt / 0.3))
            top += lh
        if self._old:
            oy = top + oh / 2
            place(canvas, self._old, x, oy, 1, 0, st["op"] * clamp(lt / 0.25) * 0.85)
            p = ease_out_cubic(prog(lt, 0.25, 0.35))
            if p > 0:
                sw = (self._old.width - self.px(50)) * p
                d = ImageDraw.Draw(canvas)
                x0 = x - (self._old.width - self.px(50)) / 2
                d.line((x0, oy + self.px(4), x0 + sw, oy - self.px(4)), fill=rgb(self.c.color(s.get("strike_color", "#FF2D55"))),
                       width=int(self.px(9)))
            top += oh + gap
        pn = prog(lt, 0.45, 0.45)
        if pn > 0:
            pulse = 1 + 0.035 * math.sin(2 * math.pi * max(0, lt - 0.9) / 0.9) if lt > 0.9 else 1
            place(canvas, self._new, x, top + self._new.height / 2, max(0, ease_out_back(pn, 2.5)) * pulse * st["scale"], 0,
                  clamp(pn * 3) * st["op"])


class BadgeLayer(Layer):
    """Selo estourado (-50%, NOVO, FRETE GRÁTIS) com texto."""
    default_anim = "spin"

    def build(self):
        s = self.s
        D = s.get("w", 0.28) * self.W
        col = rgb(self.c.color(s.get("color", "accent")))
        im = Image.new("RGBA", (int(D + 8), int(D + 8)), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        cx = cy = D / 2 + 4
        if s.get("shape", "burst") == "burst":
            n = 16
            pts = [(cx + (D / 2 if i % 2 == 0 else D / 2 * 0.86) * math.cos(math.pi * i / n),
                    cy + (D / 2 if i % 2 == 0 else D / 2 * 0.86) * math.sin(math.pi * i / n)) for i in range(2 * n)]
            d.polygon(pts, fill=col + (255,))
        else:
            d.ellipse((4, 4, D + 4, D + 4), fill=col + (255,))
        d.ellipse((cx - D * 0.36, cy - D * 0.36, cx + D * 0.36, cy + D * 0.36), outline=readable_on(col) + (90,), width=max(2, int(D / 60)))
        tc = rgb(self.c.color(s["text_color"])) if s.get("text_color") else readable_on(col)
        txt = render_text(s.get("text", "-50%"), D * 0.68, D * 0.3, tc, weight="black", max_lines=2, shadow=False,
                          font_path=self.c.font_path(s))
        safe_composite(im, txt, cx - txt.width / 2, cy - txt.height / 2)
        return im.rotate(s.get("tilt", -12), resample=Image.BICUBIC, expand=True)


class ParticlesLayer(Layer):
    default_anim = "fade"

    def __init__(self, s, comp):
        super().__init__(s, comp)
        r = random.Random(s.get("seed", 3))
        n = int(s.get("count", 60))
        cols = s.get("colors") or [self.c.color(c) for c in ("accent", "primary", "#FFFFFF")]
        self.p = [dict(x=r.random(), y=r.random(), vx=r.uniform(-0.05, 0.05), vy=r.uniform(0.12, 0.35),
                       rot=r.uniform(0, 360), vr=r.uniform(-300, 300), sz=r.uniform(0.6, 1.4), ph=r.uniform(0, 6.28),
                       col=rgb(self.c.color(r.choice(cols)))) for _ in range(n)]
        self.dot = None

    def draw(self, canvas, t):
        if t < self.t_in or t > self.t_out:
            return
        st, lt = self.state(t)
        kind = self.s.get("kind", "confetti")
        ov = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        W, H, U = self.W, self.H, self.U
        for q in self.p:
            if kind == "confetti":
                x = (q["x"] + q["vx"] * lt + 0.02 * math.sin(lt * 3 + q["ph"])) * W
                y = ((q["y"] - 1.1) + q["vy"] * lt * 2.2) * H
                if not (-50 < y < H + 50):
                    continue
                a = math.radians(q["rot"] + q["vr"] * lt)
                w, h = 18 * U * q["sz"], 9 * U * q["sz"] * abs(math.cos(lt * 6 + q["ph"]))
                pts = [(x + dx * math.cos(a) - dy * math.sin(a), y + dx * math.sin(a) + dy * math.cos(a))
                       for dx, dy in ((-w, -h), (w, -h), (w, h), (-w, h))]
                d.polygon(pts, fill=q["col"] + (255,))
            elif kind == "sparkle":
                tw = 0.5 + 0.5 * math.sin(lt * 5 + q["ph"] * 3)
                x, y = q["x"] * W, q["y"] * H
                r = 14 * U * q["sz"] * tw
                if r < 1:
                    continue
                pts = []
                for k in range(8):
                    rr = r if k % 2 == 0 else r * 0.22
                    ang = math.pi * k / 4
                    pts.append((x + rr * math.cos(ang), y + rr * math.sin(ang)))
                d.polygon(pts, fill=(255, 255, 255, int(255 * tw)))
            else:  # bokeh: bolinhas suaves subindo
                if self.dot is None:
                    self.dot = radial_glow(256, "#FFFFFF", 1.0)
                x = (q["x"] + 0.03 * math.sin(lt * 0.8 + q["ph"])) * W
                y = ((q["y"] - q["vy"] * lt * 0.25) % 1.1) * H
                sz = int(70 * U * q["sz"])
                spr = self.dot.resize((sz, sz))
                tint = Image.new("RGBA", spr.size, q["col"] + (0,))
                tint.putalpha(spr.getchannel("A").point(lambda v: int(v * 0.35)))
                safe_composite(ov, tint, x - sz / 2, y - sz / 2)
        if st["op"] < 1:
            ov.putalpha(ov.getchannel("A").point(lambda v: int(v * st["op"])))
        canvas.alpha_composite(ov)


class Object3DLayer(Layer):
    default_anim = "zoom-out"

    def __init__(self, s, comp):
        super().__init__(s, comp)
        import render3d
        self.r3 = render3d
        self.opts = {k: (comp.path(v) if k in ("front", "back", "left", "right", "top", "bottom", "label", "cap", "texture")
                         and isinstance(v, str) and not v.startswith("#") else v) for k, v in s.items()}
        self.obj = render3d.build_object(self.opts)
        self.side = int(s.get("w", 0.75) * self.W)
        self.n = max(1, int(round((min(self.t_out, comp.duration) - self.t_in) * comp.fps)))
        self.files = None
        self.cache = {}

    def _kw(self, i):
        s = self.s
        yaw, sc, bob = self.r3.motion_at(s.get("motion") or self.obj.default_motion,
                                         (i % self.n) / self.n * s.get("turns", 1.0), s.get("yaw", 0))
        return dict(W=self.side, H=self.side, yaw=yaw, tilt=s.get("tilt", 14), bob=bob, scale=sc, ss=s.get("ss", 1.5),
                    shadow=s.get("shadow", True), fill=s.get("fill", 0.72))

    def sprite(self, t, lt, st):
        i = min(self.n - 1, int(lt * self.c.fps))
        if self.c.still:  # prévia: renderiza só o quadro pedido
            return self.r3.render_frame(self.obj, **self._kw(i))
        if self.files is None:  # pré-renderiza tudo em paralelo (todos os núcleos)
            tmp = tempfile.mkdtemp(prefix="obj3d_")
            jobs = [(k, os.path.join(tmp, f"f_{k:05d}.png"), self._kw(k)) for k in range(self.n)]
            self.r3.render_parallel(self.opts, jobs)
            self.files = [j[1] for j in jobs]
        if i not in self.cache:
            self.cache = {i: Image.open(self.files[i]).convert("RGBA")}
        return self.cache[i]


class VideoLayer(Layer):
    default_anim = "none"

    def __init__(self, s, comp):
        super().__init__(s, comp)
        wf = float(s.get("w", 1.0))
        hf = float(s["h"]) if "h" in s else (1.0 if wf >= 1.0 else wf * self.W * 9 / 16 / self.H)
        self.w = int(wf * self.W) // 2 * 2
        self.h = int(hf * self.H) // 2 * 2
        self.reader = None
        self.idx = -1
        self.last = None

    def sprite(self, t, lt, st):
        if self.reader is None:
            s = self.s
            fitm = s.get("fit", "cover")
            sp = float(s.get("speed", 1.0))
            vf = f"setpts=PTS/{sp},fps={self.c.fps},"
            if fitm == "cover":
                vf += f"scale={self.w}:{self.h}:force_original_aspect_ratio=increase,crop={self.w}:{self.h}"
            else:
                vf += (f"scale={self.w}:{self.h}:force_original_aspect_ratio=decrease,format=rgba,"
                       f"pad={self.w}:{self.h}:(ow-iw)/2:(oh-ih)/2:color=black@0")
            vf += ",format=rgba"
            if s.get("grade"):
                vf = GRADES.get(s["grade"], "") + ("," if GRADES.get(s["grade"]) else "") + vf
            cmd = [ffmpeg_bin(), "-v", "error", "-ss", str(s.get("start", 0)), "-i", self.c.path(s["src"]),
                   "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgba", "-"]
            self.reader = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        i = int(round(lt * self.c.fps))
        size = self.w * self.h * 4
        while self.idx < i:
            buf = self.reader.stdout.read(size)
            if len(buf) < size:
                break
            self.last = Image.frombytes("RGBA", (self.w, self.h), buf)
            self.idx += 1
        im = self.last
        if im is not None and self.s.get("radius"):
            m = Image.new("L", im.size, 0)
            ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=int(self.px(self.s["radius"])), fill=255)
            im = im.copy()
            im.putalpha(m)
        return im

    def audio(self):
        s = self.s
        if not s.get("audio", True):
            return None
        dur = min(self.t_out, self.c.duration) - self.t_in
        return audio_mod.load(self.c.path(s["src"]), seconds=dur * s.get("speed", 1.0), start=s.get("start", 0))


GRADES = {
    "punchy": "eq=contrast=1.12:saturation=1.25:brightness=0.01,unsharp=5:5:0.6",
    "warm": "colorbalance=rs=0.06:gs=0.01:bs=-0.06:rm=0.04:bm=-0.04,eq=saturation=1.1",
    "cool": "colorbalance=rs=-0.05:bs=0.07:bm=0.04,eq=saturation=1.05",
    "cinematic": "colorbalance=rs=-0.06:bs=0.08:rh=0.08:bh=-0.06,eq=contrast=1.08:saturation=1.05",
    "bw": "hue=s=0,eq=contrast=1.15",
}

class ExplodeLayer(Layer):
    """Vista explodida do pin (explode.py): tinta, metal e tarraxa se separam em 3D e se juntam com impacto."""
    default_anim = "none"

    def __init__(self, s, comp):
        super().__init__(s, comp)
        import explode
        self.ex = explode
        self.pin = None

    def sprite(self, t, lt, st):
        if self.pin is None:
            s = self.s
            src = self.c.path(s["src"])
            im = cutout_cached(src, s.get("cutout_method", "auto")).copy() if s.get("cutout", True) else load_image(src)
            accent = self.c.color(s.get("label_color", "accent"))
            accent = accent if isinstance(accent, str) and accent.startswith("#") else "#FFC72C"
            self.pin = self.ex.ExplodedPin(im, size=int(s.get("w", 1.0) * self.W), fill=s.get("fill", 0.5),
                                           labels=tuple(s.get("labels", ("TINTA", "METAL", "TARRAXA"))), accent=accent)
        return self.pin.frame(*self.ex.timeline(lt, float(self.s.get("cycle", 5.0))))


LAYER_TYPES = {"explode": ExplodeLayer, "text": TextLayer, "image": ImageLayer, "shape": ShapeLayer, "counter": CounterLayer, "stars": StarsLayer,
               "button": ButtonLayer, "price": PriceLayer, "badge": BadgeLayer, "particles": ParticlesLayer,
               "object3d": Object3DLayer, "video": VideoLayer}


# ============================================================ fundo
class Background:
    def __init__(self, spec, comp):
        self.c = comp
        W, H = comp.W, comp.H
        if spec is None:
            spec = {"type": "gradient"}
        if isinstance(spec, str):
            spec = {"type": "transparent"} if spec == "transparent" else {"type": "color", "color": spec}
        self.s = spec
        kind = spec.get("type", "gradient")
        self.kind = kind
        self.video = None
        if kind == "transparent":
            self.base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        elif kind == "color":
            self.base = Image.new("RGBA", (W, H), rgb(comp.color(spec.get("color", "secondary"))) + (255,))
        elif kind == "image":
            self.img = load_image(comp.path(spec["src"]))
            self.img = cover(self.img, int(W * 1.12), int(H * 1.12))
            if spec.get("blur"):
                self.img = self.img.filter(ImageFilter.GaussianBlur(spec["blur"]))
            if spec.get("darken"):
                dk = Image.new("RGBA", self.img.size, (0, 0, 0, int(255 * spec["darken"])))
                self.img.alpha_composite(dk)
            self.base = None
        elif kind == "video":
            vs = dict(spec)
            vs.update(type="video", w=1.0)
            self.video = VideoLayer(vs, comp)
            self.base = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        else:
            cols = spec.get("colors") or [comp.color("secondary"), comp.color("primary")]
            cols = [comp.color(c) for c in cols]
            self.base = gradient(W, H, cols[0], cols[-1], spec.get("angle", 160))
        glows = spec.get("glow", [comp.color("primary")] if kind == "gradient" else [])
        glows = [glows] if isinstance(glows, str) else glows
        self.glows = [(radial_glow(max(W, H) * 0.9, comp.color(g), spec.get("glow_strength", 0.55)), i) for i, g in enumerate(glows)]
        self.vig = None
        if spec.get("vignette", kind != "transparent"):
            y, x = np.mgrid[-1:1:H * 1j, -1:1:W * 1j]
            a = np.clip((np.sqrt(x * x * 0.8 + y * y * 0.8) - 0.55) / 0.9, 0, 1) ** 1.6 * 200 * spec.get("vignette_strength", 0.8)
            v = np.zeros((H, W, 4), np.uint8)
            v[..., 3] = a.astype(np.uint8)
            self.vig = Image.fromarray(v, "RGBA")
        self.grain = None
        if spec.get("grain"):
            g = np.random.default_rng(1).integers(0, 255, (3, H, W), dtype=np.uint8)
            self.grain = [Image.fromarray(np.dstack([g[i], g[i], g[i], np.full((H, W), 14, np.uint8)]), "RGBA") for i in range(3)]

    def frame(self, t, i):
        W, H = self.c.W, self.c.H
        if self.kind == "image":
            k = 1 + 0.1 * t / max(self.c.duration, 0.1) if self.s.get("kenburns", True) else 1.0
            iw, ih = self.img.size
            cw, ch = W * 1.12 / k, H * 1.12 / k
            x0, y0 = (iw - cw) / 2, (ih - ch) / 2
            fr = self.img.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.BILINEAR)
        elif self.kind == "video":
            fr = self.base.copy()
            v = self.video.sprite(t, t, {})
            if v is not None:
                fr.alpha_composite(v)
        else:
            fr = self.base.copy()
        for g, k in self.glows:
            ang = t * 0.35 + k * 2.1
            cx = W * (0.5 + 0.32 * math.cos(ang))
            cy = H * (0.45 + 0.28 * math.sin(ang * 1.3))
            safe_composite(fr, g, cx - g.width / 2, cy - g.height / 2)
        if self.vig is not None:
            fr.alpha_composite(self.vig)
        if self.grain is not None:
            fr.alpha_composite(self.grain[i % 3])
        return fr


# ============================================================ composição
DEFAULT_BRAND = {"primary": "#7B2FF7", "secondary": "#0E0B1F", "accent": "#FFD23F", "text": "#FFFFFF"}


class Comp:
    def __init__(self, spec, project, base_dir, still=False):
        self.spec = spec
        self.still = still
        self.W, self.H = resolve_size(project)
        self.U = min(self.W, self.H) / 1080
        self.fps = int(project.get("fps", 30))
        self.duration = float(spec.get("duration", 4))
        self.base_dir = base_dir
        self.brand = dict(DEFAULT_BRAND)
        self.brand.update(project.get("brand", {}))
        self.brand.update(spec.get("brand", {}))
        self.bg = Background(spec.get("background", project.get("background")), self)
        self.layers = [LAYER_TYPES[l["type"]](l, self) for l in spec.get("layers", [])]

    def color(self, c):
        if isinstance(c, (list, tuple)):
            return tuple(c)
        if c in self.brand:
            return self.brand[c]
        return c

    def font_path(self, s):
        p = s.get("font") or self.brand.get("font")
        return self.path(p) if p else None

    def path(self, p):
        return p if os.path.isabs(p) else os.path.join(self.base_dir, p)

    def frame(self, t, i):
        fr = self.bg.frame(t, i)
        for l in self.layers:
            l.draw(fr, t)
        return fr


# ============================================================ transições entre cenas
def apply_transition(kind, fr, prev, t, brand, W, H):
    if not kind or kind == "none":
        return fr
    if kind == "flash":
        p = prog(t, 0, 0.22)
        if p < 1:
            fl = Image.new("RGBA", fr.size, (255, 255, 255, int(220 * (1 - p) ** 2)))
            fr.alpha_composite(fl)
        return fr
    if kind == "zoom":  # punch-in
        p = ease_out_cubic(prog(t, 0, 0.3))
        if p < 1:
            k = 1 + 0.14 * (1 - p)
            cw, ch = W / k, H / k
            fr = fr.crop((int((W - cw) / 2), int((H - ch) / 2), int((W + cw) / 2), int((H + ch) / 2))).resize((W, H), Image.BILINEAR)
        return fr
    if kind in ("slide", "whip") and prev is not None:
        p = ease_out_cubic(prog(t, 0, 0.28 if kind == "whip" else 0.38))
        if p < 1:
            out = Image.new("RGBA", fr.size, (0, 0, 0, 255))
            off = int(W * (1 - p))
            a, b = prev, fr
            if kind == "whip":
                bl = int(40 * (1 - p)) + 1
                a = a.resize((max(1, W // bl), H)).resize((W, H))
                b = b.resize((max(1, W // bl), H)).resize((W, H))
            safe_composite(out, a, off - W, 0)
            safe_composite(out, b, off, 0)
            return out
        return fr
    if kind == "fade" and prev is not None:
        p = prog(t, 0, 0.35)
        return Image.blend(prev, fr, p) if p < 1 else fr
    if kind == "bars":  # barras na cor da marca varrem a tela
        p = prog(t, 0, 0.45)
        if p < 1:
            d = ImageDraw.Draw(fr)
            cols = [rgb(brand.get("accent")), rgb(brand.get("primary")), rgb(brand.get("secondary"))]
            for k, col in enumerate(cols):
                q = ease_in_out(clamp(p * 1.4 - k * 0.15))
                x = W * q * 1.3 - W * 0.15
                d.polygon([(x, 0), (x + W * 1.3, 0), (x + W * 1.3 - H * 0.25, H), (x - H * 0.25, H)], fill=col + (255,))
        return fr
    if kind == "circle":
        p = ease_out_cubic(prog(t, 0, 0.4))
        if p < 1 and prev is not None:
            m = Image.new("L", fr.size, 0)
            r = math.hypot(W, H) / 2 * p
            ImageDraw.Draw(m).ellipse((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), fill=255)
            out = prev.copy()
            out.paste(fr, (0, 0), m)
            return out
        return fr
    return fr


TRANSITION_SFX = {"zoom": "whoosh", "slide": "whoosh", "whip": "whoosh", "bars": "whoosh", "circle": "whoosh",
                  "flash": "impact", "fade": None, "none": None}


def codec_args(ext, alpha):
    if ext == ".mov":
        return ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0"] if alpha else \
            ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17"]
    if ext == ".webm":
        return ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p" if alpha else "yuv420p", "-b:v", "0", "-crf", "26", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4"]
    if ext == ".gif":
        return ["-vf", "fps=15,split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0"]
    return ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-profile:v", "high"]


def scenes_of(project):
    if "scenes" in project:
        return project["scenes"]
    sc = {k: v for k, v in project.items() if k in ("duration", "background", "layers", "brand")}
    return [sc]


def snap_durations(project):
    a = project.get("audio") or {}
    if not a.get("snap_to_beat") or not a.get("bpm"):
        return
    beat = 60 / float(a["bpm"])
    for sc in project["scenes"] if "scenes" in project else []:
        d = float(sc.get("duration", 4))
        sc["duration"] = max(beat * 2, round(d / beat) * beat)


def render_project(project, out, base_dir=".", stills=0, quiet=False):
    project = copy.deepcopy(project)
    snap_durations(project)
    W, H = resolve_size(project)
    fps = int(project.get("fps", 30))
    scenes = scenes_of(project)
    ext = os.path.splitext(out)[1].lower()
    first_bg = scenes[0].get("background", project.get("background"))
    alpha = first_bg == "transparent" or (isinstance(first_bg, dict) and first_bg.get("type") == "transparent")
    starts, total = [], 0.0
    for sc in scenes:
        starts.append(total)
        total += float(sc.get("duration", 4))
    brand = dict(DEFAULT_BRAND)
    brand.update(project.get("brand", {}))

    if stills:
        times = list(stills) if isinstance(stills, (list, tuple)) else [total * (k + 0.5) / stills for k in range(stills)]
        shots = []
        for gt in times:
            si = max(i for i, s in enumerate(starts) if s <= gt)
            comp = Comp(scenes[si], project, base_dir, still=True)
            lt = gt - starts[si]
            fr = comp.frame(lt, int(lt * fps))
            shots.append((gt, fr))
        cols = min(len(shots), 4 if H > W else 3)
        rows = math.ceil(len(shots) / cols)
        tw = 360 if H > W else 480
        th = int(tw * H / W)
        sheet = Image.new("RGB", (cols * tw + (cols + 1) * 10, rows * (th + 40) + 10), (30, 30, 34))
        d = ImageDraw.Draw(sheet)
        for k, (gt, fr) in enumerate(shots):
            bgc = Image.new("RGBA", fr.size, (70, 70, 80, 255))  # xadrez neutro p/ alfa
            bgc.alpha_composite(fr)
            x, y = 10 + (k % cols) * (tw + 10), 10 + (k // cols) * (th + 40)
            sheet.paste(bgc.convert("RGB").resize((tw, th), Image.LANCZOS), (x, y))
            d.text((x, y + th + 6), f"{gt:.2f}s", font=font("medium", 22), fill=(220, 220, 220))
        path = out if out.lower().endswith(".png") else os.path.splitext(out)[0] + "_stills.png"
        sheet.save(path)
        print(path)
        return path

    tmpdir = tempfile.mkdtemp(prefix="motion_")
    vid_tmp = out if alpha else os.path.join(tmpdir, "video" + (ext if ext in (".mp4", ".mov", ".webm") else ".mp4"))
    cmd = [ffmpeg_bin(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(fps),
           "-i", "-"] + codec_args(ext, alpha) + [vid_tmp]
    pipe = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    sfx, clips = [], []
    a = project.get("audio") or {}
    use_sfx = a.get("sfx", True)
    prev = None
    default_tr = project.get("transition", "zoom")
    for si, sc in enumerate(scenes):
        comp = Comp(sc, project, base_dir)
        n = int(round(comp.duration * fps))
        tr = sc.get("transition", default_tr) if si > 0 else sc.get("transition", "none")
        if use_sfx and si > 0 and TRANSITION_SFX.get(tr):
            sfx.append((starts[si] - 0.12, TRANSITION_SFX[tr], -4 if tr != "flash" else -6))
        for l in comp.layers:
            if use_sfx and l.s.get("sfx"):
                sfx.append((starts[si] + l.t_in + float(l.s.get("sfx_offset", 0.0)), l.s["sfx"], float(l.s.get("sfx_db", 0))))
            if isinstance(l, VideoLayer):
                au = l.audio()
                if au is not None and len(au):
                    clips.append((starts[si] + l.t_in, au, float(l.s.get("volume_db", 0))))
        if isinstance(comp.bg.video, VideoLayer) and sc.get("background", {}).get("audio", False):
            au = comp.bg.video.audio()
            if au is not None and len(au):
                clips.append((starts[si], au, float(sc["background"].get("volume_db", 0))))
        for i in range(n):
            t = i / fps
            fr = comp.frame(t, i)
            fr = apply_transition(tr, fr, prev, t, brand, W, H)
            pipe.stdin.write(fr.tobytes())
            if i == n - 1:
                prev = fr
        if not quiet:
            print(f"  cena {si + 1}/{len(scenes)} ok ({comp.duration:.2f}s)", flush=True)
    pipe.stdin.close()
    if pipe.wait() != 0:
        raise SystemExit("ffmpeg falhou ao gravar o vídeo")
    if alpha:
        print(out)
        return out
    music = a.get("music", "auto")
    if music and music != "auto":
        music = os.path.join(base_dir, music) if not os.path.isabs(music) else music
    voice = a.get("voice")
    if voice and not os.path.isabs(voice):
        voice = os.path.join(base_dir, voice)
    wav = os.path.join(tmpdir, "mix.wav")
    has_audio = music or voice or clips or sfx
    if has_audio:
        audio_mod.mix(total, wav, music=music, bpm=float(a.get("bpm", 120)), style=a.get("style", "pop"),
                      music_db=float(a.get("music_db", -4 if not (voice or clips) else -10)), sfx_events=sfx, clips=clips,
                      voice=voice, duck=a.get("duck", True), sfx_db=float(a.get("sfx_db", -3)))
        mux = [ffmpeg_bin(), "-y", "-loglevel", "error", "-i", vid_tmp, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
               "-af", f"loudnorm=I={a.get('lufs', -14)}:TP=-1.0:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
               "-shortest", "-movflags", "+faststart", out]
        r = subprocess.run(mux, stderr=subprocess.PIPE, text=True)
        if r.returncode != 0:
            raise SystemExit(r.stderr[-1500:])
    else:
        os.replace(vid_tmp, out)
    print(out)
    return out


# ============================================================ presets
def preset_comp(name, a):
    fmt = a.format
    tr = "transparent"
    acc = a.accent or "accent"
    col = a.color or "primary"
    if name == "title":
        layers = [{"type": "text", "text": a.text or "Seu *título* aqui", "y": a.y or 0.45, "size": a.size or 120,
                   "anim": "pop-words", "upper": True, "sfx": "pop", "hl_color": acc, "stroke": 0}]
        if a.sub:
            layers.append({"type": "text", "text": a.sub, "y": (a.y or 0.45) + 0.11, "size": 50, "weight": "medium",
                           "anim": "slide-up", "in": 0.6})
        return {"format": fmt, "duration": a.seconds or 3, "background": a.bg or tr, "layers": layers}
    if name == "lower-third":
        y = a.y or 0.80
        return {"format": fmt, "duration": a.seconds or 5, "background": a.bg or tr, "layers": [
            {"type": "shape", "shape": "rect", "x": 0.30, "y": y, "w": 0.52, "h": 0.115, "radius": 18, "color": col,
             "anim": "wipe", "in_dur": 0.45, "out": (a.seconds or 5) - 0.1, "exit": "wipe"},
            {"type": "shape", "shape": "rect", "x": 0.045, "y": y, "w": 0.012, "h": 0.115, "color": acc, "anim": "pop", "in": 0.1},
            {"type": "text", "text": a.text or "Nome Sobrenome", "x": 0.065, "anchor": "left", "y": y - 0.016, "size": 60, "max_w": 0.46,
             "align": "left", "anim": "mask-up", "in": 0.25, "weight": "bold", "shadow": False, "out": (a.seconds or 5) - 0.15},
            {"type": "text", "text": a.sub or "Cargo • Empresa", "x": 0.065, "anchor": "left", "y": y + 0.03, "size": 38, "max_w": 0.46,
             "align": "left", "anim": "mask-up", "in": 0.38, "weight": "medium", "color": acc, "shadow": False,
             "out": (a.seconds or 5) - 0.15}]}
    if name == "logo-reveal":
        layers = [
            {"type": "shape", "shape": "ring", "w": 0.5, "stroke": 6, "color": acc, "anim": "draw", "in_dur": 0.7,
             "keys": {"scale": [[0.7, 1], [1.4, 1.6, "out"]], "opacity": [[0.9, 1], [1.4, 0]]}},
            {"type": "particles", "kind": "sparkle", "count": 26, "in": 0.6},
            {"type": "image", "src": a.image, "w": 0.42, "h": 0.42, "anim": "elastic", "in": 0.5, "in_dur": 0.9,
             "shadow": False, "glow": col, "sfx": "impact"} if a.image else
            {"type": "text", "text": a.text or "MARCA", "size": 150, "anim": "elastic", "in": 0.5, "in_dur": 0.9, "sfx": "impact"},
        ]
        if a.sub or (a.image and a.text):
            layers.append({"type": "text", "text": a.sub or a.text, "y": 0.5 + (0.17 if a.image else 0.09), "size": 46,
                           "weight": "medium", "anim": "mask-up", "in": 1.2})
        return {"format": fmt, "duration": a.seconds or 3.5, "background": a.bg or {"type": "gradient"}, "layers": layers}
    if name == "callout":
        x, y = a.x or 0.6, a.y or 0.45
        return {"format": fmt, "duration": a.seconds or 3, "background": a.bg or tr, "layers": [
            {"type": "shape", "shape": "ring", "x": x, "y": y, "w": 0.22, "stroke": 9, "color": acc, "anim": "draw", "in_dur": 0.5,
             "idle": ["pulse"], "sfx": "tick"},
            {"type": "shape", "shape": "arrow", "x": x - 0.25, "y": y + 0.12, "w": 0.22, "stroke": 9, "rot": 28, "color": acc,
             "anim": "draw", "in": 0.35, "in_dur": 0.4},
            {"type": "text", "text": a.text or "Olha isso!", "x": x - 0.25, "y": y + 0.19, "size": 58, "max_w": 0.5,
             "anim": "pop", "in": 0.6, "box": {"color": acc, "opacity": 1}, "color": "#111111", "shadow": False}]}
    if name == "counter":
        return {"format": fmt, "duration": a.seconds or 3, "background": a.bg or tr, "layers": [
            {"type": "counter", "from": 0, "to": float(a.value or 10000), "prefix": a.prefix or "+", "suffix": a.suffix or "",
             "size": a.size or 170, "y": a.y or 0.45, "color": acc, "count_dur": 1.6},
            {"type": "text", "text": a.text or "clientes satisfeitos", "y": (a.y or 0.45) + 0.09, "size": 54, "weight": "medium",
             "anim": "slide-up", "in": 0.4}]}
    if name == "cta":
        return {"format": fmt, "duration": a.seconds or 3, "background": a.bg or tr, "layers": [
            {"type": "text", "text": a.sub or "Últimas unidades", "y": (a.y or 0.62) - 0.1, "size": 54, "weight": "bold",
             "anim": "slide-up", "idle": ["blink"], "color": acc},
            {"type": "button", "text": a.text or "COMPRE AGORA", "y": a.y or 0.62, "size": 64, "color": acc, "in": 0.15,
             "idle": ["heartbeat"], "sfx": "pop"}]}
    if name == "transition":
        return {"format": fmt, "duration": a.seconds or 0.8, "background": tr, "layers": [
            {"type": "shape", "shape": "rect", "w": 1.5, "h": 3.2, "rot": 18, "color": c, "anim": "none",
             "keys": {"x": [[0.0 + k * 0.06, -1.0], [0.4 + k * 0.06, 0.5, "inout"], [0.8, 2.0, "in"]]}}
            for k, c in enumerate([acc, col, "secondary"])]}
    if name == "price":
        return {"format": fmt, "duration": a.seconds or 3, "background": a.bg or tr, "layers": [
            {"type": "price", "old": a.sub or "De R$ 199,90", "new": a.text or "R$ 99,90", "label": "por apenas", "y": a.y or 0.5,
             "sfx": "ding", "sfx_offset": 0.45},
            {"type": "badge", "text": a.prefix or "-50%", "x": 0.78, "y": (a.y or 0.5) - 0.15, "w": 0.26, "in": 0.8, "idle": ["wiggle"]}]}
    if name == "confetti":
        return {"format": fmt, "duration": a.seconds or 3, "background": a.bg or tr,
                "layers": [{"type": "particles", "kind": "confetti", "count": 90}]}
    if name == "subscribe":
        return {"format": fmt, "duration": a.seconds or 3, "background": a.bg or tr, "layers": [
            {"type": "button", "text": a.text or "SIGA PARA MAIS", "y": a.y or 0.8, "size": 56, "color": col, "icon": None,
             "anim": "slide-up", "idle": ["pulse"], "out": (a.seconds or 3) - 0.1, "exit": "slide-down"}]}
    raise SystemExit(f"preset desconhecido: {name}")


PRESETS = ["title", "lower-third", "logo-reveal", "callout", "counter", "cta", "price", "transition", "confetti", "subscribe"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render")
    r.add_argument("project")
    r.add_argument("out")
    r.add_argument("--stills", type=int, default=0, help="gera folha de contato com N quadros em vez do vídeo")
    p = sub.add_parser("preset")
    p.add_argument("name", help="|".join(PRESETS) + " | list")
    for k in ("text", "sub", "image", "color", "accent", "prefix", "suffix", "value"):
        p.add_argument(f"--{k}")
    p.add_argument("--bg", help='"transparent" (padrão p/ overlays), "#cor", ou json de fundo')
    p.add_argument("--x", type=float)
    p.add_argument("--y", type=float)
    p.add_argument("--size", type=float)
    p.add_argument("--seconds", type=float)
    p.add_argument("--format", default="9:16")
    p.add_argument("--brand", help='json: {"primary":"#..","accent":"#..","secondary":"#..","text":"#.."}')
    p.add_argument("--out", default="preset.mov")
    p.add_argument("--stills", type=int, default=0)
    p.add_argument("--dump", help="salva o JSON gerado para editar depois")
    a = ap.parse_args()
    if a.cmd == "render":
        with open(a.project) as f:
            proj = json.load(f)
        render_project(proj, a.out, os.path.dirname(os.path.abspath(a.project)), a.stills)
    else:
        if a.name == "list":
            print("\n".join(PRESETS))
            return
        if a.bg and a.bg.startswith("{"):
            a.bg = json.loads(a.bg)
        if a.image:
            a.image = os.path.abspath(a.image)
        proj = preset_comp(a.name, a)
        if a.brand:
            proj["brand"] = json.loads(a.brand)
        proj.setdefault("audio", {"music": None, "sfx": True})
        if a.dump:
            with open(a.dump, "w") as f:
                json.dump(proj, f, indent=2, ensure_ascii=False)
        render_project(proj, a.out, os.getcwd(), a.stills)


if __name__ == "__main__":
    main()
