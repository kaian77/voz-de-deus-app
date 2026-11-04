#!/usr/bin/env python3
"""Vídeo de venda do Social Studio (9:16, ~70 s) para oferecer o programa a outras lojas: cena a cena o que ele faz
(postar com IA, agenda e piloto automático, vídeo de produto, link no direct, Nuvemshop + Mercado Livre, fotos,
estoque/pedidos, aviso de venda) e chamada para o WhatsApp. Motion feito por código (PIL), narração (edge-tts, via
youtube.speak), legenda palavra a palavra, trilha e efeitos sintetizados. Visual próprio do produto (não é da Brax):
grafite, azul elétrico e verde-limão; títulos em Anton.

Uso: python3 video/studio_tour.py saida.mp4 [--silent] [--frames 1.5,10,30]  (--frames só tira fotos para conferir)
"""
import math
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "engine", "scripts"))

W, H, FPS = 1080, 1920, 30
FONTS = os.path.join(HERE, "engine", "assets", "fonts")
ANTON = os.path.join(FONTS, "Anton-Regular.woff")
INTER = os.path.join(FONTS, "InterDisplay-Black.otf")
INTER_B = os.path.join(FONTS, "InterDisplay-ExtraBold.otf")
SERIF = os.path.join(FONTS, "PlayfairDisplay-Italic.ttf")
# RED = cor principal (azul elétrico), GOLD = destaque (verde-limão): nomes antigos mantidos no código
RED, GOLD, INK, WHITE, PAPER = (52, 110, 255), (198, 244, 50), (14, 15, 19), (255, 255, 255), (236, 240, 248)
WHATSAPP = "(61) 99237-2216"
GREY = (150, 150, 158)
VOICE = "pt-BR-AntonioNeural"

# ------------------------------------------------------------------------------------------- roteiro
# Cada cena: seção do cardápio, título (com *destaque*), narração e o desenho (função abaixo)
SCENES = [
    ("", "AINDA FAZ TUDO *NA MÃO*?", "Você ainda posta, responde cliente e cadastra produto tudo na mão? Isso acabou.", "intro"),
    ("CONECTA TUDO", "UM LUGAR *SÓ*", "Conheça o Social Studio. Instagram, TikTok, Nuvemshop e Mercado Livre, tudo num lugar só.", "hub"),
    ("POSTAR", "POSTA *NA HORA*", "Mande a foto, diga o produto, e a inteligência artificial escreve a legenda e posta na hora. Story, post, carrossel ou reels, um ou vários de uma vez.", "post"),
    ("AGENDAR", "AGENDA E *PILOTO AUTOMÁTICO*", "Agende o mês inteiro em minutos. O piloto automático cria os posts e você só aprova.", "calendar"),
    ("VÍDEOS", "VÍDEO DE *PRODUTO*", "Ele também faz vídeo de produto sozinho, com animação e música, pronto para o reels e o TikTok.", "video"),
    ("DIRECT", "COMENTOU, *RECEBEU*", "Cliente comentou a palavra do post? O Studio manda o link do produto direto no direct, na hora.", "dm"),
    ("LOJA", "CADASTRO EM *1 TOQUE*", "Cadastre o produto uma vez e ele vai para a sua loja na Nuvemshop e para o Mercado Livre, com as variações.", "shop"),
    ("FOTOS", "FOTO DE *PROFISSIONAL*", "Tira o fundo da foto e cria a foto de fundo branco e a foto com cenário, sem mudar o seu produto.", "photos"),
    ("GESTÃO", "ESTOQUE, PEDIDOS E *CUPOM*", "Estoque e pedidos sincronizados, e ainda dá cupom para quem avalia a compra.", "stock"),
    ("RENDA EXTRA", "DINHEIRO *A MAIS*", "E ainda vem com ferramentas de renda extra: sites para clientes, canal no YouTube, cortes, jogos e quiz.", "extra"),
    ("NO CELULAR", "AVISO DE *CADA VENDA*", "Tudo no celular, com aviso a cada venda nova.", "phone"),
    ("", "QUER NA *SUA LOJA*?", "Quer o Social Studio na sua loja? Chama no WhatsApp e veja funcionando.", "outro"),
]

# ------------------------------------------------------------------------------------------- utilidades
_FONT = {}


def font(path, size):
    k = (path, size)
    if k not in _FONT:
        _FONT[k] = ImageFont.truetype(path, size)
    return _FONT[k]


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def back(t):
    """Entra passando um pouco do ponto e volta (overshoot)."""
    t = clamp(t)
    c = 1.70158
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2


def lerp(a, b, t):
    return a + (b - a) * t


_TXT = {}


