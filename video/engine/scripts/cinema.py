#!/usr/bin/env python3
"""cinema.py — vídeo de produto cinematográfico (9:16, 15 s), sem redesenhar o produto.

  python cinema.py roteiro.json video.mp4            # renderiza
  python cinema.py roteiro.json x --stills pasta     # quadros soltos para revisar

Só a câmera se mexe sobre as fotos originais (closes, pan, zoom), com luz na cor do tema,
vinheta, grão de filme, textos em Anton e trilha original sintetizada (livre de direitos).
Roteiro (JSON): photos[], name, hook, hook_sub, features[], title, subtitle, cta, urgency,
handle, brand, colors{primary, secondary, accent}, teaser (true = não mostra o produto inteiro).
Palavras entre *asteriscos* saem na cor de destaque.
"""
import json
import math
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import audio as A  # noqa: E402
from common import ffmpeg_bin  # noqa: E402

W, H, FPS = 1080, 1920, 30
ANTON = os.path.join(HERE, "..", "assets", "fonts", "Anton-Regular.woff")
POPPINS = os.path.join(HERE, "..", "assets", "fonts", "Poppins-Medium.ttf")


def hex_rgb(c, default=(255, 255, 255)):
    c = str(c or "").lstrip("#")
    if len(c) != 6:
        return default
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


