"""Export the shared contestant for the browser (owner pack, 22 Nov 2026).

  python blender/scripts/contestant_export.py

Writes blender/exports/contestant/:
  CNTRIAL_CONTESTANT_MASTER.glb        LOD0, LOD1, LOD2 skinned to ONE armature, 16 clips, COLOR_0 = `CNT`
                                       (R region id / 15, G baked AO), UVs and tangents for the shared maps
  CNTRIAL_CONTESTANT_MASTER.meshopt.glb  the runtime copy (meshopt, via tools/stage15/glb/derive_contestant.mjs)
  CNT_Detail.webp, CNT_Normal.webp     the shared texture set (detail lossless, normal q92; no alpha)
  CNTRIAL_CONTESTANT_MANIFEST.json     meshes, skeleton, clips, regions, textures, colourways, scale, sizes
Material data is not exported: the game builds one shared material and recolours it per colourway.
"""
from __future__ import annotations

import json
import struct
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from PIL import Image  # noqa: E402

import cn_blender as cb  # noqa: E402
import contestant_build as CB  # noqa: E402
import contestant_geometry as G  # noqa: E402

ROOT = cb.REPO_ROOT
BLEND = ROOT / "blender/scenes/CNTRIAL_CONTESTANT_MASTER.blend"
OUTD = ROOT / "blender/exports/contestant"
GLB = OUTD / "CNTRIAL_CONTESTANT_MASTER.glb"
RUNTIME = OUTD / "CNTRIAL_CONTESTANT_MASTER.meshopt.glb"
MANIFEST = OUTD / "CNTRIAL_CONTESTANT_MANIFEST.json"


def read_glb(path: Path) -> dict:
    data = path.read_bytes()
    jlen = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + jlen]), len(data)


def main() -> None:
    OUTD.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    lods = [bpy.data.objects[f"CNT_Contestant_LOD{i}"] for i in range(3)]
    arm = bpy.data.objects["CNT_Rig"]
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in lods + [arm]:
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    for o in lods:  # triangulate (stable tangents) without saving the .blend
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()
    arm.animation_data.action = None
    bpy.context.view_layer.objects.active = arm
    opts = dict(filepath=str(GLB), export_format="GLB", use_selection=True, export_extras=False, export_yup=True,
                export_apply=False, export_lights=False, export_cameras=False, export_materials="PLACEHOLDER",
                export_vertex_color="NAME", export_vertex_color_name="CNT", export_all_vertex_colors=False,
                export_tangents=True, export_normals=True, export_texcoords=True, export_attributes=False,
                export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_step=1,
                export_anim_slide_to_zero=True, export_skins=True, export_def_bones=False, export_influence_nb=4,
                export_reset_pose_bones=True, export_rest_position_armature=True, export_optimize_animation_size=True,
                export_anim_single_armature=True, export_leaf_bone=False, export_morph=False)
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in known})

    # shared textures: lossless WebP, RGB only
    tex = {}
    for name in ("CNT_Detail", "CNT_Normal"):
        im = Image.open(ROOT / f"blender/textures/CONTESTANT/{name}.png").convert("RGB")
        p = OUTD / f"{name}.webp"
        if name == "CNT_Detail":
            im.save(p, "WEBP", lossless=True, method=6)  # lossless: chroma subsampling would smear the stitch mask
        else:
            im.save(p, "WEBP", quality=92, method=6)
        tex[name] = {"file": p.name, "bytes": p.stat().st_size, "px": im.size[0]}

    subprocess.run(["node", str(ROOT / "tools/stage15/glb/derive_contestant.mjs")], check=True, cwd=ROOT)

    g, size = read_glb(GLB)
    _, rsize = read_glb(RUNTIME)
    anims = []
    for a in g.get("animations", []):
        tmax = max(g["accessors"][s["input"]].get("max", [0])[0] for s in a["samplers"])
        act = bpy.data.actions.get(a["name"])
        anims.append({"name": a["name"], "duration_s": round(tmax, 3), "loop": bool(act.get("loop")) if act else None,
                      "use": act.get("use") if act else None, "channels": len(a["channels"])})
    meshes = []
    for n in g["nodes"]:
        if "mesh" in n:
            m = g["meshes"][n["mesh"]]
            tris = sum(g["accessors"][p["indices"]]["count"] // 3 for p in m["primitives"])
            meshes.append({"node": n["name"], "triangles": tris, "primitives": len(m["primitives"]),
                           "attributes": sorted(m["primitives"][0]["attributes"])})
    skin = g["skins"][0]
    manifest = {
        "asset": "CNTRIAL_CONTESTANT_MASTER", "version": 1, "date": "2026-11-22",
        "blend": str(BLEND.relative_to(ROOT)), "glb": str(GLB.relative_to(ROOT)), "runtime_glb": str(RUNTIME.relative_to(ROOT)),
        "bytes": {"glb": size, "runtime_glb": rsize, **{t["file"]: t["bytes"] for t in tex.values()}},
        "units": "metres", "up": "+Y (glTF)", "facing": "+Z in glTF (Blender -Y); the game turns the model by 180 degrees",
        "height_m": G.H_TOTAL, "gameplay_capsule": {"height_m": 1.2, "radius_m": 0.3, "note": "collision is the server capsule; the mesh never affects it"},
        "lods": meshes,
        "lod_policy": {"LOD0": "close / hero (camera under ~7 m)", "LOD1": "normal gameplay view", "LOD2": "distant crowd (over ~20 m)"},
        "skeleton": {"joints": len(skin["joints"]), "names": [g["nodes"][j]["name"] for j in skin["joints"]], "root": "CNT_Root"},
        "clips": anims,
        "vertex_colour": {"name": "COLOR_0 (Blender attribute CNT)", "R": "region id / 15", "G": "baked ambient occlusion (0.55..1)"},
        "regions": {k: v for k, v in G.REGION.items()},
        "fixed_region_colours": G.FIXED_COLOURS,
        "colourway_regions": list(CB.CW_KEYS),
        "textures": {"CNT_Detail": {**tex["CNT_Detail"], "channels": "R cavity x0.85 + edge wear (0.85 neutral), G roughness, B stitch mask (trim colour)"},
                     "CNT_Normal": {**tex["CNT_Normal"], "channels": "tangent-space normal, OpenGL/glTF convention"}},
        "uv_atlas": {k: [round(x, 5) for x in v] for k, v in G.ATLAS.items()},
        "material": "one shared material; per-player colour parameters only (no per-player textures)",
        "colorways": "packages/shared/src/contestant-colorways.json (30 records)",
        "emblem": dict(G.EMBLEM, mesh_part="CNT_Emblem (region 6)"),
        "blender": bpy.app.version_string,
    }
    cb.write_json(MANIFEST, manifest)
    print(json.dumps({"glb_MB": round(size / 1e6, 3), "runtime_MB": round(rsize / 1e6, 3), "lods": [(m["node"], m["triangles"]) for m in meshes],
                      "joints": len(skin["joints"]), "clips": len(anims), "textures": {k: v["bytes"] for k, v in tex.items()}}))


if __name__ == "__main__":
    main()