def text_img(text, path, size, color, stroke=0, stroke_color=INK):
    k = (text, path, size, color, stroke, stroke_color)
    if k in _TXT:
        return _TXT[k]
    f = font(path, size)
    l, t, r, b = f.getbbox(text, stroke_width=stroke)
    im = Image.new("RGBA", (r - l + 4, b - t + 4), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((2 - l, 2 - t), text, font=f, fill=color, stroke_width=stroke, stroke_fill=stroke_color)
    _TXT[k] = im
    return im


def title_img(text, size, maxw=int(W * 0.88)):
    """Título em Anton maiúsculo; *trecho* em dourado. Quebra em linhas pela largura."""
    words = []
    for i, part in enumerate(text.split("*")):
        for w in part.split():
            words.append((w, i % 2 == 1))
    f = font(ANTON, size)
    lines, cur = [], []
    for w in words:
        test = " ".join(x for x, _ in cur + [w])
        if cur and f.getlength(test) > maxw:
            lines.append(cur)
            cur = []
        cur.append(w)
    if cur:
        lines.append(cur)
    lh = int(size * 1.08)
    im = Image.new("RGBA", (maxw, lh * len(lines) + 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for li, line in enumerate(lines):
        total = f.getlength(" ".join(x for x, _ in line))
        x = (maxw - total) / 2
        for w, hl in line:
            d.text((x, li * lh), w, font=f, fill=GOLD if hl else WHITE)
            x += f.getlength(w + " ")
    return im.crop(im.getbbox())


def paste_scaled(canvas, im, cx, cy, scale=1.0, alpha=1.0, rot=0.0):
    if scale <= 0.01 or alpha <= 0.01:
        return
    if scale != 1.0:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BILINEAR)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 1:
        im = im.copy()
        im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def rrect(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, r, fill=fill, outline=outline, width=width)


def card(w, h, fill=(30, 30, 34, 255), border=None, r=34):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rrect(d, (0, 0, w - 1, h - 1), r, fill=fill, outline=border, width=4 if border else 1)
    return im


def background():
    """Fundo escuro com vinheta, grão e um brilho vermelho em cima (fixo, calculado uma vez)."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot((x - W / 2) / W, (y - H * 0.38) / H)
    base = np.clip(1 - r * 1.35, 0, 1)[..., None]
    col = np.array(INK, np.float32) * (0.55 + 0.6 * base)
    glow = np.exp(-(((x - W * 0.5) / (W * 0.55)) ** 2 + ((y + H * 0.05) / (H * 0.22)) ** 2))[..., None]
    col = col * (1 - glow * 0.5) + np.array(RED, np.float32) * glow * 0.5
    grain = np.random.default_rng(1).normal(0, 5, (H, W, 1))
    img = np.clip(col + grain, 0, 255).astype(np.uint8)
    return Image.fromarray(img).convert("RGBA")


# ------------------------------------------------------------------------------------------- desenhos por cena
# Cada função recebe (canvas, d, t, dur) com t = segundos desde o começo da cena. Conteúdo entre y 0.25 e 0.70.

def menu_frame(c, d, t):
    """Moldura de cardápio (linhas duplas douradas) que se desenha no começo."""
    k = ease(t / 0.8)
    x0, y0, x1, y1 = 70, 470, W - 70, 1370
    for inset, wdt in ((0, 5), (18, 2)):
        a, b = x0 + inset, x1 - inset
        top, bot = y0 + inset, y1 - inset
        d.line((a, top, lerp(a, b, k), top), fill=GOLD, width=wdt)
        d.line((b, bot, lerp(b, a, k), bot), fill=GOLD, width=wdt)
        d.line((a, bot, a, lerp(bot, top, k)), fill=GOLD, width=wdt)
        d.line((b, top, b, lerp(top, bot, k)), fill=GOLD, width=wdt)


def sc_intro(c, d, t, dur):
    # pilha de tarefas "na mão" que vai caindo, e o título-gancho por cima
    tasks = ["Postar no Instagram", "Responder direct", "Cadastrar no site", "Anunciar no Mercado Livre", "Atualizar estoque"]
    for i, tx in enumerate(tasks):
        k = back((t - 0.15 * i) / 0.35)
        if k <= 0:
            continue
        tl = card(700, 96, fill=(30, 32, 40, 255), border=(70, 74, 86, 255), r=26)
        g = ImageDraw.Draw(tl)
        g.rounded_rectangle((26, 26, 70, 70), 10, outline=GREY, width=5)
        g.text((96, 48), tx, font=font(INTER_B, 38), fill=WHITE, anchor="lm")
        fall = max(0.0, t - 2.4) ** 2 * 900 * (1 + i * 0.15)
        paste_scaled(c, tl, W / 2 + (i - 2) * 18, 430 + i * 105 + fall, k, clamp(k), rot=(i - 2) * 2 + min(25, fall / 40) * (1 if i % 2 else -1))
    big = title_img("AINDA FAZ TUDO", 120)
    paste_scaled(c, big, W / 2, 1120, back((t - 0.9) / 0.4), clamp((t - 0.9) / 0.2))
    big2 = title_img("*NA MÃO?*", 190)
    paste_scaled(c, big2, W / 2, 1285, back((t - 1.2) / 0.4), clamp((t - 1.2) / 0.2), rot=-3)


def sc_hub(c, d, t, dur):
    cx, cy = W / 2, 900
    names = [("INSTAGRAM", (-1, -1)), ("TIKTOK", (1, -1)), ("NUVEMSHOP", (-1, 1)), ("MERCADO LIVRE", (1, 1))]
    for i, (name, (sx, sy)) in enumerate(names):
        k = ease((t - 0.6 - i * 0.3) / 0.4)
        if k <= 0:
            continue
        px, py = cx + sx * 260, cy + sy * 300
        d.line((cx, cy, lerp(cx, px, k), lerp(cy, py, k)), fill=(*GOLD, 255), width=8)
        # bolinha correndo na linha (dados indo e voltando)
        f = (t * 0.9 + i * 0.25) % 1
        d.ellipse((lerp(cx, px, f) - 12, lerp(cy, py, f) - 12, lerp(cx, px, f) + 12, lerp(cy, py, f) + 12), fill=WHITE)
        b = badge(name, (30, 32, 40), WHITE)
        paste_scaled(c, b, px, py, back(k), 1)
    k = back(t / 0.5)
    hub = card(300, 300, fill=(*RED, 255), r=80)
    ImageDraw.Draw(hub).text((150, 150), "S", font=font(ANTON, 200), fill=WHITE, anchor="mm")
    paste_scaled(c, hub, cx, cy, k * (1 + 0.03 * math.sin(t * 5)), clamp(k))


SECTIONS = [("01", "PUBLICAR"), ("02", "ENGAJAR"), ("03", "LOJA"), ("04", "CRESCER"), ("05", "RENDA EXTRA")]


def sc_menu(c, d, t, dur):
    menu_frame(c, d, 1)
    for i, (n, name) in enumerate(SECTIONS):
        k = ease((t - 0.4 - i * 0.45) / 0.4)
        if k <= 0:
            continue
        y = 600 + i * 150
        x = 140 + (1 - k) * 80
        num = text_img(n, ANTON, 70, GOLD)
        nm = text_img(name, ANTON, 76, WHITE)
        c.alpha_composite(_fade(num, k), (int(x), y))
        c.alpha_composite(_fade(nm, k), (int(x + 120), y))
        # pontilhado até a direita, como preço de cardápio
        x_end = x + 120 + nm.width + 20
        for px in range(int(x_end), int(W - 150), 22):
            if (px - x_end) / max(1, W - 150 - x_end) < k:
                d.ellipse((px, y + 60, px + 7, y + 67), fill=(*GOLD, 200))
        d.ellipse((W - 160, y + 30, W - 128, y + 62), fill=RED)


def _fade(im, a):
    if a >= 1:
        return im
    im = im.copy()
    im.putalpha(im.getchannel("A").point(lambda v: int(v * clamp(a))))
    return im


def phone(c, cx, cy, w=430, h=860, screen=(250, 250, 250)):
    d = ImageDraw.Draw(c)
    rrect(d, (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), 60, fill=(12, 12, 14), outline=(70, 70, 76), width=6)
    rrect(d, (cx - w / 2 + 18, cy - h / 2 + 18, cx + w / 2 - 18, cy + h / 2 - 18), 44, fill=screen)
    rrect(d, (cx - 60, cy - h / 2 + 30, cx + 60, cy - h / 2 + 52), 11, fill=(12, 12, 14))
    return (cx - w / 2 + 18, cy - h / 2 + 18, cx + w / 2 - 18, cy + h / 2 - 18)


def pin_icon(d, cx, cy, r, color):
    """Pin redondo esmaltado: anel de metal + miolo vermelho + estrela dourada."""
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    d.ellipse((cx - r * 0.78, cy - r * 0.78, cx + r * 0.78, cy + r * 0.78), fill=RED)
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r * (0.5 if i % 2 == 0 else 0.22)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=color)
    d.ellipse((cx - r * 0.55, cy - r * 0.9, cx - r * 0.2, cy - r * 0.6), fill=(255, 255, 255, 120))


SILVER = (205, 208, 214)


def sc_post(c, d, t, dur):
    box = phone(c, W / 2, 900)
    x0, y0, x1, y1 = box
    d2 = ImageDraw.Draw(c)
    # foto do produto no post
    rrect(d2, (x0 + 20, y0 + 70, x1 - 20, y0 + 430), 20, fill=(235, 232, 225))
    pin_icon(d2, (x0 + x1) / 2, y0 + 250, 110 * back((t - 0.2) / 0.5), GOLD)
    # tipos de post trocando
    kinds = ["STORY", "POST", "CARROSSEL", "REELS"]
    k = int(clamp(t / max(dur, 1)) * 4.0) % 4 if t > 1.5 else 1
    for i, name in enumerate(kinds):
        f = font(INTER_B, 22)
        tw = f.getlength(name) + 26
        px = x0 + 20 + sum(font(INTER_B, 22).getlength(n) + 36 for n in kinds[:i])
        on = i == k
        rrect(d2, (px, y0 + 450, px + tw, y0 + 492), 21, fill=RED if on else (225, 225, 228))
        d2.text((px + 13, y0 + 461), name, font=f, fill=WHITE if on else (90, 90, 95))
    # legenda sendo "digitada" pela IA
    lines = ["Chegou novidade na loja!", "Feito para quem ama", "qualidade e bom preço.", "#novidade #lojaonline"]
    shown = (t - 0.8) * 40
    yy = y0 + 520
    for ln in lines:
        n = int(clamp(shown, 0, len(ln)))
        if n <= 0:
            break
        d2.text((x0 + 28, yy), ln[:n], font=font(INTER_B, 26), fill=(40, 40, 44))
        shown -= len(ln)
        yy += 40
    # selo IA
    k2 = back((t - 0.6) / 0.4)
    sel = card(150, 64, fill=(*GOLD, 255), r=32)
    ImageDraw.Draw(sel).text((75, 32), "IA", font=font(ANTON, 40), fill=INK, anchor="mm")
    paste_scaled(c, sel, x1 + 40, y0 + 560, k2, clamp(k2), rot=-8)


def sc_calendar(c, d, t, dur):
    x0, y0, cw, ch = 140, 640, 115, 96
    rrect(d, (x0 - 30, y0 - 110, x0 + 7 * cw + 30, y0 + 5 * ch + 30), 30, fill=(28, 28, 32), outline=(60, 60, 66), width=3)
    d.text((x0, y0 - 85), "NOVEMBRO", font=font(ANTON, 52), fill=WHITE)
    rng = np.random.default_rng(4)
    marks = rng.choice(35, 14, replace=False)
    for i in range(35):
        r, col = divmod(i, 7)
        x, y = x0 + col * cw, y0 + r * ch
        rrect(d, (x + 6, y + 6, x + cw - 6, y + ch - 6), 14, fill=(40, 40, 46))
        j = list(marks).index(i) if i in marks else -1
        if j >= 0:
            k = back((t - 0.4 - j * 0.12) / 0.3)
            if k > 0:
                rr = 20 * k
                d.ellipse((x + cw / 2 - rr, y + ch / 2 - rr, x + cw / 2 + rr, y + ch / 2 + rr), fill=RED if j % 3 else GOLD)
    # cartão "Aprovar"
    k = back((t - 2.6) / 0.5)
    ap = card(560, 170, fill=(255, 255, 255, 255), r=28)
    a = ImageDraw.Draw(ap)
    a.text((30, 30), "Piloto automático", font=font(INTER_B, 30), fill=(90, 90, 95))
    a.text((30, 75), "3 posts prontos", font=font(INTER, 46), fill=INK)
    rrect(a, (390, 50, 530, 120), 35, fill=(34, 160, 90))
    a.line((432, 86, 452, 104, 490, 66), fill=WHITE, width=10, joint="curve")
    paste_scaled(c, ap, W / 2, 1310, k, clamp(k))


def sc_video(c, d, t, dur):
    # tira de filme correndo
    off = (t * 220) % 200
    for row, yy in ((0, 560), (1, 1190)):
        d.rectangle((0, yy, W, yy + 130), fill=(10, 10, 12))
        for i in range(-1, 7):
            x = i * 200 + (off if row == 0 else -off)
            d.rectangle((x + 20, yy + 25, x + 180, yy + 105), fill=(60, 60, 66))
            for hx in range(int(x), int(x + 200), 40):
                d.rectangle((hx + 8, yy + 6, hx + 24, yy + 16), fill=(200, 200, 200))
                d.rectangle((hx + 8, yy + 114, hx + 24, yy + 124), fill=(200, 200, 200))
    # quadro central 9:16 com o pin girando
    fr = card(360, 560, fill=(245, 240, 230, 255), border=GOLD, r=30)
    paste_scaled(c, fr, W / 2, 880, back(t / 0.5), 1)
    if t > 0.3:
        sx = abs(math.cos(t * 2.4))
        r = 110
        d.ellipse((W / 2 - r * sx, 830 - r, W / 2 + r * sx, 830 + r), fill=GOLD if math.cos(t * 2.4) > 0 else SILVER)
        d.ellipse((W / 2 - r * 0.75 * sx, 830 - r * 0.75, W / 2 + r * 0.75 * sx, 830 + r * 0.75), fill=RED)
    # play pulsando + notas musicais
    p = 1 + 0.08 * math.sin(t * 6)
    r = 46 * p
    d.ellipse((W / 2 - r, 1030 - r, W / 2 + r, 1030 + r), fill=RED)
    d.polygon([(W / 2 - 14 * p, 1030 - 20 * p), (W / 2 - 14 * p, 1030 + 20 * p), (W / 2 + 22 * p, 1030)], fill=WHITE)
    for i in range(3):
        yy = 900 - ((t * 120 + i * 90) % 260)
        x = 820 + i * 50
        d.ellipse((x, yy + 40, x + 30, yy + 62), fill=GOLD)
        d.rectangle((x + 24, yy, x + 30, yy + 50), fill=GOLD)
        d.polygon([(x + 30, yy), (x + 52, yy + 14), (x + 30, yy + 18)], fill=GOLD)


def bubble(text, fill, color, w=560, h=110, r=50):
    im = card(w, h, fill=(*fill, 255), r=r)
    ImageDraw.Draw(im).text((36, h / 2), text, font=font(INTER_B, 40), fill=color, anchor="lm")
    return im


def sc_dm(c, d, t, dur):
    # post com comentário "EU QUERO"
    rrect(d, (150, 470, 930, 780), 30, fill=(28, 28, 32))
    pin_icon(d, 290, 625, 95, GOLD)
    d.text((420, 540), "@cliente comentou:", font=font(INTER_B, 32), fill=GREY)
    k = back((t - 0.3) / 0.4)
    paste_scaled(c, bubble("EU QUERO", (255, 255, 255), INK, w=360), 650, 660, k, clamp(k))
    # seta descendo
    a = ease((t - 1.2) / 0.5)
    if a > 0:
        d.line((540, 800, 540, 800 + 160 * a), fill=GOLD, width=10)
        if a > 0.95:
            d.polygon([(510, 950), (570, 950), (540, 990)], fill=GOLD)
    # direct com o link
    k = back((t - 1.8) / 0.5)
    dm = card(700, 300, fill=(255, 255, 255, 255), r=36)
    g = ImageDraw.Draw(dm)
    g.text((36, 30), "Direct", font=font(INTER, 40), fill=INK)
    rrect(g, (36, 100, 664, 170), 35, fill=(240, 240, 244))
    g.text((60, 135), "Oi! Aqui está o seu pin:", font=font(INTER_B, 30), fill=INK, anchor="lm")
    rrect(g, (36, 190, 664, 260), 35, fill=RED)
    g.text((350, 225), "VER O PRODUTO", font=font(ANTON, 38), fill=WHITE, anchor="mm")
    paste_scaled(c, dm, W / 2, 1180, k, clamp(k))


def badge(text, fill, color):
    f = font(ANTON, 44)
    w = int(f.getlength(text)) + 60
    im = card(w, 84, fill=(*fill, 255), r=42)
    ImageDraw.Draw(im).text((w / 2, 42), text, font=f, fill=color, anchor="mm")
    return im


def sc_shop(c, d, t, dur):
    pc = card(560, 520, fill=(255, 255, 255, 255), r=36)
    g = ImageDraw.Draw(pc)
    rrect(g, (30, 30, 530, 330), 24, fill=(240, 236, 228))
    pin_icon(g, 190, 180, 95, SILVER)
    pin_icon(g, 370, 180, 95, GOLD)
    g.text((40, 355), "Seu produto", font=font(INTER, 36), fill=INK)
    sel = int(t * 1.2) % 2
    for i, (name, col) in enumerate((("Prata", SILVER), ("Dourado", GOLD))):
        x = 40 + i * 200
        rrect(g, (x, 420, x + 180, 485), 32, fill=(*col, 255), outline=INK if i == sel else None, width=4)
        g.text((x + 90, 452), name, font=font(INTER_B, 30), fill=INK, anchor="mm")
    k = back(t / 0.5)
    paste_scaled(c, pc, W / 2, 800, k, clamp(k))
    for i, (txt, fill, col, y) in enumerate((("NO SITE", (34, 160, 90), WHITE, 1150), ("NO MERCADO LIVRE", GOLD, INK, 1260))):
        k = back((t - 1.2 - i * 0.4) / 0.4)
        paste_scaled(c, badge(txt, fill, col), W / 2, y, k, clamp(k))


def sc_photos(c, d, t, dur):
    # 1) foto original num cartão; 2) recorte; 3) duas fotos prontas
    k1 = ease(t / 0.4)
    orig = card(300, 380, fill=(150, 125, 110, 255), r=20)
    g = ImageDraw.Draw(orig)
    pin_icon(g, 100, 150, 60, SILVER)
    pin_icon(g, 200, 220, 60, GOLD)
    paste_scaled(c, orig, 250, 720, 1, k1)
    a = ease((t - 0.9) / 0.4)
    if a > 0:
        d.line((420, 720, 420 + 150 * a, 720), fill=GOLD, width=10)
    k2 = back((t - 1.3) / 0.4)
    for i, (col, y) in enumerate(((SILVER, 600), (GOLD, 850))):
        out = card(300, 220, fill=(255, 255, 255, 255), r=20)
        pin_icon(ImageDraw.Draw(out), 150, 110, 80, col)
        paste_scaled(c, out, 780, y, k2, clamp(k2))
    k3 = back((t - 2.3) / 0.5)
    scene = card(820, 330, fill=(60, 75, 95, 255), r=30)
    g = ImageDraw.Draw(scene)
    for i in range(14):  # bokeh de cenário
        x, y = (i * 137) % 800, 40 + (i * 71) % 200
        g.ellipse((x, y, x + 50, y + 50), fill=(255, 220, 160, 70))
    rrect(g, (0, 240, 820, 330), 0, fill=(235, 235, 240, 255))
    pin_icon(g, 300, 190, 95, SILVER)
    pin_icon(g, 520, 190, 95, GOLD)
    paste_scaled(c, scene, W / 2, 1220, k3, clamp(k3))


def sc_stock(c, d, t, dur):
    tiles = [("ESTOQUE", 0), ("PEDIDOS", 1), ("AVALIAÇÃO", 2)]
    for i, (name, kind) in enumerate(tiles):
        k = back((t - 0.2 - i * 0.35) / 0.4)
        tl = card(820, 230, fill=(28, 28, 32, 255), border=(*GOLD, 255) if i == 2 else (70, 70, 76, 255), r=30)
        g = ImageDraw.Draw(tl)
        g.text((40, 30), name, font=font(ANTON, 52), fill=GOLD)
        if kind == 0:
            n = int(lerp(0, 200, ease((t - 0.6) / 1.2)))
            g.text((40, 110), f"{n} unidades", font=font(INTER, 64), fill=WHITE)
        elif kind == 1:
            for j in range(3):
                rrect(g, (40 + j * 250, 115, 260 + j * 250, 190), 20, fill=(45, 45, 52))
                g.text((70 + j * 250, 135), ["Pago", "Enviado", "Entregue"][j], font=font(INTER_B, 30), fill=WHITE)
        else:
            for j in range(5):
                cx = 70 + j * 70
                pts = [(cx + 30 * math.cos(-math.pi / 2 + q * math.pi / 5) * (1 if q % 2 == 0 else 0.45),
                        150 + 30 * math.sin(-math.pi / 2 + q * math.pi / 5) * (1 if q % 2 == 0 else 0.45)) for q in range(10)]
                g.polygon(pts, fill=GOLD)
            rrect(g, (450, 110, 780, 190), 20, fill=RED)
            g.text((615, 150), "CUPOM", font=font(ANTON, 42), fill=WHITE, anchor="mm")
        paste_scaled(c, tl, W / 2, 640 + i * 260, k, clamp(k))


def sc_grow(c, d, t, dur):
    base, x0 = 1230, 200
    vals = [0.35, 0.5, 0.45, 0.7, 0.85, 1.0]
    for i, v in enumerate(vals):
        k = ease((t - 0.3 - i * 0.18) / 0.6)
        h = 560 * v * k
        x = x0 + i * 120
        rrect(d, (x, base - h, x + 80, base), 14, fill=GOLD if i == len(vals) - 1 else RED)
    d.line((160, base + 10, 960, base + 10), fill=(90, 90, 96), width=4)
    # seta subindo
    a = ease((t - 1.6) / 0.6)
    if a > 0:
        pts = [(200 + i * 120 + 40, base - 560 * v - 40) for i, v in enumerate(vals)]
        n = 1 + int(a * (len(pts) - 1))
        d.line(pts[:n], fill=WHITE, width=8, joint="curve")
    # lupa
    k = back((t - 2.2) / 0.4)
    lp = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
    g = ImageDraw.Draw(lp)
    g.ellipse((10, 10, 150, 150), outline=WHITE, width=16)
    g.line((130, 130, 205, 205), fill=WHITE, width=26)
    paste_scaled(c, lp, 860, 560, k, clamp(k))


EXTRA = [("SITES", "site"), ("YOUTUBE", "play"), ("CORTES", "cut"), ("JOGOS", "game"), ("BÍBLIA", "book"), ("QUIZ", "star")]


def icon(g, kind, cx, cy, col=WHITE):
    """Ícones desenhados (a fonte não tem emoji)."""
    if kind == "site":
        g.ellipse((cx - 38, cy - 38, cx + 38, cy + 38), outline=col, width=7)
        g.ellipse((cx - 16, cy - 38, cx + 16, cy + 38), outline=col, width=5)
        g.line((cx - 38, cy, cx + 38, cy), fill=col, width=5)
    elif kind == "play":
        g.rounded_rectangle((cx - 48, cy - 34, cx + 48, cy + 34), 16, fill=col)
        g.polygon([(cx - 12, cy - 16), (cx - 12, cy + 16), (cx + 18, cy)], fill=RED)
    elif kind == "cut":
        for s in (-1, 1):
            g.ellipse((cx - 40, cy + s * 14 - 14 + (14 if s > 0 else -14), cx - 12, cy + s * 14 + 14 + (14 if s > 0 else -14)), outline=col, width=6)
        g.line((cx - 14, cy - 18, cx + 40, cy + 20), fill=col, width=7)
        g.line((cx - 14, cy + 18, cx + 40, cy - 20), fill=col, width=7)
    elif kind == "game":
        g.rounded_rectangle((cx - 50, cy - 26, cx + 50, cy + 26), 24, fill=col)
        g.rectangle((cx - 34, cy - 4, cx - 14, cy + 4), fill=INK)
        g.rectangle((cx - 28, cy - 10, cx - 20, cy + 10), fill=INK)
        g.ellipse((cx + 18, cy - 10, cx + 30, cy + 2), fill=RED)
        g.ellipse((cx + 30, cy - 2, cx + 42, cy + 10), fill=GOLD)
    elif kind == "book":
        g.polygon([(cx - 48, cy - 30), (cx, cy - 20), (cx, cy + 34), (cx - 48, cy + 24)], fill=col)
        g.polygon([(cx + 48, cy - 30), (cx + 4, cy - 20), (cx + 4, cy + 34), (cx + 48, cy + 24)], fill=col)
        g.line((cx + 26, cy - 14, cx + 26, cy + 14), fill=RED, width=5)
        g.line((cx + 14, cy - 2, cx + 38, cy - 2), fill=RED, width=5)
    else:
        pts = [(cx + 40 * math.cos(-math.pi / 2 + q * math.pi / 5) * (1 if q % 2 == 0 else 0.45),
                cy + 40 * math.sin(-math.pi / 2 + q * math.pi / 5) * (1 if q % 2 == 0 else 0.45)) for q in range(10)]
        g.polygon(pts, fill=col)


def sc_extra(c, d, t, dur):
    # moedas caindo (atrás dos quadros)
    for i in range(7):
        y = ((t * 380 + i * 270) % 1300) + 300
        x = 120 + (i * 151) % 860
        d.ellipse((x, y, x + 46, y + 46), fill=GOLD, outline=(200, 150, 20), width=4)
    for i, (name, ic) in enumerate(EXTRA):
        r, col = divmod(i, 2)
        cx, cy = 330 + col * 420, 560 + r * 270
        k = back((t - 0.3 - i * 0.25) / 0.4)
        tl = card(380, 230, fill=(*RED, 255) if i % 3 == 0 else (28, 28, 32, 255), border=(*GOLD, 255), r=34)
        g = ImageDraw.Draw(tl)
        icon(g, ic, 190, 85)
        g.text((190, 175), name, font=font(ANTON, 50), fill=GOLD if i % 3 else WHITE, anchor="mm")
        paste_scaled(c, tl, cx, cy, k, clamp(k), rot=math.sin(t * 2 + i) * 2)


def sc_phone(c, d, t, dur):
    box = phone(c, W / 2, 920, screen=(25, 25, 32))
    x0, y0, x1, y1 = box
    g = ImageDraw.Draw(c)
    g.text(((x0 + x1) / 2, y0 + 130), "21:47", font=font(INTER, 96), fill=WHITE, anchor="mm")
    notes = [("Venda nova", "Pedido pelo site"), ("Venda nova", "Pedido no Mercado Livre"), ("Cliente chamando", "quer saber do prazo")]
    for i, (a, b) in enumerate(notes):
        k = back((t - 0.4 - i * 0.7) / 0.45)
        if k <= 0:
            continue
        nt = card(360, 110, fill=(245, 245, 248, 235), r=24)
        h = ImageDraw.Draw(nt)
        h.ellipse((20, 22, 46, 48), fill=(34, 160, 90) if i < 2 else RED)
        h.text((58, 18), a, font=font(INTER, 30), fill=INK)
        h.text((20, 64), b, font=font(INTER_B, 24), fill=(80, 80, 86))
        paste_scaled(c, nt, (x0 + x1) / 2, y0 + 280 + i * 130, k, clamp(k))
    # ondinhas de vibração
    for s in (-1, 1):
        for j in range(3):
            a = (math.sin(t * 10 - j) + 1) / 2
            xx = W / 2 + s * (250 + j * 30)
            g.arc((xx - 30, 860, xx + 30, 980), 300 if s > 0 else 120, 60 if s > 0 else 240, fill=(*GOLD, int(80 + 175 * a)), width=6)


def sc_outro(c, d, t, dur):
    k = back((t - 0.1) / 0.5)
    logo = card(220, 220, fill=(*RED, 255), r=60)
    ImageDraw.Draw(logo).text((110, 110), "S", font=font(ANTON, 150), fill=WHITE, anchor="mm")
    paste_scaled(c, logo, W / 2, 560, k * (1 + 0.04 * math.sin(t * 4)), clamp(k))
    paste_scaled(c, title_img("SOCIAL *STUDIO*", 120), W / 2, 760, back((t - 0.4) / 0.4), clamp((t - 0.4) / 0.2))
    paste_scaled(c, text_img("sua loja no piloto automático", SERIF, 58, PAPER), W / 2, 880, 1, ease((t - 0.8) / 0.4))
    # botão do WhatsApp pulsando
    k = back((t - 1.2) / 0.5)
    btn = card(760, 150, fill=(37, 211, 102, 255), r=75)
    g = ImageDraw.Draw(btn)
    g.ellipse((40, 35, 120, 115), outline=WHITE, width=8)
    g.polygon([(52, 112), (60, 92), (76, 108)], fill=WHITE)
    g.text((420, 75), "CHAMA NO WHATSAPP", font=font(ANTON, 58), fill=WHITE, anchor="mm")
    paste_scaled(c, btn, W / 2, 1100, k * (1 + 0.035 * math.sin(t * 6)), clamp(k))
    paste_scaled(c, text_img(WHATSAPP, INTER, 64, GOLD), W / 2, 1260, 1, ease((t - 1.6) / 0.4))
    paste_scaled(c, text_img("e veja funcionando na sua loja", INTER_B, 38, GREY), W / 2, 1340, 1, ease((t - 1.9) / 0.4))


DRAW = {"intro": sc_intro, "hub": sc_hub, "menu": sc_menu, "post": sc_post, "calendar": sc_calendar, "video": sc_video, "dm": sc_dm,
        "shop": sc_shop, "photos": sc_photos, "stock": sc_stock, "grow": sc_grow, "extra": sc_extra, "phone": sc_phone,
        "outro": sc_outro}

# ------------------------------------------------------------------------------------------- moldura fixa e legenda


def chrome(c, d, t, total, starts, si):
    """Barra de progresso por cena, selo da seção, título da cena e o número do prato."""
    n = len(SCENES)
    x0, x1, gap = 70, W - 70, 8
    sw = (x1 - x0 - gap * (n - 1)) / n
    for i in range(n):
        sx = x0 + i * (sw + gap)
        d.rectangle((sx, 120, sx + sw, 128), fill=(255, 255, 255, 50))
        end = starts[i + 1] if i + 1 < len(starts) else total
        f = clamp((t - starts[i]) / max(0.01, end - starts[i]))
        if f > 0:
            d.rectangle((sx, 120, sx + sw * f, 128), fill=GOLD if i % 2 else RED)
    sec, title, _, kind = SCENES[si]
    lt = t - starts[si]
    if kind in ("intro", "outro"):
        return
    k = ease(lt / 0.35)
    if sec:
        tag = badge(sec, RED, WHITE)
        paste_scaled(c, tag, W / 2, 230, 0.75, k)
    paste_scaled(c, title_img(title, 92), W / 2, 360, lerp(0.9, 1, back(lt / 0.4)), k)


def caption(c, words, t):
    """Legenda: 2 a 4 palavras por vez em caixa escura com sombra dourada; a palavra falada fica dourada."""
    if not words:
        return
    groups, cur = [], []
    for w in words:
        if cur and (len(cur) >= 4 or w["t"] - (cur[-1]["t"] + cur[-1]["d"]) > 0.35 or cur[-1]["w"].endswith((".", ",", "?", "!", ":"))):
            groups.append(cur)
            cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    g = next((g for g in groups if g[0]["t"] - 0.05 <= t <= g[-1]["t"] + g[-1]["d"] + 0.25), None)
    if not g:
        return
    words_txt = [w["w"].upper() for w in g]
    size = 58
    while True:  # frase comprida: letra menor para caber na tela
        f = font(INTER, size)
        widths = [f.getlength(x) for x in words_txt]
        space = f.getlength(" ")
        total = sum(widths) + space * (len(g) - 1)
        if total + 70 <= W * 0.9 or size <= 36:
            break
        size -= 2
    bw, bh = total + 70, 100
    bx, by = (W - bw) / 2, H * 0.78
    d = ImageDraw.Draw(c)
    rrect(d, (bx + 8, by + 8, bx + bw + 8, by + bh + 8), 20, fill=GOLD)
    rrect(d, (bx, by, bx + bw, by + bh), 20, fill=(24, 24, 28))
    x = bx + 35
    for w, txt, wd in zip(g, words_txt, widths):
        on = w["t"] <= t <= w["t"] + w["d"] + 0.08
        said = t > w["t"]
        d.text((x, by + bh / 2), txt, font=f, fill=GOLD if on else (WHITE if said else (120, 120, 128)), anchor="lm")
        x += wd + space


# ------------------------------------------------------------------------------------------- áudio e montagem


def narrate(silent, folder):
    """Fala de cada cena (edge-tts) → duração da cena e palavras com tempo. Sem voz: tempo estimado."""
    out = []
    for i, (_, _, text, _) in enumerate(SCENES):
        if silent:
            ws = text.split()
            dur = len(ws) / 2.7 + 0.6
            step = (dur - 0.6) / len(ws)
            words = [{"t": j * step, "d": step * 0.9, "w": w} for j, w in enumerate(ws)]
            out.append((None, dur, words))
            continue
        import youtube

        mp3 = os.path.join(folder, f"n{i}.mp3")
        words = youtube.speak(text, VOICE, mp3)
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3],
                                   capture_output=True, text=True).stdout.strip())
        out.append((mp3, dur + 0.55, words))
    return out


def build_audio(parts, starts, total, folder):
    import youtube

    sr = youtube.SR
    mix = np.zeros(int((total + 1) * sr), np.float32)
    music = youtube.music_bed(total + 1) * 0.35
    mix[: len(music)] += music
    whoosh, pop, impact = youtube.sfx_whoosh(), youtube.sfx_pop(), youtube.sfx_impact()

    def add(sig, at, gain):
        a = int(at * sr)
        seg = sig[: max(0, len(mix) - a)]
        mix[a:a + len(seg)] += seg * gain

    add(impact, 0.0, 0.7)
    for i, (mp3, dur, _) in enumerate(parts):
        add(whoosh, max(0, starts[i] - 0.15), 0.35)
        add(pop, starts[i] + 0.5, 0.25)
        if mp3:
            add(youtube.pcm(mp3), starts[i] + 0.25, 1.0)
    mix /= max(1e-6, np.abs(mix).max()) / 0.92
    wav = os.path.join(folder, "mix.wav")
    pcm16 = (mix * 32767).astype(np.int16).tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "-", wav], input=pcm16, check=True)
    return wav


def frame(bg, t, total, starts, parts):
    si = max(i for i, s in enumerate(starts) if s <= t)
    c = bg.copy()
    d = ImageDraw.Draw(c)
    lt = t - starts[si]
    dur = parts[si][1]
    DRAW[SCENES[si][3]](c, d, lt, dur)
    # transição: o quadro anterior "abre" para o novo com um flash curto
    if lt < 0.12 and si > 0:
        c.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, int(110 * (1 - lt / 0.12)))))
    chrome(c, ImageDraw.Draw(c), t, total, starts, si)
    words = [{"t": w["t"] + starts[si] + 0.25, "d": w["d"], "w": w["w"]} for w in parts[si][2]]
    caption(c, words, t)
    return c.convert("RGB")


def main():
    args = sys.argv[1:]
    out = args[0] if args and not args[0].startswith("--") else "studio_tour.mp4"
    silent = "--silent" in args
    stills = None
    if "--frames" in args:
        stills = [float(x) for x in args[args.index("--frames") + 1].split(",")]
        silent = True
    with tempfile.TemporaryDirectory() as tmp:
        parts = narrate(silent, tmp)
        starts, acc = [], 0.0
        for _, dur, _ in parts:
            starts.append(acc)
            acc += dur
        total = acc + 0.8
        bg = background()
        if stills:
            base = os.path.splitext(out)[0]
            for s in stills:
                frame(bg, s, total, starts, parts).save(f"{base}-{s:05.1f}.jpg", quality=88)
            print(f"{len(stills)} fotos; duração {total:.1f}s; cenas em {[round(s, 1) for s in starts]}")
            return
        video = os.path.join(tmp, "v.mp4")
        p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                              "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", video], stdin=subprocess.PIPE)
        n = int(total * FPS)
        for i in range(n):
            p.stdin.write(frame(bg, i / FPS, total, starts, parts).tobytes())
            if i % 300 == 0:
                print(f"  {i}/{n}", flush=True)
        p.stdin.close()
        p.wait()
        if silent:
            os.replace(video, out)
        else:
            wav = build_audio(parts, starts, total, tmp)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                            "-shortest", "-movflags", "+faststart", out], check=True)
    print(out, f"{total:.1f}s")


if __name__ == "__main__":
    main()
