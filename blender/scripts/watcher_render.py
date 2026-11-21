"""Review renders and animation preview for THE WATCHER (CPU Cycles, no GPU needed).

Writes renders/watcher/:
  THE_WATCHER_FRONT / _SIDE / _BACK.png    orthographic turnaround (same scale)
  THE_WATCHER_THREE_QUARTER.png            perspective
  THE_WATCHER_HEAD.png, _EYE.png, _HEAD_REAR.png   head and face close-ups
  THE_WATCHER_COMPONENTS.png               mechanical components sheet
  THE_WATCHER_MATERIALS.png                material reference swatches
  THE_WATCHER_POSES.png                    neutral, scanning and red-signal poses
  THE_WATCHER_IN_STAGE.png                 placed in the Stage 01 environment at WATCHER_ROOT_ANCHOR
  THE_WATCHER_ANIMATION.gif + _ANIMATION_CONTACT.png   clip sequence preview

    python blender/scripts/watcher_render.py                 # everything
    python blender/scripts/watcher_render.py --only FRONT,THREE_QUARTER --scale 50 --samples 8
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import addon_utils  # noqa: E402
from mathutils import Vector  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
BLEND = ROOT / "blender/scenes/THE_WATCHER.blend"
ENV = ROOT / "blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend"
OUT = ROOT / "renders/watcher"
SEQUENCE = ["Watcher_TurnAway", "Watcher_GreenSignal", "Watcher_TurnToField", "Watcher_FocusLock", "Watcher_RedSignal",
            "Watcher_ScanSweep", "Watcher_Detect", "Watcher_ReturnNeutral"]


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def setup_render(samples, scale):
    addon_utils.enable("cycles", default_set=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.cycles.max_bounces = 4
    s.render.resolution_percentage = scale
    s.render.image_settings.file_format = "PNG"
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast"
    s.view_settings.exposure = -0.8


def studio():
    """Dark studio: concrete floor, warm key, teal rim, cool fill. Render-only (never saved)."""
    s = bpy.context.scene
    col = bpy.data.collections.new("_RENDER")
    s.collection.children.link(col)
    w = s.world or bpy.data.worlds.new("World")
    s.world = w
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.012, 0.022, 0.025, 1)
    bg.inputs["Strength"].default_value = 1.0
    me = bpy.data.meshes.new("_floor")
    me.from_pydata([(-200, -200, 0), (200, -200, 0), (200, 200, 0), (-200, 200, 0)], [], [(0, 1, 2, 3)])
    fm = bpy.data.materials.new("_floor_mat")
    fb = fm.node_tree.nodes["Principled BSDF"]
    fb.inputs["Base Color"].default_value = (0.012, 0.014, 0.015, 1)
    fb.inputs["Roughness"].default_value = 0.6
    me.materials.append(fm)
    floor = bpy.data.objects.new("_floor", me)
    col.objects.link(floor)

    def light(name, kind, loc, target, energy, colour, size=10):
        ld = bpy.data.lights.new(name, kind)
        ld.energy, ld.color = energy, colour
        if kind == "AREA":
            ld.size = size
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        col.objects.link(o)
        return o

    light("_key", "AREA", (-30, -45, 40), (0, 0, 14), 200000, (1.0, 0.82, 0.62), 22)
    light("_fill", "AREA", (40, -30, 12), (0, 0, 14), 50000, (0.6, 0.75, 0.85), 25)
    light("_rim", "AREA", (25, 45, 35), (0, 0, 18), 300000, (0.4, 0.85, 0.9), 18)
    return col


def camera(name, loc, target, lens=50, ortho=None, res=(1000, 1250)):
    cd = bpy.data.cameras.new(name)
    o = bpy.data.objects.new(name, cd)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cd.lens = lens
    cd.clip_end = 3000
    if ortho:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho
    s = bpy.context.scene
    s.camera = o
    s.render.resolution_x, s.render.resolution_y = res
    return o


def shoot(path):
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("Rendered", Path(path).relative_to(ROOT))
    return path


def set_clip(clip, frame):
    arm = bpy.data.objects["Watcher_Rig"]
    arm.animation_data.action = bpy.data.actions[clip] if clip else None
    if not clip:
        for pb in arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        for n in ("Watcher_LensRed", "Watcher_LensGreen"):
            arm.pose.bones[n].scale = (0.01, 0.01, 0.01)
    bpy.context.scene.frame_set(frame)


def label_grid(paths, labels, cols, out, title, cell=(600, 600)):
    rows = math.ceil(len(paths) / cols)
    pad, head = 16, 70
    W = cols * cell[0] + (cols + 1) * pad
    H = head + rows * (cell[1] + 40) + (rows + 1) * pad
    sheet = Image.new("RGB", (W, H), (11, 20, 22))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 18), title, fill=(230, 239, 237), font=font(30))
    for i, (p, lab) in enumerate(zip(paths, labels)):
        im = Image.open(p).convert("RGB")
        im.thumbnail(cell)
        x = pad + (i % cols) * (cell[0] + pad)
        y = head + pad + (i // cols) * (cell[1] + 40 + pad)
        sheet.paste(im, (x + (cell[0] - im.width) // 2, y))
        d.text((x, y + cell[1] + 6), lab, fill=(159, 195, 192), font=font(20))
    sheet.save(out)
    print("Sheet", Path(out).relative_to(ROOT))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--scale", type=int, default=100)
    ap.add_argument("--only", default="")
    args = cb.parse_args(ap)
    only = {s.strip().upper() for s in args.only.split(",") if s.strip()}
    want = lambda k: not only or k in only  # noqa: E731
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "_parts"
    tmp.mkdir(exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    setup_render(args.samples, args.scale)
    studio()
    for o in bpy.data.collections["WATCHER_EXPORT"].objects:
        o.hide_render = True
    for o in bpy.data.collections["WATCHER_MATERIALS"].objects:
        o.hide_render = True
    set_clip(None, 1)

    if want("FRONT"):
        camera("c", (0, -120, 14.2), (0, 0, 14.2), ortho=31, res=(1000, 1250)); shoot(OUT / "THE_WATCHER_FRONT.png")
    if want("SIDE"):
        camera("c", (120, 0, 14.2), (0, 0, 14.2), ortho=31, res=(1000, 1250)); shoot(OUT / "THE_WATCHER_SIDE.png")
    if want("BACK"):
        camera("c", (0, 120, 14.2), (0, 0, 14.2), ortho=31, res=(1000, 1250)); shoot(OUT / "THE_WATCHER_BACK.png")
    if want("THREE_QUARTER"):
        camera("c", (-38, -55, 20), (0, 0, 14.5), lens=42, res=(1000, 1250)); shoot(OUT / "THE_WATCHER_THREE_QUARTER.png")
    if want("HEAD"):
        camera("c", (-6, -24, 25.5), (0, 0, 24.0), lens=55, res=(1000, 1000)); shoot(OUT / "THE_WATCHER_HEAD.png")
        set_clip("Watcher_RedSignal", 1)
        camera("c", (-2.6, -9.5, 24.2), (-1.3, -3.0, 23.6), lens=60, res=(1000, 1000)); shoot(OUT / "THE_WATCHER_EYE.png")
        set_clip("Watcher_GreenSignal", 1)
        camera("c", (-9, -8, 24.5), (0, -3.4, 23.4), lens=55, res=(1000, 1000)); shoot(OUT / "THE_WATCHER_HEAD_REAR.png")
        set_clip(None, 1)
    if want("COMPONENTS"):
        shots = [("Neck turret", (6, -9, 21), (0, 0, 20.0), 45), ("Waist turret and sash", (-8, -14, 14), (0, -1.5, 13.2), 40),
                 ("Shoulder and elbow joints", (14, -11, 16), (3.8, 0, 15.2), 40), ("Articulated hand", (9, -6, 9.5), (4.15, -0.2, 8.4), 50),
                 ("Wind-up key", (7, 12, 18), (0, 3.4, 16.3), 45), ("Iron boot and ankle", (7, -9, 2.6), (1.45, -0.6, 1.0), 40)]
        paths = []
        for i, (lab, loc, tgt, lens) in enumerate(shots):
            camera("c", loc, tgt, lens=lens, res=(800, 800))
            paths.append(shoot(tmp / f"comp_{i}.png"))
        label_grid(paths, [s[0] for s in shots], 3, OUT / "THE_WATCHER_COMPONENTS.png", "THE WATCHER · mechanical components")
    if want("MATERIALS"):
        sw = sorted(bpy.data.collections["WATCHER_MATERIALS"].objects, key=lambda o: o.name)
        paths, labels = [], []
        for o in sw:
            for other in sw:
                other.hide_render = other is not o
            camera("c", (o.location.x, o.location.y - 6, o.location.z + 0.6), o.location, lens=60, res=(500, 500))
            paths.append(shoot(tmp / f"mat_{o.name}.png"))
            labels.append(o.name.replace("Watcher_Swatch_", ""))
        for other in sw:
            other.hide_render = True
        label_grid(paths, labels, 6, OUT / "THE_WATCHER_MATERIALS.png", "THE WATCHER · material references", cell=(320, 320))
    if want("POSES"):
        poses = [("Neutral (Watcher_Idle)", "Watcher_Idle", 1), ("Scanning (Watcher_ScanSweep)", "Watcher_ScanSweep", 1),
                 ("Red signal (Watcher_RedSignal)", "Watcher_RedSignal", 1)]
        paths = []
        for i, (lab, clip, f) in enumerate(poses):
            set_clip(clip, f)
            camera("c", (-30, -58, 18), (0, 0, 14.5), lens=42, res=(800, 1000))
            paths.append(shoot(tmp / f"pose_{i}.png"))
        set_clip(None, 1)
        label_grid(paths, [p[0] for p in poses], 3, OUT / "THE_WATCHER_POSES.png", "THE WATCHER · poses", cell=(560, 700))
    if want("ANIMATION"):
        frames, labels = [], []
        s = bpy.context.scene
        camera("c", (-34, -58, 19), (0, 0, 14.5), lens=40, res=(480, 600))
        s.cycles.samples = max(6, args.samples // 4)
        n = 0
        for clip in SEQUENCE:
            act = bpy.data.actions[clip]
            f0, f1 = int(act.frame_start), int(act.frame_end)
            if clip in ("Watcher_GreenSignal", "Watcher_RedSignal"):
                f1 = f0 + 18
            for f in range(f0, f1 + 1, 3):
                set_clip(clip, f)
                frames.append(shoot(tmp / f"anim_{n:03d}.png"))
                labels.append(f"{clip} f{f}")
                n += 1
        imgs = [Image.open(p).convert("RGB") for p in frames]
        for im, lab in zip(imgs, labels):
            d = ImageDraw.Draw(im)
            d.rectangle((0, im.height - 30, im.width, im.height), fill=(11, 20, 22))
            d.text((8, im.height - 26), lab, fill=(230, 239, 237), font=font(16))
        imgs[0].save(OUT / "THE_WATCHER_ANIMATION.gif", save_all=True, append_images=imgs[1:], duration=125, loop=0, optimize=True)
        print("GIF", len(imgs), "frames")
        pick = [i for i, lab in enumerate(labels) if i % 3 == 0]
        label_grid([frames[i] for i in pick], [labels[i] for i in pick], 8, OUT / "THE_WATCHER_ANIMATION_CONTACT.png",
                   "THE WATCHER · animation sequence (every 9th frame at 24 fps)", cell=(240, 300))
    if want("STAGE"):
        render_in_stage(args)


def render_in_stage(args):
    """Append the Watcher into the Stage 01 environment at WATCHER_ROOT_ANCHOR (render only, nothing saved)."""
    bpy.ops.wm.open_mainfile(filepath=str(ENV))
    setup_render(args.samples, args.scale)
    s = bpy.context.scene
    s.view_settings.exposure = 0.75
    with bpy.data.libraries.load(str(BLEND), link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in ("Watcher_Rig", "Watcher_Body")]
        dst.actions = list(src.actions)
    col = bpy.data.collections.new("_WATCHER")
    s.collection.children.link(col)
    for o in dst.objects:
        col.objects.link(o)
    rig = bpy.data.objects["Watcher_Rig"]
    root = bpy.data.objects["WATCHER_ROOT_ANCHOR"].matrix_world.translation
    rig.location = root
    for o in bpy.data.objects:
        if o.name.startswith("ENM_Shepherd_Placeholder") or (o.users_collection and o.users_collection[0].name.startswith(("GAMEPLAY_", "PLAYER_SPAWNS", "WATCHER_REFERENCE", "SPECTATOR_", "SIGNAL_ANCHORS", "REFERENCE"))):
            o.hide_render = True
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions["Watcher_RedSignal"]
    s.frame_set(1)
    for cam_name, out in (("CAM_STG01_Env_ThirdPerson", "THE_WATCHER_IN_STAGE.png"),):
        cam = bpy.data.objects[cam_name]
        s.camera = cam
        s.render.resolution_x, s.render.resolution_y = (int(v) for v in cam["res"])
        shoot(OUT / out)
    camera("c", (-26, 120, 10), (0, 185, 18), lens=35, res=(1600, 900))
    shoot(OUT / "THE_WATCHER_IN_STAGE_CLOSE.png")


if __name__ == "__main__":
    main()
