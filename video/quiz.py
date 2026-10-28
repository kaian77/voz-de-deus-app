"""Desafio da Bíblia: vídeo de quiz (pergunta, 3 opções, contagem de 5 s, resposta com o versículo) para Facebook e Kwai.
Letra grande e voz calma (público mais velho). Tudo desenhado aqui (PIL), voz edge-tts, sons e trilha sintetizados.

  python3 quiz.py <episódio> <pasta>   → <pasta>/desafio-da-biblia-<n>/video.mp4 + legenda.txt
  python3 quiz.py --brand <pasta>      → foto de perfil e capa da página
  --silent                             → sem voz (teste local: duração estimada pelo texto)
"""
import asyncio
import json
import math
import os
import random
import subprocess
import sys
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "engine", "assets", "fonts", "Poppins-Bold.ttf")
FONT_M = os.path.join(HERE, "engine", "assets", "fonts", "Poppins-Medium.ttf")
W, H, FPS, SR = 1080, 1920, 30, 44100
VOICE, RATE = "pt-BR-AntonioNeural", "-6%"
NAVY, GOLD, CREAM, GREEN = (19, 37, 74), (255, 201, 74), (255, 248, 231), (46, 190, 108)
_fonts = {}


def font(size, medium=False):
    k = (size, medium)
    if k not in _fonts:
        _fonts[k] = ImageFont.truetype(FONT_M if medium else FONT, size)
    return _fonts[k]


def wrap(text, size, width, medium=False):
    """Quebra em linhas que cabem na largura; diminui a letra até caber em 4 linhas."""
    while True:
        f = font(size, medium)
        lines, cur = [], ""
        for w in text.split():
            t = (cur + " " + w).strip()
            if f.getlength(t) <= width or not cur:
                cur = t
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
        if len(lines) <= 4 or size <= 36:
            return lines, f, size
        size -= 4


def text_block(d, text, cx, cy, size, width, color, medium=False, spacing=1.18):
    lines, f, size = wrap(text, size, width, medium)
    lh = size * spacing
    y = cy - lh * len(lines) / 2
    for ln in lines:
        d.text((cx, y + lh / 2), ln, font=f, fill=color, anchor="mm")
        y += lh
    return lh * len(lines)


def ease(k):
    k = max(0.0, min(1.0, k))
    return 1 - (1 - k) ** 3


def pop(k):
    """0→1 com um pulinho no fim (escala)."""
    k = max(0.0, min(1.0, k))
    return 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2


# ------------------------------------------------------------------------------------------------ fundo
def make_bg():
    y = np.linspace(0, 1, H)[:, None]
    top, bot = np.array([14, 30, 64]), np.array([8, 16, 38])
    g = (top * (1 - y)[..., None] + bot * y[..., None]).repeat(W, 1)
    # brilho do céu no alto
    yy, xx = np.mgrid[0:H, 0:W]
    glow = np.exp(-(((xx - W / 2) / 520) ** 2 + ((yy - 120) / 620) ** 2))[..., None]
    g = g + glow * np.array([70, 62, 30])
    return Image.fromarray(np.clip(g, 0, 255).astype(np.uint8)).convert("RGBA")


def make_rays(phase):
    """Raios de luz saindo do alto (duas versões que se alternam)."""
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    cx, cy = W / 2, -160
    for i in range(14):
        a = math.pi / 2 + (i - 6.5) * 0.14 + phase
        w = 0.035
        pts = [(cx, cy), (cx + math.cos(a - w) * 2600, cy + math.sin(a - w) * 2600), (cx + math.cos(a + w) * 2600, cy + math.sin(a + w) * 2600)]
        d.polygon(pts, fill=34 if i % 2 else 20)
    im = im.filter(ImageFilter.GaussianBlur(18))
    layer = Image.new("RGBA", (W, H), (255, 226, 150, 0))
    layer.putalpha(im)
    return layer


BG = None
RAYS = None
MOTES = [(random.Random(i).uniform(0, W), random.Random(i + 99).uniform(0, H), random.Random(i + 7).uniform(2, 6), random.Random(i + 3).uniform(20, 60)) for i in range(46)]


