"""CN TRIAL Stage 01, decision 037: midground prop cutouts (light poles, cabins, sheds, factory, towers).

Owner brief (25 Nov 2026): "Add PNG trees on the middleground instead of the background, or any sort of
objects: a pole light, a tree, a small storage cabin, factory, a facility, or any sort of small building...
as long as it's a PNG that does not add much file size."

Each prop is modelled from primitives in a throwaway Blender scene (nothing is saved to a .blend and no STG01_*
collection is touched), lit like the night yard (cold moonlight, warm sodium lamps, lit windows) and rendered
with a transparent background. The renders are packed into one small cutout atlas the game draws on
alpha-tested quads just outside the fence, in the 35-120 m band between the yard and the painted backdrop.
Trees come from the existing tree cutout atlas (blender/exports/stage15/TREE_Cutout_Atlas.webp).

Output:
  blender/exports/stage01/props/STG01_Midground_Props.webp   runtime atlas (sRGB with alpha), 2048 x 1024
  blender/exports/stage01/props/STG01_MIDGROUND_PROPS.json   cells (uv, aspect, height) and placements

Usage: python3 tools/stage01/render_midground_props.py   (needs the bpy==5.3.0 module; no Blender window)
"""
from __future__ import annotations

import json
import math
import random
import tempfile
from pathlib import Path

import bpy
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "blender/exports/stage01/props"
OUT.mkdir(parents=True, exist_ok=True)
CELL = 512
GRID = (4, 2)

# ------------------------------------------------------------------ scene helpers

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = CELL
    sc.render.resolution_y = CELL
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    world = bpy.data.worlds.new("Night")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.03, 0.045, 0.06, 1)
    bg.inputs[1].default_value = 0.6
    sc.world = world
    return sc


