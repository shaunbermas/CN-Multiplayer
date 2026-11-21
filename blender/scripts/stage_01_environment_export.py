"""Export the Stage 01 environment test GLB and the runtime lighting description (Prompt 05).

Reads blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend (never saves it) and writes:
- blender/exports/STAGE_01_ENVIRONMENT.glb: the visual environment for Three.js. Static meshes are
  merged per visual collection (one mesh, one primitive per material) to keep draw calls low; objects
  the runtime animates or recolours stay separate and named (The Shepherd placeholder parts, the start
  barrier arm, the timer board, the haze cards, the yard ground). Gameplay anchors (spawns, signal,
  watcher, spectator and course markers) travel as empties with their properties as glTF extras.
  No collision, triggers, boundaries, cameras, lights or review-only helpers. Textures as WebP.
- blender/exports/STAGE_01_LIGHTING.json: lights, fog and quality tiers in game coordinates (Y up),
  for the runtime to build its own lights (the GLB carries none, by design).
- blender/exports/STAGE_01_ENVIRONMENT_EXPORT.json: counts for the validation report.

    python blender/scripts/stage_01_environment_export.py
"""
from __future__ import annotations

import json
import math
import struct
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
BLEND = ROOT / "blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend"
GLB = ROOT / "blender/exports/STAGE_01_ENVIRONMENT.glb"
LIGHTING = ROOT / "blender/exports/STAGE_01_LIGHTING.json"
REPORT = ROOT / "blender/exports/STAGE_01_ENVIRONMENT_EXPORT.json"

VISUAL = ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_SIGNAL_DEVICES", "VISUAL_MACHINERY",
          "VISUAL_FOLIAGE", "VISUAL_BACKDROP", "VISUAL_WATCHER", "VISUAL_VFX")
ANCHORS = ("PLAYER_SPAWNS", "SIGNAL_ANCHORS", "WATCHER_REFERENCE", "SPECTATOR_LOCATIONS", "GAMEPLAY_MARKERS")
# Kept as separate named nodes: animated, recoloured, toggled by quality tier, or used for checks.
KEEP_SEPARATE = ("ENM_Shepherd_Placeholder_", "PRP_STG01_StartBarrier_Arm", "PRP_STG01_JudgesBooth_TimerBoard",
                 "VFX_GroundHaze", "STG01_Ground_Yard")


def coll(o) -> str:
    return o.users_collection[0].name if o.users_collection else ""


def tris(o) -> int:
    return sum(len(p.vertices) - 2 for p in o.data.polygons) if o.type == "MESH" else 0


