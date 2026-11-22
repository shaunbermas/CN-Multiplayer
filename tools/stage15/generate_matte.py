"""CN TRIAL Stage 1.5 (Prompt 02): procedural matte painting layers and tree-cutout atlas.

Everything is generated from code and fixed seeds (numpy + Pillow): no photographs, no third-party or
AI-generated source images, so the licence is the project's own. Output:

  art/stage15/matte/source/   full-resolution PNG sources (Git LFS)
  blender/exports/stage15/    runtime WebP textures (sRGB) loaded by the game

Layers are horizontally seamless (periodic noise), so they wrap a full 360 degree cylinder with no seam.
Palette: dusk/night teal-violet world with amber practical lights (Stage 01 art direction, decision 022);
distance haze is painted in (aerial perspective), so the layers need no runtime fog.

Usage: python tools/stage15/generate_matte.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art/stage15/matte/source"
RUN = ROOT / "blender/exports/stage15"
SRC.mkdir(parents=True, exist_ok=True)
RUN.mkdir(parents=True, exist_ok=True)

W = 4096  # panorama width (360 degrees)


# ------------------------------------------------------------------------------------------ helpers
def srgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


def ridge(rng: np.random.Generator, n: int, octaves: list[tuple[int, float]]) -> np.ndarray:
    """Periodic 1D fractal profile in [0, 1] over n samples (seamless: integer frequencies only)."""
    u = np.arange(n) / n
    h = np.zeros(n, dtype=np.float32)
    for k, a in octaves:
        for _ in range(3):
            f = k + rng.integers(0, 3)
            h += a * np.sin(2 * math.pi * f * u + rng.uniform(0, math.tau)) / 3
    h -= h.min()
    return h / max(h.max(), 1e-6)


def tile_noise(rng: np.random.Generator, h: int, w: int, scale: float) -> np.ndarray:
    """Seamless 2D noise in [0, 1] (FFT-filtered white noise is periodic on both axes)."""
    f = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    k = np.sqrt(kx ** 2 + ky ** 2) + 1e-6
    n = np.real(np.fft.ifft2(f * np.exp(-(k * scale) ** 2) / np.sqrt(k)))
    n -= n.min()
    return (n / n.max()).astype(np.float32)


def save(name: str, rgba: np.ndarray, runtime_size: tuple[int, int] | None = None, quality: int = 88) -> dict:
    img = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")
    img.save(SRC / f"{name}.png", optimize=True)
    rt = img.resize(runtime_size, Image.LANCZOS) if runtime_size else img
    rt.save(RUN / f"{name}.webp", quality=quality, method=6, exact=False)
    return {"source": f"art/stage15/matte/source/{name}.png", "runtime": f"blender/exports/stage15/{name}.webp",
            "source_px": list(img.size), "runtime_px": list(rt.size), "runtime_bytes": (RUN / f"{name}.webp").stat().st_size}


def bleed(rgba: np.ndarray, it: int = 6) -> np.ndarray:
    """Copy colour into transparent pixels so mipmapping and alpha clipping show no dark fringes."""
    rgb, a = rgba[..., :3].copy(), rgba[..., 3]
    filled = a > 0.02
    for _ in range(it):
        acc = np.zeros_like(rgb); cnt = np.zeros(a.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            m = np.roll(filled, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * m[..., None]; cnt += m
        grow = (~filled) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        filled = filled | grow
    out = rgba.copy(); out[..., :3] = rgb
    return out


# Palette (sRGB). HAZE matches the stage's horizon / fog colour so layers melt into the sky at the base.
HAZE = srgb("#3f6a70")
DUSK = srgb("#4a5578")


# ------------------------------------------------------------------------------------------ far hills
def far_hills(seed: int = 11) -> np.ndarray:
    H = 768
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 4), np.float32)
    tex = tile_noise(rng, H, W, 18.0)
    y = np.arange(H)[:, None] / H  # 0 top .. 1 bottom
    for i, (base, amp, col, haze) in enumerate(((0.42, 0.40, "#5a6a8c", 0.62), (0.58, 0.30, "#3c4c6a", 0.45), (0.72, 0.18, "#2b3a50", 0.32))):
        prof = ridge(rng, W, [(2, 1.0), (5, 0.55), (11, 0.28), (23, 0.14), (47, 0.07)])
        prof = prof ** (1.4 if i == 0 else 1.1)
        top = base - amp * prof  # ridge line (fraction of height)
        mask = (y >= top[None, :]).astype(np.float32)
        # soft anti-aliased edge
        edge = np.clip((y - top[None, :]) * H / 1.5, 0, 1)
        c = srgb(col)
        depth = np.clip((y - top[None, :]) / 0.25, 0, 1)
        shade = 0.82 + 0.25 * tex[..., None] - 0.15 * depth[..., None]
        # moonlit rim along the ridge (moon toward -Z / +X side gets a cool highlight)
        rim = np.exp(-((y - top[None, :]) * H / 6.0) ** 2)[..., None] * 0.18
        rgb = c * shade + rim * srgb("#9fb6d0")
        # aerial perspective: blend to haze, stronger toward the base (low-lying mist)
        fog = np.clip(haze + 0.5 * np.clip((y - 0.55) / 0.45, 0, 1), 0, 1)[..., None]
        rgb = rgb * (1 - fog) + HAZE * fog
        a = edge * mask
        img[..., :3] = img[..., :3] * (1 - a[..., None]) + rgb * a[..., None]
        img[..., 3] = np.maximum(img[..., 3], a)
    img[..., :3] = np.clip(img[..., :3], 0, 1)
    return img


# ------------------------------------------------------------------------------------------ industrial skyline
def skyline(seed: int = 23) -> np.ndarray:
    H = 768
    rng = np.random.default_rng(seed)
    S = 2  # supersample
    im = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    base_y = int(H * S * 0.86)
    body = (24, 33, 44, 255)
    far = (40, 56, 70, 255)
    win_cols = [(255, 176, 92), (255, 196, 120), (235, 150, 70)]

    K = 2.6  # height scale: the band is 768 px tall and must read from the yard

    def X(u: float) -> int:
        return int((u % 1.0) * W * S)

    lights: list[tuple[int, int, tuple]] = []

    def block(u0: float, wid: float, hgt: float, col, windows: bool = True):
        x0, x1 = X(u0), X(u0) + int(wid * W * S)
        y0 = base_y - int(hgt * S)
        for off in (0, -W * S, W * S):  # wrap
            d.rectangle([x0 + off, y0, x1 + off, base_y + 40], fill=col)
        if windows:
            for _ in range(int(wid * W * 0.6)):
                if rng.random() < 0.35:
                    wx = rng.integers(x0 + 4, max(x0 + 5, x1 - 6))
                    wy = rng.integers(y0 + 6, max(y0 + 7, base_y - 8))
                    lights.append((int(wx), int(wy), win_cols[rng.integers(0, 3)]))

    def chimney(u: float, hgt: float, col):
        x = X(u); w = int(rng.uniform(5, 9) * S)
        for off in (0, -W * S, W * S):
            d.polygon([(x - w + off, base_y), (x + w + off, base_y), (x + int(w * 0.7) + off, base_y - int(hgt * S)), (x - int(w * 0.7) + off, base_y - int(hgt * S))], fill=col)
        lights.append((x, base_y - int(hgt * S) + 3 * S, (255, 60, 50)))  # aviation red

    def crane(u: float, hgt: float, col):
        x = X(u); top = base_y - int(hgt * S); jib = int(rng.uniform(60, 110) * S)
        for off in (0, -W * S, W * S):
            d.rectangle([x - 3 + off, top, x + 3 + off, base_y], fill=col)
            d.line([(x - jib // 3 + off, top), (x + jib + off, top)], fill=col, width=4 * S // 2)
            d.line([(x + off, top - 14 * S), (x + jib + off, top)], fill=col, width=S)
            d.line([(x + off, top - 14 * S), (x - jib // 3 + off, top)], fill=col, width=S)
            d.rectangle([x - 4 + off, top - 16 * S, x + 4 + off, top], fill=col)
        lights.append((x, top - 15 * S, (255, 60, 50)))

    def truss_bridge(u0: float, wid: float, hgt: float, col):
        x0, x1 = X(u0), X(u0) + int(wid * W * S)
        deck = base_y - int(hgt * S)
        for off in (0, -W * S, W * S):
            d.rectangle([x0 + off, deck, x1 + off, deck + 5 * S], fill=col)
            spans = 6
            for k in range(spans):
                a = x0 + (x1 - x0) * k // spans; b = x0 + (x1 - x0) * (k + 1) // spans
                mid = (a + b) // 2; arch = deck - int(K * 22 * S)
                d.line([(a + off, deck), (mid + off, arch), (b + off, deck)], fill=col, width=2 * S)
                d.line([(a + off, deck), (b + off, arch + 10 * S)], fill=col, width=S)
                d.rectangle([a - 3 + off, deck, a + 3 + off, base_y], fill=col)
        for k in range(12):
            lights.append((x0 + (x1 - x0) * k // 12, deck - 2 * S, (255, 190, 110)))

    def pylon(u: float, hgt: float, col):
        x = X(u); top = base_y - int(hgt * S); w = int(9 * S)
        for off in (0, -W * S, W * S):
            d.line([(x - w + off, base_y), (x + off, top), (x + w + off, base_y)], fill=col, width=2 * S)
            d.line([(x - w * 2 + off, top + 12 * S), (x + w * 2 + off, top + 12 * S)], fill=col, width=2 * S)
            d.line([(x - w * 1.5 + off, top + 26 * S), (x + w * 1.5 + off, top + 26 * S)], fill=col, width=2 * S)

    # Composition: dense industry behind the finish (u ~ 0.5 faces -Z, the Watcher end), a long bridge on the
    # west, sparse pylons and low sheds behind the start. u = 0 is +Z (behind the start), increasing toward +X.
    for _ in range(70):  # distant low layer
        u = rng.uniform(0, 1); block(u, rng.uniform(0.004, 0.014), K * rng.uniform(14, 40), far, windows=False)
    for _ in range(46):
        u = rng.normal(0.5, 0.12); block(u, rng.uniform(0.006, 0.02), K * rng.uniform(26, 90), body)
    for _ in range(18):
        u = rng.uniform(0.15, 0.85); block(u, rng.uniform(0.005, 0.012), K * rng.uniform(18, 50), body)
    for _ in range(11):
        chimney(rng.normal(0.5, 0.1), K * rng.uniform(80, 150), body)
    for _ in range(4):
        crane(rng.uniform(0.3, 0.7), K * rng.uniform(70, 110), body)
    truss_bridge(0.72, 0.13, K * 34, body)
    for k in range(9):
        pylon(0.05 + k * 0.035 + rng.uniform(-0.005, 0.005), K * rng.uniform(40, 52), body)
    # wires between pylons
    for k in range(8):
        a = X(0.05 + k * 0.035); b = X(0.05 + (k + 1) * 0.035)
        top = base_y - int(K * 44 * S)
        pts = [(a + (b - a) * t / 20, top + int(14 * S * math.sin(math.pi * t / 20))) for t in range(21)]
        d.line(pts, fill=body, width=S)

    im = im.resize((W, H), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float32) / 255.0
    # haze: lighter toward the base and for the far layer colour
    y = np.arange(H)[:, None] / H
    fog = np.clip((y - 0.55) / 0.35, 0, 1)[..., None] * 0.55 + 0.18
    arr[..., :3] = arr[..., :3] * (1 - fog) + HAZE * fog
    # lit windows and lamps (small warm points with a soft glow), painted after the haze
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for x, yy, c in lights:
        x //= S; yy //= S
        if 0 <= x < W and arr[min(yy, H - 1), x, 3] > 0.5 or c[0] == 255 and c[1] == 60:
            g.rectangle([x, yy, x + 1, yy + 1], fill=(*c, 255))
    halo = glow.filter(ImageFilter.GaussianBlur(3))
    ga = np.asarray(glow).astype(np.float32) / 255.0
    ha = np.asarray(halo).astype(np.float32) / 255.0
    add = ga[..., :3] * ga[..., 3:4] + ha[..., :3] * ha[..., 3:4] * 1.6
    arr[..., :3] = np.clip(arr[..., :3] + add, 0, 1)
    arr[..., 3] = np.maximum(arr[..., 3], np.clip(ha[..., 3] * 1.2, 0, 1) * 0.6)
    # smoke plumes from chimneys drifting east (soft, low alpha)
    return arr


# ------------------------------------------------------------------------------------------ forest line
def forest(seed: int = 37) -> np.ndarray:
    H = 512
    rng = np.random.default_rng(seed)
    S = 2
    im = Image.new("L", (W * S, H * S), 0)
    d = ImageDraw.Draw(im)
    base = H * S * 0.92
    density = ridge(rng, 512, [(3, 1.0), (7, 0.6), (15, 0.3)])
    n = 2600
    for i in range(n):
        u = rng.uniform(0, 1)
        if rng.random() > 0.35 + 0.65 * density[int(u * 511)]:
            continue  # clearings
        x = u * W * S
        h = rng.uniform(0.25, 0.75) * H * S * (0.55 + 0.45 * density[int(u * 511)])
        w = h * rng.uniform(0.18, 0.3)
        tiers = rng.integers(5, 9)
        for off in (0, -W * S, W * S):
            for t in range(tiers):  # jagged conifer tiers
                ty = base - h * (t / tiers)
                tw = w * (1 - t / tiers) * rng.uniform(0.9, 1.15)
                d.polygon([(x - tw + off, ty), (x + tw + off, ty), (x + off, ty - h / tiers * 1.8)], fill=255)
            if rng.random() < 0.3:  # rounded deciduous crowns between conifers
                r = w * rng.uniform(0.8, 1.3)
                d.ellipse([x - r + off, base - h * 0.7 - r, x + r + off, base - h * 0.7 + r], fill=255)
                d.rectangle([x - r * 0.15 + off, base - h * 0.7, x + r * 0.15 + off, base], fill=255)
    m = np.asarray(im.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255.0
    m[int(H * 0.9):] = 1.0
    tex = tile_noise(rng, H, W, 6.0)
    y = np.arange(H)[:, None] / H
    col = srgb("#14232a")
    rgb = col[None, None, :] * (0.75 + 0.5 * tex[..., None])
    # cool moonlit tips, darker trunks; haze rising from the base
    tip = np.clip(1 - (y - 0.2) / 0.5, 0, 1)[..., None] * 0.10 * srgb("#8fb0c4")
    fog = np.clip((y - 0.6) / 0.35, 0, 1)[..., None] * 0.45 + 0.12
    rgb = (rgb + tip) * (1 - fog) + HAZE * fog
    out = np.dstack([rgb, m])
    return bleed(out)


# ------------------------------------------------------------------------------------------ tree cutouts
def tree_cell(kind: str, rng: np.random.Generator, cw: int = 512, ch: int = 1024) -> np.ndarray:
    S = 2
    pad = 3 if kind.startswith(("dead", "broadleaf")) else 1  # wide crowns draw on a wider canvas, then get fitted
    im = Image.new("L", (cw * S * pad, ch * S), 0)
    d = ImageDraw.Draw(im)
    cx, base = cw * S * pad / 2, ch * S * 0.985
    if kind.startswith("conifer"):
        h = ch * S * (0.95 if kind != "conifer_broken" else 0.82)
        wmax = cw * S * {"conifer_narrow": 0.22, "conifer_wide": 0.33}.get(kind, 0.28)
        d.rectangle([cx - 10 * S, base - h * 0.2, cx + 10 * S, base], fill=255)
        tiers = 11
        for t in range(tiers):
            f = t / tiers
            ty = base - h * (0.12 + 0.86 * f)
            tw = wmax * (1 - f) ** 0.9 * rng.uniform(0.85, 1.1)
            for k in range(14):  # ragged needle clumps along each tier
                a = rng.uniform(-1, 1)
                px = cx + a * tw
                py = ty + rng.uniform(-0.02, 0.05) * h
                r = (0.035 + 0.03 * (1 - f)) * h * rng.uniform(0.6, 1.1)
                side = 1 if a >= 0 else -1
                # a needle clump drooping away from the trunk, kept inside the atlas cell
                px = min(max(px, cx - cw * S * 0.40), cx + cw * S * 0.40)
                d.polygon([(px - side * r * 0.5, py - r * 0.5), (px + side * r * 1.4, py + r * 0.6), (px + side * r * 0.3, py + r * 0.45),
                           (px - side * r * 0.3, py + r * 0.5)], fill=255)
            d.polygon([(cx - tw, ty + 0.03 * h), (cx + tw, ty + 0.03 * h), (cx, ty - h / tiers * 1.7)], fill=255)
        if kind == "conifer_broken":
            d.rectangle([cx - 6 * S, base - h * 1.08, cx + 6 * S, base - h * 0.9], fill=255)
    elif kind.startswith("dead"):
        def branch(x, y, ang, ln, w, depth):
            x2, y2 = x + math.cos(ang) * ln, y - math.sin(ang) * ln
            d.line([(x, y), (x2, y2)], fill=255, width=max(1, int(w)))
            if depth == 0:
                return
            for _ in range(2 if depth > 2 else 3):
                branch(x2, y2, ang + rng.uniform(-0.55, 0.55), ln * rng.uniform(0.6, 0.78), w * 0.62, depth - 1)
        branch(cx, base, math.pi / 2 + rng.uniform(-0.08, 0.08), ch * S * 0.25, 30 * S, 6)
    else:  # broadleaf crown
        h = ch * S * 0.9
        d.rectangle([cx - 14 * S, base - h * 0.45, cx + 14 * S, base], fill=255)
        for _ in range(70):
            a = rng.uniform(0, math.tau); rr = rng.uniform(0, 1) ** 0.6
            px = cx + math.cos(a) * rr * cw * S * 0.38
            py = base - h * 0.62 + math.sin(a) * rr * h * 0.32
            r = rng.uniform(0.05, 0.11) * cw * S
            d.ellipse([px - r, py - r, px + r, py + r], fill=255)
    # Fit the drawn silhouette inside the cell (4 % side margin, base on the bottom edge), so no tree is cut.
    full = np.asarray(im)
    cols = np.where(full.max(axis=0) > 0)[0]; rows = np.where(full.max(axis=1) > 0)[0]
    box = (int(cols.min()), int(rows.min()), int(cols.max()) + 1, int(rows.max()) + 1)
    crop = im.crop(box)
    k = min(cw * S * 0.92 / crop.width, ch * S * 0.985 / crop.height)
    crop = crop.resize((max(1, int(crop.width * k)), max(1, int(crop.height * k))), Image.LANCZOS)
    fitted = Image.new("L", (cw * S, ch * S), 0)
    fitted.paste(crop, ((cw * S - crop.width) // 2, ch * S - crop.height))
    m = np.asarray(fitted.resize((cw, ch), Image.LANCZOS)).astype(np.float32) / 255.0
    y = np.arange(ch)[:, None] / ch
    x = np.arange(cw)[None, :] / cw
    tex = tile_noise(rng, ch, cw, 3.0)
    base_col = srgb("#1d2f2c") if not kind.startswith("dead") else srgb("#2a2826")
    rgb = base_col[None, None, :] * (0.7 + 0.6 * tex[..., None])
    # moonlight from the left and top, darker toward the ground (painted shading; billboards are unlit)
    light = np.clip(0.55 - x * 0.7 + (1 - y) * 0.25, 0, 1)[..., None]
    rgb = rgb * (0.7 + 0.6 * light) + light * 0.06 * srgb("#9cc0d0")
    rgb *= np.clip(0.55 + (1 - y) * 0.6, 0, 1)[..., None]
    return bleed(np.dstack([rgb, m]), 10)


def tree_atlas(seed: int = 51) -> tuple[np.ndarray, list[dict]]:
    rng = np.random.default_rng(seed)
    kinds = ["conifer_tall", "conifer_narrow", "conifer_wide", "conifer_broken", "broadleaf_a", "broadleaf_b", "dead_a", "dead_b"]
    cw, ch = 512, 1024
    atlas = np.zeros((ch * 2, cw * 4, 4), np.float32)
    cells = []
    for i, k in enumerate(kinds):
        cell = tree_cell(k, rng, cw, ch)
        r, c = divmod(i, 4)
        atlas[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = cell
        a = cell[..., 3]
        rows = np.where(a.max(axis=1) > 0.5)[0]
        cells.append({"index": i, "kind": k, "col": c, "row": r, "uv": [c / 4, 1 - (r + 1) / 2, 1 / 4, 1 / 2],
                      "aspect": cw / ch, "coverage": round(float(a.mean()), 3), "top_frac": round(1 - rows.min() / ch, 3) if len(rows) else 1})
    return atlas, cells


if __name__ == "__main__":
    layers = {}
    layers["MP_FarHills"] = save("MP_FarHills", far_hills(), (4096, 768))
    layers["MP_IndustrialSkyline"] = save("MP_IndustrialSkyline", skyline(), (4096, 768))
    layers["MP_ForestLine"] = save("MP_ForestLine", forest(), (4096, 512))
    atlas, cells = tree_atlas()
    layers["TREE_Cutout_Atlas"] = save("TREE_Cutout_Atlas", atlas, (2048, 2048), quality=90)
    (RUN / "_generated.json").write_text(json.dumps({"layers": layers, "tree_cells": cells}, indent=1))
    print(json.dumps({k: v["runtime_bytes"] for k, v in layers.items()}))
