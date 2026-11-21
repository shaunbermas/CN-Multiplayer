"""Procedural, tileable texture sets for the Stage 01 environment (Prompt 05).

Original textures generated from seeded noise (numpy): no photos, no concept-art crops, so there are
no usage-rights questions. Every map tiles seamlessly (periodic FFT noise). Output: PNG sources in
blender/textures/STG01/ (Git LFS); the glTF export re-encodes them as WebP.

Maps per set: _BC base colour (sRGB, alpha where noted), _ORM (R occlusion, G roughness, B metallic,
linear; the glTF metallicRoughness layout), _N normal (OpenGL / glTF convention, linear).

    python blender/scripts/stage_01_textures.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "blender/textures/STG01"


# ----------------------------------------------------------------------------- noise helpers
def fbm(n: int, beta: float, seed: int, aniso=(1.0, 1.0)) -> np.ndarray:
    """Periodic 1/f^beta noise in [0, 1]. aniso stretches features along x or y."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((n, n))
    fx = np.fft.fftfreq(n)[None, :] * aniso[0]
    fy = np.fft.fftfreq(n)[:, None] * aniso[1]
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1.0
    spec = np.fft.fft2(white) / f ** beta
    spec[0, 0] = 0
    out = np.real(np.fft.ifft2(spec))
    out -= out.min()
    return out / out.max()


def ridges(n: int, seed: int, width: float = 0.025, beta: float = 1.6) -> np.ndarray:
    """Thin crack lines (1 on a crack) from the zero crossings of band-limited noise."""
    a = fbm(n, beta, seed)
    return np.clip(1.0 - np.abs(a - 0.5) / width, 0, 1) ** 2


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 and np.ndim(a) == 3 else t
    return a * (1 - t) + b * t


def colour(rgb, n):
    return np.broadcast_to(np.array(rgb, dtype=float), (n, n, 3)).copy()


def normal_from_height(h: np.ndarray, strength: float) -> np.ndarray:
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    nrm = np.dstack([-dx, dy, np.ones_like(h)])  # image rows go down, so +V is -row: flip dy
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    return nrm * 0.5 + 0.5


def save(name: str, arr: np.ndarray, size: int | None = None, mode: str = "RGB") -> dict:
    arr = np.clip(arr, 0, 1)
    img = Image.fromarray((arr * 255 + 0.5).astype(np.uint8), mode)
    if size and img.size[0] != size:
        img = img.resize((size, size), Image.LANCZOS)
    path = OUT / f"{name}.png"
    img.save(path, optimize=True)
    return {"file": path.name, "size": img.size[0], "mode": mode}


def srgb(lin):
    """Linear colour picks -> sRGB values for the base-colour image."""
    lin = np.clip(lin, 0, 1)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)


def orm(occ, rough, metal):
    return np.dstack([occ, rough, metal])


# ----------------------------------------------------------------------------- texture sets
def asphalt(n=1024):
    base = fbm(n, 1.1, 11)
    grit = fbm(n, 0.2, 12)
    damp = smooth(fbm(n, 2.2, 13), 0.45, 0.75)
    cracks = ridges(n, 14, 0.02) * smooth(fbm(n, 2.0, 15), 0.5, 0.7)
    patch = smooth(fbm(n, 2.4, 16), 0.62, 0.66)  # repaired patches, slightly darker
    c = colour((0.050, 0.056, 0.060), n)
    c = mix(c, colour((0.085, 0.088, 0.086), n), base * 0.6)
    c = mix(c, colour((0.16, 0.16, 0.15), n), smooth(grit, 0.78, 0.95) * 0.7)  # aggregate
    c = mix(c, colour((0.030, 0.034, 0.038), n), patch * 0.6)
    c = mix(c, colour((0.018, 0.022, 0.024), n), cracks)
    c *= (1 - 0.22 * damp)[..., None]
    rough = 0.8 - 0.32 * damp + 0.1 * (grit - 0.5)
    h = base * 0.4 + grit * 0.3 - cracks * 0.8 - patch * 0.1
    return {"BC": srgb(c), "ORM": orm(1 - cracks * 0.5, rough, np.zeros((n, n))), "N": normal_from_height(h, 6.0)}


