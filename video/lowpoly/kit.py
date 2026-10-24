"""Peças 3D "low poly" (Blender/bpy) para o estilo 3D dos vídeos explicativos: cozinha, fogão, panela, água,
bolhas, vapor, chama, relógio, termômetro. Formas simples com facetas à mostra e cores pastel, como as
animações de "por dentro das coisas". Tudo procedural: nada de modelo baixado."""
import math

import bpy

PALETTE = {
    "wall": (0.93, 0.89, 0.82), "floor": (0.86, 0.82, 0.76), "tile": (0.68, 0.82, 0.90), "wood": (0.80, 0.58, 0.36),
    "counter": (0.17, 0.17, 0.18), "white": (0.92, 0.92, 0.92), "black": (0.05, 0.05, 0.05), "metal": (0.55, 0.57, 0.60),
    "water": (0.35, 0.60, 0.95), "steam": (0.97, 0.97, 0.97), "red": (0.85, 0.12, 0.10), "blue_flame": (0.15, 0.35, 1.0),
    "glass": (0.85, 0.90, 0.95), "yellow": (1.0, 0.78, 0.15), "green": (0.42, 0.70, 0.36), "grass": (0.55, 0.75, 0.42),
    "asphalt": (0.30, 0.30, 0.32), "sky": (0.62, 0.80, 0.96), "orange": (0.98, 0.55, 0.20), "purple": (0.55, 0.40, 0.85),
    "brown": (0.50, 0.33, 0.20), "gray": (0.62, 0.63, 0.66), "dark": (0.20, 0.21, 0.24), "pink": (0.95, 0.60, 0.70),
    "skin": (0.93, 0.75, 0.60), "cloud": (0.98, 0.98, 1.0), "navy": (0.15, 0.22, 0.45),
}
_MATS = {}


