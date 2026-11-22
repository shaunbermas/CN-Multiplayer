"""CN TRIAL Stage 1.5 (Prompt 02): layout of the matte-painting layers and distant tree cutouts.

Inputs (all existing, approved data):
  blender/exports/STAGE_01_METADATA.json        course centre (BOUNDARY_PLAYABLE_AREA) and playable box
  blender/stage15/STAGE_01_SCENERY_ZONES.json   scenery footprints exported from the Prompt 05 scene
  blender/exports/stage15/_generated.json       texture list and tree-atlas cells (generate_matte.py)
Output:
  blender/exports/stage15/STAGE_01_MATTE_PAINTING_MANIFEST.json  (read by the game at runtime)

Coordinates are game metres (Y up, course toward -Z). Cutouts and matte layers are scenery only: no
collision, never inside the yard or on top of existing scenery. Deterministic (fixed seed).
Usage: python tools/stage15/place_surroundings.py
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
META = json.loads((ROOT / "blender/exports/STAGE_01_METADATA.json").read_text())
ZONES = json.loads((ROOT / "blender/stage15/STAGE_01_SCENERY_ZONES.json").read_text())
GEN = json.loads((ROOT / "blender/exports/stage15/_generated.json").read_text())
OUT = ROOT / "blender/exports/stage15/STAGE_01_MATTE_PAINTING_MANIFEST.json"

play = next(b for b in META["movementBoundaries"] if b["id"] == "BOUNDARY_PLAYABLE_AREA")
centre = [play["position"]["x"], 0.0, -play["position"]["y"]]  # Blender (x, y) -> game (x, -y)

# ---------------------------------------------------------------- exclusion
def grow(box, m):
    return {"min": [box["min"][0] - m, box["min"][2] - m], "max": [box["max"][0] + m, box["max"][2] + m]}


col = ZONES["collections"]
yard = {"min": [min(col[c]["min"][0] for c in ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_FOLIAGE", "VISUAL_MACHINERY")),
                0, min(col[c]["min"][2] for c in ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_FOLIAGE", "VISUAL_MACHINERY"))],
        "max": [max(col[c]["max"][0] for c in ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_FOLIAGE", "VISUAL_MACHINERY")),
                0, max(col[c]["max"][2] for c in ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_FOLIAGE", "VISUAL_MACHINERY"))]}
exclude = [("yard", grow(yard, 10))]
for z in ZONES["scenery_zones"]:
    if z["id"].startswith("STG01_BG_Ground"):
        continue
    exclude.append((z["id"], grow(z, 7)))
ground = next(z for z in ZONES["scenery_zones"] if z["id"].startswith("STG01_BG_Ground"))
bounds = grow(ground, -12)  # stay on the far ground plane


def blocked(x, z):
    return any(b["min"][0] <= x <= b["max"][0] and b["min"][1] <= z <= b["max"][1] for _, b in exclude)


# ---------------------------------------------------------------- distant tree cutouts
rng = random.Random(1505)
cells = GEN["tree_cells"]
kinds = {c["kind"]: c["index"] for c in cells}
conifers = [kinds[k] for k in kinds if k.startswith("conifer")]
broad = [kinds[k] for k in kinds if k.startswith("broadleaf")]
dead = [kinds[k] for k in kinds if k.startswith("dead")]


def patch(x, z):
    """Smooth forest-density field in [0, 1] (sum of a few sines), giving copses and clearings."""
    v = (math.sin(x * 0.021 + 1.3) + math.sin(z * 0.017 - 0.4) + math.sin((x + z) * 0.012 + 2.1) + math.sin((x - z) * 0.031 + 0.7)) / 4
    return 0.5 + 0.5 * v


instances = []
tries = 0
TARGET = 1100
while len(instances) < TARGET and tries < 120000:
    tries += 1
    x = rng.uniform(bounds["min"][0], bounds["max"][0])
    z = rng.uniform(bounds["min"][1], bounds["max"][1])
    if blocked(x, z):
        continue
    d = math.hypot(x - centre[0], z - centre[2])
    # sparse near the yard (midground reads as scattered trees), denser toward the far edge (forest)
    p = patch(x, z) ** 1.6 * min(1.0, 0.25 + d / 260)
    if rng.random() > p:
        continue
    if any((x - i["pos"][0]) ** 2 + (z - i["pos"][2]) ** 2 < 4.5 ** 2 for i in instances[-160:]):
        continue
    r = rng.random()
    cell = rng.choice(dead) if r < 0.06 else rng.choice(broad) if r < 0.26 else rng.choice(conifers)
    kind = cells[cell]["kind"]
    h = rng.uniform(7, 11) if kind.startswith("dead") else rng.uniform(8, 13) if kind.startswith("broadleaf") else rng.uniform(10, 20)
    instances.append({
        "pos": [round(x, 2), 0, round(z, 2)], "height": round(h, 2), "cell": cell,
        # per-instance variation: value and slight hue shift, mirrored or not, quality rank
        "tint": [round(rng.uniform(0.82, 1.08), 3), round(rng.uniform(0.92, 1.06), 3), round(rng.uniform(0.9, 1.08), 3)],
        "flip": rng.random() < 0.5, "rank": round(rng.random(), 3),
    })

# ---------------------------------------------------------------- matte layers (cylinders around the course)
layers = [
    {"id": "MP_FarHills", "texture": GEN["layers"]["MP_FarHills"]["runtime"], "radius": 1150, "height": 340, "bottom": -40, "order": 0,
     "role": "distant hills and mountain ridges", "uOffset": 0.13, "brightness": 0.42},
    {"id": "MP_IndustrialSkyline", "texture": GEN["layers"]["MP_IndustrialSkyline"]["runtime"], "radius": 760, "height": 230, "bottom": -30, "order": 1,
     "role": "factory skyline, cranes, truss bridge, pylons", "uOffset": 0.0, "brightness": 0.62},
    {"id": "MP_ForestLine", "texture": GEN["layers"]["MP_ForestLine"]["runtime"], "radius": 470, "height": 64, "bottom": -6, "order": 2,
     "role": "continuous forest / tree line", "uOffset": 0.37, "brightness": 0.7},
]

manifest = {
    "stage": META["stageId"],
    "generator": ["tools/stage15/generate_matte.py", "tools/stage15/place_surroundings.py"],
    "coordinates": "game metres: Y up, course toward -Z; u = 0 of each layer faces +Z (behind the start), increasing toward +X",
    "colorSpace": "sRGB textures, painted with distance haze; rendered unlit, untone-mapped, without scene fog; brightness = night exposure multiplier per layer (Prompt 04 sky)",
    "licensing": "Original procedural artwork generated by the project's own scripts with fixed seeds. No photographs, "
                 "third-party images, AI-generated images or character references were used.",
    "collision": "none (decorative scenery only)",
    "centre": centre,
    "layers": layers,
    "cutouts": {
        "atlas": GEN["layers"]["TREE_Cutout_Atlas"]["runtime"], "grid": [4, 2], "cells": cells,
        "rendering": "cylindrical billboards (rotate about Y to face the camera), alpha clip 0.5, one instanced draw call",
        "qualityFraction": {"low": 0.4, "medium": 0.7, "high": 1.0},
        "lodRules": "within the yard and up to 10 m outside it: 3D trees (Prompt 03); beyond: these cutouts; past ~470 m: the forest matte layer",
        "instances": instances,
    },
    "exclusions": [{"id": i, **b} for i, b in exclude],
    "sources": {"textures": GEN["layers"]},
}
OUT.write_text(json.dumps(manifest, indent=1))
print(f"{len(instances)} cutouts placed ({tries} tries), centre {centre}, {len(exclude)} exclusion boxes")
