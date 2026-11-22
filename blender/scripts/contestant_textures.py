"""Shared texture set for the one contestant model (no per-colourway textures).

  python blender/scripts/contestant_textures.py

Writes blender/textures/CONTESTANT/CNT_Detail.png and CNT_Normal.png (1024 px, one atlas laid out by
contestant_geometry.ATLAS):
  CNT_Detail  RGB, no alpha (browsers may premultiply alpha): R cavity x 0.85 plus edge wear (so 0.85 is
              neutral, darker in seams and stitch holes, lighter on worn edges), G roughness, B stitch mask
              (stitches take the colourway's trim colour)
  CNT_Normal  tangent-space normal map (OpenGL / glTF convention): twill weave on fabric, seam grooves,
              raised topstitching, pebbled leather
Drawn at 2048 px and filtered down. Stitch and seam lines follow the garment panels exactly because the
geometry generator defines them in each panel's own UV space (contestant_geometry.stitch_lines).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402,F401  (contestant_geometry needs mathutils)
import contestant_geometry as G  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "blender/textures/CONTESTANT"
S = 2048


def px(group, u, v):
    u0, v0, du, dv = G.ATLAS[group]
    return ((u0 + u * du) * S, (1.0 - (v0 + v * dv)) * S)


def rect_px(group):
    u0, v0, du, dv = G.ATLAS[group]
    return (int(u0 * S), int((1 - v0 - dv) * S), int((u0 + du) * S), int((1 - v0) * S))


def dashed(draw, pts, dash=7.0, gap=4.0, width=2):
    carry = 0.0
    on = True
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        seg = np.hypot(x1 - x0, y1 - y0)
        if seg < 1e-6:
            continue
        t = 0.0
        while t < seg:
            step = (dash if on else gap) - carry
            t1 = min(seg, t + step)
            if on:
                draw.line([(x0 + (x1 - x0) * t / seg, y0 + (y1 - y0) * t / seg), (x0 + (x1 - x0) * t1 / seg, y0 + (y1 - y0) * t1 / seg)], fill=255, width=width)
            carry = 0.0 if t1 - t >= step - 1e-6 else carry + (t1 - t)
            if t1 - t >= step - 1e-6:
                on = not on
                carry = 0.0
            t = t1


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)

    fabric = Image.new("L", (S, S), 0)
    leather = Image.new("L", (S, S), 0)
    glossy = Image.new("L", (S, S), 0)
    metal = Image.new("L", (S, S), 0)
    fd, ld, gd, md = (ImageDraw.Draw(i) for i in (fabric, leather, glossy, metal))
    for g in G.ATLAS:
        r = rect_px(g)
        if g in G.FABRIC_GROUPS:
            fd.rectangle(r, fill=255)
        elif g in G.LEATHER_GROUPS:
            ld.rectangle(r, fill=255)
        elif g == "face":
            gd.rectangle(r, fill=255)
        elif g == "buckle":
            md.rectangle(r, fill=255)
    F = np.asarray(fabric, np.float32) / 255
    Lm = np.asarray(leather, np.float32) / 255
    Gm = np.asarray(glossy, np.float32) / 255
    Mm = np.asarray(metal, np.float32) / 255

    # stitch and seam masks from the panel definitions
    stitch = Image.new("L", (S, S), 0)
    seam = Image.new("L", (S, S), 0)
    sd, ed = ImageDraw.Draw(stitch), ImageDraw.Draw(seam)
    for g, kinds in G.stitch_lines().items():
        for line in kinds["seam"]:
            ed.line([px(g, u, v) for u, v in line], fill=255, width=3)
        for line in kinds["stitch"]:
            dashed(sd, [px(g, u, v) for u, v in line])
    St = np.asarray(stitch, np.float32) / 255
    Se = np.asarray(seam.filter(ImageFilter.GaussianBlur(2.2)), np.float32) / 255
    Se = Se / max(Se.max(), 1e-6)
    pucker = np.asarray(seam.filter(ImageFilter.GaussianBlur(9)), np.float32) / 255

    # edge wear: hem and front edges of the coat, cuff and collar edges, boot toes
    wear = Image.new("L", (S, S), 0)
    wd = ImageDraw.Draw(wear)
    for g, bands in (("coat", [(0, 0, 1, 0.05), (0, 0, 0.03, 1), (0.97, 0, 1, 1)]), ("collar", [(0, 0.9, 1, 1)]), ("cuff", [(0, 0.85, 1, 1)]),
                     ("hood", [(0, 0, 0.04, 1), (0.96, 0, 1, 1)]), ("boot", [(0, 0.0, 1, 0.25)]), ("lapel", [(0.85, 0, 1, 1)]),
                     ("flap", [(0, 0, 1, 0.2)]), ("belt", [(0, 0, 1, 0.12), (0, 0.88, 1, 1)])):
        for u0, v0, u1, v1 in bands:
            (x0, y1), (x1, y0) = px(g, u0, v0), px(g, u1, v1)
            wd.rectangle((x0, y0, x1, y1), fill=255)
    noise = rng.random((S // 8, S // 8)).astype(np.float32)
    noise = np.asarray(Image.fromarray((noise * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC), np.float32) / 255
    fine = rng.random((S, S)).astype(np.float32)
    W = np.asarray(wear.filter(ImageFilter.GaussianBlur(14)), np.float32) / 255 * (0.4 + 0.6 * noise)

    # height: twill weave on fabric, pebbled leather, seam grooves, raised stitches, puckering
    twill = 0.5 + 0.5 * np.sin((xx + yy * 0.5) * (2 * np.pi / 5.0)) * (0.75 + 0.25 * np.sin(yy * (2 * np.pi / 3.0)))
    peb = np.asarray(Image.fromarray((rng.random((S // 3, S // 3)) * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    H = F * (0.07 * twill + 0.03 * fine) + Lm * (0.14 * peb) - 0.55 * Se * (F + Lm) + 0.5 * St * (F + Lm) + 0.12 * pucker * F * np.sin(xx * 0.9)
    H = (H + np.roll(H, 1, 0) + np.roll(H, -1, 0) + np.roll(H, 1, 1) + np.roll(H, -1, 1)) / 5.0  # light blur
    gy, gx = np.gradient(H)
    k = 2.2
    nx, ny, nz = -gx * k, gy * k, np.ones_like(H)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    N = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5

    cav = np.clip(1.0 - 0.45 * Se - 0.12 * St + 0.03 * (noise - 0.5), 0, 1)  # the weave lives in the normal map
    rough = np.clip(0.80 * F + 0.55 * Lm + 0.12 * Gm + 0.30 * Mm + 0.85 * (1 - F - Lm - Gm - Mm) - 0.12 * W * F, 0, 1)
    D = np.stack([np.round(np.clip(0.85 * cav + 0.15 * np.clip(W, 0, 1), 0, 1) * 64) / 64, np.round(rough * 32) / 32, np.clip(St * 0.75, 0, 1)], -1)

    def save(arr, name, mode):
        # resize each channel on its own: Pillow premultiplies RGBA when resizing, which would zero the
        # colour channels wherever the stitch mask (alpha) is empty
        chans = [Image.fromarray((np.clip(arr[..., c], 0, 1) * 255 + 0.5).astype(np.uint8), "L").resize((G.ATLAS_PX, G.ATLAS_PX), Image.LANCZOS)
                 for c in range(arr.shape[-1])]
        im = Image.merge(mode, chans)
        im.save(OUT / name)
        return im

    save(D, "CNT_Detail.png", "RGB")
    save(N, "CNT_Normal.png", "RGB")
    print({"detail": str(OUT / "CNT_Detail.png"), "normal": str(OUT / "CNT_Normal.png"), "px": G.ATLAS_PX})


if __name__ == "__main__":
    main()
