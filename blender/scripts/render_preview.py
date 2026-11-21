"""Render review images from every camera in 08_CAMERAS (CPU Cycles, no GPU needed).

Every camera renders to blender/exports/<STAGE>/previews/. Cameras with a review_name property are
also copied to renders/<review_name>.png (the Prompt 03 review set: top, perspective, third person).
A camera's res property overrides the output size.

    python blender/scripts/render_preview.py --blend blender/scenes/STAGE_01_GREYBOX.blend --stage STG01
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import addon_utils  # noqa: E402  (importable only after bpy)

import shutil  # noqa: E402

import cn_blender as cb  # noqa: E402
from cn_blender import COLL  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--blend", required=True)
    ap.add_argument("--stage", required=True)
    ap.add_argument("--samples", type=int, default=24)
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=720)
    ap.add_argument("--out-dir", default=None)
    args = cb.parse_args(ap)

    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
    addon_utils.enable("cycles", default_set=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = args.width, args.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 1.0

    out_dir = Path(args.out_dir or cb.REPO_ROOT / "blender/exports" / args.stage / "previews")
    out_dir.mkdir(parents=True, exist_ok=True)
    review_dir = cb.REPO_ROOT / "renders"
    for cam in sorted(bpy.data.collections[COLL["cams"]].objects, key=lambda o: o.name):
        scene.camera = cam
        res = cam.get("res")
        scene.render.resolution_x, scene.render.resolution_y = (int(res[0]), int(res[1])) if res else (args.width, args.height)
        scene.render.filepath = str(out_dir / f"{cam.name}.png")
        bpy.ops.render.render(write_still=True)
        print("Rendered", scene.render.filepath)
        if cam.get("review_name"):
            review_dir.mkdir(exist_ok=True)
            dst = review_dir / f"{cam['review_name']}.png"
            shutil.copyfile(scene.render.filepath, dst)
            print("Review render", dst)


if __name__ == "__main__":
    main()
