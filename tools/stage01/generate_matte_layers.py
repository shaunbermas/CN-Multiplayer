"""CN TRIAL Stage 01 refinement (Phase 04): six layered matte paintings that replace every 3D tree.

The yard's surroundings are painted, not modelled: the stacked-cone trees, the crossed-plane midground trees
and the camera-facing tree cutouts are all retired. Six seamless 360-degree panoramas wrap cylinders around
the course at different radii, so they shift against each other as the camera moves (cheap parallax):

  MP01_Sky              clouds and moonlit haze over the sky dome (alpha fades out toward the zenith)
  MP02_FarLandscape     distant ridges and mountains, purple-blue under heavy haze
  MP03_ForestSilhouettes layered conifer silhouettes, dark teal
  MP04_IndustrialSkyline factories, water towers, chimneys with smoke, cranes, a few amber windows
  MP05_MidStructures    nearer warehouses, silos, container stacks, pylons and fences, almost black
  MP06_Foreground       a translucent ground-mist band with weeds and fence posts

Palette: dark teal and blue-green with purple undertones (owner brief, 24 Nov 2026), haze toward the fog
colour so every layer melts into the yard's mist at its base.

Everything is generated from code with fixed seeds (numpy + Pillow): no photographs, no third-party or
AI-generated source images. Output:

  art/stage01/matte/source/<id>.png              full-resolution PNG sources (Git LFS)
  blender/exports/stage01/matte/<id>.webp        runtime textures (sRGB) loaded by the game
  blender/exports/stage01/matte/STAGE_01_MATTE_LAYERS.json  placement manifest

Usage: python tools/stage01/generate_matte_layers.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art/stage01/matte/source"
RUN = ROOT / "blender/exports/stage01/matte"
SRC.mkdir(parents=True, exist_ok=True)
RUN.mkdir(parents=True, exist_ok=True)


# ------------------------------------------------------------------------------------------ palette
def c(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


HAZE = c("#35575c")        # base haze, close to the scene fog colour seen through the floodlight glow
HAZE_HI = c("#4b6f73")
PURPLE = c("#3d3a5e")
PURPLE_DEEP = c("#2a2745")
TEAL_DEEP = c("#0f2328")
TEAL = c("#1b3a40")
NEAR_BLACK = c("#081114")
AMBER = c("#f2a957")
MOON = c("#c9d8e6")


# ------------------------------------------------------------------------------------------ helpers
def periodic_profile(rng: np.random.Generator, n: int, octaves: list[tuple[int, float]]) -> np.ndarray:
    """Seamless 1D fractal profile in [0, 1] (integer frequencies only)."""
    u = np.arange(n) / n
    h = np.zeros(n, np.float32)
    for k, a in octaves:
        for _ in range(3):
            f = k + int(rng.integers(0, 3))
            h += a * np.sin(2 * math.pi * f * u + rng.uniform(0, math.tau)) / 3
    h -= h.min()
    return h / max(float(h.max()), 1e-6)


def tile_noise(rng: np.random.Generator, h: int, w: int, scale: float, aniso: float = 1.0) -> np.ndarray:
    """Seamless 2D noise in [0, 1]; aniso > 1 stretches features horizontally (cloud banks)."""
    f = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None] * aniso
    kx = np.fft.fftfreq(w)[None, :]
    k = np.sqrt(kx ** 2 + ky ** 2) + 1e-6
    n = np.real(np.fft.ifft2(f * np.exp(-(k * scale) ** 2) / np.sqrt(k)))
    n -= n.min()
    return (n / n.max()).astype(np.float32)


class Mask:
    """Supersampled, horizontally wrapping silhouette mask drawn with Pillow (anti-aliased on downsample)."""

    def __init__(self, w: int, h: int, ss: int = 2):
        self.w, self.h, self.ss = w, h, ss
        self.img = Image.new("L", (w * ss, h * ss), 0)
        self.d = ImageDraw.Draw(self.img)

    def _wrap(self, pts):
        W = self.w * self.ss
        xs = [p[0] for p in pts]
        shifts = [0]
        if min(xs) < 0: shifts.append(W)
        if max(xs) > W: shifts.append(-W)
        return shifts

    def poly(self, pts: list[tuple[float, float]], fill: int = 255):
        s = self.ss
        sp = [(x * s, y * s) for x, y in pts]
        for dx in self._wrap(sp):
            self.d.polygon([(x + dx, y) for x, y in sp], fill=fill)

    def rect(self, x0, y0, x1, y1, fill: int = 255):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill)

    def ellipse(self, x0, y0, x1, y1, fill: int = 255):
        s = self.ss
        W = self.w * s
        for dx in (0, W, -W):
            self.d.ellipse([x0 * s + dx, y0 * s, x1 * s + dx, y1 * s], fill=fill)

    def line(self, pts, width: float, fill: int = 255):
        s = self.ss
        sp = [(x * s, y * s) for x, y in pts]
        for dx in self._wrap(sp):
            self.d.line([(x + dx, y) for x, y in sp], fill=fill, width=max(1, int(round(width * s))))

    def array(self) -> np.ndarray:
        return np.asarray(self.img.resize((self.w, self.h), Image.BOX), np.float32) / 255.0


def over(dst: np.ndarray, rgb: np.ndarray, a: np.ndarray) -> None:
    """Paint rgb with alpha a over dst (premultiplied-style accumulate on straight RGBA)."""
    a = np.clip(a, 0, 1)
    if rgb.ndim == 1:
        rgb = np.broadcast_to(rgb, dst[..., :3].shape)
    out_a = a + dst[..., 3] * (1 - a)
    num = rgb * a[..., None] + dst[..., :3] * (dst[..., 3] * (1 - a))[..., None]
    dst[..., :3] = np.where(out_a[..., None] > 1e-5, num / np.maximum(out_a, 1e-5)[..., None], dst[..., :3])
    dst[..., 3] = out_a


def glow_points(img: np.ndarray, pts: list[tuple[float, float, float]], col: np.ndarray, radius: float) -> None:
    """Small warm lights with a soft halo, painted on top (alpha raised where the halo lands)."""
    H, W = img.shape[:2]
    lay = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(lay)
    for x, y, s in pts:
        for dx in (0, W, -W):
            d.rectangle([x + dx - s, y - s, x + dx + s, y + s], fill=255)
    core = np.asarray(lay, np.float32) / 255
    halo = np.asarray(lay.filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255
    a = np.clip(core + halo * 2.2, 0, 1)
    img[..., :3] = img[..., :3] * (1 - a[..., None] * 0.85) + col * a[..., None] * 0.85
    img[..., 3] = np.maximum(img[..., 3], np.clip(core + halo * 1.2, 0, 1))


def vertical_haze(img: np.ndarray, top_mix: float, bottom_mix: float, start: float, col=HAZE) -> None:
    """Aerial perspective: blend toward haze, more toward the base (low-lying mist)."""
    H = img.shape[0]
    y = (np.arange(H) / H)[:, None]
    mix = top_mix + (bottom_mix - top_mix) * np.clip((y - start) / max(1e-3, 1 - start), 0, 1)
    img[..., :3] = img[..., :3] * (1 - mix[..., None]) + col * mix[..., None]


def bleed(rgba: np.ndarray, it: int = 6) -> np.ndarray:
    """Copy colour into transparent pixels so mipmaps show no dark fringes."""
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


def save(name: str, rgba: np.ndarray, quality: int = 86) -> dict:
    rgba = bleed(rgba)
    img = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    src = SRC / f"{name}.png"
    img.save(src, optimize=True)
    rt = RUN / f"{name}.webp"
    img.save(rt, quality=quality, alpha_quality=80, method=6, exact=False)
    return {"source": str(src.relative_to(ROOT)), "runtime": str(rt.relative_to(ROOT)), "px": list(img.size),
            "source_bytes": src.stat().st_size, "runtime_bytes": rt.stat().st_size,
            "gpu_bytes_rgba8_with_mips": int(img.size[0] * img.size[1] * 4 * 4 / 3)}


# ------------------------------------------------------------------------------------------ 01 sky
# u of every panorama: 0 faces +Z (behind the start line), increasing toward +X. The moon (skyModel.ts
# SKY.moonDir) sits at azimuth u ~ 0.61, about 28 degrees up.
MOON_U = 0.611


def sky(seed: int = 101) -> np.ndarray:
    W, H = 2048, 512
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 4), np.float32)
    y = (np.arange(H) / H)[:, None]          # 0 top .. 1 bottom (cylinder spans about -2 to +30 degrees)
    u = (np.arange(W) / W)[None, :]
    du = np.minimum(np.abs(u - MOON_U), 1 - np.abs(u - MOON_U))
    moon_near = np.exp(-(du / 0.07) ** 2) * np.exp(-((y - 0.12) / 0.22) ** 2)
    # Two cloud decks: high thin streaks and a low heavy bank above the horizon.
    hi = tile_noise(rng, H, W, 26.0, aniso=4.0)
    lo = tile_noise(rng, H, W, 40.0, aniso=3.0)
    det = tile_noise(rng, H, W, 6.0, aniso=2.0)
    hi_a = np.clip((hi - 0.52) * 3.2 + (det - 0.5) * 0.6, 0, 1) * np.exp(-((y - 0.28) / 0.18) ** 2)
    lo_a = np.clip((lo - 0.42) * 2.6 + (det - 0.5) * 0.5, 0, 1) * np.clip((y - 0.35) / 0.25, 0, 1)
    # Cloud colour: purple undertone in the body, cool moonlit rims near the moon, haze toward the horizon.
    body = PURPLE * (0.75 + 0.35 * det[..., None])
    rim = np.clip(moon_near[..., None] * (0.6 + det[..., None]), 0, 1)
    hi_rgb = body * (1 - rim * 0.6) + MOON * rim * 0.6
    lo_rgb = PURPLE_DEEP * (0.8 + 0.3 * det[..., None]) * (1 - y[..., None] * 0.2)
    lo_rgb = lo_rgb + (HAZE - lo_rgb) * np.clip((y[..., None] - 0.6) / 0.4, 0, 1) * 0.7
    over(img, hi_rgb, hi_a * 0.55)
    over(img, lo_rgb, lo_a * 0.8)
    # Horizon haze band so the sky meets the distant ridges softly.
    band = np.clip((y - 0.62) / 0.38, 0, 1) ** 1.4
    over(img, np.broadcast_to(HAZE_HI, img[..., :3].shape).copy(), np.broadcast_to(band * 0.55, (H, W)).copy())
    # Moon halo glow in the cloud layer.
    over(img, np.broadcast_to(MOON, img[..., :3].shape).copy(), (moon_near * 0.22).astype(np.float32))
    # Fade out toward the top edge so there is never a visible cylinder rim against the sky dome.
    img[..., 3] *= np.clip(y / 0.22, 0, 1)
    return img


# ------------------------------------------------------------------------------------------ 02 far landscape
def far_landscape(seed: int = 202) -> np.ndarray:
    W, H = 4096, 512
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 4), np.float32)
    tex = tile_noise(rng, H, W, 14.0)
    y = (np.arange(H) / H)[:, None]
    ranges = (
        (0.22, 0.42, c("#2c2a4a"), 0.40, [(1, 1.0), (3, 0.7), (7, 0.4), (17, 0.18), (41, 0.08)], 2.2),   # far peaks
        (0.46, 0.28, c("#222c44"), 0.30, [(2, 1.0), (5, 0.6), (12, 0.3), (29, 0.12), (61, 0.05)], 1.5),
        (0.64, 0.16, c("#17222f"), 0.20, [(3, 1.0), (8, 0.45), (19, 0.2), (45, 0.08)], 1.1),             # foothills
    )
    for i, (base, amp, col, haze, octs, pw) in enumerate(ranges):
        prof = periodic_profile(rng, W, octs) ** pw
        top = base - amp * prof
        edge = np.clip((y - top[None, :]) * H / 1.4, 0, 1)
        depth = np.clip((y - top[None, :]) / 0.22, 0, 1)
        shade = 0.85 + 0.22 * tex[..., None] - 0.18 * depth[..., None]
        rim = np.exp(-((y - top[None, :]) * H / 5.0) ** 2)[..., None] * (0.12 if i == 0 else 0.0)
        rgb = col * shade + rim * MOON
        fog = np.clip(haze + 0.55 * np.clip((y - 0.5) / 0.5, 0, 1), 0, 1)[..., None]
        rgb = rgb * (1 - fog) + HAZE * fog
        over(img, rgb, edge)
    return img


# ------------------------------------------------------------------------------------------ 03 forest silhouettes
def conifer(m: Mask, x: float, base: float, h: float, w: float, rng: np.random.Generator):
    """A ragged conifer silhouette: tiers of drooping branches around a thin spire."""
    tiers = int(5 + h / 6)
    pts_l, pts_r = [], []
    for i in range(tiers + 1):
        t = i / tiers                          # 0 top .. 1 bottom
        yy = base - h + h * t
        half = w * 0.5 * (0.06 + 0.94 * t ** 0.9) * (1 + rng.uniform(-0.18, 0.18))
        droop = h / tiers * 0.35
        pts_l += [(x - half * 0.55, yy - droop * 0.2), (x - half, yy + droop)]
        pts_r += [(x + half * 0.55, yy - droop * 0.2), (x + half, yy + droop)]
    pts = [(x, base - h - h * 0.04)] + pts_r + [(x + w * 0.05, base + 2), (x - w * 0.05, base + 2)] + pts_l[::-1]
    m.poly(pts)


def forest(seed: int = 303) -> np.ndarray:
    W, H = 4096, 512
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 4), np.float32)
    rows = (  # baseline (px), tree height range (px), colour, haze mix, density (trees per 100 px)
        (330, (90, 170), c("#18313a"), 0.42, 5.5),
        (380, (110, 210), c("#11262e"), 0.28, 4.5),
        (430, (130, 260), c("#0b1d23"), 0.16, 3.6),
        (480, (150, 300), c("#07151a"), 0.06, 2.6),
    )
    tex = tile_noise(rng, H, W, 3.0)
    for base, (h0, h1), col, haze, dens in rows:
        m = Mask(W, H)
        n = int(W / 100 * dens)
        # Clearings: density follows a slow periodic profile so the line is not a uniform comb.
        p = periodic_profile(rng, W, [(2, 1), (5, 0.6), (13, 0.3)])
        xs = np.sort(rng.uniform(0, W, n))
        for x in xs:
            if rng.uniform() > 0.35 + 0.65 * p[int(x) % W]: continue
            h = rng.uniform(h0, h1) * (0.7 + 0.5 * p[int(x) % W])
            conifer(m, float(x), base + rng.uniform(-6, 6), h, h * rng.uniform(0.32, 0.46), rng)
        m.rect(0, base, W, H)                  # solid ground under each row
        a = m.array()
        rgb = col * (0.9 + 0.2 * tex[..., None])
        rgb = rgb * (1 - haze) + HAZE * haze
        over(img, rgb, a)
    vertical_haze(img, 0.0, 0.55, 0.62)        # mist pooling between the trunks
    return img


# ------------------------------------------------------------------------------------------ 04 industrial skyline
def industrial(seed: int = 404) -> np.ndarray:
    W, H = 4096, 768
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 4), np.float32)
    GROUND = 640
    lights: list[tuple[float, float, float]] = []
    reds: list[tuple[float, float, float]] = []
    smoke_src: list[tuple[float, float]] = []

    def layer(col, haze, build):
        m = Mask(W, H)
        build(m)
        m.rect(0, GROUND - 4, W, H)
        a = m.array()
        rgb = col * (1 - haze) + HAZE * haze
        over(img, np.broadcast_to(rgb, img[..., :3].shape).copy(), a)

    def factory(m: Mask, x: float, w: float, h: float, windows: float):
        m.rect(x, GROUND - h, x + w, GROUND)
        kind = rng.integers(0, 3)
        if kind == 0:   # saw-tooth roof
            teeth = max(2, int(w / 22))
            for i in range(teeth):
                x0 = x + w * i / teeth; x1 = x + w * (i + 1) / teeth
                m.poly([(x0, GROUND - h), (x1, GROUND - h), (x1, GROUND - h - 14)])
        elif kind == 1:  # pitched roof
            m.poly([(x, GROUND - h), (x + w / 2, GROUND - h - w * 0.18), (x + w, GROUND - h)])
        else:            # flat roof with plant boxes
            for _ in range(rng.integers(1, 4)):
                bx = x + rng.uniform(0.1, 0.8) * w
                m.rect(bx, GROUND - h - rng.uniform(6, 16), bx + rng.uniform(8, 20), GROUND - h)
        for _ in range(int(w * h / 900 * windows)):
            if rng.uniform() < 0.5:
                lights.append((x + rng.uniform(4, w - 4), GROUND - rng.uniform(8, h - 6), 1.0))

    def chimney(m: Mask, x: float, h: float, w: float):
        m.poly([(x - w / 2, GROUND), (x - w * 0.36, GROUND - h), (x + w * 0.36, GROUND - h), (x + w / 2, GROUND)])
        m.rect(x - w * 0.45, GROUND - h - 4, x + w * 0.45, GROUND - h)
        reds.append((x, GROUND - h - 6, 1.0))
        smoke_src.append((x, GROUND - h - 4))

    def water_tower(m: Mask, x: float, h: float):
        tw = rng.uniform(26, 38); th = tw * 0.7
        top = GROUND - h
        for lx in (-0.4, -0.13, 0.13, 0.4):
            m.line([(x + lx * tw * 1.2, GROUND), (x + lx * tw * 0.8, top + th)], 2.2)
        m.line([(x - tw * 0.5, top + th + (GROUND - top - th) * 0.45), (x + tw * 0.5, top + th + (GROUND - top - th) * 0.45)], 1.6)
        m.ellipse(x - tw / 2, top + th * 0.55, x + tw / 2, top + th * 1.15)
        m.rect(x - tw / 2, top + th * 0.15, x + tw / 2, top + th * 0.85)
        m.poly([(x - tw / 2 - 2, top + th * 0.17), (x, top - th * 0.25), (x + tw / 2 + 2, top + th * 0.17)])
        reds.append((x, top - th * 0.25 - 3, 1.0))

    def crane(m: Mask, x: float, h: float):
        m.line([(x, GROUND), (x, GROUND - h)], 3)
        jib = rng.uniform(70, 130) * (1 if rng.uniform() < 0.5 else -1)
        m.line([(x - jib * 0.25, GROUND - h + 4), (x + jib, GROUND - h + 4)], 2.4)
        m.poly([(x - 3, GROUND - h), (x, GROUND - h - 16), (x + 3, GROUND - h)])
        m.line([(x, GROUND - h - 14), (x + jib, GROUND - h + 4)], 1)
        m.line([(x + jib * 0.7, GROUND - h + 4), (x + jib * 0.7, GROUND - h + 50)], 1)
        reds.append((x + jib, GROUND - h + 2, 0.8))

    def silo_group(m: Mask, x: float, h: float):
        r = rng.uniform(9, 14)
        for i in range(rng.integers(2, 5)):
            sx = x + i * r * 2.1
            m.rect(sx - r, GROUND - h, sx + r, GROUND)
            m.ellipse(sx - r, GROUND - h - r * 0.5, sx + r, GROUND - h + r * 0.5)
        m.rect(x - r, GROUND - h - r * 1.4, x + r * 2.1 * (i + 0.5), GROUND - h - r * 1.1)

    # Far layer: hazy low blocks all around.
    def far(m: Mask):
        x = 0.0
        while x < W:
            w = rng.uniform(30, 110); h = rng.uniform(25, 75)
            if rng.uniform() < 0.8: m.rect(x, GROUND - h, x + w, GROUND)
            x += w + rng.uniform(0, 40)
        for _ in range(14):
            xx = rng.uniform(0, W); m.rect(xx, GROUND - rng.uniform(110, 180), xx + rng.uniform(4, 7), GROUND)
    layer(c("#2c3d55"), 0.55, far)

    # Main layer: clusters of plant around the panorama, quieter right behind The Watcher (u ~ 0.5).
    def main(m: Mask):
        clusters = [0.04, 0.16, 0.27, 0.36, 0.62, 0.71, 0.82, 0.93]
        for cu in clusters:
            cx = cu * W + rng.uniform(-40, 40)
            span = rng.uniform(260, 420)
            x = cx - span / 2
            while x < cx + span / 2:
                w = rng.uniform(40, 120); h = rng.uniform(40, 120)
                factory(m, x, w, h, rng.uniform(0.6, 1.4))
                x += w + rng.uniform(-10, 16)
            for _ in range(rng.integers(1, 4)):
                chimney(m, cx + rng.uniform(-span / 2, span / 2), rng.uniform(170, 300), rng.uniform(10, 18))
            r = rng.uniform()
            if r < 0.45: water_tower(m, cx + rng.uniform(-span / 2, span / 2), rng.uniform(150, 210))
            elif r < 0.75: crane(m, cx + rng.uniform(-span / 2, span / 2), rng.uniform(200, 280))
            else: silo_group(m, cx + rng.uniform(-span / 3, span / 3), rng.uniform(80, 130))
    layer(c("#16242f"), 0.18, main)

    # Smoke: soft plumes drifting toward +u from each chimney.
    sm = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(sm)
    for x, y in smoke_src:
        for k in range(26):
            t = k / 25
            px = x + t * rng.uniform(120, 220); py = y - t * rng.uniform(50, 90) - math.sin(t * 3) * 8
            r = 6 + t * 34
            for dx in (0, W, -W):
                d.ellipse([px - r + dx, py - r * 0.6, px + r + dx, py + r * 0.6], fill=int(120 * (1 - t) ** 1.2))
    smoke = np.asarray(sm.filter(ImageFilter.GaussianBlur(8)), np.float32) / 255
    over(img, np.broadcast_to(c("#4d5470"), img[..., :3].shape).copy(), smoke * 0.55)

    vertical_haze(img, 0.0, 0.5, 0.7)
    glow_points(img, [(x, y, 1.2) for x, y, _ in lights], AMBER, 3.0)
    glow_points(img, [(x, y, 1.6) for x, y, _ in reds], c("#e0503c"), 4.0)
    return img


# ------------------------------------------------------------------------------------------ 05 mid structures
def mid_structures(seed: int = 505) -> np.ndarray:
    W, H = 4096, 512
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 4), np.float32)
    GROUND = 430
    m = Mask(W, H)
    lamps: list[tuple[float, float, float]] = []
    x = 0.0
    while x < W:
        r = rng.uniform()
        if r < 0.32:      # warehouse with a shallow roof and loading doors
            w = rng.uniform(90, 200); h = rng.uniform(45, 90)
            m.rect(x, GROUND - h, x + w, GROUND)
            m.poly([(x - 3, GROUND - h), (x + w / 2, GROUND - h - w * 0.07), (x + w + 3, GROUND - h)])
            if rng.uniform() < 0.6: lamps.append((x + rng.uniform(10, w - 10), GROUND - h * rng.uniform(0.35, 0.6), 1.0))
            x += w + rng.uniform(20, 70)
        elif r < 0.5:     # container stacks
            for col_i in range(rng.integers(2, 6)):
                for lvl in range(rng.integers(1, 4)):
                    cx0 = x + col_i * 26 + rng.uniform(-2, 2)
                    m.rect(cx0, GROUND - (lvl + 1) * 11, cx0 + 24, GROUND - lvl * 11 - 0.6)
            x += 160 + rng.uniform(10, 60)
        elif r < 0.64:    # electricity pylon (lattice silhouette)
            h = rng.uniform(110, 160); bw = h * 0.22
            m.line([(x - bw / 2, GROUND), (x - 3, GROUND - h)], 2)
            m.line([(x + bw / 2, GROUND), (x + 3, GROUND - h)], 2)
            for k in range(1, 7):
                t = k / 7; yy = GROUND - h * t; hw = bw / 2 * (1 - t) + 3
                m.line([(x - hw, yy), (x + hw, yy - h / 7)], 1)
                m.line([(x + hw, yy), (x - hw, yy - h / 7)], 1)
            for arm in (0.78, 0.9):
                m.line([(x - h * 0.2, GROUND - h * arm), (x + h * 0.2, GROUND - h * arm)], 2)
            x += rng.uniform(80, 150)
        elif r < 0.76:    # silo / tank
            rr = rng.uniform(16, 26); h = rng.uniform(60, 110)
            m.rect(x, GROUND - h, x + rr * 2, GROUND)
            m.ellipse(x, GROUND - h - rr * 0.4, x + rr * 2, GROUND - h + rr * 0.4)
            m.line([(x + rr * 2 + 2, GROUND), (x + rr * 2 + 2, GROUND - h)], 1.2)
            x += rr * 2 + rng.uniform(30, 90)
        else:             # gap with a street lamp
            lx = x + rng.uniform(20, 60)
            m.line([(lx, GROUND), (lx, GROUND - 40)], 1.4)
            m.line([(lx, GROUND - 40), (lx + 8, GROUND - 42)], 1.4)
            lamps.append((lx + 8, GROUND - 41, 1.4))
            x += rng.uniform(80, 180)
    # Chain-link fence line and posts along the whole base.
    for px in np.arange(0, W, 22):
        m.line([(px, GROUND), (px, GROUND - 16)], 1.3)
    m.line([(0, GROUND - 15), (W, GROUND - 15)], 1)
    m.rect(0, GROUND, W, H)
    a = m.array()
    fence_mesh = np.zeros_like(a)
    fence_mesh[GROUND - 15:GROUND] = 0.25
    a = np.maximum(a, fence_mesh)
    rgb = NEAR_BLACK * 0.9 + TEAL_DEEP * 0.1
    over(img, np.broadcast_to(rgb, img[..., :3].shape).copy(), a)
    # Faint rim from the sky haze along the tops, so the silhouettes separate from the skyline behind.
    up = np.roll(a, 2, 0)
    rim = np.clip(a - up, 0, 1)
    img[..., :3] += rim[..., None] * c("#2a4a52") * 0.8
    vertical_haze(img, 0.12, 0.45, 0.75)
    glow_points(img, lamps, AMBER, 4.5)
    return img


# ------------------------------------------------------------------------------------------ 06 foreground mist
def foreground(seed: int = 606) -> np.ndarray:
    W, H = 2048, 256
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 4), np.float32)
    y = (np.arange(H) / H)[:, None]
    n = tile_noise(rng, H, W, 10.0, aniso=3.0)
    # Translucent mist band: thick at the base, wispy and broken higher up.
    mist_a = np.clip((y - 0.25) / 0.6, 0, 1) ** 1.3 * (0.45 + 0.55 * n)
    over(img, np.broadcast_to(HAZE_HI * 0.92, img[..., :3].shape).copy(), mist_a * 0.75)
    # Weeds and leaning fence posts poking out of the mist (dark, partly veiled).
    m = Mask(W, H)
    for _ in range(900):
        x = rng.uniform(0, W); h = rng.uniform(6, 28) * (1 + 1.5 * (rng.uniform() < 0.08))
        lean = rng.uniform(-5, 5)
        m.line([(x, H), (x + lean, H - h)], rng.uniform(0.6, 1.4))
    for px in np.arange(rng.uniform(0, 60), W, rng.uniform(60, 110)):
        lean = rng.uniform(-3, 3)
        m.line([(px, H), (px + lean, H - rng.uniform(40, 70))], 2.2)
    m.rect(0, H - 10, W, H)
    weeds = m.array()
    over(img, np.broadcast_to(NEAR_BLACK, img[..., :3].shape).copy(), weeds * 0.85)
    # Mist drawn again in front of the weeds near the ground, so they sink into it.
    over(img, np.broadcast_to(HAZE_HI * 0.9, img[..., :3].shape).copy(), (np.clip((y - 0.6) / 0.4, 0, 1) * 0.5 * (0.5 + 0.5 * n)))
    img[..., 3] *= np.clip(y / 0.15, 0, 1)
    return img


# ------------------------------------------------------------------------------------------ main
LAYERS = [
    # id, builder, radius (m), height (m), bottom (m), uOffset, brightness, role
    ("MP01_Sky", sky, 1500, 880, -40, 0.0, 0.85, "cloud decks and moonlit haze over the sky dome (drifts slowly)"),
    ("MP02_FarLandscape", far_landscape, 1150, 320, -40, 0.13, 0.7, "distant ridges and mountains"),
    ("MP03_ForestSilhouettes", forest, 560, 74, -6, 0.37, 0.8, "layered conifer silhouettes"),
    ("MP04_IndustrialSkyline", industrial, 820, 330, -40, 0.0, 0.8, "factories, water towers, chimneys with smoke, cranes"),
    ("MP05_MidStructures", mid_structures, 360, 64, -4, 0.21, 0.9, "warehouses, silos, container stacks, pylons, fences"),
    ("MP06_Foreground", foreground, 240, 26, -3, 0.0, 1.0, "translucent ground mist with weeds and fence posts"),
]
# Draw order is far to near by radius: the forest band (560 m) sits in front of the skyline (820 m).
# Share of the fog colour mixed over each layer at runtime (the haze is already painted in, so far layers
# take more and near ones less; decision 031 keeps the backdrop sitting behind the fog).
FOG_MIX = {"MP01_Sky": 0.3, "MP02_FarLandscape": 0.3, "MP04_IndustrialSkyline": 0.35, "MP03_ForestSilhouettes": 0.28,
           "MP05_MidStructures": 0.22, "MP06_Foreground": 0.12}
ORDER = ["MP01_Sky", "MP02_FarLandscape", "MP04_IndustrialSkyline", "MP03_ForestSilhouettes", "MP05_MidStructures", "MP06_Foreground"]


def main() -> None:
    out = []
    by_id = {l[0]: l for l in LAYERS}
    for order, lid in enumerate(ORDER):
        _, build, radius, height, bottom, u_off, bright, role = by_id[lid]
        info = save(lid, build())
        out.append({"id": lid, "radius": radius, "height": height, "bottom": bottom, "order": order, "uOffset": u_off,
                    "brightness": bright, "fogMix": FOG_MIX[lid], "role": role, "drift": 0.0015 if lid == "MP01_Sky" else 0.0,
                    "texture": info["runtime"], **{k: v for k, v in info.items() if k != "runtime"}})
        print(lid, info["px"], info["runtime_bytes"], "B")
    manifest = {
        "stage": "STAGE_01_RED_LIGHT",
        "generator": "tools/stage01/generate_matte_layers.py",
        "replaces": ["blender/exports/stage15/STAGE_01_MATTE_PAINTING_MANIFEST.json (three layers and tree cutouts)",
                     "MidgroundTrees impostors", "cone trees in ENV_VISUAL_FOLIAGE (still stripped at load)"],
        "coordinates": "game metres: Y up, course toward -Z; u = 0 of each layer faces +Z (behind the start), increasing toward +X",
        "colorSpace": "sRGB, painted haze; rendered unlit, untone-mapped, faded toward the fog colour",
        "licensing": "Original procedural artwork generated by the project's own script with fixed seeds. No photographs, third-party or AI-generated images.",
        "collision": "none (decorative scenery only)",
        "centre": [0.0, 0.0, -78.5],
        "layers": out,
    }
    (RUN / "STAGE_01_MATTE_LAYERS.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
