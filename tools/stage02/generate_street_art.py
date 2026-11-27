"""CN TRIAL Stage 02 · AGAWAN BASE art pass (decision 050): painted backgrounds and the street's texture atlas.

The owner asked (27 Nov 2026) for the Agawan street to look "almost exactly" like a Philippine street at Christmas,
with matte-painted PNG backgrounds, very low-poly geometry and detailed textures. Everything here is painted by
code with fixed seeds (numpy + Pillow): no photographs, no third-party or AI-generated images.

Matte layers (seamless panoramas on inward-facing cylinders around the block, like Stage 01):
  MP02_FarTown       hills of the town at night: thousands of window lights, a church with a giant parol, a
                     water tower and a radio mast, a lit tree in a far plaza
  MP03_Barangay      the neighbourhood just past the block: two- to four-storey houses with capiz windows, tin
                     roofs, balconies, parols in the windows, eave lights, coconut palms, light-wrapped poles with
                     stacked stars and parols strung on the wires

Street atlas (one texture for the merged street details, 8 x 3 cells of 256 px):
  row 0 (self-lit): capiz windows, curtained window, sari-sari store front, MALIGAYANG PASKO banner, a stall
                    wall of lit parols, a PANADERYA sign, a lit door transom
  row 1 (lit by the scene): plaster wall, hollow blocks, corrugated tin, panel door, grille window, roll-up shutter,
                    wood planks, gift wrap
  row 2: more gift wraps, a MERRY CHRISTMAS tarpaulin, a wreath, piko (hopscotch) chalk, a drain grate, a court
Plus tileable ground textures: concrete road slabs (the usual Philippine street surface), scored cement for the
open ground and sidewalks, and clay plaza tiles.

Output:
  art/stage02/source/<id>.png                         full-resolution PNG sources
  blender/exports/stage02/<id>.webp                   runtime textures (sRGB) loaded by the game
  blender/exports/stage02/STAGE_02_ART.json           manifest: layer placement and atlas cells

Usage: python tools/stage02/generate_street_art.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art/stage02/source"
RUN = ROOT / "blender/exports/stage02"
SRC.mkdir(parents=True, exist_ok=True)
RUN.mkdir(parents=True, exist_ok=True)

PAROL = ["#ff4d4d", "#ffd84a", "#5ad1ff", "#7dff8a", "#ff7ad9", "#ffffff", "#ffa040", "#a98bff"]
BULB = ["#ffd27a", "#ff6b6b", "#6be2ff", "#9dff7a", "#ff9ef0", "#fff4d6"]
WARM = ["#ffd27a", "#ffc35e", "#ffe2a6", "#ffb86b", "#fff0c8"]


def rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def shade(h: str | tuple, k: float) -> tuple[int, int, int]:
    c = rgb(h) if isinstance(h, str) else h
    return tuple(int(max(0, min(255, v * k))) for v in c)  # type: ignore[return-value]


def mix(a: str | tuple, b: str | tuple, t: float) -> tuple[int, int, int]:
    ca = rgb(a) if isinstance(a, str) else a
    cb = rgb(b) if isinstance(b, str) else b
    return tuple(int(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))  # type: ignore[return-value]


def font(px: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, px)
        except OSError:
            continue
    return ImageFont.load_default()


def star_pts(cx: float, cy: float, r: float, inner: float = 0.45, rot: float = 0.0) -> list[tuple[float, float]]:
    pts = []
    for i in range(10):
        a = -math.pi / 2 + rot + i * math.pi / 5
        rr = r if i % 2 == 0 else r * inner
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    return pts


class Canvas:
    """RGBA paint layer plus an additive light layer; both wrap horizontally (seamless panoramas)."""

    def __init__(self, w: int, h: int, ss: int = 2, wrap: bool = True):
        self.w, self.h, self.ss, self.wrap = w, h, ss, wrap
        self.img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.light = Image.new("RGB", (w * ss, h * ss), (0, 0, 0))
        self.ld = ImageDraw.Draw(self.light)

    def _shifts(self, xs: list[float]) -> list[int]:
        if not self.wrap:
            return [0]
        W = self.w * self.ss
        out = [0]
        if min(xs) < 0: out.append(W)
        if max(xs) > W: out.append(-W)
        return out

    def poly(self, pts, fill, light: bool = False):
        s = self.ss
        sp = [(x * s, y * s) for x, y in pts]
        d = self.ld if light else self.d
        for dx in self._shifts([p[0] for p in sp]):
            d.polygon([(x + dx, y) for x, y in sp], fill=fill)

    def rect(self, x0, y0, x1, y1, fill, light: bool = False):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill, light)

    def ellipse(self, x0, y0, x1, y1, fill, light: bool = False):
        s = self.ss
        d = self.ld if light else self.d
        for dx in self._shifts([x0 * s, x1 * s]):
            d.ellipse([x0 * s + dx, y0 * s, x1 * s + dx, y1 * s], fill=fill)

    def line(self, pts, fill, width: float, light: bool = False):
        s = self.ss
        sp = [(x * s, y * s) for x, y in pts]
        d = self.ld if light else self.d
        for dx in self._shifts([p[0] for p in sp]):
            d.line([(x + dx, y) for x, y in sp], fill=fill, width=max(1, int(round(width * s))))

    def glow(self, x, y, r, col, k: float = 1.0):
        """A soft light source: drawn on the light layer, blurred later."""
        c = shade(col, k)
        self.ellipse(x - r, y - r, x + r, y + r, c, light=True)

    def bulb(self, x, y, col, r: float = 1.3, halo: float = 3.5):
        self.ellipse(x - r, y - r, x + r, y + r, mix(col, "#ffffff", 0.45) + (255,))
        self.glow(x, y, halo * 0.6, col, 0.35)

    def finish(self, blur: float, gain: float, bloom_alpha: float = 0.85) -> np.ndarray:
        """Downsamples, then adds the blurred light layer on top (lights also raise alpha where they spill on sky)."""
        img = self.img.resize((self.w, self.h), Image.LANCZOS)
        light = self.light.resize((self.w, self.h), Image.BILINEAR)
        a = np.asarray(img, np.float32) / 255.0
        wide = np.asarray(_wrap_blur(light, blur * 5.0, self.wrap), np.float32) / 255.0
        tight = np.asarray(_wrap_blur(light, blur * 1.5, self.wrap), np.float32) / 255.0
        L = (tight * 0.55 + wide * 0.75) * gain
        rgbp = a[..., :3] * a[..., 3:4] + L  # premultiplied add
        alpha = np.clip(a[..., 3] + np.clip(L.max(axis=2), 0, 1) * bloom_alpha, 0, 1)
        out = np.zeros_like(a)
        out[..., :3] = np.clip(rgbp / np.maximum(alpha[..., None], 1e-4), 0, 1)
        out[..., 3] = alpha
        return out


def _wrap_blur(img: Image.Image, r: float, wrap: bool) -> Image.Image:
    if r <= 0:
        return img
    if not wrap:
        return img.filter(ImageFilter.GaussianBlur(r))
    w, h = img.size
    pad = int(r * 3) + 2
    big = Image.new(img.mode, (w + pad * 2, h))
    big.paste(img, (pad, 0))
    big.paste(img.crop((w - pad, 0, w, h)), (0, 0))
    big.paste(img.crop((0, 0, pad, h)), (w + pad, 0))
    return big.filter(ImageFilter.GaussianBlur(r)).crop((pad, 0, pad + w, h))


def tile_noise(rng: np.random.Generator, h: int, w: int, scale: float, aniso: float = 1.0) -> np.ndarray:
    f = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None] * aniso
    kx = np.fft.fftfreq(w)[None, :]
    k = np.sqrt(kx ** 2 + ky ** 2) + 1e-6
    n = np.real(np.fft.ifft2(f * np.exp(-(k * scale) ** 2) / np.sqrt(k)))
    n -= n.min()
    return (n / n.max()).astype(np.float32)


def save(name: str, rgba: np.ndarray, quality: int = 84, alpha: bool = True) -> dict:
    arr = (np.clip(rgba, 0, 1) * 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGBA" if alpha else "RGB")
    src = SRC / f"{name}.png"
    img.save(src, optimize=True)
    rt = RUN / f"{name}.webp"
    img.save(rt, quality=quality, alpha_quality=85, method=6)
    return {"texture": str(rt.relative_to(ROOT)), "source": str(src.relative_to(ROOT)), "px": list(img.size),
            "source_bytes": src.stat().st_size, "runtime_bytes": rt.stat().st_size}


# =============================================================================================== matte layers
def far_town(seed: int = 2202) -> np.ndarray:
    W, H = 2048, 512
    rng = np.random.default_rng(seed)
    cv = Canvas(W, H, ss=2)
    u = np.arange(W) / W
    hill = np.zeros(W)
    for f, a in ((1, 0.5), (2, 0.35), (3, 0.25), (5, 0.18), (9, 0.08)):
        hill += a * np.sin(2 * math.pi * f * u + rng.uniform(0, math.tau))
    hill = (hill - hill.min()) / (hill.max() - hill.min())
    ridge = H - (150 + hill * 120)
    # far ridge
    pts = [(0, H)] + [(x, ridge[x] - 40 - 30 * math.sin(x / 90.0)) for x in range(0, W, 4)] + [(W, H)]
    cv.poly(pts, (32, 28, 58, 255))
    pts = [(0, H)] + [(x, ridge[x]) for x in range(0, W, 4)] + [(W, H)]
    cv.poly(pts, (24, 21, 44, 255))
    # a church with a giant parol, a water tower and a radio mast
    cxw = W * 0.62
    base = ridge[int(cxw)] + 20
    cv.rect(cxw - 30, base - 52, cxw + 30, base + 40, (40, 34, 52, 255))
    cv.poly([(cxw - 34, base - 52), (cxw, base - 78), (cxw + 34, base - 52)], (48, 40, 60, 255))
    cv.rect(cxw - 52, base - 96, cxw - 32, base + 40, (44, 38, 56, 255))
    cv.poly([(cxw - 55, base - 96), (cxw - 42, base - 122), (cxw - 29, base - 96)], (52, 44, 64, 255))
    for i in range(3):
        cv.rect(cxw - 8 + i * 0.0, base - 40 + i * 12, cxw + 8, base - 32 + i * 12, rgb("#ffd890") + (255,))
    cv.rect(cxw - 46, base - 86, cxw - 38, base - 74, rgb("#ffe2a6") + (255,))
    cv.glow(cxw, base - 36, 26, "#ffcf7a", 0.6)
    # facade outline lights
    for t in np.linspace(0, 1, 26):
        cv.bulb(cxw - 34 + 34 * t, base - 52 - 26 * t, "#fff1cf", 0.9, 2.2)
        cv.bulb(cxw + 34 * t, base - 78 + 26 * t, "#fff1cf", 0.9, 2.2)
    pc = rgb("#ffd84a")
    cv.poly(star_pts(cxw, base - 100, 14), pc + (255,))
    cv.glow(cxw, base - 100, 22, "#ffd84a", 0.9)
    tx = W * 0.18
    tb = ridge[int(tx)] + 30
    for lx in (-6, 6):
        cv.line([(tx + lx, tb), (tx + lx * 0.6, tb - 46)], (20, 18, 30, 255), 1.4)
    cv.ellipse(tx - 11, tb - 62, tx + 11, tb - 44, (26, 23, 38, 255))
    mx = W * 0.86
    mb = ridge[int(mx)] + 10
    cv.poly([(mx - 7, mb), (mx, mb - 120), (mx + 7, mb)], (18, 16, 28, 255))
    for yy in (mb - 120, mb - 80, mb - 40):
        cv.bulb(mx, yy, "#ff3b3b", 1.4, 5)
    # a lit tree in a far plaza
    lx = W * 0.40
    lb = ridge[int(lx)] + 60
    cv.poly([(lx - 16, lb), (lx, lb - 52), (lx + 16, lb)], (18, 50, 34, 255))
    for i in range(70):
        f = rng.random()
        yy = lb - f * 50
        xx = lx + (rng.random() - 0.5) * 30 * (1 - f)
        cv.bulb(xx, yy, BULB[i % len(BULB)], 0.8, 2.2)
    cv.poly(star_pts(lx, lb - 54, 5), rgb("#ffe066") + (255,))
    cv.glow(lx, lb - 30, 22, "#ffcf70", 0.35)
    # rooftops climbing the hills, with tiny window lights
    for layer, (col, k, dens) in enumerate((((30, 26, 52), 0.55, 0.45), ((22, 19, 38), 0.8, 0.6), ((15, 13, 27), 1.0, 0.7))):
        x = rng.uniform(0, 20)
        while x < W:
            bw = rng.uniform(10, 26) * (0.7 + layer * 0.25)
            base = ridge[int(x) % W] + 30 + layer * 34 + rng.uniform(-6, 6)
            bh = rng.uniform(8, 24) * (0.8 + layer * 0.3)
            top = base - bh
            cv.rect(x, top, x + bw, H, col + (255,))
            if rng.random() < 0.6:
                cv.poly([(x - 2, top), (x + bw / 2, top - bw * 0.3), (x + bw + 2, top)], shade(col, 0.85) + (255,))
            for wy in np.arange(top + 3, min(H - 4, top + 60), 6):
                for wx in np.arange(x + 2, x + bw - 2, 4.5):
                    if rng.random() < dens * 0.5:
                        c = rgb(WARM[int(rng.integers(len(WARM)))]) if rng.random() < 0.85 else rgb(BULB[int(rng.integers(len(BULB)))])
                        cv.rect(wx, wy, wx + 1.6, wy + 1.8, shade(c, 0.75 + 0.25 * k) + (255,))
                        if rng.random() < 0.25:
                            cv.glow(wx + 0.8, wy + 0.9, 2.5, c, 0.4)
            x += bw + rng.uniform(1, 6)
    out = cv.finish(blur=1.6, gain=1.0, bloom_alpha=0.7)
    # town haze toward the bottom
    y = np.linspace(0, 1, H)[:, None]
    haze = np.clip((y - 0.55) / 0.45, 0, 1) * 0.35
    out[..., :3] = out[..., :3] * (1 - haze[..., None]) + np.array([0.20, 0.16, 0.30]) * haze[..., None]
    return out


WALLS_N = ["#e8c46a", "#8fd1a8", "#f0a3a3", "#9cc7e8", "#f3e3c3", "#e59a5c", "#c9a6e0", "#a8d672", "#f2d0a4", "#7fc4c0"]
ROOFS_N = ["#5a2c22", "#2c4246", "#45413f", "#63371f", "#363a50", "#4d5054"]


def capiz_window(cv: Canvas, x, y, w, h, lit: bool, rng, frame=(52, 36, 26)):
    cv.rect(x - 1.5, y - 1.5, x + w + 1.5, y + h + 1.5, frame + (255,))
    if lit:
        warm = rgb(WARM[int(rng.integers(len(WARM)))])
        cv.rect(x, y, x + w, y + h, warm + (255,))
        # capiz shell grid: small pale panes with darker frame lines
        step = max(2.4, w / 6)
        for gx in np.arange(x + step, x + w - 0.5, step):
            cv.line([(gx, y), (gx, y + h)], shade(warm, 0.55) + (255,), 0.6)
        for gy in np.arange(y + step, y + h - 0.5, step):
            cv.line([(x, gy), (x + w, gy)], shade(warm, 0.55) + (255,), 0.6)
        cv.glow(x + w / 2, y + h / 2, max(w, h) * 0.45, warm, 0.14)
    else:
        cv.rect(x, y, x + w, y + h, (30, 32, 44, 255))
        for gx in np.arange(x + 2.5, x + w, 3.5):  # iron grille
            cv.line([(gx, y), (gx, y + h)], (70, 70, 74, 255), 0.6)
    cv.line([(x + w / 2, y), (x + w / 2, y + h)], frame + (255,), 1.0)


def parol_draw(cv: Canvas, x, y, r, col, rng, tails=True):
    c = rgb(col)
    cv.poly(star_pts(x, y, r), mix(c, "#ffffff", 0.25) + (255,))
    cv.poly(star_pts(x, y, r * 0.55), mix(c, "#ffffff", 0.6) + (255,))
    if rng.random() < 0.5:
        cv.ellipse(x - r * 1.15, y - r * 1.15, x + r * 1.15, y + r * 1.15, None) if False else None
        for t in np.linspace(0, math.tau, 24, endpoint=False):
            cv.bulb(x + math.cos(t) * r * 1.2, y + math.sin(t) * r * 1.2, "#fff2c0", 0.5, 1.2)
    if tails:
        for t in (-0.3, 0, 0.3):
            ln = r * (1.8 if t == 0 else 1.4)
            cv.line([(x + t * r, y + r * 0.6), (x + t * r * 1.3, y + r * 0.6 + ln)], c + (255,), max(0.8, r * 0.12))
    cv.glow(x, y, r * 1.3, col, 0.4)


def catenary(x0, y0, x1, y1, sag, n=24):
    return [(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)) for t in np.linspace(0, 1, n)]


def barangay(seed: int = 2303) -> np.ndarray:
    """The neighbourhood past the block's wall. 4096 x 768, repeated 3x around a 70 m cylinder: ~0.036 m per px."""
    W, H = 4096, 768
    rng = np.random.default_rng(seed)
    cv = Canvas(W, H, ss=2)
    M = 1 / 0.036  # px per metre
    ground = H - 4
    poles: list[tuple[float, float]] = []
    palms: list[float] = []
    # back row: taller apartment blocks and a water tower, darker (depth)
    x = 0.0
    while x < W:
        bw = rng.uniform(7, 14) * M
        bh = rng.uniform(11, 17) * M
        col = shade(WALLS_N[int(rng.integers(len(WALLS_N)))], 0.42)
        top = ground - bh
        cv.rect(x, top, x + bw, ground, col + (255,))
        cv.rect(x - 4, top - 6, x + bw + 4, top, shade(col, 0.8) + (255,))
        for fy in np.arange(top + 0.9 * M, ground - 2 * M, 3.0 * M):
            for fx in np.arange(x + 0.8 * M, x + bw - 1.4 * M, 2.2 * M):
                if rng.random() < 0.55:
                    c = rgb(WARM[int(rng.integers(len(WARM)))])
                    cv.rect(fx, fy, fx + 1.0 * M, fy + 1.1 * M, shade(c, 0.7) + (255,))
                    cv.glow(fx + 0.5 * M, fy + 0.55 * M, 0.5 * M, c, 0.1)
                else:
                    cv.rect(fx, fy, fx + 1.0 * M, fy + 1.1 * M, (26, 26, 36, 255))
        if rng.random() < 0.35:  # rooftop parol
            parol_draw(cv, x + bw * rng.uniform(0.3, 0.7), top - 1.3 * M, 0.8 * M, PAROL[int(rng.integers(len(PAROL)))], rng)
        x += bw + rng.uniform(0.5, 3) * M
    # water tower
    for wt in (W * 0.23, W * 0.71):
        b = ground - 10 * M
        for lx in (-1.6, 1.6):
            cv.line([(wt + lx * M, ground - 6 * M), (wt + lx * 0.6 * M, b - 6 * M)], (30, 28, 36, 255), 3)
        cv.rect(wt - 2.2 * M, b - 10 * M, wt + 2.2 * M, b - 6 * M, (46, 52, 60, 255))
        cv.poly([(wt - 2.4 * M, b - 10 * M), (wt, b - 11.5 * M), (wt + 2.4 * M, b - 10 * M)], (40, 44, 52, 255))
        for t in np.linspace(0, 1, 18):
            cv.bulb(wt - 2.2 * M + 4.4 * M * t, b - 6 * M, BULB[int(t * 17) % len(BULB)], 1.2, 3)

    # front row: two/three-storey houses with tin roofs, balconies, capiz windows, eave lights
    x = rng.uniform(0, 2) * M
    while x < W - 1:
        bw = rng.uniform(5.5, 9.5) * M
        floors = int(rng.choice([2, 2, 3, 3, 4]))
        fh = 2.9 * M
        bh = floors * fh + 0.4 * M
        wall = WALLS_N[int(rng.integers(len(WALLS_N)))]
        wc = shade(wall, 0.5)
        top = ground - bh
        cv.rect(x, top, x + bw, ground, wc + (255,))
        # plaster stains: a few darker vertical streaks
        for _ in range(int(bw / 18)):
            sx = x + rng.uniform(0, bw)
            cv.rect(sx, top + rng.uniform(0, 30), sx + rng.uniform(2, 6), top + rng.uniform(40, bh), shade(wc, 0.9) + (255,))
        # floor bands
        for f in range(1, floors):
            yb = ground - f * fh
            cv.rect(x - 2, yb - 3, x + bw + 2, yb + 2, shade(wall, 0.78) + (255,))
        # roof
        rc = shade(ROOFS_N[int(rng.integers(len(ROOFS_N)))], 0.7)
        if rng.random() < 0.7:
            rise = rng.uniform(1.2, 2.0) * M
            cv.poly([(x - 0.5 * M, top), (x + bw / 2, top - rise), (x + bw + 0.5 * M, top)], rc + (255,))
            for t in np.linspace(0.05, 0.95, int(bw / 7)):  # corrugation lines
                px = x - 0.5 * M + (bw + M) * t
                py = top - rise * (1 - abs(t - 0.5) * 2)
                cv.line([(px, top), (px + (x + bw / 2 - px) * 0.05, py)], shade(rc, 1.25) + (255,), 0.8)
            eave_y = top
        else:
            cv.rect(x - 2, top - 0.7 * M, x + bw + 2, top, shade(wall, 0.7) + (255,))
            eave_y = top - 0.7 * M
        # windows per floor
        nwin = max(1, int(bw / (2.4 * M)))
        for f in range(floors):
            yb = ground - f * fh
            for i in range(nwin):
                cx = x + bw * (i + 0.5) / nwin
                if f == 0 and i == nwin // 2:
                    if rng.random() < 0.35:  # sari-sari store front, lit
                        sw = min(bw * 0.7, 3.4 * M)
                        cv.rect(cx - sw / 2, yb - 2.1 * M, cx + sw / 2, yb - 0.8 * M, rgb("#ffe2a6") + (255,))
                        for gx in np.arange(cx - sw / 2, cx + sw / 2, 0.35 * M):
                            cv.line([(gx, yb - 2.1 * M), (gx, yb - 0.8 * M)], (90, 80, 70, 255), 0.7)
                        cv.rect(cx - sw / 2 - 4, yb - 2.75 * M, cx + sw / 2 + 4, yb - 2.2 * M, rgb("#c43b3b") + (255,))
                        cv.glow(cx, yb - 1.5 * M, 1.4 * M, "#ffd27a", 0.25)
                    else:  # door with a transom light
                        cv.rect(cx - 0.5 * M, yb - 2.1 * M, cx + 0.5 * M, yb, (60, 38, 24, 255))
                        cv.rect(cx - 0.5 * M, yb - 2.35 * M, cx + 0.5 * M, yb - 2.15 * M, rgb("#ffd9a0") + (255,))
                        cv.glow(cx, yb - 2.25 * M, 0.5 * M, "#ffd9a0", 0.25)
                    continue
                ww, wh = 1.15 * M, 1.25 * M
                lit = rng.random() < 0.68
                capiz_window(cv, cx - ww / 2, yb - fh * 0.72, ww, wh, lit, rng)
                if lit and rng.random() < 0.28:
                    parol_draw(cv, cx, yb - fh * 0.72 + wh * 0.42, 0.42 * M, PAROL[int(rng.integers(len(PAROL)))], rng, tails=False)
            if f >= 1 and rng.random() < 0.45:  # balcony with a railing and lights
                yb2 = ground - f * fh
                cv.rect(x + 0.3 * M, yb2 - 0.95 * M, x + bw - 0.3 * M, yb2, shade(wall, 0.5) + (255,))
                for bx in np.arange(x + 0.4 * M, x + bw - 0.3 * M, 0.28 * M):
                    cv.line([(bx, yb2 - 0.9 * M), (bx, yb2)], shade(wall, 0.85) + (255,), 0.8)
                pal = BULB if rng.random() < 0.6 else ["#ffd27a", "#fff4d6"]
                for j, bx in enumerate(np.arange(x + 0.4 * M, x + bw - 0.3 * M, 0.35 * M)):
                    cv.bulb(bx, yb2 - 0.95 * M + 3 * math.sin(j * 0.9), pal[j % len(pal)], 1.1, 3.0)
        # eave lights (sagging loops)
        pal = BULB if rng.random() < 0.55 else ["#ffd27a", "#fff4d6"]
        loops = max(1, int(bw / (2.5 * M)))
        nb = int(bw / (0.42 * M))
        for j in range(nb + 1):
            t = j / nb
            sag = 0.25 * M * abs(math.sin(t * math.pi * loops))
            cv.bulb(x + bw * t, eave_y + 3 + sag, pal[j % len(pal)], 1.25, 3.4)
        if rng.random() < 0.5:
            parol_draw(cv, x + bw * rng.uniform(0.2, 0.8), eave_y + 1.1 * M, 0.75 * M, PAROL[int(rng.integers(len(PAROL)))], rng)
        if rng.random() < 0.45:
            palms.append(x + bw + rng.uniform(0.2, 1.4) * M)
        if rng.random() < 0.55:
            poles.append((x + bw + rng.uniform(0.3, 1.2) * M, ground))
        x += bw + rng.uniform(0.0, 1.6) * M

    # coconut palms (dark silhouettes with a few lights wrapped on some trunks)
    for px in palms:
        h = rng.uniform(9, 14) * M
        lean = rng.uniform(-1.5, 1.5) * M
        trunk = [(px + lean * (t ** 1.6), ground - h * t) for t in np.linspace(0, 1, 18)]
        cv.line(trunk, (22, 20, 18, 255), 0.35 * M)
        tx, ty = trunk[-1]
        for k in range(9):
            a = -math.pi / 2 + (k - 4) * 0.42 + rng.uniform(-0.1, 0.1)
            L = rng.uniform(2.6, 3.8) * M
            pts = []
            for t in np.linspace(0, 1, 10):
                pts.append((tx + math.cos(a) * L * t, ty + math.sin(a) * L * t + (L * 0.55) * t * t))
            cv.line(pts, (16, 26, 20, 255), 0.22 * M)
            for t in np.linspace(0.2, 1, 7):
                bx, by = pts[int(t * 9)]
                cv.line([(bx, by), (bx + math.cos(a + 1.2) * 0.6 * M, by + 0.7 * M)], (16, 26, 20, 255), 0.07 * M)
                cv.line([(bx, by), (bx + math.cos(a - 1.2) * 0.6 * M, by + 0.7 * M)], (16, 26, 20, 255), 0.07 * M)
        if rng.random() < 0.5:  # spiral of lights up the trunk
            for t in np.linspace(0.05, 0.95, 40):
                i = int(t * 17)
                bx, by = trunk[i]
                cv.bulb(bx + math.sin(t * 40) * 0.2 * M, by, BULB[i % len(BULB)], 1.1, 3)

    # utility poles: wires between them, some wrapped in lights with stacked stars (owner's reference photo)
    poles.sort()
    tops = []
    for px, gy in poles:
        h = rng.uniform(8.5, 10) * M
        cv.rect(px - 0.13 * M, gy - h, px + 0.13 * M, gy, (34, 32, 34, 255))
        cv.rect(px - 0.9 * M, gy - h + 0.6 * M, px + 0.9 * M, gy - h + 0.8 * M, (34, 32, 34, 255))
        tops.append((px, gy - h + 0.7 * M))
        if rng.random() < 0.55:
            pal = BULB if rng.random() < 0.5 else ["#fff1cf", "#ffd27a"]
            for j, t in enumerate(np.linspace(0.04, 0.85, 46)):
                cv.bulb(px + math.sin(j * 1.3) * 0.16 * M, gy - h * t, pal[j % len(pal)], 1.2, 3.2)
            for s in range(int(rng.integers(2, 4))):
                parol_draw(cv, px, gy - h - 0.4 * M - s * 1.3 * M, 0.55 * M, PAROL[int(rng.integers(len(PAROL)))], rng, tails=False)
    for (ax, ay), (bx, by) in zip(tops, tops[1:]):
        if bx - ax > 22 * M:
            continue
        for k in range(3):
            pts = catenary(ax, ay + k * 4, bx, by + k * 4, rng.uniform(0.4, 0.9) * M)
            cv.line(pts, (14, 14, 18, 255), 1.0)
        pts = catenary(ax, ay + 10, bx, by + 10, 1.0 * M, n=int((bx - ax) / 10) + 2)
        for j, (qx, qy) in enumerate(pts[1:-1]):
            cv.bulb(qx, qy + 2, BULB[j % len(BULB)], 1.2, 3.2)
        if rng.random() < 0.6:
            mx, my = pts[len(pts) // 2]
            parol_draw(cv, mx, my + 1.0 * M, 0.7 * M, PAROL[int(rng.integers(len(PAROL)))], rng)

    out = cv.finish(blur=2.0, gain=1.0, bloom_alpha=0.6)
    # haze toward the ground (the scene fog at the wall's foot)
    y = np.linspace(0, 1, H)[:, None]
    haze = np.clip((y - 0.72) / 0.28, 0, 1) * 0.4
    out[..., :3] = out[..., :3] * (1 - haze[..., None]) + np.array([0.13, 0.12, 0.2]) * haze[..., None]
    return out


# =============================================================================================== street atlas
CELL = 256
COLS, ROWS = 8, 3


def atlas() -> tuple[np.ndarray, dict]:
    rng = np.random.default_rng(2404)
    A = Image.new("RGBA", (CELL * COLS, CELL * ROWS), (0, 0, 0, 255))
    cells: dict[str, list[float]] = {}

    def cell(name: str, col: int, row: int, painter, transparent: bool = False) -> None:
        img = Image.new("RGBA", (CELL * 2, CELL * 2), (0, 0, 0, 0) if transparent else (128, 128, 128, 255))
        d = ImageDraw.Draw(img)
        painter(img, d, CELL * 2)
        img = img.resize((CELL, CELL), Image.LANCZOS)
        A.paste(img, (col * CELL, row * CELL))
        # uv rect (u0, v0, u1, v1) with a 2 px inset against bleeding; v is flipped for three.js (flipY)
        i = 2 / (CELL * COLS)
        j = 2 / (CELL * ROWS)
        cells[name] = [col / COLS + i, 1 - (row + 1) / ROWS + j, (col + 1) / COLS - i, 1 - row / ROWS - j]

    def noise_fill(img: Image.Image, base, amp: float, scale: float, seed: int):
        r = np.random.default_rng(seed)
        S = img.size[0]
        n = tile_noise(r, S, S, scale)
        n2 = tile_noise(r, S, S, 1.0)
        arr = np.asarray(img, np.float32).copy()
        v = (n - 0.5) * amp + (n2 - 0.5) * amp * 0.5
        arr[..., :3] = np.clip(np.array(base, np.float32)[None, None, :] * (1 + v[..., None]), 0, 255)
        img.paste(Image.fromarray(arr.astype(np.uint8), "RGBA"))

    # ---- row 0: self-lit
    def capiz(lit_parol: bool):
        def p(img, d, S):
            d.rectangle([0, 0, S, S], fill=(70, 46, 30, 255))
            m = S * 0.07
            warm = (255, 214, 140)
            d.rectangle([m, m, S - m, S - m], fill=warm)
            n = 7
            step = (S - 2 * m) / n
            for a in range(n):
                for b in range(n):
                    x0, y0 = m + a * step, m + b * step
                    t = 0.82 + 0.18 * rng.random()
                    d.rectangle([x0 + 3, y0 + 3, x0 + step - 3, y0 + step - 3], fill=shade(warm, t))
                    d.ellipse([x0 + step * 0.3, y0 + step * 0.3, x0 + step * 0.7, y0 + step * 0.7], fill=shade((255, 236, 200), t))
            d.rectangle([S / 2 - 6, m, S / 2 + 6, S - m], fill=(70, 46, 30, 255))
            d.rectangle([m, S / 2 - 4, S - m, S / 2 + 4], fill=(70, 46, 30, 255))
            if lit_parol:
                c = rgb("#ff4d4d")
                d.polygon(star_pts(S / 2, S * 0.42, S * 0.24), fill=mix(c, "#ffffff", 0.2))
                d.polygon(star_pts(S / 2, S * 0.42, S * 0.12), fill=mix(c, "#ffffff", 0.7))
                for t in (-0.06, 0, 0.06):
                    d.line([(S / 2 + t * S, S * 0.55), (S / 2 + t * S * 1.3, S * 0.86)], fill=c, width=6)
        return p
    cell("capiz", 0, 0, capiz(False))
    cell("capizParol", 1, 0, capiz(True))

    def curtain(img, d, S):
        d.rectangle([0, 0, S, S], fill=(236, 230, 214, 255))
        d.rectangle([S * 0.08, S * 0.08, S * 0.92, S * 0.92], fill=(255, 196, 120))
        for i in range(10):  # gathered curtains either side
            x = S * 0.08 + i * S * 0.022
            d.rectangle([x, S * 0.08, x + S * 0.02, S * 0.92], fill=(186, 60, 60) if i % 2 else (160, 48, 50))
            x2 = S * 0.92 - (i + 1) * S * 0.022
            d.rectangle([x2, S * 0.08, x2 + S * 0.02, S * 0.92], fill=(186, 60, 60) if i % 2 else (160, 48, 50))
        d.rectangle([S * 0.08, S * 0.08, S * 0.92, S * 0.16], fill=(200, 70, 66))
        for x in np.linspace(S * 0.12, S * 0.88, 14):  # little light string inside
            d.ellipse([x - 7, S * 0.2 - 7, x + 7, S * 0.2 + 7], fill=rgb(BULB[int(x) % len(BULB)]))
        d.rectangle([S * 0.47, S * 0.08, S * 0.53, S * 0.92], fill=(236, 230, 214))
    cell("curtain", 2, 0, curtain)

    def sari(img, d, S):
        d.rectangle([0, 0, S, S], fill=(40, 34, 30, 255))
        d.rectangle([0, 0, S, S * 0.24], fill=(196, 56, 52))
        f = font(int(S * 0.1))
        d.text((S / 2, S * 0.12), "SARI-SARI STORE", fill=(255, 238, 190), font=f, anchor="mm")
        d.rectangle([S * 0.04, S * 0.28, S * 0.96, S * 0.96], fill=(255, 226, 166))
        for sy in (0.42, 0.6, 0.78):  # shelves of goods
            d.rectangle([S * 0.06, S * sy, S * 0.94, S * sy + 8], fill=(120, 84, 56))
            x = S * 0.08
            while x < S * 0.9:
                w = rng.uniform(10, 26)
                h = rng.uniform(26, S * 0.13)
                c = [(214, 60, 52), (54, 120, 190), (236, 190, 60), (70, 160, 90), (240, 240, 230), (230, 120, 40)][int(rng.integers(6))]
                d.rectangle([x, S * sy - h, x + w, S * sy], fill=c)
                x += w + rng.uniform(2, 6)
        for t in np.linspace(0, 1, 16):  # hanging snack strips
            x = S * (0.06 + 0.88 * t)
            d.rectangle([x, S * 0.28, x + 9, S * 0.38], fill=[(236, 80, 70), (250, 200, 60), (80, 170, 220)][int(t * 15) % 3])
        for x in np.arange(S * 0.04, S * 0.96, S * 0.05):  # wire mesh
            d.line([(x, S * 0.28), (x, S * 0.96)], fill=(110, 100, 90), width=3)
        d.rectangle([S * 0.04, S * 0.86, S * 0.96, S * 0.96], fill=(96, 70, 50))
    cell("sari", 3, 0, sari)

    def banner(img, d, S):
        d.rectangle([0, 0, S, S], fill=(170, 30, 36, 255))
        d.rectangle([0, S * 0.3, S, S * 0.7], fill=(198, 40, 44))
        for y in (S * 0.3, S * 0.7):
            d.rectangle([0, y - 6, S, y + 6], fill=(240, 196, 80))
        f = font(int(S * 0.115))
        d.text((S / 2, S * 0.43), "MALIGAYANG", fill=(255, 236, 170), font=f, anchor="mm")
        d.text((S / 2, S * 0.58), "PASKO!", fill=(255, 236, 170), font=f, anchor="mm")
        for cx in (S * 0.1, S * 0.9):
            d.polygon(star_pts(cx, S * 0.5, S * 0.07), fill=(255, 216, 74))
        for x in np.linspace(S * 0.04, S * 0.96, 18):
            d.ellipse([x - 8, S * 0.15 - 8, x + 8, S * 0.15 + 8], fill=rgb(BULB[int(x) % len(BULB)]))
            d.ellipse([x - 8, S * 0.85 - 8, x + 8, S * 0.85 + 8], fill=rgb(BULB[(int(x) + 3) % len(BULB)]))
    cell("banner", 4, 0, banner)

    def lantern_wall(img, d, S):
        d.rectangle([0, 0, S, S], fill=(30, 22, 26, 255))
        for r_ in range(4):
            y = S * (0.14 + r_ * 0.24)
            d.line([(0, y - S * 0.08), (S, y - S * 0.08)], fill=(70, 60, 50), width=3)
            for c_ in range(5):
                x = S * (0.1 + c_ * 0.2)
                col = rgb(PAROL[(r_ * 5 + c_) % len(PAROL)])
                rr = S * 0.075
                d.ellipse([x - rr * 1.6, y - rr * 1.6, x + rr * 1.6, y + rr * 1.6], fill=shade(col, 0.35))
                d.polygon(star_pts(x, y, rr), fill=mix(col, "#ffffff", 0.3))
                d.polygon(star_pts(x, y, rr * 0.5), fill=mix(col, "#ffffff", 0.75))
                d.line([(x, y - rr), (x, y - S * 0.08)], fill=(90, 80, 70), width=2)
    cell("lanterns", 5, 0, lantern_wall)

    def bakery(img, d, S):
        d.rectangle([0, 0, S, S], fill=(36, 30, 26, 255))
        d.rounded_rectangle([S * 0.04, S * 0.12, S * 0.96, S * 0.88], radius=30, fill=(250, 206, 92))
        d.rounded_rectangle([S * 0.08, S * 0.18, S * 0.92, S * 0.82], radius=24, fill=(140, 62, 30))
        f = font(int(S * 0.115))
        d.text((S / 2, S * 0.4), "PANADERYA", fill=(255, 232, 170), font=f, anchor="mm")
        f2 = font(int(S * 0.055))
        d.text((S / 2, S * 0.62), "MAINIT NA PANDESAL", fill=(255, 210, 120), font=f2, anchor="mm")
    cell("bakery", 6, 0, bakery)

    def transom(img, d, S):
        d.rectangle([0, 0, S, S], fill=(255, 217, 160, 255))
        for i in range(7):  # fan light
            a = math.pi + i * math.pi / 6
            d.line([(S / 2, S), (S / 2 + math.cos(a) * S, S + math.sin(a) * S)], fill=(120, 80, 50), width=8)
        d.rectangle([0, 0, S, 10], fill=(120, 80, 50))
    cell("transom", 7, 0, transom)

    # ---- row 1: lit by the scene (tinted by vertex colour, so mostly near-white with texture)
    def plaster(img, d, S):
        noise_fill(img, (226, 222, 214), 0.16, 9.0, 11)
        for _ in range(7):  # faint rain streaks under the eaves
            x = rng.uniform(0, S)
            d.rectangle([x, 0, x + rng.uniform(3, 10), rng.uniform(S * 0.1, S * 0.45)], fill=(212, 208, 200, 255))
        for _ in range(6):  # hairline cracks
            x, y = rng.uniform(0, S), rng.uniform(0, S)
            pts = [(x, y)]
            for _k in range(6):
                x += rng.uniform(-18, 18); y += rng.uniform(6, 22); pts.append((x, y))
            d.line(pts, fill=(176, 172, 166, 255), width=2)
        d.rectangle([0, S * 0.92, S, S], fill=(196, 190, 182, 255))  # dirty skirting
    cell("plaster", 0, 1, plaster)

    def blocks(img, d, S):
        noise_fill(img, (200, 198, 192), 0.12, 5.0, 12)
        bh = S / 8
        for r_ in range(8):
            y = r_ * bh
            d.line([(0, y), (S, y)], fill=(130, 128, 122, 255), width=5)
            off = (S / 6) if r_ % 2 else 0
            for x in np.arange(off, S + 1, S / 3):
                d.line([(x, y), (x, y + bh)], fill=(130, 128, 122, 255), width=5)
    cell("blocks", 1, 1, blocks)

    def tin(img, d, S):
        noise_fill(img, (210, 210, 212), 0.08, 3.0, 13)
        for x in np.arange(0, S, S / 16):
            d.rectangle([x, 0, x + S / 32, S], fill=(176, 176, 180, 255))
            d.line([(x, 0), (x, S)], fill=(236, 236, 240, 255), width=3)
        for _ in range(16):  # rust runs
            x = rng.uniform(0, S)
            d.rectangle([x, rng.uniform(0, S * 0.5), x + rng.uniform(6, 20), S], fill=(176, 120, 86, 160))
        for y in (S * 0.33, S * 0.66):  # nail rows
            for x in np.arange(S / 32, S, S / 8):
                d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(120, 120, 124, 255))
    cell("tin", 2, 1, tin)

    def door(img, d, S):
        noise_fill(img, (176, 128, 92), 0.18, 2.0, 14)
        for x in np.arange(0, S, S / 10):
            d.line([(x, 0), (x, S)], fill=(140, 98, 66, 255), width=2)
        for (x0, y0, x1, y1) in ((0.12, 0.08, 0.45, 0.45), (0.55, 0.08, 0.88, 0.45), (0.12, 0.55, 0.45, 0.92), (0.55, 0.55, 0.88, 0.92)):
            d.rectangle([S * x0, S * y0, S * x1, S * y1], outline=(110, 72, 46, 255), width=10)
        d.ellipse([S * 0.78, S * 0.5, S * 0.84, S * 0.56], fill=(220, 190, 90, 255))
        # a wreath
        cx, cy, r_ = S / 2, S * 0.22, S * 0.13
        for t in np.linspace(0, math.tau, 40):
            d.ellipse([cx + math.cos(t) * r_ - 14, cy + math.sin(t) * r_ - 14, cx + math.cos(t) * r_ + 14, cy + math.sin(t) * r_ + 14], fill=(40, 110, 56, 255))
        for t in np.linspace(0, math.tau, 9):
            d.ellipse([cx + math.cos(t) * r_ - 6, cy + math.sin(t) * r_ - 6, cx + math.cos(t) * r_ + 6, cy + math.sin(t) * r_ + 6], fill=(210, 40, 40, 255))
        d.polygon([(cx - 22, cy + r_), (cx + 22, cy + r_), (cx, cy + r_ + 30)], fill=(210, 40, 40, 255))
    cell("door", 3, 1, door)

    def grille(img, d, S):
        d.rectangle([0, 0, S, S], fill=(40, 44, 58, 255))
        d.rectangle([0, 0, S, S], outline=(230, 226, 214, 255), width=18)
        for x in np.arange(S * 0.15, S * 0.9, S * 0.14):  # bars with scroll curls (typical PH window grilles)
            d.line([(x, 18), (x, S - 18)], fill=(214, 214, 218, 255), width=7)
        for y in (S * 0.33, S * 0.66):
            d.line([(18, y), (S - 18, y)], fill=(214, 214, 218, 255), width=7)
            for x in np.arange(S * 0.22, S * 0.9, S * 0.14):
                d.arc([x - 22, y - 22, x + 22, y + 22], 180, 360, fill=(214, 214, 218, 255), width=5)
                d.arc([x - 22, y - 22, x + 22, y + 22], 0, 180, fill=(214, 214, 218, 255), width=5)
    cell("grille", 4, 1, grille)

    def shutter(img, d, S):
        noise_fill(img, (190, 192, 196), 0.06, 2.0, 15)
        for y in np.arange(0, S, S / 18):
            d.line([(0, y), (S, y)], fill=(130, 132, 138, 255), width=4)
            d.line([(0, y + 4), (S, y + 4)], fill=(226, 228, 232, 255), width=2)
        d.rectangle([S * 0.44, S * 0.88, S * 0.56, S * 0.94], fill=(90, 90, 96, 255))
        # spray-painted store name
        f = font(int(S * 0.1))
        d.text((S / 2, S * 0.4), "BUKAS BUKAS", fill=(180, 60, 60, 255), font=f, anchor="mm")
    cell("shutter", 5, 1, shutter)

    def planks(img, d, S):
        noise_fill(img, (200, 160, 112), 0.2, 2.0, 16)
        for y in np.arange(0, S, S / 6):
            d.line([(0, y), (S, y)], fill=(120, 86, 54, 255), width=6)
            for _ in range(3):
                x = rng.uniform(0, S)
                d.ellipse([x - 8, y + 18, x + 8, y + 30], fill=(140, 100, 64, 255))
    cell("planks", 6, 1, planks)

    def wrap(kind: int):
        def p(img, d, S):
            bg = [(200, 40, 46), (30, 110, 70), (36, 80, 170), (230, 190, 70)][kind]
            fg = [(255, 236, 180), (240, 50, 50), (255, 255, 255), (200, 40, 46)][kind]
            d.rectangle([0, 0, S, S], fill=bg + (255,))
            if kind == 0:
                for x in np.arange(-S, S, S / 6):
                    d.polygon([(x, 0), (x + S / 12, 0), (x + S / 12 + S, S), (x + S, S)], fill=fg + (255,))
            elif kind == 1:
                for a in range(5):
                    for b in range(5):
                        d.polygon(star_pts(S * (a + 0.5) / 5 + (S / 10 if b % 2 else 0), S * (b + 0.5) / 5, S * 0.05), fill=(255, 216, 74, 255))
            elif kind == 2:
                for a in range(6):
                    for b in range(6):
                        cx, cy = S * (a + 0.5) / 6, S * (b + 0.5) / 6
                        for t in range(3):
                            ang = t * math.pi / 3
                            d.line([(cx - math.cos(ang) * 14, cy - math.sin(ang) * 14), (cx + math.cos(ang) * 14, cy + math.sin(ang) * 14)], fill=fg + (255,), width=3)
            else:
                for a in range(8):
                    for b in range(8):
                        if (a + b) % 2:
                            d.rectangle([a * S / 8, b * S / 8, (a + 1) * S / 8, (b + 1) * S / 8], fill=fg + (255,))
            # ribbon cross
            rc = (255, 230, 120) if kind != 3 else (40, 110, 60)
            d.rectangle([S * 0.44, 0, S * 0.56, S], fill=rc + (255,))
            d.rectangle([0, S * 0.44, S, S * 0.56], fill=rc + (255,))
        return p
    cell("wrapA", 7, 1, wrap(0))
    cell("wrapB", 0, 2, wrap(1))
    cell("wrapC", 1, 2, wrap(2))
    cell("wrapD", 2, 2, wrap(3))

    def tarp(img, d, S):
        d.rectangle([0, 0, S, S], fill=(250, 246, 236, 255))
        d.rectangle([0, 0, S, S * 0.18], fill=(30, 110, 70, 255))
        d.rectangle([0, S * 0.82, S, S], fill=(30, 110, 70, 255))
        f = font(int(S * 0.12))
        d.text((S / 2, S * 0.4), "MERRY", fill=(200, 40, 46, 255), font=f, anchor="mm")
        d.text((S / 2, S * 0.58), "CHRISTMAS!", fill=(200, 40, 46, 255), font=f, anchor="mm")
        f2 = font(int(S * 0.06))
        d.text((S / 2, S * 0.73), "mula sa Barangay", fill=(30, 110, 70, 255), font=f2, anchor="mm")
        for x in (S * 0.1, S * 0.9):
            d.polygon(star_pts(x, S * 0.09, S * 0.06), fill=(255, 216, 74, 255))
    cell("tarp", 3, 2, tarp)

    def gift_top(img, d, S):
        wrap(0)(img, d, S)
        cx, cy = S / 2, S / 2
        for a in (0.6, 2.5, 3.8, 5.6):  # a bow
            d.ellipse([cx + math.cos(a) * S * 0.12 - S * 0.12, cy + math.sin(a) * S * 0.12 - S * 0.08, cx + math.cos(a) * S * 0.12 + S * 0.12, cy + math.sin(a) * S * 0.12 + S * 0.08], fill=(255, 220, 110, 255), outline=(200, 150, 50, 255), width=4)
        d.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=(240, 196, 80, 255))
    cell("giftTop", 4, 2, gift_top)

    def piko(img, d, S):  # transparent chalk hopscotch (decal; alpha-tested)
        w = (236, 236, 228, 230)
        lw = 9
        cw = S * 0.3
        x0 = S / 2 - cw / 2
        rows = [(0.86, 1), (0.7, 1), (0.54, 2), (0.38, 1), (0.22, 2)]
        h = S * 0.15
        for y, n in rows:
            yy = S * y
            if n == 1:
                d.rectangle([x0, yy - h, x0 + cw, yy], outline=w, width=lw)
            else:
                d.rectangle([x0 - cw / 2, yy - h, x0 + cw / 2, yy], outline=w, width=lw)
                d.rectangle([x0 + cw / 2, yy - h, x0 + cw * 1.5, yy], outline=w, width=lw)
        d.arc([x0, S * 0.02, x0 + cw, S * 0.14], 180, 360, fill=w, width=lw)
        d.line([(x0, S * 0.08), (x0 + cw, S * 0.08)], fill=w, width=lw)
        f = font(int(S * 0.07))
        nums = ["1", "2", "3 4", "5", "6 7"]
        for (y, n), t in zip(rows, nums):
            d.text((S / 2, S * y - h / 2), t if n == 1 else t.replace(" ", "      "), fill=w, font=f, anchor="mm")
    cell("piko", 5, 2, piko, transparent=True)

    def grate(img, d, S):
        noise_fill(img, (120, 120, 124), 0.2, 2.0, 17)
        d.rectangle([S * 0.08, S * 0.08, S * 0.92, S * 0.92], fill=(36, 36, 40, 255))
        for x in np.arange(S * 0.12, S * 0.9, S * 0.07):
            d.rectangle([x, S * 0.1, x + S * 0.035, S * 0.9], fill=(90, 90, 96, 255))
    cell("grate", 6, 2, grate)

    def court(img, d, S):  # painted half-court key, transparent (decal)
        w = (240, 240, 232, 235)
        d.rectangle([S * 0.3, 0, S * 0.7, S * 0.6], outline=w, width=10)
        d.arc([S * 0.3, S * 0.4, S * 0.7, S * 0.8], 0, 180, fill=w, width=10)
        d.arc([S * 0.02, -S * 0.5, S * 0.98, S * 0.98], 0, 180, fill=w, width=10)
    cell("court", 7, 2, court, transparent=True)

    arr = np.asarray(A, np.float32) / 255.0
    return arr, cells


