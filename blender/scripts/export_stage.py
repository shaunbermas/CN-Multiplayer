"""Export a stage: runtime GLB, collision and marker JSON for the server, and a metadata JSON.

Follows docs/BLENDER_PIPELINE.md §7: +Y up, modifiers applied, custom properties as glTF extras,
no lights or cameras, never 00_REFERENCE, 06_COLLISION, 08_CAMERAS, _WORK or review-only objects. Collision and marker JSON use game
(Y-up) coordinates in metres.

    python blender/scripts/export_stage.py --blend blender/scenes/STAGE_01_GREYBOX.blend --stage STG01
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402

import cn_blender as cb  # noqa: E402

from cn_blender import COLL, RUNTIME, is_review_only  # noqa: E402


def bbox_world(obj):
    if obj.type == "MESH" and obj.data.vertices:
        pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
        return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]
    t = obj.matrix_world.translation
    return [t.x, t.y, t.z], [t.x, t.y, t.z]


def metadata_entry(obj, coll_name: str) -> dict:
    import math
    mn, mx = bbox_world(obj)
    e = obj.matrix_world.to_euler()
    entry = {
        "id": obj.name,
        "name": obj.name,
        "collection": coll_name,
        "type": obj.type,
        "role": obj.get("role", ""),
        "review_only": is_review_only(obj),
        "location_m": [round(v, 3) for v in obj.matrix_world.translation],
        "rotation_deg": [round(math.degrees(a), 2) for a in e],
        "dimensions_m": [round(b - a, 3) for a, b in zip(mn, mx)],
        "bounds_min_m": [round(v, 3) for v in mn],
        "bounds_max_m": [round(v, 3) for v in mx],
    }
    for k in ("index", "spawn", "kind", "trigger_role", "col_type", "facing", "y_min", "y_max"):
        if k in obj:
            entry[k] = obj[k] if not hasattr(obj[k], "to_list") else obj[k].to_list()
    return entry


def gltf_export(filepath: Path) -> None:
    wanted = dict(
        filepath=str(filepath), export_format="GLB", use_selection=True, export_extras=True,
        export_yup=True, export_apply=True, export_lights=False, export_cameras=False,
        export_materials="EXPORT",
    )
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in wanted.items() if k in known})


def collision_entry(obj) -> dict:
    loc, rot, scale = obj.matrix_world.decompose()
    # Boxes are built with the origin at the bottom centre; report the geometric centre.
    corners = [obj.matrix_world @ v.co for v in obj.data.vertices]
    mn = [min(c[i] for c in corners) for i in range(3)]
    mx = [max(c[i] for c in corners) for i in range(3)]
    centre = [(a + b) / 2 for a, b in zip(mn, mx)]
    size_b = [b - a for a, b in zip(mn, mx)]
    entry = {
        "id": obj.name,
        "shape": obj.get("col_shape", "box"),
        "type": obj.get("col_type", "solid"),
        "center": cb.to_game(centre),
        "size": [round(size_b[0], 4), round(size_b[2], 4), round(size_b[1], 4)],
        "rotation": cb.quat_to_game(rot),
    }
    if "trigger_role" in obj:
        entry["role"] = obj["trigger_role"]
    return entry


def marker_entry(obj) -> dict:
    props = {k: (list(v) if hasattr(v, "__len__") and not isinstance(v, str) else v)
             for k, v in obj.items() if not k.startswith("_")}
    # Forward is local -Y in Blender (BLENDER_PIPELINE.md §4); report it in game coordinates.
    from mathutils import Vector
    forward = (obj.matrix_world.to_3x3() @ Vector((0.0, -1.0, 0.0))).normalized()
    return {"id": obj.name, "position": cb.to_game(obj.matrix_world.translation),
            "forward": cb.to_game(forward), **props}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--blend", required=True)
    ap.add_argument("--stage", required=True, help="Stage prefix, e.g. STG01")
    ap.add_argument("--out-dir", default=None)
    args = cb.parse_args(ap)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
    scene = bpy.context.scene
    out_dir = Path(args.out_dir or cb.REPO_ROOT / "blender/exports" / args.stage)
    out_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    exported = []
    for key in RUNTIME:
        for obj in bpy.data.collections[COLL[key]].all_objects:
            if is_review_only(obj):
                continue
            obj.hide_set(False)
            obj.select_set(True)
            exported.append(obj.name)
    glb = out_dir / f"{Path(bpy.data.filepath).stem}.glb"
    gltf_export(glb)

    meta = {
        "stage": args.stage,
        "source": f"blender/scenes/{Path(bpy.data.filepath).name}",
        "spec_hash": scene.get("cn_spec_hash"),
        "blender": bpy.app.version_string,
        "units": "m",
        "coordinates": "game / glTF: Y up, right-handed; Blender +Y (course direction) = game -Z",
    }
    col_objs = [o for o in bpy.data.collections[COLL["col"]].all_objects if o.type == "MESH"]
    # Camera-only colliders (COL_CAM_*) go in their own list; the server only reads "colliders".
    collision = {**meta,
                 "colliders": [collision_entry(o) for o in col_objs if o.get("col_type") != "camera"],
                 "camera_colliders": [collision_entry(o) for o in col_objs if o.get("col_type") == "camera"]}
    gmk = [o for k in ("zones", "spawns") for o in bpy.data.collections[COLL[k]].all_objects
           if o.type == "EMPTY" and o.name.startswith("GMK_")]
    markers = {**meta, "markers": [marker_entry(o) for o in sorted(gmk, key=lambda o: o.name)]}
    cb.write_json(out_dir / f"{args.stage}_collision.json", collision)
    cb.write_json(out_dir / f"{args.stage}_markers.json", markers)
    objects = [metadata_entry(o, c.name) for c in bpy.context.scene.collection.children if c.name != COLL["work"]
               for o in sorted(c.all_objects, key=lambda o: o.name)]
    metadata = {**meta, "units": {"length": "m", "angle": "deg"},
                "coordinates": "Blender: Z up, X across (west -, east +), Y along the course (start line 0, finish 160); "
                               "game/glTF = (x, z, -y)",
                "collections": list(COLL.values())[:-1], "runtime_glb": glb.name, "object_count": len(objects), "objects": objects}
    cb.write_json(out_dir / f"{Path(bpy.data.filepath).stem}_METADATA.json", metadata)
    print(f"Exported {glb.name} ({len(exported)} objects), {len(collision['colliders'])} colliders, "
          f"{len(markers['markers'])} markers -> {out_dir}")


if __name__ == "__main__":
    main()
