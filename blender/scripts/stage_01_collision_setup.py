"""Prompt 04: make the approved Stage 01 greybox ready for gameplay integration.

Opens the approved `blender/scenes/STAGE_01_GREYBOX.blend` (it is not rebuilt or edited) and saves
`blender/scenes/STAGE_01_COLLISION_READY.blend` with gameplay support objects kept apart from the
decorative geometry:

    GAMEPLAY_COLLISION   simplified solid proxies (boxes) for every physical structure
    GAMEPLAY_TRIGGERS    non-solid start, finish and safe-zone volumes
    GAMEPLAY_BOUNDARIES  the fence walls that limit movement, plus the playable-area volume
    GAMEPLAY_MARKERS     start line, finish line and course centre anchors
    PLAYER_SPAWNS        SPAWN_PLAYER_01..30 and their capsule-size references
    WATCHER_REFERENCE    The Shepherd's root and head anchors and the presentation coverage sector
    SPECTATOR_LOCATIONS  bench seats, gantry spots and the high spectator viewpoint
    SIGNAL_ANCHORS       where the red / green / shared signal visuals and sounds attach
    VISUAL_ARCHITECTURE, VISUAL_PROPS, VISUAL_WATCHER, LIGHTING, CAMERAS, REFERENCE

Every position comes from an object in the approved greybox (renamed, or a proxy fitted to its
bounds); nothing is retyped. Then it writes `blender/exports/STAGE_01_METADATA.json` (pack schema
1.0.0) and runs the checks in validate_stage_01_metadata.py. With --screenshots it renders top,
side and perspective validation images to renders/.

No game rules live here: no signal timing, movement detection, elimination or qualification. The
server owns those (GDD §7.3, docs/STAGE_01_SPEC.md §3-§5).

    python blender/scripts/stage_01_collision_setup.py --screenshots
"""
from __future__ import annotations

import argparse
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
GREYBOX = ROOT / "blender/scenes/STAGE_01_GREYBOX.blend"
OUT_BLEND = ROOT / "blender/scenes/STAGE_01_COLLISION_READY.blend"
OUT_META = ROOT / "blender/exports/STAGE_01_METADATA.json"
STAGE_ID = "STAGE_01_RED_LIGHT"

GAMEPLAY = ("GAMEPLAY_COLLISION", "GAMEPLAY_TRIGGERS", "GAMEPLAY_BOUNDARIES", "GAMEPLAY_MARKERS",
            "PLAYER_SPAWNS", "WATCHER_REFERENCE", "SPECTATOR_LOCATIONS", "SIGNAL_ANCHORS")
VISUAL = ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_WATCHER", "LIGHTING")
OTHER = ("CAMERAS", "REFERENCE")
ALL_COLLECTIONS = GAMEPLAY + VISUAL + OTHER

# Review colours (viewport and validation renders): RGBA.
COLOURS = {
    "GAMEPLAY_COLLISION": (0.10, 0.45, 1.00, 1.0),
    "camera_collider": (0.55, 0.40, 1.00, 1.0),
    "trigger_start": (0.25, 1.00, 0.35, 1.0),
    "trigger_finish": (1.00, 0.85, 0.10, 1.0),
    "trigger_safe": (0.10, 0.90, 0.90, 1.0),
    "GAMEPLAY_BOUNDARIES": (1.00, 0.30, 0.00, 1.0),
    "PLAYER_SPAWNS": (1.00, 1.00, 1.00, 1.0),
    "WATCHER_REFERENCE": (1.00, 0.20, 0.30, 1.0),
    "SPECTATOR_LOCATIONS": (0.85, 0.40, 1.00, 1.0),
    "GAMEPLAY_MARKERS": (1.00, 1.00, 0.40, 1.0),
}

