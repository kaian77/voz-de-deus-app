"""Desenho "pintado à mão" feito por código (aquarela + traço de nanquim que treme), inspirado nos kits abertos
ClaudeAnimationBase e painted-animation (MIT): paleta de aquarela, contorno que "ferve" 8x por segundo, papel com
textura, tudo 2D. Personagens e cenas são nossos (nada do Clawd). Primeira história: Davi e Golias (1 Samuel 17).

  python3 painted.py <saída.mp4> [--silent]   (voz edge-tts; --silent = sem voz, para testar o visual)
"""
import math
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import quiz  # voz, sons e trilha

W, H, FPS = 1080, 1920, 30
S = 0.5                      # desenha em 540x960 e amplia (o traço pintado aguenta)
w, h = int(W * S), int(H * S)
BOIL = 8                     # o traço "ferve" 8 vezes por segundo
INK = (46, 36, 30)
PAL = {
    "sky": (150, 196, 222), "sky2": (236, 214, 170), "sun": (247, 200, 92), "hill": (128, 168, 92), "hill2": (96, 140, 78),
    "hill3": (160, 186, 110), "water": (98, 160, 196), "stone": (168, 160, 150), "skin": (226, 172, 128),
    "skin2": (198, 140, 100), "hair": (92, 58, 40), "tunic": (196, 104, 70), "belt": (120, 78, 50), "wool": (246, 240, 226),
    "metal": (150, 154, 160), "metal2": (110, 112, 120), "bronze": (190, 140, 70), "cream": (250, 240, 214),
    "red": (190, 70, 60), "army": (120, 110, 150),
}
FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine", "assets", "fonts", "Poppins-Bold.ttf")
T = 0.0                      # hora do quadro atual (o traço ferve com ela)


# ------------------------------------------------------------------------------------------------ pincel
def seed_of(key):
    return (hash((key, int(T * BOIL))) & 0xFFFFFFFF)


def jitter(pts, key, amt=2.2):
    r = np.random.default_rng(seed_of(key))
    p = np.asarray(pts, float) * S
    return p + r.normal(0, amt * S, p.shape)


def ell(cx, cy, rx, ry, n=30, rot=0.0):
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    x, y = np.cos(a) * rx, np.sin(a) * ry
    c, s = math.cos(rot), math.sin(rot)
    return np.stack([cx + x * c - y * s, cy + x * s + y * c], 1)


def poly(*pts):
    return np.asarray(pts, float)