def concrete(n=1024):
    base = fbm(n, 1.4, 21)
    fine = fbm(n, 0.4, 22)
    streak = fbm(n, 1.2, 23, aniso=(1.0, 14.0))  # long vertical water streaks
    moss = smooth(fbm(n, 2.0, 24), 0.7, 0.85) * 0.5
    cracks = ridges(n, 25, 0.015) * smooth(fbm(n, 2.0, 26), 0.55, 0.75)
    c = colour((0.13, 0.155, 0.155), n)  # cold grey-teal
    c = mix(c, colour((0.19, 0.205, 0.20), n), base * 0.7)
    c = mix(c, colour((0.08, 0.10, 0.10), n), smooth(streak, 0.55, 0.9) * 0.55)
    c = mix(c, colour((0.06, 0.09, 0.05), n), moss)
    c = mix(c, colour((0.05, 0.06, 0.06), n), cracks)
    c *= (0.9 + 0.2 * fine)[..., None]
    rough = 0.88 - 0.25 * smooth(streak, 0.6, 0.9) + 0.06 * (fine - 0.5)
    h = base * 0.3 + fine * 0.4 - cracks
    return {"BC": srgb(c), "ORM": orm(1 - cracks * 0.6, rough, np.zeros((n, n))), "N": normal_from_height(h, 4.0)}


def rust_paint(n=1024):
    """Faded teal paint over steel, chipped to rust at the edges of noise blobs."""
    chips = fbm(n, 1.5, 31)
    rust_amt = smooth(chips, 0.58, 0.66)
    rust_var = fbm(n, 0.9, 32)
    fine = fbm(n, 0.3, 33)
    streak = smooth(fbm(n, 1.2, 34, aniso=(1, 14.0)), 0.6, 0.9)
    paint = mix(colour((0.055, 0.15, 0.15), n), colour((0.09, 0.19, 0.18), n), fbm(n, 1.8, 35))
    paint = mix(paint, colour((0.16, 0.08, 0.035), n), streak * 0.45)  # rust run-off
    rust = mix(colour((0.19, 0.07, 0.025), n), colour((0.32, 0.13, 0.045), n), rust_var)
    c = mix(paint, rust, rust_amt)
    c *= (0.9 + 0.2 * fine)[..., None]
    rough = mix(0.55 + 0.1 * fine, 0.88 + 0.08 * rust_var, rust_amt)
    metal = rust_amt * 0.25
    h = (1 - rust_amt) * 0.5 + rust_var * rust_amt * 0.4 + fine * 0.15
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), rough, metal), "N": normal_from_height(h, 5.0)}


def steel_dark(n=512):
    """Dark painted structural steel with worn edges and light rust (towers, frames, legs)."""
    a = fbm(n, 1.3, 41)
    rust_amt = smooth(fbm(n, 1.6, 42), 0.66, 0.74)
    fine = fbm(n, 0.2, 43)
    c = mix(colour((0.035, 0.040, 0.045), n), colour((0.06, 0.065, 0.07), n), a)
    c = mix(c, colour((0.22, 0.09, 0.03), n), rust_amt)
    rough = 0.5 + 0.2 * a + 0.3 * rust_amt
    metal = 0.75 * (1 - rust_amt)
    h = a * 0.3 + fine * 0.2 + rust_amt * 0.3
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), rough, metal), "N": normal_from_height(h, 3.0)}


