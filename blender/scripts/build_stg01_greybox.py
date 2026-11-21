"""Build the Stage 01 (Red Light, Green Light) greybox from its spec.

Primitives only (GDD §10.1: placeholders are labelled as placeholders). Rebuilds the scene
from scratch each run, so it is safe to run twice.

    python blender/scripts/build_stg01_greybox.py \
        --spec blender/scripts/specs/stg01_greybox.json \
        --out blender/scenes/STG01_RedLightGreenLight.blend
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402

import cn_blender as cb  # noqa: E402


def spawn_points(spec: dict) -> list[tuple[float, float]]:
    """30 points, numbered from the centre of the front row outward (spec L7)."""
    sp = spec["spawns"]
    cols = sp["columns"]
    xs = [(i - (cols - 1) / 2.0) * sp["spacing_x"] for i in range(cols)]
    order = sorted(xs, key=lambda x: (abs(x), x))  # centre first, left before right
    return [(x, y) for y in sp["row_y"] for x in order]


def build_environment(spec, env, props, m_metal, m_deck, m_relic, m_tree, m_concrete, m_prop, m_lamp) -> None:
    """Blockout of every environment element in the approved design spec (primitives only)."""
    E = spec["environment"]
    W = spec["width"]
    half = W / 2.0

    # Spectator gantry (east): deck, legs every 10 m, roof, rail.
    g = E["observation"]["gantry_east"]
    length = g["y1"] - g["y0"]
    yc = (g["y0"] + g["y1"]) / 2
    cb.place("PRP_STG01_SpectatorGantry_Deck", cb.box_mesh("PRP_STG01_SpectatorGantry_Deck", g["width"], length, 0.4, m_deck), props, (g["x"], yc, g["deck_z"] - 0.4))
    cb.place("PRP_STG01_SpectatorGantry_Roof", cb.box_mesh("PRP_STG01_SpectatorGantry_Roof", g["width"] + 1, length, 0.3, m_metal), props, (g["x"], yc, g["roof_z"]))
    cb.place("PRP_STG01_SpectatorGantry_Rail", cb.box_mesh("PRP_STG01_SpectatorGantry_Rail", 0.1, length, 1.1, m_metal), props, (g["x"] - g["width"] / 2, yc, g["deck_z"]))
    leg = cb.box_mesh("PRP_STG01_SpectatorGantry_Leg", 0.4, 0.4, g["roof_z"], m_metal)
    y, i = g["y0"], 0
    while y <= g["y1"] + 1e-6:
        for dx in (-g["width"] / 2 + 0.3, g["width"] / 2 - 0.3):
            i += 1
            cb.place(f"PRP_STG01_SpectatorGantry_Leg_{i:02d}", leg, props, (g["x"] + dx, y, 0.0))
        y += 10.0

    # Judges' booth with a timer board facing the yard.
    b = E["observation"]["judges_booth"]
    cb.place("PRP_STG01_JudgesBooth_Cabin", cb.box_mesh("PRP_STG01_JudgesBooth_Cabin", b["w"], b["d"], b["roof_z"] - b["deck_z"], m_deck), props, (b["x"], b["y"], b["deck_z"]))
    bleg = cb.box_mesh("PRP_STG01_JudgesBooth_Leg", 0.5, 0.5, b["deck_z"], m_metal)
    for j, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1)), 1):
        cb.place(f"PRP_STG01_JudgesBooth_Leg_{j}", bleg, props, (b["x"] + dx * (b["w"] / 2 - 0.5), b["y"] + dy * (b["d"] / 2 - 0.5), 0.0))
    cb.place("PRP_STG01_JudgesBooth_TimerBoard", cb.box_mesh("PRP_STG01_JudgesBooth_TimerBoard", 0.3, 6.0, 2.5, m_lamp), props, (b["x"] - b["w"] / 2 - 0.2, b["y"], b["roof_z"] - 3.0))

    # Benches for spotted players (outside the east fence).
    be = E["observation"]["benches_east"]
    bench = cb.box_mesh("PRP_KIT_Bench_4m", 0.6, 4.0, 0.45, m_deck)
    y, i = be["y0"], 0
    while y <= be["y1"] + 1e-6:
        i += 1
        cb.place(f"PRP_KIT_Bench_{i:02d}", bench, props, (be["x"], y, 0.0))
        y += be["spacing"]

    # Service gates in the east fence (closed; the wall collider stays continuous).
    gate = cb.box_mesh("PRP_KIT_ServiceGate_4m", 0.3, 4.0, 3.5, m_prop)
    for j, sg in enumerate(E["perimeter"]["service_gates"], 1):
        cb.place(f"PRP_KIT_ServiceGate_{j:02d}", gate, props, (half + 0.6, sg["y"], 0.0))

    # Start barrier arm at the start line (decorative). Lowered to arm_height before GO, raised after.
    # The walk-test greybox shows it raised (players walk under it) until S1-4 animates it.
    sgt = E["start_gate"]
    spost = cb.box_mesh("PRP_STG01_StartBarrier_Post", 0.5, 0.5, sgt["arm_lifted_height"] + 0.2, m_metal)
    cb.place("PRP_STG01_StartBarrier_Post_W", spost, props, (-sgt["post_x"], sgt["y"], 0.0))
    cb.place("PRP_STG01_StartBarrier_Post_E", spost, props, (sgt["post_x"], sgt["y"], 0.0))
    cb.place("PRP_STG01_StartBarrier_Arm", cb.box_mesh("PRP_STG01_StartBarrier_Arm", 2 * sgt["post_x"], 0.12, 0.12, m_metal), props,
             (0.0, sgt["y"] + 0.3, sgt["arm_lifted_height"]), {"lowered_z": sgt["arm_height"]})

    # Outer barrier (low concrete line closing the world).
    ob = E["perimeter"]["outer_barrier"]
    bx, y0, y1, bh = ob["x"], ob["y0"], ob["y1"], ob["height"]
    for name, sx, sy, x, y in (
        ("PRP_KIT_ConcreteBarrier_W", 0.8, y1 - y0, -bx, (y0 + y1) / 2), ("PRP_KIT_ConcreteBarrier_E", 0.8, y1 - y0, bx, (y0 + y1) / 2),
        ("PRP_KIT_ConcreteBarrier_S", 2 * bx, 0.8, 0.0, y0), ("PRP_KIT_ConcreteBarrier_N", 2 * bx, 0.8, 0.0, y1),
    ):
        cb.place(name, cb.box_mesh(name, sx, sy, bh, m_concrete), props, (x, y, 0.0))

    # Playground relics (west margin).
    for r in E["playground_relics"]:
        if "RocketFrame" in r["id"]:
            mesh = cb.cone_mesh(r["id"], r["w"] / 2, r["h"], 8, m_relic)
        else:
            mesh = cb.box_mesh(r["id"], r["w"], r["d"], r["h"], m_relic)
        cb.place(r["id"], mesh, props, (r["x"], r["y"], 0.0))

    # Backdrop: elevated roadway, water tower, tree lines.
    bd = E["backdrop"]
    ov = bd["overpass"]
    cb.place("STG01_BG_Overpass_Deck", cb.box_mesh("STG01_BG_Overpass_Deck", ov["width"], ov["y1"] - ov["y0"], 1.5, m_concrete), env, (ov["x"], (ov["y0"] + ov["y1"]) / 2, ov["deck_z"]))
    cb.place("STG01_BG_Overpass_Rail", cb.box_mesh("STG01_BG_Overpass_Rail", 0.3, ov["y1"] - ov["y0"], 1.2, m_metal), env, (ov["x"] + ov["width"] / 2, (ov["y0"] + ov["y1"]) / 2, ov["deck_z"] + 1.5))
    pier = cb.box_mesh("STG01_BG_OverpassPier", 2.0, 2.0, ov["deck_z"], m_concrete)
    y, i = ov["y0"], 0
    while y <= ov["y1"] + 1e-6:
        i += 1
        cb.place(f"STG01_BG_OverpassPier_{i:02d}", pier, env, (ov["x"], y, 0.0))
        y += ov["pier_spacing"]
    wt = bd["water_tower"]
    cb.place("STG01_BG_WaterTower_Stem", cb.cylinder_mesh("STG01_BG_WaterTower_Stem", 1.2, wt["tank_z"], 10, m_metal), env, (wt["x"], wt["y"], 0.0))
    cb.place("STG01_BG_WaterTower_Tank", cb.cylinder_mesh("STG01_BG_WaterTower_Tank", wt["tank_r"], 9.0, 20, m_concrete), env, (wt["x"], wt["y"], wt["tank_z"]))
    tree = cb.cone_mesh("STG01_BG_Tree", 3.0, 12.0, 8, m_tree)
    i = 0
    tn, tw = bd["tree_line_north"], bd["tree_line_west"]
    for x in range(int(tn["x0"]), int(tn["x1"]) + 1, 7):
        i += 1
        cb.place(f"STG01_BG_Tree_{i:02d}", tree, env, (float(x), tn["y"], 0.0))
    for y in range(int(tw["y0"]), int(tw["y1"]) + 1, 8):
        i += 1
        cb.place(f"STG01_BG_Tree_{i:02d}", tree, env, (tw["x"], float(y), 0.0))


def build(spec: dict, spec_hash: str) -> dict:
    scene = cb.new_empty_scene()
    scene["cn_stage"] = spec["stage"]
    scene["cn_spec_hash"] = spec_hash
    scene["cn_spec_version"] = spec["spec_version"]

    W = spec["width"]
    half = W / 2.0
    y0 = -spec["start_zone_depth"]
    L = spec["course_length"]
    y_finish_end = L + spec["finish_trigger_depth"]
    y_back = y_finish_end + spec["safe_zone_depth"]
    vis = spec["greybox_visual"]
    sh = spec["shepherd"]

    cols = {n: cb.collection(n) for n in
            ("STG01_ENV", "STG01_PROPS", "STG01_LIGHTS", "STG01_COL", "STG01_GMK", "STG01_CAM", "_WORK")}

    m_ground = cb.material("MAT_Greybox_Ground", (0.16, 0.15, 0.14))
    m_yard = cb.material("MAT_Greybox_Yard", (0.30, 0.27, 0.23))
    m_line = cb.material("MAT_Greybox_Line", (0.85, 0.85, 0.80))
    m_prop = cb.material("MAT_Greybox_Prop", (0.40, 0.40, 0.42))
    m_metal = cb.material("MAT_Greybox_Metal", (0.22, 0.24, 0.27), roughness=0.5)
    m_shep = cb.material("MAT_Greybox_Shepherd", (0.55, 0.30, 0.16))
    m_lamp = cb.material("MAT_Greybox_Lamp", (1.0, 0.78, 0.45), emission=8.0)
    m_bg = cb.material("MAT_Greybox_Silhouette", (0.07, 0.08, 0.10))
    m_col = cb.material("MAT_Greybox_Collision", (0.9, 0.1, 0.1), alpha=0.25)
    m_signal = cb.material("MAT_Greybox_Signal", (0.3, 0.9, 0.6), emission=6.0)
    m_deck = cb.material("MAT_Greybox_Deck", (0.55, 0.50, 0.30))
    m_relic = cb.material("MAT_Greybox_Relic", (0.50, 0.35, 0.60))
    m_tree = cb.material("MAT_Greybox_Tree", (0.06, 0.10, 0.09))
    m_concrete = cb.material("MAT_Greybox_Concrete", (0.35, 0.35, 0.37))

    env, props, col, gmk = cols["STG01_ENV"], cols["STG01_PROPS"], cols["STG01_COL"], cols["STG01_GMK"]

    # ---- environment (visual only)
    gx = half + vis["ground_margin_x"]
    g_y0, g_y1 = y0 - 10.0, y_back + vis["ground_extra_back"]
    cb.place("STG01_Ground_Outer", cb.box_mesh("STG01_Ground_Outer", 2 * gx, g_y1 - g_y0, 0.1, m_ground),
             env, (0.0, (g_y0 + g_y1) / 2.0, -0.13))  # top 3 cm below the yard
    cb.place("STG01_Ground_Yard", cb.box_mesh("STG01_Ground_Yard", W, y_back - y0, 0.02, m_yard),
             env, (0.0, (y0 + y_back) / 2.0, -0.02))
    lw, bd = vis["line_width"], vis["band_depth"]
    cb.place("STG01_StartBand", cb.box_mesh("STG01_StartBand", W, bd, 0.01, m_line), env, (0.0, -bd / 2.0, 0.0))
    cb.place("STG01_FinishBand", cb.box_mesh("STG01_FinishBand", W, bd, 0.01, m_line), env, (0.0, L + bd / 2.0, 0.0))
    lane_mesh = cb.box_mesh("STG01_LaneLine", lw, L, 0.01, m_line)  # shared mesh = instanced in glTF
    n_lanes = int(W // spec["lane_spacing"])
    for i in range(1, n_lanes):
        x = -half + i * spec["lane_spacing"]
        cb.place(f"STG01_LaneLine_{i:02d}", lane_mesh, env, (x, L / 2.0, 0.0))
    for i, s in enumerate(vis["silhouettes"], 1):
        cb.place(f"STG01_BG_Silhouette_{i:02d}", cb.box_mesh(f"STG01_BG_Silhouette_{i:02d}", s["w"], s["d"], s["h"], m_bg),
                     env, (s["x"], s["y"], 0.0))

    # ---- props (visual only, no collision inside the playable area)
    fh, ft = vis["fence_height"], spec["wall_thickness"]
    for name, sx, sy, x, y in (
        ("PRP_STG01_Fence_W", ft, y_back - y0, -half - ft / 2, (y0 + y_back) / 2),
        ("PRP_STG01_Fence_E", ft, y_back - y0, half + ft / 2, (y0 + y_back) / 2),
        ("PRP_STG01_Fence_S", W + 2 * ft, ft, 0.0, y0 - ft / 2),
        ("PRP_STG01_Fence_N", W + 2 * ft, ft, 0.0, y_back + ft / 2),
    ):
        cb.place(name, cb.box_mesh(name, sx, sy, fh, m_metal), props, (x, y, 0.0))
    gp, gh = vis["gate_post_size"], vis["gate_height"]
    gx_post = vis["gate_post_x"]
    post = cb.box_mesh("PRP_STG01_FinishGate_Post", gp, gp, gh, m_prop)
    cb.place("PRP_STG01_FinishGate_Post_W", post, props, (-gx_post, L, 0.0))
    cb.place("PRP_STG01_FinishGate_Post_E", post, props, (gx_post, L, 0.0))
    cb.place("PRP_STG01_FinishGate_Beam", cb.box_mesh("PRP_STG01_FinishGate_Beam", 2 * gx_post + gp, gp, gp, m_prop),
             props, (0.0, L, gh - gp))
    cb.place("PRP_STG01_FinishGate_LightStrip", cb.box_mesh("PRP_STG01_FinishGate_LightStrip", 2 * gx_post, 0.3, 0.3, m_lamp),
             props, (0.0, L - gp / 2 - 0.2, gh - gp - 0.3))
    ps, ph = sh["platform_size"], sh["platform_height"]
    cb.place("PRP_STG01_ShepherdPlatform", cb.box_mesh("PRP_STG01_ShepherdPlatform", ps, ps, ph, m_metal),
             props, (sh["x"], sh["y"], 0.0))
    # Floodlight towers (decision E6): 22 m, five per side at X ±38, heads aimed in and down at 55°.
    fl = spec["floodlights"]
    mast = cb.cylinder_mesh("PRP_KIT_FloodlightTower_Mast", 0.5, fl["height"], 12, m_metal)
    head = cb.box_mesh("PRP_KIT_FloodlightTower_Head", fl["head_w"], 0.8, 1.6, m_lamp)
    sig = cb.box_mesh("PRP_KIT_SignalLamp", 0.8, 0.8, 0.8, m_signal)
    horn = cb.cylinder_mesh("PRP_KIT_Loudspeaker", 0.5, 1.0, 10, m_metal)
    n = 0
    for y in fl["ys"]:
        for side in (-1, 1):
            n += 1
            x = side * fl["x"]
            cb.place(f"PRP_KIT_FloodlightTower_{n:02d}", mast, props, (x, y, 0.0))
            cb.place(f"PRP_KIT_FloodlightTower_Head_{n:02d}", head, props, (x - side * 0.8, y, fl["height"]))
            cb.place(f"PRP_KIT_SignalLamp_{n:02d}", sig, props, (x, y, fl["height"] - 1.2))
            if y in (40.0, 140.0):
                cb.place(f"PRP_KIT_Loudspeaker_{n:02d}", horn, props, (x - side * 0.8, y, fl["height"] - 3.0))
            light = bpy.data.lights.new(f"LGT_STG01_Flood_{n:02d}", "SPOT")
            light.energy = 90000.0
            light.spot_size = math.radians(75)
            light.color = (1.0, 0.84, 0.62)
            lo = cb.place(f"LGT_STG01_Flood_{n:02d}", light, cols["STG01_LIGHTS"], (x - side * 1.0, y, fl["height"]),
                          {"bake": "dynamic"})
            lo.rotation_euler = (0.0, math.radians(side * 55), 0.0)  # tilt toward the yard
    moon = bpy.data.lights.new("LGT_STG01_Moon", "SUN")
    moon.energy = 0.6
    moon.color = (0.45, 0.75, 0.8)  # cool teal moonlight (decision E8 palette)
    mo = cb.place("LGT_STG01_Moon", moon, cols["STG01_LIGHTS"], (0, 0, 50), {"bake": "baked"})
    mo.rotation_euler = (math.radians(50), 0.0, math.radians(200))

    # ---- The Shepherd placeholder (faces -Y, toward the players)
    top = ph
    H = sh["height"]
    head_r = H * 0.14
    body_h = H - 2 * head_r
    cb.place("ENM_Shepherd_Placeholder_Body", cb.cylinder_mesh("ENM_Shepherd_Placeholder_Body", H * 0.13, body_h, 16, m_shep),
             props, (sh["x"], sh["y"], top), {"placeholder": True})
    head_z = top + body_h + head_r
    cb.place("ENM_Shepherd_Placeholder_Head", cb.sphere_mesh("ENM_Shepherd_Placeholder_Head", head_r, 16, 10, m_shep),
             props, (sh["x"], sh["y"], head_z), {"placeholder": True})
    cb.place("ENM_Shepherd_Placeholder_Face", cb.box_mesh("ENM_Shepherd_Placeholder_Face", head_r, head_r * 0.6, head_r * 0.5, m_line),
             props, (sh["x"], sh["y"] - head_r * 0.9, head_z - head_r * 0.25), {"placeholder": True})
    cb.place("ENM_Shepherd_Placeholder_Lantern", cb.box_mesh("ENM_Shepherd_Placeholder_Lantern", 1.2, 1.2, 1.6, m_lamp),
             props, (sh["x"] + H * 0.22, sh["y"] - 1.5, top + body_h * 0.55), {"placeholder": True})
    cb.place("ENM_Shepherd_Placeholder_Crook", cb.cylinder_mesh("ENM_Shepherd_Placeholder_Crook", 0.25, H * 0.9, 8, m_prop),
             props, (sh["x"] - H * 0.22, sh["y"] - 1.0, top), {"placeholder": True})

    # ---- environment blockout (docs/STAGE_01_DESIGN_SPEC.md §7; nothing with collision inside the yard)
    build_environment(spec, env, props, m_metal, m_deck, m_relic, m_tree, m_concrete, m_prop, m_lamp)

    # ---- collision (server data; never rendered or exported to the runtime GLB)
    wh, wt = spec["wall_height"], spec["wall_thickness"]
    col_items = [
        ("COL_STG01_Ground", W, y_back - y0, 0.5, 0.0, (y0 + y_back) / 2, -0.5, "solid", None),
        ("COL_STG01_Wall_W", wt, y_back - y0, wh, -half - wt / 2, (y0 + y_back) / 2, 0.0, "solid", None),
        ("COL_STG01_Wall_E", wt, y_back - y0, wh, half + wt / 2, (y0 + y_back) / 2, 0.0, "solid", None),
        ("COL_STG01_Wall_S", W + 2 * wt, wt, wh, 0.0, y0 - wt / 2, 0.0, "solid", None),
        ("COL_STG01_Wall_N", W + 2 * wt, wt, wh, 0.0, y_back + wt / 2, 0.0, "solid", None),
        ("COL_STG01_FinishTrigger", W, spec["finish_trigger_depth"], spec["finish_trigger_height"],
         0.0, L + spec["finish_trigger_depth"] / 2, 0.0, "trigger", "finish"),
        ("COL_STG01_SafeZone", W, spec["safe_zone_depth"], spec["finish_trigger_height"],
         0.0, y_finish_end + spec["safe_zone_depth"] / 2, 0.0, "trigger", "safe"),
    ]
    # Camera-only collision (decision E10): keeps the third-person camera out of the fence and towers.
    # Exported separately; the server never sees these.
    cam_h = 4.0
    col_items += [
        ("COL_CAM_STG01_Fence_W", wt, y_back - y0, cam_h, -half - wt / 2, (y0 + y_back) / 2, 0.0, "camera", None),
        ("COL_CAM_STG01_Fence_E", wt, y_back - y0, cam_h, half + wt / 2, (y0 + y_back) / 2, 0.0, "camera", None),
        ("COL_CAM_STG01_Fence_S", W + 2 * wt, wt, cam_h, 0.0, y0 - wt / 2, 0.0, "camera", None),
    ]
    for name, sx, sy, sz, x, y, z, kind, role in col_items:
        p = {"col_shape": "box", "col_type": kind}
        if role:
            p["trigger_role"] = role
        o = cb.place(name, cb.box_mesh(name, sx, sy, sz, m_col), col, (x, y, z), p)
        o.display_type = "WIRE"
        o.hide_render = True

    # ---- gameplay markers
    for i, (x, y) in enumerate(spawn_points(spec), 1):
        cb.empty(f"GMK_SPAWN_{i:02d}", gmk, (x, y, 0.0), "SINGLE_ARROW", 0.6, yaw_deg=180.0,
                 props={"kind": "spawn", "index": i})
    cb.empty("GMK_START", gmk, (0.0, 0.0, 0.0), "PLAIN_AXES", 1.0, props={"kind": "start_line", "width": W})
    cb.empty("GMK_FINISH", gmk, (0.0, L, 0.0), "PLAIN_AXES", 1.0, props={"kind": "finish_line", "width": W})
    cb.empty("GMK_SHEPHERD", gmk, (sh["x"], sh["y"], top), "SINGLE_ARROW", 2.0,
             props={"kind": "shepherd", "height": H, "head_z": round(head_z, 3)})
    cb.empty("GMK_BOUNDS", gmk, (0.0, (y0 + y_back) / 2, 0.0), "CUBE", 1.0,
             props={"kind": "bounds", "min_x": -half, "max_x": half, "min_y": y0, "max_y": y_back})
    be = spec["environment"]["observation"]["benches_east"]
    yb, nb = be["y0"], 0
    while yb <= be["y1"] + 1e-6:
        nb += 1
        cb.empty(f"GMK_BENCH_{nb:02d}", gmk, (be["x"], yb, 0.45), "PLAIN_AXES", 0.5, props={"kind": "bench", "index": nb})
        yb += be["spacing"]
    cb.empty("GMK_SPECTATOR_01", gmk, (0.0, sh["y"] + 15.0, top + H + 10.0), "PLAIN_AXES", 1.0,
             props={"kind": "spectator_camera", "look_at": [0.0, L / 2, 0.0]})

    # ---- review cameras (not exported)
    def camera(name, loc, look_at, lens=28.0):
        cam = bpy.data.cameras.new(name)
        cam.lens = lens
        cam.clip_end = 1000.0
        o = cb.place(name, cam, cols["STG01_CAM"], loc)
        d = (look_at[0] - loc[0], look_at[1] - loc[1], look_at[2] - loc[2])
        from mathutils import Vector
        o.rotation_euler = Vector(d).to_track_quat("-Z", "Y").to_euler()
        return o

    for name, c in spec["environment"]["cameras"].items():
        camera(name, tuple(c["pos"]), tuple(c["look"]), 24.0 if "Overview" not in name else 30.0)
    scene.camera = bpy.data.objects["CAM_STG01_Gameplay"]

    world = bpy.data.worlds.new("STG01_NightSky")
    if world.node_tree is None:
        world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.025, 0.065, 1.0)  # violet night (E8)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world
    return {"spawns": len(spawn_points(spec)), "floodlight_towers": n}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--spec", default=str(cb.REPO_ROOT / "blender/scripts/specs/stg01_greybox.json"))
    ap.add_argument("--out", default=str(cb.REPO_ROOT / "blender/scenes/STG01_RedLightGreenLight.blend"))
    args = cb.parse_args(ap)
    for warning in cb.check_version():
        print("WARNING:", warning)
    spec, spec_hash = cb.load_spec(args.spec)
    info = build(spec, spec_hash)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
    print(f"Built {out} (spec {spec_hash}): {info}")


if __name__ == "__main__":
    main()
