"""Procedural, tileable texture sets for THE WATCHER (Prompt 06, decision 023).

Original textures from seeded noise (helpers shared with stage_01_textures.py): no photos and no
concept-art crops. Output: blender/textures/WATCHER/*.png (Git LFS), WebP inside the GLB.
Palette is deliberately not the yellow/orange of the retired doll concept: ivory porcelain, deep teal
enamel, aged brass, dark steel, charcoal-indigo textile, lacquered dark hair.

    python blender/scripts/watcher_textures.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stage_01_textures as t  # noqa: E402
from stage_01_textures import fbm, ridges, smooth, mix, colour, normal_from_height, srgb, orm  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "blender/textures/WATCHER"


def porcelain(n=1024):
    base = fbm(n, 1.6, 201)
    fine = fbm(n, 0.4, 202)
    cracks = np.maximum(ridges(n, 203, 0.012, 1.8) * smooth(fbm(n, 2.2, 204), 0.55, 0.7),
                        ridges(n, 205, 0.008, 1.4) * smooth(fbm(n, 2.0, 206), 0.62, 0.75) * 0.7)
    grime = smooth(fbm(n, 1.9, 207), 0.55, 0.85)
    c = colour((0.62, 0.56, 0.46), n)  # aged ivory
    c = mix(c, colour((0.72, 0.67, 0.57), n), base * 0.5)
    c = mix(c, colour((0.30, 0.24, 0.17), n), grime * 0.45)
    c = mix(c, colour((0.10, 0.08, 0.06), n), cracks)
    c *= (0.95 + 0.08 * fine)[..., None]
    rough = 0.32 + 0.35 * grime + 0.1 * fine + 0.3 * cracks
    h = base * 0.2 + fine * 0.15 - cracks * 0.9
    return {"BC": srgb(c), "ORM": orm(1 - cracks * 0.6, rough, np.zeros((n, n))), "N": normal_from_height(h, 5.0)}


def enamel_teal(n=1024):
    chips = fbm(n, 1.5, 211)
    worn = smooth(chips, 0.72, 0.76)
    iron = fbm(n, 0.9, 212)
    fine = fbm(n, 0.3, 213)
    streak = smooth(fbm(n, 1.2, 214, aniso=(1, 14.0)), 0.62, 0.92)
    paint = mix(colour((0.010, 0.055, 0.060), n), colour((0.022, 0.085, 0.088), n), fbm(n, 1.8, 215))
    paint = mix(paint, colour((0.015, 0.03, 0.03), n), streak * 0.5)  # grime run-off
    metal = mix(colour((0.08, 0.07, 0.065), n), colour((0.15, 0.08, 0.045), n), iron)
    c = mix(paint, metal, worn)
    c *= (0.9 + 0.2 * fine)[..., None]
    rough = mix(0.38 + 0.12 * fine, 0.75 + 0.1 * iron, worn)
    h = (1 - worn) * 0.4 + fine * 0.12
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), rough, worn * 0.6), "N": normal_from_height(h, 4.0)}


def brass(n=512):
    a = fbm(n, 1.2, 221)
    tarnish = smooth(fbm(n, 1.7, 222), 0.5, 0.8)
    scratch = fbm(n, 0.6, 223, aniso=(0.05, 1.0))
    c = mix(colour((0.55, 0.38, 0.14), n), colour((0.68, 0.50, 0.22), n), a)
    c = mix(c, colour((0.12, 0.13, 0.08), n), tarnish * 0.6)  # dark green-brown tarnish
    rough = 0.3 + 0.35 * tarnish + 0.1 * smooth(scratch, 0.6, 0.8)
    h = a * 0.2 + scratch * 0.2
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), rough, 0.95 - 0.4 * tarnish), "N": normal_from_height(h, 2.0)}


def steel(n=512):
    a = fbm(n, 1.3, 231)
    oil = smooth(fbm(n, 1.9, 232), 0.6, 0.85)
    fine = fbm(n, 0.2, 233)
    c = mix(colour((0.05, 0.055, 0.06), n), colour((0.10, 0.105, 0.11), n), a)
    c = mix(c, colour((0.02, 0.02, 0.02), n), oil * 0.6)
    rough = 0.42 + 0.2 * a - 0.15 * oil
    h = a * 0.25 + fine * 0.15
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), rough, np.full((n, n), 0.85)), "N": normal_from_height(h, 2.5)}


def rubber(n=256):
    a = fbm(n, 0.8, 241)
    c = colour((0.018, 0.018, 0.02), n) * (0.85 + 0.3 * a)[..., None]
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), 0.75 + 0.15 * a, np.zeros((n, n))), "N": normal_from_height(a, 2.0)}


def textile(n=512, threads=64):
    y, x = np.mgrid[0:n, 0:n] / n * threads
    weave = (np.sin(x * np.pi * 2) * np.sin(y * np.pi * 2) > 0).astype(float)
    wear = smooth(fbm(n, 1.5, 251), 0.6, 0.8)
    a = fbm(n, 1.0, 252)
    c = mix(colour((0.035, 0.04, 0.065), n), colour((0.06, 0.065, 0.095), n), weave * 0.6 + a * 0.4)  # charcoal indigo
    c = mix(c, colour((0.11, 0.10, 0.10), n), wear * 0.5)
    h = weave * 0.5 + a * 0.2
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), 0.85 + 0.1 * a, np.zeros((n, n))), "N": normal_from_height(h, 3.0)}


def hair_lacquer(n=512, grooves=40):
    y, x = np.mgrid[0:n, 0:n] / n
    g = np.sin((x * grooves + fbm(n, 1.4, 261) * 6) * np.pi * 2) * 0.5 + 0.5
    wear = smooth(fbm(n, 1.6, 262), 0.65, 0.8)
    c = mix(colour((0.008, 0.006, 0.006), n), colour((0.022, 0.015, 0.012), n), g)
    c = mix(c, colour((0.05, 0.04, 0.03), n), wear * 0.35)
    rough = 0.2 + 0.12 * g + 0.25 * wear
    return {"BC": srgb(c), "ORM": orm(np.ones((n, n)), rough, np.zeros((n, n))), "N": normal_from_height(g * 0.6, 0.8)}


SETS = {
    "T_W_Porcelain": (porcelain, {"BC": 1024, "ORM": 512, "N": 1024}),
    "T_W_EnamelTeal": (enamel_teal, {"BC": 1024, "ORM": 512, "N": 512}),
    "T_W_Brass": (brass, {"BC": 512, "ORM": 256, "N": 256}),
    "T_W_SteelDark": (steel, {"BC": 512, "ORM": 256, "N": 512}),
    "T_W_Rubber": (rubber, {"BC": 256, "ORM": 256, "N": 256}),
    "T_W_Textile": (textile, {"BC": 512, "ORM": 256, "N": 512}),
    "T_W_HairLacquer": (hair_lacquer, {"BC": 512, "ORM": 256, "N": 512}),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    t.OUT = OUT
    inv = {}
    for name, (gen, sizes) in SETS.items():
        maps = gen()
        inv[name] = {k: t.save(f"{name}_{k}", maps[k], s, "RGBA" if maps[k].shape[2] == 4 else "RGB") for k, s in sizes.items()}
    (OUT / "TEXTURES.json").write_text(json.dumps(inv, indent=2) + "\n")
    print("Wrote", len(SETS), "texture sets to", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
