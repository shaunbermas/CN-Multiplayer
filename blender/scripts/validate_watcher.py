"""Validate THE_WATCHER.blend and its exports (Prompt 06), then write THE_WATCHER_ASSET_MANIFEST.json.

Checks: collections; scale (28 m, feet on Z = 0, centred, facing -Y); origins and transforms; rig
(33 named Watcher_ bones, mirrored L/R, hierarchy); rigid skin weights; UVs and LOD1; materials and
textures (glTF-compatible, power of two); clips (nine actions, frame ranges, loops close, every bone
keyed, exactly one lens state per key); anchors; triangle budget; no game logic in the file; and the
GLB export and browser check reports. The manifest follows the Prompt 06 pack schema.

    python blender/scripts/validate_watcher.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402
import watcher_build as wb  # noqa: E402

ROOT = cb.REPO_ROOT
BLEND = ROOT / "blender/scenes/THE_WATCHER.blend"
EXPORT = ROOT / "blender/exports/THE_WATCHER_EXPORT.json"
BROWSER = ROOT / "blender/exports/THE_WATCHER_browser/THE_WATCHER_browser_check.json"
SCHEMA = ROOT / "blender/schemas/THE_WATCHER_ASSET_MANIFEST.schema.json"
MANIFEST = ROOT / "blender/exports/THE_WATCHER_ASSET_MANIFEST.json"
REPORT = ROOT / "blender/exports/THE_WATCHER_VALIDATION.json"
COLLECTIONS = ["WATCHER_CHARACTER", "WATCHER_RIG", "WATCHER_MATERIALS", "WATCHER_ANIMATION", "WATCHER_GAMEPLAY_ANCHORS",
               "WATCHER_COLLISION", "WATCHER_EXPORT"]
ANCHORS = ["Watcher_Root", "Watcher_Facing", "Watcher_OpticalOrigin", "Watcher_DetectionForward", "Watcher_AudioOrigin",
           "Watcher_InteractionBounds"]
NODE_OK = {"OUTPUT_MATERIAL", "BSDF_PRINCIPLED", "TEX_IMAGE", "SEPARATE_COLOR", "NORMAL_MAP"}


def main() -> None:
    checks = {}

    def check(name, problems, detail=None):
        checks[name] = {"pass": not problems, "problems": problems[:25], **(detail or {})}

    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    O = bpy.data.objects
    arm, body, lod = O["Watcher_Rig"], O["Watcher_Body"], O["Watcher_Body_LOD1"]
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion, pb.location, pb.scale = (1, 0, 0, 0), (0, 0, 0), (1, 1, 1)
    bpy.context.view_layer.update()

    # collections
    names = [c.name for c in bpy.context.scene.collection.children]
    p = [f"collection {c} missing" for c in COLLECTIONS if c not in names]
    p += [f"unexpected collection {c} in the saved file" for c in names if c not in COLLECTIONS]
    p += [f"{o.name} ({o.type}) saved in the file: cameras and lights belong to render scripts" for o in O if o.type in ("CAMERA", "LIGHT")]
    check("collections", p, {"collections": names})

    # scale, origin, facing (evaluated in rest pose)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
    mn = Vector([min(q[i] for q in pts) for i in range(3)])
    mx = Vector([max(q[i] for q in pts) for i in range(3)])
    p = []
    if abs(mx.z - wb.HEIGHT) > 0.01 or abs(mn.z) > 0.01:
        p.append(f"height spans Z {mn.z:.3f}..{mx.z:.3f}, expected 0..{wb.HEIGHT}")
    if abs((mn.x + mx.x) / 2) > 0.05:
        p.append("not centred on X")
    eye = O["Watcher_OpticalOrigin"].matrix_world.translation
    fwd = O["Watcher_DetectionForward"].matrix_world.translation
    if not (fwd.y < eye.y - 3):
        p.append("does not face -Y")
    for o in (arm, body):
        if o.matrix_world.translation.length > 1e-6 or any(abs(s - 1) > 1e-6 for s in o.scale) or any(abs(r) > 1e-6 for r in o.rotation_euler):
            p.append(f"{o.name} transform is not identity at the origin")
    check("scale_origin", p, {"height_m": round(mx.z - mn.z, 3), "bounds_min": [round(v, 3) for v in mn], "bounds_max": [round(v, 3) for v in mx],
                              "optical_origin_m": [round(v, 3) for v in eye], "scale_source": "docs/STAGE_01_SPEC.md L9 (28 m, decision 014)"})

    # rig
    want = [b[0] for b in wb.BONES]
    bones = [b.name for b in arm.data.bones]
    p = [f"bone {b} missing" for b in want if b not in bones] + [f"unexpected bone {b}" for b in bones if b not in want]
    p += [f"{b} lacks the Watcher_ prefix" for b in bones if not b.startswith("Watcher_")]
    for b in arm.data.bones:
        if b.name.endswith("_L"):
            r = arm.data.bones.get(b.name[:-2] + "_R")
            if not r or (b.head_local - Vector((-r.head_local.x, r.head_local.y, r.head_local.z))).length > 1e-4:
                p.append(f"{b.name} has no mirrored _R partner")
    parents = {n: par for n, _, _, par in wb.BONES}
    for b in arm.data.bones:
        if (b.parent.name if b.parent else None) != parents.get(b.name):
            p.append(f"{b.name} parent is {b.parent.name if b.parent else None}, expected {parents.get(b.name)}")
    check("rig", p, {"bones": len(bones), "root": "Watcher_Root"})

    # rigid weights
    p = []
    gnames = [g.name for g in body.vertex_groups]
    bad = [v.index for v in body.data.vertices if len(v.groups) != 1 or abs(v.groups[0].weight - 1.0) > 1e-6]
    if bad:
        p.append(f"{len(bad)} vertices are not rigidly weighted to exactly one bone")
    p += [f"vertex group {g} has no bone" for g in gnames if g not in bones]
    if not any(m.type == "ARMATURE" and m.object == arm for m in body.modifiers):
        p.append("Watcher_Body has no Armature modifier for Watcher_Rig")
    check("skin_weights", p, {"vertex_groups": len(gnames), "vertices": len(body.data.vertices)})

    # UVs and LOD
    tri = lambda o: sum(len(q.vertices) - 2 for q in o.data.polygons)  # noqa: E731
    p = []
    if not body.data.uv_layers:
        p.append("no UV map")
    else:
        uv = body.data.uv_layers[0].data
        if any(not (abs(d.uv.x) < 1e4 and abs(d.uv.y) < 1e4) for d in uv):
            p.append("invalid UV values")
    t0, t1 = tri(body), tri(lod)
    if t0 > 40000:
        p.append(f"LOD0 has {t0} triangles (budget 40,000; raised for the face and hair, decision 039)")
    if not (0.35 < t1 / t0 < 0.65):
        p.append(f"LOD1 is {t1} triangles ({t1 / t0:.0%} of LOD0), expected about half")
    if len(lod.vertex_groups) != len(body.vertex_groups):
        p.append("LOD1 lost vertex groups")
    check("geometry_uvs_lod", p, {"triangles_lod0": t0, "triangles_lod1": t1, "budget": 40000})

    # materials
    p, images = [], {}
    for m in body.data.materials:
        if not m.name.startswith("MAT_Watcher_"):
            p.append(f"material {m.name} lacks the MAT_Watcher_ prefix")
        for n in m.node_tree.nodes:
            if n.type not in NODE_OK:
                p.append(f"{m.name}: node {n.type} not glTF-exportable")
            if n.type == "TEX_IMAGE":
                w, h = n.image.size
                if w & (w - 1) or h & (h - 1) or max(w, h) > 2048:
                    p.append(f"{n.image.name} is {w}x{h}")
                if not Path(bpy.path.abspath(n.image.filepath)).exists():
                    p.append(f"{n.image.name} missing on disk")
                images[n.image.name] = [w, h]
    for s in ("Neutral", "Red", "Green"):
        if f"MAT_Watcher_Lens_{s}" not in [m.name for m in body.data.materials]:
            p.append(f"MAT_Watcher_Lens_{s} missing")
    check("materials", p, {"materials": len(body.data.materials), "images": images})

    # clips
    p, clips = [], []
    for name, (loop, keys) in wb.CLIPS.items():
        act = bpy.data.actions.get(name)
        if act is None:
            p.append(f"action {name} missing")
            continue
        f0, f1 = int(act.frame_start), int(act.frame_end)
        clips.append({"name": name, "frame_start": f0, "frame_end": f1, "loop": loop})
        fcs = wb._fcurves(act)
        keyed = {re.search(r'pose\.bones\["([^"]+)"\]', fc.data_path).group(1) for fc in fcs if "pose.bones" in fc.data_path}
        missing = set(bones) - keyed
        if missing:
            p.append(f"{name}: bones not keyed: {sorted(missing)[:4]}")
        if loop:
            for fc in fcs:
                if fc.data_path.endswith("rotation_quaternion") and abs(fc.evaluate(f0) - fc.evaluate(f1)) > 1e-4 and "Watcher_Key" not in fc.data_path:
                    p.append(f"{name}: loop does not close ({fc.data_path}[{fc.array_index}])")
                    break
        arm.animation_data.action = act
        for f in sorted({int(k.co.x) for fc in fcs for k in fc.keyframe_points}):
            bpy.context.scene.frame_set(f)
            on = [n for n in wb.LENS if arm.pose.bones[n].scale.x > 0.5]
            if len(on) != 1:
                p.append(f"{name} frame {f}: {len(on)} lens states visible")
    arm.animation_data.action = None
    check("animations", p, {"fps": bpy.context.scene.render.fps, "clips": clips})

    # anchors
    p = []
    for a in ANCHORS:
        o = O.get(a)
        if o is None:
            p.append(f"anchor {a} missing")
        elif o.users_collection[0].name != "WATCHER_GAMEPLAY_ANCHORS" or o.parent != arm:
            p.append(f"anchor {a} is not a rig-parented object in WATCHER_GAMEPLAY_ANCHORS")
    check("anchors", p, {"anchors": ANCHORS})

    # no game logic
    p = []
    if len(bpy.data.texts):
        p.append("text blocks / scripts in the file")
    banned = re.compile(r"elimin|spotted|qualif|detect_radius|line_of_sight", re.I)
    for o in O:
        if o.animation_data and o.animation_data.drivers:
            p.append(f"{o.name} has drivers")
        p += [f"{o.name} has rule-like property {k}" for k in o.keys() if banned.search(k)]
    check("no_game_logic", p)

    # exports
    p = []
    if EXPORT.exists():
        ex = json.loads(EXPORT.read_text())["glb_summary"]
        got = sorted(a["name"] for a in ex["animations"])
        if got != sorted(wb.CLIPS):
            p.append(f"GLB animations {got} differ from the clips")
        if ex["joints"] != len(bones):
            p.append(f"GLB skin has {ex['joints']} joints")
    else:
        p.append("export report missing: run watcher_export.py")
    if BROWSER.exists():
        br = json.loads(BROWSER.read_text())
        if br["result"] != "PASS":
            p.append(f"browser check failed: {br['errors'][:3]}")
    else:
        p.append("browser check missing: run tools/asset-check/check-watcher.mjs")
    check("glb", p, {"glb": "blender/exports/THE_WATCHER.glb"})

    result = "PASS" if all(c["pass"] for c in checks.values()) else "FAIL"
    manifest = {
        "asset_id": "THE_WATCHER", "character_type": "full_body_robotic_doll", "scale_source": "docs/STAGE_01_SPEC.md",
        "height_m": wb.HEIGHT, "collections": COLLECTIONS, "anchors": ANCHORS, "animations": checks["animations"]["clips"],
        "exports": {"blend": "blender/scenes/THE_WATCHER.blend", "glb": "blender/exports/THE_WATCHER.glb", "fbx": None},
        "validation": {"scale_verified": checks["scale_origin"]["pass"], "rig_verified": checks["rig"]["pass"] and checks["skin_weights"]["pass"],
                       "animations_verified": checks["animations"]["pass"], "materials_verified": checks["materials"]["pass"],
                       "glb_verified": checks["glb"]["pass"]},
    }
    import jsonschema
    errs = [e.message for e in jsonschema.Draft202012Validator(json.loads(SCHEMA.read_text())).iter_errors(manifest)]
    check("manifest_schema", errs, {"schema": str(SCHEMA.relative_to(ROOT))})
    result = "PASS" if all(c["pass"] for c in checks.values()) else "FAIL"
    cb.write_json(MANIFEST, manifest)
    cb.write_json(REPORT, {"result": result, "blend": str(BLEND.relative_to(ROOT)), "checks": checks})
    for n, c in checks.items():
        print(f"{'PASS' if c['pass'] else 'FAIL'}  {n}" + ("" if c["pass"] else f": {c['problems'][:3]}"))
    print("RESULT", result)
    sys.exit(0 if result == "PASS" else 1)


if __name__ == "__main__":
    main()
