"""Validate a stage greybox against the pipeline rules, the stage spec and geometry hygiene.

Checks (Prompt 03 validation list and docs/BLENDER_PIPELINE.md §8):
  1 zones match the spec            2 exactly 30 uniquely named spawns
  3 spawn capsules do not overlap   4 start-to-finish routes are clear; Shepherd visible from every spawn
  5 finish and coverage are marked  6 Watcher placeholder location and facing
  7 collision separate, not duplicated, not in the runtime set
  8 no floating parts, z-fighting, degenerate faces or blocked routes; nothing over 3 m inside the yard
  9 scale, units, applied transforms, naming     10 no missing libraries or images
Writes a JSON report (errors, warnings, per-check results) and exits non-zero on any error.

    python blender/scripts/validate_asset.py --blend blender/scenes/STAGE_01_GREYBOX.blend \
        --spec blender/scripts/specs/stg01_greybox.json --stage STG01
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import bmesh  # noqa: E402  (importable only after bpy)
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402
from cn_blender import COLL, RUNTIME, is_review_only  # noqa: E402

PREFIXES = {
    "ref": ("REF_",), "arch": ("STG01_", "PRP_"), "zones": ("STG01_", "ZONE_", "GMK_"),
    "blockers": ("STG01_BG_", "PRP_"), "watcher": ("ENM_",), "lights": ("PRP_KIT_", "LGT_"),
    "col": ("COL_",), "spawns": ("GMK_SPAWN_",), "cams": ("CAM_",),
}
TRIANGLE_BUDGET = 300_000   # BLENDER_PIPELINE.md §9
EYE_HEIGHT = 1.0
YARD_HEIGHT_LIMIT = 3.0     # design spec §9


def approx(a, b, tol=0.01):
    return abs(a - b) <= tol


def bbox(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


def xy_overlap(a, b, eps=0.0):
    (amn, amx), (bmn, bmx) = a, b
    return amx[0] > bmn[0] - eps and amn[0] < bmx[0] + eps and amx[1] > bmn[1] - eps and amn[1] < bmx[1] + eps


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
    checks: dict[str, dict] = {}

    def check(key, title, ok, detail):
        checks[key] = {"title": title, "result": "PASS" if ok else "FAIL", "detail": detail}

    W = spec["width"]; half = W / 2
    y0 = -spec["start_zone_depth"]; L = spec["course_length"]
    y_fin = L + spec["finish_trigger_depth"]; y_back = y_fin + spec["safe_zone_depth"]
    r = spec["capsule"]["radius"]
    sh = spec["shepherd"]

    colls = {k: bpy.data.collections.get(v) for k, v in COLL.items()}
    missing = [COLL[k] for k, c in colls.items() if c is None and k != "work"]
    if missing:
        print(json.dumps({"result": "FAIL", "errors": [f"Missing collections: {', '.join(missing)}"]}))
        sys.exit(1)

    def objs(key):
        return list(colls[key].all_objects)

    runtime_meshes = [o for k in RUNTIME for o in objs(k) if o.type == "MESH" and not is_review_only(o)]
    boxes = {o.name: bbox(o) for o in runtime_meshes}

    # ---- 9: scale, units, transforms, naming
    unit_ok = scene.unit_settings.system == "METRIC" and approx(scene.unit_settings.scale_length, 1.0, 1e-6)
    if not unit_ok:
        errors.append("Scene units must be metric with unit scale 1.0")
    if scene.get("cn_spec_hash") != spec_hash:
        errors.append(f"Scene was built from spec {scene.get('cn_spec_hash')}, current spec is {spec_hash}: rebuild")
    naming, transforms = [], []
    for key, prefixes in PREFIXES.items():
        for o in objs(key):
            if not o.name.startswith(prefixes) or " " in o.name or not o.name.isascii():
                naming.append(f"{o.name} in {COLL[key]} (expected {' / '.join(prefixes)})")
            if o.type == "MESH" and any(not approx(s, 1.0, 1e-6) for s in o.scale):
                transforms.append(f"{o.name}: scale {tuple(round(s, 3) for s in o.scale)}")
            if o.type == "MESH" and key in ("arch", "zones", "col") and any(abs(a) > 1e-6 for a in o.rotation_euler):
                transforms.append(f"{o.name}: rotation not applied")
    errors += [f"Naming: {n}" for n in naming] + [f"Transform: {t}" for t in transforms]
    used = {m.name for o in bpy.data.objects if o.type == "MESH" for m in o.data.materials if m}
    bad_mats = [m for m in used if not m.startswith("MAT_") or "." in m]
    errors += [f"Material name: {m}" for m in bad_mats]
    check("9_scale_naming", "Scale, units, applied transforms, naming", unit_ok and not naming and not transforms and not bad_mats,
          f"metric, 1 unit = 1 m; {len(bpy.data.objects)} objects follow the collection naming rules; {len(used)} MAT_ materials")

    # ---- 1: zones match the spec
    expect = {"ZONE_STG01_Start": (y0, 0.0), "ZONE_STG01_Course": (0.0, L), "ZONE_STG01_Finish": (L, y_fin), "ZONE_STG01_Safe": (y_fin, y_back)}
    zone_bad = []
    for name, (ya, yb) in expect.items():
        o = bpy.data.objects.get(name)
        if o is None:
            zone_bad.append(f"{name} missing")
            continue
        mn, mx = bbox(o)
        if not (approx(mn[0], -half) and approx(mx[0], half) and approx(mn[1], ya) and approx(mx[1], yb)):
            zone_bad.append(f"{name} spans X {mn[0]:.2f}..{mx[0]:.2f}, Y {mn[1]:.2f}..{mx[1]:.2f}; spec Y {ya}..{yb}")
    cols_by = {o.name: o for o in objs("col")}
    ft = cols_by.get("COL_STG01_FinishTrigger")
    if ft is None:
        zone_bad.append("COL_STG01_FinishTrigger missing")
    else:
        mn, mx = bbox(ft)
        if not (approx(mx[0] - mn[0], W) and approx(mn[1], L) and approx(mx[1], y_fin)):
            zone_bad.append("finish trigger does not match the spec")
    errors += [f"Zone: {z}" for z in zone_bad]
    check("1_zones", "Zones match the approved dimensions", not zone_bad,
          f"width {W} m; start Y {y0}..0, course 0..{L}, finish {L}..{y_fin}, safe {y_fin}..{y_back}" if not zone_bad else "; ".join(zone_bad))

    # ---- 2 and 3: spawns
    n_exp = spec["spawns"]["columns"] * len(spec["spawns"]["row_y"])
    markers = sorted((o for o in objs("spawns") if o.type == "EMPTY"), key=lambda o: o.name)
    names = [o.name for o in markers]
    sp_bad = []
    if len(markers) != n_exp:
        sp_bad.append(f"expected {n_exp} spawn markers, found {len(markers)}")
    if len(set(names)) != len(names) or any(f"GMK_SPAWN_{i:02d}" not in names for i in range(1, n_exp + 1)):
        sp_bad.append("spawn names are not GMK_SPAWN_01..30 exactly once")
    pts = [(o.name, o.location.x, o.location.y, o.location.z) for o in markers]
    pairs = list(itertools.combinations(pts, 2))
    min_gap = min((math.hypot(a[1] - b[1], a[2] - b[2]) - 2 * r for a, b in pairs), default=0.0)
    overlaps = [(a[0], b[0]) for a, b in pairs if math.hypot(a[1] - b[1], a[2] - b[2]) < 2 * r]
    outside = [p[0] for p in pts if not (-half + r <= p[1] <= half - r and y0 + r <= p[2] <= -r and approx(p[3], 0))]
    caps = [o for o in objs("spawns") if o.type == "MESH"]
    cap_bad = [o.name for o in caps if not approx(o.get("radius", 0), r, 1e-6)]
    errors += [f"Spawns: {x}" for x in sp_bad] + [f"Spawn overlap: {a} / {b}" for a, b in overlaps]
    errors += [f"Spawn outside start zone: {x}" for x in outside] + [f"Spawn capsule radius: {x}" for x in cap_bad]
    check("2_spawn_count", "Exactly 30 spawns with unique stable names", not sp_bad,
          f"{len(markers)} markers GMK_SPAWN_01..{len(markers):02d}; {len(caps)} capsule proxies")
    check("3_spawn_overlap", "Spawn capsules do not overlap at the player radius", not overlaps and not outside and not cap_bad,
          f"radius {r} m; smallest gap between two capsules {min_gap:.2f} m; all 30 inside the start zone")

    # ---- 4: routes clear, Shepherd visible
    solids = [(o.name, bbox(o)) for o in objs("col") if o.get("col_type") == "solid" and o.name != "COL_STG01_Ground"]
    blocked = []
    for name, x, y, _ in pts:
        lane = ([x - r, y, 0], [x + r, L + 1, 2])
        blocked += [f"{name} straight route crosses {sn}" for sn, sb in solids if xy_overlap(lane, sb)]
    interior = [n for n, (mn, mx) in solids if mn[0] > -half and mx[0] < half and mn[1] > y0 and mx[1] < y_back]
    errors += [f"Route: {b}" for b in blocked] + [f"Solid collider inside the yard: {n}" for n in interior]
    gmk = {o.name: o for k in ("zones", "spawns") for o in objs(k) if o.type == "EMPTY"}
    sight = {"checked": 0, "blocked": []}
    if "GMK_SHEPHERD" in gmk:
        s_ = gmk["GMK_SHEPHERD"]
        target = Vector((s_.location.x, s_.location.y, float(s_.get("head_z", s_.location.z))))
        dg = bpy.context.evaluated_depsgraph_get()
        ignore = {o.name for o in bpy.data.objects if o.name.startswith(("COL_", "GMK_", "ZONE_", "REF_")) or is_review_only(o)}
        for name, x, y, _ in pts:
            origin = Vector((x, y, EYE_HEIGHT))
            d = target - origin
            dist = d.length
            d.normalize()
            start, travelled, blocker = origin.copy(), 0.0, None
            while travelled < dist:
                hit, loc, _n, _i, obj, _m = scene.ray_cast(dg, start, d, distance=dist - travelled)
                if not hit or obj.name.startswith("ENM_Shepherd"):
                    break
                if obj.name in ignore:
                    travelled += (loc - start).length + 0.01
                    start = loc + d * 0.01
                    continue
                blocker = obj.name
                break
            sight["checked"] += 1
            if blocker:
                sight["blocked"].append({"spawn": name, "blocked_by": blocker})
    if sight["blocked"]:
        errors.append(f"Shepherd hidden from {len(sight['blocked'])} spawn(s)")
    check("4_route_readable", "Start-to-finish route clear; Shepherd visible from every spawn",
          not blocked and not interior and not sight["blocked"],
          f"30 straight routes to the finish clear of solid colliders; Shepherd head visible from {sight['checked'] - len(sight['blocked'])}/{sight['checked']} spawns")

    # ---- 5: finish and coverage marked
    need = ["STG01_FinishBand", "ZONE_STG01_Finish", "ZONE_STG01_Safe", "ZONE_STG01_ShepherdCoverage", "PRP_STG01_FinishGate_Beam"]
    miss5 = [n for n in need if n not in bpy.data.objects]
    errors += [f"Marking missing: {n}" for n in miss5]
    cov = bpy.data.objects.get("ZONE_STG01_ShepherdCoverage")
    cov_ok = False
    if cov:
        cmn, cmx = bbox(cov)
        cov_ok = cmn[0] <= -half and cmx[0] >= half and cmn[1] <= y0
        if not cov_ok:
            errors.append("Shepherd coverage marker does not reach every corner of the yard")
    check("5_finish_coverage", "Finish boundary and Watcher coverage visibly marked", not miss5 and cov_ok,
          "finish band, finish and safe zone overlays, finish gate, 110° coverage wedge reaching the start zone")

    # ---- 6: Watcher location and facing
    w_bad = []
    s_ = gmk.get("GMK_SHEPHERD")
    if s_ is None:
        w_bad.append("GMK_SHEPHERD missing")
    else:
        if not (approx(s_.location.x, sh["x"]) and approx(s_.location.y, sh["y"]) and approx(s_.location.z, sh["platform_height"])):
            w_bad.append(f"at {tuple(round(v, 2) for v in s_.location)}, spec ({sh['x']}, {sh['y']}, {sh['platform_height']})")
        fwd = (s_.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()
        if fwd.y > -0.999:
            w_bad.append(f"faces {tuple(round(v, 2) for v in fwd)}, expected -Y")
    head = bpy.data.objects.get("ENM_Shepherd_Placeholder_Head")
    if head:
        top = bbox(head)[1][2]
        if not approx(top - sh["platform_height"], sh["height"], 0.05):
            w_bad.append(f"placeholder height {top - sh['platform_height']:.2f} m, spec {sh['height']} m")
    face = bpy.data.objects.get("ENM_Shepherd_Placeholder_Face")
    if face and face.location.y >= sh["y"]:
        w_bad.append("face marker is not on the -Y side")
    errors += [f"Watcher: {w}" for w in w_bad]
    check("6_watcher", "Watcher placeholder at the approved location and facing", not w_bad,
          f"platform centre ({sh['x']}, {sh['y']}), top {sh['platform_height']} m; figure {sh['height']} m; faces -Y toward the players")

    # ---- 7: collision separate, not duplicated
    col_objs = [o for o in objs("col") if o.type == "MESH"]
    stray = [o.name for o in bpy.data.objects if o.name.startswith("COL_") and o.name not in cols_by]
    rendered = [o.name for o in col_objs if not o.hide_render]
    sig, dups = {}, []
    for o in col_objs:
        mn, mx = bbox(o)
        key = (o.get("col_type"), tuple(round(v, 3) for v in mn + mx))
        if key in sig:
            dups.append(f"{o.name} duplicates {sig[key]}")
        sig[key] = o.name
    errors += [f"Collision outside 06_COLLISION: {n}" for n in stray] + [f"Collision renders: {n}" for n in rendered]
    errors += [f"Collision duplicate: {d}" for d in dups]
    kinds = {k: sum(o.get("col_type") == k for o in col_objs) for k in ("solid", "trigger", "camera")}
    check("7_collision", "Collision separate from render geometry, not duplicated", not stray and not rendered and not dups,
          f"{len(col_objs)} boxes in 06_COLLISION ({kinds['solid']} solid, {kinds['trigger']} trigger, {kinds['camera']} camera-only); hidden from renders; excluded from the runtime GLB")

    # ---- 8: floating parts, z-fighting, mesh hygiene, height limit inside the yard
    floating, zfight, hygiene, tall = [], [], [], []
    for o in runtime_meshes:
        mn, mx = boxes[o.name]
        if mn[2] > 0.05 and not o.get("mounted", False):
            supported = any(n != o.name and xy_overlap(boxes[o.name], b, 0.01) and b[0][2] <= mn[2] + 0.06 and b[1][2] >= mn[2] - 0.06
                            for n, b in boxes.items())
            if not supported:
                floating.append(f"{o.name} (bottom at {mn[2]:.2f} m)")
        inside = mx[0] > -half + 0.01 and mn[0] < half - 0.01 and mx[1] > y0 + 0.01 and mn[1] < y_back - 0.01
        if inside and mx[2] > YARD_HEIGHT_LIMIT and not o.name.startswith(("PRP_STG01_FinishGate", "PRP_STG01_StartBarrier")):
            tall.append(f"{o.name} rises {mx[2]:.1f} m inside the yard")
    flats = [(n, b) for n, b in boxes.items() if b[1][2] - b[0][2] < 0.05]
    for (na, a), (nb, b) in itertools.combinations(flats, 2):
        if approx(a[1][2], b[1][2], 1e-4) and xy_overlap(a, b, -0.001):
            zfight.append(f"{na} / {nb} (both top at {a[1][2]:.3f} m)")
    seen = set()
    for o in runtime_meshes:
        if o.data.name in seen:
            continue
        seen.add(o.data.name)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        degen = sum(1 for f in bm.faces if f.calc_area() < 1e-8)
        loose = sum(1 for v in bm.verts if not v.link_edges)
        nonman = sum(1 for e in bm.edges if not e.is_manifold)
        bm.free()
        if degen or loose:
            hygiene.append(f"{o.data.name}: {degen} degenerate faces, {loose} loose vertices")
        if nonman:
            hygiene.append(f"{o.data.name}: {nonman} non-manifold edges")
    errors += [f"Floating: {f}" for f in floating] + [f"Z-fighting: {z}" for z in zfight]
    errors += [f"Mesh: {h}" for h in hygiene] + [f"Height: {t}" for t in tall]
    check("8_geometry", "No floating parts, z-fighting, bad meshes or tall objects inside the yard",
          not (floating or zfight or hygiene or tall),
          f"{len(runtime_meshes)} runtime meshes ({len(seen)} unique) checked: none floating, no coplanar overlaps, all closed and non-degenerate, nothing over {YARD_HEIGHT_LIMIT:g} m inside the yard except the finish gate and raised start barrier")

    # ---- 10: dependencies
    libs = [lib.filepath for lib in bpy.data.libraries]
    imgs = [i.name for i in bpy.data.images if i.source == "FILE" and not Path(bpy.path.abspath(i.filepath)).exists()]
    errors += [f"Linked library: {x}" for x in libs] + [f"Missing image: {x}" for x in imgs]
    check("10_dependencies", "Scene opens without missing dependencies", not libs and not imgs,
          f"{len(bpy.data.libraries)} linked libraries, {len(bpy.data.images)} images; everything is generated in the file")

    tris = sum(cb.triangle_count(o) for o in runtime_meshes)
    if tris > TRIANGLE_BUDGET:
        errors.append(f"{tris} triangles exceeds budget {TRIANGLE_BUDGET}")

    out_dir = cb.REPO_ROOT / "blender/exports" / args.stage
    exports = {f.name: f.stat().st_size for f in sorted(out_dir.glob("*")) if f.suffix in (".glb", ".json") and "validation" not in f.name}
    report = {
        "stage": args.stage, "blend": Path(args.blend).name, "spec_hash": spec_hash, "spec_version": spec.get("spec_version"),
        "blender": bpy.app.version_string, "result": "PASS" if not errors else "FAIL",
        "errors": errors, "warnings": warnings, "checks": checks,
        "stats": {"objects": len(bpy.data.objects), "runtime_meshes": len(runtime_meshes), "runtime_triangles": tris,
                  "triangle_budget": TRIANGLE_BUDGET, "spawn_markers": len(markers), "min_spawn_gap_m": round(min_gap, 3),
                  "materials": sorted(used), "export_files_bytes": exports},
        "shepherd_sightline": sight,
    }
    path = Path(args.report or out_dir / f"{args.stage}_validation.json")
    cb.write_json(path, report)
    print(json.dumps({k: report[k] for k in ("result", "errors", "warnings")}, indent=2))
    print(f"Report: {path}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