def background(t):
    global BG, RAYS
    if BG is None:
        BG = make_bg()
        RAYS = (make_rays(0), make_rays(0.07))
    k = (math.sin(t * 0.6) + 1) / 2
    # o quadro é RGB: o Draw "RGBA" só mistura a transparência em imagem RGB (em RGBA ele troca o pixel)
    im = Image.alpha_composite(BG, Image.blend(RAYS[0], RAYS[1], k)).convert("RGB")
    d = ImageDraw.Draw(im, "RGBA")
    for x, y0, r, v in MOTES:  # pontinhos dourados subindo
        y = (y0 - t * v) % (H + 40) - 20
        a = int(90 + 80 * math.sin(t * 2 + x))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 214, 120, a))
    return im


def rr(d, box, r, fill, outline=None, width=0):
    d.rounded_rectangle(box, r, fill=fill, outline=outline, width=width)


def header(im, ep, qi, n, t):
    d = ImageDraw.Draw(im, "RGBA")
    d.text((W / 2, 150), "DESAFIO DA BÍBLIA", font=font(70), fill=GOLD, anchor="mm")
    d.text((W / 2, 225), f"Episódio {ep}" if qi < 0 else f"Pergunta {qi + 1} de {n}" if qi < n else "Fim do desafio", font=font(40, True), fill=CREAM, anchor="mm")
    if qi >= 0:
        for i in range(n):
            x = W / 2 + (i - (n - 1) / 2) * 56
            done = i < qi
            cur = i == qi
            r = 15 if cur else 11
            d.ellipse((x - r, 290 - r, x + r, 290 + r), fill=GOLD if done or cur else (255, 255, 255, 60))


def shadowed(im, box, r, fill, blur=22, off=14, alpha=110):
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((box[0], box[1] + off, box[2], box[3] + off), r, fill=(0, 0, 0, alpha))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))
    ImageDraw.Draw(im, "RGBA").rounded_rectangle(box, r, fill=fill)


def scaled(im, layer, cx, cy, s, alpha=1.0):
    """Cola uma camada centrada em (cx, cy) com escala s e transparência."""
    if s <= 0.01 or alpha <= 0.01:
        return
    w, h = layer.size
    l2 = layer.resize((max(1, int(w * s)), max(1, int(h * s))), Image.BILINEAR) if abs(s - 1) > 0.005 else layer
    if alpha < 0.999:
        a = l2.getchannel("A").point(lambda v: int(v * alpha))
        l2 = l2.copy()
        l2.putalpha(a)
    im.paste(l2, (int(cx - l2.width / 2), int(cy - l2.height / 2)), l2)


# ------------------------------------------------------------------------------------------------ camadas prontas
def question_card(q):
    pad = 40
    lines, f, size = wrap(q, 72, W - 140 - 2 * 60)
    h = int(size * 1.18 * len(lines) + 2 * 70)
    lay = Image.new("RGBA", (W - 140 + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    box = (pad, pad, pad + W - 140, pad + h)
    shadowed(lay, box, 44, CREAM)
    d = ImageDraw.Draw(lay)
    text_block(d, q, lay.width / 2, pad + h / 2, size, W - 140 - 120, NAVY)
    return lay


def option_layer(letter, text, state):
    """state: idle | right | wrong"""
    w, h, pad = W - 140, 150, 30
    lay = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    fill = {"idle": (255, 255, 255, 34), "right": GREEN + (255,), "wrong": (255, 255, 255, 18)}[state]
    d = ImageDraw.Draw(lay, "RGBA")
    rr(d, (pad, pad, pad + w, pad + h), 75, fill, outline=(255, 255, 255, 90 if state == "idle" else 0), width=4)
    cx, cy = pad + 80, pad + h / 2
    d.ellipse((cx - 50, cy - 50, cx + 50, cy + 50), fill=(255, 255, 255) if state == "right" else GOLD)
    if state == "right":
        d.line([(cx - 24, cy + 2), (cx - 6, cy + 22), (cx + 26, cy - 20)], fill=GREEN, width=13, joint="curve")
    else:
        d.text((cx, cy + 2), letter, font=font(58), fill=NAVY, anchor="mm")
    tc = (255, 255, 255, 110) if state == "wrong" else (255, 255, 255)
    _, f, _ = wrap(text, 62, w - 220)
    while f.getlength(text) > w - 200 and f.size > 34:
        f = font(f.size - 4)
    d.text((pad + 160, cy + 2), text, font=f, fill=tc, anchor="lm")
    return lay


# ------------------------------------------------------------------------------------------------ voz e som
def tts(text, path, silent):
    if silent:
        dur = max(1.2, len(text.split()) * 0.42)
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(np.zeros(int(dur * SR), np.int16).tobytes())
        return
    import edge_tts

    mp3 = path + ".mp3"
    for attempt in range(4):
        try:
            asyncio.run(edge_tts.Communicate(text, VOICE, rate=RATE).save(mp3))
            break
        except Exception:
            if attempt == 3:
                raise
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp3, "-ac", "1", "-ar", str(SR), path], check=True)


