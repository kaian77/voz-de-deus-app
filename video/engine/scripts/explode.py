"""explode.py — vista explodida do pin em 3D: a tinta (esmalte), o metal e a tarraxa se separam e se juntam.

Tudo sai de uma foto só (o recorte da frente do pin):
- tinta: o próprio recorte colorido;
- metal: o mesmo desenho em dourado, com relevo (o pin "sem a tinta");
- verso: a silhueta espelhada em prata escovada, com o pino soldado no centro;
- tarraxa: emborrachada, translúcida (como a que acompanha os pins).

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
SILVER = [(0.0, (96, 102, 110)), (0.4, (160, 166, 174)), (0.75, (214, 219, 224)), (1.0, (246, 248, 250))]


def ramp(v, stops):
    """Mapeia valores 0..1 numa rampa de cores (array HxW -> HxWx3)."""
    out = np.zeros(v.shape + (3,), np.float32)
    xs = [s[0] for s in stops]
    for c in range(3):
        out[..., c] = np.interp(v, xs, [s[1][c] for s in stops])
    return out


def metal_from(cut: Image.Image) -> Image.Image:
    """O pin "sem a tinta": o desenho vira dourado com relevo, mantendo a silhueta."""
    a = np.asarray(cut.getchannel("A"), np.float32) / 255
    lum = np.asarray(cut.convert("L"), np.float32) / 255
    emb = np.asarray(cut.convert("L").filter(ImageFilter.EMBOSS), np.float32) / 255
    edges = np.asarray(cut.convert("L").filter(ImageFilter.FIND_EDGES), np.float32) / 255
    v = np.clip(0.35 + 0.35 * lum + 0.9 * (emb - 0.5) + 0.45 * edges, 0, 1)
    rgb = ramp(v, GOLD)
    # Borda levemente mais escura dá volume ao recorte
    rim = 1 - np.asarray(cut.getchannel("A").filter(ImageFilter.MinFilter(9)), np.float32) / 255
    rgb *= (1 - 0.35 * (rim * a))[..., None]
    out = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def back_from(cut: Image.Image, seed=7) -> Image.Image:
    """Verso: a mesma silhueta em prata escovada."""
    mask = cut.getchannel("A")  # visto de trás, a projeção já espelha a silhueta
    w, h = mask.size
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = 0.45 + 0.35 * (xx / w * 0.6 + (1 - yy / h) * 0.4)
    streaks = rng.normal(0, 1, (h, 1)).astype(np.float32) * 0.05 + rng.normal(0, 1, (h, w)).astype(np.float32) * 0.015
    v = np.clip(v + streaks, 0, 1)
    rim = 1 - np.asarray(mask.filter(ImageFilter.MinFilter(11)), np.float32) / 255
    a = np.asarray(mask, np.float32) / 255
    v = np.clip(v - 0.3 * rim * a, 0, 1)
    rgb = ramp(v, SILVER)
    return Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA")


def clutch_img(r: int) -> Image.Image:
    """Tarraxa emborrachada vista de frente (disco translúcido com brilho)."""
    s = r * 2 + 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((2, 2, s - 3, s - 3), fill=(205, 196, 238, 215), outline=(150, 140, 190, 255), width=max(2, r // 12))
    d.ellipse((r * 0.35, r * 0.3, r * 1.1, r * 0.95), fill=(255, 255, 255, 120))
    d.ellipse((r - r * 0.18, r - r * 0.18, r + r * 0.18, r + r * 0.18), fill=(120, 110, 160, 230))
    return im.filter(ImageFilter.GaussianBlur(0.6))


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

    def plane(self, canvas, im, z, R, flip=False, op=1.0):
        """Desenha a imagem num plano paralelo à placa (centro na origem, profundidade z)."""
        w, h = im.size
        corners = [(-w / 2, h / 2), (w / 2, h / 2), (w / 2, -h / 2), (-w / 2, -h / 2)]
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

    def __init__(self, cut: Image.Image, size=1000, fill=0.5, labels=("TINTA", "METAL", "TARRAXA"), accent="#FFC72C"):
        bbox = cut.getchannel("A").getbbox()
        cut = cut.crop(bbox)
        k = size * fill / max(cut.size)
        cut = cut.resize((max(1, int(cut.width * k)), max(1, int(cut.height * k))), Image.LANCZOS)
        self.S = size
        self.paint = cut
        self.metal = metal_from(cut)
        self.metal_side = darken(self.metal, 0.55)
        self.back = back_from(cut)
        self.back_side = darken(self.back, 0.6)
        a = np.asarray(cut.getchannel("A"), np.float32)
        ys, xs = np.nonzero(a > 128)
        # Centro de massa (onde fica o pino), no sistema do plano (y para cima)
        self.pin_xy = (float(xs.mean() - cut.width / 2), float(cut.height / 2 - ys.mean())) if len(xs) else (0.0, 0.0)
        self.thick = size * 0.018
        self.post_len = size * 0.24
        self.clutch = clutch_img(int(size * 0.075))
        self.clutch_side = darken(self.clutch, 0.7)
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
            for i in range(4):
                z = z_clutch - S * 0.012 * (1 - i / 3) if front else z_clutch - S * 0.012 * (i / 3)
                img = self.clutch if (i == 3) else self.clutch_side
                shifted = Image.new("RGBA", (self.paint.width, self.paint.height), (0, 0, 0, 0))
                shifted.alpha_composite(img, (int(self.paint.width / 2 + px - img.width / 2), int(self.paint.height / 2 - py - img.height / 2)))
                self.cam.plane(canvas, shifted, z, R)

        def paint():
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
        f = font("black", int(self.S * 0.056))
        px, py = self.pin_xy
        accent = tuple(int(self.accent.lstrip("#")[k:k + 2], 16) for k in (0, 2, 4))
        a = int(255 * op)
        pad = self.S * 0.02
        for i, (z, text) in enumerate(items):
            if i < 2:
                anchor, _ = self.cam.project((self.paint.width * 0.36, 0, z), R)
            else:
                anchor, _ = self.cam.project((px + self.clutch.width * 0.45, py, z), R)
            tw = d.textlength(text, font=f)
            x = min(anchor[0] + self.S * 0.1, self.S - tw - 2 * pad - self.S * 0.01)
            y = anchor[1]
            d.line([tuple(anchor), (x - pad, y)], fill=(255, 255, 255, a), width=max(2, self.S // 280))
            d.ellipse((anchor[0] - 7, anchor[1] - 7, anchor[0] + 7, anchor[1] + 7), fill=(255, 255, 255, a))
            box = (x - pad, y - self.S * 0.038, x + tw + pad, y + self.S * 0.038)
            d.rounded_rectangle(box, radius=self.S * 0.022, fill=accent + (a,))
            d.text((x, y), text, font=f, fill=(17, 17, 17, a), anchor="lm")


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
