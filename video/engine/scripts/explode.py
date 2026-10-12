"""explode.py — vista explodida do pin em 3D: a tinta (esmalte), o metal e a tarraxa se separam e se juntam.

Tudo sai de uma foto só (o recorte da frente do pin):
- tinta: o próprio recorte colorido;
- metal: o mesmo desenho em dourado, com relevo (o pin "sem a tinta");
- verso: a silhueta em metal polido (níquel) com a marca em relevo e o pino soldado no centro;
- tarraxa: cúpula de silicone transparente lilás com base reta (como a que acompanha os pins).

O metal é iluminado como espelho: cada pixel reflete um estúdio escuro com faixas de luz (softbox), e o reflexo muda
conforme a peça gira. É isso que faz parecer metal e não plástico (o plástico só fica mais claro ou mais escuro).

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
    thr = max(0.08, float(np.percentile(edges[inside > 0.5], 87))) if (inside > 0.5).any() else 0.15
    lines = Image.fromarray(((edges > thr) * inside * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    border = Image.fromarray(((a - inside).clip(0, 1) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    relief = np.maximum(np.asarray(lines, np.float32), np.asarray(border, np.float32)) / 255  # 1 = metal em alto-relevo

    # Metal: linhas e borda em alto-relevo (arredondadas), áreas rebaixadas lisas; borda externa abaulada
    soft = Image.fromarray((relief * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
    dome = np.asarray(cut.getchannel("A").filter(ImageFilter.GaussianBlur(max(2, a.shape[1] // 90))), np.float32) / 255
    height = 2.4 * np.asarray(soft, np.float32) / 255 + 10 * dome
    rough = 0.2 * (1 - np.asarray(soft, np.float32) / 255)  # rebaixado acetinado, relevo polido
    metal = MetalSurface(height, a, GOLD, rough=rough, seed=3, wobble=18, grain=0.15)

    # Tinta: só as áreas coloridas (as linhas de metal ficam vazadas)
    paint = np.asarray(cut, np.uint8).copy()
    paint[..., 3] = (paint[..., 3].astype(np.float32) * (1 - np.asarray(soft, np.float32) / 255 * 0.95)).astype(np.uint8)
    return Image.fromarray(paint, "RGBA"), metal


CHROME = [(0.0, (18, 20, 24)), (0.25, (58, 62, 70)), (0.5, (128, 134, 142)), (0.72, (196, 200, 208)), (0.88, (236, 238, 242)),
          (1.0, (255, 255, 255))]


def blur_noise(h, w, cells, seed):
    """Ondulação suave (a chapa estampada nunca é perfeitamente plana)."""
    rng = np.random.default_rng(seed)
    small = Image.fromarray(rng.random((cells, cells)).astype(np.float32), "F")  # em float: sem degraus no relevo
    return np.asarray(small.resize((w, h), Image.BICUBIC), np.float32) - 0.5


def studio(r):
    """Estúdio escuro com softboxes: brilho visto na direção r (espaço da câmera, z aponta para a câmera)."""
    x, y, z = r[..., 0], r[..., 1], r[..., 2]
    band = lambda v, c, w: np.exp(-((v - c) / w) ** 2)  # noqa: E731
    e = 0.04 + 0.12 * (y * 0.5 + 0.5)
    e += 1.1 * band(y, 0.42, 0.1) * band(x, -0.05, 0.7)  # softbox comprido em cima
    e += 0.8 * band(x, -0.45, 0.08) * band(y, 0.05, 0.6)  # faixa vertical à esquerda
    e += 0.5 * band(x, 0.5, 0.06) * band(y, -0.1, 0.5)  # recorte de luz à direita
    e += 0.55 * band(x - y * 0.6, 0.18, 0.07) * (z > 0.3)  # janela na diagonal, atrás da câmera (o reflexo que cruza a peça)
    e += 0.22 * np.exp(-((x + 0.25) ** 2 + (y - 0.3) ** 2 + (z - 0.9) ** 2) / 0.25)  # luz de frente (o dourado não fica preto)
    return e


class MetalSurface:
    """Superfície metálica dada pela altura: a cor de cada pixel é o reflexo do estúdio na direção do espelho."""

    def __init__(self, height, alpha, stops, rough=0.0, seed=1, wobble=0.6, grain=0.0, bowl=0.0):
        h, w = height.shape
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        height = height + wobble * blur_noise(h, w, 4, seed) - bowl * ((xx - w / 2) ** 2 + (yy - h / 2) ** 2)
        if grain:
            height = height + grain * blur_noise(h, w, 40, seed + 1)
        gy, gx = np.gradient(height)
        n = np.dstack([-gx, gy, np.full_like(gx, 0.9)])  # y da imagem cresce para baixo, o do plano para cima
        self.n = n / np.linalg.norm(n, axis=2, keepdims=True)
        self.alpha = alpha
        self.stops = stops
        self.rough = rough
        self.xy = np.dstack([xx - w / 2, h / 2 - yy])
        self.size = (w, h)

    def shade(self, R, focal, z=0.0, center=(0, 0, 0), back=False, dim=1.0):
        """Textura vista com a rotação R (back=True: a face de trás, cujo relevo aponta para -z)."""
        n = self.n * np.array([1, 1, -1], np.float32) if back else self.n
        Rt = R.T.astype(np.float32)
        nc = n @ Rt
        p = (np.dstack([self.xy, np.full(self.xy.shape[:2], z, np.float32)]) - np.asarray(center, np.float32)) @ Rt
        v = p - np.array([0, 0, focal], np.float32)
        v /= np.linalg.norm(v, axis=2, keepdims=True)
        r = v - 2 * np.sum(v * nc, axis=2, keepdims=True) * nc
        e = studio(r)
        if np.ndim(self.rough) or self.rough:
            e = e * (1 - self.rough) + 0.34 * self.rough  # acetinado: reflexo mais espalhado
        rgb = ramp(np.clip(e * dim, 0, 1), self.stops)
        return Image.fromarray(np.dstack([rgb, self.alpha * 255]).astype(np.uint8), "RGBA")


def back_from(cut: Image.Image, stamp="BRAX", seed=7) -> MetalSurface:
    """Verso de metal polido (níquel), como o dos pins: espelhado, borda abaulada e a marca em relevo numa moldura."""
    mask = cut.getchannel("A")
    w, h = mask.size
    a = np.asarray(mask, np.float32) / 255
    dome = np.asarray(mask.filter(ImageFilter.GaussianBlur(max(2, w // 70))), np.float32) / 255
    height = 10 * dome
    # Marca em relevo (espelhada aqui porque o verso é visto de trás)
    if stamp:
        t = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(t)
        f = font("black", max(10, int(min(w, h) * 0.08)))
        tw, th = d.textlength(stamp, font=f), f.size
        cx, cy = w * 0.5, h * 0.72
        pad = th * 0.35
        box = (cx - tw / 2 - pad, cy - th / 2 - pad, cx + tw / 2 + pad, cy + th / 2 + pad)
        if np.asarray(mask.crop(tuple(int(b) for b in box)), np.float32).mean() > 200:  # só se couber dentro da silhueta
            d.rounded_rectangle(box, radius=pad * 0.5, outline=255, width=max(2, int(th * 0.12)))
            d.text((cx, cy), stamp, font=f, fill=255, anchor="mm")
            t = t.transpose(Image.FLIP_LEFT_RIGHT).filter(ImageFilter.GaussianBlur(0.9))
            height += 4.0 * np.asarray(t, np.float32) / 255
    return MetalSurface(height, a, CHROME, rough=0.05, seed=seed, wobble=6, bowl=0.0004)


LILAC = np.array([214, 206, 250], np.float32)


def _over(img, pts, rgba):
    """Polígono translúcido por cima (o ImageDraw sozinho substitui o alfa em vez de somar)."""
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, y0 = max(0, int(min(xs))), max(0, int(min(ys)))
    x1, y1 = min(img.width, int(max(xs)) + 2), min(img.height, int(max(ys)) + 2)
    if x1 <= x0 or y1 <= y0 or rgba[3] < 2:
        return
    m = Image.new("L", (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(m).polygon([(x - x0, y - y0) for x, y in pts], fill=int(rgba[3]))
    layer = Image.new("RGBA", m.size, tuple(int(c) for c in rgba[:3]) + (0,))
    layer.putalpha(m)
    img.alpha_composite(layer, (x0, y0))


def draw_clutch(canvas, cam, R, c, r, ss=2):
    """Tarraxa de silicone como a dos pins: cúpula lilás transparente sobre uma base reta com aba, furo do pino no meio.

    c = centro da base (lado que encosta no pin, virado para +z); a cúpula cresce para -z, longe da placa.
    Cada pedacinho da superfície é pintado conforme o ângulo: borda mais densa (silicone), reflexos do estúdio por cima.
    """
    cx, cy, zb = c
    lip, H, fl = r * 0.1, r * 1.05, r * 1.1
    nphi, nth = 32, 10
    Rm = np.asarray(R, float)
    eye = np.array([0, 0, cam.f])

    def cam_q(p):
        return Rm @ (np.asarray(p, float) - cam.center)

    def scr(q):
        k = cam.f / (cam.f - q[2])
        return np.array([cam.S / 2 + q[0] * k, cam.Hc / 2 - q[1] * k])

    faces = []  # (profundidade, pontos 3D, normal, tipo)
    phis = np.linspace(0, 2 * np.pi, nphi + 1)
    ths = np.linspace(0, np.pi / 2, nth + 1)

    def dome_pt(th, ph):
        rho, z = r * math.sin(th), zb - lip - H * math.cos(th)
        return (cx + rho * math.cos(ph), cy + rho * math.sin(ph), z)

    def dome_n(th, ph):
        rho, z = r * math.sin(th), -H * math.cos(th)
        n = np.array([rho / r ** 2 * math.cos(ph), rho / r ** 2 * math.sin(ph), z / H ** 2])
        return n / (np.linalg.norm(n) + 1e-9)

    for i in range(nth):
        for j in range(nphi):
            pts = [dome_pt(ths[i], phis[j]), dome_pt(ths[i + 1], phis[j]), dome_pt(ths[i + 1], phis[j + 1]), dome_pt(ths[i], phis[j + 1])]
            faces.append((pts, dome_n((ths[i] + ths[i + 1]) / 2, (phis[j] + phis[j + 1]) / 2), "s"))
    # Base reta mais larga (a aba), com a lateral fina
    ring = lambda rad, z: [(cx + rad * math.cos(ph), cy + rad * math.sin(ph), z) for ph in phis[:-1]]  # noqa: E731
    for j in range(nphi):
        ph = (phis[j] + phis[j + 1]) / 2
        a0, a1 = phis[j], phis[j + 1]
        pts = [(cx + fl * math.cos(a0), cy + fl * math.sin(a0), zb), (cx + fl * math.cos(a1), cy + fl * math.sin(a1), zb),
               (cx + fl * math.cos(a1), cy + fl * math.sin(a1), zb - lip), (cx + fl * math.cos(a0), cy + fl * math.sin(a0), zb - lip)]
        faces.append((pts, np.array([math.cos(ph), math.sin(ph), 0.0]), "s"))
    faces.append((ring(fl, zb), np.array([0, 0, 1.0]), "s"))  # face que encosta no pin
    faces.append((ring(fl, zb - lip), np.array([0, 0, -1.0]), "s"))
    # Abinha de injeção saindo da base, de um lado
    t = r * 0.22
    faces.append(([(cx + fl - t * 0.2, cy + t, zb - lip * 0.5), (cx + fl + t * 1.1, cy + t * 0.25, zb - lip * 0.5),
                   (cx + fl + t * 1.1, cy - t * 0.25, zb - lip * 0.5), (cx + fl - t * 0.2, cy - t, zb - lip * 0.5)], np.array([0, 0, -1.0]), "s"))
    # Furo do pino por dentro (a linha que aparece no meio da tarraxa)
    faces.append(([(cx, cy, zb), (cx, cy, zb - lip - H * 0.82)], None, "line"))

    items = []
    for pts, n, kind in faces:
        qs = [cam_q(p) for p in pts]
        depth = float(np.mean([q[2] for q in qs]))
        items.append((depth, [scr(q) for q in qs], qs, n, kind))
    allp = np.array([p for it in items for p in it[1]])
    x0, y0 = np.floor(allp.min(0)) - 4
    x1, y1 = np.ceil(allp.max(0)) + 4
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(cam.S, x1), min(cam.Hc, y1)
    if x1 - x0 < 2 or y1 - y0 < 2:
        return
    # Duas cascas: a de trás e a da frente. Dentro de cada casca os pedaços não se somam (sem linhas de malha);
    # a da frente fica por cima da de trás, e o canal do pino aparece entre as duas.
    size = (int(x1 - x0) * ss, int(y1 - y0) * ss)
    shells = {False: Image.new("RGBA", size, (0, 0, 0, 0)), True: Image.new("RGBA", size, (0, 0, 0, 0))}
    draws = {k: ImageDraw.Draw(v) for k, v in shells.items()}
    line = None
    base_front = False
    for depth, sp, qs, n, kind in sorted(items, key=lambda it: it[0]):  # do mais longe para o mais perto
        pts = [((p[0] - x0) * ss, (p[1] - y0) * ss) for p in sp]
        if kind == "line":
            line = pts
            continue
        nc = Rm @ n
        v = np.mean(qs, axis=0) - eye
        v /= np.linalg.norm(v)
        d = float(nc @ v)
        cos = abs(d)
        alpha = 0.28 + 0.6 * (1 - cos) ** 2.2
        col = LILAC * (0.86 + 0.14 * cos)
        front = d < 0
        if front:  # virado para a câmera: reflexos do estúdio
            rr = v - 2 * d * nc
            sp_ = float(np.clip(studio(rr[None, None, :])[0, 0] - 0.4, 0, 1))
            col = col + (255 - col) * sp_
            alpha = min(0.95, alpha + 0.6 * sp_)
            if n[2] > 0.99:
                base_front = True
        draws[front].polygon(pts, fill=tuple(int(c) for c in col) + (int(alpha * 255),))
    local = shells[False]
    if line is not None and math.dist(*line) > 3 * ss:  # o canal do pino, visto de lado
        _over(local, _thick_line(line, 2.0 * ss), (240, 236, 252, 120))
    local.alpha_composite(shells[True].filter(ImageFilter.GaussianBlur(ss * 1.2)))  # reflexos contínuos, sem facetas
    if base_front:  # olhando a base: o furo do pino no meio
        hc = scr(cam_q((cx, cy, zb)))
        hx, hy, hr = (hc[0] - x0) * ss, (hc[1] - y0) * ss, r * 0.09 * ss
        _over(local, [(hx + hr * math.cos(a), hy + hr * math.sin(a)) for a in np.linspace(0, 2 * np.pi, 16)], (150, 140, 190, 170))
    local = local.resize((int(x1 - x0), int(y1 - y0)), Image.LANCZOS)
    canvas.alpha_composite(local, (int(x0), int(y0)))


def _thick_line(pts, w):
    (ax, ay), (bx, by) = pts
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    return [(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]


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
        self.back = back_from(cut, stamp)
        a = np.asarray(cut.getchannel("A"), np.float32)
        ys, xs = np.nonzero(a > 128)
        # Centro de massa (onde fica o pino), no sistema do plano (y para cima)
        self.pin_xy = (float(xs.mean() - cut.width / 2), float(cut.height / 2 - ys.mean())) if len(xs) else (0.0, 0.0)
        self.thick = size * 0.018
        self.post_len = size * 0.18
        # Tarraxa: bolinha de silicone com o pino entrando nela (diâmetro ~1/4 da largura do pin, como na foto)
        self.clutch_r = max(cut.size) * 0.12
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
        z_clutch = -self.thick - self.post_len * 0.62 - g * 1.25  # base da tarraxa (o pino entra até perto da ponta)
        front = facing(R)
        px, py = self.pin_xy
        # Mantém a pilha (da tinta à tarraxa) centralizada enquanto as camadas se afastam
        self.cam.center = np.array([0.0, 0.0, (z_paint + z_clutch) / 2])

        def metal_block():
            n = 6
            f, c = self.cam.f, self.cam.center
            if front:
                face = self.metal.shade(R, f, 0.0, c)
            else:
                face = self.back.shade(R, f, -self.thick, c, back=True)
            side = darken(face, 0.45)  # a espessura da chapa
            order = range(n + 1) if front else range(n, -1, -1)  # de trás para a frente, visto da câmera
            for i in order:
                z = -self.thick + self.thick * i / n
                self.cam.plane(canvas, face if i == (n if front else 0) else side, z, R)

        def post():
            a, _ = self.cam.project((px, py, -self.thick), R)
            b, _ = self.cam.project((px, py, -self.thick - self.post_len), R)
            d = ImageDraw.Draw(canvas)
            wpx = max(3, int(S * 0.011))
            # solda em cone na base do pino e o pino de aço com um fio de brilho
            rs = wpx * 1.6
            d.ellipse((a[0] - rs, a[1] - rs, a[0] + rs, a[1] + rs), fill=(170, 176, 184, 255))
            d.line([tuple(a), tuple(b)], fill=(120, 126, 134, 255), width=wpx)
            d.line([tuple(a + (wpx * 0.2, 0)), tuple(b + (wpx * 0.2, 0))], fill=(240, 242, 246, 255), width=max(1, wpx // 3))

        def clutch():
            draw_clutch(canvas, self.cam, R, (px, py, z_clutch), self.clutch_r)

        def hardware():  # o pino entra na tarraxa: desenha o pino e a bolinha transparente por cima
            post()
            clutch()

        def paint():
            # Montado: a foto original (tinta + linhas de metal); separando: só a tinta
            if explode < 0.04:
                self.cam.plane(canvas, self.photo, z_paint, R)
            else:
                self.cam.plane(canvas, self.paint, z_paint, R)

        # Ordem de desenho: do mais longe para o mais perto da câmera
        parts = [(z_paint, paint), (z_metal, metal_block), (z_clutch, hardware)]
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
                anchor, _ = self.cam.project((px + self.clutch_r * 0.9, py, z), R)
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