def _grain(rng, S_h, S_w, base, amp):
    n = tile_noise(rng, S_h, S_w, 1.0)
    n2 = tile_noise(rng, S_h, S_w, 10.0)
    n3 = tile_noise(rng, S_h, S_w, 40.0)
    v = 1 + (n - 0.5) * amp + (n2 - 0.5) * amp * 1.2 + (n3 - 0.5) * amp * 0.8
    out = np.ones((S_h, S_w, 4), np.float32)
    out[..., :3] = np.clip(np.array(base, np.float32)[None, None, :] / 255.0 * v[..., None], 0, 1)
    return out


def concrete_road(seed: int = 2505) -> np.ndarray:
    """A Philippine barangay road: Portland-cement concrete slabs (the usual street surface, not asphalt), 7 m across
    and two 4.5 m slabs along (512 x 656 px). Broom marks across, a centre joint, sealed transverse joints, gutters
    at both edges, wheel-track wear, oil drips, hairline cracks and one newer patched panel. Tiles along v."""
    W, H = 512, 656
    rng = np.random.default_rng(seed)
    out = _grain(rng, H, W, (178, 175, 166), 0.16)
    # wheel-track wear: slightly darker, smoother bands
    u = np.linspace(0, 1, W)[None, :]
    wear = np.exp(-((u - 0.27) / 0.06) ** 2) + np.exp(-((u - 0.73) / 0.06) ** 2)
    out[..., :3] *= (1 - 0.08 * wear)[..., None]
    img = Image.fromarray((out * 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(img)
    # broom (tine) marks across the slab
    for y in range(0, H, 3):
        if rng.random() < 0.55:
            x0 = rng.uniform(0, W * 0.2)
            d.line([(x0, y), (rng.uniform(W * 0.8, W), y + rng.uniform(-1, 1))], fill=(160, 157, 150, 255), width=1)
    # one newer patched panel (lighter, smoother)
    px0 = 0.52 * W
    py0 = rng.uniform(0.55, 0.62) * H
    patch = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(patch).rectangle([px0, py0, px0 + 0.35 * W, py0 + 0.22 * H], fill=(186, 184, 178, 90))
    img.alpha_composite(patch.filter(ImageFilter.GaussianBlur(3)))
    d = ImageDraw.Draw(img)
    d.rectangle([px0, py0, px0 + 0.35 * W, py0 + 0.22 * H], outline=(150, 148, 142, 255), width=1)
    # oil drips in the middle of the lane
    for _ in range(9):
        x, y, r = rng.choice([0.38, 0.62]) * W + rng.uniform(-30, 30), rng.uniform(0, H), rng.uniform(6, 18)
        d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=(146, 142, 136, 255))
    # hairline cracks
    for _ in range(7):
        x, y = rng.uniform(20, W - 20), rng.uniform(0, H)
        pts = [(x, y)]
        a = rng.uniform(0, math.tau)
        for _k in range(8):
            a += rng.uniform(-0.7, 0.7)
            x += math.cos(a) * 10; y += math.sin(a) * 10
            pts.append((x, y))
        d.line(pts, fill=(128, 125, 120, 255), width=1)
    # joints: centre (longitudinal) and transverse every 4.5 m, sealed dark with a little spalling
    d.line([(W / 2, 0), (W / 2, H)], fill=(96, 94, 90, 255), width=3)
    for y in (0, H / 2):
        d.rectangle([0, y - 2, W, y + 2], fill=(84, 82, 78, 255))
        for _ in range(10):
            x = rng.uniform(0, W)
            d.ellipse([x - 3, y - 4, x + 5, y + 4], fill=(120, 118, 112, 255))
    d.rectangle([0, H - 2, W, H], fill=(84, 82, 78, 255))
    # gutters: a darker cement channel with a little moss at both edges
    for x0, x1 in ((0, 0.055 * W), (0.945 * W, W)):
        d.rectangle([x0, 0, x1, H], fill=(128, 126, 118, 255))
        for _ in range(60):
            yy = rng.uniform(0, H)
            xx = rng.uniform(x0, x1)
            d.ellipse([xx - 1.5, yy - 2, xx + 1.5, yy + 2], fill=(112, 120, 96, 255))
        edge = x1 if x0 == 0 else x0
        d.line([(edge, 0), (edge, H)], fill=(100, 98, 92, 255), width=2)
    return np.asarray(img.filter(ImageFilter.GaussianBlur(0.5)), np.float32) / 255.0


def cement_yard(seed: int = 2707) -> np.ndarray:
    """Open ground off the road (alleys, base yards, sidewalks): lighter brushed cement scored into 1.5 m panels,
    with water stains and moss in the score lines. 512 px = 3 m."""
    S = 512
    rng = np.random.default_rng(seed)
    out = _grain(rng, S, S, (188, 182, 170), 0.14)
    stains = tile_noise(rng, S, S, 4.0)  # soft water stains (tileable)
    out[..., :3] *= (1 - 0.1 * np.clip((stains - 0.55) * 4, 0, 1))[..., None]
    img = Image.fromarray((out * 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(img)
    for t in (0, S / 2):
        d.rectangle([t - 1, 0, t + 1, S], fill=(158, 153, 142, 255))
        d.rectangle([0, t - 1, S, t + 1], fill=(158, 153, 142, 255))
    for _ in range(50):  # moss specks in the score lines
        t = rng.choice([0, S / 2])
        a = rng.uniform(0, S)
        x, y = (t, a) if rng.random() < 0.5 else (a, t)
        d.ellipse([x - 2, y - 2, x + 3, y + 3], fill=(110, 124, 90, 255))
    d.rectangle([S - 1, 0, S, S], fill=(158, 153, 142, 255))
    d.rectangle([0, S - 1, S, S], fill=(158, 153, 142, 255))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255.0


def plaza_tiles(seed: int = 2606) -> np.ndarray:
    """Town plaza floor: cream and terracotta clay tiles in a diamond pattern with grout lines. 512 px = 2.4 m."""
    S = 512
    rng = np.random.default_rng(seed)
    img = Image.new("RGBA", (S, S), (150, 140, 126, 255))
    d = ImageDraw.Draw(img)
    n = 8
    t = S / n
    for a in range(n):
        for b in range(n):
            k = 0.9 + 0.14 * rng.random()
            diamond = (a + b) % 4 == 0 or (a - b) % 4 == 0
            base = (176, 108, 84) if diamond else (222, 210, 186)
            d.rectangle([a * t + 2, b * t + 2, (a + 1) * t - 2, (b + 1) * t - 2], fill=shade(base, k) + (255,))
    arr = np.asarray(img, np.float32) / 255.0
    n1 = tile_noise(rng, S, S, 8.0)
    arr[..., :3] *= (0.92 + 0.16 * n1)[..., None]
    return np.clip(arr, 0, 1)


def main() -> None:
    manifest = {
        "stage": "STAGE_02_AGAWAN_BASE",
        "generator": "tools/stage02/generate_street_art.py",
        "decision": "050 (owner, 27 Nov 2026): matte-painted backgrounds, low poly with detailed textures, more lights",
        "licensing": "Original procedural artwork generated by the project's own script with fixed seeds. No photographs, third-party or AI-generated images.",
        "coordinates": "game metres, Y up; each layer is an inward cylinder centred on the plaza; u = 0 faces +Z",
        "collision": "none (decorative scenery only)",
        "layers": [],
        "atlas": {},
        "ground": {},
    }
    layers = [
        ("MP02_FarTown", far_town, {"radius": 140, "height": 36, "bottom": -2, "repeat": 2, "order": 1, "uOffset": 0.37, "brightness": 1.0, "fogMix": 0.28, "drift": 0, "role": "the town on the hills: window lights, church with a giant parol, water tower, radio mast"}),
        ("MP03_Barangay", barangay, {"radius": 70, "height": 27.6, "bottom": -0.6, "repeat": 3, "order": 2, "uOffset": 0.0, "brightness": 1.0, "fogMix": 0.12, "drift": 0, "role": "the neighbourhood past the block's wall: houses, capiz windows, parols, palms, light-wrapped poles"}),
    ]
    for lid, build, meta in layers:
        info = save(lid, build())
        manifest["layers"].append({"id": lid, **meta, **info})
        print(lid, info["px"], info["runtime_bytes"])
    arr, cells = atlas()
    info = save("T02_StreetAtlas", arr, quality=88)
    manifest["atlas"] = {"id": "T02_StreetAtlas", "cols": COLS, "rows": ROWS, "cell": CELL, "cells": cells, **info,
                         "lit": ["capiz", "capizParol", "curtain", "sari", "banner", "lanterns", "bakery", "transom"]}
    print("atlas", info["runtime_bytes"])
    # repeat: road = metres per tile along the road (u spans the road's width); yard and plaza = metres per tile
    for gid, build, rep in (("T02_ConcreteRoad", concrete_road, [7, 9]), ("T02_CementYard", cement_yard, [3, 3]), ("T02_PlazaTiles", plaza_tiles, [2.4, 2.4])):
        info = save(gid, build(), quality=82)
        manifest["ground"][gid] = {"repeat": rep, **info}
        print(gid, info["runtime_bytes"])
    (RUN / "STAGE_02_ART.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
