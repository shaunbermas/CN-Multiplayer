"""Build and validate STAGE_01_METADATA.json against the collision-ready Blender scene (Prompt 04).

Checks: the pack JSON schema; every ID resolves to a scene object; positions, rotations and
dimensions match the scene; 30 non-overlapping spawns on the approved grid; triggers, boundaries,
watcher reference, spectators and signal anchors; collision kept apart from decoration with every
physical visual covered; agreement with the runtime exports the server uses (STG01_collision.json,
STG01_markers.json); units and transforms; and that the .blend holds no game logic.

    python blender/scripts/validate_stage_01_metadata.py            # validate the committed files
    python blender/scripts/validate_stage_01_metadata.py --blend X --metadata Y --report Z
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
BLEND = ROOT / "blender/scenes/STAGE_01_COLLISION_READY.blend"
META = ROOT / "blender/exports/STAGE_01_METADATA.json"
SCHEMA = ROOT / "blender/schemas/STAGE_01_METADATA.schema.json"
REPORT = ROOT / "blender/exports/STAGE_01_METADATA_VALIDATION.json"
SPEC = ROOT / "blender/scripts/specs/stg01_greybox.json"
RUNTIME_DIR = ROOT / "blender/exports/STG01"

GAMEPLAY = ("GAMEPLAY_COLLISION", "GAMEPLAY_TRIGGERS", "GAMEPLAY_BOUNDARIES", "GAMEPLAY_MARKERS",
            "PLAYER_SPAWNS", "WATCHER_REFERENCE", "SPECTATOR_LOCATIONS", "SIGNAL_ANCHORS")
VISUAL = ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_WATCHER", "LIGHTING")
POS_TOL, ROT_TOL, DIM_TOL = 1e-3, 1e-2, 1e-3

ORIGIN = ("Blender world origin = centre of the start line on the ground (X 0, Y 0, Z 0), as in "
          "docs/BLENDER_PIPELINE.md §4 and docs/STAGE_01_SPEC.md. Positions are object origins; box "
          "volumes (collision, triggers, boundaries) have their origin at the bottom centre. Rotations "
          "are Euler XYZ. A marker's forward direction is its local -Y axis. The runtime (glTF, server, "
          "web client) uses Y-up game coordinates: game = (x, z, -y).")


def r4(v: float) -> float:
    v = round(float(v), 4)
    return 0.0 if v == 0 else v


def vec(v) -> dict:
    return {"x": r4(v[0]), "y": r4(v[1]), "z": r4(v[2])}


def rot(obj) -> dict:
    e = obj.matrix_world.to_euler("XYZ")
    return {k: r4(round(math.degrees(a), 3)) for k, a in zip("xyz", e)}


def collection_of(obj) -> str:
    return obj.users_collection[0].name if obj.users_collection else ""


def transform(obj, notes: str | None = None, dims: bool = False) -> dict:
    d = {"id": obj.name, "objectName": obj.name, "position": vec(obj.matrix_world.translation), "rotation": rot(obj)}
    if dims:
        d["dimensions"] = vec(obj.dimensions)
    if notes:
        d["notes"] = notes
    return d


def forward(obj) -> Vector:
    return (obj.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()


def bounds(obj):
    if obj.type == "MESH" and obj.data.vertices:
        pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
        return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
    t = obj.matrix_world.translation
    return t.copy(), t.copy()


def objs(coll: str):
    return sorted(bpy.data.collections[coll].objects, key=lambda o: o.name)


def legacy(obj) -> str:
    return f" Greybox / runtime ID: {obj['legacy_id']}." if "legacy_id" in obj else ""


# ------------------------------------------------------------------------------------- metadata
def build_metadata() -> dict:
    spec = json.loads(SPEC.read_text())
    cap = spec["capsule"]
    cols = spec["spawns"]["columns"]
    spawns = []
    for o in objs("PLAYER_SPAWNS"):
        if not re.fullmatch(r"SPAWN_PLAYER_\d\d", o.name):
            continue
        i = int(o.name[-2:])
        spawns.append(transform(o, f"Row {(i - 1) // cols + 1}, slot {(i - 1) % cols + 1} (numbered from the centre of "
                                   f"the front row outward). Faces +Y. Capsule r {cap['radius']} m, h {cap['height']} m."
                                   + legacy(o)))
    trig_notes = {
        "TRIGGER_START_LINE": "Approved start zone (spec L2: Y -15 to 0, full width, 3 m high). Players wait here "
                              "before GO; leaving through its +Y face (Y = 0) is crossing the start line. New in Prompt 04.",
        "TRIGGER_FINISH_LINE": "Finish trigger (spec L4: Y 160 to 163, full width, 3 m high). Entering it finishes the "
                               "player; the server records the time.",
        "TRIGGER_SAFE_ZONE": "Safe zone beyond the finish (spec L5: Y 163 to 172). Counts as finished and immune "
                             "(spec D5); role 'finish' because the schema has only start and finish roles.",
    }
    triggers = []
    for o in objs("GAMEPLAY_TRIGGERS"):
        t = transform(o, trig_notes.get(o.name, "") + legacy(o), dims=True)
        t["role"] = "start" if o.get("trigger_role") == "start" else "finish"
        t["isTrigger"] = True
        triggers.append(t)
    bnotes = {
        "BOUNDARY_LEFT": "West fence wall at X -30 (spec L6), 3 m high, solid for players.",
        "BOUNDARY_RIGHT": "East fence wall at X +30 (spec L6), 3 m high, solid for players. The service gates sit in this line and stay closed.",
        "BOUNDARY_BACK": "Start wall at Y -15 behind the spawn rows (spec L6), solid.",
        "BOUNDARY_FINISH": "Back wall at Y 172 beyond the safe zone (spec L6), solid.",
        "BOUNDARY_PLAYABLE_AREA": "The fenced yard (X -30 to 30, Y -15 to 172). Not a collider: positions outside it are out "
                                  "of bounds. Same extents as the greybox GMK_BOUNDS marker.",
    }
    boundaries = [transform(o, bnotes.get(o.name, "") + legacy(o), dims=True) for o in objs("GAMEPLAY_BOUNDARIES")]

    colliders = []
    for o in objs("GAMEPLAY_COLLISION") + [b for b in objs("GAMEPLAY_BOUNDARIES") if b.get("gameplay_role") == "boundary_wall"]:
        role = o.get("gameplay_role")
        note = {"collision_ground": "Yard floor; the top face is Z = 0.",
                "collision_camera_only": "Camera-only collider (decision E10): keeps the third-person camera inside the "
                                         "fence; never blocks players.",
                "boundary_wall": "Movement boundary wall (also listed in movementBoundaries).",
                }.get(role, "Simplified box proxy fitted to the visual mesh bounds. Outside the playable yard: "
                            "blocks spectators, walk-offs and the camera, never contestants.")
        if o.get("static_or_moving") == "moving":
            note += " Moving: the start barrier arm stays raised at 6 m during play (decision 019, G1); it never blocks players."
        c = transform(o, note + legacy(o), dims=True)
        c.update(colliderType="box", isTrigger=False, sourceVisualObjectId=o["source_visual"],
                 staticOrMoving=o.get("static_or_moving", "static"))
        colliders.append(c)

    wd = bpy.data.objects["WATCHER_DETECTION_REFERENCE"]
    watcher = {
        "id": wd.name, "anchorObjectId": wd["anchor"], "position": vec(wd.matrix_world.translation), "rotation": rot(wd),
        "coverageShape": "sector", "coverageDimensions": vec(wd.dimensions),
        "notes": (f"Presentation coverage only (design spec §5): a flat ±{wd['half_angle_deg']:.0f}° sector from The Shepherd's "
                  f"position facing the players (-Y), reach {wd['reach_m']:.0f} m so it covers every yard corner; the "
                  f"head is at Z {wd['head_height_m']} m (WATCHER_HEAD_ANCHOR). coverageDimensions are the sector's bounds "
                  "(width, depth, 0). Server detection is the authority and is not line-of-sight: every active player in "
                  "the yard outside the finish and safe volumes is checked during RED (decision E9, spec §4). No "
                  "detection logic lives in Blender."),
    }

    spectators = []
    snotes = {"spectator_bench_seat": "Bench seat outside the east fence where spotted and waiting players sit (spec §7).",
              "spectator_gantry_spot": "Standing spot on the spectator gantry deck (X +44, 6 m up), outside the fence.",
              "spectator_viewpoint": "High viewpoint behind and above The Shepherd (spectator camera)."}
    for o in objs("SPECTATOR_LOCATIONS"):
        s = transform(o, snotes.get(o.get("gameplay_role"), "") + legacy(o))
        s["viewTargetObjectId"] = o["view_target"]
        spectators.append(s)

    signals = []
    signotes = {"SIGNAL_GREEN_ANCHOR": "Lantern centre: attach the GREEN state visual (dim green lantern). Same point as "
                                       "SIGNAL_RED_ANCHOR because one lantern shows every colour (design spec §6).",
                "SIGNAL_RED_ANCHOR": "Lantern centre: attach the RED state visual (red lantern, raised).",
                "SIGNAL_SCAN_BEAM_ANCHOR": "Face centre: origin of the red scan beam (presentation only)."}
    for o in objs("SIGNAL_ANCHORS"):
        n = signotes.get(o.name) or ("Tower signal lamp: repeats every signal colour along the yard." if o.name.startswith("SIGNAL_LAMP")
                                     else "Loudspeaker: source of the signal sounds (spatial audio).")
        s = transform(o, n + f" Source visual: {o['source_visual']}.")
        s["signalType"] = o["signal_type"]
        signals.append(s)

    scene_objects = []
    for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        c = collection_of(o)
        role = o.get("gameplay_role") or {
            "VISUAL_ARCHITECTURE": "visual_architecture", "VISUAL_PROPS": "visual_prop", "VISUAL_WATCHER": "visual_watcher",
            "LIGHTING": "light" if o.type == "LIGHT" else "visual_lighting_prop", "CAMERAS": "camera",
            "REFERENCE": "review_reference"}.get(c, "unknown")
        scene_objects.append({"id": o.name, "objectName": o.name, "collection": c, "role": role})

    return {
        "schemaVersion": "1.0.0",
        "stageId": "STAGE_01_RED_LIGHT",
        "stageName": "Red Light, Green Light",
        "sourceFiles": {
            "designSpec": "docs/STAGE_01_DESIGN_SPEC.md",
            "greyboxBlend": "blender/scenes/STAGE_01_GREYBOX.blend",
            "prompt03ValidationReport": "docs/STAGE_01_GREYBOX_REPORT.md",
        },
        "coordinateSystem": {
            "units": "meters", "positionSpace": "world", "rotationUnit": "degrees", "originDescription": ORIGIN,
            "upAxis": "+Z (Blender world)", "forwardAxis": "+Y: the course runs from the start line (Y 0) to the finish line (Y 160)",
        },
        "spawnPoints": spawns,
        "triggerZones": triggers,
        "movementBoundaries": boundaries,
        "watcherDetectionReference": watcher,
        "collisionObjects": colliders,
        "spectatorLocations": spectators,
        "signalAnchors": signals,
        "sceneObjects": scene_objects,
    }


# ------------------------------------------------------------------------------------- checks
def run_checks(meta: dict) -> dict:
    checks: dict[str, dict] = {}

    def check(name: str, problems: list[str], detail: dict | None = None) -> None:
        checks[name] = {"pass": not problems, "problems": problems[:20], **(detail or {})}

    O = bpy.data.objects
    spec = json.loads(SPEC.read_text())
    cap = spec["capsule"]

    # 1. schema
    import jsonschema
    schema = json.loads(SCHEMA.read_text())
    errs = sorted(jsonschema.Draft202012Validator(schema).iter_errors(meta), key=lambda e: list(e.path))
    probs = [f"{'/'.join(map(str, e.path))}: {e.message}" for e in errs]
    # The patched schema must still reject unknown fields (negative test on a copy).
    import copy
    bad = copy.deepcopy(meta)
    bad["triggerZones"][0]["typoField"] = 1
    if jsonschema.Draft202012Validator(schema).is_valid(bad):
        probs.append("schema accepts an unknown field in a trigger (strictness lost)")
    original = json.loads(SCHEMA.with_name("STAGE_01_METADATA.pack-original.schema.json").read_text())
    orig_errors = sum(1 for _ in jsonschema.Draft202012Validator(original).iter_errors(meta))
    check("schema", probs, {"schema": str(SCHEMA.relative_to(ROOT)), "rejects_unknown_fields": True,
                            "pack_original_schema_errors": orig_errors,
                            "pack_original_note": "the unpatched pack schema rejects every extended entry (decision 021)"})

    # 2. IDs resolve
    entries = [*meta["spawnPoints"], *meta["triggerZones"], *meta["movementBoundaries"], *meta["collisionObjects"],
               *meta["spectatorLocations"], *meta["signalAnchors"], meta["watcherDetectionReference"]]
    refs = [meta["watcherDetectionReference"]["anchorObjectId"]] + [c["sourceVisualObjectId"] for c in meta["collisionObjects"]] \
        + [s["viewTargetObjectId"] for s in meta["spectatorLocations"]]
    scene_names = {o.name for o in bpy.context.scene.objects}
    p = [f"{e['id']} is not a scene object" for e in entries if e["id"] not in scene_names]
    p += [f"{e['id']}: objectName {e.get('objectName')} differs from id" for e in entries if e.get("objectName", e["id"]) != e["id"]]
    p += [f"reference {r} is not a scene object" for r in refs if r not in scene_names]
    ids = [s["id"] for s in meta["sceneObjects"]]
    p += [f"duplicate sceneObjects id {i}" for i in {i for i in ids if ids.count(i) > 1}]
    p += [f"sceneObjects lists {i}, not in the scene" for i in set(ids) - scene_names]
    p += [f"scene object {i} missing from sceneObjects" for i in scene_names - set(ids)]
    p += [f"{s['id']}: collection {s['collection']} differs from the scene" for s in meta["sceneObjects"]
          if s["id"] in O and s["collection"] != collection_of(O[s["id"]])]
    check("ids_resolve", p, {"entries": len(entries), "references": len(refs), "scene_objects": len(ids)})

    # 3. transforms match the scene
    p = []
    for e in entries:
        o = O.get(e["id"])
        if o is None:
            continue
        t = o.matrix_world.translation
        if any(abs(e["position"][k] - t[i]) > POS_TOL for i, k in enumerate("xyz")):
            p.append(f"{e['id']} position {e['position']} != scene {tuple(round(v, 4) for v in t)}")
        er = o.matrix_world.to_euler("XYZ")
        if any(abs(e["rotation"][k] - math.degrees(er[i])) > ROT_TOL for i, k in enumerate("xyz")):
            p.append(f"{e['id']} rotation differs from the scene")
        d = e.get("dimensions") or e.get("coverageDimensions")
        if d and any(abs(d[k] - o.dimensions[i]) > DIM_TOL for i, k in enumerate("xyz")):
            p.append(f"{e['id']} dimensions {d} != scene {tuple(round(v, 4) for v in o.dimensions)}")
    check("transforms_match", p, {"compared": len(entries), "tolerance": {"position_m": POS_TOL, "rotation_deg": ROT_TOL, "dimensions_m": DIM_TOL}})

    # 4. spawns
    sp = meta["spawnPoints"]
    p = []
    want = [f"SPAWN_PLAYER_{i:02d}" for i in range(1, 31)]
    if [s["id"] for s in sp] != want:
        p.append("spawn IDs are not exactly SPAWN_PLAYER_01..30")
    start = O.get("TRIGGER_START_LINE")
    smin, smax = bounds(start) if start else (Vector(), Vector())
    xs = {r4(s["position"]["x"]) for s in sp}
    ys = {r4(s["position"]["y"]) for s in sp}
    half = (spec["spawns"]["columns"] - 1) * spec["spawns"]["spacing_x"] / 2
    grid_x = {r4(-half + i * spec["spawns"]["spacing_x"]) for i in range(spec["spawns"]["columns"])}
    if xs != grid_x or ys != {r4(y) for y in spec["spawns"]["row_y"]}:
        p.append(f"spawns are not on the approved grid (X {sorted(xs)}, Y {sorted(ys)})")
    r = cap["radius"]
    for s in sp:
        x, y, z = (s["position"][k] for k in "xyz")
        if not (smin.x + r <= x <= smax.x - r and smin.y + r <= y <= smax.y - r):
            p.append(f"{s['id']} capsule is not fully inside TRIGGER_START_LINE")
        if abs(z) > 1e-4:
            p.append(f"{s['id']} is not on the ground (Z {z})")
        f = forward(O[s["id"]]) if s["id"] in O else Vector((0, 1, 0))
        if f.y < 0.999:
            p.append(f"{s['id']} does not face the course (+Y)")
    dmin = min(math.dist((a["position"]["x"], a["position"]["y"]), (b["position"]["x"], b["position"]["y"]))
               for a, b in itertools.combinations(sp, 2))
    if dmin < 2 * r:
        p.append(f"capsules overlap (closest centres {dmin:.2f} m < {2 * r} m)")
    caps = [o for o in objs("PLAYER_SPAWNS") if o.name.endswith("_CAPSULE")]
    for c in caps:
        if abs(c.dimensions.x - 2 * r) > 1e-3 or abs(c.dimensions.z - cap["height"]) > 1e-3:
            p.append(f"{c.name} is not the approved {2 * r} x {cap['height']} m capsule")
    check("spawns", p, {"count": len(sp), "unique": len({s['id'] for s in sp}), "closest_centres_m": round(dmin, 3),
                        "clear_gap_m": round(dmin - 2 * r, 3), "capsule": cap})

    # 5. triggers
    p = []
    roles = {t["id"]: t["role"] for t in meta["triggerZones"]}
    if roles.get("TRIGGER_START_LINE") != "start":
        p.append("TRIGGER_START_LINE (role start) missing")
    if roles.get("TRIGGER_FINISH_LINE") != "finish":
        p.append("TRIGGER_FINISH_LINE (role finish) missing")
    col_ids = {c["id"] for c in meta["collisionObjects"]}
    for t in meta["triggerZones"]:
        o = O.get(t["id"])
        if t["id"] in col_ids:
            p.append(f"{t['id']} is also exported as a solid collider")
        if o is not None and (collection_of(o) != "GAMEPLAY_TRIGGERS" or o.get("col_type") != "trigger"):
            p.append(f"{t['id']} is not a trigger in GAMEPLAY_TRIGGERS")
    fmin, fmax = bounds(O["TRIGGER_FINISH_LINE"])
    if (round(fmin.y, 3), round(fmax.y, 3)) != (spec["course_length"], spec["course_length"] + spec["finish_trigger_depth"]):
        p.append(f"finish trigger spans Y {fmin.y}..{fmax.y}, spec L4 says {spec['course_length']}..+{spec['finish_trigger_depth']}")
    if (round(smin.y, 3), round(smax.y, 3)) != (-spec["start_zone_depth"], 0.0):
        p.append(f"start trigger spans Y {smin.y}..{smax.y}, spec L2 says -{spec['start_zone_depth']}..0")
    check("triggers", p, {"triggers": roles})

    # 6. boundaries enclose the playable area
    p = []
    area_min, area_max = bounds(O["BOUNDARY_PLAYABLE_AREA"])
    walls = {n: bounds(O[n]) for n in ("BOUNDARY_LEFT", "BOUNDARY_RIGHT", "BOUNDARY_BACK", "BOUNDARY_FINISH")}
    if abs(walls["BOUNDARY_LEFT"][1].x - area_min.x) > 1e-3 or abs(walls["BOUNDARY_RIGHT"][0].x - area_max.x) > 1e-3:
        p.append("side walls do not meet the playable area edges")
    if abs(walls["BOUNDARY_BACK"][1].y - area_min.y) > 1e-3 or abs(walls["BOUNDARY_FINISH"][0].y - area_max.y) > 1e-3:
        p.append("end walls do not meet the playable area edges")
    for n, (mn, mx) in walls.items():
        if mx.z - mn.z < cap["height"]:
            p.append(f"{n} is lower than the contestant capsule")
        if O[n].get("col_type") != "solid":
            p.append(f"{n} is not solid")
    if abs((area_max.x - area_min.x) - spec["width"]) > 1e-3:
        p.append("playable width differs from spec L1")
    check("boundaries", p, {"playable_area_m": {"x": [r4(area_min.x), r4(area_max.x)], "y": [r4(area_min.y), r4(area_max.y)]}})

    # 7. collision separated from decoration, every physical visual covered
    import stage_01_collision_setup as setup
    p = []
    for cname in GAMEPLAY:
        for o in objs(cname):
            if o.type == "MESH" and len(o.data.materials):
                p.append(f"{o.name} (gameplay) carries render materials")
    for cname in VISUAL:
        for o in objs(cname):
            if re.match(r"^(COLLISION_|TRIGGER_|BOUNDARY_|SPAWN_|SPECTATOR_|SIGNAL_|WATCHER_|COL_|GMK_)", o.name):
                p.append(f"{o.name} is a gameplay object inside visual collection {cname}")
    sources = {}
    for c in meta["collisionObjects"]:
        src = O.get(c["sourceVisualObjectId"])
        if src is None:
            continue
        if collection_of(src) not in VISUAL:
            p.append(f"{c['id']} source {src.name} is not a visual object")
        sources.setdefault(src.name, []).append(c["id"])
        o = O[c["id"]]
        if c["colliderType"] == "box" and o.get("gameplay_role") == "collision_solid":
            mn, mx = bounds(o)
            smn, smx = bounds(src)
            if any(mn[i] > smn[i] + 1e-4 or mx[i] < smx[i] - 1e-4 for i in range(2)) or mx.z < smx.z - 1e-4:
                p.append(f"{c['id']} does not cover {src.name}")
    physical = sorted(o.name for o in bpy.context.scene.objects if setup.PHYSICAL.match(o.name))
    uncovered = [n for n in physical if n not in sources]
    p += [f"physical visual {n} has no collision proxy" for n in uncovered]
    for vis, gid in setup.COVERED_BY.items():
        if gid not in O:
            p.append(f"{vis} is meant to be covered by {gid}, which is missing")
    decor = {c: sum(1 for o in objs(c) if o.name not in sources and o.name not in setup.COVERED_BY and o.type == "MESH") for c in VISUAL}
    check("collision_separation", p, {"collision_objects": len(meta["collisionObjects"]), "physical_visuals": len(physical),
                                      "covered_by_existing_gameplay_objects": setup.COVERED_BY,
                                      "non_colliding_decorative_meshes": decor})

    # 8. watcher reference
    p = []
    root = O["WATCHER_ROOT_ANCHOR"]
    wd = O["WATCHER_DETECTION_REFERENCE"]
    sh = spec["shepherd"]
    if (root.location - Vector((sh["x"], sh["y"], sh["platform_height"]))).length > 1e-3:
        p.append("WATCHER_ROOT_ANCHOR is not on top of the approved Shepherd platform")
    if forward(root).y > -0.999 or forward(wd).y > -0.999:
        p.append("watcher reference does not face the players (-Y)")
    if abs(wd["half_angle_deg"] - 55.0) > 1e-6:
        p.append("coverage half-angle differs from the approved ±55°")
    apex = Vector((wd.location.x, wd.location.y))
    # Detection applies from the start wall to the finish line (finish and safe volumes are immune, spec D5);
    # design spec §5 gives the finish corners at ±50.2° and the start corners at ±8.7°.
    finish_y = O["FINISH_LINE_ANCHOR"].location.y
    for x in (area_min.x, area_max.x):
        for y in (area_min.y, finish_y):
            d = Vector((x, y)) - apex
            ang = math.degrees(math.atan2(d.x, -d.y))
            if d.length > wd["reach_m"] or abs(ang) > wd["half_angle_deg"]:
                p.append(f"yard corner ({x}, {y}) is outside the coverage sector")
    smn, smx = bounds(wd)
    if smn.y > area_min.y or smx.y > wd.location.y + 1e-3:
        p.append(f"coverage sector geometry (Y {smn.y:.1f}..{smx.y:.1f}) does not reach back over the yard")
    corner = max(abs(math.degrees(math.atan2(x - apex.x, apex.y - finish_y))) for x in (area_min.x, area_max.x))
    check("watcher_reference", p, {"root": vec(root.location), "half_angle_deg": wd["half_angle_deg"], "reach_m": wd["reach_m"],
                                   "finish_corner_angle_deg": round(corner, 1)})

    # 9. spectators: outside the playable area and triggers, facing their target
    p = []
    for s in meta["spectatorLocations"]:
        x, y = s["position"]["x"], s["position"]["y"]
        if area_min.x <= x <= area_max.x and area_min.y <= y <= area_max.y:
            p.append(f"{s['id']} is inside the playable yard")
        tgt = O.get(s["viewTargetObjectId"])
        if tgt is None or s["id"] not in O:
            continue
        f = forward(O[s["id"]])
        if s["id"].startswith(("SPECTATOR_BENCH", "SPECTATOR_GANTRY")):
            # seats and gantry spots face straight across to the course centre line
            if f.x * (tgt.location.x - x) <= 0 or abs(f.x) < 0.99:
                p.append(f"{s['id']} does not face the course")
        else:
            d = tgt.location - O[s["id"]].location
            if Vector((d.x, d.y)).normalized().dot(Vector((f.x, f.y)).normalized()) < 0.99:
                p.append(f"{s['id']} does not face {tgt.name}")
    check("spectators", p, {"count": len(meta["spectatorLocations"])})

    # 10. signal anchors
    p = []
    types = {s["id"]: s["signalType"] for s in meta["signalAnchors"]}
    if types.get("SIGNAL_RED_ANCHOR") != "red":
        p.append("SIGNAL_RED_ANCHOR missing")
    if types.get("SIGNAL_GREEN_ANCHOR") != "green":
        p.append("SIGNAL_GREEN_ANCHOR missing")
    for s in meta["signalAnchors"]:
        src = O.get(O[s["id"]].get("source_visual", "")) if s["id"] in O else None
        if src is None:
            p.append(f"{s['id']} has no source visual")
    check("signal_anchors", p, {"anchors": types})

    # 11. agreement with the runtime exports the server and client load today
    p = []
    col = json.loads((RUNTIME_DIR / "STG01_collision.json").read_text())
    mk = json.loads((RUNTIME_DIR / "STG01_markers.json").read_text())
    boxes = {c["id"]: c for c in col["colliders"] + col.get("camera_colliders", [])}
    markers = {m["id"]: m for m in mk["markers"]}
    compared = 0
    for o in bpy.context.scene.objects:
        lid = o.get("legacy_id")
        if lid in boxes:
            c = boxes[lid]
            mn, mx = bounds(o)
            gmn = (mn.x, mn.z, -mx.y)
            gmx = (mx.x, mx.z, -mn.y)
            want_mn = [c["center"][i] - c["size"][i] / 2 for i in range(3)]
            want_mx = [c["center"][i] + c["size"][i] / 2 for i in range(3)]
            if any(abs(a - b) > 1e-3 for a, b in zip(gmn + gmx, want_mn + want_mx)):
                p.append(f"{o.name} bounds differ from runtime collider {lid}")
            compared += 1
        elif lid in markers:
            t = o.matrix_world.translation
            if any(abs(a - b) > 1e-3 for a, b in zip((t.x, t.z, -t.y), markers[lid]["position"])):
                p.append(f"{o.name} position differs from runtime marker {lid}")
            compared += 1
    expected = len(boxes) + len([m for m in markers if m in {o.get('legacy_id') for o in bpy.context.scene.objects}])
    if compared < len(boxes):
        p.append("not every runtime collider has a matching gameplay object")
    check("runtime_consistency", p, {"compared": compared, "expected": expected,
                                     "files": ["blender/exports/STG01/STG01_collision.json", "blender/exports/STG01/STG01_markers.json"]})

    # 12. conventions: units, applied transforms, IDs
    p = []
    us = bpy.context.scene.unit_settings
    if us.system != "METRIC" or abs(us.scale_length - 1.0) > 1e-9:
        p.append("scene units are not metric with scale 1.0")
    for o in bpy.context.scene.objects:
        if any(s < 0 for s in o.scale):
            p.append(f"{o.name} has a negative scale")
    for cname in GAMEPLAY:
        for o in objs(cname):
            if any(abs(s - 1) > 1e-6 for s in o.scale):
                p.append(f"{o.name} has an unapplied scale")
            if abs(o.rotation_euler.x) > 1e-6 or abs(o.rotation_euler.y) > 1e-6:
                p.append(f"{o.name} is tilted (only yaw is used)")
            if not re.fullmatch(r"[A-Z][A-Z0-9_]*", o.name):
                p.append(f"{o.name} is not an uppercase snake-case ID")
            if o.parent is not None:
                p.append(f"{o.name} is parented (metadata uses world transforms of unparented objects)")
    check("conventions", p, {"units": "metric, scale 1.0, metres", "blender": bpy.app.version_string})

    # 13. runtime responsibility boundary: no logic in the .blend
    p = []
    if len(bpy.data.texts):
        p.append(f"{len(bpy.data.texts)} text block(s) / scripts in the .blend")
    for o in bpy.data.objects:
        if o.animation_data and (o.animation_data.drivers or o.animation_data.action):
            p.append(f"{o.name} has drivers or animation")
    banned = re.compile(r"elimin|spotted|grace|speed_limit|timer|qualif|signal_state|schedule", re.I)
    for o in bpy.data.objects:
        for k in o.keys():
            if banned.search(k):
                p.append(f"{o.name} has rule-like property '{k}'")
    check("no_game_logic", p, {"text_blocks": len(bpy.data.texts), "node_groups": len(bpy.data.node_groups)})

    notes = [
        "All IDs equal Blender object names. Positions are world-space object origins in metres; box volumes have their "
        "origin at the bottom centre. Rotations are Euler XYZ in degrees.",
        "The runtime still loads blender/exports/STG01/STG01_collision.json and STG01_markers.json (built from "
        "STAGE_01_GREYBOX.blend); check runtime_consistency proves those agree with this metadata.",
        "TRIGGER_START_LINE is new: the approved start zone volume (spec L2). Crossing its +Y face is the start line.",
        "TRIGGER_SAFE_ZONE uses role 'finish' (the schema allows only start and finish); it counts as finished (spec D5).",
        "SIGNAL_RED_ANCHOR and SIGNAL_GREEN_ANCHOR share the lantern centre because one lantern shows every colour.",
        "WATCHER_DETECTION_REFERENCE is the ±55° presentation sector; server detection is not line-of-sight (E9).",
        "Outside-yard proxies (towers, benches, gantry, booth, relics, outer barrier) never meet contestants; they are "
        "for walk-offs, spectators and the camera.",
    ]
    result = "PASS" if all(c["pass"] for c in checks.values()) else "FAIL"
    return {"result": result, "blend": str(BLEND.relative_to(ROOT)), "metadata": str(META.relative_to(ROOT)),
            "blender": bpy.app.version_string, "checks": checks, "notes": notes}


def write_report(report: dict, path: Path = REPORT) -> None:
    cb.write_json(path, report)
    for name, c in report["checks"].items():
        print(f"{'PASS' if c['pass'] else 'FAIL'}  {name}" + ("" if c["pass"] else f": {c['problems'][:3]}"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--blend", default=str(BLEND))
    ap.add_argument("--metadata", default=str(META))
    ap.add_argument("--report", default=str(REPORT))
    args = cb.parse_args(ap)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
    meta = json.loads(Path(args.metadata).read_text())
    report = run_checks(meta)
    # The committed metadata must equal what the scene produces now (nobody hand-edited it).
    fresh = build_metadata()
    stale = [k for k in fresh if fresh[k] != meta.get(k)]
    report["checks"]["metadata_up_to_date"] = {"pass": not stale, "problems": [f"section {k} differs from the scene" for k in stale]}
    if stale:
        report["result"] = "FAIL"
    write_report(report, Path(args.report))
    print("RESULT", report["result"])
    sys.exit(0 if report["result"] == "PASS" else 1)


if __name__ == "__main__":
    main()
