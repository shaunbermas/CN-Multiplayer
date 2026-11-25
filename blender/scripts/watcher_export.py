"""Export THE_WATCHER.glb (Prompt 06): skinned LOD0 mesh, Watcher_ armature, gameplay anchors and all
animation clips. No cameras, lights, collision, swatches, LOD1 or render helpers.

Writes blender/exports/THE_WATCHER.glb and blender/exports/THE_WATCHER_EXPORT.json (counts read back
from the GLB). FBX is not exported: the project pipeline is glTF-only (decision 016, browser runtime).

    python blender/scripts/watcher_export.py
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
BLEND = ROOT / "blender/scenes/THE_WATCHER.blend"
GLB = ROOT / "blender/exports/THE_WATCHER.glb"
REPORT = ROOT / "blender/exports/THE_WATCHER_EXPORT.json"
EXPORT_COLLECTIONS = ("WATCHER_CHARACTER", "WATCHER_RIG", "WATCHER_GAMEPLAY_ANCHORS")


def read_glb(path: Path) -> dict:
    data = path.read_bytes()
    jlen = struct.unpack_from("<I", data, 12)[0]
    g = json.loads(data[20:20 + jlen])
    anims = []
    for a in g.get("animations", []):
        tmax = 0.0
        for s in a["samplers"]:
            acc = g["accessors"][s["input"]]
            tmax = max(tmax, acc.get("max", [0])[0])
        anims.append({"name": a["name"], "channels": len(a["channels"]), "duration_s": round(tmax, 3)})
    skins = g.get("skins", [])
    return {"bytes": len(data), "nodes": len(g["nodes"]), "meshes": len(g.get("meshes", [])),
            "primitives": sum(len(m["primitives"]) for m in g.get("meshes", [])),
            "skins": len(skins), "joints": len(skins[0]["joints"]) if skins else 0,
            "joint_names": [g["nodes"][j]["name"] for j in skins[0]["joints"]] if skins else [],
            "materials": sorted(m["name"] for m in g.get("materials", [])), "images": len(g.get("images", [])),
            "animations": anims, "extensions_used": g.get("extensionsUsed", [])}


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    scene = bpy.context.scene
    for o in scene.objects:
        o.select_set(o.users_collection[0].name in EXPORT_COLLECTIONS)
    arm = bpy.data.objects["Watcher_Rig"]
    arm.animation_data.action = None
    bpy.context.view_layer.objects.active = arm
    opts = dict(filepath=str(GLB), export_format="GLB", use_selection=True, export_extras=True, export_yup=True,
                export_apply=False, export_lights=False, export_cameras=False, export_materials="EXPORT",
                export_image_format="WEBP", export_image_quality=88, export_tangents=False,  # decision 041: no normal maps
                export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
                export_anim_slide_to_zero=True, export_skins=True, export_def_bones=False,
                export_reset_pose_bones=True, export_rest_position_armature=True, export_optimize_animation_size=False,
                export_anim_single_armature=True, export_leaf_bone=False)
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in known})
    body = bpy.data.objects["Watcher_Body"]
    lod1 = bpy.data.objects["Watcher_Body_LOD1"]
    tri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)  # noqa: E731
    report = {"glb": str(GLB.relative_to(ROOT)), "blend": str(BLEND.relative_to(ROOT)), "blender": bpy.app.version_string,
              "fps": scene.render.fps, "triangles_lod0": tri(body), "triangles_lod1": tri(lod1),
              "clips_in_blend": {a.name: [int(a.frame_start), int(a.frame_end), bool(a.get("loop", False))] for a in bpy.data.actions},
              "glb_summary": read_glb(GLB)}
    cb.write_json(REPORT, report)
    s = report["glb_summary"]
    print(json.dumps({"MB": round(s["bytes"] / 1e6, 2), "joints": s["joints"], "animations": [a["name"] for a in s["animations"]],
                      "materials": len(s["materials"]), "primitives": s["primitives"]}))


if __name__ == "__main__":
    main()