# Visual meshes that physically exist where a body or camera can touch them get a box proxy.
PHYSICAL = re.compile(
    r"^(PRP_KIT_Bench_\d+|PRP_STG01_FinishGate_(Post_[EW]|Beam)|PRP_STG01_JudgesBooth_.+|PRP_STG01_ShepherdPlatform"
    r"|PRP_STG01_SpectatorGantry_.+|PRP_STG01_StartBarrier_(Arm|Post_[EW])|PRP_KIT_FloodlightTower_\d+"
    r"|PRP_KIT_ConcreteBarrier_[NSEW]|PRP_STG01_(RocketFrame|RoundaboutSpinner|SeeSaw|Slide|SwingSet)_A|STG01_Ground_Outer)$")
MOVING = {"PRP_STG01_StartBarrier_Arm"}  # raised to 6 m for the whole round (decision 019, G1)
# Physical visuals whose collision is an existing gameplay object instead of a new proxy.
COVERED_BY = {
    "STG01_Ground_Yard": "COLLISION_GROUND_MAIN",
    "PRP_STG01_Fence_W": "BOUNDARY_LEFT", "PRP_STG01_Fence_E": "BOUNDARY_RIGHT",
    "PRP_STG01_Fence_S": "BOUNDARY_BACK", "PRP_STG01_Fence_N": "BOUNDARY_FINISH",
    "PRP_KIT_ServiceGate_01": "BOUNDARY_RIGHT", "PRP_KIT_ServiceGate_02": "BOUNDARY_RIGHT",
}

# Renames of approved greybox gameplay objects (new ID -> greybox ID, collection, role).
RENAMES = {
    "COLLISION_GROUND_MAIN": ("COL_STG01_Ground", "GAMEPLAY_COLLISION", "collision_ground"),
    "COLLISION_CAMERA_FENCE_LEFT": ("COL_CAM_STG01_Fence_W", "GAMEPLAY_COLLISION", "collision_camera_only"),
    "COLLISION_CAMERA_FENCE_RIGHT": ("COL_CAM_STG01_Fence_E", "GAMEPLAY_COLLISION", "collision_camera_only"),
    "COLLISION_CAMERA_FENCE_BACK": ("COL_CAM_STG01_Fence_S", "GAMEPLAY_COLLISION", "collision_camera_only"),
    "TRIGGER_FINISH_LINE": ("COL_STG01_FinishTrigger", "GAMEPLAY_TRIGGERS", "trigger_finish"),
    "TRIGGER_SAFE_ZONE": ("COL_STG01_SafeZone", "GAMEPLAY_TRIGGERS", "trigger_safe"),
    "BOUNDARY_LEFT": ("COL_STG01_Wall_W", "GAMEPLAY_BOUNDARIES", "boundary_wall"),
    "BOUNDARY_RIGHT": ("COL_STG01_Wall_E", "GAMEPLAY_BOUNDARIES", "boundary_wall"),
    "BOUNDARY_BACK": ("COL_STG01_Wall_S", "GAMEPLAY_BOUNDARIES", "boundary_wall"),
    "BOUNDARY_FINISH": ("COL_STG01_Wall_N", "GAMEPLAY_BOUNDARIES", "boundary_wall"),
    "START_LINE_ANCHOR": ("GMK_START", "GAMEPLAY_MARKERS", "start_line"),
    "FINISH_LINE_ANCHOR": ("GMK_FINISH", "GAMEPLAY_MARKERS", "finish_line"),
    "WATCHER_ROOT_ANCHOR": ("GMK_SHEPHERD", "WATCHER_REFERENCE", "watcher_root"),
    "SPECTATOR_01": ("GMK_SPECTATOR_01", "SPECTATOR_LOCATIONS", "spectator_viewpoint"),
}
RENAMES.update({f"SPAWN_PLAYER_{i:02d}": (f"GMK_SPAWN_{i:02d}", "PLAYER_SPAWNS", "spawn") for i in range(1, 31)})
RENAMES.update({f"SPAWN_PLAYER_{i:02d}_CAPSULE": (f"GMK_SPAWN_{i:02d}_Capsule", "PLAYER_SPAWNS", "spawn_capsule_reference")
                for i in range(1, 31)})