def wash(img, pts, color, key, alpha=0.9, edge=0.55, amt=2.2):
    """Mancha de aquarela: preenchimento um pouco transparente, borda mais escura (pigmento acumulado)."""
    p = jitter(pts, key, amt)
    x0, y0 = np.floor(p.min(0)).astype(int) - 6
    x1, y1 = np.ceil(p.max(0)).astype(int) + 6
    x0, y0 = max(x0, 0), max(y0, 0)
    x1, y1 = min(x1, w), min(y1, h)
    if x1 <= x0 or y1 <= y0:
        return
    m = Image.new("L", (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(m).polygon([tuple(q) for q in (p - [x0, y0])], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(0.9))
    e = np.asarray(m, np.float32) - np.asarray(m.filter(ImageFilter.MinFilter(5)), np.float32)
    a = np.asarray(m, np.float32) / 255 * alpha * GRAN[y0:y1, x0:x1]
    col = np.empty((m.height, m.width, 4), np.float32)
    dark = np.array(color) * 0.72
    k = np.clip(e / 255 * edge * 1.6, 0, 1)[..., None]
    col[..., :3] = np.array(color) * (1 - k) + dark * k
    col[..., 3] = np.clip(a + e / 255 * edge * 0.4, 0, 1) * 255
    img.alpha_composite(Image.fromarray(col.astype(np.uint8), "RGBA"), (int(x0), int(y0)))


def ink(img, pts, key, width=3.0, color=INK, closed=False, amt=1.6):
    """Traço de nanquim: duas passadas tremidas (grossura irregular, como pincel)."""
    d = ImageDraw.Draw(img, "RGBA")
    for i, wd in enumerate((width, width * 0.6)):
        p = jitter(pts, (key, i), amt)
        q = [tuple(v) for v in p] + ([tuple(p[0])] if closed else [])
        if len(q) > 1:
            d.line(q, fill=color + (235 if i == 0 else 200,), width=max(1, int(round(wd * S * 2))), joint="curve")


def dot(img, x, y, r, key, color=INK):
    wash(img, ell(x, y, r, r, 12), color, key, alpha=1, edge=0, amt=0.6)


# ------------------------------------------------------------------------------------------------ papel e câmera
def make_paper():
    r = np.random.default_rng(7)
    base = np.array(PAL["cream"], np.float32)
    n = r.normal(0, 1, (h, w)).astype(np.float32)
    big = np.asarray(Image.fromarray(((r.random((h // 24, w // 24)) * 255).astype(np.uint8))).resize((w, h), Image.BICUBIC), np.float32) / 255
    g = base * (1 - 0.04 * big[..., None]) + n[..., None] * 3
    return np.clip(g, 0, 255)


PAPER = None
GRAIN = None
# granulação do pigmento (manchas mais claras e mais escuras dentro de cada cor)
_r = np.random.default_rng(11)
GRAN = 0.82 + 0.18 * np.asarray(Image.fromarray((_r.random((h // 6, w // 6)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255


def finish(img):
    """Multiplica pela textura do papel e amplia para 1080x1920."""
    global GRAIN
    if GRAIN is None:
        r = np.random.default_rng(3)
        GRAIN = (1 - 0.06 * np.asarray(Image.fromarray((r.random((h, w)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float32)[..., None] / 255)
    a = np.asarray(img.convert("RGB"), np.float32) * GRAIN
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)


def ease(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


def seg(t, a, b):
    return max(0.0, min(1.0, (t - a) / (b - a)))


# ------------------------------------------------------------------------------------------------ cenário
def sky(img, warm=0.0):
    col = tuple(int(a + (b - a) * warm) for a, b in zip(PAL["sky"], PAL["sky2"]))
    wash(img, poly((-40, -40), (W + 40, -40), (W + 40, 1300), (-40, 1300)), col, "sky", alpha=0.75, edge=0.2, amt=4)
    for i, (x, y, s) in enumerate(((220, 260, 1), (760, 180, 1.3), (520, 420, 0.8))):
        wash(img, ell(x + 30 * math.sin(T * 0.3 + i), y, 120 * s, 44 * s, 24), (255, 252, 244), ("cloud", i), alpha=0.8, edge=0.3)


def sun(img, x=860, y=300, r=90):
    wash(img, ell(x, y, r, r, 26), PAL["sun"], "sun", alpha=0.95)
    for i in range(10):
        a = i / 10 * 2 * math.pi + T * 0.4
        ink(img, [(x + math.cos(a) * (r + 22), y + math.sin(a) * (r + 22)), (x + math.cos(a) * (r + 58), y + math.sin(a) * (r + 58))],
            ("ray", i), 2.4, (214, 150, 60))


def hills(img, y=1150):
    wash(img, ell(250, y + 120, 620, 300, 36), PAL["hill3"], "h1", edge=0.4)
    wash(img, ell(900, y + 160, 600, 320, 36), PAL["hill"], "h2", edge=0.4)
    wash(img, poly((-60, y + 260), (W + 60, y + 220), (W + 60, H + 60), (-60, H + 60)), PAL["hill2"], "h3", edge=0.3, amt=3)
    for i in range(14):  # tufos de grama que balançam
        x = (i * 83 + 40) % W
        yy = y + 300 + (i * 57) % 500
        sw = math.sin(T * 2 + i) * 6
        for k in (-1, 0, 1):
            ink(img, [(x + k * 8, yy), (x + k * 12 + sw, yy - 26)], ("grass", i, k), 1.6, (70, 110, 60))


def stream(img, y=1520):
    pts = [(-60, y)] + [(x, y + 18 * math.sin(x / 140)) for x in range(0, W + 80, 80)] + [(W + 60, y + 150), (-60, y + 170)]
    wash(img, poly(*pts), PAL["water"], "stream", alpha=0.85)
    for i in range(6):
        x = (i * 190 + T * 60) % (W + 100) - 50
        ink(img, [(x, y + 70 + i % 3 * 20), (x + 50, y + 66 + i % 3 * 20)], ("wave", i), 1.4, (240, 248, 255))


def stones(img, y=1600, taken=0):
    for i, x in enumerate((360, 470, 560, 650, 760)):
        if i < taken:
            continue
        wash(img, ell(x, y + (i % 2) * 18, 34, 24, 16), PAL["stone"], ("st", i))
        ink(img, ell(x, y + (i % 2) * 18, 34, 24, 16), ("sti", i), 1.6, closed=True)


def sheep(img, x, y, s=1.0, hop=0.0, key=0):
    y -= abs(math.sin(hop)) * 30
    for k, (dx, dy) in enumerate(((-30, 0), (0, -16), (30, 0), (0, 12), (-14, -8), (16, -6))):
        wash(img, ell(x + dx * s, y + dy * s, 34 * s, 28 * s, 14), PAL["wool"], ("wool", key, k), edge=0.4)
    wash(img, ell(x + 58 * s, y - 10 * s, 18 * s, 22 * s, 12), INK, ("sh", key), alpha=0.95, edge=0)
    for k in (-1, 1):
        ink(img, [(x + k * 22 * s, y + 24 * s), (x + k * 22 * s, y + 52 * s)], ("leg", key, k), 2.6)
    dot(img, x + 64 * s, y - 14 * s, 3 * s, ("eye", key), (250, 250, 250))


# ------------------------------------------------------------------------------------------------ personagens
def face(img, x, y, r, mood, key, look=0.0):
    """Olhos e boca: happy, scared, firm, wow, laugh."""
    ex = r * 0.38
    for s in (-1, 1):
        cx, cy = x + s * ex + look * r * 0.15, y - r * 0.1
        if mood == "happy":
            ink(img, [(cx - 9, cy + 2), (cx, cy - 7), (cx + 9, cy + 2)], ("eh", key, s), 2.4)
        elif mood == "laugh":
            ink(img, [(cx - 10, cy - 4), (cx, cy + 4), (cx + 10, cy - 4)], ("el", key, s), 2.4)
        else:
            rr = 9 if mood in ("scared", "wow") else 7
            wash(img, ell(cx, cy, rr, rr + 3, 12), (255, 255, 255), ("ew", key, s), alpha=1, edge=0.3)
            dot(img, cx + look * 3, cy + 1, 4, ("ep", key, s))
            if mood == "firm":
                ink(img, [(cx - 12, cy - 16 - s * 4), (cx + 12, cy - 16 + s * 4)], ("brow", key, s), 2.6)
            if mood == "scared":
                ink(img, [(cx - 11, cy - 18 + s * 3), (cx + 11, cy - 18 - s * 3)], ("brow", key, s), 2.2)
    my = y + r * 0.42
    if mood in ("happy", "laugh"):
        wash(img, poly((x - r * 0.3, my - 4), (x + r * 0.3, my - 4), (x, my + r * (0.3 if mood == "laugh" else 0.18))), (150, 60, 50), ("m", key), alpha=0.95, edge=0)
    elif mood in ("scared", "wow"):
        wash(img, ell(x, my + 4, r * 0.13, r * 0.18, 12), (120, 50, 45), ("m", key), alpha=0.95, edge=0)
    else:
        ink(img, [(x - r * 0.2, my), (x + r * 0.2, my - 2)], ("m", key), 2.4)
    for s in (-1, 1):  # bochechas
        wash(img, ell(x + s * r * 0.62, y + r * 0.22, r * 0.14, r * 0.09, 10), (232, 130, 110), ("ck", key, s), alpha=0.5, edge=0)


def david(img, x, y, s=1.0, mood="happy", arm=0.0, sling=None, bob=0.0, key="d"):
    """Davi: menino pastor de túnica. arm = ângulo do braço direito (rad); sling = ângulo da funda girando."""
    y += math.sin(bob) * 6
    wash(img, poly((x - 70 * s, y + 210 * s), (x + 70 * s, y + 210 * s), (x + 48 * s, y + 20 * s), (x - 48 * s, y + 20 * s)), PAL["tunic"], (key, "body"))
    ink(img, poly((x - 70 * s, y + 210 * s), (x + 70 * s, y + 210 * s), (x + 48 * s, y + 20 * s), (x - 48 * s, y + 20 * s)), (key, "bodyi"), 2.4, closed=True)
    wash(img, poly((x - 58 * s, y + 104 * s), (x + 58 * s, y + 104 * s), (x + 60 * s, y + 122 * s), (x - 60 * s, y + 122 * s)), PAL["belt"], (key, "belt"))
    for k in (-1, 1):  # pernas e sandálias
        ink(img, [(x + k * 28 * s, y + 210 * s), (x + k * 30 * s, y + 280 * s)], (key, "leg", k), 4.2, PAL["skin2"])
        wash(img, ell(x + k * 34 * s, y + 286 * s, 22 * s, 9 * s, 12), PAL["belt"], (key, "foot", k), alpha=1, edge=0.2)
    # braço esquerdo parado, direito animado
    ink(img, [(x - 44 * s, y + 40 * s), (x - 70 * s, y + 110 * s), (x - 64 * s, y + 150 * s)], (key, "arml"), 4.6, PAL["skin2"])
    hx, hy = x + 44 * s + math.cos(arm) * 110 * s, y + 40 * s + math.sin(arm) * 110 * s
    ink(img, [(x + 44 * s, y + 40 * s), ((x + 44 * s + hx) / 2 + 8 * s, (y + 40 * s + hy) / 2 + 10 * s), (hx, hy)], (key, "armr"), 4.6, PAL["skin2"])
    dot(img, hx, hy, 11 * s, (key, "hand"), PAL["skin"])
    if sling is not None:  # funda: cordas + bolsinha girando
        px, py = hx + math.cos(sling) * 90 * s, hy + math.sin(sling) * 90 * s
        ink(img, [(hx, hy), (px, py)], (key, "sl"), 1.6, PAL["belt"])
        wash(img, ell(px, py, 14 * s, 10 * s, 10), PAL["belt"], (key, "pouch"), alpha=1)
    # cabeça e cabelo cacheado
    wash(img, ell(x, y - 40 * s, 62 * s, 64 * s, 26), PAL["skin"], (key, "head"))
    ink(img, ell(x, y - 40 * s, 62 * s, 64 * s, 26), (key, "headi"), 2.2, closed=True)
    for i in range(9):
        a = math.pi + i / 8 * math.pi
        wash(img, ell(x + math.cos(a) * 52 * s, y - 52 * s + math.sin(a) * 44 * s, 24 * s, 20 * s, 12), PAL["hair"], (key, "hair", i), alpha=0.97, edge=0.3)
    face(img, x, y - 30 * s, 60 * s, mood, key)


def goliath(img, x, y, s=1.0, mood="laugh", tilt=0.0, key="g"):
    """Golias: gigante de armadura, capacete com crista e lança. tilt = caindo (0 em pé, 1 no chão)."""
    lay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    g = lambda px, py: (px, py)  # noqa: E731 — desenha em pé numa camada e gira tudo junto
    for k in (-1, 1):
        ink(lay, [g(x + k * 60 * s, y + 360 * s), g(x + k * 66 * s, y + 520 * s)], (key, "leg", k), 9, PAL["skin2"])
        wash(lay, ell(x + k * 74 * s, y + 530 * s, 46 * s, 16 * s, 12), PAL["belt"], (key, "foot", k), alpha=1)
    body = poly((x - 140 * s, y + 380 * s), (x + 140 * s, y + 380 * s), (x + 120 * s, y + 70 * s), (x - 120 * s, y + 70 * s))
    wash(lay, body, PAL["metal"], (key, "body"))
    ink(lay, body, (key, "bodyi"), 3, closed=True)
    for i in range(4):  # escamas da armadura
        yy = y + 120 * s + i * 60 * s
        ink(lay, [(x - 110 * s + j * 44 * s + (i % 2) * 22 * s, yy) for j in range(6)], (key, "sc", i), 1.6, PAL["metal2"])
    ink(lay, [(x + 120 * s, y + 90 * s), (x + 200 * s, y + 210 * s)], (key, "arm"), 9, PAL["skin2"])
    ink(lay, [(x + 205 * s, y - 220 * s), (x + 205 * s, y + 420 * s)], (key, "spear"), 5, PAL["belt"])
    wash(lay, poly((x + 205 * s, y - 290 * s), (x + 225 * s, y - 220 * s), (x + 185 * s, y - 220 * s)), PAL["metal2"], (key, "tip"), alpha=1)
    wash(lay, ell(x, y - 10 * s, 92 * s, 98 * s, 28), PAL["skin"], (key, "head"))
    ink(lay, ell(x, y - 10 * s, 92 * s, 98 * s, 28), (key, "headi"), 2.6, closed=True)
    wash(lay, poly((x - 80 * s, y + 40 * s), (x + 80 * s, y + 40 * s), (x + 50 * s, y + 120 * s), (x - 50 * s, y + 120 * s)), PAL["hair"], (key, "beard"), alpha=0.97)
    helm = poly((x - 100 * s, y - 40 * s), (x - 90 * s, y - 100 * s), (x - 40 * s, y - 130 * s), (x + 40 * s, y - 130 * s), (x + 90 * s, y - 100 * s), (x + 100 * s, y - 40 * s))
    wash(lay, helm, PAL["bronze"], (key, "helm"))
    ink(lay, helm, (key, "helmi"), 2.6, closed=True)
    wash(lay, poly((x - 20 * s, y - 130 * s), (x + 20 * s, y - 130 * s), (x + 40 * s, y - 220 * s), (x - 60 * s, y - 200 * s)), PAL["red"], (key, "crest"))
    face(lay, x, y - 6 * s, 84 * s, mood, key)
    if tilt > 0:
        piv = (x * S, (y + 530 * s) * S)
        lay = lay.rotate(-82 * tilt, center=piv, resample=Image.BICUBIC)
    img.alpha_composite(lay)


def army(img, y, scared=0.0):
    """Soldados de Israel ao fundo, tremendo de medo."""
    for i in range(6):
        x = 110 + i * 170 + math.sin(T * 30 + i) * 4 * scared
        wash(img, poly((x - 56, y + 50), (x + 56, y + 50), (x + 46, y + 230), (x - 46, y + 230)), PAL["army"], ("ab", i))
        wash(img, ell(x, y, 50, 56, 18), PAL["skin"], ("ah", i), edge=0.3)
        ink(img, ell(x, y, 50, 56, 18), ("ahi", i), 1.8, closed=True)
        ink(img, [(x + 66, y - 90), (x + 66, y + 230)], ("asp", i), 2.4, PAL["belt"])
        face(img, x, y + 4, 46, "scared" if scared > 0.5 else "firm", ("af", i))


# ------------------------------------------------------------------------------------------------ roteiro
SHOTS = [
    ("Davi era só um menino pastor, cuidando das ovelhas do pai.", 4.6),
    ("Mas o gigante Golias desafiava o exército de Israel. E todos tinham medo.", 5.6),
    ("Davi não quis armadura. Pegou cinco pedras lisas do riacho.", 5.2),
    ("Girou a funda, e a pedra acertou a testa do gigante.", 4.6),
    ("Golias caiu. A batalha era do Senhor. Primeiro Samuel, dezessete.", 5.6),
]


def shot_frame(i, lt, dur):
    img = Image.fromarray(PAPER.astype(np.uint8)).convert("RGBA")
    if i == 0:  # pastor feliz com as ovelhas
        sky(img)
        sun(img)
        hills(img)
        for k, (sx, sy) in enumerate(((200, 1500), (760, 1560), (900, 1380))):
            sheep(img, sx + 10 * math.sin(lt + k), sy + 120, 1.5, hop=lt * 3 + k if k == 1 else 0, key=k)
        david(img, 520, 1100 - 60 * (1 - ease(lt / 0.8)), 1.7, "happy", arm=-0.6 + 0.3 * math.sin(lt * 4), bob=lt * 6)
    elif i == 1:  # Golias gigante rindo; exército com medo
        sky(img, warm=0.3)
        hills(img, 1250)
        zoom = 1 + 0.08 * ease(lt / dur)
        goliath(img, 560, 640 + 30 * math.sin(lt * 8) * (lt < 1.2), 1.3 * zoom, "laugh" if lt < 2.5 else "firm")
        army(img, 1560, scared=1.0 if lt > 1.5 else 0.0)
    elif i == 2:  # cinco pedras do riacho
        sky(img)
        hills(img, 1000)
        stream(img, 1500)
        taken = min(5, int(seg(lt, 1.0, dur - 0.6) * 5.99))
        stones(img, 1600, taken)
        david(img, 200 + 60 * ease(lt / 1.2), 1060, 1.45, "firm", arm=0.9 if taken < 5 else -0.4, bob=lt * 4)
        for k in range(taken):  # pedras já na bolsa, contando
            dot(img, 600 + k * 56, 1800, 22, ("bag", k), PAL["stone"])
        if taken:
            d = ImageDraw.Draw(img)
            d.text(((600 + taken * 56) * S, 1800 * S), f" {taken}", font=ImageFont.truetype(FONT, int(56 * S)), fill=INK, anchor="lm")
    elif i == 3:  # funda girando, pedra voa
        sky(img, warm=0.2)
        hills(img, 1200)
        throw = 2.0
        spin = lt * 14 if lt < throw else None
        goliath(img, 780, 820, 0.85, "laugh" if lt < throw + 0.6 else "wow")
        david(img, 250, 1330, 1.35, "firm", arm=-1.4 if lt < throw else -0.2, sling=spin)
        if lt >= throw:
            k = seg(lt, throw, throw + 0.6)
            sx, sy = 330 + (780 - 330) * k, 1180 + (790 - 1180) * k - 240 * math.sin(math.pi * k)
            if k < 1:
                dot(img, sx, sy, 16, "rock", PAL["stone"])
                for j in range(4):
                    ink(img, [(sx - 30 - j * 22, sy + 10 + j * 6), (sx - 50 - j * 22, sy + 14 + j * 6)], ("trail", j), 1.4, (120, 110, 100))
            else:  # estrelinhas do impacto
                for j in range(6):
                    a = j / 6 * 2 * math.pi + lt * 3
                    ink(img, [(780 + math.cos(a) * 70, 790 + math.sin(a) * 70), (780 + math.cos(a) * 110, 790 + math.sin(a) * 110)], ("hit", j), 2.4, PAL["sun"])
    else:  # Golias no chão, Davi comemora
        sky(img, warm=0.5)
        sun(img, 540, 560, 110)
        hills(img, 1150)
        goliath(img, 640, 1000, 0.75, "wow", tilt=ease(lt / 1.0))
        jump = abs(math.sin(lt * 5)) * 40 if lt > 1.2 else 0
        david(img, 280, 1150 - jump, 1.45, "happy", arm=-1.9, bob=0)
        for k, sx in enumerate((120, 470)):
            sheep(img, sx, 1700, 1.3, hop=lt * 5 + k if lt > 1.4 else 0, key=10 + k)
    return img


def caption(img, text, k):
    """Legenda numa faixa de papel (público mais velho: letra grande)."""
    if k <= 0:
        return img
    d = ImageDraw.Draw(img, "RGBA")
    f = ImageFont.truetype(FONT, 50)
    words, lines, cur = text.split(), [], ""
    for wd in words:
        t = (cur + " " + wd).strip()
        if f.getlength(t) > W - 180 and cur:
            lines.append(cur)
            cur = wd
        else:
            cur = t
    lines.append(cur)
    y0 = 130
    a = int(235 * min(1, k * 4))
    d.rounded_rectangle((60, y0 - 30, W - 60, y0 + len(lines) * 64 + 34), 30, fill=(250, 240, 214, a), outline=INK + (a,), width=4)
    for i, ln in enumerate(lines):
        d.text((W / 2, y0 + 32 + i * 64), ln, font=f, fill=INK + (a,), anchor="mm")
    return img


def render(out, silent=False):
    global T, PAPER
    PAPER = make_paper()
    work = tempfile.mkdtemp()
    clips, starts, t = [], [], 0.3
    for i, (line, base) in enumerate(SHOTS):
        p = os.path.join(work, f"v{i}.wav")
        quiz.tts(line, p, silent)
        c = quiz.load_wav(p)
        dur = max(base, len(c) / quiz.SR + 0.9)
        clips.append(c)
        starts.append((t, dur))
        t += dur
    end_card = 2.6
    total = t + end_card
    n = int(total * quiz.SR) + quiz.SR
    voice = np.zeros(n, np.float32)
    mix = quiz.pad_music(n / quiz.SR)[:n]
    mix = np.pad(mix, (0, n - len(mix)))
    for (st, _), c in zip(starts, clips):
        a = int((st + 0.25) * quiz.SR)
        voice[a:a + len(c)] += c[: n - a]
    for st, name in [(starts[i][0], "whoosh") for i in range(len(SHOTS))] + [(starts[3][0] + 2.0, "whoosh"), (starts[3][0] + 2.6, "pop"),
                                                                              (starts[4][0] + 1.0, "ding")]:
        c = quiz.sfx(name)
        a = int(st * quiz.SR)
        mix[a:a + len(c)] += c[: n - a]
    env = np.convolve(np.abs(voice), np.ones(4410) / 4410, "same")
    outa = np.clip(voice * 1.1 + mix * (1 - 0.55 * np.minimum(1, env * 12)), -1, 1)
    wav = os.path.join(work, "a.wav")
    with wave.open(wav, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(quiz.SR)
        wf.writeframes((outa * 32767).astype(np.int16).tobytes())
    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
                           "-shortest", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for fi in range(int(total * FPS)):
        T = fi / FPS
        cur = [i for i, (st, d) in enumerate(starts) if st <= T]
        if not cur:
            img = shot_frame(0, 0, starts[0][1])
            frame = finish(img)
        elif T < t:
            i = cur[-1]
            st, d = starts[i]
            lt = T - st
            img = shot_frame(i, lt, d)
            frame = caption(finish(img), SHOTS[i][0], lt - 0.2)
            # transição: borrão de tinta (pincelada) nos primeiros 0,35 s de cada cena
            if i > 0 and lt < 0.35:
                prev = finish(shot_frame(i - 1, starts[i - 1][1], starts[i - 1][1]))
                m = Image.new("L", (W, H), 0)
                ImageDraw.Draw(m).rectangle((0, 0, int(W * (1 - lt / 0.35)), H), fill=255)
                frame.paste(prev, (0, 0), m.filter(ImageFilter.GaussianBlur(40)))
        else:  # cartão final
            img = Image.fromarray(PAPER.astype(np.uint8)).convert("RGBA")
            sky(img, warm=0.5)
            frame = finish(img)
            d = ImageDraw.Draw(frame)
            k = ease((T - t) / 0.5)
            d.text((W / 2, 820), "1 Samuel 17", font=ImageFont.truetype(FONT, 90), fill=INK, anchor="mm")
            d.text((W / 2, 960), "Siga para mais", font=ImageFont.truetype(FONT, int(64 * (0.8 + 0.2 * k))), fill=PAL["red"], anchor="mm")
            d.text((W / 2, 1040), "histórias da Bíblia", font=ImageFont.truetype(FONT, int(64 * (0.8 + 0.2 * k))), fill=PAL["red"], anchor="mm")
        ff.stdin.write(frame.convert("RGB").tobytes())
    ff.stdin.close()
    ff.wait()
    print("ok", out, f"{total:.1f}s")


if __name__ == "__main__":
    render(sys.argv[1], "--silent" in sys.argv)
