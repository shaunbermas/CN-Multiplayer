"""Validate a stage .blend and its exports against the pipeline rules and the stage spec.

Checks (docs/BLENDER_PIPELINE.md §8 step 1): pinned Blender version, metric unit scale 1.0,
naming prefixes, applied rotation/scale on meshes, materials, required markers, spec
measurements, triangle budget, and The Shepherd sightline from every spawn.
Writes a JSON report and exits non-zero on any error.

    python blender/scripts/validate_asset.py --blend blender/scenes/STG01_RedLightGreenLight.blend \
        --spec blender/scripts/specs/stg01_greybox.json --stage STG01
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402

PREFIXES = {
    "ENV": ("STG",), "PROPS": ("PRP_", "ENM_"), "LIGHTS": ("LGT_",), "COL": ("COL_",),
    "GMK": ("GMK_",), "CAM": ("CAM_",),
}
TRIANGLE_BUDGET = 300_000  # BLENDER_PIPELINE.md §9, Stage 01 environment visible at once
EYE_HEIGHT = 1.0           # metres above the spawn point (capsule 1.2 m)


def approx(a: float, b: float, tol: float = 0.01) -> bool:
    return abs(a - b) <= tol


def bbox(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--blend", required=True)
    ap.add_argument("--spec", required=True)
    ap.add_argument("--stage", required=True)
    ap.add_argument("--report", default=None)
    args = cb.parse_args(ap)

    spec, spec_hash = cb.load_spec(args.spec)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
    scene = bpy.context.scene
    errors: list[str] = []
    warnings: list[str] = list(cb.check_version())
    st = args.stage

    # ---- scene settings
    if scene.unit_settings.system != "METRIC" or not approx(scene.unit_settings.scale_length, 1.0, 1e-6):
        errors.append("Scene units must be metric with unit scale 1.0")
    if scene.get("cn_spec_hash") != spec_hash:
        errors.append(f"Scene was built from spec {scene.get('cn_spec_hash')}, current spec is {spec_hash}: rebuild")

    # ---- collections, naming, transforms
    for suffix, prefixes in PREFIXES.items():
        col = bpy.data.collections.get(f"{st}_{suffix}")
        if col is None:
            errors.append(f"Missing collection {st}_{suffix}")
            continue
        for obj in col.all_objects:
            if not obj.name.startswith(prefixes):
                errors.append(f"{obj.name} in {col.name} must start with {' or '.join(prefixes)}")
            if " " in obj.name or not obj.name.isascii():
                errors.append(f"{obj.name}: names must be ASCII without spaces")
            if obj.type == "MESH":
                if any(not approx(s, 1.0, 1e-6) for s in obj.scale):
                    errors.append(f"{obj.name}: scale not applied {tuple(obj.scale)}")
                if suffix in ("ENV", "COL") and any(abs(r) > 1e-6 for r in obj.rotation_euler):
                    errors.append(f"{obj.name}: rotation not applied")

    # ---- materials
    used = {m.name for o in bpy.data.objects if o.type == "MESH" for m in o.data.materials if m}
    for name in used:
        if not name.startswith("MAT_"):
            errors.append(f"Material {name} must start with MAT_")
        if "." in name:
            errors.append(f"Material {name} looks like an accidental duplicate")

    # ---- markers
    gmk = {o.name: o for o in bpy.data.collections[f"{st}_GMK"].all_objects}
    n_spawn = spec["spawns"]["columns"] * len(spec["spawns"]["row_y"])
    spawns = sorted(n for n in gmk if n.startswith("GMK_SPAWN_"))
    if len(spawns) != n_spawn:
        errors.append(f"Expected {n_spawn} spawn markers, found {len(spawns)}")
    for req in ("GMK_START", "GMK_FINISH", "GMK_SHEPHERD", "GMK_BOUNDS"):
        if req not in gmk:
            errors.append(f"Missing marker {req}")
    half = spec["width"] / 2
    for n in spawns:
        x, y, z = gmk[n].location
        if not (-half < x < half and -spec["start_zone_depth"] < y < 0 and approx(z, 0.0)):
            errors.append(f"{n} at ({x:.2f}, {y:.2f}, {z:.2f}) is outside the start zone")
    if "GMK_FINISH" in gmk and not approx(gmk["GMK_FINISH"].location.y, spec["course_length"]):
        errors.append("Finish line is not at the spec course length")

    # ---- spec measurements on collision
    cols = {o.name: o for o in bpy.data.collections[f"{st}_COL"].all_objects}
    ft = cols.get(f"COL_{st}_FinishTrigger")
    if ft is None:
        errors.append("Missing finish trigger")
    else:
        mn, mx = bbox(ft)
        if not (approx(mx[0] - mn[0], spec["width"]) and approx(mn[1], spec["course_length"])
                and approx(mx[1] - mn[1], spec["finish_trigger_depth"])):
            errors.append("Finish trigger does not match the spec (width, start, depth)")
    ground = cols.get(f"COL_{st}_Ground")
    if ground is not None:
        mn, mx = bbox(ground)
        if not approx(mx[2], 0.0):
            errors.append("Ground collision top is not at Z = 0")

    # ---- triangle budget (runtime collections)
    tris = sum(cb.triangle_count(o) for s in ("ENV", "PROPS") for o in bpy.data.collections[f"{st}_{s}"].all_objects)
    if tris > TRIANGLE_BUDGET:
        errors.append(f"{tris} triangles exceeds budget {TRIANGLE_BUDGET}")

    # ---- Shepherd sightline from every spawn (ignores collision, markers and the Shepherd itself)
    sightline = {"checked": 0, "blocked": []}
    if "GMK_SHEPHERD" in gmk:
        sh = gmk["GMK_SHEPHERD"]
        target = Vector((sh.location.x, sh.location.y, float(sh.get("head_z", sh.location.z))))
        depsgraph = bpy.context.evaluated_depsgraph_get()
        ignore = set(cols) | set(gmk)
        for n in spawns:
            origin = gmk[n].location + Vector((0.0, 0.0, EYE_HEIGHT))
            direction = (target - origin)
            dist = direction.length
            direction.normalize()
            start, travelled = origin.copy(), 0.0
            blocker = None
            while travelled < dist:
                hit, loc, _n, _i, obj, _m = scene.ray_cast(depsgraph, start, direction, distance=dist - travelled)
                if not hit:
                    break
                if obj.name in ignore or obj.name.startswith("ENM_Shepherd"):
                    step = (loc - start).length + 0.01
                    start = loc + direction * 0.01
                    travelled += step
                    if obj.name.startswith("ENM_Shepherd"):
                        break
                    continue
                blocker = obj.name
                break
            sightline["checked"] += 1
            if blocker:
                sightline["blocked"].append({"spawn": n, "blocked_by": blocker})
        if sightline["blocked"]:
            errors.append(f"Shepherd hidden from {len(sightline['blocked'])} spawn(s)")

    exports = {}
    out_dir = cb.REPO_ROOT / "blender/exports" / st
    for f in sorted(out_dir.glob("*")):
        if f.suffix in (".glb", ".json") and "validation" not in f.name:
            exports[f.name] = f.stat().st_size

    report = {
        "stage": st, "blend": Path(args.blend).as_posix(), "spec_hash": spec_hash,
        "blender": bpy.app.version_string, "result": "PASS" if not errors else "FAIL",
        "errors": errors, "warnings": warnings,
        "stats": {"objects": len(bpy.data.objects), "runtime_triangles": tris, "triangle_budget": TRIANGLE_BUDGET,
                  "spawn_markers": len(spawns), "materials": sorted(used), "export_files_bytes": exports},
        "shepherd_sightline": sightline,
    }
    path = Path(args.report or out_dir / f"{st}_validation.json")
    cb.write_json(path, report)
    print(json.dumps({k: report[k] for k in ("result", "errors", "warnings")}, indent=2))
    print(f"Report: {path}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