def steel_new(n=512):
    """Brighter galvanised steel the tournament bolted on (gantry, booth, finish truss)."""
    a = fbm(n, 1.0, 51)
    scratch = fbm(n, 0.6, 52, aniso=(0.05, 1.0))
    spang = fbm(n, 1.9, 53)  # galvanising spangle
    c = mix(colour((0.30, 0.31, 0.31), n), colour((0.44, 0.45, 0.44), n), spang)
    c *= (0.85 + 0.25 * a)[..., None]
    rough = 0.38 + 0.18 * a + 0.12 * smooth(scratch, 0.6, 0.8)
    h = spang * 0.2 + scratch * 0.2
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), rough, np.full((n, n), 0.9)), "N": normal_from_height(h, 2.0)}


def chain_link(n=512, cells=8):
    """Diamond chain-link mesh with alpha (one tile = cells x cells diamonds)."""
    y, x = np.mgrid[0:n, 0:n] / n * cells
    u = (x + y) % 1.0
    v = (x - y) % 1.0
    wire = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    alpha = smooth(0.06 - wire, -0.01, 0.01)
    rust = smooth(fbm(n, 1.4, 61), 0.55, 0.75)
    c = mix(colour((0.20, 0.21, 0.21), n), colour((0.24, 0.10, 0.04), n), rust)
    rgba = np.dstack([srgb(c), alpha])
    return {"BC": rgba, "ORM": orm(np.ones((n, n)), 0.55 + 0.35 * rust, 0.8 * (1 - rust))}


def wood(n=512, planks=4):
    grain = fbm(n, 1.1, 71, aniso=(0.04, 1.0))
    y = np.mgrid[0:n, 0:n][0] / n * planks
    seam = smooth(0.04 - np.minimum(y % 1.0, 1 - y % 1.0), -0.01, 0.01)
    tint = np.repeat(np.random.default_rng(72).uniform(0.85, 1.1, planks), n // planks)[:, None]
    c = mix(colour((0.13, 0.11, 0.09), n), colour((0.22, 0.20, 0.17), n), grain) * tint[..., None]
    c = mix(c, colour((0.03, 0.03, 0.03), n), seam)
    rough = 0.82 + 0.1 * grain
    h = grain * 0.5 - seam
    return {"BC": srgb(c), "ORM": orm(1 - seam * 0.5, rough, np.zeros((n, n))), "N": normal_from_height(h, 4.0)}


def dirt_grass(n=1024):
    mud = fbm(n, 1.5, 81)
    grass = smooth(fbm(n, 1.8, 82), 0.5, 0.62)
    blades = fbm(n, 0.1, 83)
    gravel = smooth(fbm(n, 0.3, 84), 0.8, 0.9)
    damp = smooth(fbm(n, 2.3, 85), 0.55, 0.75)
    c = mix(colour((0.045, 0.040, 0.032), n), colour((0.075, 0.066, 0.05), n), mud)
    c = mix(c, colour((0.12, 0.12, 0.11), n), gravel * 0.6)
    g = mix(colour((0.025, 0.055, 0.035), n), colour((0.06, 0.09, 0.045), n), blades)
    c = mix(c, g, grass * (0.6 + 0.4 * blades))
    c *= (1 - 0.35 * damp)[..., None]
    rough = 0.92 - 0.35 * damp * (1 - grass)
    h = mud * 0.4 + grass * blades * 0.5 + gravel * 0.3
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), rough, np.zeros((n, n))), "N": normal_from_height(h, 5.0)}


def paint_worn(n=256):
    """Worn white line paint; alpha holes let the asphalt show through."""
    wear = fbm(n, 1.3, 91)
    fine = fbm(n, 0.4, 92)
    alpha = smooth(wear + 0.25 * fine, 0.32, 0.38)
    c = colour((0.62, 0.62, 0.57), n) * (0.85 + 0.2 * fine)[..., None]
    return {"BC": np.dstack([srgb(c), alpha]), "ORM": orm(np.ones((n, n)), 0.65 + 0.2 * fine, np.zeros((n, n)))}


