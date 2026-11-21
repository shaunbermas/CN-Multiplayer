"""Validate the Stage 01 environment scene (Prompt 05).

Checks STAGE_01_ENVIRONMENT_FINAL.blend against the approved collision-ready scene and the metadata:
  gameplay_unchanged   every object in the gameplay collections is identical to the collision-ready
                       scene (names, types, transforms, mesh vertices, properties)
  metadata_gameplay    the gameplay sections of STAGE_01_METADATA.json rebuild identically from this scene
  metadata_checks      the Prompt 04 checks still pass here (proxies still contain their rebuilt visuals,
                       runtime exports agree, ...); only the scene-object inventory differs, as expected
  yard_clear           no visual geometry stands in the yard above the ground, except the approved finish
                       gate and raised start barrier arm, both above 6 m
  sightline            The Shepherd's head is visible from every spawn through the detailed geometry
  collections          visual, collision and lighting kept apart; lights only in LIGHTING
  materials            glTF-compatible node networks only; textures exist, power of two, <= 2048,
                       correct colour spaces; signal colours are separate runtime materials
  budgets              triangles, draw calls, GLB size and browser check (from the export reports)
  conventions          names, positive scale, no game logic in the file

    python blender/scripts/validate_stage_01_environment.py
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
COLLISION_READY = ROOT / "blender/scenes/STAGE_01_COLLISION_READY.blend"
ENV = ROOT / "blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend"
META = ROOT / "blender/exports/STAGE_01_METADATA.json"
EXPORT = ROOT / "blender/exports/STAGE_01_ENVIRONMENT_EXPORT.json"
BROWSER = ROOT / "blender/exports/STAGE_01_ENVIRONMENT_browser/STAGE_01_ENVIRONMENT_browser_check.json"
REPORT = ROOT / "blender/exports/STAGE_01_ENVIRONMENT_VALIDATION.json"
GAMEPLAY = ("GAMEPLAY_COLLISION", "GAMEPLAY_TRIGGERS", "GAMEPLAY_BOUNDARIES", "GAMEPLAY_MARKERS",
            "PLAYER_SPAWNS", "WATCHER_REFERENCE", "SPECTATOR_LOCATIONS", "SIGNAL_ANCHORS")
VISUAL = ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_SIGNAL_DEVICES", "VISUAL_MACHINERY",
          "VISUAL_FOLIAGE", "VISUAL_BACKDROP", "VISUAL_WATCHER", "VISUAL_VFX")
OVERHEAD_OK = {"PRP_STG01_FinishGate_Beam", "PRP_STG01_FinishGate_LightStrip", "PRP_STG01_StartBarrier_Arm"}
NODE_OK = {"OUTPUT_MATERIAL", "BSDF_PRINCIPLED", "TEX_IMAGE", "SEPARATE_COLOR", "NORMAL_MAP", "MATH", "MIX"}
PREFIX_OK = ("STG01_", "PRP_", "ENM_", "VFX_")
SECTIONS = ("spawnPoints", "triggerZones", "movementBoundaries", "watcherDetectionReference", "collisionObjects",
            "spectatorLocations", "signalAnchors")


def coll(o) -> str:
    return o.users_collection[0].name if o.users_collection else ""


def snapshot() -> dict:
    snap = {}
    for c in GAMEPLAY:
        for o in bpy.data.collections[c].objects:
            mesh = ""
            if o.type == "MESH":
                h = hashlib.sha256()
                for v in o.data.vertices:
                    h.update(("%.5f,%.5f,%.5f;" % tuple(v.co)).encode())
                mesh = h.hexdigest()[:16]
            props = {k: (o[k].to_list() if hasattr(o[k], "to_list") else o[k]) for k in o.keys()}
            snap[o.name] = {"collection": c, "type": o.type, "matrix": [round(x, 6) for row in o.matrix_world for x in row],
                            "mesh": mesh, "props": json.dumps(props, sort_keys=True, default=str)}
    return snap


def main() -> None:
    import argparse
    global ENV, REPORT
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--blend", default=str(ENV))
    ap.add_argument("--report", default=str(REPORT))
    args = cb.parse_args(ap)
    ENV, REPORT = Path(args.blend).resolve(), Path(args.report).resolve()
    checks: dict[str, dict] = {}

    def check(name, problems, detail=None):
        checks[name] = {"pass": not problems, "problems": problems[:25], **(detail or {})}

    bpy.ops.wm.open_mainfile(filepath=str(COLLISION_READY))
    before = snapshot()
    bpy.ops.wm.open_mainfile(filepath=str(ENV))
    after = snapshot()
    O = bpy.data.objects

    # 1. gameplay geometry untouched
    p = [f"{n} missing" for n in before if n not in after] + [f"{n} added to a gameplay collection" for n in after if n not in before]
    for n in set(before) & set(after):
        for k in ("collection", "type", "matrix", "mesh", "props"):
            if before[n][k] != after[n][k]:
                p.append(f"{n}: {k} changed")
    check("gameplay_unchanged", p, {"objects_compared": len(before)})

    # 2-3. metadata
    import validate_stage_01_metadata as vm
    meta = json.loads(META.read_text())
    fresh = vm.build_metadata()
    p = [f"metadata section {k} differs when rebuilt from the environment scene" for k in SECTIONS if fresh[k] != meta[k]]
    check("metadata_gameplay", p, {"sections": list(SECTIONS)})
    rep = vm.run_checks(meta)
    p = []
    expected = []
    for name, c in rep["checks"].items():
        for prob in c["problems"]:
            if name == "ids_resolve" and re.search(r"missing from sceneObjects|collection .* differs from the scene", prob):
                expected.append(prob)
            else:
                p.append(f"{name}: {prob}")
    check("metadata_checks", p, {"prompt04_checks": {k: v["pass"] for k, v in rep["checks"].items()},
                                 "expected_inventory_differences": len(expected),
                                 "note": "sceneObjects lists the collision-ready scene; the environment adds visual objects and regroups some visual collections"})

    visual_meshes = [o for o in bpy.context.scene.objects if coll(o) in VISUAL and o.type == "MESH" and not o.get("review_only")]

    # 4. yard clear
    p = []
    yard = (-30.0, 30.0, -15.0, 172.0)
    for o in visual_meshes:
        mw = o.matrix_world
        bad = 0
        for v in o.data.vertices:
            w = mw @ v.co
            if yard[0] < w.x < yard[1] and yard[2] < w.y < yard[3] and w.z > 0.012:
                if o.name in OVERHEAD_OK and w.z >= 6.0:
                    continue
                bad += 1
        if bad:
            p.append(f"{o.name}: {bad} vertices stand inside the yard above the ground")
    check("yard_clear", p, {"allowed_overhead": sorted(OVERHEAD_OK), "min_overhead_height_m": 6.0})

    # 5. sightline from every spawn to The Shepherd's head
    verts, polys = [], []
    for o in visual_meshes:
        if coll(o) in ("VISUAL_WATCHER", "VISUAL_VFX"):
            continue
        base = len(verts)
        verts += [o.matrix_world @ v.co for v in o.data.vertices]
        polys += [[base + i for i in poly.vertices] for poly in o.data.polygons]
    bvh = BVHTree.FromPolygons(verts, polys)
    head = O["WATCHER_HEAD_ANCHOR"].matrix_world.translation
    p = []
    for sp in sorted((o for o in bpy.data.collections["PLAYER_SPAWNS"].objects if o.type == "EMPTY"), key=lambda o: o.name):
        eye = sp.matrix_world.translation + Vector((0, 0, 1.0))
        d = head - eye
        hit = bvh.ray_cast(eye, d.normalized(), d.length)
        if hit[0] is not None:
            p.append(f"{sp.name}: view of The Shepherd's head blocked at {tuple(round(x, 1) for x in hit[0])}")
    check("sightline", p, {"spawns": 30, "eye_height_m": 1.0, "target": "WATCHER_HEAD_ANCHOR"})

    # 6. collections
    p = []
    names = {c.name for c in bpy.context.scene.collection.children}
    for c in VISUAL + GAMEPLAY + ("LIGHTING", "CAMERAS"):
        if c not in names:
            p.append(f"collection {c} missing")
    for o in bpy.context.scene.objects:
        if len(o.users_collection) != 1:
            p.append(f"{o.name} is in {len(o.users_collection)} collections")
        c = coll(o)
        if o.type == "LIGHT" and c != "LIGHTING":
            p.append(f"light {o.name} outside LIGHTING")
        if c == "LIGHTING" and o.type != "LIGHT":
            p.append(f"{o.name} ({o.type}) in LIGHTING")
        if c == "GAMEPLAY_COLLISION" and not o.name.startswith("COLLISION_"):
            p.append(f"{o.name} in GAMEPLAY_COLLISION")
        if c in VISUAL and re.match(r"^(COLLISION_|TRIGGER_|BOUNDARY_|SPAWN_|SPECTATOR_|SIGNAL_|WATCHER_|COL_|GMK_)", o.name):
            p.append(f"gameplay-style object {o.name} in {c}")
    counts = {c: len(bpy.data.collections[c].objects) for c in VISUAL + GAMEPLAY + ("LIGHTING", "CAMERAS", "REFERENCE") if c in names}
    check("collections", p, {"objects_per_collection": counts})

    # 7. materials and textures
    p = []
    used = {}
    for o in visual_meshes:
        for m in o.data.materials:
            used.setdefault(m.name, m)
    images = {}
    for name, m in sorted(used.items()):
        if not name.startswith("MAT_"):
            p.append(f"material {name} lacks the MAT_ prefix")
        for n in m.node_tree.nodes:
            if n.type not in NODE_OK:
                p.append(f"{name}: node {n.type} is not glTF-exportable")
            if n.type == "TEX_IMAGE":
                img = n.image
                path = Path(bpy.path.abspath(img.filepath)).resolve()
                if not path.exists():
                    p.append(f"{name}: image {img.name} not found at {path}")
                w, h = img.size
                if w & (w - 1) or h & (h - 1) or max(w, h) > 2048:
                    p.append(f"{name}: image {img.name} is {w}x{h} (power of two, at most 2048)")
                want = "sRGB" if img.name.endswith("_BC.png") else "Non-Color"
                if img.colorspace_settings.name != want:
                    p.append(f"{name}: {img.name} colour space {img.colorspace_settings.name}, expected {want}")
                images[img.name] = {"size": [w, h], "colorspace": img.colorspace_settings.name,
                                    "file": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)}
    for sig in ("MAT_Signal_Red", "MAT_Signal_Amber", "MAT_Signal_Green"):
        if sig not in used:
            p.append(f"{sig} missing: signal colours must stay separate runtime materials")
    vram = sum(i["size"][0] * i["size"][1] * 4 * 4 / 3 for i in images.values())
    check("materials", p, {"materials": len(used), "images": len(images), "texture_memory_MB_uncompressed_with_mips": round(vram / 2 ** 20, 1)})

    # 8. budgets (export and browser reports)
    p = []
    tris = sum(sum(len(pl.vertices) - 2 for pl in o.data.polygons) for o in visual_meshes)
    if tris > 300_000:
        p.append(f"{tris} triangles (budget 300,000)")
    detail = {"triangles_visual": tris}
    if EXPORT.exists():
        ex = json.loads(EXPORT.read_text())
        s = ex["glb_summary"]
        detail.update(glb_MB=round(s["bytes"] / 1e6, 2), draw_calls_estimate=s["draw_calls_estimate"], glb_materials=len(s["materials"]))
        if s["draw_calls_estimate"] > 150:
            p.append(f"{s['draw_calls_estimate']} draw calls (budget 150)")
        if s["bytes"] > 20e6:
            p.append("GLB above 20 MB")
    else:
        p.append("export report missing: run stage_01_environment_export.py")
    if BROWSER.exists():
        b = json.loads(BROWSER.read_text())
        detail["browser_check"] = b["result"]
        detail["browser_draw_calls"] = {k: v["calls"] for k, v in b["browser"]["render"].items()}
        if b["result"] != "PASS":
            p.append(f"browser check failed: {b['errors'][:3]}")
    else:
        p.append("browser check missing: run tools/asset-check/check-environment.mjs")
    check("budgets", p, detail)

    # 9. conventions and no game logic
    p = []
    for o in bpy.context.scene.objects:
        c = coll(o)
        if c in VISUAL and not o.name.startswith(PREFIX_OK):
            p.append(f"{o.name}: visual names start with {PREFIX_OK}")
        if any(s <= 0 for s in o.scale):
            p.append(f"{o.name} has a non-positive scale")
        if c in VISUAL and (abs(o.rotation_euler.x) > 1e-6 or abs(o.rotation_euler.y) > 1e-6):
            p.append(f"{o.name} is tilted (only yaw allowed on objects)")
        if o.animation_data and (o.animation_data.action or o.animation_data.drivers):
            p.append(f"{o.name} has animation or drivers")
    if len(bpy.data.texts):
        p.append("text blocks / scripts found in the .blend")
    check("conventions", p, {"blender": bpy.app.version_string, "units": "metric, scale 1.0"})

    result = "PASS" if all(c["pass"] for c in checks.values()) else "FAIL"
    report = {"result": result, "blend": str(ENV.relative_to(ROOT)) if ENV.is_relative_to(ROOT) else str(ENV), "baseline": str(COLLISION_READY.relative_to(ROOT)),
              "checks": checks, "images": images}
    cb.write_json(REPORT, report)
    for n, c in checks.items():
        print(f"{'PASS' if c['pass'] else 'FAIL'}  {n}" + ("" if c["pass"] else f": {c['problems'][:3]}"))
    print("RESULT", result)
    sys.exit(0 if result == "PASS" else 1)


if __name__ == "__main__":
    main()
