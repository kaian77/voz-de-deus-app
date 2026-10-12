#!/usr/bin/env python3
"""render3d.py — gera objetos 3D texturizados (embalagem, lata, pote, moeda/logo, esfera)
girando, com fundo transparente, prontos para sobrepor em vídeos.

Não precisa de Blender nem GPU: é um ray tracer em numpy (iluminação de estúdio,
brilho especular, reflexo, luz de contorno e sombra de contato suave).

Exemplos:
  # caixa de produto (frente = foto/arte da embalagem)
  python render3d.py --shape box --front caixa.png --out caixa3d.mov
  # lata/garrafa/pote com rótulo envolvendo o cilindro
  python render3d.py --shape cylinder --label rotulo.png --wrap 1 --color "#d9d9d9" --out lata.mov
  # moeda/selo com logo girando
  python render3d.py --shape coin --cap logo.png --color "#FFC83D" --gloss 0.9 --out selo.webm
  # prévia rápida de um quadro
  python render3d.py --shape box --front caixa.png --preview previa.png

Saídas: .mov (ProRes 4444 com alfa — Premiere/Final Cut/DaVinci/CapCut desktop),
        .webm (VP9 com alfa — web/ffmpeg), .mp4 (com fundo --bg), pasta/ (PNGs),
        .png (com --preview: um quadro só).
"""
import argparse
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ffmpeg_bin, rgb, gradient, ease_out_cubic, ease_in_out  # noqa: E402


def to_lin(a):
    return np.power(np.clip(a, 0, 1), 2.2)


def to_srgb(a):
    return np.power(np.clip(a, 0, 1), 1 / 2.2)


def edge_color(im):
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    b = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    return tuple(int(x) for x in b.mean(0))


class Tex:
    """Textura (imagem ou cor sólida) com amostragem bilinear em espaço linear."""

    def __init__(self, src, base_color=(200, 200, 200), max_side=1024):
        if src is None:
            src = base_color
        if isinstance(src, str) and src.startswith("#"):
            src = rgb(src)
        if isinstance(src, (tuple, list)):
            self.arr = to_lin(np.array(src[:3], np.float32).reshape(1, 1, 3) / 255)
            return
        im = src if isinstance(src, Image.Image) else Image.open(src)
        im = im.convert("RGBA")
        im.thumbnail((max_side, max_side), Image.LANCZOS)
        bg = Image.new("RGBA", im.size, rgb(base_color) + (255,))
        bg.alpha_composite(im)  # transparência vira cor do corpo
        self.arr = to_lin(np.asarray(bg.convert("RGB")).astype(np.float32) / 255)

    def sample(self, u, v):
        a = self.arr
        h, w, _ = a.shape
        if h == 1 and w == 1:
            return np.repeat(a[0, 0][None], len(u), 0)
        x = np.clip(u, 0, 1) * (w - 1)
        y = np.clip(v, 0, 1) * (h - 1)
        x0 = np.floor(x).astype(np.int32)
        y0 = np.floor(y).astype(np.int32)
        x1 = np.minimum(x0 + 1, w - 1)
        y1 = np.minimum(y0 + 1, h - 1)
        fx = (x - x0)[:, None]
        fy = (y - y0)[:, None]
        top = a[y0, x0] * (1 - fx) + a[y0, x1] * fx
        bot = a[y1, x0] * (1 - fx) + a[y1, x1] * fx
        return top * (1 - fy) + bot * fy


def rot_x(d):
    a = math.radians(d)
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], np.float32)


def rot_y(d):
    a = math.radians(d)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], np.float32)


def rot_z(d):
    a = math.radians(d)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], np.float32)