def stripes(n=256, a=(0.55, 0.40, 0.02), b=(0.02, 0.02, 0.02), seed=101):
    """Worn diagonal warning stripes (two stripes per tile)."""
    y, x = np.mgrid[0:n, 0:n] / n
    s = ((x + y) * 2) % 1.0 < 0.5
    wear = smooth(fbm(n, 1.4, seed), 0.62, 0.7)
    c = np.where(s[..., None], colour(a, n), colour(b, n))
    c = mix(c, colour((0.2, 0.08, 0.03), n), wear)
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), 0.6 + 0.3 * wear, wear * 0.2)}


def checker(n=256, cells=4):
    y, x = np.mgrid[0:n, 0:n] / n * cells
    s = ((np.floor(x) + np.floor(y)) % 2).astype(bool)
    wear = fbm(n, 1.2, 111)
    c = np.where(s[..., None], colour((0.62, 0.62, 0.58), n), colour((0.02, 0.02, 0.02), n))
    c = mix(c, colour((0.15, 0.14, 0.12), n), smooth(wear, 0.65, 0.8))
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), np.full((n, n), 0.8), np.zeros((n, n)))}


def foliage(n=256):
    a = fbm(n, 0.8, 121)
    b = fbm(n, 1.6, 122)
    c = mix(colour((0.012, 0.030, 0.026), n), colour((0.035, 0.065, 0.045), n), a * 0.7 + b * 0.3)
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), np.full((n, n), 0.9), np.zeros((n, n)))}


def haze(n=256):
    """Soft fog card: radial falloff with wispy noise in the alpha."""
    y, x = (np.mgrid[0:n, 0:n] / n - 0.5) * 2
    r = np.sqrt(x ** 2 + y ** 2)
    a = np.clip(1 - r, 0, 1) ** 1.5 * (0.55 + 0.45 * fbm(n, 1.6, 131))
    c = colour((0.35, 0.55, 0.55), n)
    return {"BC": np.dstack([srgb(c), a * 0.8])}


# set name -> (generator, {map: output size})
SETS = {
    "T_Asphalt_Wet": (asphalt, {"BC": 1024, "ORM": 512, "N": 1024}),
    "T_Concrete_Weathered": (concrete, {"BC": 1024, "ORM": 512, "N": 512}),
    "T_Metal_RustPaint": (rust_paint, {"BC": 1024, "ORM": 512, "N": 512}),
    "T_Steel_Dark": (steel_dark, {"BC": 512, "ORM": 512, "N": 512}),
    "T_Steel_Galvanised": (steel_new, {"BC": 512, "ORM": 256, "N": 256}),
    "T_ChainLink": (chain_link, {"BC": 512, "ORM": 256}),
    "T_Wood_Weathered": (wood, {"BC": 512, "ORM": 256, "N": 512}),
    "T_Ground_DirtGrass": (dirt_grass, {"BC": 1024, "ORM": 512, "N": 512}),
    "T_Paint_Worn": (paint_worn, {"BC": 256, "ORM": 256}),
    "T_Stripes_Hazard": (stripes, {"BC": 256, "ORM": 256}),
    "T_Stripes_Barrier": (lambda: stripes(256, (0.55, 0.03, 0.02), (0.6, 0.6, 0.56), 102), {"BC": 256, "ORM": 256}),
    "T_Checker_Finish": (checker, {"BC": 256, "ORM": 256}),
    "T_Foliage": (foliage, {"BC": 256, "ORM": 256}),
    "T_Haze": (haze, {"BC": 256}),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    inventory = {}
    for name, (gen, sizes) in SETS.items():
        maps = gen()
        inventory[name] = {}
        for key, size in sizes.items():
            arr = maps[key]
            mode = "RGBA" if arr.shape[2] == 4 else "RGB"
            inventory[name][key] = save(f"{name}_{key}", arr, size, mode)
    (OUT / "TEXTURES.json").write_text(json.dumps(inventory, indent=2) + "\n")
    print("Wrote", len(SETS), "texture sets to", OUT.relative_to(ROOT))


if __name__ == "__main__":
    sys.exit(main())