def srgb(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def mat(name, color=None, rough=0.6, alpha=1.0, emit=0.0, metal=0.0, transmission=0.0):
    key = (name, alpha, emit)
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(f"{name}-{alpha}-{emit}")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    col = srgb(color or PALETTE[name])
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
        b.inputs["IOR"].default_value = 1.05
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    if emit:
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = emit
    _MATS[key] = m
    return m


def _finish(ob, material, bevel=0.0, flat=True):
    ob.data.materials.append(material)
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    for p in ob.data.polygons:
        p.use_smooth = not flat
    return ob


def box(name, size, loc, material, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(ob, material, bevel)


def cyl(name, r, depth, loc, material, verts=20, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    return _finish(ob, material, bevel)


def ico(name, r, loc, material, sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    ob = bpy.context.object
    ob.name = name
    return _finish(ob, material)


def cone(name, r, depth, loc, material, verts=8):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, depth=depth, location=loc)
    ob = bpy.context.object
    ob.name = name
    return _finish(ob, material)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


# ------------------------------------------------------------------------------------------------ peças

def kitchen():
    """Parede, chão, azulejos e bancadas de madeira dos dois lados (o fogão fica no meio, em x=0)."""
    box("floor", (20, 20, 0.2), (0, 0, -0.1), mat("floor"), 0)
    box("wall", (20, 0.2, 12), (0, 3.0, 6), mat("wall"), 0)
    for i in range(6):
        for j in range(2):
            box(f"tile{i}{j}", (0.62, 0.05, 0.62), (-1.65 + i * 0.66, 2.88, 3.0 + j * 0.66), mat("tile", rough=0.3), 0.01)
    for side in (-1, 1):
        box(f"cab{side}", (2.6, 1.6, 2.2), (side * 3.3, 1.9, 1.1), mat("wood"), 0.12)
        box(f"top{side}", (2.8, 1.8, 0.16), (side * 3.3, 1.9, 2.28), mat("counter"), 0.03)


def stove(loc=(0, 1.9, 0)):
    x, y, z = loc
    box("stove", (2.2, 1.6, 2.2), (x, y, z + 1.1), mat("white", rough=0.35), 0.12)
    box("stove_top", (2.4, 1.8, 0.14), (x, y, z + 2.27), mat("counter", rough=0.4), 0.03)
    box("oven_door", (1.7, 0.05, 1.0), (x, y - 0.82, z + 0.9), mat("counter", rough=0.2), 0.03)
    box("panel", (2.0, 0.08, 0.35), (x, y - 0.82, z + 1.8), mat("white", (0.8, 0.8, 0.8), rough=0.4), 0.02)
    for i in range(4):
        cyl(f"knob{i}", 0.09, 0.08, (x - 0.66 + i * 0.44, y - 0.88, z + 1.8), mat("black"), 10, rot=(math.pi / 2, 0, 0))
    return (x, y, z + 2.34)


def burner(loc, on=True):
    """Bocas de chama azul em volta do centro."""
    x, y, z = loc
    flames = []
    for i in range(10):
        a = i / 10 * 2 * math.pi
        flames.append(cone(f"flame{i}", 0.05, 0.16, (x + math.cos(a) * 0.32, y + math.sin(a) * 0.32, z + 0.08), mat("blue_flame", emit=4.0), 6))
    return flames


def pot(loc, r=0.75, h=0.9, glass=False):
    """Panela (cilindro facetado + alças). glass=True: parede transparente para mostrar por dentro."""
    x, y, z = loc
    m = mat("glass", alpha=0.25, rough=0.1) if glass else mat("metal", rough=0.35, metal=0.6)
    body = cyl("pot", r, h, (x, y, z + h / 2 + 0.05), m, 24)
    inner = cyl("pot_in", r * 0.95, h, (x, y, z + h / 2 + 0.1), m, 24)
    # Oco: tira o miolo com booleana
    mod = body.modifiers.new("hollow", "BOOLEAN")
    mod.object = inner
    mod.operation = "DIFFERENCE"
    inner.hide_render = True
    inner.hide_viewport = True
    for side in (-1, 1):
        box(f"handle{side}", (0.5, 0.14, 0.12), (x + side * (r + 0.22), y, z + h * 0.85), mat("black", rough=0.4), 0.04)
    return body


def water(loc, r=0.7, level=0.6):
    x, y, z = loc
    return cyl("water", r, level, (x, y, z + level / 2 + 0.1), mat("water", alpha=0.75, rough=0.05), 24)


def clock(loc, size=0.55):
    x, y, z = loc
    cyl("clock", size, 0.08, (x, y, z), mat("white", rough=0.3), 24, rot=(math.pi / 2, 0, 0))
    cyl("clock_rim", size * 1.06, 0.06, (x, y + 0.02, z), mat("black"), 24, rot=(math.pi / 2, 0, 0))
    hour = box("hand_h", (0.05, 0.02, size * 0.55), (x, y - 0.06, z + size * 0.25), mat("black"), 0)
    minute = box("hand_m", (0.04, 0.02, size * 0.8), (x, y - 0.07, z), mat("red"), 0)
    # Ponteiro gira em volta do centro: pivô no centro do relógio
    for hnd in (hour, minute):
        bpy.context.scene.cursor.location = (x, y, z)
        bpy.context.view_layer.objects.active = hnd
        hnd.select_set(True)
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        hnd.select_set(False)
    minute.rotation_euler = (0, math.radians(70), 0)
    return hour, minute


def thermometer(loc, h=1.8):
    x, y, z = loc
    cyl("thermo_glass", 0.09, h, (x, y, z + h / 2 + 0.15), mat("glass", alpha=0.3, rough=0.05), 12)
    ico("thermo_bulb", 0.2, (x, y, z + 0.12), mat("red", rough=0.3), 2)
    col = cyl("thermo_red", 0.05, 0.05, (x, y, z + 0.2), mat("red", rough=0.3), 10)
    return col


# ------------------------------------------------------------------------------------------------ cena

def setup(w=1080, h=1920, fps=30, samples=16):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.device = "CPU"
    sc.cycles.max_bounces = 4
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.fps = fps
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    world = bpy.data.worlds.new("world")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb((0.95, 0.93, 0.9)), 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    bpy.ops.object.light_add(type="SUN", location=(4, -6, 10))
    sun = bpy.context.object
    sun.data.energy = 3.2
    sun.data.angle = math.radians(12)
    sun.rotation_euler = (math.radians(40), math.radians(18), math.radians(25))
    bpy.ops.object.light_add(type="AREA", location=(0, -6, 6))
    fill = bpy.context.object
    fill.data.energy = 600
    fill.data.size = 8
    fill.rotation_euler = (math.radians(60), 0, 0)
    bpy.ops.object.camera_add(location=(0, -9, 4.5))
    cam = bpy.context.object
    cam.data.lens = 35
    sc.camera = cam
    target = bpy.data.objects.new("target", None)
    sc.collection.objects.link(target)
    c = cam.constraints.new("TRACK_TO")
    c.target = target
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"
    return cam, target
