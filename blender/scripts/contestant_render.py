"""Renders of the shared contestant (Cycles, CPU). Writes docs/stage15/screenshots/contestant/.

  python blender/scripts/contestant_render.py turnaround [--samples 32] [--px 900] [--colorway CW01]
  python blender/scripts/contestant_render.py closeups
  python blender/scripts/contestant_render.py lineup        # all 30 colourways on ONE shared mesh
  python blender/scripts/contestant_render.py animation     # contact sheet of every clip
  python blender/scripts/contestant_render.py lods
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
BLEND = ROOT / "blender/scenes/CNTRIAL_CONTESTANT_MASTER.blend"
OUT = ROOT / "docs/stage15/screenshots/contestant"
COLORWAYS = json.loads((ROOT / "packages/shared/src/contestant-colorways.json").read_text())["colorways"]


def arg(name, default):
    if name in sys.argv:
        return type(default)(sys.argv[sys.argv.index(name) + 1])
    return default


def setup(samples, px_w, px_h, bg=(0.82, 0.82, 0.86)):
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.render.resolution_x, s.render.resolution_y = px_w, px_h
    s.render.film_transparent = False
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast"
    w = bpy.data.worlds.new("CNT_RenderWorld")
    s.world = w
    w.use_nodes = True
    bgn = w.node_tree.nodes["Background"]
    bgn.inputs["Color"].default_value = (*bg, 1)
    bgn.inputs["Strength"].default_value = 0.55
    # ground plane with a soft shadow
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    g = bpy.context.active_object
    m = bpy.data.materials.new("Ground")
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*bg, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    g.data.materials.append(m)
    for name, loc, energy, size, colour in (("Key", (-2.2, -3.0, 3.2), 260, 2.0, (1.0, 0.96, 0.92)),
                                            ("Fill", (2.8, -2.0, 1.6), 90, 3.0, (0.85, 0.9, 1.0)),
                                            ("Rim", (0.6, 3.2, 2.6), 220, 1.5, (0.9, 0.92, 1.0))):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy, ld.size, ld.color = energy, size, colour
        lo = bpy.data.objects.new(name, ld)
        s.collection.objects.link(lo)
        lo.location = loc
        d = Vector((0, 0, 0.6)) - Vector(loc)
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return s


def camera(s, loc, look, lens=85, ortho=None):
    cd = bpy.data.cameras.new("Cam")
    cd.lens = lens
    if ortho:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho
    co = bpy.data.objects.new("Cam", cd)
    s.collection.objects.link(co)
    co.location = loc
    co.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    s.camera = co
    return co


def render(s, name):
    OUT.mkdir(parents=True, exist_ok=True)
    s.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("Rendered", name)


def colorway(obj, cw_id):
    import contestant_build as CB
    CB.apply_colorway(obj, next(c for c in COLORWAYS if c["id"] == cw_id))


def turnaround():
    s = setup(arg("--samples", 32), arg("--px", 900), int(arg("--px", 900) * 1.1))
    body = bpy.data.objects["CNT_Contestant_LOD0"]
    colorway(body, arg("--colorway", "CW01"))
    views = {"front": 0, "three_quarter_front": 35, "side": 90, "three_quarter_back": 145, "back": 180}
    only = arg("--only", "")
    for name, ang in views.items():
        if only and name not in only.split(","):
            continue
        a = math.radians(ang)
        d = 4.2
        camera(s, (math.sin(a) * d * 1.0 + 0.0, -math.cos(a) * d, 0.72), (0, 0, 0.62), lens=60)
        # rotate the camera around the character: angle measured from the front toward the character's left
        render(s, f"turnaround_{name}")


def closeups():
    s = setup(arg("--samples", 32), arg("--px", 800), arg("--px", 800))
    body = bpy.data.objects["CNT_Contestant_LOD0"]
    colorway(body, arg("--colorway", "CW06"))
    shots = {
        "hood_collar": ((0.55, -1.1, 1.05), (0, 0, 0.9), 70),
        "chest_front_opening": ((0.15, -0.95, 0.62), (0, -0.1, 0.58), 75),
        "sleeve_cuff": ((0.75, -0.6, 0.48), (0.22, -0.05, 0.44), 85),
        "belt_buckle": ((0.12, -0.75, 0.50), (0, -0.12, 0.47), 85),
        "pocket": ((0.62, -0.75, 0.33), (0.13, -0.15, 0.29), 85),
        "hem_back_vent": ((0.35, 1.0, 0.32), (0, 0.15, 0.27), 75),
        "fabric_surface": ((0.42, -0.42, 0.40), (0.15, -0.14, 0.38), 120),
        "face_emblem": ((0.0, -0.95, 0.98), (0, 0, 0.97), 85),
    }
    for name, (loc, look, lens) in shots.items():
        camera(s, loc, look, lens=lens)
        render(s, f"closeup_{name}")


def lineup():
    """All 30 colourways: 30 objects that share ONE mesh datablock and ONE material."""
    s = setup(arg("--samples", 24), 1800, 900)
    body = bpy.data.objects["CNT_Contestant_LOD0"]
    arm = bpy.data.objects["CNT_Rig"]
    body.hide_render = True
    shared_mesh = body.data
    for i, cw in enumerate(COLORWAYS):
        row, colm = divmod(i, 10)
        o = bpy.data.objects.new(f"Lineup_{cw['id']}", shared_mesh)
        s.collection.objects.link(o)
        o.location = ((colm - 4.5) * 0.62, row * 0.95, 0)
        mod = o.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        colorway(o, cw["id"])
    users = shared_mesh.users
    camera(s, (0, -7.4, 3.6), (0, 0.95, 0.45), lens=50)
    print(json.dumps({"lineup_objects": 30, "shared_mesh": shared_mesh.name, "mesh_users": users}))
    render(s, "lineup_30_colorways")


def lods():
    s = setup(arg("--samples", 24), 1500, 800)
    for lod in (0, 1, 2):
        o = bpy.data.objects[f"CNT_Contestant_LOD{lod}"]
        o.hide_render = False
        o.location.x = (lod - 1) * 0.75
        colorway(o, "CW09")
    camera(s, (0.0, -4.6, 1.0), (0, 0, 0.58), lens=50)
    render(s, "lods_0_1_2")


def animation():
    """Contact sheet: one row per clip, 6 poses each (rendered at low resolution, then tiled)."""
    from PIL import Image
    px = arg("--px", 260)
    s = setup(arg("--samples", 10), px, int(px * 1.15))
    body = bpy.data.objects["CNT_Contestant_LOD0"]
    colorway(body, "CW03")
    arm = bpy.data.objects["CNT_Rig"]
    camera(s, (2.6, -2.9, 1.0), (0, -0.25, 0.48), lens=50)
    only = arg("--only", "")
    rows = []
    tmp = OUT / "anim_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    for act in bpy.data.actions:
        if only and act.name not in only.split(","):
            continue
        arm.animation_data.action = act
        f0, f1 = int(act.frame_start), int(act.frame_end)
        frames = [round(f0 + (f1 - f0) * k / 5) for k in range(6)]
        if act.get("loop"):
            frames = [round(f0 + (f1 - f0) * k / 6) for k in range(6)]
        row = []
        for k, f in enumerate(frames):
            s.frame_set(f)
            s.render.filepath = str(tmp / f"{act.name}_{k}.png")
            bpy.ops.render.render(write_still=True)
            row.append(s.render.filepath)
        rows.append((act.name, row))
        print("Rendered clip", act.name)
    w, h = px, int(px * 1.15)
    sheet = Image.new("RGB", (w * 6 + 150, h * len(rows)), (210, 210, 220))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    for r, (name, files) in enumerate(rows):
        dr.text((10, r * h + h // 2), name, fill=(20, 20, 30))
        for k, fp in enumerate(files):
            sheet.paste(Image.open(fp).convert("RGB"), (150 + k * w, r * h))
    name = "animation_sheet" if not only else f"animation_{only.replace(',', '_')}"
    sheet.save(OUT / f"{name}.png")
    print("Rendered", name)


if __name__ == "__main__":
    {"turnaround": turnaround, "closeups": closeups, "lineup": lineup, "animation": animation, "lods": lods}[sys.argv[1]]()
