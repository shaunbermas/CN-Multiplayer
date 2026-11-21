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
    post = cb.box_mesh("PRP_STG01_FinishGate_Post", gp, gp, gh, m_prop)
    cb.place("PRP_STG01_FinishGate_Post_W", post, props, (-half - gp, L, 0.0))
    cb.place("PRP_STG01_FinishGate_Post_E", post, props, (half + gp, L, 0.0))
    cb.place("PRP_STG01_FinishGate_Beam", cb.box_mesh("PRP_STG01_FinishGate_Beam", W + 4 * gp, gp, gp, m_prop),
             props, (0.0, L, gh - gp))
    ps, ph = sh["platform_size"], sh["platform_height"]
    cb.place("PRP_STG01_ShepherdPlatform", cb.box_mesh("PRP_STG01_ShepherdPlatform", ps, ps, ph, m_metal),
             props, (sh["x"], sh["y"], 0.0))
    fl = spec["floodlights"]
    mast = cb.cylinder_mesh("PRP_STG01_FloodlightMast", 0.35, fl["height"], 12, m_metal)
    lamp = cb.box_mesh("PRP_STG01_FloodlightLamp", 2.4, 0.6, 1.2, m_lamp)
    n = 0
    y = 0.0
    while y <= L + 1e-6:
        for side in (-1, 1):
            n += 1
            x = side * fl["x"]
            cb.place(f"PRP_STG01_FloodlightMast_{n:02d}", mast, props, (x, y, 0.0))
            cb.place(f"PRP_STG01_FloodlightLamp_{n:02d}", lamp, props, (x - side * 0.6, y, fl["height"]))
            light = bpy.data.lights.new(f"LGT_STG01_Flood_{n:02d}", "SPOT")
            light.energy = 60000.0
            light.spot_size = math.radians(70)
            light.color = (1.0, 0.85, 0.65)
            lo = cb.place(f"LGT_STG01_Flood_{n:02d}", light, cols["STG01_LIGHTS"], (x - side * 1.0, y, fl["height"]),
                          {"bake": "dynamic"})
            lo.rotation_euler = (0.0, math.radians(side * 55), 0.0)  # tilt toward the yard
        y += fl["spacing_y"]
    moon = bpy.data.lights.new("LGT_STG01_Moon", "SUN")
    moon.energy = 0.6
    moon.color = (0.55, 0.65, 0.9)
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

    camera("CAM_STG01_Gameplay", (0.0, spec["spawns"]["row_y"][0] - 5.0, 3.0), (0.0, sh["y"], head_z * 0.6), 24.0)
    camera("CAM_STG01_Overview", (-130.0, -70.0, 150.0), (0.0, L * 0.5, 0.0), 30.0)
    camera("CAM_STG01_Spectator_01", (0.0, sh["y"] + 15.0, top + H + 10.0), (0.0, L / 2, 0.0), 24.0)
    scene.camera = bpy.data.objects["CAM_STG01_Gameplay"]

    world = bpy.data.worlds.new("STG01_NightSky")
    if world.node_tree is None:
        world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.025, 0.04, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world
    return {"spawns": len(spawn_points(spec)), "floodlights": n}


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
