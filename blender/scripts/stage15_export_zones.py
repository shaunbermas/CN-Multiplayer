"""Stage 1.5: export scenery footprints from the approved Prompt 05 environment scene (read-only).

Writes blender/stage15/STAGE_01_SCENERY_ZONES.json in GAME coordinates (Y up, course toward -Z;
game = (x, z, -y) of Blender), so the matte-painting and cutout placement never overlaps existing
scenery or the playable yard. The .blend is opened read-only and never saved.
Usage: python blender/scripts/stage15_export_zones.py
"""
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / "blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend"
OUT = ROOT / "blender/stage15/STAGE_01_SCENERY_ZONES.json"

bpy.ops.wm.open_mainfile(filepath=str(SCENE))


def game_box(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    xs = [p.x for p in pts]; ys = [p.y for p in pts]; zs = [p.z for p in pts]
    # Blender (x, y, z) -> game (x, height z, -y)
    return {"min": [min(xs), min(zs), -max(ys)], "max": [max(xs), max(zs), -min(ys)]}


zones, trees = [], []
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    n = o.name
    if n.startswith("STG01_BG_Tree_"):
        p = o.matrix_world.translation
        dims = o.dimensions
        trees.append({"id": n, "pos": [p.x, p.z, -p.y], "height": dims.z, "radius": max(dims.x, dims.y) / 2})
    elif n.startswith(("STG01_BG_", "STG01_Tower", "STG01_Fence", "STG01_Flood", "STG01_Gantry", "STG01_Booth", "STG01_Plinth",
                        "STG01_Wall", "STG01_Gate", "STG01_Bench", "STG01_Barrier", "STG01_Light", "STG01_Machinery", "STG01_Prop")):
        if n.startswith("STG01_BG_Tree_"):
            continue
        zones.append({"id": n, **game_box(o)})

# Overall bounds of every visible mesh (the dressed world) and of the playable yard.
all_pts = []
for o in bpy.data.objects:
    if o.type == "MESH" and not o.hide_render:
        all_pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
world = {"min": [min(p.x for p in all_pts), 0, -max(p.y for p in all_pts)], "max": [max(p.x for p in all_pts), max(p.z for p in all_pts), -min(p.y for p in all_pts)]}
collections = {}
for c in bpy.data.collections:
    if not c.name.startswith(("VISUAL_", "GAMEPLAY_BOUNDARIES")):
        continue
    pts = [o.matrix_world @ Vector(v) for o in c.all_objects if o.type == "MESH" for v in o.bound_box]
    if c.name == "VISUAL_BACKDROP":
        pts = [p for o in c.all_objects if o.type == "MESH" and not o.name.startswith("STG01_BG_Ground")
               for p in (o.matrix_world @ Vector(v) for v in o.bound_box)]
    if pts:
        collections[c.name] = {"min": [min(p.x for p in pts), min(p.z for p in pts), -max(p.y for p in pts)],
                               "max": [max(p.x for p in pts), max(p.z for p in pts), -min(p.y for p in pts)]}
meta = json.loads((ROOT / "blender/exports/STAGE_01_METADATA.json").read_text())
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({
    "source": str(SCENE.relative_to(ROOT)), "coordinates": "game: Y up, course toward -Z (x, z, -y of Blender)",
    "world_bounds": world, "collections": collections, "existing_trees": trees, "scenery_zones": zones,
    "metadata_stage": meta.get("stage", meta.get("stage_id")),
}, indent=1))
print(f"{len(trees)} trees, {len(zones)} zones, world {world}")