# ---------------------------------------------------------------- formas
class Box:
    """Caixa/embalagem/celular/livro. Faces: front, back, left, right, top, bottom."""

    def __init__(self, faces, size=None, color=None):
        front = faces.get("front")
        fim = Image.open(front) if isinstance(front, str) and not front.startswith("#") else None
        body = rgb(color) if color else (edge_color(fim) if fim else (220, 220, 220))
        if size is None:
            if fim:
                ar = fim.width / fim.height
                w, h = (1.0, 1.0 / ar) if ar >= 1 else (ar, 1.0)
                size = (w, h, 0.32 * max(w, h) if ar < 1.6 else 0.12)
            else:
                size = (0.8, 1.0, 0.35)
        self.half = np.array(size, np.float32) / 2
        self.tex = {k: Tex(faces.get(k), body) for k in ("front", "back", "left", "right", "top", "bottom")}
        if faces.get("back") is None and fim is not None and faces.get("mirror_back"):
            self.tex["back"] = Tex(fim.transpose(Image.FLIP_LEFT_RIGHT), body)
        self.radius = float(np.linalg.norm(self.half))
        self.foot = float(max(self.half[0], self.half[2]))
        self.bottom = float(self.half[1])
        self.has_back = faces.get("back") is not None or faces.get("mirror_back")

    def intersect(self, o, D):
        Dn = np.where(np.abs(D) < 1e-9, 1e-9, D)
        inv = 1.0 / Dn
        t1 = (-self.half - o) * inv
        t2 = (self.half - o) * inv
        tmin = np.minimum(t1, t2).max(1)
        tmax = np.maximum(t1, t2).min(1)
        hit = (tmax >= tmin) & (tmin > 0)
        return np.where(hit, tmin, np.inf)

    def surface(self, P):
        q = P / self.half
        n = len(q)
        ax = np.argmax(np.abs(q), 1)
        sg = np.sign(q[np.arange(n), ax])
        N = np.zeros_like(q)
        N[np.arange(n), ax] = sg
        alb = np.zeros_like(q)
        x, y, z = q[:, 0], q[:, 1], q[:, 2]
        spec = [
            ("front", (ax == 2) & (sg > 0), (x + 1) / 2, (1 - y) / 2),
            ("back", (ax == 2) & (sg < 0), (1 - x) / 2, (1 - y) / 2),
            ("right", (ax == 0) & (sg > 0), (1 - z) / 2, (1 - y) / 2),
            ("left", (ax == 0) & (sg < 0), (z + 1) / 2, (1 - y) / 2),
            ("top", (ax == 1) & (sg > 0), (x + 1) / 2, (z + 1) / 2),
            ("bottom", (ax == 1) & (sg < 0), (x + 1) / 2, (1 - z) / 2),
        ]
        for name, m, u, v in spec:
            if m.any():
                alb[m] = self.tex[name].sample(u[m], v[m])
        # arestas levemente iluminadas = sensação de cantos arredondados
        s = np.sort(np.abs(q), 1)[:, 1]
        edge = np.clip((s - 0.975) / 0.025, 0, 1)[:, None]
        alb = alb * (1 - 0.25 * edge) + 0.25 * edge * np.maximum(alb, 0.55)
        return N, alb


