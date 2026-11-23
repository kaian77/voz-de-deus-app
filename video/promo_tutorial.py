"""Vídeos-tutorial da promoção (R$ 17,99 -> R$ 14,99): mostra no celular como achar
"Produtos em promoção" pelo Google ou pelo link da bio do Instagram.

Usa os prints reais do site (video/promo_assets). 28 variações = 2 caminhos x 7 ganchos x 2 temas.
Som: só uma trilha suave e um clique discreto igual em todos os toques.

    python3 video/promo_tutorial.py <pasta_saida> [indices...]
"""
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, "promo_assets")
W, H, FPS, SR = 1080, 1920, 30, 44100
ANTON = os.path.join(HERE, "news_assets", "Anton-Regular.ttf")
INTER = "/usr/share/fonts/opentype/inter/Inter-{}.otf"
RED, GOLD = (227, 38, 46), (255, 199, 44)

_fc = {}


def font(name, size):
    k = (name, size)
    if k not in _fc:
        path = ANTON if name == "anton" else INTER.format(name)
        _fc[k] = ImageFont.truetype(path, size)
    return _fc[k]


def ease(x):
    x = min(1.0, max(0.0, x))
    return 4 * x * x * x if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def back(x):
    x = min(1.0, max(0.0, x))
    c = 1.9
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


