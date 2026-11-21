"""Top, side and perspective validation screenshots of the collision-ready Stage 01 scene.

CPU Cycles render (no GPU needed) with gameplay layers drawn as coloured wireframes over grey decoration.
Empties get a small temporary sphere so anchors show up; nothing here is saved back into the .blend.

    python blender/scripts/stage_01_collision_screens.py        # renders the committed scene
Colours: blue = solid collision, purple = camera-only collision, orange = movement boundaries,
green = start trigger, yellow = finish trigger, cyan = safe zone, white = spawn capsules,
red = watcher reference, magenta = spectator locations, lime = signal anchors, pale yellow = course markers.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
OUT = ROOT / "renders"
SIGNAL = (0.55, 1.0, 0.1, 1.0)
EMPTY_COLOURS = {
    "GAMEPLAY_MARKERS": (1.0, 1.0, 0.4, 1.0), "WATCHER_REFERENCE": (1.0, 0.2, 0.3, 1.0),
    "SPECTATOR_LOCATIONS": (0.85, 0.4, 1.0, 1.0), "SIGNAL_ANCHORS": SIGNAL, "PLAYER_SPAWNS": (1, 1, 1, 1),
}
VIEWS = {
    # name: (location, look-at or None for a fixed rotation, rotation, ortho scale or None, resolution)
    "TOP": ((5.0, 92.0, 300.0), None, (0.0, 0.0, 0.0), 235.0, (1200, 1600)),
    "SIDE": ((-250.0, 92.0, 18.0), None, (math.radians(90), 0.0, math.radians(-90)), 235.0, (2000, 520)),
    "PERSPECTIVE": ((-62.0, -48.0, 58.0), (0.0, 80.0, 0.0), None, None, (1600, 900)),
}


def render(samples: int = 16) -> list[Path]:
    import addon_utils  # importable only after bpy
    addon_utils.enable("cycles", default_set=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "Standard"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.color = (0.05, 0.06, 0.09)
    bg = scene.world.node_tree.nodes.get("Background") if scene.world.node_tree else None
    if bg:
        bg.inputs["Color"].default_value = (0.05, 0.06, 0.09, 1)
        bg.inputs["Strength"].default_value = 1.0
    sun = bpy.data.objects.new("_sun", bpy.data.lights.new("_sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(35), math.radians(-20), math.radians(30))
    scene.collection.objects.link(sun)

    # One override material: base colour and glow from each object's colour (alpha = glow strength).
    mat = bpy.data.materials.new("_screen_object_colour")
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    info = nt.nodes.new("ShaderNodeObjectInfo")
    nt.links.new(info.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(info.outputs["Color"], bsdf.inputs["Emission Color"])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = 0.9
    nt.links.new(info.outputs["Alpha"], mul.inputs[0])
    nt.links.new(mul.outputs[0], bsdf.inputs["Emission Strength"])
    bpy.context.view_layer.material_override = mat

    for c in ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_WATCHER", "LIGHTING"):
        for o in bpy.data.collections[c].objects:
            o.color = (0.40, 0.40, 0.43, 0.0) if c != "VISUAL_WATCHER" else (0.55, 0.5, 0.45, 0.0)
    for o in bpy.data.collections["REFERENCE"].objects:
        o.hide_render = True
    for c in ("GAMEPLAY_COLLISION", "GAMEPLAY_TRIGGERS", "GAMEPLAY_BOUNDARIES", "WATCHER_REFERENCE"):
        for o in bpy.data.collections[c].objects:
            if o.type == "MESH":
                w = o.modifiers.new("_wire", "WIREFRAME")
                w.thickness = 0.35 if max(o.dimensions) > 20 else 0.12
                w.use_replace = True
    mark = bpy.data.collections.new("_SCREENSHOT_MARKERS")
    scene.collection.children.link(mark)
    sphere = cb.sphere_mesh("_marker", 1.0, 12, 8)
    for cname, colour in EMPTY_COLOURS.items():
        for o in bpy.data.collections[cname].objects:
            if o.type != "EMPTY":
                continue
            if cname == "PLAYER_SPAWNS":
                continue  # the capsules already show the spawns
            m = cb.place(f"_mk_{o.name}", sphere, mark, o.matrix_world.translation)
            m.color = colour
            m.scale = (1.4, 1.4, 1.4)

    out = []
    OUT.mkdir(exist_ok=True)
    for name, (loc, target, rot, ortho, res) in VIEWS.items():
        cam_data = bpy.data.cameras.new(f"_cam_{name}")
        cam = bpy.data.objects.new(f"_cam_{name}", cam_data)
        mark.objects.link(cam)
        cam.location = loc
        if target:
            cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
            cam_data.lens = 24
        else:
            cam.rotation_euler = rot
        if ortho:
            cam_data.type = "ORTHO"
            cam_data.ortho_scale = ortho
        cam_data.clip_end = 2000
        if name == "SIDE":
            cam_data.clip_start = 203.0  # start just past the outer barrier and tree line (X < -47)
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = res
        scene.render.resolution_percentage = 100
        path = OUT / f"STAGE_01_COLLISION_{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print("Rendered", path.relative_to(ROOT))
        out.append(path)
    return out


if __name__ == "__main__":
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / "blender/scenes/STAGE_01_COLLISION_READY.blend"))
    render()
