"""Biblioteca de objetos 3D low poly para os vídeos explicativos em 3D. Cada objeto é montado com formas simples
em volta da origem, debaixo de um "root" (Empty) que recebe posição, giro, escala e animação.

A IA escolhe os objetos pelo nome (`KINDS`) e pode completar com formas básicas (box, cylinder, sphere, cone,
torus, arrow). Medidas em metros "de desenho": uma pessoa tem ~1,8; o avião ~12 de comprimento."""
import math

import bpy

from kit import PALETTE, box, cone, cyl, ico, mat


def _root(name):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    return root


def _adopt(root, objs):
    for o in objs:
        if o is not None and o.parent is None:
            o.parent = root
    return root


def _c(color, default):
    """Cor pedida pela IA (nome da paleta) ou a padrão do objeto."""
    return color if color in PALETTE else default


def _tube(name, a, b, r, material, verts=10):
    """Cilindro de a até b."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz) or 0.001
    ob = cyl(name, r, length, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), material, verts)
    ob.rotation_mode = "QUATERNION"
    from mathutils import Vector

    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)).normalized())
    return ob


def _profile(name, pts, depth, material, axis="y"):
    """Prisma a partir de um perfil 2D (x, z) estendido no eixo y (ex.: corte da asa)."""
    mesh = bpy.data.meshes.new(name)
    n = len(pts)
    h = depth / 2
    verts = [(x, -h, z) for x, z in pts] + [(x, h, z) for x, z in pts]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(material)
    return ob


# ------------------------------------------------------------------------------------------------ objetos

def airplane(name, color=None):
    """Avião comercial branco (nariz para +x), ~12 de comprimento, envergadura ~11."""
    body = mat(_c(color, "white"), rough=0.35)
    parts = [
        cyl(f"{name}_fus", 0.8, 9.0, (0, 0, 0), body, 16, rot=(0, math.pi / 2, 0)),
        cone(f"{name}_nose", 0.8, 1.6, (5.3, 0, 0), body, 16),
        cone(f"{name}_tail", 0.8, 2.4, (-5.7, 0, 0.25), body, 16),
        box(f"{name}_wing", (2.4, 11.0, 0.18), (0.3, 0, -0.35), body, 0.06),
        box(f"{name}_stab", (1.2, 4.2, 0.12), (-6.0, 0, 0.45), body, 0.04),
        box(f"{name}_fin", (1.8, 0.14, 2.2), (-6.0, 0, 1.4), mat(_c(None, "navy"), rough=0.4), 0.05),
    ]
    parts[1].rotation_euler = (0, -math.pi / 2, 0)
    parts[2].rotation_euler = (0, math.pi / 2, 0)
    for side in (-1, 1):
        parts.append(cyl(f"{name}_eng{side}", 0.42, 1.6, (0.9, side * 2.6, -0.85), mat("gray", rough=0.4, metal=0.4), 14, rot=(0, math.pi / 2, 0)))
        parts.append(cyl(f"{name}_engin{side}", 0.3, 0.05, (1.72, side * 2.6, -0.85), mat("dark"), 14, rot=(0, math.pi / 2, 0)))
    for i in range(12):  # janelas
        for side in (-1, 1):
            parts.append(box(f"{name}_win{i}{side}", (0.22, 0.04, 0.22), (3.4 - i * 0.6, side * 0.79, 0.25), mat("dark", rough=0.2), 0.02))
    parts.append(box(f"{name}_cockpit", (0.5, 1.2, 0.25), (4.9, 0, 0.35), mat("dark", rough=0.2), 0.05))
    return parts


def wing_section(name, color=None):
    """Corte da asa (perfil aerodinâmico) visto de lado: bordo de ataque em -x, ~4 de corda."""
    pts = []
    for i in range(24):
        t = i / 23
        x = 2 - 4 * t
        top = 0.55 * math.sin(math.pi * (t ** 0.6)) * (1 - t * 0.2)
        pts.append((x, top))
    for i in range(1, 23):
        t = 1 - i / 23
        x = 2 - 4 * t
        bot = -0.12 * math.sin(math.pi * (t ** 0.6))
        pts.append((x, bot))
    pts = [(-x, z) for x, z in pts]
    return [_profile(f"{name}_air", pts, 2.5, mat(_c(color, "gray"), rough=0.35, metal=0.3))]


def cloud(name, color=None):
    m = mat(_c(color, "cloud"), rough=0.9)
    return [ico(f"{name}_{i}", r, p, m, 2) for i, (r, p) in enumerate([(1.0, (0, 0, 0)), (0.8, (1.1, 0.2, -0.15)), (0.75, (-1.0, -0.1, -0.2)), (0.6, (0.4, -0.5, 0.4))])]


def arrow(name, color=None):
    """Seta de 2 de comprimento apontando para +x."""
    m = mat(_c(color, "yellow"), rough=0.4, emit=0.3)
    return [cyl(f"{name}_shaft", 0.09, 1.4, (-0.3, 0, 0), m, 10, rot=(0, math.pi / 2, 0)),
            _cone_x(f"{name}_head", 0.25, 0.6, (0.7, 0, 0), m)]


def _cone_x(name, r, depth, loc, m):
    ob = cone(name, r, depth, loc, m, 12)
    ob.rotation_euler = (0, math.pi / 2, 0)
    return ob


def runway(name, color=None):
    parts = [box(f"{name}_strip", (60, 6, 0.06), (0, 0, 0.03), mat("asphalt", rough=0.8), 0)]
    for i in range(14):
        parts.append(box(f"{name}_dash{i}", (2.0, 0.25, 0.02), (-26 + i * 4, 0, 0.07), mat("white"), 0))
    return parts


def tree(name, color=None):
    return [cyl(f"{name}_trunk", 0.15, 1.2, (0, 0, 0.6), mat("brown"), 8),
            cone(f"{name}_top", 0.9, 2.2, (0, 0, 2.2), mat(_c(color, "green"), rough=0.8), 7)]


def house(name, color=None):
    parts = [box(f"{name}_walls", (3.0, 2.6, 2.2), (0, 0, 1.1), mat(_c(color, "white"), rough=0.6), 0.05),
             box(f"{name}_door", (0.7, 0.05, 1.3), (0.5, -1.31, 0.65), mat("brown"), 0.02),
             box(f"{name}_win", (0.7, 0.05, 0.6), (-0.7, -1.31, 1.4), mat("sky", rough=0.2), 0.02)]
    roof = cone(f"{name}_roof", 2.4, 1.4, (0, 0, 2.9), mat("red", rough=0.6), 4)
    roof.rotation_euler = (0, 0, math.pi / 4)
    roof.scale = (1.0, 0.85, 1)
    parts.append(roof)
    return parts


def person(name, color=None):
    shirt = mat(_c(color, "purple"), rough=0.7)
    return [cyl(f"{name}_legs", 0.22, 0.9, (0, 0, 0.45), mat("navy"), 10),
            cyl(f"{name}_body", 0.3, 0.7, (0, 0, 1.25), shirt, 10),
            ico(f"{name}_head", 0.22, (0, 0, 1.85), mat("skin", rough=0.7), 2)]


def train(name, color=None):
    """Locomotiva + 1 vagão sobre os trilhos (frente para +x), rodas sobre z=0.35."""
    c = mat(_c(color, "red"), rough=0.45)
    parts = [box(f"{name}_loco", (5.0, 2.2, 2.4), (3.0, 0, 1.75), c, 0.15),
             box(f"{name}_cab", (1.4, 2.0, 0.9), (1.3, 0, 3.35), c, 0.1),
             box(f"{name}_window", (0.05, 1.6, 0.6), (5.53, 0, 2.3), mat("sky", rough=0.2), 0.02),
             box(f"{name}_wagon", (5.6, 2.2, 2.2), (-3.0, 0, 1.65), mat("gray", rough=0.5), 0.15),
             box(f"{name}_stripe", (10.8, 2.25, 0.2), (0, 0, 1.3), mat("yellow"), 0.02)]
    for x in (1.2, 4.6, -1.0, -5.0):
        for side in (-1, 1):
            parts.append(cyl(f"{name}_wheel{x}{side}", 0.35, 0.15, (x, side * 0.75, 0.35), mat("dark", rough=0.4, metal=0.5), 14, rot=(math.pi / 2, 0, 0)))
    return parts


def track(name, color=None):
    """Trilhos ao longo de x (60 de comprimento), bitola 1,5."""
    parts = []
    for side in (-1, 1):
        parts.append(box(f"{name}_rail{side}", (60, 0.12, 0.16), (0, side * 0.75, 0.2), mat("gray", rough=0.3, metal=0.8), 0.01))
    for i in range(40):
        parts.append(box(f"{name}_sleeper{i}", (0.3, 2.4, 0.12), (-29 + i * 1.5, 0, 0.06), mat("brown", rough=0.8), 0.02))
    return parts


def wheelset(name, color=None):
    """Eixo com duas rodas cônicas e frisos (o segredo do trem não sair do trilho), bitola 1,5, sobre os trilhos."""
    m = mat(_c(color, "gray"), rough=0.3, metal=0.7)
    parts = [_tube(f"{name}_axle", (0, -0.95, 0.45), (0, 0.95, 0.45), 0.07, m)]
    for side in (-1, 1):
        w = bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.45, radius2=0.38, depth=0.2, location=(0, side * 0.7, 0.45),
                                            rotation=(math.pi / 2 * side, 0, 0))
        ob = bpy.context.object
        ob.name = f"{name}_wheel{side}"
        ob.data.materials.append(m)
        parts.append(ob)
        parts.append(cyl(f"{name}_flange{side}", 0.53, 0.05, (0, side * 0.58, 0.45), mat("red", rough=0.4), 24, rot=(math.pi / 2, 0, 0)))
    return parts


def pole(name, color=None):
    m = mat(_c(color, "brown"), rough=0.8)
    return [cyl(f"{name}_post", 0.14, 6.0, (0, 0, 3.0), m, 8), box(f"{name}_arm", (0.15, 1.6, 0.15), (0, 0, 5.6), m, 0.02),
            ico(f"{name}_ins1", 0.1, (0, -0.65, 5.75), mat("glass", alpha=0.6)), ico(f"{name}_ins2", 0.1, (0, 0.65, 5.75), mat("glass", alpha=0.6))]


def router(name, color=None):
    parts = [box(f"{name}_body", (1.2, 0.8, 0.25), (0, 0, 0.125), mat(_c(color, "white"), rough=0.4), 0.06)]
    for side in (-1, 1):
        parts.append(cyl(f"{name}_ant{side}", 0.04, 0.8, (side * 0.45, 0.3, 0.6), mat("dark"), 8))
    for i in range(4):
        parts.append(ico(f"{name}_led{i}", 0.04, (-0.3 + i * 0.2, -0.41, 0.15), mat("green", emit=5), 1))
    return parts


def server(name, color=None):
    parts = [box(f"{name}_rack", (1.2, 1.0, 2.6), (0, 0, 1.3), mat(_c(color, "dark"), rough=0.4), 0.04)]
    for i in range(8):
        parts.append(box(f"{name}_unit{i}", (1.05, 0.04, 0.22), (0, -0.51, 0.35 + i * 0.29), mat("gray", rough=0.4), 0.01))
        parts.append(ico(f"{name}_led{i}", 0.03, (0.4, -0.54, 0.35 + i * 0.29), mat("green" if i % 3 else "blue_flame", emit=6), 1))
    return parts


def phone(name, color=None):
    return [box(f"{name}_body", (0.75, 0.08, 1.5), (0, 0, 0.75), mat(_c(color, "dark"), rough=0.3), 0.08),
            box(f"{name}_screen", (0.65, 0.02, 1.3), (0, -0.05, 0.75), mat("sky", rough=0.2, emit=0.6), 0.02)]


def laptop(name, color=None):
    base = box(f"{name}_base", (1.8, 1.2, 0.08), (0, 0, 0.04), mat(_c(color, "gray"), rough=0.35, metal=0.4), 0.03)
    lid = box(f"{name}_lid", (1.8, 0.06, 1.2), (0, 0.6, 0.62), mat(_c(color, "gray"), rough=0.35, metal=0.4), 0.03)
    scr = box(f"{name}_screen", (1.6, 0.02, 1.0), (0, 0.56, 0.62), mat("sky", rough=0.2, emit=0.6), 0.01)
    return [base, lid, scr]


def globe(name, color=None):
    parts = [ico(f"{name}_sea", 2.0, (0, 0, 0), mat(_c(color, "water"), rough=0.5), 3)]
    for i, (lat, lon, r) in enumerate([(20, 30, 0.8), (-15, 100, 0.7), (45, 200, 0.9), (-30, 260, 0.6), (5, 320, 0.7)]):
        la, lo = math.radians(lat), math.radians(lon)
        p = (math.cos(la) * math.cos(lo) * 1.85, math.cos(la) * math.sin(lo) * 1.85, math.sin(la) * 1.85)
        parts.append(ico(f"{name}_land{i}", r, p, mat("green", rough=0.8), 1))
    return parts


def satellite(name, color=None):
    parts = [box(f"{name}_body", (0.8, 0.8, 1.0), (0, 0, 0), mat(_c(color, "yellow"), rough=0.3, metal=0.6), 0.05)]
    for side in (-1, 1):
        parts.append(box(f"{name}_panel{side}", (0.05, 2.2, 0.8), (0, side * 1.6, 0), mat("navy", rough=0.2, metal=0.5), 0.02))
    parts.append(cone(f"{name}_dish", 0.45, 0.3, (0, 0, -0.65), mat("white"), 16))
    return parts


def tower(name, color=None):
    """Torre de celular (treliça simplificada) com antenas."""
    m = mat(_c(color, "gray"), rough=0.4, metal=0.6)
    parts = []
    for i, (x, y) in enumerate([(-0.6, -0.6), (0.6, -0.6), (0.6, 0.6), (-0.6, 0.6)]):
        parts.append(_tube(f"{name}_leg{i}", (x * 1.6, y * 1.6, 0), (x * 0.4, y * 0.4, 12), 0.08, m, 6))
    for k in range(1, 6):
        z = k * 2.2
        s = 1.6 - (1.2 * z / 12)
        for i in range(4):
            a = [(-0.6, -0.6), (0.6, -0.6), (0.6, 0.6), (-0.6, 0.6)][i]
            b = [(-0.6, -0.6), (0.6, -0.6), (0.6, 0.6), (-0.6, 0.6)][(i + 1) % 4]
            parts.append(_tube(f"{name}_ring{k}{i}", (a[0] * s, a[1] * s, z), (b[0] * s, b[1] * s, z), 0.04, m, 6))
    for i in range(3):
        a = i / 3 * 2 * math.pi
        parts.append(box(f"{name}_ant{i}", (0.3, 0.12, 1.2), (math.cos(a) * 0.5, math.sin(a) * 0.5, 11.2), mat("white"), 0.03))
    return parts


def car(name, color=None):
    c = mat(_c(color, "red"), rough=0.35)
    parts = [box(f"{name}_body", (3.6, 1.6, 0.8), (0, 0, 0.75), c, 0.15),
             box(f"{name}_top", (2.0, 1.4, 0.7), (-0.2, 0, 1.45), c, 0.15),
             box(f"{name}_glass", (2.05, 1.42, 0.45), (-0.2, 0, 1.5), mat("sky", rough=0.2), 0.12)]
    for x in (-1.15, 1.15):
        for side in (-1, 1):
            parts.append(cyl(f"{name}_w{x}{side}", 0.38, 0.25, (x, side * 0.8, 0.38), mat("dark"), 14, rot=(math.pi / 2, 0, 0)))
    return parts


def sun(name, color=None):
    return [ico(f"{name}_ball", 1.5, (0, 0, 0), mat(_c(color, "yellow"), emit=3.0), 2)]


def gear(name, color=None):
    m = mat(_c(color, "gray"), rough=0.35, metal=0.7)
    parts = [cyl(f"{name}_disc", 1.0, 0.3, (0, 0, 0), m, 24)]
    for i in range(12):
        a = i / 12 * 2 * math.pi
        t = box(f"{name}_tooth{i}", (0.35, 0.3, 0.3), (math.cos(a) * 1.1, math.sin(a) * 1.1, 0), m, 0.02)
        t.rotation_euler = (0, 0, a)
        parts.append(t)
    return parts


def battery(name, color=None):
    return [cyl(f"{name}_body", 0.5, 1.8, (0, 0, 0.9), mat(_c(color, "green"), rough=0.4), 20),
            cyl(f"{name}_cap", 0.2, 0.15, (0, 0, 1.87), mat("gray", metal=0.7), 16)]


def lightbulb(name, color=None):
    return [ico(f"{name}_glass", 0.6, (0, 0, 1.0), mat(_c(color, "yellow"), emit=2.0, alpha=0.9), 2),
            cyl(f"{name}_base", 0.28, 0.5, (0, 0, 0.3), mat("gray", metal=0.7), 12)]


def magnet(name, color=None):
    red, gray = mat("red", rough=0.4), mat("gray", metal=0.7)
    return [box(f"{name}_l", (0.5, 0.5, 1.6), (-0.6, 0, 0.8), red, 0.05), box(f"{name}_r", (0.5, 0.5, 1.6), (0.6, 0, 0.8), red, 0.05),
            box(f"{name}_top", (1.7, 0.5, 0.5), (0, 0, 1.6), red, 0.05),
            box(f"{name}_tl", (0.5, 0.52, 0.3), (-0.6, 0, 0.15), gray, 0.02), box(f"{name}_tr", (0.5, 0.52, 0.3), (0.6, 0, 0.15), gray, 0.02)]


def pot(name, color=None):
    from kit import pot as _pot

    _pot((0, 0, 0))
    return []


def stove(name, color=None):
    from kit import stove as _stove

    _stove((0, 0, 0))
    return []


def water(name, color=None):
    return [cyl(f"{name}_water", 0.7, 0.6, (0, 0, 0.3), mat(_c(color, "water"), alpha=0.75, rough=0.05), 24)]


def flame(name, color=None):
    m = mat(_c(color, "orange"), emit=5)
    return [cone(f"{name}_f{i}", 0.25 - i * 0.06, 0.8 - i * 0.15, (0, 0, 0.4 - i * 0.05), m if i else mat("yellow", emit=5), 8) for i in range(2)]


def fiber(name, color=None):
    """Cabo de fibra ótica (tubo de 10 ao longo de x) com o pulso de luz dentro (anim "flow" no id_pulse)."""
    return [cyl(f"{name}_cable", 0.18, 10, (0, 0, 0), mat(_c(color, "orange"), alpha=0.35, rough=0.2), 16, rot=(0, math.pi / 2, 0)),
            cyl(f"{name}_core", 0.05, 10, (0, 0, 0), mat("glass", alpha=0.6, rough=0.1), 10, rot=(0, math.pi / 2, 0))]


def mountain(name, color=None):
    return [cone(f"{name}_m", 6, 7, (0, 0, 3.5), mat(_c(color, "gray"), rough=0.9), 6), cone(f"{name}_snow", 2.2, 2.5, (0, 0, 5.8), mat("white"), 6)]


# Formas básicas (a IA usa para completar o que não tem pronto)
def _basic(kind):
    def make(name, color=None):
        m = mat(_c(color, "gray"), rough=0.5)
        if kind == "box":
            return [box(name, (1, 1, 1), (0, 0, 0), m, 0.04)]
        if kind == "cylinder":
            return [cyl(name, 0.5, 1, (0, 0, 0), m, 20)]
        if kind == "sphere":
            return [ico(name, 0.5, (0, 0, 0), m, 2)]
        if kind == "cone":
            return [cone(name, 0.5, 1, (0, 0, 0), m, 12)]
        bpy.ops.mesh.primitive_torus_add(major_radius=0.5, minor_radius=0.12, major_segments=24, minor_segments=8)
        ob = bpy.context.object
        ob.name = name
        ob.data.materials.append(m)
        return [ob]
    return make


KINDS = {
    "airplane": airplane, "wing_section": wing_section, "cloud": cloud, "arrow": arrow, "runway": runway, "tree": tree,
    "house": house, "person": person, "train": train, "track": track, "wheelset": wheelset, "pole": pole, "router": router,
    "server": server, "phone": phone, "laptop": laptop, "globe": globe, "satellite": satellite, "tower": tower, "car": car,
    "sun": sun, "gear": gear, "battery": battery, "lightbulb": lightbulb, "magnet": magnet, "pot": pot, "stove": stove,
    "water": water, "flame": flame, "fiber": fiber, "mountain": mountain,
    "box": _basic("box"), "cylinder": _basic("cylinder"), "sphere": _basic("sphere"), "cone": _basic("cone"), "torus": _basic("torus"),
}


def make(kind, name, color=None):
    """Cria o objeto e devolve o root (Empty) com as partes penduradas."""
    before = set(bpy.data.objects)
    root = _root(name)
    fn = KINDS.get(kind) or KINDS["box"]
    fn(name, color)
    # Tudo que a função criou (inclusive alças, cortadores etc.) fica pendurado no root
    _adopt(root, [o for o in bpy.data.objects if o not in before and o is not root])
    return root
