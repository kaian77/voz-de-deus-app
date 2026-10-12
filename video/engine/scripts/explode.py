"""explode.py — vista explodida do pin em 3D: a tinta (esmalte), o metal e a tarraxa se separam e se juntam.

Tudo sai de uma foto só (o recorte da frente do pin):
- tinta: o próprio recorte colorido;
- metal: o mesmo desenho em dourado, com relevo (o pin "sem a tinta");
- verso: a silhueta em metal polido (níquel) com a marca gravada e o pino soldado no centro;
- tarraxa: de silicone transparente (como a que acompanha os pins).

Uso direto (teste):  python explode.py recorte.png saida_dir [--frames 150]
No motor de vídeo: camada {"type": "explode", "src": "foto.jpg", "cutout": true, "w": 0.8, "labels": [...]}.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import ease_in_out, ease_out_back, ease_out_cubic, font, prog  # noqa: E402

GOLD = [(0.0, (92, 62, 14)), (0.35, (168, 120, 34)), (0.62, (226, 182, 82)), (0.85, (252, 228, 150)), (1.0, (255, 246, 210))]


def ramp(v, stops):
    """Mapeia valores 0..1 numa rampa de cores (array HxW -> HxWx3)."""
    out = np.zeros(v.shape + (3,), np.float32)
    xs = [s[0] for s in stops]
    for c in range(3):
        out[..., c] = np.interp(v, xs, [s[1][c] for s in stops])
    return out


def split_layers(cut: Image.Image):
    """Separa o pin em tinta e metal.

    As linhas de metal do desenho são onde a cor muda de repente (os contornos entre as áreas de esmalte).
    - tinta: o recorte sem essas linhas (só as áreas coloridas);
    - metal: a peça "sem a tinta" — chapa dourada com as linhas e a borda em alto-relevo e as áreas rebaixadas lisas.
    """
    a = np.asarray(cut.getchannel("A"), np.float32) / 255
    rgb = cut.convert("RGB").filter(ImageFilter.GaussianBlur(0.8))
    edges = np.max(np.dstack([np.asarray(ch.filter(ImageFilter.FIND_EDGES), np.float32) for ch in rgb.split()]), axis=2) / 255
    inside = np.asarray(cut.getchannel("A").filter(ImageFilter.MinFilter(5)), np.float32) / 255
    thr = max(0.08, float(np.percentile(edges[inside > 0.5], 82))) if (inside > 0.5).any() else 0.15
    lines = Image.fromarray(((edges > thr) * inside * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    border = Image.fromarray(((a - inside).clip(0, 1) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    relief = np.maximum(np.asarray(lines, np.float32), np.asarray(border, np.float32)) / 255  # 1 = metal em alto-relevo

    # Metal: rebaixado liso e mais escuro; relevo brilhante com luz de cima/esquerda
    soft = Image.fromarray((relief * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
    emb = np.asarray(soft.filter(ImageFilter.EMBOSS), np.float32) / 255 - 0.5
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = 0.42 + 0.12 * (1 - (xx / w * 0.5 + yy / h * 0.5)) + 0.4 * relief + 1.4 * emb
    metal = np.dstack([np.clip(ramp(np.clip(v, 0, 1), GOLD), 0, 255), a * 255]).astype(np.uint8)

    # Tinta: só as áreas coloridas (as linhas de metal ficam vazadas)
    paint = np.asarray(cut, np.uint8).copy()
    paint[..., 3] = (paint[..., 3].astype(np.float32) * (1 - np.asarray(soft, np.float32) / 255 * 0.95)).astype(np.uint8)
    return Image.fromarray(paint, "RGBA"), Image.fromarray(metal, "RGBA")


CHROME = [(0.0, (34, 37, 42)), (0.3, (92, 98, 106)), (0.55, (158, 164, 172)), (0.78, (212, 216, 222)), (0.92, (240, 242, 245)),
          (1.0, (255, 255, 255))]


def back_from(cut: Image.Image, stamp="BRAX", seed=7) -> Image.Image:
    """Verso de metal polido (níquel), como o dos pins: reflexos fortes, borda em relevo e a marca gravada."""
    mask = cut.getchannel("A")
    w, h = mask.size
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # Faixas de reflexo do ambiente (o que faz parecer metal espelhado, e não plástico)
    u = (xx * 0.8 + yy * 0.55) / max(w, h)
    v = 0.5 + 0.28 * np.sin(u * 2 * np.pi * 1.6 + 0.6) + 0.16 * np.sin(u * 2 * np.pi * 4.1 + 1.9)
    v += 0.18 * np.exp(-((u - 0.62) ** 2) / 0.004)  # faixa de brilho estreita
    v += rng.normal(0, 1, (h, 1)).astype(np.float32) * 0.025 + rng.normal(0, 1, (h, w)).astype(np.float32) * 0.01
    # Borda em relevo: luz de cima/esquerda, sombra embaixo/direita
    soft = mask.filter(ImageFilter.GaussianBlur(max(2, w // 120)))
    emb = np.asarray(soft.filter(ImageFilter.EMBOSS), np.float32) / 255 - 0.5
    inner = np.asarray(mask.filter(ImageFilter.MinFilter(max(3, (w // 60) | 1))), np.float32) / 255
    a = np.asarray(mask, np.float32) / 255
    rim = (a - inner).clip(0, 1)
    v += 1.6 * emb * (0.4 + rim) + 0.12 * rim
    # Marca gravada em baixo-relevo (espelhada aqui porque o verso é visto de trás)
    if stamp:
        t = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(t)
        f = font("black", max(10, int(min(w, h) * 0.085)))
        tw, th = d.textlength(stamp, font=f), f.size
        cx, cy = w * 0.5, h * 0.72
        pad = th * 0.35
        box = (cx - tw / 2 - pad, cy - th / 2 - pad, cx + tw / 2 + pad, cy + th / 2 + pad)
        if np.asarray(mask.crop(tuple(int(b) for b in box)), np.float32).mean() > 200:  # só se couber dentro da silhueta
            d.rounded_rectangle(box, radius=pad, outline=255, width=max(2, int(th * 0.12)))
            d.text((cx, cy), stamp, font=f, fill=255, anchor="mm")
            t = t.transpose(Image.FLIP_LEFT_RIGHT)
            st = np.asarray(t.filter(ImageFilter.GaussianBlur(1.2)).filter(ImageFilter.EMBOSS), np.float32) / 255 - 0.5
            v -= 1.4 * st + 0.08 * (np.asarray(t, np.float32) / 255)
    rgb = ramp(np.clip(v, 0, 1), CHROME)
    return Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA")


def disc(r: int, fill_a: int, rim_a: int, rim_w: int, cap=False) -> Image.Image:
    """Fatia da tarraxa de silicone transparente: miolo quase invisível, borda mais marcada (é ela que desenha o volume)."""
    ss = 3
    R = r * ss
    s = R * 2 + 8
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = s / 2
    d.ellipse((c - R, c - R, c + R, c + R), fill=(240, 243, 247, fill_a), outline=(196, 202, 212, rim_a), width=max(2, rim_w * ss))
    if cap:  # a cabeça vista de frente: reflexos e o furo do pino no meio
        d.ellipse((c - R * 0.7, c - R * 0.75, c - R * 0.05, c - R * 0.25), fill=(255, 255, 255, 120))
        d.arc((c - R * 0.82, c - R * 0.82, c + R * 0.82, c + R * 0.82), 20, 160, fill=(255, 255, 255, 110), width=max(2, R // 10))
        d.ellipse((c - R * 0.1, c - R * 0.1, c + R * 0.1, c + R * 0.1), fill=(120, 126, 136, 200))
    im = im.filter(ImageFilter.GaussianBlur(ss * 0.7))
    return im.resize((s // ss, s // ss), Image.LANCZOS)


def darken(im: Image.Image, k: float) -> Image.Image:
    r, g, b, a = im.split()
    rgb = Image.merge("RGB", (r, g, b)).point(lambda x: int(x * k))
    return Image.merge("RGBA", (*rgb.split(), a))


# ------------------------------------------------------------------ projeção 3D
def rot(rx, ry):
    cx, sx, cy, sy = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    return Rx @ Ry


def solve_perspective(dst, src):
    """Coeficientes do PIL (saída -> entrada) para levar o quadrilátero dst no retângulo src."""
    A, b = [], []
    for (X, Y), (x, y) in zip(dst, src):
        A.append([X, Y, 1, 0, 0, 0, -x * X, -x * Y]); b.append(x)
        A.append([0, 0, 0, X, Y, 1, -y * X, -y * Y]); b.append(y)
    return np.linalg.solve(np.array(A, float), np.array(b, float))


class Scene3D:
    def __init__(self, size, height=None, focal=2.2):
        self.S = size
        self.Hc = height or size
        self.f = focal * size
        self.center = np.zeros(3)  # ponto que fica no meio do quadro

    def project(self, p, R):
        q = R @ (np.asarray(p, float) - self.center)
        k = self.f / (self.f - q[2])
        return np.array([self.S / 2 + q[0] * k, self.Hc / 2 - q[1] * k]), q[2]

    def plane(self, canvas, im, z, R, flip=False, op=1.0, cx=0.0, cy=0.0):
        """Desenha a imagem num plano paralelo à placa (centro em (cx, cy), profundidade z)."""
        w, h = im.size
        corners = [(cx - w / 2, cy + h / 2), (cx + w / 2, cy + h / 2), (cx + w / 2, cy - h / 2), (cx - w / 2, cy - h / 2)]
        pts = [self.project((x, y, z), R)[0] for x, y in corners]
        src = [(0, 0), (w, 0), (w, h), (0, h)]
        if flip:
            src = [(w, 0), (0, 0), (0, h), (w, h)]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        x0, y0 = int(max(0, min(xs) - 2)), int(max(0, min(ys) - 2))
        x1, y1 = int(min(self.S, max(xs) + 2)), int(min(self.Hc, max(ys) + 2))
        if x1 - x0 < 2 or y1 - y0 < 2:
            return
        coeffs = solve_perspective([(p[0] - x0, p[1] - y0) for p in pts], src)
        layer = im.transform((x1 - x0, y1 - y0), Image.PERSPECTIVE, tuple(coeffs), Image.BICUBIC)
        if op < 1:
            layer.putalpha(layer.getchannel("A").point(lambda a: int(a * op)))
        canvas.alpha_composite(layer, (x0, y0))


def facing(R):
    """True quando a frente da placa está virada para a câmera."""
    return (R @ np.array([0, 0, 1.0]))[2] > 0


class ExplodedPin:
    """Gera os quadros da animação a partir do recorte da frente do pin."""

    def __init__(self, cut: Image.Image, size=1000, fill=0.5, labels=("TINTA", "METAL", "TARRAXA DE SILICONE"), accent="#FFC72C",
                 stamp="BRAX"):
        bbox = cut.getchannel("A").getbbox()
        cut = cut.crop(bbox)
        k = size * fill / max(cut.size)
        cut = cut.resize((max(1, int(cut.width * k)), max(1, int(cut.height * k))), Image.LANCZOS)
        self.S = size
        self.photo = cut
        self.paint, self.metal = split_layers(cut)
        self.metal_side = darken(self.metal, 0.55)
        self.back = back_from(cut, stamp)
        self.back_side = darken(self.back, 0.6)
        a = np.asarray(cut.getchannel("A"), np.float32)
        ys, xs = np.nonzero(a > 128)
        # Centro de massa (onde fica o pino), no sistema do plano (y para cima)
        self.pin_xy = (float(xs.mean() - cut.width / 2), float(cut.height / 2 - ys.mean())) if len(xs) else (0.0, 0.0)
        self.thick = size * 0.018
        self.post_len = size * 0.24
        # Tarraxa de silicone: corpo (cilindro) virado para a placa e cabeça redonda mais larga na ponta
        rb = int(size * 0.042)
        self.clutch_body, self.clutch_len = disc(rb, 26, 120, 2), size * 0.085
        self.clutch_head, self.clutch_head_cap, self.clutch_head_len = disc(int(rb * 1.5), 40, 170, 3), disc(int(rb * 1.5), 80, 220, 3, True), size * 0.022
        self.clutch = self.clutch_head  # medida usada nas etiquetas
        self.labels = labels
        self.accent = accent
        self.Hc = int(size * 1.35)  # quadro mais alto que largo: a pilha explodida cresce na vertical
        self.cam = Scene3D(size, self.Hc)

    def frame(self, rx, ry, explode, label_op=0.0, flash=0.0):
        S = self.S
        canvas = Image.new("RGBA", (S, self.Hc), (0, 0, 0, 0))
        R = rot(rx, ry)
        g = S * 0.25 * explode
        z_paint = 0.6 + g
        z_metal = 0.0
        z_clutch = -self.thick - self.post_len * 0.55 - g * 1.25
        front = facing(R)
        px, py = self.pin_xy
        # Mantém a pilha (da tinta à tarraxa) centralizada enquanto as camadas se afastam
        self.cam.center = np.array([0.0, 0.0, (z_paint + z_clutch) / 2])

        def metal_block():
            n = 6
            order = range(n + 1) if front else range(n, -1, -1)  # de trás para a frente, visto da câmera
            for i in order:
                z = -self.thick + self.thick * i / n
                if front:
                    img = self.metal if i == n else self.metal_side
                else:
                    img = self.back if i == 0 else self.back_side
                self.cam.plane(canvas, img, z, R)

        def post():
            a, _ = self.cam.project((px, py, -self.thick), R)
            b, _ = self.cam.project((px, py, -self.thick - self.post_len), R)
            d = ImageDraw.Draw(canvas)
            wpx = max(3, int(S * 0.011))
            d.line([tuple(a), tuple(b)], fill=(150, 156, 164, 255), width=wpx)
            d.line([tuple(a + (wpx * 0.25, 0)), tuple(b + (wpx * 0.25, 0))], fill=(235, 238, 242, 255), width=max(1, wpx // 3))

        def clutch():
            # Fatias do corpo e da cabeça ao longo do pino, da mais longe para a mais perto da câmera
            top = z_clutch + self.clutch_len / 2
            slices = [(top - self.clutch_len * k / 9, self.clutch_body) for k in range(10)]
            bottom = top - self.clutch_len
            slices += [(bottom - self.clutch_head_len * k / 3, self.clutch_head) for k in range(4)]
            slices[-1] = (slices[-1][0], self.clutch_head_cap)
            for z, img in sorted(slices, key=lambda s_: s_[0] * (1 if front else -1)):
                self.cam.plane(canvas, img, z, R, cx=px, cy=py)

        def paint():
            # Montado: a foto original (tinta + linhas de metal); separando: só a tinta
            if explode < 0.04:
                self.cam.plane(canvas, self.photo, z_paint, R)
            else:
                self.cam.plane(canvas, self.paint, z_paint, R)

        # Ordem de desenho: do mais longe para o mais perto da câmera
        parts = [(z_paint, paint), (z_metal, metal_block), (-self.thick - self.post_len / 2, post), (z_clutch, clutch)]
        view_z = (R @ np.array([0, 0, 1.0]))[2]
        parts.sort(key=lambda p: p[0] * view_z)
        for _, fn in parts:
            fn()

        if label_op > 0.01:
            self._labels(canvas, R, [(z_paint, self.labels[0]), (z_metal, self.labels[1]), (z_clutch, self.labels[2])], label_op)
        if flash > 0.01:  # brilho do impacto atrás do pin
            glow = Image.new("RGBA", (S, self.Hc), (255, 255, 255, 0))
            r, cy = S * (0.2 + 0.15 * (1 - flash)), self.Hc / 2
            ImageDraw.Draw(glow).ellipse((S / 2 - r, cy - r, S / 2 + r, cy + r), fill=(255, 236, 180, int(200 * flash)))
            glow = glow.filter(ImageFilter.GaussianBlur(S * 0.06))
            glow.alpha_composite(canvas)
            canvas = glow
        return canvas

    def _labels(self, canvas, R, items, op):
        """Etiquetas com linha guia, à direita de cada camada (sempre dentro do quadro)."""
        d = ImageDraw.Draw(canvas)
        px, py = self.pin_xy
        accent = tuple(int(self.accent.lstrip("#")[k:k + 2], 16) for k in (0, 2, 4))
        a = int(255 * op)
        pad = self.S * 0.02
        for i, (z, text) in enumerate(items):
            if i < 2:
                anchor, _ = self.cam.project((self.paint.width * 0.36, 0, z), R)
            else:
                anchor, _ = self.cam.project((px + self.clutch.width * 0.45, py, z), R)
            # Mesmo tamanho em todas; a etiqueta longa quebra em duas linhas quando não cabe à direita da peça
            x = anchor[0] + self.S * 0.1
            room = self.S - x - 2 * pad - self.S * 0.01
            size = int(self.S * 0.05)
            fl = font("black", size)
            lines = [text]
            if d.textlength(text, font=fl) > room and " " in text:
                cut = text.find(" ", len(text) // 2 - 3)
                lines = [text[:cut], text[cut + 1:]] if cut > 0 else text.split(" ", 1)
            tw = max(d.textlength(l, font=fl) for l in lines)
            x = min(x, self.S - tw - 2 * pad - self.S * 0.01)
            y = anchor[1]
            lh = size * 1.1
            hh = lh * len(lines) / 2 + self.S * 0.012
            d.line([tuple(anchor), (x - pad, y)], fill=(255, 255, 255, a), width=max(2, self.S // 280))
            d.ellipse((anchor[0] - 7, anchor[1] - 7, anchor[0] + 7, anchor[1] + 7), fill=(255, 255, 255, a))
            d.rounded_rectangle((x - pad, y - hh, x + tw + pad, y + hh), radius=self.S * 0.022, fill=accent + (a,))
            for j, l in enumerate(lines):
                d.text((x, y + (j - (len(lines) - 1) / 2) * lh), l, font=fl, fill=(17, 17, 17, a), anchor="lm")


def timeline(t, dur=5.0):
    """(rx, ry, explode, labels, flash) no instante t (segundos) da cena de `dur` segundos."""
    k = dur / 5.0
    T = lambda s: s * k  # noqa: E731
    tilt = math.radians(-64)
    turn = math.radians(16)
    # entra de frente -> inclina -> explode -> segura -> junta com impacto -> vira (mostra o verso) -> volta
    a = ease_in_out(prog(t, T(0.35), T(0.7)))
    rx, ry = tilt * a, turn * a
    e = ease_out_back(prog(t, T(1.05), T(0.8)), 1.2) * (1 - ease_out_cubic(prog(t, T(2.9), T(0.28)) ** 2.2))
    float_y = math.sin(t * 3.2) * 0.04 * prog(t, T(1.8), T(0.3)) * (1 - prog(t, T(2.9), T(0.2)))
    e = max(0.0, e + float_y)
    labels = prog(t, T(1.6), T(0.35)) * (1 - prog(t, T(2.8), T(0.2)))
    flash = max(0.0, 1 - abs(t - T(3.2)) / T(0.25))
    back = ease_in_out(prog(t, T(3.45), T(0.65))) - ease_in_out(prog(t, T(4.35), T(0.6)))
    untilt = ease_in_out(prog(t, T(3.3), T(0.6)))
    rx = rx * (1 - untilt)
    ry = ry * (1 - untilt) + math.pi * back
    return rx, ry, e, labels, flash


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    n = int(sys.argv[sys.argv.index("--frames") + 1]) if "--frames" in sys.argv else 150
    os.makedirs(out, exist_ok=True)
    pin = ExplodedPin(Image.open(src).convert("RGBA"))
    for i in range(n):
        t = i / 30
        fr = pin.frame(*timeline(t))
        bg = Image.new("RGBA", fr.size, (20, 12, 14, 255))
        bg.alpha_composite(fr)
        bg.convert("RGB").save(os.path.join(out, f"f_{i:04d}.jpg"), quality=88)