class Cylinder:
    """Lata, garrafa, pote, copo. Rótulo envolve a lateral (wrap = fração da volta coberta)."""

    def __init__(self, label=None, radius=None, height=None, color=None, cap=None, wrap=1.0, cap_color=None):
        lim = Image.open(label) if isinstance(label, str) and not label.startswith("#") else None
        body = rgb(color) if color else (edge_color(lim) if lim else (215, 215, 215))
        if radius is None or height is None:
            if lim:  # deduz proporção pelo rótulo: largura cobre `wrap` da circunferência
                ar = lim.width / lim.height
                h = 1.0
                r = ar * h * wrap / (2 * math.pi) if wrap > 0 else 0.3
                r = float(np.clip(r, 0.18, 0.9))
            else:
                r, h = 0.33, 1.0
            radius, height = radius or r, height or h
        self.r, self.h = float(radius), float(height) / 2
        self.wrap = float(wrap)
        self.side = Tex(label, body)
        self.body = Tex(body)
        cc = rgb(cap_color) if cap_color else body
        self.cap = Tex(cap, cc) if cap else Tex(cc)
        self.cap_back = self.cap
        self.radius = math.hypot(self.r, self.h)
        self.foot = self.r
        self.bottom = self.h

    def intersect(self, o, D):
        a = D[:, 0] ** 2 + D[:, 2] ** 2
        b = 2 * (o[0] * D[:, 0] + o[2] * D[:, 2])
        c = o[0] ** 2 + o[2] ** 2 - self.r ** 2
        disc = b * b - 4 * a * c
        ok = disc >= 0
        sq = np.sqrt(np.where(ok, disc, 0))
        a_s = np.where(a < 1e-12, 1e-12, a)
        ts = (-b - sq) / (2 * a_s)
        ys = o[1] + D[:, 1] * ts
        t_side = np.where(ok & (ts > 0) & (np.abs(ys) <= self.h), ts, np.inf)
        Dy = np.where(np.abs(D[:, 1]) < 1e-9, 1e-9, D[:, 1])
        res = [t_side]
        for yc in (self.h, -self.h):
            tc = (yc - o[1]) / Dy
            px = o[0] + D[:, 0] * tc
            pz = o[2] + D[:, 2] * tc
            res.append(np.where((tc > 0) & (px * px + pz * pz <= self.r ** 2), tc, np.inf))
        return np.minimum.reduce(res)

    def surface(self, P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        top = y >= self.h - 1e-4
        bot = y <= -self.h + 1e-4
        side = ~(top | bot)
        N = np.zeros_like(P)
        alb = np.zeros_like(P)
        if side.any():
            N[side] = np.stack([x[side], np.zeros(side.sum()), z[side]], 1) / self.r
            u = np.arctan2(x[side], z[side]) / (2 * math.pi) + 0.5
            u = (u - 0.5) / max(self.wrap, 1e-3) + 0.5
            v = (self.h - y[side]) / (2 * self.h)
            inside = (u >= 0) & (u <= 1)
            col = self.body.sample(u, v)
            if inside.any():
                col[inside] = self.side.sample(u[inside], v[inside])
            alb[side] = col
        for m, sgn, tex in ((top, 1, self.cap), (bot, -1, self.cap_back)):
            if m.any():
                N[m] = np.array([0, sgn, 0], np.float32)
                u = (sgn * x[m] / self.r + 1) / 2
                v = (z[m] / self.r + 1) / 2
                col = tex.sample(u, v)
                rr = np.sqrt(x[m] ** 2 + z[m] ** 2) / self.r  # borda da tampa mais clara (aro)
                rim = np.clip((rr - 0.9) / 0.1, 0, 1)[:, None]
                alb[m] = col * (1 - 0.4 * rim) + 0.4 * rim * np.maximum(col, 0.6)
        return N, alb


class Sphere:
    def __init__(self, texture=None, radius=0.5, color=None):
        self.r = float(radius)
        self.tex = Tex(texture, rgb(color) if color else (220, 220, 220))
        self.radius = self.r
        self.foot = self.r * 0.8
        self.bottom = self.r

    def intersect(self, o, D):
        b = 2 * (D @ o)
        c = float(o @ o) - self.r ** 2
        disc = b * b - 4 * c
        ok = disc >= 0
        t = (-b - np.sqrt(np.where(ok, disc, 0))) / 2
        return np.where(ok & (t > 0), t, np.inf)

    def surface(self, P):
        N = P / self.r
        u = np.arctan2(P[:, 0], P[:, 2]) / (2 * math.pi) + 0.5
        v = np.arccos(np.clip(P[:, 1] / self.r, -1, 1)) / math.pi
        return N, self.tex.sample(u, v)


def build_object(a):
    """Cria o objeto a partir de dicionário de opções (CLI ou product_ad)."""
    shape = a.get("shape", "box")
    gloss = a.get("gloss")
    pre = np.eye(3, dtype=np.float32)
    if shape in ("box", "card", "phone", "book"):
        size = a.get("size")
        if isinstance(size, str):
            size = [float(x) for x in size.split(",")]
        faces = {k: a.get(k) for k in ("front", "back", "left", "right", "top", "bottom")}
        faces["mirror_back"] = a.get("mirror_back", False)
        obj = Box(faces, size, a.get("color"))
        default_gloss = 0.35
        default_motion = "spin" if obj.has_back else "showcase"
    elif shape in ("cylinder", "can", "bottle", "jar"):
        r = h = None
        if a.get("size"):
            s = a["size"] if not isinstance(a["size"], str) else [float(x) for x in a["size"].split(",")]
            r, h = s[0], s[1]
        obj = Cylinder(a.get("label"), r, h, a.get("color"), a.get("cap"), float(a.get("wrap", 1.0)), a.get("cap_color"))
        default_gloss = 0.6
        default_motion = "spin" if float(a.get("wrap", 1.0)) >= 0.95 else "showcase"
    elif shape in ("coin", "badge", "logo"):
        obj = Cylinder(None, 0.5, float(a.get("thickness", 0.08)), a.get("color") or "#FFC83D", a.get("cap"), 1.0)
        obj.cap_back = obj.cap
        obj.foot = 0.28
        obj.bottom = 0.5
        pre = rot_x(90)
        default_gloss = 0.85
        default_motion = "spin"
    elif shape == "sphere":
        obj = Sphere(a.get("texture"), 0.5, a.get("color"))
        default_gloss = 0.7
        default_motion = "spin"
    else:
        raise SystemExit(f"forma desconhecida: {shape}")
    obj.pre = pre
    obj.gloss = float(gloss) if gloss is not None else default_gloss
    obj.default_motion = default_motion
    return obj


# ---------------------------------------------------------------- render
L_KEY = np.array([-0.45, 0.65, 0.85], np.float32)
L_KEY /= np.linalg.norm(L_KEY)
L_FILL = np.array([0.85, 0.15, 0.5], np.float32)
L_FILL /= np.linalg.norm(L_FILL)
L_RIM = np.array([0.55, 0.45, -0.9], np.float32)
L_RIM /= np.linalg.norm(L_RIM)


def shade(alb, N, V, gloss, rim_color):
    ndl = np.clip(N @ L_KEY, 0, 1)[:, None]
    ndf = np.clip(N @ L_FILL, 0, 1)[:, None]
    ndv = np.clip(np.sum(N * V, 1), 0, 1)[:, None]
    diff = 0.30 + 0.80 * ndl + 0.22 * ndf
    H = L_KEY + V
    H /= np.linalg.norm(H, axis=1, keepdims=True)
    shin = 20 + 180 * gloss
    spec = (np.clip(np.sum(N * H, 1), 0, 1) ** shin)[:, None] * (0.15 + 0.9 * gloss)
    R = 2 * ndv * N - V  # reflexo: estúdio com teto claro e chão escuro
    env = 0.04 + 0.85 * np.clip((R[:, 1:2] + 0.15) / 1.15, 0, 1) ** 1.5
    fres = (1 - ndv) ** 4
    refl = fres * gloss * 0.55 * env + gloss * 0.06 * env
    rim = (np.clip(N @ L_RIM, 0, 1) ** 2)[:, None] * 0.55 * np.array(rim_color, np.float32)
    return alb * diff + spec + refl + rim


def render_frame(obj, W, H, yaw=0.0, tilt=14.0, roll=0.0, bob=0.0, scale=1.0, ss=2, fov=26,
                 shadow=True, rim_color=(1.0, 1.0, 1.0), fill=0.70):
    """Renderiza um quadro RGBA (PIL) do objeto."""
    R = rot_x(tilt) @ rot_z(roll) @ rot_y(yaw) @ obj.pre
    rad = obj.radius
    tanf = math.tan(math.radians(fov) / 2)
    dist = rad / (fill * tanf) + rad * 0.2
    cam = np.array([0, 0, dist], np.float32)
    center = np.array([0, rad * 0.10 + bob * rad, 0], np.float32)

    Ws, Hs = int(round(W * ss)), int(round(H * ss))
    m = min(Ws, Hs) / 2
    # limita os raios ao círculo onde o objeto pode estar (bem mais rápido)
    pr = rad * scale / math.sqrt(max(dist ** 2 - (rad * scale) ** 2, 1e-6)) / tanf * 1.04
    cy_n = center[1] / dist / tanf
    x0 = int(max(0, Ws / 2 - pr * m))
    x1 = int(min(Ws, Ws / 2 + pr * m + 1))
    y0 = int(max(0, Hs / 2 - (cy_n + pr) * m))
    y1 = int(min(Hs, Hs / 2 - (cy_n - pr) * m + 1))
    col = np.zeros((Hs, Ws, 3), np.float32)
    alpha = np.zeros((Hs, Ws), np.float32)
    if x1 > x0 and y1 > y0:
        yy, xx = np.mgrid[y0:y1, x0:x1]
        nx = (xx + 0.5 - Ws / 2) / m
        ny = -(yy + 0.5 - Hs / 2) / m
        sel = (nx ** 2 + (ny - cy_n) ** 2) <= pr ** 2
        nx, ny, yy, xx = nx[sel], ny[sel], yy[sel], xx[sel]
        D = np.stack([nx * tanf, ny * tanf, -np.ones_like(nx)], 1).astype(np.float32)
        D /= np.linalg.norm(D, axis=1, keepdims=True)
        o_obj = ((cam - center) / scale) @ R
        D_obj = D @ R
        t = obj.intersect(o_obj, D_obj)
        hit = np.isfinite(t)
        if hit.any():
            P = o_obj + D_obj[hit] * t[hit, None]
            N_obj, alb = obj.surface(P)
            N = N_obj @ R.T
            V = -D[hit]
            c = shade(alb, N, V, obj.gloss, rim_color)
            col[yy[hit], xx[hit]] = to_srgb(c)
            alpha[yy[hit], xx[hit]] = 1.0
    # supersampling -> antialias
    if float(ss).is_integer():
        k = int(ss)
        col = (col * alpha[..., None]).reshape(H, k, W, k, 3).mean((1, 3))
        alpha = alpha.reshape(H, k, W, k).mean((1, 3))
    else:  # ss fracionário: reduz com Lanczos em alfa pré-multiplicado
        pm = np.dstack([col * alpha[..., None], alpha])
        chans = [np.asarray(Image.fromarray(pm[..., c].astype(np.float32), "F").resize((W, H), Image.LANCZOS)) for c in range(4)]
        col = np.dstack(chans[:3])
        alpha = np.clip(chans[3], 0, 1)
    rgbv = np.where(alpha[..., None] > 1e-4, col / np.maximum(alpha[..., None], 1e-4), 0)

    if shadow:
        sh = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(sh)
        mm = min(W, H) / 2
        floor_y = rad * 0.10 - obj.bottom * scale - rad * 0.02  # chão logo abaixo da base (sem o bob)
        fy = H / 2 - floor_y / dist / tanf * mm
        sw = obj.foot * scale / dist / tanf * mm * 1.25
        lift = max(0.0, bob)
        sw *= 1 - 0.25 * lift
        shh = max(4, sw * 0.17)
        op = int(150 * (1 - 0.5 * lift))
        d.ellipse((W / 2 - sw, fy - shh, W / 2 + sw, fy + shh), fill=op)
        sh = sh.filter(ImageFilter.GaussianBlur(max(2, sw * 0.12)))
        sa = np.asarray(sh).astype(np.float32) / 255
        out_a = alpha + sa * (1 - alpha)
        rgbv = rgbv * (alpha / np.maximum(out_a, 1e-4))[..., None]
        alpha = out_a
    arr = np.dstack([np.clip(rgbv, 0, 1) * 255, alpha * 255]).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def motion_at(mode, t, start_yaw=0.0, amp=38.0):
    """t em 0..1 (fração do clipe). Retorna (yaw, escala, bob)."""
    bob = 0.035 * math.sin(2 * math.pi * t)
    if mode == "spin":
        return start_yaw + 360 * t, 1.0, bob
    if mode == "showcase":  # balança mostrando frente e laterais (ideal se só há arte da frente)
        return start_yaw + amp * math.sin(2 * math.pi * t), 1.0, bob
    if mode == "reveal":  # entra girando e crescendo, depois balança suave
        k = ease_out_cubic(min(1, t / 0.4))
        yaw = -200 * (1 - k) + 18 * math.sin(2 * math.pi * max(0, t - 0.4) / 0.6)
        return start_yaw + yaw, 0.55 + 0.45 * k, bob * k
    if mode == "turntable":  # giro lento de vitrine
        return start_yaw + 120 * ease_in_out(t) - 60, 1.0, bob * 0.5
    if mode == "static":
        return start_yaw, 1.0, 0.0
    raise SystemExit(f"movimento desconhecido: {mode}")


def render_sequence(obj, n, W, H, motion=None, tilt=14.0, ss=2, start_yaw=0.0, shadow=True, fill=0.70, rim_color=(1, 1, 1)):
    motion = motion or obj.default_motion
    for i in range(n):
        yaw, sc, bob = motion_at(motion, i / n, start_yaw)
        yield render_frame(obj, W, H, yaw=yaw, tilt=tilt, bob=bob, scale=sc, ss=ss, shadow=shadow, fill=fill,
                           rim_color=rim_color)


# ---------------------------------------------------------------- paralelo
_WORKER = {}


def _init_worker(opts):
    _WORKER["obj"] = build_object(opts)


def _render_job(job):
    i, path, kw = job
    render_frame(_WORKER["obj"], **kw).save(path, compress_level=1)
    return i


def render_parallel(opts, jobs, procs=None):
    """jobs = [(indice, caminho_png, kwargs_de_render_frame)]. Usa todos os núcleos."""
    procs = procs or max(1, os.cpu_count() or 1)
    if procs == 1 or len(jobs) < 4:
        _init_worker(opts)
        for j in jobs:
            _render_job(j)
        return
    import multiprocessing as mp
    ctx = mp.get_context("fork" if sys.platform.startswith("linux") else "spawn")
    with ctx.Pool(procs, initializer=_init_worker, initargs=(opts,)) as pool:
        for _ in pool.imap_unordered(_render_job, jobs, chunksize=2):
            pass


def sequence_jobs(obj, n, W, H, motion, tilt, ss, start_yaw, shadow, fill, outdir, turns=1.0):
    jobs = []
    for i in range(n):
        yaw, sc, bob = motion_at(motion, i / n * turns, start_yaw)
        jobs.append((i, os.path.join(outdir, f"f_{i:05d}.png"),
                     dict(W=W, H=H, yaw=yaw, tilt=tilt, bob=bob, scale=sc, ss=ss, shadow=shadow, fill=fill)))
    return jobs


def write_video(frames, out, W, H, fps, bg=None):
    ext = os.path.splitext(out)[1].lower()
    if ext == "" or os.path.isdir(out):
        os.makedirs(out, exist_ok=True)
        for i, f in enumerate(frames):
            f.save(os.path.join(out, f"frame_{i:04d}.png"))
        return
    if ext == ".mov":
        codec = ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0"]
    elif ext == ".webm":
        codec = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "24", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4"]
    elif ext == ".gif":
        codec = ["-vf", "split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse", "-loop", "0"]
    else:
        codec = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart"]
    cmd = [ffmpeg_bin(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}",
           "-r", str(fps), "-i", "-"] + codec + [out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    base = None
    if ext in (".mp4", ".m4v"):
        if bg and os.path.exists(bg):
            from common import cover
            base = cover(Image.open(bg).convert("RGBA"), W, H)
        else:
            c = bg or "#1b1b1f"
            base = gradient(W, H, c, tuple(int(x * 0.45) for x in rgb(c)), 90)
    for f in frames:
        if base is not None:
            fr = base.copy()
            fr.alpha_composite(f)
            f = fr
        p.stdin.write(f.tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit("ffmpeg falhou ao gravar o vídeo 3D")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--shape", default="box", help="box | cylinder | coin | sphere")
    for f in ("front", "back", "left", "right", "top", "bottom"):
        ap.add_argument(f"--{f}", help=f"imagem ou #cor da face {f} (box)")
    ap.add_argument("--mirror-back", action="store_true", help="box: repete a frente espelhada atrás")
    ap.add_argument("--label", help="cylinder: imagem do rótulo")
    ap.add_argument("--wrap", type=float, default=1.0, help="cylinder: fração da volta coberta pelo rótulo (0.5 = só a frente)")
    ap.add_argument("--cap", help="imagem da tampa (cylinder) ou face da moeda/logo (coin)")
    ap.add_argument("--cap-color")
    ap.add_argument("--texture", help="sphere: textura equiretangular")
    ap.add_argument("--size", help="box: L,A,P  |  cylinder: raio,altura")
    ap.add_argument("--thickness", type=float, default=0.08, help="coin: espessura")
    ap.add_argument("--color", help="cor do corpo (#hex)")
    ap.add_argument("--gloss", type=float, help="0 fosco … 1 brilhante")
    ap.add_argument("--motion", help="spin | showcase | reveal | turntable | static")
    ap.add_argument("--tilt", type=float, default=14, help="inclinação para mostrar o topo (graus)")
    ap.add_argument("--yaw", type=float, default=0, help="ângulo inicial")
    ap.add_argument("--seconds", type=float, default=4)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--res", type=int, default=1080, help="lado do quadro quadrado (ou use --wh)")
    ap.add_argument("--wh", help="LxA, ex 1080x1920")
    ap.add_argument("--ss", type=float, default=2, help="supersampling (2 = bom, 1 = rápido)")
    ap.add_argument("--fill", type=float, default=0.70, help="quanto do quadro o objeto ocupa")
    ap.add_argument("--no-shadow", action="store_true")
    ap.add_argument("--bg", help="fundo para .mp4 (#cor ou imagem)")
    ap.add_argument("--out", default="objeto3d.mov")
    ap.add_argument("--preview", help="salva só um quadro PNG (rápido) e sai")
    a = ap.parse_args()

    opts = {k: v for k, v in vars(a).items() if v is not None}
    opts["mirror_back"] = a.mirror_back
    obj = build_object(opts)
    W, H = (a.res, a.res) if not a.wh else tuple(int(x) for x in a.wh.lower().split("x"))
    motion = a.motion or obj.default_motion
    if a.preview:
        yaw, sc, bob = motion_at(motion if motion != "reveal" else "showcase", 0.12, a.yaw)
        render_frame(obj, W, H, yaw=yaw + (25 if motion == "spin" else 0), tilt=a.tilt, bob=bob, scale=sc,
                     ss=a.ss, shadow=not a.no_shadow, fill=a.fill).save(a.preview)
        print(a.preview)
        return
    n = int(round(a.seconds * a.fps))
    import tempfile
    tmp = tempfile.mkdtemp(prefix="r3d_")
    jobs = sequence_jobs(obj, n, W, H, motion, a.tilt, a.ss, a.yaw, not a.no_shadow, a.fill, tmp)
    render_parallel(opts, jobs)
    frames = (Image.open(j[1]).convert("RGBA") for j in jobs)
    write_video(frames, a.out, W, H, a.fps, a.bg)
    print(f"{a.out}  ({n} quadros, {W}x{H}, movimento={motion})")


if __name__ == "__main__":
    main()
