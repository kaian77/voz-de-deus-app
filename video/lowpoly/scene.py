"""Monta o vídeo 3D inteiro numa cena do Blender a partir do plano (JSON) e renderiza um pedaço dos quadros.

Uso: python scene.py plano.json pasta_saida primeiro_quadro ultimo_quadro [largura altura]

Plano: {"fps": 24, "scenes": [{"start": s, "dur": s, "set": "...", "objects": [...], "anim": [...], "camera": {...}}]}
- set: studio | kitchen | sky | runway | city | space (cenário + cor do céu)
- objects: {"id", "kind" (props.KINDS), "pos" [x,y,z], "rot" [graus], "scale", "color"}
- anim: {"id", "do": move|rotate|spin|pop|grow|bob|flow|xray|shake, "to", "axis", "speed", "at", "end", "count"}
  (at/end = fração da cena, 0 a 1)
- camera: {"pos", "look", "move": static|push|pull|orbit|pan|follow, "follow": id, "lens"}
Cada cena só aparece no seu intervalo de tempo (visibilidade com keyframe), então tudo convive na mesma cena.
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import kit  # noqa: E402
import props  # noqa: E402

SKY = {"studio": (0.95, 0.93, 0.90), "kitchen": (0.95, 0.93, 0.90), "sky": (0.55, 0.76, 0.97), "runway": (0.58, 0.78, 0.97),
       "city": (0.62, 0.80, 0.96), "space": (0.03, 0.04, 0.10)}


def _new_objects(before):
    return [o for o in bpy.data.objects if o not in before]


def build_set(kind, seed):
    rng = random.Random(seed)
    if kind == "kitchen":
        kit.kitchen()
    elif kind in ("studio",):
        kit.box("st_floor", (60, 60, 0.2), (0, 0, -0.1), kit.mat("floor"), 0)
        kit.box("st_wall", (60, 0.2, 30), (0, 14, 15), kit.mat("wall"), 0)
    elif kind in ("runway", "city"):
        kit.box("gr", (400, 400, 0.2), (0, 0, -0.1), kit.mat("grass", rough=0.9), 0)
        if kind == "runway":
            props.make("runway", "set_runway")
        else:
            kit.box("road", (400, 5, 0.05), (0, -4, 0.02), kit.mat("asphalt", rough=0.8), 0)
            for i in range(8):
                h = props.make("house", f"set_house{i}", rng.choice(["white", "wall", "tile", "pink"]))
                h.location = (-28 + i * 8, 6 + rng.random() * 2, 0)
        for i in range(24):
            t = props.make("tree", f"set_tree{i}")
            a = rng.random() * 2 * math.pi
            r = 18 + rng.random() * 40
            t.location = (math.cos(a) * r, abs(math.sin(a)) * r + 8, 0)
            t.scale = (1 + rng.random(),) * 3
    if kind in ("sky", "runway", "city"):
        for i in range(10 if kind == "sky" else 6):
            c = props.make("cloud", f"set_cloud{i}")
            a = rng.random() * 2 * math.pi
            r = 30 + rng.random() * 30
            # Sempre atrás da cena (y > 25), longe da câmera
            c.location = (math.cos(a) * r, 25 + abs(math.sin(a)) * r, (rng.random() * 16 - 6) if kind == "sky" else 18 + rng.random() * 10)
            c.scale = (2 + rng.random() * 2,) * 3
    if kind == "space":
        m = kit.mat("white", emit=8)
        for i in range(120):
            a, b = rng.random() * 2 * math.pi, rng.random() * math.pi - math.pi / 2
            kit.ico(f"star{i}", 0.15, (math.cos(a) * math.cos(b) * 90, math.sin(a) * math.cos(b) * 90, math.sin(b) * 90), m, 0)


def _key_vis(objs, f0, f1):
    """Objeto só renderiza entre f0 e f1."""
    for o in objs:
        if o.type == "EMPTY":
            continue
        for f, hide in ((0, True), (f0, False), (f1, True)):
            o.hide_render = hide
            o.keyframe_insert("hide_render", frame=max(0, f))
        if o.animation_data and o.animation_data.action:
            for fc in o.animation_data.action.fcurves:
                if fc.data_path == "hide_render":
                    for k in fc.keyframe_points:
                        k.interpolation = "CONSTANT"


def _vec(v, default=(0, 0, 0)):
    v = list(v or default) + [0, 0, 0]
    return tuple(float(x) for x in v[:3])


def _set_interp(ob, path, mode):
    if ob.animation_data and ob.animation_data.action:
        for fc in ob.animation_data.action.fcurves:
            if fc.data_path == path:
                for k in fc.keyframe_points:
                    k.interpolation = mode


def _hold(ob, path, frame):
    """Keyframe que segura o valor atual (para a animação começar no ponto certo)."""
    ob.keyframe_insert(path, frame=frame)


def animate(root, a, f0, f1, fps, extra):
    do = a.get("do")
    n = f1 - f0
    s = f0 + int(n * float(a.get("at", 0)))
    e = f0 + max(1, int(n * float(a.get("end", 1))))
    if do == "move":
        _hold(root, "location", s)
        root.location = _vec(a.get("to"), root.location)
        root.keyframe_insert("location", frame=e)
    elif do == "rotate":
        _hold(root, "rotation_euler", s)
        root.rotation_euler = tuple(math.radians(x) for x in _vec(a.get("to")))
        root.keyframe_insert("rotation_euler", frame=e)
    elif do == "spin":
        axis = "xyz".index(a.get("axis", "z")) if a.get("axis", "z") in "xyz" else 2
        speed = float(a.get("speed", 0.5))  # voltas por segundo
        _hold(root, "rotation_euler", s)
        r = list(root.rotation_euler)
        r[axis] += speed * 2 * math.pi * (e - s) / fps
        root.rotation_euler = r
        root.keyframe_insert("rotation_euler", frame=e)
        _set_interp(root, "rotation_euler", "LINEAR")
    elif do in ("pop", "grow"):
        full = tuple(root.scale)
        root.scale = (0.001,) * 3 if do == "pop" else (full[0], full[1], 0.001) if a.get("axis", "z") == "z" else (0.001, full[1], full[2])
        root.keyframe_insert("scale", frame=s)
        if do == "pop":
            root.scale = tuple(x * 1.12 for x in full)
            root.keyframe_insert("scale", frame=s + max(2, int(0.25 * fps)))
        root.scale = full
        root.keyframe_insert("scale", frame=s + max(3, int(0.4 * fps)) if do == "pop" else e)
    elif do == "bob":
        base = tuple(root.location)
        step = max(2, int(fps * 0.6))
        for k, f in enumerate(range(s, e + 1, step)):
            root.location = (base[0], base[1], base[2] + (0.15 if k % 2 else -0.15) * float(a.get("speed", 1)))
            root.keyframe_insert("location", frame=f)
    elif do == "shake":
        base = tuple(root.location)
        for f in range(s, e + 1, 2):
            root.location = (base[0] + random.uniform(-0.05, 0.05), base[1], base[2] + random.uniform(-0.05, 0.05))
            root.keyframe_insert("location", frame=f)
        root.location = base
        root.keyframe_insert("location", frame=e + 1)
    elif do == "flow":
        # Cópias do objeto andando de pos até pos+to, em loop (fluxo de ar, pulso de luz, corrente)
        count = int(a.get("count", 4))
        d = _vec(a.get("to"), (4, 0, 0))
        period = max(6, int(fps * float(a.get("period", 1.2))))
        start = tuple(root.location)
        copies = [root] + [extra["dup"](root) for _ in range(count - 1)]
        for ci, ob in enumerate(copies):
            phase = int(period * ci / count)
            f = s - phase
            while f < e:
                # Termina 1 quadro antes do próximo ciclo (o próximo começa no ponto de partida: salto)
                a0, a1 = max(f, s), min(f + period - 1, e)
                for fr, k in ((a0, (a0 - f) / period), (a1, (a1 - f) / period)):
                    ob.location = tuple(start[i] + d[i] * k for i in range(3))
                    ob.keyframe_insert("location", frame=fr)
                f += period
            _set_interp(ob, "location", "LINEAR")
            for fc in ob.animation_data.action.fcurves:
                pts = sorted(fc.keyframe_points, key=lambda k: k.co[0])
                for k1, k2 in zip(pts, pts[1:]):
                    if k2.co[0] - k1.co[0] < 1.5:  # salto de volta ao começo
                        k1.interpolation = "CONSTANT"
            # Antes de entrar no fluxo e depois dele: fica parado onde estava
            ob.location = start
        extra["new"].extend(copies[1:])
    elif do == "xray":
        # Fica transparente (para ver por dentro)
        for ob in [root] + list(root.children_recursive):
            if ob.type != "MESH":
                continue
            for i, m in enumerate(ob.data.materials):
                m2 = m.copy()
                m2.blend_method = "BLEND"
                ob.data.materials[i] = m2
                b = m2.node_tree.nodes["Principled BSDF"].inputs["Alpha"]
                b.default_value = 1.0
                b.keyframe_insert("default_value", frame=s)
                b.default_value = float(a.get("alpha", 0.2))
                b.keyframe_insert("default_value", frame=s + max(2, int(0.5 * fps)))


def _duplicate(root):
    new = root.copy()
    bpy.context.scene.collection.objects.link(new)
    for ch in root.children:
        c = ch.copy()
        c.data = ch.data
        bpy.context.scene.collection.objects.link(c)
        c.parent = new
    return new


def build(plan, w, h):
    kit.clear()
    fps = int(plan.get("fps", 24))
    cam, target = kit.setup(w, h, fps=fps, samples=int(plan.get("samples", 2)))
    sc = bpy.context.scene
    sc.cycles.max_bounces = 3
    sc.cycles.diffuse_bounces = 1
    sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 3
    sc.cycles.transparent_max_bounces = 6
    sc.cycles.denoising_prefilter = "FAST"
    sc.render.use_persistent_data = True
    bg = sc.world.node_tree.nodes["Background"].inputs["Color"]
    scenes = plan["scenes"]
    for i, s in enumerate(scenes):
        f0 = int(round(s["start"] * fps)) + 1
        f1 = int(round((s["start"] + s["dur"]) * fps)) + 1
        before = set(bpy.data.objects)
        build_set(s.get("set") or "studio", i)
        roots = {}
        for j, o in enumerate(s.get("objects") or []):
            root = props.make(o.get("kind", "box"), f"s{i}_{o.get('id', j)}", o.get("color"))
            root.location = _vec(o.get("pos"))
            root.rotation_euler = tuple(math.radians(x) for x in _vec(o.get("rot")))
            sz = o.get("scale", 1)
            root.scale = tuple(_vec(sz)) if isinstance(sz, list) else (float(sz),) * 3
            roots[o.get("id", str(j))] = root
        extra = {"dup": _duplicate, "new": []}
        starts = {k: tuple(r.location) for k, r in roots.items()}
        for a in s.get("anim") or []:
            if a.get("id") in roots:
                animate(roots[a["id"]], a, f0, f1, fps, extra)
        _key_vis(_new_objects(before), f0, f1)

        # Céu da cena
        bg.default_value = (*kit.srgb(SKY.get(s.get("set"), SKY["studio"])), 1)
        bg.keyframe_insert("default_value", frame=f0)

        # Câmera
        c = s.get("camera") or {}
        pos, look = _vec(c.get("pos"), (0, -12, 5)), _vec(c.get("look"), (0, 0, 1))
        move = c.get("move", "push")
        cam.data.lens = float(c.get("lens", 35))
        cam.data.keyframe_insert("lens", frame=f0)
        keys = []
        if move == "follow" and c.get("follow") in roots:
            ob = roots[c["follow"]]
            p0 = starts[c["follow"]]
            off = tuple(pos[k] - p0[k] for k in range(3))
            loff = tuple(look[k] - p0[k] for k in range(3))
            n = 6
            for k in range(n + 1):
                fr = f0 + int((f1 - 1 - f0) * k / n)
                sc.frame_set(fr)
                p = ob.matrix_world.translation
                keys.append((fr, tuple(p[q] + off[q] for q in range(3)), tuple(p[q] + loff[q] for q in range(3))))
        elif move == "orbit":
            ang = math.radians(float(c.get("angle", 40)))
            dx, dy = pos[0] - look[0], pos[1] - look[1]
            for k in range(7):
                t = k / 6
                a = ang * (t - 0.5)
                p = (look[0] + dx * math.cos(a) - dy * math.sin(a), look[1] + dx * math.sin(a) + dy * math.cos(a), pos[2])
                keys.append((f0 + int((f1 - 1 - f0) * t), p, look))
        else:
            k = {"push": 0.22, "pull": -0.22}.get(move, 0)
            end = tuple(pos[q] + (look[q] - pos[q]) * k for q in range(3))
            lend = look
            if move == "pan":
                side = 0.18 * math.dist(pos, look)
                end = (pos[0] + side, pos[1], pos[2])
                lend = (look[0] + side, look[1], look[2])
            keys = [(f0, pos, look), (f1 - 1, end, lend)]
        for fr, p, lk in keys:
            cam.location = p
            target.location = lk
            cam.keyframe_insert("location", frame=fr)
            target.keyframe_insert("location", frame=fr)
    # Corte seco entre cenas: o último keyframe de cada cena segura até a próxima
    for ob in (cam, target):
        for fc in ob.animation_data.action.fcurves:
            pts = sorted(fc.keyframe_points, key=lambda k: k.co[0])
            for k1, k2 in zip(pts, pts[1:]):
                if k2.co[0] - k1.co[0] <= 1.5:
                    k1.interpolation = "CONSTANT"
    for fc in sc.world.node_tree.animation_data.action.fcurves:
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"
    for fc in cam.data.animation_data.action.fcurves:
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"
    total = scenes[-1]["start"] + scenes[-1]["dur"]
    sc.frame_start, sc.frame_end = 1, int(round(total * fps))
    return sc


def main():
    plan_path, out, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    w, h = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (540, 960)
    with open(plan_path) as f:
        plan = json.load(f)
    sc = build(plan, w, h)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 92
    os.makedirs(out, exist_ok=True)
    sc.frame_start, sc.frame_end = max(1, a), min(b, sc.frame_end)
    sc.render.filepath = os.path.join(out, "f")
    bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