def kf(t, keys):
    """Interpola chaves (t, valor ou tupla) com ease."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            e = ease((t - t0) / max(1e-6, t1 - t0))
            if isinstance(v0, tuple):
                return tuple(a + (b - a) * e for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * e
    return keys[-1][1]


THEMES = {
    "dark": dict(bg=(14, 14, 14), glow=(120, 16, 20), text=(255, 255, 255), sub=(190, 190, 190), chip=(30, 30, 30), chip_text=(255, 255, 255), shadow=0.6),
    "light": dict(bg=(244, 240, 233), glow=(255, 214, 200), text=(17, 17, 17), sub=(90, 90, 90), chip=(255, 255, 255), chip_text=(17, 17, 17), shadow=0.25),
}


def background(th):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - H * 0.18) / H) ** 2)
    m = np.clip(1 - d * 1.6, 0, 1)[..., None] ** 1.6
    img = np.array(th["bg"], np.float32) * (1 - m) + np.array(th["glow"], np.float32) * m
    # granulado bem leve
    img += np.random.default_rng(1).normal(0, 2.2, img.shape[:2])[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def rays(th):
    n, S = 18, 1500
    img = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(img)
    for k in range(n):
        a0 = 2 * math.pi * k / n
        a1 = a0 + math.pi / n
        d.polygon([(S / 2, S / 2), (S / 2 + S * math.cos(a0), S / 2 + S * math.sin(a0)), (S / 2 + S * math.cos(a1), S / 2 + S * math.sin(a1))], fill=255)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    fall = np.clip(1 - np.sqrt((xx - S / 2) ** 2 + (yy - S / 2) ** 2) / (S / 2), 0, 1) ** 1.3
    alpha = (np.array(img, np.float32) * fall * (0.16 if th is THEMES["dark"] else 0.22)).astype(np.uint8)
    col = (230, 40, 46) if th is THEMES["dark"] else (255, 190, 60)
    out = Image.new("RGBA", (S, S), col + (0,))
    out.putalpha(Image.fromarray(alpha))
    return out


def sticker(size=250):
    """Selo dentado vermelho 'SÓ R$14,99'."""
    S = size * 2
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pts = []
    for k in range(48):
        r = S / 2 - 6 if k % 2 == 0 else S / 2 - 30
        a = 2 * math.pi * k / 48
        pts.append((S / 2 + r * math.cos(a), S / 2 + r * math.sin(a)))
    d.polygon(pts, fill=RED + (255,))
    d.ellipse((46, 46, S - 46, S - 46), outline=(255, 255, 255, 255), width=6)
    for txt_, sz, y in [("SÓ", 70, S * 0.2), ("R$14,99", 128, S * 0.36), ("NO SITE", 60, S * 0.66)]:
        f = font("anton", sz)
        tw = d.textlength(txt_, font=f)
        d.text(((S - tw) / 2, y), txt_, font=f, fill=GOLD if txt_ == "R$14,99" else (255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------- prints
def load(name):
    return Image.open(os.path.join(A, name + ".jpg")).convert("RGB")


def prepared():
    s = {n: load(n) for n in ["google", "site", "menu", "lista", "lista2", "lista5", "lista6", "lista8", "ig_perfil", "ig_site", "ig_menu"]}
    g = s["google"]
    d = ImageDraw.Draw(g)
    d.rectangle((0, 486, 1080, 652), fill=g.getpixel((20, 470)))  # tira a localização
    field = g.getpixel((700, 300))
    d.rectangle((165, 238, 780, 326), fill=field)  # campo de busca vazio (texto é digitado na animação)
    s["google_field"] = field
    s["google_blur"] = g.filter(ImageFilter.GaussianBlur(22))
    p = s["ig_perfil"]
    d = ImageDraw.Draw(p)
    d.rectangle((33, 815, 1050, 1205), fill=(255, 255, 255))  # tira o que só o dono vê
    f = font("SemiBold", 40)
    for x0, x1, bg, fg, label in [(36, 534, (0, 149, 246), (255, 255, 255), "Seguir"), (546, 1044, (239, 239, 239), (0, 0, 0), "Mensagem")]:
        d.rounded_rectangle((x0, 860, x1, 950), 20, fill=bg)
        tw = d.textlength(label, font=f)
        d.text(((x0 + x1 - tw) / 2, 880), label, font=f, fill=fg)
    return s


def card(img, box, size=400):
    """Recorte do produto com borda branca arredondada e sombra (RGBA)."""
    x, y = box
    c = img.crop((x + 34, y + 64, x + 434, y + 464)).resize((size, size), Image.LANCZOS)
    pad, b, r = 40, 12, 34
    out = Image.new("RGBA", (size + 2 * b + 2 * pad, size + 2 * b + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("L", out.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((pad + 6, pad + 18, out.size[0] - pad + 6, out.size[1] - pad + 18), r, fill=150)
    out.putalpha(sh.filter(ImageFilter.GaussianBlur(18)))
    out = Image.composite(Image.new("RGBA", out.size, (0, 0, 0, 255)), Image.new("RGBA", out.size, (0, 0, 0, 0)), out.split()[3])
    out.putalpha(out.split()[3].point(lambda v: v * 0.55))
    face = Image.new("RGBA", (size + 2 * b, size + 2 * b), (255, 255, 255, 255))
    m = Image.new("L", face.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, face.size[0] - 1, face.size[1] - 1), r, fill=255)
    mi = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mi).rounded_rectangle((0, 0, size - 1, size - 1), r - b, fill=255)
    face.paste(c, (b, b), mi)
    out.paste(face, (pad, pad), m)
    return out


PRODUCTS = [("lista2", (47, 799)), ("lista2", (565, 799)), ("lista3", (47, 1392)), ("lista3", (565, 1392)), ("lista4", (47, 1003)), ("lista4", (565, 1003)),
            ("lista5", (47, 801)), ("lista5", (565, 801)), ("lista6", (47, 1550)), ("lista6", (565, 1550)), ("lista8", (47, 1179)), ("lista8", (565, 1179))]

# ---------------------------------------------------------------- celular
SW, SH = 700, int(700 * 2340 / 1080)
BZ = 20
PX, PY = (W - SW - 2 * BZ) // 2, 330
SX, SY = PX + BZ, PY + BZ


def phone_frame(th):
    w, h = SW + 2 * BZ, SH + 2 * BZ
    pad = 90
    img = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("L", img.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((pad, pad + 30, pad + w, pad + h + 30), 86, fill=int(255 * th["shadow"]))
    img.putalpha(sh.filter(ImageFilter.GaussianBlur(40)))
    img = Image.composite(Image.new("RGBA", img.size, (0, 0, 0, 255)), Image.new("RGBA", img.size, (0, 0, 0, 0)), img.split()[3])
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((pad, pad, pad + w, pad + h), 86, fill=(10, 10, 12, 255), outline=(70, 70, 76, 255), width=3)
    d.rounded_rectangle((pad + 6, pad + 6, pad + w - 6, pad + h - 6), 80, outline=(32, 32, 36, 255), width=2)
    return img, pad


SCREEN_MASK = Image.new("L", (SW, SH), 0)
ImageDraw.Draw(SCREEN_MASK).rounded_rectangle((0, 0, SW - 1, SH - 1), 64, fill=255)


def view(z, cx, cy):
    w, h = 1080 / z, 2340 / z
    left = min(max(cx - w / 2, 0), 1080 - w)
    top = min(max(cy - h / 2, 0), 2340 - h)
    return left, top, w, h


def to_frame(v, px, py, dy=0):
    left, top, w, h = v
    return SX + (px - left) * SW / w, SY + dy + (py - top) * SH / h


def render_screen(img, v):
    left, top, w, h = v
    return img.resize((SW, SH), Image.BILINEAR, box=(left, top, left + w, top + h))


# ---------------------------------------------------------------- roteiros
def shots(path):
    """Cada tomada: print, duração, zoom [(t, z, cx, cy)], dedo [(t, x, y)], toques [t], passos [(t, n, texto)]."""
    common = [
        dict(img="lista", dur=1.25, zoom=[(0, 1.0, 540, 1170), (1.1, 1.22, 540, 1100)], box=(0.35, (35, 1041, 1045, 1160)),
             steps=[(0, "ok", "274 pins em promoção")]),
        dict(img="lista2", dur=1.9, tr="scroll", zoom=[(0, 1.0, 540, 1170), (0.9, 1.8, 250, 1560)], box=(0.95, (40, 1545, 420, 1690))),
        dict(img="lista5", dur=0.5, tr="scroll", zoom=[(0, 1.0, 540, 1170)]),
        dict(img="lista6", dur=0.5, tr="scroll", zoom=[(0, 1.0, 540, 1170)]),
        dict(img="lista8", dur=0.75, tr="scroll", zoom=[(0, 1.0, 540, 1170)]),
    ]
    if path == "google":
        return [
            dict(img="google", dur=2.9, zoom=[(0, 1.75, 400, 300), (1.5, 1.75, 400, 300), (1.95, 1.3, 420, 900)],
                 typing=(0.25, 1.35, "brax pins mania"), pointer=[(1.95, 620, 1300), (2.35, 257, 889)], taps=[2.45],
                 steps=[(0, "1", "Pesquise no Google"), (1.7, "2", "Toque no site da Brax")]),
            dict(img="site", dur=2.2, zoom=[(0, 1.0, 540, 1170), (0.6, 1.5, 330, 700)], pointer=[(0.3, 560, 1000), (1.2, 140, 439)], taps=[1.35],
                 steps=[(0, "3", "Abra o menu (canto esquerdo)")]),
            dict(img="menu", dur=2.1, zoom=[(0, 1.0, 540, 1170), (0.6, 1.4, 420, 1150)], pointer=[(0.3, 700, 700), (1.1, 267, 1280)], taps=[1.25],
                 row=(1.25, (0, 1215, 1080, 1345)), steps=[(0, "4", "Toque em Produtos em promoção")]),
        ] + common
    return [
        dict(img="ig_perfil", dur=3.0, zoom=[(0, 1.0, 540, 1170), (0.9, 1.0, 540, 1170), (1.5, 1.55, 420, 650)], pointer=[(1.4, 700, 1300), (2.1, 306, 780)], taps=[2.25],
             steps=[(0, "1", "Entre no @braxpinsmania"), (1.3, "2", "Toque no link da bio")]),
        dict(img="ig_site", dur=2.2, zoom=[(0, 1.0, 540, 1170), (0.6, 1.5, 330, 680)], pointer=[(0.3, 560, 1000), (1.2, 140, 415)], taps=[1.35],
             steps=[(0, "3", "Abra o menu (canto esquerdo)")]),
        dict(img="ig_menu", dur=2.1, zoom=[(0, 1.0, 540, 1170), (0.6, 1.4, 420, 1130)], pointer=[(0.3, 700, 700), (1.1, 267, 1257)], taps=[1.25],
             row=(1.25, (0, 1195, 1080, 1325)), steps=[(0, "4", "Toque em Produtos em promoção")]),
    ] + common


HOOKS = [
    ["BAIXOU!", "DE R$17,99", "POR *R$14,99*"],
    ["PINS POR *R$14,99*", "TE MOSTRO", "ONDE ACHAR"],
    ["*274 PINS*", "EM PROMOÇÃO", "NA BRAX"],
    ["ACHE A *PROMOÇÃO*", "EM 10 SEGUNDOS"],
    ["SEU PIN FAVORITO", "FICOU *MAIS BARATO*"],
    ["NÃO PAGUE", "R$17,99", "NO SEU PIN"],
    ["ONDE TÁ A", "*PROMOÇÃO*", "DA BRAX?"],
]
HOOK_T, CTA_T, X_T = 3.0, 3.0, 0.4


# ---------------------------------------------------------------- texto
def txt(im, x, y, s, f, color, a=1.0, center=True):
    """Texto com transparência de verdade (ImageDraw sozinho não mistura alfa em RGBA)."""
    if a <= 0:
        return
    tw = ImageDraw.Draw(im).textlength(s, font=f)
    lay = Image.new("RGBA", (int(tw + 20), int(f.size * 1.5)), (0, 0, 0, 0))
    ImageDraw.Draw(lay).text((10, 0), s, font=f, fill=tuple(color[:3]) + (int(255 * min(1, a)),))
    im.alpha_composite(lay, (int((x - tw / 2 if center else x) - 10), int(y)))


def rich_line(d, x, y, line, f, color, accent):
    parts = line.split("*")
    tw = sum(d.textlength(p, font=f) for p in parts)
    cx = x - tw / 2
    for i, p in enumerate(parts):
        d.text((cx, y), p, font=f, fill=accent if i % 2 else color)
        cx += d.textlength(p, font=f)


def headline(lines, maxw=960, maxsize=150):
    size = maxsize
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    while size > 60 and max(probe.textlength(l.replace("*", ""), font=font("anton", size)) for l in lines) > maxw:
        size -= 4
    return size


def text_layer(lines, size, color, accent, alpha_fn):
    """Camada RGBA com as linhas do título, cada uma entrando de baixo (alpha_fn(i) -> 0..1)."""
    f = font("anton", size)
    lh = int(size * 1.12)
    layer = Image.new("RGBA", (W, lh * len(lines) + 40), (0, 0, 0, 0))
    for i, l in enumerate(lines):
        a = alpha_fn(i)
        if a <= 0:
            continue
        ln = Image.new("RGBA", (W, lh + 30), (0, 0, 0, 0))
        rich_line(ImageDraw.Draw(ln), W / 2, 0, l, f, color + (255,), accent + (255,))
        ln.putalpha(ln.split()[3].point(lambda v: int(v * a)))
        layer.alpha_composite(ln, (0, int(i * lh + (1 - a) * 40)))
    return layer


def price_tag(base, cx, y, t, th):
    """'DE R$17,99' riscado + selo 'POR R$14,99' que aparece."""
    d = ImageDraw.Draw(base)
    f = font("anton", 78)
    old = "DE R$17,99"
    tw = d.textlength(old, font=f)
    a = ease((t - 0.0) / 0.3)
    if a > 0:
        col = th["sub"]
        d.text((cx - tw / 2, y), old, font=f, fill=col)
        s = ease((t - 0.45) / 0.35)
        if s > 0:
            d.line((cx - tw / 2 - 8, y + 58, cx - tw / 2 - 8 + (tw + 16) * s, y + 48), fill=RED, width=10)
    p = back((t - 0.75) / 0.4)
    if p > 0:
        f2 = font("anton", 128)
        txt = "POR R$14,99"
        w2 = d.textlength(txt, font=f2)
        pill = Image.new("RGBA", (int(w2 + 90), 190), (0, 0, 0, 0))
        pd = ImageDraw.Draw(pill)
        pd.rounded_rectangle((0, 0, pill.size[0] - 1, 189), 40, fill=GOLD + (255,))
        pd.text((45, 12), txt, font=f2, fill=(17, 17, 17))
        sc = max(0.01, p)
        pill = pill.resize((max(1, int(pill.size[0] * sc)), max(1, int(pill.size[1] * sc))), Image.BILINEAR)
        base.alpha_composite(pill, (int(cx - pill.size[0] / 2), int(y + 120 + (1 - sc) * 95)))


# ---------------------------------------------------------------- cenas
class Video:
    def __init__(self, idx, path, hook, theme, assets):
        self.idx, self.path, self.hook, self.th = idx, path, HOOKS[hook], THEMES[theme]
        self.layout = hook % 3
        self.s = assets
        self.bg = background(self.th).convert("RGBA")
        self.frame_img, self.fpad = phone_frame(self.th)
        self.rays = rays(self.th)
        self.sticker = sticker(250)
        self.shots = shots(path)
        t = HOOK_T
        for sh in self.shots:
            sh["t0"] = t
            t += sh["dur"]
        self.tut_end = t
        self.total = t + CTA_T
        rot = [(idx * 5 + k * 3) % len(PRODUCTS) for k in range(6)]
        self.cards = [card(self.s.get(PRODUCTS[r][0]) or load(PRODUCTS[r][0]), PRODUCTS[r][1], 400) for r in rot]
        self.steps = []
        for sh in self.shots:
            for st, n, txt in sh.get("steps", []):
                self.steps.append((sh["t0"] + st, n, txt))
        self.taps = [sh["t0"] + tp for sh in self.shots for tp in sh.get("taps", [])]

    # ---- gancho
    def hook_scene(self, t):
        im = self.bg.copy()
        th = self.th
        r = self.rays.rotate(t * 14, Image.BILINEAR)
        im.alpha_composite(r, (int(W / 2 - 750), int(1000 - 750)))
        lines = self.hook
        size = headline(lines, maxsize=160)
        lay = text_layer(lines, size, th["text"], RED, lambda i: ease((t - 0.05 - i * 0.14) / 0.22))
        pu = back((t - 0.05) / 0.5)
        sc = 1.25 - 0.25 * min(1, pu) + 0.015 * math.sin(t * 5)
        lay2 = lay.resize((int(lay.size[0] * sc), int(lay.size[1] * sc)), Image.BILINEAR)
        im.alpha_composite(lay2, (int((W - lay2.size[0]) / 2), int(130 - (lay2.size[1] - lay.size[1]) / 2)))
        top = 130 + lay.size[1]
        # produtos
        n = [1, 3, 2][self.layout]
        cy = top + 380
        for k in range(n):
            a = back((t - 0.35 - k * 0.12) / 0.45)
            if a <= 0:
                continue
            c = self.cards[k]
            if n == 1:
                sc, ang, x = 1.3, -4 + 3 * math.sin(t * 1.6), W / 2
            elif n == 2:
                sc, ang, x = 1.0, [-8, 7][k], [W / 2 - 215, W / 2 + 215][k]
            else:
                sc, ang, x = 0.85, [-12, 0, 12][k], [W / 2 - 290, W / 2, W / 2 + 290][k]
            sc *= (0.5 + 0.5 * a) * (1 + 0.04 * t)
            fl = math.sin((t + k) * 2.2) * 6
            ci = c.resize((int(c.size[0] * sc), int(c.size[1] * sc)), Image.BILINEAR)
            if ang:
                ci = ci.rotate(ang + fl * 0.2, Image.BICUBIC, expand=True)
            ci.putalpha(ci.split()[3].point(lambda v: int(v * min(1, a))))
            im.alpha_composite(ci, (int(x - ci.size[0] / 2), int(cy - ci.size[1] / 2 + fl + (1 - min(1, a)) * 60 + (40 if n == 3 and k == 1 else 0))))
        price_tag(im, W / 2, cy + 340, t - 1.0, th)
        fl = 1 - (t - 1.75) / 0.18
        if 0 < fl <= 1:
            im.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, int(110 * fl))))
        f = font("SemiBold", 40)
        txt(im, W / 2, H - 170, "Veja como achar no site", f, th["sub"], ease((t - 2.1) / 0.3))
        return im

    # ---- tutorial
    def screen_at(self, sh, lt):
        z, cx, cy = kf(lt, [(k[0], (k[1], k[2], k[3])) for k in sh["zoom"]])
        v = view(z, cx, cy)
        name = sh["img"]
        img = self.s[name]
        if "typing" in sh:
            t0, t1, txt = sh["typing"]
            if lt < t1 + 0.25:
                img = self.s["google_blur"].copy()
                img.paste(self.s["google"].crop((0, 0, 1080, 360)), (0, 0))
            elif lt < t1 + 0.55:
                img = Image.blend(self.s["google_blur"], self.s["google"], (lt - t1 - 0.25) / 0.3)
                img.paste(self.s["google"].crop((0, 0, 1080, 360)), (0, 0))
            else:
                img = img.copy()
            d = ImageDraw.Draw(img)
            n = int(len(txt) * min(1, max(0, (lt - t0) / (t1 - t0))))
            f = font("Medium", 46)
            d.text((181, 255), txt[:n], font=f, fill=(232, 234, 237))
            if lt < t1 + 0.3 and int(lt * 2.4) % 2 == 0:
                x = 181 + d.textlength(txt[:n], font=f) + 4
                d.rectangle((x, 252, x + 3, 312), fill=(138, 180, 248))
        out = render_screen(img, v).convert("RGBA")
        d = ImageDraw.Draw(out)
        if "row" in sh and lt >= sh["row"][0]:
            a = max(0, 1 - (lt - sh["row"][0]) / 0.8)
            x0, y0, x1, y1 = sh["row"][1]
            p0, p1 = to_frame(v, x0, y0), to_frame(v, x1, y1)
            ov = Image.new("RGBA", out.size, (0, 0, 0, 0))
            ImageDraw.Draw(ov).rectangle((p0[0] - SX, p0[1] - SY, p1[0] - SX, p1[1] - SY), fill=RED + (int(70 * a),))
            out.alpha_composite(ov)
        if "box" in sh and lt >= sh["box"][0]:
            a = ease((lt - sh["box"][0]) / 0.3)
            x0, y0, x1, y1 = sh["box"][1]
            p0, p1 = to_frame(v, x0, y0), to_frame(v, x1, y1)
            g = 10 * (1 - a)
            d.rounded_rectangle((p0[0] - SX - g, p0[1] - SY - g, p1[0] - SX + g, p1[1] - SY + g), 22, outline=RED + (int(255 * a),), width=7)
        return out, v

    def screen_for(self, t):
        cur = None
        for i, sh in enumerate(self.shots):
            if t >= sh["t0"]:
                cur = i
        sh = self.shots[cur]
        lt = t - sh["t0"]
        scr, v = self.screen_at(sh, lt)
        tr = sh.get("tr", "fade")
        if cur > 0 and lt < 0.28:
            prev = self.shots[cur - 1]
            ps, _ = self.screen_at(prev, prev["dur"])
            e = ease(lt / 0.28)
            if tr == "scroll":
                comp = Image.new("RGBA", (SW, SH), (255, 255, 255, 255))
                comp.paste(ps, (0, int(-SH * e)))
                comp.paste(scr, (0, int(SH * (1 - e))))
                scr = comp
            else:
                scr = Image.blend(ps, scr, e)
        return scr, v, sh, lt

    def step_chip(self, im, t, a_all=1.0):
        cur = [s for s in self.steps if s[0] <= t]
        if not cur:
            return
        st, n, txt = cur[-1]
        a = min(1, ease((t - st) / 0.25)) * a_all
        pop = back((t - st) / 0.35)
        th = self.th
        f = font("ExtraBold", 50)
        d0 = ImageDraw.Draw(im)
        tw = d0.textlength(txt, font=f)
        cw = int(tw + 150)
        chip = Image.new("RGBA", (cw, 120), (0, 0, 0, 0))
        d = ImageDraw.Draw(chip)
        d.rounded_rectangle((0, 0, cw - 1, 119), 60, fill=th["chip"] + (255,))
        d.ellipse((14, 14, 106, 106), fill=RED)
        if n == "ok":
            d.line((38, 62, 54, 78, 84, 44), fill=(255, 255, 255), width=10, joint="curve")
        else:
            fn = font("anton", 64)
            nw = d.textlength(n, font=fn)
            d.text((60 - nw / 2, 18), n, font=fn, fill=(255, 255, 255))
        d.text((124, 30), txt, font=f, fill=th["chip_text"])
        if cw > W - 60:
            r = (W - 60) / cw
            chip = chip.resize((int(cw * r), int(120 * r)), Image.LANCZOS)
        chip.putalpha(chip.split()[3].point(lambda v: int(v * a)))
        sc = 0.6 + 0.4 * max(0.0, pop)
        chip = chip.resize((max(1, int(chip.size[0] * sc)), max(1, int(chip.size[1] * sc))), Image.BILINEAR)
        im.alpha_composite(chip, (int((W - chip.size[0]) / 2), int(160 + (120 - chip.size[1]) / 2)))
        if self.th is THEMES["dark"]:
            pass

    def pointer(self, im, t, sh, lt, v, dy):
        if "pointer" not in sh or lt < sh["pointer"][0][0]:
            return
        x, y = kf(lt, [(k[0], (k[1], k[2])) for k in sh["pointer"]])
        fx, fy = to_frame(v, x, y, dy)
        a = ease((lt - sh["pointer"][0][0]) / 0.2)
        r = 38
        for tp in sh.get("taps", []):
            if tp - 0.08 <= lt <= tp + 0.2:
                r = 38 * (1 - 0.22 * math.sin(math.pi * (lt - tp + 0.08) / 0.28))
        p = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
        d = ImageDraw.Draw(p)
        for tp in sh.get("taps", []):
            if tp <= lt <= tp + 0.55:
                e = (lt - tp) / 0.55
                rr = 40 + 95 * ease(e)
                d.ellipse((150 - rr, 150 - rr, 150 + rr, 150 + rr), outline=(255, 255, 255, int(220 * (1 - e) * a)), width=6)
        sh_ = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
        ImageDraw.Draw(sh_).ellipse((150 - r, 156 - r, 150 + r, 156 + r), fill=(0, 0, 0, int(90 * a)))
        p.alpha_composite(sh_.filter(ImageFilter.GaussianBlur(6)))
        d = ImageDraw.Draw(p)
        d.ellipse((150 - r, 150 - r, 150 + r, 150 + r), fill=(255, 255, 255, int(150 * a)), outline=(40, 40, 40, int(200 * a)), width=4)
        im.alpha_composite(p, (int(fx - 150), int(fy - 150)))

    def tutorial_scene(self, t):
        im = self.bg.copy()
        lt0 = t - HOOK_T
        dy = (1 - ease(lt0 / 0.55)) * 500 if lt0 < 0.55 else 0
        im.alpha_composite(self.frame_img, (PX - self.fpad, int(PY - self.fpad + dy)))
        scr, v, sh, lt = self.screen_for(max(t, HOOK_T))
        im.paste(scr, (SX, int(SY + dy)), SCREEN_MASK)
        self.pointer(im, t, sh, lt, v, dy)
        self.step_chip(im, t)
        a = back((lt0 - 0.6) / 0.45)
        if a > 0:
            st = self.sticker.rotate(-10 + 7 * math.sin(t * 2.4), Image.BICUBIC)
            sc = max(0.05, a) * (1 + 0.05 * math.sin(t * 6))
            st = st.resize((int(st.size[0] * sc), int(st.size[1] * sc)), Image.BILINEAR)
            im.alpha_composite(st, (int(PX + SW + 2 * BZ - st.size[0] / 2 - 30), int(PY + 210 - st.size[1] / 2)))
        return im

    # ---- chamada final
    def cta_scene(self, t):
        im = self.bg.copy()
        th = self.th
        im.alpha_composite(self.rays.rotate(-t * 14, Image.BILINEAR), (int(W / 2 - 750), int(520 - 750)))
        d = ImageDraw.Draw(im)
        a1 = ease(t / 0.35)
        txt(im, W / 2, 230 + (1 - a1) * 30, "PINS QUE ERAM R$17,99", font("anton", 92), th["sub"], a1)
        p = back((t - 0.2) / 0.45)
        if p > 0:
            f2 = font("anton", 260)
            big = "R$14,99"
            bw = d.textlength(big, font=f2)
            layer = Image.new("RGBA", (int(bw + 40), 330), (0, 0, 0, 0))
            ImageDraw.Draw(layer).text((20, 0), big, font=f2, fill=RED)
            sc = max(0.05, p)
            layer = layer.resize((int(layer.size[0] * sc), int(layer.size[1] * sc)), Image.BILINEAR)
            im.alpha_composite(layer, (int((W - layer.size[0]) / 2), int(360 + (1 - sc) * 160)))
        # produtos passando
        for k in range(6):
            c = self.cards[k]
            ci = c.resize((int(c.size[0] * 0.66), int(c.size[1] * 0.66)), Image.BILINEAR)
            ci = ci.rotate([-6, 4, -3, 6, -5, 3][k], Image.BICUBIC, expand=True)
            x = -160 + ((k * 330 + t * 260) % (6 * 330)) - 330
            a = ease((t - 0.35) / 0.4)
            if a > 0:
                ci.putalpha(ci.split()[3].point(lambda v: int(v * a)))
                im.alpha_composite(ci, (int(x), 760))
        a = ease((t - 0.7) / 0.35)
        if a > 0:
            f3 = font("ExtraBold", 50)
            url = "braxpinsmania.com.br"
            uw = d.textlength(url, font=f3)
            pill = Image.new("RGBA", (int(uw + 100), 120), (0, 0, 0, 0))
            pd = ImageDraw.Draw(pill)
            pd.rounded_rectangle((0, 0, pill.size[0] - 1, 119), 60, fill=GOLD + (255,))
            pd.text((50, 30), url, font=f3, fill=(17, 17, 17))
            pill.putalpha(pill.split()[3].point(lambda v: int(v * a)))
            im.alpha_composite(pill, (int((W - pill.size[0]) / 2), int(1260 + (1 - a) * 30)))
            f4 = font("SemiBold", 44)
            for i, line in enumerate(["Menu  >  Produtos em promoção", "ou pelo link da bio do @braxpinsmania"]):
                txt(im, W / 2, 1430 + i * 70, line, f4, th["text" if i == 0 else "sub"], a)
        a = back((t - 1.0) / 0.4)
        if a > 0:
            f6 = font("anton", 84)
            label = "COMPRE AGORA  >"
            bw = ImageDraw.Draw(im).textlength(label, font=f6)
            btn = Image.new("RGBA", (int(bw + 120), 160), (0, 0, 0, 0))
            bd = ImageDraw.Draw(btn)
            bd.rounded_rectangle((0, 0, btn.size[0] - 1, 159), 80, fill=RED + (255,))
            bd.text((60, 22), label, font=f6, fill=(255, 255, 255))
            sc = max(0.05, a) * (1 + 0.045 * math.sin(t * 7))
            btn = btn.resize((int(btn.size[0] * sc), int(btn.size[1] * sc)), Image.BILINEAR)
            im.alpha_composite(btn, (int((W - btn.size[0]) / 2), int(1660 - btn.size[1] / 2 + 60)))
        return im

    def frame(self, t):
        if t < HOOK_T - X_T:
            return self.hook_scene(t)
        if t < HOOK_T:
            e = (t - (HOOK_T - X_T)) / X_T
            return Image.blend(self.hook_scene(t), self.tutorial_scene(HOOK_T + 0.001), ease(e))
        if t < self.tut_end - X_T:
            return self.tutorial_scene(t)
        if t < self.tut_end:
            e = (t - (self.tut_end - X_T)) / X_T
            return Image.blend(self.tutorial_scene(t), self.cta_scene(0), ease(e))
        return self.cta_scene(t - self.tut_end)

    # ---- áudio
    def audio(self, variant):
        n = int(self.total * SR)
        t = np.arange(n) / SR
        out = np.zeros(n, np.float32)
        progs = [[(220.0, 277.18, 329.63, 415.30), (185.0, 233.08, 277.18, 329.63), (146.83, 185.0, 220.0, 277.18), (164.81, 207.65, 246.94, 311.13)],
                 [(261.63, 329.63, 392.0, 493.88), (220.0, 261.63, 329.63, 392.0), (174.61, 220.0, 261.63, 329.63), (196.0, 246.94, 293.66, 349.23)]]
        prog = progs[variant % 2]
        bpm = 96
        beat = 60 / bpm
        bar = beat * 4
        for i in range(int(self.total / bar) + 2):
            a = int(i * bar * SR)
            if a >= n:
                break
            b = min(n, a + int((bar + 0.6) * SR))
            tt = t[: b - a]
            env = np.minimum(1, tt / 0.04) * np.exp(-tt * 0.9)
            for f in prog[i % 4]:
                # piano elétrico simples (FM leve)
                out[a:b] += np.sin(2 * np.pi * f * tt + 0.8 * np.exp(-tt * 3) * np.sin(2 * np.pi * f * 2 * tt)) * env * 0.05
            bass = prog[i % 4][0] / 2
            out[a:b] += np.sin(2 * np.pi * bass * tt) * np.minimum(1, tt / 0.02) * np.exp(-tt * 1.2) * 0.12
        kt = np.arange(int(0.35 * SR)) / SR
        kick = np.sin(2 * np.pi * (50 + 70 * np.exp(-kt * 25)) * kt) * np.exp(-kt * 9) * 0.32
        ht = np.arange(int(0.05 * SR)) / SR
        hat = np.random.default_rng(5).standard_normal(len(ht)) * np.exp(-ht * 90) * 0.035
        hat = np.diff(hat, prepend=0)
        for k in range(int(self.total / (beat / 2)) + 1):
            a = int(k * beat / 2 * SR)
            if a >= n:
                break
            if k % 4 == 0:
                seg = kick[: n - a]
                out[a:a + len(seg)] += seg
            if k % 2 == 1:
                seg = hat[: n - a]
                out[a:a + len(seg)] += seg
        out = out / (np.abs(out).max() + 1e-9) * 0.7
        fade = int(0.9 * SR)
        out[-fade:] *= np.linspace(1, 0, fade)
        out[: int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))
        # clique discreto, o mesmo em todos os toques
        ct = np.arange(int(0.03 * SR)) / SR
        click = (np.sin(2 * np.pi * 1800 * ct) * np.exp(-ct * 220) * 0.3).astype(np.float32)
        for tp in self.taps:
            a = int(tp * SR)
            out[a:a + len(click)] += click[: n - a]
        return np.clip(out, -1, 1)


def render(idx, outdir, assets):
    path = "google" if idx % 2 == 0 else "instagram"
    hook = (idx // 2) % 7
    theme = "dark" if idx < 14 else "light"
    v = Video(idx, "google" if path == "google" else "insta", hook, theme, assets)
    name = f"brax-promo-{idx + 1:02d}-{path}-{'escuro' if theme == 'dark' else 'claro'}.mp4"
    wav = os.path.join(outdir, f".a{idx}.raw")
    v.audio(idx).astype(np.float32).tofile(wav)
    dst = os.path.join(outdir, name)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", dst]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(int(v.total * FPS)):
        p.stdin.write(v.frame(f / FPS).convert("RGB").tobytes())
    p.stdin.close()
    p.wait()
    os.remove(wav)
    return dst


if __name__ == "__main__":
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    idxs = [int(x) for x in sys.argv[2:]] or list(range(28))
    assets = prepared()
    for k in ["lista3", "lista4"]:
        assets[k] = load(k)
    if os.environ.get("STILLS"):
        for i in idxs:
            v = Video(i, "google" if i % 2 == 0 else "insta", (i // 2) % 7, "dark" if i < 14 else "light", assets)
            for tt in [float(x) for x in os.environ["STILLS"].split(",")]:
                v.frame(min(tt, v.total - 0.01)).convert("RGB").save(os.path.join(outdir, f"s{i}_{tt}.jpg"), quality=85)
        sys.exit()
    for i in idxs:
        print(render(i, outdir, assets), flush=True)
