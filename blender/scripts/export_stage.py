"""Export a stage: runtime GLB plus collision and marker JSON for the server.

Follows docs/BLENDER_PIPELINE.md §7: +Y up, modifiers applied, custom properties as glTF extras,
no lights or cameras, never the COL or _WORK collections. Collision and marker JSON use game
(Y-up) coordinates in metres.

    python blender/scripts/export_stage.py --blend blender/scenes/STG01_RedLightGreenLight.blend --stage STG01
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402

import cn_blender as cb  # noqa: E402

RUNTIME_COLLECTIONS = ("ENV", "PROPS", "GMK")


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
    for suffix in RUNTIME_COLLECTIONS:
        col = bpy.data.collections[f"{args.stage}_{suffix}"]
        for obj in col.all_objects:
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
    col_objs = [o for o in bpy.data.collections[f"{args.stage}_COL"].all_objects if o.type == "MESH"]
    # Camera-only colliders (COL_CAM_*) go in their own list; the server only reads "colliders".
    collision = {**meta,
                 "colliders": [collision_entry(o) for o in col_objs if o.get("col_type") != "camera"],
                 "camera_colliders": [collision_entry(o) for o in col_objs if o.get("col_type") == "camera"]}
    markers = {**meta, "markers": [marker_entry(o) for o in sorted(bpy.data.collections[f"{args.stage}_GMK"].all_objects,
                                                                   key=lambda o: o.name)]}
    cb.write_json(out_dir / f"{args.stage}_collision.json", collision)
    cb.write_json(out_dir / f"{args.stage}_markers.json", markers)
    print(f"Exported {glb.name} ({len(exported)} objects), {len(collision['colliders'])} colliders, "
          f"{len(markers['markers'])} markers -> {out_dir}")


if __name__ == "__main__":
    main()