def mat(name, color, rough=0.85, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m


def box(name, size, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.data.materials.append(m)
    return o


def cyl(name, r, h, loc, m, verts=16, rot=(0, 0, 0), r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(m)
    return o


def beam(a, b, r, m):
    """A thin strut between two points (lattice towers)."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    o = cyl("strut", r, L, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), m, verts=6)
    o.rotation_mode = "QUATERNION"
    from mathutils import Vector
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)).normalized())
    return o


def lights(sc, warm_at=None):
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(58), 0, math.radians(-35)))
    moon = bpy.context.object.data
    moon.energy = 1.1
    moon.color = (0.55, 0.68, 0.9)
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(70), 0, math.radians(150)))
    rim = bpy.context.object.data
    rim.energy = 0.6
    rim.color = (0.35, 0.55, 0.6)
    for p in warm_at or []:
        bpy.ops.object.light_add(type="POINT", location=p)
        lt = bpy.context.object.data
        lt.energy = 70
        lt.color = (1.0, 0.72, 0.42)
        lt.shadow_soft_size = 0.4


def camera_fit(sc, h, w):
    """Orthographic camera looking slightly down at the prop from the yard side (-Y), framing w x h metres."""
    bpy.ops.object.camera_add(location=(0, -60, h * 0.5 + 6), rotation=(math.radians(84), 0, 0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(h, w) * 1.04
    cam.location.z = h * 0.5 + 60 * math.tan(math.radians(6))
    sc.camera = cam


# Palette: dark teal concrete, rusted steel, sodium light (matches the matte layers and the yard).
def palette():
    return {
        "concrete": mat("concrete", (0.11, 0.13, 0.13), 0.92),
        "concrete2": mat("concrete2", (0.08, 0.095, 0.1), 0.95),
        "steel": mat("steel", (0.12, 0.13, 0.14), 0.5, 0.7),
        "rust": mat("rust", (0.2, 0.09, 0.05), 0.8, 0.3),
        "dark": mat("dark", (0.025, 0.03, 0.035), 0.9),
        "roof": mat("roof", (0.06, 0.07, 0.075), 0.7, 0.4),
        "lamp": mat("lamp", (1, 0.8, 0.5), 0.4, emit=(1.0, 0.72, 0.38), strength=40),
        "window": mat("window", (0.9, 0.6, 0.3), 0.4, emit=(1.0, 0.62, 0.28), strength=6),
        "red": mat("redlamp", (1, 0.1, 0.05), 0.4, emit=(1.0, 0.08, 0.03), strength=30),
        "container": mat("container", (0.16, 0.07, 0.05), 0.75, 0.5),
        "container2": mat("container2", (0.05, 0.11, 0.12), 0.75, 0.5),
    }

# ------------------------------------------------------------------ props (Z up, ground at z = 0, faces -Y)

def floodlight_mast(P):
    h = 18
    for sx in (-0.6, 0.6):
        for sy in (-0.6, 0.6):
            beam((sx * 1.6, sy * 1.6, 0), (sx * 0.5, sy * 0.5, h - 2), 0.07, P["steel"])
    for k in range(1, 9):
        z = k * (h - 2) / 9
        f = 1.6 - (1.1 * z / (h - 2))
        for a, b in (((-f, -f), (f, -f)), ((f, -f), (f, f)), ((f, f), (-f, f)), ((-f, f), (-f, -f))):
            beam((a[0] * 0.6, a[1] * 0.6, z), (b[0] * 0.6, b[1] * 0.6, z + (h - 2) / 9), 0.04, P["steel"])
    box("platform", (2.6, 1.0, 0.15), (0, 0, h - 1.9), P["steel"])
    box("frame", (2.6, 0.12, 1.4), (0, -0.3, h - 1.1), P["steel"])
    for i in range(4):
        x = -0.95 + i * 0.63
        box("housing", (0.5, 0.35, 0.45), (x, -0.45, h - 0.75), P["dark"], rot=(math.radians(-20), 0, 0))
        box("lens", (0.42, 0.04, 0.37), (x, -0.64, h - 0.8), P["lamp"], rot=(math.radians(-20), 0, 0))
        box("housing", (0.5, 0.35, 0.45), (x, -0.45, h - 1.35), P["dark"], rot=(math.radians(-20), 0, 0))
        box("lens", (0.42, 0.04, 0.37), (x, -0.64, h - 1.4), P["lamp"], rot=(math.radians(-20), 0, 0))
    return h, 4.0, [(0, -2.5, h - 1.2)], [(0, h - 1.1)]


def street_lamp(P):
    h = 9.5
    cyl("pole", 0.12, h, (0, 0, h / 2), P["steel"], r2=0.08)
    beam((0, 0, h - 0.3), (1.6, 0, h + 0.1), 0.06, P["steel"])
    box("head", (0.8, 0.35, 0.18), (1.75, 0, h + 0.05), P["dark"])
    box("glow", (0.66, 0.26, 0.04), (1.75, 0, h - 0.06), P["lamp"])
    box("base", (0.4, 0.4, 0.6), (0, 0, 0.3), P["concrete"])
    return h + 0.4, 4.0, [(1.75, -1.0, h - 0.6)], [(1.75, h - 0.1)]


def guard_cabin(P):
    w, d, hh = 3.2, 2.4, 2.6
    box("body", (w, d, hh), (0, 0, hh / 2), P["concrete"])
    box("roof", (w + 0.5, d + 0.5, 0.22), (0, 0, hh + 0.11), P["roof"])
    box("window", (1.2, 0.05, 0.75), (-0.55, -d / 2 - 0.01, 1.55), P["window"])
    box("frame", (1.3, 0.04, 0.08), (-0.55, -d / 2 - 0.03, 1.55), P["dark"])
    box("door", (0.85, 0.05, 2.0), (0.95, -d / 2 - 0.01, 1.0), P["dark"])
    box("sign", (0.9, 0.04, 0.3), (0.95, -d / 2 - 0.04, 2.25), P["rust"])
    box("vent", (0.6, 0.6, 0.35), (0.8, 0.3, hh + 0.4), P["steel"])
    cyl("lamp_arm", 0.03, 0.5, (-1.6, -d / 2 - 0.25, 2.3), P["steel"], rot=(math.radians(90), 0, 0))
    box("lamp", (0.22, 0.14, 0.1), (-1.6, -d / 2 - 0.5, 2.25), P["lamp"])
    return hh + 0.8, w + 1.0, [(-1.6, -d / 2 - 1.2, 2.0)], [(-1.6, 2.25)]


def container_stack(P):
    L, W, H = 6.1, 2.44, 2.6
    box("c1", (L, W, H), (0, 0, H / 2), P["container"])
    box("c2", (L, W, H), (1.0, 0.2, H * 1.5 + 0.02), P["container2"])
    box("c3", (L * 0.5, W, H), (-3.6, 0.6, H / 2), P["container2"])
    for o in [o for o in bpy.data.objects if o.name.startswith("c")]:
        pass
    for x in range(-14, 15, 2):
        box("rib", (0.06, 0.05, H * 0.92), (x * 0.2, -W / 2 - 0.02, H / 2), P["rust"])
        box("rib", (0.06, 0.05, H * 0.92), (1.0 + x * 0.2, 0.2 - W / 2 - 0.02, H * 1.5), P["dark"])
    box("lamp", (0.3, 0.12, 0.12), (2.2, 0.2 - W / 2 - 0.1, H * 2 - 0.2), P["window"])
    return H * 2 + 0.1, L + 3.6, [], []


def factory(P):
    box("hall", (16, 9, 9), (0, 0, 4.5), P["concrete2"])
    box("hall_roof", (16.4, 9.4, 0.4), (0, 0, 9.2), P["roof"])
    box("annex", (7, 7, 13), (-9.5, 1, 6.5), P["concrete"])
    box("annex_roof", (7.3, 7.3, 0.35), (-9.5, 1, 13.15), P["roof"])
    for k in range(5):
        box("saw", (3.0, 9, 0.2), (-5 + k * 3.1, 0, 10.2), P["roof"], rot=(0, math.radians(32), 0))
    for (x, r, h) in ((5, 0.9, 26), (8.5, 0.75, 22)):
        cyl("chimney", r, h, (x, 2.5, h / 2), P["concrete"], r2=r * 0.8)
        cyl("band", r * 0.85, 0.5, (x, 2.5, h - 1.5), P["rust"])
        box("beacon", (0.3, 0.3, 0.3), (x, 2.5 - r * 0.8, h + 0.1), P["red"])
    rnd = random.Random(7)
    for row in range(3):
        for col in range(9):
            if rnd.random() < 0.28:
                box("win", (0.9, 0.05, 0.9), (-6.5 + col * 1.6, -4.52, 2.0 + row * 2.4), P["window"])
    for row in range(5):
        if rnd.random() < 0.5:
            box("win", (0.8, 0.05, 0.9), (-10.5 + rnd.random() * 2, -2.52, 2.0 + row * 2.3), P["window"])
    box("door", (4, 0.06, 4.5), (3.0, -4.53, 2.25), P["dark"])
    return 27.5, 27.0, [], [(5, 26.2), (8.5, 22.2)]


def water_tower(P):
    h = 15
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        beam((math.cos(ang) * 3.2, math.sin(ang) * 3.2, 0), (math.cos(ang) * 2.0, math.sin(ang) * 2.0, h), 0.12, P["steel"])
    for z in (4, 8, 12):
        f = 3.2 - 1.2 * z / h
        for a in range(4):
            a1 = a * math.pi / 2 + math.pi / 4
            a2 = a1 + math.pi / 2
            beam((math.cos(a1) * f, math.sin(a1) * f, z - 3.5), (math.cos(a2) * (f - 0.3), math.sin(a2) * (f - 0.3), z), 0.05, P["steel"])
    cyl("tank", 3.4, 5.5, (0, 0, h + 2.75), P["rust"], verts=32)
    cyl("cap", 3.6, 1.8, (0, 0, h + 6.4), P["roof"], verts=32, r2=0.4)
    cyl("walk", 3.9, 0.15, (0, 0, h + 0.1), P["steel"], verts=32)
    box("beacon", (0.3, 0.3, 0.3), (0, 0, h + 7.4), P["red"])
    return h + 7.8, 8.2, [], [(0, h + 7.4)]


def watchtower(P):
    h = 11
    for sx in (-1, 1):
        for sy in (-1, 1):
            beam((sx * 1.8, sy * 1.8, 0), (sx * 1.2, sy * 1.2, h), 0.09, P["steel"])
    for z in (3, 6.5, 9.5):
        for (a, b) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((-1, 1), (-1, -1))):
            beam((a[0] * 1.5, a[1] * 1.5, z - 2.6), (b[0] * 1.5, b[1] * 1.5, z), 0.04, P["steel"])
    box("cabin", (3.0, 3.0, 2.3), (0, 0, h + 1.15), P["concrete2"])
    box("slit", (2.4, 0.05, 0.5), (0, -1.52, h + 1.5), P["window"])
    box("roof", (3.6, 3.6, 0.25), (0, 0, h + 2.45), P["roof"])
    box("searchlight", (0.6, 0.7, 0.5), (1.0, -1.7, h + 2.2), P["dark"], rot=(math.radians(-25), 0, 0))
    box("searchlens", (0.5, 0.04, 0.4), (1.0, -2.05, h + 2.1), P["lamp"], rot=(math.radians(-25), 0, 0))
    return h + 2.8, 4.6, [(1.0, -3.0, h + 1.5)], [(1.0, h + 2.1)]


def utility_pole(P):
    h = 10
    cyl("pole", 0.16, h, (0, 0, h / 2), P["rust"], r2=0.12)
    box("cross", (2.6, 0.14, 0.14), (0, 0, h - 0.6), P["rust"])
    box("cross2", (1.8, 0.12, 0.12), (0, 0, h - 1.5), P["rust"])
    for x in (-1.1, -0.4, 0.4, 1.1):
        cyl("insulator", 0.06, 0.25, (x, 0, h - 0.4), P["concrete"])
    cyl("transformer", 0.4, 1.2, (0.45, -0.1, h - 3.0), P["steel"])
    box("lamp", (0.3, 0.15, 0.1), (0, -0.2, h - 2.2), P["window"])
    return h + 0.2, 3.0, [], []


PROPS = [
    ("floodlight_mast", floodlight_mast),
    ("street_lamp", street_lamp),
    ("guard_cabin", guard_cabin),
    ("container_stack", container_stack),
    ("factory", factory),
    ("water_tower", water_tower),
    ("watchtower", watchtower),
    ("utility_pole", utility_pole),
]

# ------------------------------------------------------------------ render and pack

def render_all():
    cells = []
    atlas = Image.new("RGBA", (CELL * GRID[0], CELL * GRID[1]), (0, 0, 0, 0))
    tmp = Path(tempfile.mkdtemp())
    for i, (kind, build) in enumerate(PROPS):
        sc = reset()
        P = palette()
        h, w, warm, glows = build(P)
        lights(sc, warm)
        camera_fit(sc, h, w)
        f = tmp / f"{kind}.png"
        sc.render.filepath = str(f)
        bpy.ops.render.render(write_still=True)
        img = Image.open(f).convert("RGBA")
        bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        crop = img.crop(bbox)
        # Fit the cropped prop into its cell, keeping its aspect, standing on the cell's bottom edge.
        s = min(CELL / crop.width, CELL / crop.height)
        cw, ch = max(1, round(crop.width * s)), max(1, round(crop.height * s))
        crop = crop.resize((cw, ch), Image.LANCZOS)
        col, row = i % GRID[0], i // GRID[0]
        ox = col * CELL + (CELL - cw) // 2
        oy = row * CELL + (CELL - ch)
        atlas.alpha_composite(crop, (ox, oy))
        W, H = atlas.size
        # Height in metres of the visible prop: ortho scale maps CELL px to max(h, w) * 1.04 m.
        metres_per_px = max(h, w) * 1.04 / CELL
        cells.append({
            "index": i, "kind": kind,
            "uv": [round(ox / W, 5), round(1 - (oy + ch) / H, 5), round(cw / W, 5), round(ch / H, 5)],
            "aspect": round(cw / ch, 4),
            "height_m": round((bbox[3] - bbox[1]) * metres_per_px, 2),
            # Lamp points as fractions of the quad (x from the left, y from the bottom), for glow sprites.
            "glows": [[round(0.5 + gx / max(0.01, (bbox[2] - bbox[0]) * metres_per_px), 3), round(gz / max(0.01, (bbox[3] - bbox[1]) * metres_per_px), 3)] for gx, gz in glows],
        })
        print(f"rendered {kind}: {cw}x{ch}px, {cells[-1]['height_m']} m")
    return atlas, cells


def placements(cells):
    """Deterministic placements around the yard (x -30..30, z +15..-172), 35-120 m from the course axis."""
    rnd = random.Random(20261125)
    kinds = {c["kind"]: c for c in cells}
    out = []

    def add(kind, x, z, scale=1.0, tree=False):
        out.append({"kind": kind, "pos": [round(x, 2), 0, round(z, 2)], "scale": round(scale, 3), "tree": tree})

    # Along both fences: street lamps and utility poles every ~22 m, 6-9 m outside the fence.
    for side in (-1, 1):
        z = 8.0
        k = 0
        while z > -180:
            kind = "street_lamp" if k % 2 == 0 else "utility_pole"
            add(kind, side * (37 + rnd.random() * 3), z, 0.95 + rnd.random() * 0.15)
            z -= 20 + rnd.random() * 6
            k += 1
    # Small buildings, a little further out.
    for side in (-1, 1):
        for z in (-15, -62, -118, -158):
            kind = rnd.choice(["guard_cabin", "container_stack", "guard_cabin"])
            add(kind, side * (45 + rnd.random() * 10), z + rnd.uniform(-8, 8))
    # Floodlight masts and watchtowers at the corners and midway.
    for side in (-1, 1):
        add("floodlight_mast", side * 48, -40 + rnd.uniform(-5, 5))
        add("watchtower", side * 52, -135 + rnd.uniform(-6, 6))
        add("floodlight_mast", side * 50, -175 + rnd.uniform(-4, 4))
    # The bigger facility, deep in the mist.
    add("factory", -95, -110, 1.0)
    add("factory", 105, -60, 0.9)
    add("water_tower", 82, -150, 1.0)
    add("water_tower", -88, -25, 0.9)
    add("watchtower", 0, 45, 1.0)
    # Trees (from the tree atlas): clumps between the buildings, 40-110 m out.
    for side in (-1, 1):
        for _ in range(26):
            x = side * (42 + rnd.random() * 68)
            z = rnd.uniform(-200, 30)
            add(rnd.choice(["conifer_tall", "conifer_narrow", "conifer_wide", "conifer_broken", "broadleaf_a", "dead_a", "dead_b", "conifer_tall"]), x, z, 0.8 + rnd.random() * 0.6, tree=True)
    for _ in range(10):
        add(rnd.choice(["conifer_tall", "conifer_wide", "dead_a"]), rnd.uniform(-60, 60), rnd.uniform(40, 70), 0.9 + rnd.random() * 0.5, tree=True)
    return out


def main():
    atlas, cells = render_all()
    webp = OUT / "STG01_Midground_Props.webp"
    atlas.save(webp, "WEBP", quality=82, method=6)
    manifest = {
        "stage": "STAGE_01_RED_LIGHT",
        "decision": "037",
        "generator": "tools/stage01/render_midground_props.py",
        "atlas": "blender/exports/stage01/props/STG01_Midground_Props.webp",
        "treeAtlas": "blender/exports/stage15/TREE_Cutout_Atlas.webp",
        "grid": list(GRID), "cellPx": CELL,
        "atlas_bytes": webp.stat().st_size,
        "rendering": "alpha-tested quads facing the course (props) or the camera about Y (trees); fogged by depth; no collision",
        "licensing": "Original renders of primitive models made by the project's own script. No photographs, third-party or AI-generated images.",
        "cells": cells,
        # Tree cells copied from the stage15 matte manifest, so the game does not bundle that whole file.
        "treeCells": [{k: c[k] for k in ("index", "kind", "uv", "aspect", "top_frac")} for c in
                      json.loads((ROOT / "blender/exports/stage15/STAGE_01_MATTE_PAINTING_MANIFEST.json").read_text())["cutouts"]["cells"]],
        "placements": placements(cells),
    }
    (OUT / "STG01_MIDGROUND_PROPS.json").write_text(json.dumps(manifest, indent=1))
    print(f"atlas {webp.stat().st_size} bytes, {len(manifest['placements'])} placements")


if __name__ == "__main__":
    main()