def g(v) -> list[float]:
    """Blender (Z up) -> game / glTF (Y up)."""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def lighting_json() -> dict:
    lights = []
    for o in sorted(bpy.data.collections["LIGHTING"].objects, key=lambda o: o.name):
        L = o.data
        d = (o.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
        e = {"id": o.name, "type": o.get("runtime", L.type.lower()), "position": g(o.matrix_world.translation),
             "direction": g(d), "color": [round(c, 3) for c in L.color], "blenderWatts": round(L.energy, 1)}
        if L.type == "SPOT":
            e.update(angleDeg=round(math.degrees(L.spot_size) / 2, 1), penumbra=round(L.spot_blend, 2), range=60.0)
        if L.type == "AREA":
            e.update(width=round(L.size, 2), height=round(getattr(L, "size_y", L.size), 2))
        if L.type == "POINT":
            e.update(range=25.0)
        if "follows" in o:
            e["follows"] = o["follows"]
        lights.append(e)
    return {
        "stage": "STAGE_01_RED_LIGHT",
        "coordinates": "game (metres, Y up, course toward -Z): game = (x, z, -y) of Blender",
        "note": ("Blender watts do not map 1:1 to Three.js intensities; tune intensity in the client. Signal colours "
                 "come from the MAT_Signal_Red / _Amber / _Green and MAT_Shepherd_Lantern materials (emissive), "
                 "which the runtime drives; no signal colour is baked into a texture."),
        "toneMapping": {"type": "ACESFilmic", "exposure": 1.0},
        "background": {"top": [0.06, 0.035, 0.10], "horizon": [0.035, 0.11, 0.12]},
        "ambient": {"type": "hemisphere", "sky": [0.25, 0.42, 0.45], "ground": [0.05, 0.05, 0.06], "intensity": 0.6},
        "fog": {"type": "exp2", "color": [0.06, 0.13, 0.14], "density": 0.0045,
                "rule": "The Shepherd's rim light and silhouette must stay readable from the start line (design spec §12)"},
        "lights": lights,
        "qualityTiers": {
            "low": {"fog": "linear 60-260 m", "hazeCards": False, "dust": 0, "dynamicLights": ["LGT_STG01_Moon"],
                    "notes": "Floodlight pools come from emissive lamps only; ambient raised by 30 %"},
            "medium": {"fog": "exp2", "hazeCards": False, "dust": 150,
                       "dynamicLights": ["LGT_STG01_Moon", "LGT_STG01_Flood_*", "LGT_STG01_ShepherdRim"], "shadows": False},
            "high": {"fog": "exp2", "hazeCards": True, "dust": 400, "dynamicLights": "all", "shadows": ["LGT_STG01_Moon"]},
        },
        "particles": {"dust": {"area": {"min": [-45, 1, -190], "max": [45, 20, 20]}, "size": [0.01, 0.03],
                               "color": [1.0, 0.75, 0.5], "speed": 0.15, "additive": True}},
        "runtimeMaterials": ["MAT_Signal_Red", "MAT_Signal_Amber", "MAT_Signal_Green", "MAT_Shepherd_Lantern",
                             "MAT_TimerBoard_Screen", "MAT_VFX_Haze"],
    }


def glb_summary(path: Path) -> dict:
    data = path.read_bytes()
    jlen = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + jlen])
    prims = sum(len(m["primitives"]) for m in gltf.get("meshes", []))
    mesh_nodes = [n for n in gltf["nodes"] if "mesh" in n]
    draw = sum(len(gltf["meshes"][n["mesh"]]["primitives"]) for n in mesh_nodes)
    images = []
    for img in gltf.get("images", []):
        bv = gltf["bufferViews"][img["bufferView"]]
        images.append({"name": img.get("name"), "mimeType": img.get("mimeType"), "bytes": bv["byteLength"]})
    return {"bytes": len(data), "nodes": len(gltf["nodes"]), "mesh_nodes": len(mesh_nodes), "meshes": len(gltf.get("meshes", [])),
            "primitives": prims, "draw_calls_estimate": draw, "materials": sorted(m["name"] for m in gltf.get("materials", [])),
            "textures": len(gltf.get("textures", [])), "images": images, "extensions_used": gltf.get("extensionsUsed", [])}


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    scene = bpy.context.scene

    # Inventory of the modular scene before merging.
    modular = defaultdict(lambda: {"objects": 0, "triangles": 0, "unique_meshes": set()})
    for o in scene.objects:
        c = coll(o)
        if c in VISUAL and o.type == "MESH" and not o.get("review_only"):
            modular[c]["objects"] += 1
            modular[c]["triangles"] += tris(o)
            modular[c]["unique_meshes"].add(o.data.name)
    modular = {c: {**v, "unique_meshes": len(v["unique_meshes"])} for c, v in sorted(modular.items())}

    LIGHTING.write_text(json.dumps(lighting_json(), indent=2) + "\n")

    # Remove everything that is not exported.
    for o in list(scene.objects):
        c = coll(o)
        keep = (c in VISUAL and o.type == "MESH" and not o.get("review_only")) or (c in ANCHORS and o.type == "EMPTY")
        if not keep:
            bpy.data.objects.remove(o, do_unlink=True)

    # Triangulate n-gons (cylinder caps, decals) so the exporter can write tangents for normal maps.
    import bmesh
    for me in {o.data for o in scene.objects if o.type == "MESH"}:
        bm = bmesh.new()
        bm.from_mesh(me)
        ngons = [f for f in bm.faces if len(f.verts) > 4]
        if ngons:
            bmesh.ops.triangulate(bm, faces=ngons)
            bm.to_mesh(me)
        bm.free()

    # Every exported mesh carries the same UV layer name, so materials map to TEXCOORD_0.
    for o in scene.objects:
        if o.type == "MESH" and "UVMap" not in o.data.uv_layers:
            if len(o.data.uv_layers):
                o.data.uv_layers[0].name = "UVMap"
            else:
                o.data.uv_layers.new(name="UVMap")

    # Merge static meshes per collection.
    merged = {}
    for c in VISUAL:
        objs = [o for o in bpy.data.collections[c].objects if o.type == "MESH" and not o.name.startswith(KEEP_SEPARATE)]
        if not objs:
            continue
        me = bpy.data.meshes.new(f"ENV_{c}")
        me.uv_layers.new(name="UVMap")
        target = bpy.data.objects.new(f"ENV_{c}", me)
        bpy.data.collections[c].objects.link(target)
        target["merged_from"] = len(objs)
        for o in scene.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        target.select_set(True)
        with bpy.context.temp_override(active_object=target, object=target, selected_objects=objs + [target],
                                       selected_editable_objects=objs + [target]):
            bpy.ops.object.join()
        merged[c] = {"objects": len(objs), "triangles": tris(target), "materials": len(target.data.materials)}

    for o in scene.objects:
        o.select_set(True)
    opts = dict(filepath=str(GLB), export_format="GLB", use_selection=True, export_extras=True, export_yup=True,
                export_apply=True, export_lights=False, export_cameras=False, export_materials="EXPORT",
                export_image_format="WEBP", export_image_quality=88, export_texcoords=True, export_normals=True,
                export_tangents=True)
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in known})

    summary = glb_summary(GLB)
    exported_tris = sum(tris(o) for o in scene.objects if o.type == "MESH")
    report = {
        "glb": str(GLB.relative_to(ROOT)), "blend": str(BLEND.relative_to(ROOT)), "blender": bpy.app.version_string,
        "modular_scene": modular, "merged_for_export": merged,
        "separate_nodes": sorted(o.name for o in scene.objects if o.type == "MESH" and o.name.startswith(KEEP_SEPARATE)),
        "anchor_empties": sum(1 for o in scene.objects if o.type == "EMPTY"),
        "triangles": exported_tris, "glb_summary": summary,
    }
    cb.write_json(REPORT, report)
    print(json.dumps({"glb_MB": round(summary["bytes"] / 1e6, 2), "triangles": exported_tris,
                      "draw_calls": summary["draw_calls_estimate"], "materials": len(summary["materials"]),
                      "images": len(summary["images"])}))


if __name__ == "__main__":
    main()