# ------------------------------------------------------------------ fotos
def load_photo(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if max(im.size) < 1400:  # amplia uma vez com boa qualidade: os closes ficam mais nítidos
        k = 1400 / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    return im


def product_box(im):
    """Caixa do produto na foto: recorte por IA (rembg) quando disponível; senão o centro da foto."""
    try:
        from rembg import new_session, remove
        small = im.copy()
        small.thumbnail((640, 640))
        # modelo pequeno (5 MB): aqui só precisamos da caixa do produto, não de um recorte perfeito
        a = np.asarray(remove(small, session=new_session("u2netp")).getchannel("A")) > 128
        cover = a.mean()
        if 0.02 < cover < 0.9:
            ys, xs = np.where(a)
            k = im.width / small.width
            return (xs.min() * k, ys.min() * k, (xs.max() + 1) * k, (ys.max() + 1) * k)
    except Exception as e:  # noqa: BLE001
        print(f"[aviso] sem recorte automático ({e.__class__.__name__}); usando o centro da foto")
    w, h = im.size
    return (w * 0.2, h * 0.15, w * 0.8, h * 0.88)


def clamp_window(im, cx, cy, w):
    """Janela 9:16 dentro da foto (encolhe se não couber)."""
    h = w * 16 / 9
    if h > im.height:
        h = im.height
        w = h * 9 / 16
    if w > im.width:
        w = im.width
        h = w * 16 / 9
    cx = min(max(cx, w / 2), im.width - w / 2)
    cy = min(max(cy, h / 2), im.height - h / 2)
    return cx, cy, w


def detail_shots(box, n):
    """Closes do produto: cabeça, centro, laterais, base — com pan ou zoom de câmera."""
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    base = min(bw, bh * 9 / 16) * 0.78
    P = lambda fx, fy: (x0 + bw * fx, y0 + bh * fy)  # noqa: E731
    plans = [
        (P(0.32, 0.28), P(0.68, 0.30), 1.0, 0.97),   # pan pelo topo
        (P(0.50, 0.50), P(0.50, 0.48), 1.05, 0.8),   # zoom no centro
        (P(0.30, 0.62), P(0.42, 0.56), 0.9, 0.9),    # lateral esquerda
        (P(0.55, 0.82), P(0.65, 0.78), 0.95, 0.9),   # base
        (P(0.70, 0.36), P(0.62, 0.40), 1.0, 0.82),   # lateral direita com zoom
        (P(0.45, 0.40), P(0.55, 0.42), 0.85, 0.75),  # detalhe fino
    ]
    out = []
    for i in range(n):
        (ax, ay), (bx, by), za, zb = plans[i % len(plans)]
        out.append(((ax, ay, base * za), (bx, by, base * zb)))
    return out


# ------------------------------------------------------------------ texto
_fonts = {}


def font(path, size):
    key = (path, size)
    if key not in _fonts:
        try:
            _fonts[key] = ImageFont.truetype(path, size)
        except OSError:
            _fonts[key] = ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    return _fonts[key]


HEART_RE = re.compile("[\U0001F49C\U0001F49B\U0001F499\U0001F49A\U0001F5A4\U0001F90D❤♥][️]?")
EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")


def clean(text):
    """Corações viram ♥ (desenhado); os outros emojis saem (a fonte não tem)."""
    text = EMOJI_RE.sub("", HEART_RE.sub(" \x01 ", str(text or ""))).replace("\x01", "♥")
    return re.sub(r"\s+", " ", text).strip()


def draw_heart(d, x, y, s, fill):
    r = s * 0.28
    d.ellipse((x, y, x + 2 * r, y + 2 * r), fill=fill)
    d.ellipse((x + s - 2 * r, y, x + s, y + 2 * r), fill=fill)
    d.polygon([(x + 0.02 * s, y + r * 1.25), (x + s * 0.98, y + r * 1.25), (x + s / 2, y + s * 0.92)], fill=fill)


def words_of(text):
    out, hl = [], False
    for raw in clean(text).split(" "):
        if not raw:
            continue
        start, end = raw.startswith("*"), raw.endswith("*") and len(raw) > 1
        if start:
            hl = True
        out.append((raw.strip("*").upper(), hl))
        if end:
            hl = False
    return out


def text_layer(text, size, y_center, accent, glow, color=(255, 255, 255), max_w=0.86, track=4, path=ANTON,
               max_lines=3, upper=True, spacing=1.1):
    """Texto centralizado com destaque (*palavra*) e brilho. Encolhe até caber."""
    words = words_of(text) if upper else [(w, False) for w in clean(text).split(" ") if w]
    if not words:
        return None
    while True:
        f = font(path, size)
        space = f.getlength(" ") + track
        wl = lambda w: (size * 0.85 if w == "♥" else f.getlength(w) + track * (len(w) - 1))  # noqa: E731
        lines, cur, cw = [], [], 0.0
        for w, hl in words:
            ww = wl(w)
            if cur and cw + space + ww > W * max_w:
                lines.append((cur, cw))
                cur, cw = [], 0.0
            cw = cw + (space if cur else 0) + ww
            cur.append((w, hl, ww))
        lines.append((cur, cw))
        if (len(lines) <= max_lines and max(c for _, c in lines) <= W * max_w) or size <= 34:
            break
        size -= 4
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    lh = size * spacing
    y = y_center - lh * len(lines) / 2
    for line, lw in lines:
        x = (W - lw) / 2
        for w, hl, ww in line:
            col = (accent if hl else color) + (255,)
            if w == "♥":
                draw_heart(d, x, y + size * 0.22, size * 0.8, accent + (255,))
            else:
                for ch in w:
                    d.text((x, y), ch, font=f, fill=col)
                    x += f.getlength(ch) + track
                x -= track
                ww = 0
            x += ww + space
        y += lh
    g = Image.new("RGBA", (W, H), glow + (0,))
    g.putalpha(lay.getchannel("A").filter(ImageFilter.GaussianBlur(size * 0.3)))
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(g)
    out.alpha_composite(g)
    out.alpha_composite(lay)
    return out


# ------------------------------------------------------------------ cena
class Film:
    def __init__(self, spec, base_dir):
        self.spec = spec
        c = spec.get("colors") or {}
        self.primary = hex_rgb(c.get("primary"), (227, 38, 46))
        self.accent = hex_rgb(c.get("accent"), (255, 199, 44))
        self.dark = tuple(int(v * 0.12) for v in self.primary)
        self.glow = tuple(min(255, int(v * 1.1)) for v in self.primary)
        self.teaser = bool(spec.get("teaser"))
        paths = [p if os.path.isabs(p) else os.path.join(base_dir, p) for p in spec.get("photos") or []]
        self.photos = [load_photo(p) for p in paths[:7]]
        if not self.photos:
            raise SystemExit("roteiro sem fotos")
        self.boxes = [product_box(p) for p in self.photos]
        self.dur = float(spec.get("duration") or 15)
        # tempos (proporcionais à duração)
        k = self.dur / 15
        self.t_main0, self.t_reveal, self.t_cta = 2.2 * k, 8.8 * k, 11.8 * k
        if self.teaser:
            self.t_reveal = self.t_cta = 13.0 * k
        n_main = max(len(self.photos), 5) if not self.teaser else max(len(self.photos), 7)
        self.shots = []
        for i in range(n_main):
            pi = i % len(self.photos)
            a, b = detail_shots(self.boxes[pi], i + 1)[i]
            self.shots.append((pi, a, b))
        self.shot_len = (self.t_reveal - self.t_main0) / len(self.shots)
        self._prep()

    # camadas fixas
    def _prep(self):
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        sy, sx = np.mgrid[0:H // 4, 0:W // 4].astype(np.float32)
        self.sx, self.sy = sx / (W // 4), sy / (H // 4)
        self.g2 = np.exp(-(((self.sx - 0.15) ** 2 + ((self.sy - 0.18) * 0.6) ** 2) / 0.25 ** 2))
        self.xcol = (np.arange(W, dtype=np.float32) / W)[None, :]
        self.yrow = (np.arange(H, dtype=np.float32) / H)[:, None]
        nx, ny = (xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2)
        self.vignette = np.clip(1 - 0.55 * (nx ** 2 * 0.9 + ny ** 2 * 0.55) ** 1.1, 0.25, 1)[..., None]
        rng = np.random.default_rng(3)
        self.grains = [rng.normal(0, 6.5, (H // 2, W // 2)).astype(np.float32) for _ in range(6)]
        self.parts = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(2, 7), rng.uniform(10, 40), rng.uniform(0, 6.28))
                      for _ in range(45)]
        s, acc, glow = self.spec, self.accent, self.glow
        self.l_hook = text_layer(s.get("hook") or s.get("name") or "", 124, H * 0.46, acc, glow)
        self.l_hook_sub = text_layer(s.get("hook_sub") or "", 44, H * 0.58, acc, glow, color=(235, 235, 235), path=POPPINS,
                                     track=1, upper=False, max_lines=2)
        feats = [f for f in (s.get("features") or []) if f][:3]
        self.l_feats = [text_layer(f, 58, H * 0.8, acc, glow, max_lines=2) for f in feats]
        self.l_title = text_layer(s.get("title") or s.get("name") or "", 104, H * 0.79, acc, glow, max_lines=2)
        self.l_sub = text_layer(s.get("subtitle") or "", 42, H * 0.87, acc, glow, color=(235, 235, 235), path=POPPINS,
                                track=1, upper=False, max_lines=2)
        self.l_urg = text_layer(s.get("urgency") or "", 40, H * 0.66, acc, glow, color=(235, 235, 235), path=POPPINS,
                                track=1, upper=False, max_lines=2)
        self.l_cta = text_layer(s.get("cta") or "Garanta o seu", 120, H * 0.74, acc, glow, max_lines=2)
        handle = " · ".join(x for x in (s.get("brand") or "", s.get("handle") or "") if x)
        self.l_brand = text_layer(handle, 40, H * 0.83, acc, glow, color=acc, track=10, max_lines=1) if handle else None
        if self.teaser:
            self.l_cta = text_layer(s.get("cta") or "", 112, H * 0.47, acc, glow)
            self.l_brand = text_layer(s.get("brand") or handle, 44, H * 0.6, acc, glow, color=acc, track=14, max_lines=1)
        # produto inteiro para a revelação
        if not self.teaser:
            im, (x0, y0, x1, y1) = self.photos[0], self.boxes[0]
            m = 0.18
            bw, bh = x1 - x0, y1 - y0
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            w = max(bw * (1 + 2 * m), (bh * (1 + 2 * m)) * 9 / 16)
            self.reveal = clamp_window(im, cx, cy + bh * 0.08, w)

    def bg(self, t, strength):
        """Luz suave: calculada em 1/4 da resolução e ampliada (é só gradiente)."""
        xx, yy = self.sx, self.sy
        cy = 0.6 + 0.04 * math.sin(t * 0.9)
        cx = 0.5 + 0.06 * math.sin(t * 0.6)
        g = np.exp(-(((xx - cx) ** 2 + ((yy - cy) * 0.7) ** 2) / 0.33 ** 2)) * strength
        g = g + self.g2 * strength * 0.35 * 0.7
        col = np.array(self.primary, np.float32) * 0.75
        small = np.array(self.dark, np.float32) * 0.5 + g[..., None] * col
        im = Image.fromarray(np.clip(small, 0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)
        return np.asarray(im, np.float32)

    def particles(self, img, t, alpha):
        if alpha <= 0:
            return img
        lay = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(lay)
        for x, y, r, sp, ph in self.parts:
            py = (y - t * sp * 3) % H
            px = x + 18 * math.sin(t * 0.7 + ph)
            d.ellipse((px - r, py - r, px + r, py + r), fill=int(255 * (0.4 + 0.6 * abs(math.sin(t * 1.3 + ph))) * alpha))
        a = np.asarray(lay.filter(ImageFilter.GaussianBlur(3)), np.float32)[..., None] / 255
        tint = np.array([min(255, 120 + v) for v in self.primary], np.float32)
        return img + a * tint * 0.5

    def grade(self, img, t):
        img = img * self.vignette + (1 - self.vignette) * np.array(self.dark, np.float32) * 0.8
        leak = np.clip(1 - self.xcol * 2.2 + 0.25 * math.sin(t * 2.1), 0, 1) ** 2 * 0.2  # só depende de x
        img = img + leak[..., None] * np.array(self.primary, np.float32)
        g = self.grains[int(t * FPS) % len(self.grains)]
        return img + np.repeat(np.repeat(g, 2, 0), 2, 1)[..., None]

    def view(self, pi, a, b, p):
        q = ease(p)
        im = self.photos[pi]
        cx, cy, w = clamp_window(im, *(a[i] + (b[i] - a[i]) * q for i in range(3)))
        h = w * 16 / 9
        fr = im.resize((W, H), Image.LANCZOS, box=(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2))
        return np.asarray(fr.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2)), np.float32)

    @staticmethod
    def comp(img, layer, alpha=1.0, scale=1.0, dy=0.0):
        if layer is None or alpha <= 0:
            return img
        if scale != 1.0 or dy:
            sw, sh = int(W * scale), int(H * scale)
            l2 = layer.resize((sw, sh), Image.LANCZOS)
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            layer.alpha_composite(l2, (int((W - sw) / 2), int((H - sh) / 2 + dy)))
        a = np.asarray(layer, np.float32)
        al = a[..., 3:4] / 255 * alpha
        return img * (1 - al) + a[..., :3] * al

    def shade_bottom(self, img, k):
        g = np.clip((self.yrow - 0.55) / 0.35, 0, 1)[..., None] * k
        return img * (1 - g) + np.array(self.dark, np.float32) * 0.3 * g

    def frame(self, i):
        t = i / FPS
        prim = np.array(self.primary, np.float32)
        if t < self.t_main0:  # abertura: escuro, luz surgindo, gancho
            img = self.bg(t, ease(t / 1.6) * 0.95)
            img = self.particles(img, t, ease((t - 0.3) / 1.2) * 0.8)
            p = (t - 0.3) / 0.6
            fade = 1 - ease((t - (self.t_main0 - 0.2)) / 0.2)
            img = self.comp(img, self.l_hook, ease(p) * fade, scale=1.06 - 0.06 * ease_out(p))
            img = self.comp(img, self.l_hook_sub, ease((t - 0.8) / 0.5) * fade)
            return self.grade(img, t)
        if t < self.t_reveal:  # closes do produto
            k = min(len(self.shots) - 1, int((t - self.t_main0) / self.shot_len))
            lt = t - self.t_main0 - k * self.shot_len
            pi, a, b = self.shots[k]
            img = self.view(pi, a, b, lt / self.shot_len)
            vis = min(ease(lt / 0.22), 1 - ease((lt - (self.shot_len - 0.16)) / 0.16))
            img = img * vis + self.bg(t, 0.5) * (1 - vis)
            img = img + max(0.0, 1 - lt / 0.12) * 0.5 * prim
            if not self.teaser and 1 <= k <= len(self.l_feats):  # motivos para comprar, um por close
                img = self.shade_bottom(img, 0.75)
                p = (lt - 0.12) / 0.3
                img = self.comp(img, self.l_feats[k - 1], ease(p) * vis, dy=30 * (1 - ease_out(p)))
            return self.grade(img, t)
        if t < self.t_cta:  # revelação: a câmera se afasta e mostra o produto inteiro
            p = (t - self.t_reveal) / (self.t_cta - self.t_reveal)
            cx, cy, w = self.reveal
            img = self.view(0, (cx, cy - w * 0.05, w * 0.72), (cx, cy, w), ease_out(p * 1.4))
            img = img * ease((t - self.t_reveal) / 0.25) + self.bg(t, 0.5) * (1 - ease((t - self.t_reveal) / 0.25))
            img = img + max(0.0, 1 - (t - self.t_reveal) / 0.15) * 0.6 * prim
            img = self.shade_bottom(img, 0.85 * ease((t - self.t_reveal - 0.4) / 0.4))
            p2 = (t - self.t_reveal - 0.5) / 0.4
            img = self.comp(img, self.l_title, ease(p2), scale=1.1 - 0.1 * ease_out(p2))
            img = self.comp(img, self.l_sub, ease((t - self.t_reveal - 0.9) / 0.4))
            return self.grade(img, t)
        # chamada final
        lt = t - self.t_cta
        if self.teaser:
            img = self.bg(t, 0.12 + 0.75 * ease((lt - 0.45) / 0.5))
            img = self.particles(img, t, ease((lt - 0.45) / 0.8) * 0.6)
            p = (lt - 0.45) / 0.35
            img = self.comp(img, self.l_cta, ease(p), scale=1.12 - 0.12 * ease_out(p))
            img = self.comp(img, self.l_brand, ease((lt - 1.0) / 0.5))
            return self.grade(img, t)
        cx, cy, w = self.reveal
        img = self.view(0, (cx, cy, w), (cx, cy, w * 0.94), min(1, lt / (self.dur - self.t_cta)))
        img = self.shade_bottom(img, 0.92)
        img = img * (1 - 0.25 * ease(lt / 0.4)) + self.bg(t, 0.35) * 0.25 * ease(lt / 0.4)
        img = self.particles(img, t, 0.5 * ease(lt / 0.6))
        img = self.comp(img, self.l_urg, ease((lt - 0.15) / 0.35))
        p = (lt - 0.05) / 0.35
        img = self.comp(img, self.l_cta, ease(p), scale=1.15 - 0.15 * ease_out(p))
        img = self.comp(img, self.l_brand, ease((lt - 0.6) / 0.4))
        return self.grade(img, t)

    # ------------------------------------------------------------ trilha
    def soundtrack(self, path):
        sr, n = A.SR, int(self.dur * A.SR)
        buf = np.zeros((n, 2))
        add = lambda x, t, g=1.0: A._add(buf, x, t, g)  # noqa: E731

        def tone(freqs, d, a=0.02, r=0.4, gain=0.2, det=1.003):
            tt = A._t(d)
            env = np.minimum(1, tt / a) * np.minimum(1, np.maximum(0, (d - tt) / r))
            L = sum(np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt) for f in freqs)
            R = sum(np.sin(2 * np.pi * f * det * tt) + 0.25 * np.sin(4 * np.pi * f * det * tt) for f in freqs)
            return np.stack([L, R], 1) * env[:, None] * gain / len(freqs)

        def pluck(f, d=0.9, gain=0.22):
            tt = A._t(d)
            x = (np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(4 * np.pi * f * tt) + 0.2 * np.sin(6 * np.pi * f * tt)) * np.exp(-tt * 6)
            x *= np.minimum(1, tt / 0.003)
            e = np.zeros(len(x) + int(0.27 * sr) * 3)
            for j, g in enumerate((1, 0.45, 0.2, 0.09)):
                o = int(0.27 * sr) * j
                e[o:o + len(x)] += x * g
            return np.stack([e, np.roll(e, int(0.012 * sr))], 1) * gain

        root = 87.31  # Fá menor
        end_music = self.t_cta if self.teaser else self.dur
        add(tone([root, root * 1.189, root * 1.498, root * 2], end_music, a=1.6, r=0.05 if self.teaser else 1.0, gain=0.55), 0)
        for tk in (0.55, 0.85, 1.35, 1.65):
            add(A.kick(), tk * self.t_main0 / 2.2, 0.55)
        add(A.riser(self.t_main0 - 0.2), 0.1, 0.35)
        add(A.impact(), self.t_main0, 0.8)
        notes = [349.2, 415.3, 523.3, 622.3, 698.5, 830.6, 1046.5]
        for k in range(len(self.shots)):
            ts = self.t_main0 + k * self.shot_len
            add(A.whoosh(0.4), max(0, ts - 0.3), 0.35)
            add(A.kick(), ts, 0.9)
            add(pluck(notes[k % len(notes)]), ts + 0.02)
            for h in range(1, 4):
                add(A.hat(), ts + h * self.shot_len / 4, 0.25 + 0.04 * k)
            add(A.kick(), ts + self.shot_len / 2, 0.45)
        add(A.riser(1.8), self.t_reveal - 1.8, 0.6)
        if self.teaser:
            buf[int((self.t_cta) * sr):int((self.t_cta + 0.45) * sr)] = 0
            add(A.impact(), self.t_cta + 0.45, 1.0)
            add(A.kick(), self.t_cta + 0.45, 1.0)
            add(tone([root / 2, root, root * 1.189, root * 1.498], self.dur - self.t_cta - 0.45, a=0.01, r=1.2, gain=0.6), self.t_cta + 0.45)
        else:
            add(A.impact(), self.t_reveal, 0.9)
            for b in range(int((self.t_cta - self.t_reveal) / 0.5)):  # batida cheia na revelação
                tb = self.t_reveal + b * 0.5
                add(A.kick(), tb, 0.8)
                add(A.hat(), tb + 0.25, 0.4)
                if b % 2:
                    add(A.clap(), tb, 0.45)
            add(A.whoosh(0.5), self.t_cta - 0.3, 0.4)
            add(A.impact(), self.t_cta, 0.7)
            add(pluck(698.5, 1.4, 0.2), self.t_cta + 0.1)
            add(tone([root, root * 1.189, root * 1.498, root * 2], self.dur - self.t_cta, a=0.05, r=1.4, gain=0.5), self.t_cta)
        fade = int(0.6 * sr)
        buf[-fade:] *= np.linspace(1, 0, fade)[:, None]
        buf = np.tanh(buf * 1.2)
        A.write_wav(path, buf / (np.abs(buf).max() + 1e-9) * 0.92)

    def render(self, out):
        wav = os.path.splitext(out)[0] + ".wav"
        self.soundtrack(wav)
        cmd = [ffmpeg_bin(), "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
               "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
               "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out]
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        total = int(self.dur * FPS)
        for i in range(total):
            p.stdin.write(np.clip(self.frame(i), 0, 255).astype(np.uint8).tobytes())
            if i % 90 == 0:
                print(f"  quadro {i}/{total}", flush=True)
        p.stdin.close()
        if p.wait() != 0:
            raise SystemExit("ffmpeg falhou")
        os.remove(wav)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    spec_path, out = sys.argv[1], sys.argv[2]
    with open(spec_path, encoding="utf-8") as f:
        spec = json.load(f)
    film = Film(spec, os.path.dirname(os.path.abspath(spec_path)))
    if "--stills" in sys.argv:
        d = sys.argv[sys.argv.index("--stills") + 1]
        os.makedirs(d, exist_ok=True)
        for t in (1.2, 3.0, 4.5, 6.0, 7.5, 9.6, 11.0, 12.6, 14.5):
            img = np.clip(film.frame(int(t * FPS)), 0, 255).astype(np.uint8)
            Image.fromarray(img).resize((360, 640)).save(os.path.join(d, f"still_{t:04.1f}.jpg"), quality=85)
        return
    film.render(out)
    print("ok", out)


if __name__ == "__main__":
    main()
