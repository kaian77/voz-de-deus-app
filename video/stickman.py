"""Estilo "bonequinhos" (stickman) dos vídeos do YouTube: um boneco de palito explica o assunto ao lado de
desenhos simples (ícones, números, gráficos) que aparecem com "pop" no papel.

Tudo desenhado por código (PIL + ffmpeg): sem IA de imagem, sem marca d'água e o personagem é sempre o mesmo.
Cada cena do roteiro diz a pose do boneco, o que vai no quadro (ícones, texto, comparação ou gráfico) e se o
amigo aparece. A boca mexe com as palavras faladas (tempos do edge-tts) e o boneco pisca e respira.
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "engine", "assets", "fonts")

PAPER = (250, 247, 240)
INK = (24, 24, 27)
YELLOW = (255, 200, 61)
RED = (232, 74, 60)
BLUE = (43, 89, 195)
GREEN = (46, 160, 90)
GRAY = (150, 150, 150)
FRIEND = BLUE

# ------------------------------------------------------------------------------------------------ poses
# Ângulos em graus do segmento: 0 = para baixo, 90 = para a direita da tela, 180/-180 = para cima, -90 = esquerda.
# (braço esquerdo: ombro, cotovelo), (braço direito), (perna esquerda: coxa, canela), (perna direita),
# inclinação do tronco, cara.
POSES = {
    "idle": ((-14, -6), (14, 6), (-12, -6), (12, 6), 0, "smile"),
    "explain": ((-16, -8), (60, 150), (-12, -6), (12, 6), 0, "talk"),
    "point": ((-14, -4), (92, 96), (-12, -6), (14, 8), 3, "talk"),
    "think": ((-18, -10), (22, -164), (-10, -4), (12, 6), 0, "think"),
    "idea": ((-16, -8), (150, 172), (-12, -6), (12, 6), 0, "happy"),
    "shock": ((-140, -168), (140, 168), (-22, -12), (22, 12), 0, "shock"),
    "happy": ((-135, -160), (135, 160), (-14, -8), (14, 8), 0, "happy"),
    "celebrate": ((-150, -175), (120, 150), (-30, 10), (25, -5), 0, "happy"),
    "sad": ((-4, 0), (4, 0), (-6, -2), (6, 2), 9, "sad"),
    "shrug": ((-55, -128), (55, 128), (-12, -6), (12, 6), 0, "meh"),
    "facepalm": ((-12, -4), (18, -172), (-10, -4), (12, 6), 6, "sad"),
    "scared": ((-38, -150), (38, 150), (-18, -26), (18, 26), -4, "scared"),
    "angry": ((-52, 42), (52, -42), (-16, -8), (16, 8), 0, "angry"),
    "walk": ((-22, -10), (22, 10), (-22, -10), (22, 10), 4, "talk"),
    "run": ((-50, 40), (50, -60), (-40, 10), (40, 60), 12, "talk"),
    "sleep": ((-6, 0), (6, 0), (-6, -2), (6, 2), 4, "sleep"),
}
POSE_NAMES = list(POSES)


def _ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _pop(x):
    """Escala com "pop": cresce passando um pouco do tamanho e assenta."""
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    return 1 + math.sin(x * math.pi * 1.25) * (1 - x) * 0.35 - (1 - x) ** 3


def _lerp(a, b, k):
    if isinstance(a, tuple):
        return tuple(_lerp(x, y, k) for x, y in zip(a, b))
    return a + (b - a) * k


def _font(size, name="Anton-Regular.woff"):
    for n in (name, "Anton-Regular.woff", "Poppins-Bold.ttf"):
        try:
            return ImageFont.truetype(os.path.join(FONTS, n), size)
        except Exception:
            continue
    return ImageFont.load_default()


# ------------------------------------------------------------------------------------------------ boneco

def _seg(p, ang, length):
    a = math.radians(ang)
    return (p[0] + math.sin(a) * length, p[1] + math.cos(a) * length)


def draw_figure(d, x, y, r, pose, t=0.0, talk=0.0, blink=False, color=INK, hair="spike", look=1, s=1.0):
    """Boneco com o quadril em (x, y), cabeça de raio r. `pose` = tupla de POSES (já interpolada)."""
    la, ra, ll, rl, lean, face = pose
    lw = max(3, int(r * 0.2 * s))
    breathe = math.sin(t * 2.2) * r * 0.04
    hip = (x, y)
    sh = _seg(hip, 180 + lean, r * 2.6 + breathe)
    neck = _seg(hip, 180 + lean, r * 2.9 + breathe)
    head = _seg(hip, 180 + lean, r * 3.9 + breathe)

    def limb(start, angles, a, b):
        mid = _seg(start, angles[0], a)
        end = _seg(mid, angles[1], b)
        d.line([start, mid, end], fill=color, width=lw, joint="curve")
        for p in (start, mid, end):
            d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=color)
        return end

    # Pernas e tronco
    limb(hip, ll, r * 1.5, r * 1.55)
    limb(hip, rl, r * 1.5, r * 1.55)
    d.line([hip, neck], fill=color, width=lw)
    # Braços
    hands = [limb(sh, la, r * 1.35, r * 1.25), limb(sh, ra, r * 1.35, r * 1.25)]
    for hx, hy in hands:
        d.ellipse([hx - r * 0.2, hy - r * 0.2, hx + r * 0.2, hy + r * 0.2], fill=color)

    # Cabeça
    hx, hy = head
    d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=(255, 255, 255), outline=color, width=lw)
    if hair == "spike":
        d.line([(hx - r * 0.15, hy - r * 0.98), (hx + r * 0.05, hy - r * 1.4), (hx + r * 0.25, hy - r * 0.95)], fill=color, width=lw, joint="curve")
    elif hair == "bun":
        d.ellipse([hx - r * 0.35, hy - r * 1.55, hx + r * 0.35, hy - r * 0.85], fill=color)
    ex = r * 0.15 * look  # olha para o lado do quadro
    eyes = [(hx - r * 0.36 + ex, hy - r * 0.12), (hx + r * 0.36 + ex, hy - r * 0.12)]
    er = r * (0.17 if face in ("shock", "scared") else 0.12)
    for px, py in eyes:
        if blink or face == "sleep":
            d.line([(px - er, py), (px + er, py)], fill=color, width=max(2, lw // 2))
        else:
            d.ellipse([px - er, py - er, px + er, py + er], fill=color)
    # Sobrancelhas
    bw = max(2, lw // 2)
    by = hy - r * 0.42
    if face in ("angry",):
        d.line([(eyes[0][0] - r * 0.18, by - r * 0.1), (eyes[0][0] + r * 0.16, by + r * 0.06)], fill=color, width=bw)
        d.line([(eyes[1][0] - r * 0.16, by + r * 0.06), (eyes[1][0] + r * 0.18, by - r * 0.1)], fill=color, width=bw)
    elif face in ("sad", "scared", "meh"):
        d.line([(eyes[0][0] - r * 0.18, by + r * 0.04), (eyes[0][0] + r * 0.16, by - r * 0.1)], fill=color, width=bw)
        d.line([(eyes[1][0] - r * 0.16, by - r * 0.1), (eyes[1][0] + r * 0.18, by + r * 0.04)], fill=color, width=bw)
    elif face in ("shock", "think"):
        lift = r * (0.18 if face == "shock" else 0.08)
        d.line([(eyes[0][0] - r * 0.16, by - lift), (eyes[0][0] + r * 0.16, by - lift)], fill=color, width=bw)
        d.line([(eyes[1][0] - r * 0.16, by - lift - (r * 0.08 if face == "think" else 0)), (eyes[1][0] + r * 0.16, by - lift)], fill=color, width=bw)

    # Boca
    mx, my = hx + ex, hy + r * 0.42
    mw = r * 0.34
    if talk > 0.05 and face not in ("shock", "sleep"):
        oh = r * (0.1 + 0.28 * talk)
        d.ellipse([mx - mw * 0.75, my - oh * 0.5, mx + mw * 0.75, my + oh * 0.5], fill=color)
    elif face == "shock":
        d.ellipse([mx - r * 0.2, my - r * 0.25, mx + r * 0.2, my + r * 0.2], fill=color)
    elif face in ("smile", "happy", "talk"):
        k = 0.32 if face == "happy" else 0.2
        d.arc([mx - mw, my - r * k * 1.4, mx + mw, my + r * k], 15, 165, fill=color, width=bw + 1)
    elif face in ("sad", "scared"):
        d.arc([mx - mw * 0.8, my - r * 0.02, mx + mw * 0.8, my + r * 0.3], 200, 340, fill=color, width=bw + 1)
    elif face == "sleep":
        d.ellipse([mx - r * 0.08, my - r * 0.06, mx + r * 0.08, my + r * 0.08], outline=color, width=bw)
    else:  # meh, angry, think
        d.line([(mx - mw * 0.7, my + r * 0.05), (mx + mw * 0.7, my - (r * 0.06 if face == "think" else 0))], fill=color, width=bw + 1)
    return head


def _extras(d, head, r, face, t, pose_name):
    """Detalhes de expressão: traços de susto, gota de suor, interrogação, lâmpada e Zzz."""
    hx, hy = head
    lw = max(3, int(r * 0.12))
    if face == "shock":
        for a in (-60, -30, 30, 60):
            ang = math.radians(a - 90)
            p1 = (hx + math.cos(ang) * r * 1.35, hy + math.sin(ang) * r * 1.35)
            p2 = (hx + math.cos(ang) * r * 1.8, hy + math.sin(ang) * r * 1.8)
            d.line([p1, p2], fill=RED, width=lw)
    if face == "scared" or pose_name == "facepalm":
        sx, sy = hx + r * 1.15, hy - r * 0.3 + (t * 30) % (r * 0.6)
        d.polygon([(sx, sy - r * 0.35), (sx - r * 0.18, sy), (sx + r * 0.18, sy)], fill=(120, 190, 255))
        d.ellipse([sx - r * 0.18, sy - r * 0.18, sx + r * 0.18, sy + r * 0.18], fill=(120, 190, 255))
    if face == "think":
        f = _font(int(r * 1.0))
        bob = math.sin(t * 3) * r * 0.12
        d.text((hx + r * 1.2, hy - r * 2.0 + bob), "?", font=f, fill=BLUE, stroke_width=2, stroke_fill=INK)
    if pose_name == "idea":  # lâmpada ao lado da cabeça (em cima fica o quadro)
        icon(d, "lightbulb", hx - r * 1.9, hy - r * 1.3 + math.sin(t * 4) * r * 0.1, r * 1.4)
    if face == "sleep":
        f = _font(int(r * 0.7))
        k = (t * 0.8) % 1
        d.text((hx + r * (1.0 + k), hy - r * (1.2 + k * 1.2)), "Z", font=f, fill=BLUE)


# ------------------------------------------------------------------------------------------------ ícones
# Cada ícone é desenhado num quadrado de lado `s` centrado em (x, y), com traço grosso e cor chapada.

ICONS = [
    "money", "coin", "clock", "brain", "heart", "phone", "house", "car", "lightbulb", "question", "exclamation",
    "check", "cross", "fire", "water", "sun", "moon", "food", "coffee", "chart_up", "chart_down", "globe", "book",
    "gift", "warning", "battery_low", "battery_full", "person", "bank", "calendar", "target", "lock", "trophy",
    "arrow_up", "arrow_down", "plane", "pill", "dumbbell", "bed", "bomb", "star", "eye",
]


def icon(d, name, x, y, s):
    lw = max(3, int(s * 0.055))
    h = s / 2

    def box(k=1.0):
        return [x - h * k, y - h * k, x + h * k, y + h * k]

    if name == "money":
        d.rounded_rectangle([x - h, y - h * 0.55, x + h, y + h * 0.55], radius=s * 0.06, fill=(126, 200, 120), outline=INK, width=lw)
        d.ellipse([x - h * 0.3, y - h * 0.3, x + h * 0.3, y + h * 0.3], outline=INK, width=lw)
        f = _font(int(s * 0.32))
        d.text((x, y), "$", font=f, fill=INK, anchor="mm")
    elif name == "coin":
        d.ellipse(box(0.85), fill=YELLOW, outline=INK, width=lw)
        d.ellipse(box(0.6), outline=(200, 140, 20), width=lw)
        d.text((x, y), "$", font=_font(int(s * 0.45)), fill=INK, anchor="mm")
    elif name == "clock":
        d.ellipse(box(0.9), fill=(255, 255, 255), outline=INK, width=lw)
        d.line([(x, y), (x, y - h * 0.6)], fill=INK, width=lw)
        d.line([(x, y), (x + h * 0.42, y + h * 0.1)], fill=RED, width=lw)
        d.ellipse([x - lw, y - lw, x + lw, y + lw], fill=INK)
    elif name == "brain":
        d.ellipse([x - h * 0.9, y - h * 0.7, x + h * 0.9, y + h * 0.6], fill=(255, 170, 190), outline=INK, width=lw)
        d.line([(x, y - h * 0.65), (x, y + h * 0.55)], fill=INK, width=lw)
        for sx in (-1, 1):
            d.arc([x + sx * h * 0.15 - h * 0.35 + (sx > 0) * 0, y - h * 0.45, x + sx * h * 0.15 + h * 0.35, y + h * 0.05], 200, 340, fill=INK, width=lw)
            d.arc([x + sx * h * 0.45 - h * 0.3, y - h * 0.05, x + sx * h * 0.45 + h * 0.3, y + h * 0.45], 20, 160, fill=INK, width=lw)
    elif name == "heart":
        d.ellipse([x - h * 0.9, y - h * 0.65, x, y + h * 0.15], fill=RED, outline=INK, width=lw)
        d.ellipse([x, y - h * 0.65, x + h * 0.9, y + h * 0.15], fill=RED, outline=INK, width=lw)
        d.polygon([(x - h * 0.86, y - h * 0.1), (x + h * 0.86, y - h * 0.1), (x, y + h * 0.85)], fill=RED)
        d.line([(x - h * 0.86, y - h * 0.12), (x, y + h * 0.85), (x + h * 0.86, y - h * 0.12)], fill=INK, width=lw, joint="curve")
    elif name == "phone":
        d.rounded_rectangle([x - h * 0.5, y - h * 0.9, x + h * 0.5, y + h * 0.9], radius=s * 0.08, fill=(60, 60, 70), outline=INK, width=lw)
        d.rounded_rectangle([x - h * 0.38, y - h * 0.72, x + h * 0.38, y + h * 0.62], radius=s * 0.03, fill=(120, 190, 255))
        d.ellipse([x - h * 0.07, y + h * 0.7, x + h * 0.07, y + h * 0.84], fill=(255, 255, 255))
    elif name == "house":
        d.polygon([(x - h * 0.95, y - h * 0.05), (x, y - h * 0.9), (x + h * 0.95, y - h * 0.05)], fill=RED, outline=INK)
        d.line([(x - h * 0.95, y - h * 0.05), (x, y - h * 0.9), (x + h * 0.95, y - h * 0.05)], fill=INK, width=lw, joint="curve")
        d.rectangle([x - h * 0.7, y - h * 0.05, x + h * 0.7, y + h * 0.85], fill=(255, 236, 190), outline=INK, width=lw)
        d.rectangle([x - h * 0.18, y + h * 0.3, x + h * 0.18, y + h * 0.85], fill=(140, 90, 50), outline=INK, width=lw)
    elif name == "car":
        d.rounded_rectangle([x - h * 0.95, y - h * 0.1, x + h * 0.95, y + h * 0.45], radius=s * 0.08, fill=RED, outline=INK, width=lw)
        d.polygon([(x - h * 0.55, y - h * 0.1), (x - h * 0.35, y - h * 0.55), (x + h * 0.35, y - h * 0.55), (x + h * 0.6, y - h * 0.1)], fill=(120, 190, 255), outline=INK)
        for wx in (-0.55, 0.55):
            d.ellipse([x + wx * h - h * 0.22, y + h * 0.28, x + wx * h + h * 0.22, y + h * 0.72], fill=INK)
    elif name == "lightbulb":
        d.ellipse([x - h * 0.6, y - h * 0.9, x + h * 0.6, y + h * 0.3], fill=YELLOW, outline=INK, width=lw)
        d.rectangle([x - h * 0.28, y + h * 0.25, x + h * 0.28, y + h * 0.65], fill=GRAY, outline=INK, width=lw)
        for a in (-50, -20, 20, 50):
            ang = math.radians(a - 90)
            d.line([(x + math.cos(ang) * h * 0.8, y - h * 0.3 + math.sin(ang) * h * 0.8),
                    (x + math.cos(ang) * h * 1.0, y - h * 0.3 + math.sin(ang) * h * 1.0)], fill=INK, width=lw)
    elif name in ("question", "exclamation"):
        d.ellipse(box(0.9), fill=BLUE if name == "question" else RED, outline=INK, width=lw)
        d.text((x, y + s * 0.02), "?" if name == "question" else "!", font=_font(int(s * 0.62)), fill=(255, 255, 255), anchor="mm")
    elif name == "check":
        d.ellipse(box(0.9), fill=GREEN, outline=INK, width=lw)
        d.line([(x - h * 0.42, y), (x - h * 0.1, y + h * 0.35), (x + h * 0.45, y - h * 0.35)], fill=(255, 255, 255), width=lw * 2, joint="curve")
    elif name == "cross":
        d.ellipse(box(0.9), fill=RED, outline=INK, width=lw)
        d.line([(x - h * 0.35, y - h * 0.35), (x + h * 0.35, y + h * 0.35)], fill=(255, 255, 255), width=lw * 2)
        d.line([(x + h * 0.35, y - h * 0.35), (x - h * 0.35, y + h * 0.35)], fill=(255, 255, 255), width=lw * 2)
    elif name == "fire":
        d.polygon([(x, y - h * 0.95), (x + h * 0.6, y - h * 0.1), (x + h * 0.55, y + h * 0.5), (x, y + h * 0.85),
                   (x - h * 0.55, y + h * 0.5), (x - h * 0.6, y - h * 0.15), (x - h * 0.25, y - h * 0.35)], fill=(255, 130, 40), outline=INK)
        d.polygon([(x, y - h * 0.2), (x + h * 0.3, y + h * 0.3), (x, y + h * 0.7), (x - h * 0.3, y + h * 0.3)], fill=YELLOW)
    elif name == "water":
        d.polygon([(x, y - h * 0.95), (x + h * 0.6, y + h * 0.15), (x - h * 0.6, y + h * 0.15)], fill=(90, 170, 255))
        d.ellipse([x - h * 0.62, y - h * 0.25, x + h * 0.62, y + h * 0.9], fill=(90, 170, 255), outline=INK, width=lw)
        d.line([(x, y - h * 0.95), (x + h * 0.6, y + h * 0.15)], fill=INK, width=lw)
        d.line([(x, y - h * 0.95), (x - h * 0.6, y + h * 0.15)], fill=INK, width=lw)
    elif name == "sun":
        for a in range(0, 360, 45):
            ang = math.radians(a)
            d.line([(x + math.cos(ang) * h * 0.6, y + math.sin(ang) * h * 0.6), (x + math.cos(ang) * h * 0.95, y + math.sin(ang) * h * 0.95)], fill=INK, width=lw)
        d.ellipse(box(0.5), fill=YELLOW, outline=INK, width=lw)
    elif name == "moon":
        d.ellipse(box(0.8), fill=YELLOW, outline=INK, width=lw)
        d.ellipse([x - h * 0.4, y - h * 0.95, x + h * 1.1, y + h * 0.55], fill=PAPER)
    elif name == "food":  # hambúrguer
        d.chord([x - h * 0.9, y - h * 0.8, x + h * 0.9, y + h * 0.2], 180, 360, fill=(230, 160, 70), outline=INK, width=lw)
        d.rectangle([x - h * 0.95, y - h * 0.3, x + h * 0.95, y - h * 0.1], fill=GREEN, outline=INK, width=lw)
        d.rounded_rectangle([x - h * 0.9, y - h * 0.1, x + h * 0.9, y + h * 0.2], radius=s * 0.05, fill=(120, 70, 40), outline=INK, width=lw)
        d.rounded_rectangle([x - h * 0.9, y + h * 0.2, x + h * 0.9, y + h * 0.5], radius=s * 0.08, fill=(230, 160, 70), outline=INK, width=lw)
    elif name == "coffee":
        d.polygon([(x - h * 0.55, y - h * 0.5), (x + h * 0.55, y - h * 0.5), (x + h * 0.42, y + h * 0.75), (x - h * 0.42, y + h * 0.75)], fill=(255, 255, 255), outline=INK)
        d.line([(x - h * 0.55, y - h * 0.5), (x - h * 0.42, y + h * 0.75), (x + h * 0.42, y + h * 0.75), (x + h * 0.55, y - h * 0.5)], fill=INK, width=lw, joint="curve")
        d.rectangle([x - h * 0.62, y - h * 0.68, x + h * 0.62, y - h * 0.5], fill=(140, 90, 50), outline=INK, width=lw)
        d.rectangle([x - h * 0.48, y, x + h * 0.48, y + h * 0.25], fill=RED)
        for sx in (-0.2, 0.15):
            d.arc([x + sx * h - h * 0.12, y - h * 1.05, x + sx * h + h * 0.12, y - h * 0.75], 90, 270, fill=GRAY, width=lw)
    elif name in ("chart_up", "chart_down"):
        d.line([(x - h * 0.9, y - h * 0.9), (x - h * 0.9, y + h * 0.8), (x + h * 0.95, y + h * 0.8)], fill=INK, width=lw, joint="curve")
        pts = [(-0.75, 0.5), (-0.35, 0.2), (0.0, 0.35), (0.35, -0.2), (0.8, -0.75)]
        if name == "chart_down":
            pts = [(px, -py) for px, py in pts]
        pts = [(x + px * h, y + py * h) for px, py in pts]
        col = GREEN if name == "chart_up" else RED
        d.line(pts, fill=col, width=lw * 2, joint="curve")
        tip = pts[-1]
        dy = -1 if name == "chart_up" else 1
        d.polygon([(tip[0] + h * 0.12, tip[1] + dy * h * -0.02), (tip[0] - h * 0.22, tip[1] + dy * h * -0.05), (tip[0] + h * 0.02, tip[1] - dy * h * -0.28)], fill=col)
    elif name == "globe":
        d.ellipse(box(0.9), fill=(90, 170, 255), outline=INK, width=lw)
        d.polygon([(x - h * 0.5, y - h * 0.5), (x - h * 0.05, y - h * 0.6), (x + h * 0.1, y - h * 0.1), (x - h * 0.3, y + h * 0.2), (x - h * 0.6, y - h * 0.1)], fill=GREEN)
        d.polygon([(x + h * 0.25, y + h * 0.1), (x + h * 0.7, y + h * 0.05), (x + h * 0.5, y + h * 0.6), (x + h * 0.2, y + h * 0.45)], fill=GREEN)
        d.ellipse(box(0.9), outline=INK, width=lw)
    elif name == "book":
        d.polygon([(x - h * 0.95, y - h * 0.6), (x, y - h * 0.45), (x, y + h * 0.75), (x - h * 0.95, y + h * 0.6)], fill=(255, 255, 255), outline=INK)
        d.polygon([(x + h * 0.95, y - h * 0.6), (x, y - h * 0.45), (x, y + h * 0.75), (x + h * 0.95, y + h * 0.6)], fill=(255, 255, 255), outline=INK)
        d.line([(x - h * 0.95, y - h * 0.6), (x, y - h * 0.45), (x + h * 0.95, y - h * 0.6), (x + h * 0.95, y + h * 0.6), (x, y + h * 0.75),
                (x - h * 0.95, y + h * 0.6), (x - h * 0.95, y - h * 0.6)], fill=INK, width=lw, joint="curve")
        d.line([(x, y - h * 0.45), (x, y + h * 0.75)], fill=INK, width=lw)
        for k in range(3):
            yy = y - h * 0.2 + k * h * 0.25
            d.line([(x - h * 0.75, yy), (x - h * 0.2, yy + h * 0.06)], fill=GRAY, width=max(2, lw // 2))
            d.line([(x + h * 0.2, yy + h * 0.06), (x + h * 0.75, yy)], fill=GRAY, width=max(2, lw // 2))
    elif name == "gift":
        d.rectangle([x - h * 0.8, y - h * 0.3, x + h * 0.8, y + h * 0.85], fill=RED, outline=INK, width=lw)
        d.rectangle([x - h * 0.9, y - h * 0.55, x + h * 0.9, y - h * 0.3], fill=RED, outline=INK, width=lw)
        d.rectangle([x - h * 0.12, y - h * 0.55, x + h * 0.12, y + h * 0.85], fill=YELLOW, outline=INK, width=lw)
        d.ellipse([x - h * 0.55, y - h * 0.95, x - h * 0.02, y - h * 0.55], outline=INK, width=lw)
        d.ellipse([x + h * 0.02, y - h * 0.95, x + h * 0.55, y - h * 0.55], outline=INK, width=lw)
    elif name == "warning":
        d.polygon([(x, y - h * 0.9), (x + h * 0.95, y + h * 0.8), (x - h * 0.95, y + h * 0.8)], fill=YELLOW, outline=INK)
        d.line([(x, y - h * 0.9), (x + h * 0.95, y + h * 0.8), (x - h * 0.95, y + h * 0.8), (x, y - h * 0.9)], fill=INK, width=lw, joint="curve")
        d.text((x, y + h * 0.2), "!", font=_font(int(s * 0.5)), fill=INK, anchor="mm")
    elif name in ("battery_low", "battery_full"):
        d.rounded_rectangle([x - h * 0.9, y - h * 0.45, x + h * 0.75, y + h * 0.45], radius=s * 0.05, fill=(255, 255, 255), outline=INK, width=lw)
        d.rectangle([x + h * 0.75, y - h * 0.18, x + h * 0.92, y + h * 0.18], fill=INK)
        if name == "battery_low":
            d.rectangle([x - h * 0.75, y - h * 0.3, x - h * 0.45, y + h * 0.3], fill=RED)
        else:
            d.rectangle([x - h * 0.75, y - h * 0.3, x + h * 0.6, y + h * 0.3], fill=GREEN)
    elif name == "person":
        d.ellipse([x - h * 0.3, y - h * 0.9, x + h * 0.3, y - h * 0.3], fill=(255, 255, 255), outline=INK, width=lw)
        d.chord([x - h * 0.7, y - h * 0.15, x + h * 0.7, y + h * 1.4], 180, 360, fill=BLUE, outline=INK, width=lw)
    elif name == "bank":
        d.polygon([(x - h * 0.95, y - h * 0.35), (x, y - h * 0.9), (x + h * 0.95, y - h * 0.35)], fill=(220, 220, 225), outline=INK)
        d.line([(x - h * 0.95, y - h * 0.35), (x, y - h * 0.9), (x + h * 0.95, y - h * 0.35), (x - h * 0.95, y - h * 0.35)], fill=INK, width=lw, joint="curve")
        for k in range(4):
            cx = x - h * 0.6 + k * h * 0.4
            d.rectangle([cx - h * 0.08, y - h * 0.3, cx + h * 0.08, y + h * 0.55], fill=(255, 255, 255), outline=INK, width=max(2, lw // 2))
        d.rectangle([x - h * 0.95, y + h * 0.55, x + h * 0.95, y + h * 0.8], fill=(220, 220, 225), outline=INK, width=lw)
    elif name == "calendar":
        d.rectangle([x - h * 0.85, y - h * 0.7, x + h * 0.85, y + h * 0.85], fill=(255, 255, 255), outline=INK, width=lw)
        d.rectangle([x - h * 0.85, y - h * 0.7, x + h * 0.85, y - h * 0.35], fill=RED, outline=INK, width=lw)
        for i in range(3):
            for j in range(3):
                cx, cy = x - h * 0.5 + i * h * 0.5, y - h * 0.05 + j * h * 0.3
                d.rectangle([cx - h * 0.1, cy - h * 0.07, cx + h * 0.1, cy + h * 0.07], fill=GRAY)
    elif name == "target":
        for k, col in ((0.9, RED), (0.65, (255, 255, 255)), (0.4, RED), (0.15, (255, 255, 255))):
            d.ellipse(box(k), fill=col, outline=INK, width=lw)
    elif name == "lock":
        d.arc([x - h * 0.45, y - h * 0.95, x + h * 0.45, y + h * 0.1], 180, 360, fill=INK, width=lw * 2)
        d.line([(x - h * 0.45, y - h * 0.45), (x - h * 0.45, y - h * 0.1)], fill=INK, width=lw * 2)
        d.line([(x + h * 0.45, y - h * 0.45), (x + h * 0.45, y - h * 0.1)], fill=INK, width=lw * 2)
        d.rounded_rectangle([x - h * 0.7, y - h * 0.15, x + h * 0.7, y + h * 0.85], radius=s * 0.06, fill=YELLOW, outline=INK, width=lw)
        d.ellipse([x - h * 0.1, y + h * 0.2, x + h * 0.1, y + h * 0.4], fill=INK)
    elif name == "trophy":
        d.chord([x - h * 0.6, y - h * 1.1, x + h * 0.6, y + h * 0.2], 0, 180, fill=YELLOW, outline=INK, width=lw)
        d.rectangle([x - h * 0.6, y - h * 0.8, x + h * 0.6, y - h * 0.45], fill=YELLOW)
        d.line([(x - h * 0.6, y - h * 0.8), (x + h * 0.6, y - h * 0.8)], fill=INK, width=lw)
        d.rectangle([x - h * 0.1, y + h * 0.2, x + h * 0.1, y + h * 0.55], fill=YELLOW, outline=INK, width=lw)
        d.rectangle([x - h * 0.45, y + h * 0.55, x + h * 0.45, y + h * 0.8], fill=(140, 90, 50), outline=INK, width=lw)
        for sx in (-1, 1):
            d.arc([x + sx * h * 0.6 - h * 0.25, y - h * 0.75, x + sx * h * 0.6 + h * 0.25, y - h * 0.15], 270 if sx > 0 else 90, 90 if sx > 0 else 270, fill=INK, width=lw)
    elif name in ("arrow_up", "arrow_down"):
        k = -1 if name == "arrow_up" else 1
        col = GREEN if name == "arrow_up" else RED
        d.rectangle([x - h * 0.22, y - h * 0.6, x + h * 0.22, y + h * 0.6], fill=col)
        d.polygon([(x - h * 0.6, y + k * h * 0.2), (x + h * 0.6, y + k * h * 0.2), (x, y + k * h * 0.95)], fill=col, outline=INK)
    elif name == "plane":
        d.ellipse([x - h * 0.95, y - h * 0.18, x + h * 0.95, y + h * 0.18], fill=(255, 255, 255), outline=INK, width=lw)
        d.polygon([(x - h * 0.1, y), (x + h * 0.3, y), (x - h * 0.2, y - h * 0.8)], fill=BLUE, outline=INK)
        d.polygon([(x - h * 0.1, y), (x + h * 0.3, y), (x - h * 0.2, y + h * 0.8)], fill=BLUE, outline=INK)
        d.polygon([(x - h * 0.95, y), (x - h * 0.7, y), (x - h * 0.9, y - h * 0.45)], fill=BLUE, outline=INK)
    elif name == "pill":
        d.rounded_rectangle([x - h * 0.9, y - h * 0.32, x + h * 0.9, y + h * 0.32], radius=h * 0.32, fill=(255, 255, 255), outline=INK, width=lw)
        d.chord([x - h * 0.9, y - h * 0.32, x - h * 0.26, y + h * 0.32], 90, 270, fill=RED)
        d.rectangle([x - h * 0.58, y - h * 0.32, x, y + h * 0.32], fill=RED)
        d.rounded_rectangle([x - h * 0.9, y - h * 0.32, x + h * 0.9, y + h * 0.32], radius=h * 0.32, outline=INK, width=lw)
        d.line([(x, y - h * 0.32), (x, y + h * 0.32)], fill=INK, width=lw)
    elif name == "dumbbell":
        d.rectangle([x - h * 0.6, y - h * 0.08, x + h * 0.6, y + h * 0.08], fill=GRAY, outline=INK, width=max(2, lw // 2))
        for sx in (-1, 1):
            d.rounded_rectangle([x + sx * h * 0.6 - h * 0.15, y - h * 0.5, x + sx * h * 0.6 + h * 0.15, y + h * 0.5], radius=s * 0.03, fill=INK)
            d.rounded_rectangle([x + sx * h * 0.85 - h * 0.1, y - h * 0.32, x + sx * h * 0.85 + h * 0.1, y + h * 0.32], radius=s * 0.03, fill=INK)
    elif name == "bed":
        d.rectangle([x - h * 0.95, y - h * 0.05, x + h * 0.95, y + h * 0.35], fill=BLUE, outline=INK, width=lw)
        d.rectangle([x - h * 0.95, y - h * 0.55, x - h * 0.8, y + h * 0.7], fill=(140, 90, 50), outline=INK, width=lw)
        d.rounded_rectangle([x - h * 0.75, y - h * 0.3, x - h * 0.3, y - h * 0.05], radius=s * 0.05, fill=(255, 255, 255), outline=INK, width=lw)
        d.line([(x + h * 0.95, y + h * 0.35), (x + h * 0.95, y + h * 0.7)], fill=INK, width=lw)
    elif name == "bomb":
        d.ellipse([x - h * 0.75, y - h * 0.45, x + h * 0.55, y + h * 0.85], fill=INK)
        d.line([(x + h * 0.25, y - h * 0.35), (x + h * 0.55, y - h * 0.75)], fill=(140, 90, 50), width=lw)
        d.ellipse([x + h * 0.5, y - h * 0.95, x + h * 0.8, y - h * 0.65], fill=(255, 130, 40))
    elif name == "star":
        pts = []
        for k in range(10):
            ang = math.radians(-90 + k * 36)
            rr = h * (0.95 if k % 2 == 0 else 0.42)
            pts.append((x + math.cos(ang) * rr, y + math.sin(ang) * rr))
        d.polygon(pts, fill=YELLOW, outline=INK)
        d.line(pts + [pts[0]], fill=INK, width=lw, joint="curve")
    elif name == "eye":
        d.chord([x - h * 0.95, y - h * 0.6, x + h * 0.95, y + h * 0.6], 0, 360, fill=(255, 255, 255), outline=INK, width=lw)
        d.ellipse(box(0.38), fill=BLUE, outline=INK, width=lw)
        d.ellipse(box(0.16), fill=INK)
    else:  # desconhecido: ponto de interrogação
        icon(d, "question", x, y, s)


# ------------------------------------------------------------------------------------------------ cena

class _Layer:
    """Elemento do quadro desenhado uma vez (RGBA) e colado com escala "pop" a partir de `t0`."""

    def __init__(self, img, cx, cy, t0):
        self.img, self.cx, self.cy, self.t0 = img, cx, cy, t0
        self._cache = {}

    def paste(self, frame, t):
        k = _pop((t - self.t0) / 0.4)
        if k <= 0.01:
            return
        k = round(k, 2)
        im = self._cache.get(k)
        if im is None:
            w, h = self.img.size
            im = self.img if k == 1.0 else self.img.resize((max(1, int(w * k)), max(1, int(h * k))), Image.BILINEAR)
            self._cache[k] = im
        bob = math.sin((t - self.t0) * 2.4 + self.cx) * 4
        frame.alpha_composite(im, (int(self.cx - im.width / 2), int(self.cy - im.height / 2 + bob)))


def _icon_img(name, s):
    im = Image.new("RGBA", (int(s * 1.3), int(s * 1.3)), (0, 0, 0, 0))
    icon(ImageDraw.Draw(im), name, im.width / 2, im.height / 2, s)
    return im


def _text_img(text, max_w, max_h, color=INK):
    text = text.strip()
    size = int(max_h)
    f = _font(size)
    while size > 30:
        f = _font(size)
        l, t, r, b = f.getbbox(text)
        if r - l <= max_w and b - t <= max_h:
            break
        size -= 6
    l, t, r, b = f.getbbox(text)
    pad = 24
    im = Image.new("RGBA", (r - l + pad * 2, b - t + pad * 2 + 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((pad - l, pad - t), text, font=f, fill=color, stroke_width=max(2, size // 28), stroke_fill=INK)
    # Risco de marca-texto embaixo
    y = b - t + pad + 14
    d.line([(pad, y), (im.width - pad, y - 6)], fill=YELLOW, width=max(8, size // 9))
    return im


def _board(scene, w, h, t0, short, friend):
    """Elementos do quadro da cena: ícones, texto grande, comparação ou gráfico."""
    kind = scene.get("board") or ("text" if scene.get("text") else "icons" if scene.get("icons") else "none")
    icons = [i for i in (scene.get("icons") or []) if i][:3]
    text = (scene.get("text") or "").strip()
    if short:
        cx, cy, bw, bh = w / 2, h * 0.255, w * 0.86, h * 0.20
    elif friend:
        cx, cy, bw, bh = w / 2, h * 0.24, w * 0.42, h * 0.30
    else:
        cx, cy, bw, bh = w * 0.66, h * 0.40, w * 0.56, h * 0.50
    layers = []
    if kind in ("chart_up", "chart_down"):
        icons = [kind]
        kind = "icons" if not text else "mixed"
    if kind == "compare" and len(icons) >= 2:
        s = min(bw * 0.34, bh * 0.9)
        layers.append(_Layer(_icon_img(icons[0], s), cx - bw * 0.3, cy, t0))
        layers.append(_Layer(_text_img("VS", bw * 0.2, s * 0.45, RED), cx, cy, t0 + 0.35))
        layers.append(_Layer(_icon_img(icons[1], s), cx + bw * 0.3, cy, t0 + 0.7))
        if text:
            layers.append(_Layer(_text_img(text, bw, bh * 0.32, (255, 255, 255)), cx, cy + s * 0.75, t0 + 1.0))
        return layers
    if text and icons:  # ícone em cima, texto embaixo
        s = min(bh * 0.62, bw * 0.4)
        n = len(icons)
        for i, name in enumerate(icons):
            layers.append(_Layer(_icon_img(name, s), cx + (i - (n - 1) / 2) * s * 1.15, cy - bh * 0.22, t0 + i * 0.3))
        layers.append(_Layer(_text_img(text, bw, bh * 0.36, YELLOW), cx, cy + bh * 0.38, t0 + 0.3 * n))
        return layers
    if text:
        layers.append(_Layer(_text_img(text, bw, bh * 0.62, YELLOW), cx, cy, t0))
        return layers
    if icons:
        n = len(icons)
        s = min(bh * 0.95, bw / (n * 1.15))
        for i, name in enumerate(icons):
            layers.append(_Layer(_icon_img(name, s), cx + (i - (n - 1) / 2) * s * 1.15, cy, t0 + i * 0.35))
    return layers


def _paper(w, h):
    import numpy as np

    rng = np.random.default_rng(11)
    noise = rng.normal(0, 3.2, (h // 4, w // 4)).astype(np.float32)
    noise = np.asarray(Image.fromarray(noise.clip(-12, 12) + 128).convert("L").resize((w, h), Image.BILINEAR), dtype=np.float32) - 128
    base = np.array(PAPER, dtype=np.float32)[None, None, :] + noise[:, :, None]
    yy, xx = np.mgrid[0:h, 0:w]
    vig = 1 - 0.08 * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    img = (base * vig[:, :, None]).clip(0, 255).astype("uint8")
    return Image.fromarray(img, "RGB").convert("RGBA")


def _pose(name):
    return POSES.get(name) or POSES["explain"]


def _mix_pose(a, b, k):
    """Interpola duas poses (a cara troca na metade)."""
    out = tuple(_lerp(a[i], b[i], k) for i in range(5))
    return out + ((b if k > 0.5 else a)[5],)


def _anim(pose, name, t, talk):
    """Movimento contínuo por cima da pose: andar, correr, pular de alegria, tremer de medo e gesto ao falar."""
    la, ra, ll, rl, lean, face = pose
    dy = 0.0
    dx = 0.0
    if name in ("walk", "run"):
        sp, amp = (7, 34) if name == "run" else (4.5, 24)
        sw = math.sin(t * sp) * amp
        la, ra = (la[0] + sw, la[1] + sw * 0.6), (ra[0] - sw, ra[1] - sw * 0.6)
        ll, rl = (-sw * 0.9, -sw * 0.9 + 15), (sw * 0.9, sw * 0.9 + 15)
        dy = -abs(math.sin(t * sp)) * 8
    elif name in ("happy", "celebrate"):
        dy = -abs(math.sin(t * 6)) * 22
        la = (la[0] + math.sin(t * 6) * 10, la[1])
        ra = (ra[0] - math.sin(t * 6) * 10, ra[1])
    elif name == "scared":
        dx = math.sin(t * 40) * 3
    elif name == "shock":
        dy = -max(0.0, math.sin(min(t, 0.4) / 0.4 * math.pi)) * 20
    if talk > 0.05 and name in ("explain", "point", "idle", "think", "shrug", "angry"):
        g = math.sin(t * 9) * 6 * talk  # o braço acompanha a fala
        ra = (ra[0] + g, ra[1] + g * 1.5)
    return (la, ra, ll, rl, lean, face), dx, dy


def _talk_level(words, t):
    for wd in words:
        if wd["t"] - 0.03 <= t <= wd["t"] + wd["d"]:
            k = (t - wd["t"]) / max(0.08, wd["d"])
            return 0.35 + 0.65 * abs(math.sin(k * math.pi * max(1, round(wd["d"] / 0.16))))
    return 0.0


def video(scenes, words, w, h, out, fps=FPS):
    """Renderiza o vídeo mudo. `scenes`: dicts com start, advance (s) e os campos do roteiro (pose, board,
    icons, text, friend). Devolve os instantes em que algo aparece no quadro (para o som de "pop")."""
    short = h > w
    paper = _paper(w, h)
    r = int(min(w, h) * (0.068 if short else 0.055))
    if short:  # legendas logo abaixo dos pés (youtube.py: CAPTION_LOW)
        me = (w * 0.5, h * 0.585)
        mate = (w * 0.75, h * 0.585)
        me_with_friend = (w * 0.27, h * 0.585)
    else:
        me = (w * 0.2, h * 0.66)
        mate = (w * 0.8, h * 0.66)
        me_with_friend = (w * 0.2, h * 0.66)
    total = scenes[-1]["start"] + scenes[-1]["advance"]
    boards, pops = [], []
    for sc in scenes:
        layers = _board(sc, w, h, sc["start"] + 0.12, short, sc.get("friend") not in (None, "", "none"))
        boards.append(layers)
        pops += [l.t0 for l in layers]
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
                             "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    n = int(total * fps) + 1
    ss = 2  # boneco desenhado em 2x e reduzido: traço liso
    box = int(r * 11)
    si = 0
    prev_pose = _pose("idle")
    friend_x = {}
    for f in range(n):
        t = f / fps
        while si + 1 < len(scenes) and t >= scenes[si + 1]["start"]:
            prev_pose = _pose(scenes[si].get("pose"))
            si += 1
        sc = scenes[si]
        lt = t - sc["start"]
        name = sc.get("pose") or "explain"
        k = _ease(lt / 0.3) if si > 0 else 1.0
        pose = _mix_pose(prev_pose, _pose(name), k)
        talk = _talk_level(words, t)
        pose, dx, dy = _anim(pose, name, t, talk)
        frame = paper.copy()
        for layer in boards[si]:
            layer.paste(frame, t)
        has_friend = sc.get("friend") not in (None, "", "none")
        figs = [((me_with_friend if has_friend else me), pose, name, talk, INK, "spike", 1)]
        if has_friend:
            fname = sc["friend"] if sc["friend"] in POSES else "idle"
            fpose, fdx, fdy = _anim(_pose(fname), fname, t + 1.3, 0.0)
            # O amigo entra deslizando da direita
            enter = _ease(lt / 0.35) if not (si > 0 and scenes[si - 1].get("friend") not in (None, "", "none")) else 1.0
            pos = (mate[0] + (1 - enter) * w * 0.4 + fdx, mate[1] + fdy)
            figs.append((pos, fpose, fname, 0.0, FRIEND, "bun", -1))
        for (px, py), fp, fname, ftalk, col, hair, look in figs:
            if col is INK:
                px, py = px + dx, py + dy
            layer = Image.new("RGBA", (box * ss, box * ss), (0, 0, 0, 0))
            d = ImageDraw.Draw(layer)
            ox, oy = box * ss / 2, box * ss * 0.62
            # Sombra no chão
            gy = oy + r * ss * 3.0 - (dy * ss if col is INK else 0)
            d.ellipse([ox - r * ss * 1.4, gy - r * ss * 0.18, ox + r * ss * 1.4, gy + r * ss * 0.18], fill=(0, 0, 0, 38))
            blink = (t + (0.7 if col is not INK else 0)) % 3.6 < 0.12
            head = draw_figure(d, ox, oy, r * ss, fp, t=t, talk=ftalk, blink=blink, color=col, hair=hair, look=look)
            _extras(d, head, r * ss, fp[5], t, fname)
            small = layer.resize((box, box), Image.LANCZOS)
            frame.alpha_composite(small, (int(px - box / 2), int(py - box * 0.62)))
        proc.stdin.write(frame.convert("RGB").tobytes())
    proc.stdin.close()
    if proc.wait():
        raise RuntimeError("ffmpeg falhou ao montar o vídeo dos bonequinhos")
    return sorted(pops)


def thumbnail(scene, text, out):
    """Capa 1280x720: papel, boneco grande à direita fazendo a pose e o texto enorme à esquerda."""
    w, h = 1280, 720
    im = _paper(w, h)
    r = 58
    layer = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    name = scene.get("pose") if scene.get("pose") in POSES else "shock"
    head = draw_figure(d, w * 2 * 0.80, h * 2 * 0.70, r * 2, _pose(name), t=0.3, look=-1)
    _extras(d, head, r * 2, _pose(name)[5], 0.3, name)
    icons = [i for i in (scene.get("icons") or []) if i][:1]
    if icons:
        icon(d, icons[0], w * 2 * 0.80, h * 2 * 0.18, 230)
    im.alpha_composite(layer.resize((w, h), Image.LANCZOS))
    d = ImageDraw.Draw(im)
    words = text.upper().split()
    lines, cur = [], ""
    for wd in words:
        if cur and len(cur) + 1 + len(wd) > 10:
            lines.append(cur)
            cur = wd
        else:
            cur = f"{cur} {wd}".strip()
    if cur:
        lines.append(cur)
    lines = lines[:3]
    size = 150 if len(lines) <= 2 else 118
    f = _font(size)
    y = (h - len(lines) * size * 1.05) / 2
    for i, ln in enumerate(lines):
        last = i == len(lines) - 1
        if last:  # marca-texto amarelo atrás da última linha
            l, t_, r_, b = f.getbbox(ln)
            d.rectangle([40, y + t_ + size * 0.15, 60 + r_ + 20, y + b + 10], fill=YELLOW)
        d.text((56, y), ln, font=f, fill=RED if last else INK)
        y += size * 1.05
    im.convert("RGB").save(out, quality=90)
    return out