def load_wav(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768


def tone(f, dur, vol=0.3, kind="sine", decay=6.0):
    t = np.arange(int(dur * SR)) / SR
    wv = np.sin(2 * np.pi * f * t) if kind == "sine" else 2 * np.abs(2 * ((f * t) % 1) - 1) - 1
    return (wv * np.exp(-t * decay) * vol).astype(np.float32)


def mixin(a, b):
    out = np.zeros(max(len(a), len(b)), np.float32)
    out[: len(a)] += a
    out[: len(b)] += b
    return out


def sfx(name):
    if name == "tick":
        return mixin(tone(1500, 0.06, 0.18, decay=60), tone(750, 0.05, 0.1, decay=60))
    if name == "ding":
        return sum(tone(f, 1.4, 0.16, decay=3.2) for f in (1046.5, 1318.5, 1568.0))
    if name == "whoosh":
        n = int(0.45 * SR)
        noise = np.random.default_rng(1).standard_normal(n).astype(np.float32)
        env = np.sin(np.linspace(0, np.pi, n)) ** 2
        k = np.ones(40) / 40
        return (np.convolve(noise, k, "same") * env * 0.35).astype(np.float32)
    if name == "pop":
        return mixin(tone(520, 0.18, 0.25, decay=18), tone(780, 0.12, 0.12, decay=24))
    raise ValueError(name)


def pad_music(dur):
    """Trilha calma: acordes longos (I–vi–IV–V em Ré) bem baixinhos."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    chords = [(146.8, 185.0, 220.0), (123.5, 146.8, 185.0), (98.0, 123.5, 146.8), (110.0, 138.6, 164.8)]
    seg = 4.0
    for i in range(int(dur / seg) + 1):
        a, b = int(i * seg * SR), min(n, int((i + 1) * seg * SR + SR))
        if a >= n:
            break
        tt = t[a:b] - i * seg
        env = np.minimum(1, tt / 1.2) * np.minimum(1, np.maximum(0, (seg + 1 - tt)) / 1.2)
        for f in chords[i % 4]:
            out[a:b] += (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * env * 0.022
    return out


# ------------------------------------------------------------------------------------------------ roteiro
def build(ep, outdir, silent=False):
    n = len(ep["questions"])
    work = tempfile.mkdtemp()
    clips = {}

    def say(key, text):
        p = os.path.join(work, key + ".wav")
        tts(text, p, silent)
        clips[key] = load_wav(p)
        return len(clips[key]) / SR

    letters = "ABC"
    tl = []  # (início, chave do clipe)
    fx = []  # (início, som)
    events = {}
    t = 0.4
    d = say("intro", f"Desafio da Bíblia! Cinco perguntas. Duvido você acertar todas. Conte nos dedos quantas você acerta, e no final comente aqui embaixo.")
    tl.append((t, "intro"))
    fx.append((0.1, "whoosh"))
    t += d + 0.6
    events["intro_end"] = t
    for i, q in enumerate(ep["questions"]):
        e = {"start": t}
        fx.append((t, "whoosh"))
        t += 0.6
        d = say(f"q{i}", q["q"])
        tl.append((t, f"q{i}"))
        t += d + 0.3
        e["opts"] = []
        for j, o in enumerate(q["opts"]):
            d = say(f"o{i}{j}", f"{letters[j]}: {o}.")
            e["opts"].append(t)
            fx.append((t, "pop"))
            tl.append((t, f"o{i}{j}"))
            t += d + 0.15
        t += 0.3
        e["count"] = t
        for s in range(5):
            fx.append((t + s, "tick"))
        t += 5.0
        e["reveal"] = t
        fx.append((t, "ding"))
        t += 0.5
        d = say(f"e{i}", f"Resposta: letra {letters[q['a']]}, {q['opts'][q['a']]}. {q['exp']}")
        tl.append((t, f"e{i}"))
        t += d + 0.9
        e["end"] = t
        events[i] = e
    events["outro"] = t
    fx.append((t, "whoosh"))
    t += 0.5
    d = say("outro", "E aí, quantas você acertou? Comente aqui embaixo o seu número. Compartilhe com quem ama a Palavra de Deus, e siga a página para o desafio de amanhã. Deus abençoe!")
    tl.append((t, "outro"))
    total = t + d + 1.6

    # áudio
    n_s = int(total * SR) + SR
    mix = pad_music(n_s / SR)[:n_s]
    mix = np.pad(mix, (0, n_s - len(mix)))
    voice = np.zeros(n_s, np.float32)
    for st, k in tl:
        a = int(st * SR)
        c = clips[k]
        voice[a:a + len(c)] += c[: n_s - a]
    for st, name in fx:
        a = int(st * SR)
        c = sfx(name)
        mix[a:a + len(c)] += c[: n_s - a]
    # a trilha abaixa quando a voz fala
    env = np.convolve(np.abs(voice), np.ones(4410) / 4410, "same")
    duck = 1 - 0.55 * np.minimum(1, env * 12)
    out = np.clip(voice * 1.1 + mix * duck, -1, 1)
    wav = os.path.join(work, "mix.wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((out * 32767).astype(np.int16).tobytes())

    # vídeo
    cards = [question_card(q["q"]) for q in ep["questions"]]
    opts = [[{s: option_layer(letters[j], o, s) for s in ("idle", "right", "wrong")} for j, o in enumerate(q["opts"])] for q in ep["questions"]]
    folder = os.path.join(outdir, f"desafio-da-biblia-{ep['id']}")
    os.makedirs(folder, exist_ok=True)
    mp4 = os.path.join(folder, "video.mp4")
    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", mp4], stdin=subprocess.PIPE)
    frames = int(total * FPS)
    for fi in range(frames):
        tm = fi / FPS
        im = frame(tm, ep, events, cards, opts, n)
        ff.stdin.write(im.convert("RGB").tobytes())
    ff.stdin.close()
    ff.wait()
    with open(os.path.join(folder, "legenda.txt"), "w") as f:
        f.write(caption(ep))
    print("ok", mp4, f"{total:.1f}s")
    return mp4


def frame(tm, ep, ev, cards, opts, n):
    im = background(tm)
    d = ImageDraw.Draw(im, "RGBA")
    if tm < ev["intro_end"]:
        header(im, ep["id"], -1, n, tm)
        k = pop((tm - 0.2) / 0.6)
        lay = Image.new("RGBA", (W, 700), (0, 0, 0, 0))
        dl = ImageDraw.Draw(lay)
        dl.text((W / 2, 170), "DUVIDO VOCÊ", font=font(104), fill=CREAM, anchor="mm")
        dl.text((W / 2, 310), "ACERTAR AS 5!", font=font(120), fill=GOLD, anchor="mm")
        scaled(im, lay, W / 2, 820, k)
        k2 = ease((tm - 1.6) / 0.6)
        if k2 > 0:
            box = (140, 1260, W - 140, 1420)
            rr(d, box, 80, (255, 255, 255, int(30 * k2)), outline=(255, 255, 255, int(120 * k2)), width=4)
            d.text((W / 2, 1340), "Conte quantas você acerta", font=font(52, True), fill=CREAM + (int(255 * k2),), anchor="mm")
        return im
    if tm >= ev["outro"]:
        header(im, ep["id"], n, n, tm)
        k = pop((tm - ev["outro"] - 0.2) / 0.6)
        lay = Image.new("RGBA", (W, 520), (0, 0, 0, 0))
        dl = ImageDraw.Draw(lay)
        dl.text((W / 2, 150), "QUANTAS VOCÊ", font=font(100), fill=CREAM, anchor="mm")
        dl.text((W / 2, 290), "ACERTOU?", font=font(130), fill=GOLD, anchor="mm")
        scaled(im, lay, W / 2, 700, k)
        d = ImageDraw.Draw(im, "RGBA")
        k2 = ease((tm - ev["outro"] - 1.2) / 0.6)
        if k2 > 0:
            a = int(255 * k2)
            text_block(d, "Comente aqui embaixo o seu número", W / 2, 1060, 60, W - 200, CREAM + (a,))
            by = 1250 + math.sin(tm * 6) * 18
            d.polygon([(W / 2 - 60, by), (W / 2 + 60, by), (W / 2, by + 80)], fill=GOLD + (a,))
        k3 = ease((tm - ev["outro"] - 3.5) / 0.6)
        if k3 > 0:
            a = int(255 * k3)
            rr(d, (100, 1460, W - 100, 1600), 70, GREEN + (a,))
            d.text((W / 2, 1530), "Compartilhe com quem você ama", font=font(44), fill=(255, 255, 255, a), anchor="mm")
            d.text((W / 2, 1700), "Siga para o desafio de amanhã", font=font(46, True), fill=CREAM + (a,), anchor="mm")
        return im
    qi = max(i for i in range(n) if ev[i]["start"] <= tm)
    e = ev[qi]
    header(im, ep["id"], qi, n, tm)
    lt = tm - e["start"]
    # pergunta entra deslizando
    k = ease(lt / 0.55)
    card = cards[qi]
    cy = 330 + card.height / 2
    scaled(im, card, W / 2 + (1 - k) * W, cy, 1.0)
    oy = 330 + card.height + 20
    revealed = tm >= e["reveal"]
    for j in range(3):
        ko = (tm - e["opts"][j]) / 0.35
        if ko <= 0:
            continue
        state = "idle" if not revealed else ("right" if j == ep["questions"][qi]["a"] else "wrong")
        lay = opts[qi][j][state]
        s = pop(ko) if not revealed else (1 + 0.08 * math.sin(min(1, (tm - e["reveal"]) / 0.5) * math.pi) if state == "right" else 1)
        scaled(im, lay, W / 2, oy + j * 185 + lay.height / 2, s, min(1, ko))
    d = ImageDraw.Draw(im, "RGBA")
    by = oy + 3 * 185 + 40
    if e["count"] <= tm < e["reveal"]:
        left = e["reveal"] - tm
        cx, cy2, r = W / 2, by + 150, 110
        d.ellipse((cx - r, cy2 - r, cx + r, cy2 + r), fill=(255, 255, 255, 26))
        ang = -90 + 360 * (left / 5.0)
        d.arc((cx - r, cy2 - r, cx + r, cy2 + r), -90, ang, fill=GOLD, width=16)
        d.text((cx, cy2 + 4), str(math.ceil(left)), font=font(110), fill=CREAM, anchor="mm")
        d.text((cx, cy2 - r - 50), "Pense bem...", font=font(46, True), fill=CREAM, anchor="mm")
    elif revealed:
        k = ease((tm - e["reveal"] - 0.3) / 0.5)
        a = int(255 * k)
        q = ep["questions"][qi]
        ref = q["ref"]
        f = font(50)
        w = f.getlength(ref) + 90
        rr(d, (W / 2 - w / 2, by, W / 2 + w / 2, by + 90), 45, GOLD + (a,))
        d.text((W / 2, by + 47), ref, font=f, fill=NAVY + (a,), anchor="mm")
        text_block(d, q["exp"], W / 2, by + 250, 44, W - 160, CREAM + (a,), medium=True, spacing=1.3)
    return im


def caption(ep):
    return (f"📖 Desafio da Bíblia #{ep['id']}: duvido você acertar as 5!\n\n"
            "Comente aqui embaixo quantas você acertou 👇\n"
            "Compartilhe com quem ama a Palavra de Deus 🙏 e siga a página para o desafio de amanhã.\n\n"
            "#biblia #desafiobiblico #quizbiblico #palavradedeus #jesus #fe #deus #evangelho #igreja #amem\n")


# ------------------------------------------------------------------------------------------------ marca da página
def brand(outdir):
    os.makedirs(outdir, exist_ok=True)
    global BG
    # foto de perfil (aparece redonda): livro aberto com o "?" dourado
    s = 1080
    im = make_bg().resize((W, H)).crop((0, 0, s, s)).resize((s, s))
    im = Image.alpha_composite(im, make_rays(0).crop((0, 0, s, s)))
    d = ImageDraw.Draw(im, "RGBA")
    # sem texto: a foto aparece redonda e pequena, o nome da página já fica do lado
    cx, cy = s / 2, s / 2
    book(d, cx, cy + 190, 1.15)
    d.text((cx, cy - 90), "?", font=font(520), fill=GOLD, anchor="mm")
    im.convert("RGB").save(os.path.join(outdir, "foto-perfil.png"))
    # capa do Facebook 1640x624 (o meio é o que aparece no celular)
    cw, ch = 1640, 624
    bg = make_bg().resize((cw, int(H * cw / W))).crop((0, 0, cw, ch))
    rays = make_rays(0).resize((cw, int(H * cw / W))).crop((0, 0, cw, ch))
    cap = Image.alpha_composite(bg, rays)
    d = ImageDraw.Draw(cap, "RGBA")
    d.text((cw / 2, 220), "DESAFIO DA BÍBLIA", font=font(110), fill=GOLD, anchor="mm")
    d.text((cw / 2, 340), "Todo dia um quiz novo. Quantas você acerta?", font=font(52, True), fill=CREAM, anchor="mm")
    rr(d, (cw / 2 - 260, 420, cw / 2 + 260, 500), 40, GREEN)
    d.text((cw / 2, 462), "Comente sua nota", font=font(44), fill=(255, 255, 255), anchor="mm")
    cap.convert("RGB").save(os.path.join(outdir, "capa-facebook.png"))
    print("ok marca")


def book(d, cx, cy, sc):
    w, h = 330 * sc, 190 * sc
    for side in (-1, 1):
        pts = [(cx, cy - h / 2 + 20 * sc), (cx + side * w, cy - h / 2), (cx + side * w, cy + h / 2), (cx, cy + h / 2 + 24 * sc)]
        d.polygon(pts, fill=CREAM)
        for i in range(1, 5):  # linhas de texto da página
            y = cy - h / 2 + 30 * sc + i * 30 * sc
            d.line([(cx + side * 40 * sc, y + 6 * sc), (cx + side * (w - 40 * sc), y)], fill=(200, 186, 150), width=int(8 * sc))
    d.line([(cx, cy - h / 2 + 20 * sc), (cx, cy + h / 2 + 24 * sc)], fill=(180, 160, 120), width=int(6 * sc))
    d.polygon([(cx - w - 14 * sc, cy + h / 2), (cx, cy + h / 2 + 40 * sc), (cx + w + 14 * sc, cy + h / 2), (cx + w + 14 * sc, cy + h / 2 + 22 * sc),
               (cx, cy + h / 2 + 62 * sc), (cx - w - 14 * sc, cy + h / 2 + 22 * sc)], fill=(120, 36, 40))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    silent = "--silent" in sys.argv
    if "--brand" in sys.argv:
        brand(args[0])
    else:
        eps = json.load(open(os.path.join(HERE, "quiz_episodes.json")))
        wanted = [int(x) for x in args[0].split(",")] if args[0] != "all" else [e["id"] for e in eps]
        for e in eps:
            if e["id"] in wanted:
                build(e, args[1], silent)