RENAMES.update({f"SPECTATOR_BENCH_{i:02d}": (f"GMK_BENCH_{i:02d}", "SPECTATOR_LOCATIONS", "spectator_bench_seat")
                for i in range(1, 16)})
# Greybox review overlays superseded by the trigger and watcher reference objects.
RETIRED = ("ZONE_STG01_Start", "ZONE_STG01_Finish", "ZONE_STG01_Safe", "ZONE_STG01_ShepherdCoverage", "GMK_BOUNDS")


def snake(name: str) -> str:
    base = re.sub(r"^(PRP_STG01_|PRP_KIT_|STG01_)", "", name)
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", base).upper()


def bounds(obj):
    """World-space axis-aligned bounds (min, max) of a mesh, or the origin of an empty."""
    if obj.type == "MESH" and obj.data.vertices:
        pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
        return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
    t = obj.matrix_world.translation
    return t.copy(), t.copy()


def centre(obj) -> Vector:
    mn, mx = bounds(obj)
    return (mn + mx) / 2


def yaw_towards(src: Vector, dst: Vector) -> float:
    """Yaw (radians) that turns a marker's forward axis (local -Y, as the greybox spawns use) toward dst."""
    d = dst - src
    return math.atan2(d.x, -d.y)


class Setup:
    def __init__(self) -> None:
        if not GREYBOX.exists():
            sys.exit(f"Missing approved input: {GREYBOX.relative_to(ROOT)}")
        bpy.ops.wm.open_mainfile(filepath=str(GREYBOX))
        self.scene = bpy.context.scene
        self.cols: dict[str, bpy.types.Collection] = {}

    # ------------------------------------------------------------- collections
    def reorganise(self) -> None:
        old = [c for c in self.scene.collection.children]
        for name in ALL_COLLECTIONS:
            col = bpy.data.collections.new(name)
            self.scene.collection.children.link(col)
            self.cols[name] = col
        for name in RETIRED:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
        for new_id, (old_id, coll, role) in RENAMES.items():
            obj = bpy.data.objects[old_id]
            obj.name = new_id
            obj["legacy_id"] = old_id
            obj["gameplay_role"] = role
            self.move(obj, coll)
        for obj in list(self.scene.objects):
            if obj.name in RENAMES:
                continue
            self.move(obj, self.visual_collection(obj))
        for col in old:
            if col.objects or col.children:
                raise RuntimeError(f"Collection {col.name} still holds objects after the move")
            bpy.data.collections.remove(col)

    @staticmethod
    def visual_collection(obj) -> str:
        n = obj.name
        if obj.type == "CAMERA":
            return "CAMERAS"
        if obj.type == "LIGHT":
            return "LIGHTING"
        if n.startswith("REF_") or n in ("ZONE_STG01_Course", "ENM_Shepherd_Envelope", "ENM_Shepherd_Facing_Arrow"):
            return "REFERENCE"
        if n.startswith("ENM_"):
            return "VISUAL_WATCHER"
        if n.startswith(("PRP_KIT_FloodlightTower", "PRP_KIT_SignalLamp", "PRP_KIT_Loudspeaker")):
            return "LIGHTING"
        if n.startswith(("STG01_BG_", "PRP_KIT_ConcreteBarrier", "PRP_STG01_RocketFrame", "PRP_STG01_RoundaboutSpinner",
                         "PRP_STG01_SeeSaw", "PRP_STG01_Slide", "PRP_STG01_SwingSet")):
            return "VISUAL_PROPS"
        if n.startswith(("STG01_", "PRP_")):
            return "VISUAL_ARCHITECTURE"
        raise RuntimeError(f"No collection rule for {n}")

    def move(self, obj, coll: str) -> None:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        self.cols[coll].objects.link(obj)

    # ------------------------------------------------------------- object helpers
    def box(self, name: str, coll: str, mn: Vector, mx: Vector, props: dict):
        """Box volume with its origin at the bottom centre (the greybox convention for collision boxes)."""
        size = mx - mn
        mesh = cb.box_mesh(name, size.x, size.y, size.z)
        obj = cb.place(name, mesh, self.cols[coll], ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z), props)
        return obj

    def anchor(self, name: str, coll: str, loc, yaw: float = 0.0, props: dict | None = None, display="ARROWS"):
        obj = cb.empty(name, self.cols[coll], tuple(loc), display, 1.0, math.degrees(yaw), props)
        return obj

    # ------------------------------------------------------------- gameplay layer
    def build(self) -> None:
        obj = bpy.data.objects
        # Triggers: the start trigger covers the approved start zone (L2: Y -15..0, full width), the
        # same footprint and 3 m height as the finish and safe volumes. Leaving it across Y = 0 is
        # crossing the start line.
        wall_w, wall_e = bounds(obj["BOUNDARY_LEFT"]), bounds(obj["BOUNDARY_RIGHT"])
        back = bounds(obj["BOUNDARY_BACK"])
        finish = bounds(obj["TRIGGER_FINISH_LINE"])
        start_line_y = obj["START_LINE_ANCHOR"].matrix_world.translation.y
        start_zone_min = Vector((wall_w[1].x, back[1].y, 0.0))
        start_zone_max = Vector((wall_e[0].x, start_line_y, finish[1].z))
        self.box("TRIGGER_START_LINE", "GAMEPLAY_TRIGGERS", start_zone_min, start_zone_max,
                 {"gameplay_role": "trigger_start", "col_shape": "box", "col_type": "trigger", "trigger_role": "start"})

        # Playable area: the whole fenced yard (replaces the greybox GMK_BOUNDS empty, same extents).
        ground = bounds(obj["COLLISION_GROUND_MAIN"])
        self.box("BOUNDARY_PLAYABLE_AREA", "GAMEPLAY_BOUNDARIES", Vector((ground[0].x, ground[0].y, 0.0)),
                 Vector((ground[1].x, ground[1].y, wall_w[1].z)),
                 {"gameplay_role": "boundary_playable_area", "legacy_id": "GMK_BOUNDS"})

        # Course anchors.
        s = obj["START_LINE_ANCHOR"].matrix_world.translation
        f = obj["FINISH_LINE_ANCHOR"].matrix_world.translation
        course_centre = (s + f) / 2
        self.anchor("COURSE_CENTRE_ANCHOR", "GAMEPLAY_MARKERS", course_centre, 0.0, {"gameplay_role": "course_centre"}, "PLAIN_AXES")

        # Collision proxies for physical visual meshes.
        for v in sorted((o for o in self.scene.objects if PHYSICAL.match(o.name)), key=lambda o: o.name):
            mn, mx = bounds(v)
            if mx.z - mn.z < 0.1:  # thin ground slabs get a 0.1 m proxy below their top surface
                mn = Vector((mn.x, mn.y, mx.z - 0.1))
            name = "COLLISION_" + snake(v.name)
            self.box(name, "GAMEPLAY_COLLISION", mn, mx, {
                "gameplay_role": "collision_solid", "col_shape": "box", "col_type": "solid",
                "source_visual": v.name, "static_or_moving": "moving" if v.name in MOVING else "static"})
        for new_id, src in (("COLLISION_GROUND_MAIN", "STG01_Ground_Yard"),
                            ("COLLISION_CAMERA_FENCE_LEFT", "PRP_STG01_Fence_W"),
                            ("COLLISION_CAMERA_FENCE_RIGHT", "PRP_STG01_Fence_E"),
                            ("COLLISION_CAMERA_FENCE_BACK", "PRP_STG01_Fence_S"),
                            ("BOUNDARY_LEFT", "PRP_STG01_Fence_W"), ("BOUNDARY_RIGHT", "PRP_STG01_Fence_E"),
                            ("BOUNDARY_BACK", "PRP_STG01_Fence_S"), ("BOUNDARY_FINISH", "PRP_STG01_Fence_N")):
            obj[new_id]["source_visual"] = src
            obj[new_id]["static_or_moving"] = "static"

        # Spawns face the course (+Y). Keep the greybox transforms; add the row and column.
        for i in range(1, 31):
            sp = obj[f"SPAWN_PLAYER_{i:02d}"]
            sp.empty_display_type = "ARROWS"
            obj[f"SPAWN_PLAYER_{i:02d}_CAPSULE"]["review_only"] = True

        # The Shepherd: root anchor faces the players (the RED pose), head anchor at the head centre.
        root = obj["WATCHER_ROOT_ANCHOR"]
        root.rotation_euler = (0.0, 0.0, yaw_towards(root.location, course_centre))
        root.empty_display_type = "ARROWS"
        head = centre(obj["ENM_Shepherd_Placeholder_Head"])
        self.anchor("WATCHER_HEAD_ANCHOR", "WATCHER_REFERENCE", head, root.rotation_euler.z,
                    {"gameplay_role": "watcher_head", "source_visual": "ENM_Shepherd_Placeholder_Head"})
        self.coverage_sector(root, head)

        # Spectators: gantry deck spots every 20 m (10 m bays), facing the course centre line.
        deck_mn, deck_mx = bounds(obj["PRP_STG01_SpectatorGantry_Deck"])
        deck_x = (deck_mn.x + deck_mx.x) / 2
        for k in range(5):
            y = deck_mn.y + 10 + 20 * k
            loc = Vector((deck_x, y, deck_mx.z))
            self.anchor(f"SPECTATOR_GANTRY_{k + 1:02d}", "SPECTATOR_LOCATIONS", loc,
                        yaw_towards(loc, Vector((course_centre.x, y, 0))), {"gameplay_role": "spectator_gantry_spot"})
        for i in range(1, 16):
            b = obj[f"SPECTATOR_BENCH_{i:02d}"]
            b.rotation_euler = (0.0, 0.0, yaw_towards(b.location, Vector((course_centre.x, b.location.y, 0))))
            b.empty_display_type = "ARROWS"
        sp1 = obj["SPECTATOR_01"]
        sp1.rotation_euler = (0.0, 0.0, yaw_towards(sp1.location, course_centre))
        for o in self.cols["SPECTATOR_LOCATIONS"].objects:
            o["view_target"] = "COURSE_CENTRE_ANCHOR"

        # Signal anchors. The lantern carries both signal colours (design spec §6), so the red and
        # green anchors share its centre; tower lamps and loudspeakers repeat every state.
        lantern = centre(obj["ENM_Shepherd_Placeholder_Lantern"])
        for name, sig in (("SIGNAL_GREEN_ANCHOR", "green"), ("SIGNAL_RED_ANCHOR", "red")):
            self.anchor(name, "SIGNAL_ANCHORS", lantern, root.rotation_euler.z,
                        {"gameplay_role": "signal_anchor", "signal_type": sig, "source_visual": "ENM_Shepherd_Placeholder_Lantern"})
        face = centre(obj["ENM_Shepherd_Placeholder_Face"])
        self.anchor("SIGNAL_SCAN_BEAM_ANCHOR", "SIGNAL_ANCHORS", face, root.rotation_euler.z,
                    {"gameplay_role": "signal_anchor", "signal_type": "red", "source_visual": "ENM_Shepherd_Placeholder_Face"})
        for lamp in sorted(o.name for o in self.scene.objects if re.match(r"^PRP_KIT_SignalLamp_\d+$", o.name)):
            n = lamp.rsplit("_", 1)[1]
            loc = centre(obj[lamp])
            self.anchor(f"SIGNAL_LAMP_{n}", "SIGNAL_ANCHORS", loc, yaw_towards(loc, Vector((0, loc.y, 0))),
                        {"gameplay_role": "signal_anchor", "signal_type": "shared", "source_visual": lamp})
        for spk in sorted(o.name for o in self.scene.objects if re.match(r"^PRP_KIT_Loudspeaker_\d+$", o.name)):
            n = spk.rsplit("_", 1)[1]
            loc = centre(obj[spk])
            self.anchor(f"SIGNAL_AUDIO_{n}", "SIGNAL_ANCHORS", loc, yaw_towards(loc, Vector((0, loc.y, 0))),
                        {"gameplay_role": "signal_audio_anchor", "signal_type": "shared", "source_visual": spk})

        # Common properties and review display for every gameplay object.
        for cname in GAMEPLAY:
            for o in self.cols[cname].objects:
                o["stage_id"] = STAGE_ID
                o["metadata_id"] = o.name
                if o.type == "MESH":
                    o.display_type = "WIRE" if cname != "PLAYER_SPAWNS" else "SOLID"
                    o.color = self.colour(o, cname)
                    o.data.materials.clear()
                else:
                    o.empty_display_size = 1.0

    def coverage_sector(self, root, head: Vector) -> None:
        """Flat ±55° sector (design spec §5 'Location, orientation and detection coverage') from the
        Shepherd's position, long enough to cover the whole yard. Presentation reference only."""
        half = 55.0
        ground = bounds(bpy.data.objects["COLLISION_GROUND_MAIN"])
        apex = Vector((root.location.x, root.location.y, 0.05))
        finish_y = bpy.data.objects["FINISH_LINE_ANCHOR"].location.y
        corners = [Vector((x, y, 0)) for x in (ground[0].x, ground[1].x) for y in (ground[0].y, finish_y)]
        reach = math.ceil(max((c - Vector((apex.x, apex.y, 0))).length for c in corners))
        bm = bmesh.new()
        verts = [bm.verts.new((0, 0, 0))]
        segs = 22
        for i in range(segs + 1):
            a = math.radians(-half + 2 * half * i / segs)
            verts.append(bm.verts.new((reach * math.sin(a), -reach * math.cos(a), 0)))  # along local -Y (forward)
        for i in range(1, segs + 1):
            bm.faces.new((verts[0], verts[i], verts[i + 1]))
        mesh = bpy.data.meshes.new("WATCHER_DETECTION_REFERENCE")
        bm.to_mesh(mesh)
        bm.free()
        o = cb.place("WATCHER_DETECTION_REFERENCE", mesh, self.cols["WATCHER_REFERENCE"], tuple(apex), {
            "gameplay_role": "watcher_detection_reference", "coverage_shape": "sector", "half_angle_deg": half,
            "reach_m": float(reach), "head_height_m": round(head.z, 3), "anchor": "WATCHER_ROOT_ANCHOR",
            "legacy_id": "ZONE_STG01_ShepherdCoverage"})
        o.rotation_euler = root.rotation_euler.copy()

    @staticmethod
    def colour(o, cname: str):
        role = o.get("gameplay_role", "")
        if role in COLOURS:
            return COLOURS[role]
        if role == "collision_camera_only":
            return COLOURS["camera_collider"]
        return COLOURS.get(cname, (1, 1, 1, 1))

    def save(self) -> None:
        OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND), compress=True)
        print("Saved", OUT_BLEND.relative_to(ROOT))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--screenshots", action="store_true", help="also render the validation screenshots")
    ap.add_argument("--samples", type=int, default=16)
    args = cb.parse_args(ap)
    s = Setup()
    s.reorganise()
    s.build()
    s.save()
    import validate_stage_01_metadata as v  # noqa: E402  (shares the scene checks)
    meta = v.build_metadata()
    report = v.run_checks(meta)
    meta["validation"] = {
        "spawnPointCount": len(meta["spawnPoints"]),
        "allObjectIdsResolve": report["checks"]["ids_resolve"]["pass"],
        "metadataMatchesScene": report["checks"]["transforms_match"]["pass"],
        "notes": report["notes"],
    }
    cb.write_json(OUT_META, meta)
    print("Wrote", OUT_META.relative_to(ROOT))
    report = v.run_checks(meta)  # again with the validation block in place (schema check covers it)
    v.write_report(report)
    if args.screenshots:
        import stage_01_collision_screens as screens  # noqa: E402
        screens.render(args.samples)
    print("RESULT", report["result"])
    if report["result"] != "PASS":
        sys.exit(1)


if __name__ == "__main__":
    main()
