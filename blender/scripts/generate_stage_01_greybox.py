"""Generate the Stage 01 (Red Light, Green Light) greybox from the approved spec.

Primitives and flat placeholder materials only (GDD §10.1). Every number comes from
`blender/scripts/specs/stg01_greybox.json` (spec v0.3 = docs/STAGE_01_SPEC.md v0.2 +
docs/STAGE_01_DESIGN_SPEC.md, decision 017). Rebuilds the scene from scratch each run.

Collections (Prompt 03): 00_REFERENCE, 01_ARCHITECTURE, 02_GAMEPLAY_ZONES, 03_ENVIRONMENT_BLOCKERS,
04_WATCHER_PLACEHOLDER, 05_LIGHTING_PLACEHOLDERS, 06_COLLISION, 07_PLAYER_SPAWNS, 08_CAMERAS.
Objects tagged review_only (zone overlays, spawn capsules, envelopes) are review aids and never
reach the runtime GLB.

    python blender/scripts/generate_stage_01_greybox.py           # or: blender -b --python <this> --
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import bmesh  # noqa: E402  (importable only after bpy)
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402
from cn_blender import COLL  # noqa: E402


def spawn_points(spec: dict) -> list[tuple[float, float]]:
    """30 points, numbered from the centre of the front row outward (spec L7)."""
    sp = spec["spawns"]
    cols = sp["columns"]
    xs = [(i - (cols - 1) / 2.0) * sp["spacing_x"] for i in range(cols)]
    order = sorted(xs, key=lambda x: (abs(x), x))  # centre first, left before right
    return [(x, y) for y in sp["row_y"] for x in order]


def fan_mesh(name: str, apex, radius: float, half_angle_deg: float, heading_deg: float, segments: int, z: float, mat):
    """Flat wedge on the ground (Shepherd coverage marker). Heading 0 = toward -Y."""
    bm = bmesh.new()
    a = bm.verts.new((apex[0], apex[1], z))
    ring = []
    for i in range(segments + 1):
        t = math.radians(heading_deg - half_angle_deg + 2 * half_angle_deg * i / segments)
        ring.append(bm.verts.new((apex[0] + radius * math.sin(t), apex[1] - radius * math.cos(t), z)))
    for i in range(segments):
        bm.faces.new((a, ring[i + 1], ring[i]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    return mesh


class Builder:
    def __init__(self, spec: dict):
        self.s = spec
        self.c = {k: cb.collection(v) for k, v in COLL.items()}
        m = cb.material
        self.m = {
            "ground": m("MAT_Greybox_Ground", (0.16, 0.15, 0.14)),
            "yard": m("MAT_Greybox_Yard", (0.30, 0.27, 0.23)),
            "line": m("MAT_Greybox_Line", (0.85, 0.85, 0.80)),
            "prop": m("MAT_Greybox_Prop", (0.40, 0.40, 0.42)),
            "metal": m("MAT_Greybox_Metal", (0.22, 0.24, 0.27), roughness=0.5),
            "shep": m("MAT_Greybox_Shepherd", (0.55, 0.30, 0.16)),
            "lamp": m("MAT_Greybox_Lamp", (1.0, 0.78, 0.45), emission=8.0),
            "signal": m("MAT_Greybox_Signal", (0.3, 0.9, 0.6), emission=6.0),
            "bg": m("MAT_Greybox_Silhouette", (0.07, 0.08, 0.10)),
            "deck": m("MAT_Greybox_Deck", (0.55, 0.50, 0.30)),
            "relic": m("MAT_Greybox_Relic", (0.50, 0.35, 0.60)),
            "tree": m("MAT_Greybox_Tree", (0.06, 0.10, 0.09)),
            "concrete": m("MAT_Greybox_Concrete", (0.35, 0.35, 0.37)),
            "col": m("MAT_Greybox_Collision", (0.9, 0.1, 0.1), alpha=0.25),
            "zone_start": m("MAT_Zone_Start", (0.35, 0.45, 0.95), alpha=0.35),
            "zone_course": m("MAT_Zone_Course", (0.95, 0.85, 0.35), alpha=0.12),
            "zone_finish": m("MAT_Zone_Finish", (0.95, 0.45, 0.15), alpha=0.45),
            "zone_safe": m("MAT_Zone_Safe", (0.2, 0.85, 0.55), alpha=0.40),
            "zone_cover": m("MAT_Zone_Coverage", (0.1, 0.75, 0.75), alpha=0.18),
            "spawn": m("MAT_Ref_SpawnCapsule", (0.95, 0.95, 0.95)),
            "ref": m("MAT_Ref_Marker", (1.0, 0.1, 0.6)),
        }

    # ---------------------------------------------------------------- helpers
    def put(self, coll, name, mesh, loc, role, **props):
        return cb.place(name, mesh, self.c[coll], loc, {"role": role, **props})

    def box(self, coll, name, sx, sy, sz, loc, mat, role, mesh_name=None, **props):
        return self.put(coll, name, cb.box_mesh(mesh_name or name, sx, sy, sz, self.m[mat]), loc, role, **props)

    # ---------------------------------------------------------------- build
    def build(self, spec_hash: str) -> dict:
        s = self.s
        scene = bpy.context.scene
        scene["cn_stage"] = s["stage"]
        scene["cn_spec_hash"] = spec_hash
        scene["cn_spec_version"] = s["spec_version"]
        self.geometry()
        self.architecture()
        self.zones()
        self.blockers()
        self.watcher()
        self.lighting()
        self.collision()
        self.spawns()
        self.markers()
        self.reference()
        self.cameras()
        self.world()
        return {"spawns": len(spawn_points(s)), "objects": len(bpy.data.objects)}

    def geometry(self):
        s = self.s
        self.W = s["width"]
        self.half = self.W / 2
        self.y0 = -s["start_zone_depth"]
        self.L = s["course_length"]
        self.y_fin = self.L + s["finish_trigger_depth"]
        self.y_back = self.y_fin + s["safe_zone_depth"]
        sh = s["shepherd"]
        self.sh = sh
        self.H = sh["height"]
        self.head_r = self.H * 0.14
        self.body_h = self.H - 2 * self.head_r
        self.top = sh["platform_height"]
        self.head_z = self.top + self.body_h + self.head_r

    # 01_ARCHITECTURE: ground, boundaries, gates, platforms, observation structures
    def architecture(self):
        s, v, E = self.s, self.s["greybox_visual"], self.s["environment"]
        W, half, y0, L, y_back = self.W, self.half, self.y0, self.L, self.y_back
        gx = half + v["ground_margin_x"]
        g_y0, g_y1 = y0 - 10.0, y_back + v["ground_extra_back"]
        self.box("arch", "STG01_Ground_Outer", 2 * gx, g_y1 - g_y0, 0.1, (0, (g_y0 + g_y1) / 2, -0.13), "ground", "ground")
        self.box("arch", "STG01_Ground_Yard", W, y_back - y0, 0.02, (0, (y0 + y_back) / 2, -0.02), "yard", "ground")
        ft = s["wall_thickness"]
        for name, sx, sy, x, y in (
            ("PRP_STG01_Fence_W", ft, y_back - y0, -half - ft / 2, (y0 + y_back) / 2),
            ("PRP_STG01_Fence_E", ft, y_back - y0, half + ft / 2, (y0 + y_back) / 2),
            ("PRP_STG01_Fence_S", W + 2 * ft, ft, 0, y0 - ft / 2),
            ("PRP_STG01_Fence_N", W + 2 * ft, ft, 0, y_back + ft / 2),
        ):
            self.box("arch", name, sx, sy, v["fence_height"], (x, y, 0), "metal", "boundary")
        gp, gh, gpx = v["gate_post_size"], v["gate_height"], v["gate_post_x"]
        post = cb.box_mesh("PRP_STG01_FinishGate_Post", gp, gp, gh, self.m["prop"])
        self.put("arch", "PRP_STG01_FinishGate_Post_W", post, (-gpx, L, 0), "finish_gate")
        self.put("arch", "PRP_STG01_FinishGate_Post_E", post, (gpx, L, 0), "finish_gate")
        self.box("arch", "PRP_STG01_FinishGate_Beam", 2 * gpx + gp, gp, gp, (0, L, gh - gp), "prop", "finish_gate")
        self.box("arch", "PRP_STG01_FinishGate_LightStrip", 2 * gpx, 0.3, 0.3, (0, L - gp / 2 + 0.1, gh - gp - 0.3), "lamp", "finish_gate")
        sh = self.sh
        self.box("arch", "PRP_STG01_ShepherdPlatform", sh["platform_size"], sh["platform_size"], sh["platform_height"],
                 (sh["x"], sh["y"], 0), "metal", "watcher_platform")
        # Start barrier: shown raised for the walk test (lowered_z before GO).
        sg = E["start_gate"]
        spost = cb.box_mesh("PRP_STG01_StartBarrier_Post", 0.5, 0.5, sg["arm_lifted_height"] + 0.2, self.m["metal"])
        self.put("arch", "PRP_STG01_StartBarrier_Post_W", spost, (-sg["post_x"], sg["y"], 0), "start_gate")
        self.put("arch", "PRP_STG01_StartBarrier_Post_E", spost, (sg["post_x"], sg["y"], 0), "start_gate")
        self.box("arch", "PRP_STG01_StartBarrier_Arm", 2 * sg["post_x"], 0.12, 0.12, (0, sg["y"] + 0.1, sg["arm_lifted_height"]),
                 "metal", "start_gate", lowered_z=sg["arm_height"])
        # Observation structures (east margin).
        g = E["observation"]["gantry_east"]
        length, yc = g["y1"] - g["y0"], (g["y0"] + g["y1"]) / 2
        self.box("arch", "PRP_STG01_SpectatorGantry_Deck", g["width"], length, 0.4, (g["x"], yc, g["deck_z"] - 0.4), "deck", "observation")
        self.box("arch", "PRP_STG01_SpectatorGantry_Roof", g["width"] + 1, length, 0.3, (g["x"], yc, g["roof_z"]), "metal", "observation")
        self.box("arch", "PRP_STG01_SpectatorGantry_Rail", 0.1, length, 1.1, (g["x"] - g["width"] / 2 + 0.05, yc, g["deck_z"]), "metal", "observation")
        leg = cb.box_mesh("PRP_STG01_SpectatorGantry_Leg", 0.4, 0.4, g["roof_z"], self.m["metal"])
        y, i = g["y0"], 0
        while y <= g["y1"] + 1e-6:
            for dx in (-g["width"] / 2 + 0.3, g["width"] / 2 - 0.3):
                i += 1
                self.put("arch", f"PRP_STG01_SpectatorGantry_Leg_{i:02d}", leg, (g["x"] + dx, y, 0), "observation")
            y += 10.0
        b = E["observation"]["judges_booth"]
        self.box("arch", "PRP_STG01_JudgesBooth_Cabin", b["w"], b["d"], b["roof_z"] - b["deck_z"], (b["x"], b["y"], b["deck_z"]), "deck", "observation")
        bleg = cb.box_mesh("PRP_STG01_JudgesBooth_Leg", 0.5, 0.5, b["deck_z"], self.m["metal"])
        for j, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1)), 1):
            self.put("arch", f"PRP_STG01_JudgesBooth_Leg_{j}", bleg, (b["x"] + dx * (b["w"] / 2 - 0.5), b["y"] + dy * (b["d"] / 2 - 0.5), 0), "observation")
        self.box("arch", "PRP_STG01_JudgesBooth_TimerBoard", 0.3, 6.0, 2.5, (b["x"] - b["w"] / 2 - 0.1, b["y"], b["roof_z"] - 3.0), "lamp", "observation")
        be = E["observation"]["benches_east"]
        bench = cb.box_mesh("PRP_KIT_Bench_4m", 0.6, 4.0, 0.45, self.m["deck"])
        y, i = be["y0"], 0
        while y <= be["y1"] + 1e-6:
            i += 1
            self.put("arch", f"PRP_KIT_Bench_{i:02d}", bench, (be["x"], y, 0), "bench")
            y += be["spacing"]
        gate = cb.box_mesh("PRP_KIT_ServiceGate_4m", 0.3, 4.0, 3.5, self.m["prop"])
        for j, sgt in enumerate(E["perimeter"]["service_gates"], 1):
            self.put("arch", f"PRP_KIT_ServiceGate_{j:02d}", gate, (half + 0.6, sgt["y"], 0), "service_gate")

    # 02_GAMEPLAY_ZONES: ground markings (runtime) + zone overlays and coverage (review only)
    def zones(self):
        s, v = self.s, self.s["greybox_visual"]
        W, half, y0, L, y_fin, y_back = self.W, self.half, self.y0, self.L, self.y_fin, self.y_back
        lw, bd = v["line_width"], v["band_depth"]
        self.box("zones", "STG01_StartBand", W, bd, 0.01, (0, -bd / 2, 0), "line", "start_line")
        self.box("zones", "STG01_FinishBand", W, bd, 0.01, (0, L + bd / 2, 0), "line", "finish_line")
        lane = cb.box_mesh("STG01_LaneLine", lw, L, 0.01, self.m["line"])
        for i in range(1, int(W // s["lane_spacing"])):
            self.put("zones", f"STG01_LaneLine_{i:02d}", lane, (-half + i * s["lane_spacing"], L / 2, 0), "lane_marking")
        z = 0.02  # overlays float 2 cm above the markings for review renders
        for name, y_a, y_b, mat, role in (
            ("ZONE_STG01_Start", y0, 0.0, "zone_start", "zone_start"),
            ("ZONE_STG01_Course", 0.0, L, "zone_course", "zone_course"),
            ("ZONE_STG01_Finish", L, y_fin, "zone_finish", "zone_finish"),
            ("ZONE_STG01_Safe", y_fin, y_back, "zone_safe", "zone_safe"),
        ):
            self.box("zones", name, W, y_b - y_a, 0.01, (0, (y_a + y_b) / 2, z), mat, role, review_only=True,
                     y_min=y_a, y_max=y_b, x_min=-half, x_max=half)
        sh = self.sh
        reach = (sh["y"] - y0) / math.cos(math.radians(55)) + 5
        cover = fan_mesh("ZONE_STG01_ShepherdCoverage", (sh["x"], sh["y"]), reach, 55, 0, 24, 0.03, self.m["zone_cover"])
        self.put("zones", "ZONE_STG01_ShepherdCoverage", cover, (0, 0, 0), "watcher_coverage", review_only=True,
                 half_angle_deg=55.0, note="presentation coverage; server detection is not line-of-sight (E9)")

    # 03_ENVIRONMENT_BLOCKERS: everything that closes the world. None stands in the course (GDD: cover-free lanes).
    def blockers(self):
        E, v = self.s["environment"], self.s["greybox_visual"]
        ob = E["perimeter"]["outer_barrier"]
        bx, y0, y1, bh = ob["x"], ob["y0"], ob["y1"], ob["height"]
        for name, sx, sy, x, y in (
            ("PRP_KIT_ConcreteBarrier_W", 0.8, y1 - y0, -bx, (y0 + y1) / 2), ("PRP_KIT_ConcreteBarrier_E", 0.8, y1 - y0, bx, (y0 + y1) / 2),
            ("PRP_KIT_ConcreteBarrier_S", 2 * bx, 0.8, 0, y0), ("PRP_KIT_ConcreteBarrier_N", 2 * bx, 0.8, 0, y1),
        ):
            self.box("blockers", name, sx, sy, bh, (x, y, 0), "concrete", "outer_barrier")
        for r in E["playground_relics"]:
            mesh = (cb.cone_mesh(r["id"], r["w"] / 2, r["h"], 8, self.m["relic"]) if "RocketFrame" in r["id"]
                    else cb.box_mesh(r["id"], r["w"], r["d"], r["h"], self.m["relic"]))
            self.put("blockers", r["id"], mesh, (r["x"], r["y"], 0), "playground_relic")
        bd = E["backdrop"]
        ov = bd["overpass"]
        ylen, yc = ov["y1"] - ov["y0"], (ov["y0"] + ov["y1"]) / 2
        self.box("blockers", "STG01_BG_Overpass_Deck", ov["width"], ylen, 1.5, (ov["x"], yc, ov["deck_z"]), "concrete", "backdrop")
        self.box("blockers", "STG01_BG_Overpass_Rail", 0.3, ylen, 1.2, (ov["x"] + ov["width"] / 2 - 0.15, yc, ov["deck_z"] + 1.5), "metal", "backdrop")
        pier = cb.box_mesh("STG01_BG_OverpassPier", 2.0, 2.0, ov["deck_z"], self.m["concrete"])
        y, i = ov["y0"], 0
        while y <= ov["y1"] + 1e-6:
            i += 1
            self.put("blockers", f"STG01_BG_OverpassPier_{i:02d}", pier, (ov["x"], y, 0), "backdrop")
            y += ov["pier_spacing"]
        wt = bd["water_tower"]
        self.put("blockers", "STG01_BG_WaterTower_Stem", cb.cylinder_mesh("STG01_BG_WaterTower_Stem", 1.2, wt["tank_z"], 10, self.m["metal"]), (wt["x"], wt["y"], 0), "backdrop")
        self.put("blockers", "STG01_BG_WaterTower_Tank", cb.cylinder_mesh("STG01_BG_WaterTower_Tank", wt["tank_r"], 9.0, 20, self.m["concrete"]), (wt["x"], wt["y"], wt["tank_z"]), "backdrop")
        tree = cb.cone_mesh("STG01_BG_Tree", 3.0, 12.0, 8, self.m["tree"])
        i = 0
        tn, tw = bd["tree_line_north"], bd["tree_line_west"]
        for x in range(int(tn["x0"]), int(tn["x1"]) + 1, 7):
            i += 1
            self.put("blockers", f"STG01_BG_Tree_{i:02d}", tree, (float(x), tn["y"], 0), "backdrop")
        for y in range(int(tw["y0"]), int(tw["y1"]) + 1, 8):
            i += 1
            self.put("blockers", f"STG01_BG_Tree_{i:02d}", tree, (tw["x"], float(y), 0), "backdrop")
        for i, sl in enumerate(v["silhouettes"], 1):
            self.box("blockers", f"STG01_BG_Silhouette_{i:02d}", sl["w"], sl["d"], sl["h"], (sl["x"], sl["y"], 0), "bg", "backdrop")

    # 04_WATCHER_PLACEHOLDER: The Shepherd proxy (faces -Y), facing arrow and envelope
    def watcher(self):
        sh, H, top, body_h, head_r, head_z = self.sh, self.H, self.top, self.body_h, self.head_r, self.head_z
        x, y = sh["x"], sh["y"]
        p = {"placeholder": True}
        self.put("watcher", "ENM_Shepherd_Placeholder_Body", cb.cylinder_mesh("ENM_Shepherd_Placeholder_Body", H * 0.13, body_h, 16, self.m["shep"]), (x, y, top), "watcher", **p)
        self.put("watcher", "ENM_Shepherd_Placeholder_Head", cb.sphere_mesh("ENM_Shepherd_Placeholder_Head", head_r, 16, 10, self.m["shep"]), (x, y, head_z), "watcher", **p)
        self.box("watcher", "ENM_Shepherd_Placeholder_Face", head_r, head_r * 0.6, head_r * 0.5, (x, y - head_r * 0.75, head_z - head_r * 0.25), "line", "watcher", **p)
        self.box("watcher", "ENM_Shepherd_Placeholder_Lantern", 1.2, 1.2, 1.6, (x + H * 0.22, y - 1.5, top + body_h * 0.55), "lamp", "watcher", mounted=True, **p)
        self.put("watcher", "ENM_Shepherd_Placeholder_Crook", cb.cylinder_mesh("ENM_Shepherd_Placeholder_Crook", 0.25, H * 0.9, 8, self.m["prop"]), (x - H * 0.22, y - 1.0, top), "watcher", **p)
        # Review aids: facing arrow on the platform and the approximate envelope (8 × 8 × 28 m).
        self.box("watcher", "ENM_Shepherd_Facing_Arrow", 1.0, 6.0, 0.2, (x, y - 3.0, top), "ref", "watcher_facing", review_only=True, facing="-Y")
        env = self.box("watcher", "ENM_Shepherd_Envelope", 8.0, 8.0, H, (x, y, top), "col", "watcher_envelope", review_only=True)
        env.display_type = "WIRE"
        env.hide_render = True

    # 05_LIGHTING_PLACEHOLDERS: floodlight towers (E6) and modest lights
    def lighting(self):
        fl = self.s["floodlights"]
        mast = cb.cylinder_mesh("PRP_KIT_FloodlightTower_Mast", 0.5, fl["height"], 12, self.m["metal"])
        head = cb.box_mesh("PRP_KIT_FloodlightTower_Head", fl["head_w"], 0.8, 1.6, self.m["lamp"])
        sig = cb.box_mesh("PRP_KIT_SignalLamp", 0.8, 0.8, 0.8, self.m["signal"])
        horn = cb.cylinder_mesh("PRP_KIT_Loudspeaker", 0.5, 1.0, 10, self.m["metal"])
        n = 0
        for y in fl["ys"]:
            for side in (-1, 1):
                n += 1
                x = side * fl["x"]
                self.put("lights", f"PRP_KIT_FloodlightTower_{n:02d}", mast, (x, y, 0), "light_tower")
                self.put("lights", f"PRP_KIT_FloodlightTower_Head_{n:02d}", head, (x - side * 0.8, y, fl["height"]), "light_tower")
                self.put("lights", f"PRP_KIT_SignalLamp_{n:02d}", sig, (x, y, fl["height"] - 1.2), "signal_lamp")
                if y in (40.0, 140.0):
                    self.put("lights", f"PRP_KIT_Loudspeaker_{n:02d}", horn, (x - side * 0.8, y, fl["height"] - 3.0), "loudspeaker")
                light = bpy.data.lights.new(f"LGT_STG01_Flood_{n:02d}", "SPOT")
                light.energy = 90000.0
                light.spot_size = math.radians(75)
                light.color = (1.0, 0.84, 0.62)
                lo = cb.place(f"LGT_STG01_Flood_{n:02d}", light, self.c["lights"], (x - side * 1.0, y, fl["height"]), {"bake": "dynamic", "role": "light"})
                lo.rotation_euler = (0.0, math.radians(side * 55), 0.0)  # aimed in and down at 55°
        moon = bpy.data.lights.new("LGT_STG01_Moon", "SUN")
        moon.energy = 0.6
        moon.color = (0.45, 0.75, 0.8)
        mo = cb.place("LGT_STG01_Moon", moon, self.c["lights"], (0, 0, 50), {"bake": "baked", "role": "light"})
        mo.rotation_euler = (math.radians(50), 0.0, math.radians(200))

    # 06_COLLISION: simplified boxes; server colliders + camera-only colliders (E10)
    def collision(self):
        s = self.s
        W, half, y0, L, y_fin, y_back = self.W, self.half, self.y0, self.L, self.y_fin, self.y_back
        wh, wt = s["wall_height"], s["wall_thickness"]
        items = [
            ("COL_STG01_Ground", W, y_back - y0, 0.5, 0, (y0 + y_back) / 2, -0.5, "solid", None),
            ("COL_STG01_Wall_W", wt, y_back - y0, wh, -half - wt / 2, (y0 + y_back) / 2, 0, "solid", None),
            ("COL_STG01_Wall_E", wt, y_back - y0, wh, half + wt / 2, (y0 + y_back) / 2, 0, "solid", None),
            ("COL_STG01_Wall_S", W + 2 * wt, wt, wh, 0, y0 - wt / 2, 0, "solid", None),
            ("COL_STG01_Wall_N", W + 2 * wt, wt, wh, 0, y_back + wt / 2, 0, "solid", None),
            ("COL_STG01_FinishTrigger", W, s["finish_trigger_depth"], s["finish_trigger_height"], 0, L + s["finish_trigger_depth"] / 2, 0, "trigger", "finish"),
            ("COL_STG01_SafeZone", W, s["safe_zone_depth"], s["finish_trigger_height"], 0, y_fin + s["safe_zone_depth"] / 2, 0, "trigger", "safe"),
            ("COL_CAM_STG01_Fence_W", wt, y_back - y0, 4.0, -half - wt / 2, (y0 + y_back) / 2, 0, "camera", None),
            ("COL_CAM_STG01_Fence_E", wt, y_back - y0, 4.0, half + wt / 2, (y0 + y_back) / 2, 0, "camera", None),
            ("COL_CAM_STG01_Fence_S", W + 2 * wt, wt, 4.0, 0, y0 - wt / 2, 0, "camera", None),
        ]
        for name, sx, sy, sz, x, y, z, kind, role in items:
            p = {"col_shape": "box", "col_type": kind, "role": f"collision_{kind}"}
            if role:
                p["trigger_role"] = role
            o = cb.place(name, cb.box_mesh(name, sx, sy, sz, self.m["col"]), self.c["col"], (x, y, z), p)
            o.display_type = "WIRE"
            o.hide_render = True

    # 07_PLAYER_SPAWNS: 30 numbered markers + capsule proxies at the gameplay radius
    def spawns(self):
        cap = self.s["capsule"]
        r, h = cap["radius"], cap["height"]
        capsule = cb.cylinder_mesh("GMK_SPAWN_Capsule", r, h, 12, self.m["spawn"])
        for i, (x, y) in enumerate(spawn_points(self.s), 1):
            cb.empty(f"GMK_SPAWN_{i:02d}", self.c["spawns"], (x, y, 0), "SINGLE_ARROW", 0.6, yaw_deg=180.0,
                     props={"kind": "spawn", "index": i, "role": "spawn"})
            self.put("spawns", f"GMK_SPAWN_{i:02d}_Capsule", capsule, (x, y, 0), "spawn_proxy", review_only=True,
                     spawn=i, radius=r, height=h)

    # Other gameplay markers live with the zones.
    def markers(self):
        s, E = self.s, self.s["environment"]
        z = self.c["zones"]
        sh = self.sh
        cb.empty("GMK_START", z, (0, 0, 0), "PLAIN_AXES", 1.0, props={"kind": "start_line", "width": self.W, "role": "marker"})
        cb.empty("GMK_FINISH", z, (0, self.L, 0), "PLAIN_AXES", 1.0, props={"kind": "finish_line", "width": self.W, "role": "marker"})
        cb.empty("GMK_SHEPHERD", z, (sh["x"], sh["y"], self.top), "SINGLE_ARROW", 2.0,
                 props={"kind": "shepherd", "height": self.H, "head_z": round(self.head_z, 3), "role": "marker"})
        cb.empty("GMK_BOUNDS", z, (0, (self.y0 + self.y_back) / 2, 0), "CUBE", 1.0,
                 props={"kind": "bounds", "min_x": -self.half, "max_x": self.half, "min_y": self.y0, "max_y": self.y_back, "role": "marker"})
        be = E["observation"]["benches_east"]
        yb, nb = be["y0"], 0
        while yb <= be["y1"] + 1e-6:
            nb += 1
            cb.empty(f"GMK_BENCH_{nb:02d}", z, (be["x"], yb, 0.45), "PLAIN_AXES", 0.5, props={"kind": "bench", "index": nb, "role": "marker"})
            yb += be["spacing"]
        cb.empty("GMK_SPECTATOR_01", z, (0, sh["y"] + 15, self.top + self.H + 10), "PLAIN_AXES", 1.0,
                 props={"kind": "spectator_camera", "look_at": [0.0, self.L / 2, 0.0], "role": "marker"})

    # 00_REFERENCE: scale figure and north arrow (review only)
    def reference(self):
        cap = self.s["capsule"]
        self.put("ref", "REF_STG01_ScaleFigure_1_2m", cb.cylinder_mesh("REF_STG01_ScaleFigure_1_2m", cap["radius"], cap["height"], 12, self.m["ref"]),
                 (-24.0, -10.0, 0), "reference", review_only=True)
        self.put("ref", "REF_STG01_NorthArrow", cb.cone_mesh("REF_STG01_NorthArrow", 2.0, 0.3, 3, self.m["ref"]),
                 (40.0, -30.0, 0), "reference", review_only=True, note="north = +Y, toward The Shepherd")

    def cameras(self):
        for name, c in self.s["environment"]["cameras"].items():
            cam = bpy.data.cameras.new(name)
            cam.clip_end = 2000.0
            if "ortho_scale" in c:
                cam.type = "ORTHO"
                cam.ortho_scale = c["ortho_scale"]
            else:
                cam.lens = 30.0 if "Overview" in name else 24.0
            props = {"role": "camera"}
            for k in ("res", "review_name"):
                if k in c:
                    props[k] = c[k]
            o = cb.place(name, cam, self.c["cams"], tuple(c["pos"]), props)
            d = Vector(c["look"]) - Vector(c["pos"])
            o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.camera = bpy.data.objects["CAM_STG01_Gameplay"]

    def world(self):
        world = bpy.data.worlds.new("STG01_NightSky")
        if world.node_tree is None:
            world.use_nodes = True
        world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.025, 0.065, 1.0)  # violet night (E8)
        world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
        bpy.context.scene.world = world


def main() -> None:
    spec_default = cb.REPO_ROOT / "blender/scripts/specs/stg01_greybox.json"
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--spec", default=str(spec_default))
    ap.add_argument("--out", default=None, help="default: blender/scenes/<blend_name>.blend from the spec")
    args = cb.parse_args(ap)
    for w in cb.check_version():
        print("WARNING:", w)
    spec, spec_hash = cb.load_spec(args.spec)
    cb.new_empty_scene()
    info = Builder(spec).build(spec_hash)
    out = Path(args.out or cb.REPO_ROOT / "blender/scenes" / f"{spec['blend_name']}.blend")
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
    print(f"Built {out} (spec {spec_hash}): {info}")


if __name__ == "__main__":
    main()
