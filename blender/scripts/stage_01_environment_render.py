"""Review renders of the Stage 01 environment (CPU Cycles, no GPU needed).

Renders the CAM_STG01_Env_* cameras (wide establishing, third person, front, side, top) to
renders/<review_name>.png. Perspective views keep the teal volumetric fog and haze cards; the
orthographic side and top views render without them so the layout reads clearly.

    python blender/scripts/stage_01_environment_render.py              # final quality
    python blender/scripts/stage_01_environment_render.py --scale 40 --samples 8 --only WIDE
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import addon_utils  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--blend", default=str(ROOT / "blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend"))
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--scale", type=int, default=100, help="resolution percentage")
    ap.add_argument("--only", default="", help="comma-separated review-name suffixes, e.g. WIDE,TOP")
    ap.add_argument("--out", default=str(ROOT / "renders"))
    args = cb.parse_args(ap)

    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
    addon_utils.enable("cycles", default_set=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.volume_step_rate = 4.0
    scene.cycles.max_bounces = 4
    scene.render.resolution_percentage = args.scale
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.75
    for o in bpy.data.objects:  # gameplay helpers never appear in beauty renders
        coll = o.users_collection[0].name if o.users_collection else ""
        if coll.startswith(("GAMEPLAY_", "PLAYER_SPAWNS", "WATCHER_REFERENCE", "SPECTATOR_", "SIGNAL_ANCHORS", "REFERENCE")):
            o.hide_render = True
    vfx = [o for o in bpy.data.objects if o.users_collection and o.users_collection[0].name == "VISUAL_VFX"]

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    only = {s.strip().upper() for s in args.only.split(",") if s.strip()}
    cams = sorted((o for o in bpy.data.objects if o.type == "CAMERA" and o.get("env_review")), key=lambda o: o.name)
    for cam in cams:
        name = cam["review_name"]
        if only and not any(name.endswith(s) for s in only):
            continue
        ortho = cam.data.type == "ORTHO"
        for o in vfx:  # fog and haze cards only in the perspective views
            o.hide_render = ortho
        if name.endswith("SIDE"):
            cam.data.clip_start = 203.0  # past the outer tree line
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = (int(v) for v in cam["res"])
        path = out / f"{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print("Rendered", path)


if __name__ == "__main__":
    main()
