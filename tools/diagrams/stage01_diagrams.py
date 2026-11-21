"""Draw to-scale Stage 01 layout diagrams (top plan, front elevation, side section) as SVG.

Reads the gameplay values from blender/scripts/specs/stg01_greybox.json and the proposed environment
from blender/scripts/specs/stg01_design_layout.json, so the diagrams always match the specs.

    python3 tools/diagrams/stage01_diagrams.py        # writes docs/diagrams/STG01_*.svg
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
G = json.loads((ROOT / "blender/scripts/specs/stg01_greybox.json").read_text())
L = json.loads((ROOT / "blender/scripts/specs/stg01_design_layout.json").read_text())
OUT = ROOT / "docs/diagrams"

INK, MUTED, FIELD, LINE = "#1f2430", "#6b7280", "#e8e2d6", "#ffffff"
ACCENT, SIGNAL, COVER, PROPOSED = "#c2410c", "#0f766e", "#0f766e22", "#7c3aed"

W2 = G["width"] / 2
L_COURSE = G["course_length"]
Y_FIN_END = L_COURSE + G["finish_trigger_depth"]
Y_BACK = Y_FIN_END + G["safe_zone_depth"]
SH = G["shepherd"]
HEAD_R = SH["height"] * 0.14
HEAD_Z = SH["platform_height"] + (SH["height"] - 2 * HEAD_R) + HEAD_R
START_NOW = -G["start_zone_depth"]
START_NEW = -L["start_zone_depth_proposed"]


def spawns():
    sp = G["spawns"]
    xs = [(i - (sp["columns"] - 1) / 2) * sp["spacing_x"] for i in range(sp["columns"])]
    order = sorted(xs, key=lambda x: (abs(x), x))
    return [(x, y) for y in sp["row_y"] for x in order]


class Svg:
    def __init__(self, w, h, title):
        self.w, self.h, self.items = w, h, []
        self.items.append(f'<rect width="{w}" height="{h}" fill="#fbfaf7"/>')
        self.text(16, 26, title, 16, INK, weight=700)

    def add(self, s):
        self.items.append(s)

    def rect(self, x, y, w, h, fill="none", stroke=INK, sw=1, dash=None, op=1):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d} opacity="{op}"/>')

    def line(self, x1, y1, x2, y2, stroke=INK, sw=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def circle(self, x, y, r, fill="none", stroke=INK, sw=1):
        self.add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def poly(self, pts, fill="none", stroke=INK, sw=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        self.add(f'<polygon points="{p}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=11, fill=INK, anchor="start", weight=400):
        s = s.replace("&", "&amp;").replace("<", "&lt;")
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="system-ui,Segoe UI,sans-serif" font-size="{size}" fill="{fill}" text-anchor="{anchor}" font-weight="{weight}">{s}</text>')

    def save(self, name):
        OUT.mkdir(parents=True, exist_ok=True)
        body = "\n".join(self.items)
        (OUT / name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}">\n{body}\n</svg>\n')


# ------------------------------------------------------------------ top plan
def top_plan():
    k, xmin, xmax, ymin, ymax = 2.4, -100, 100, -55, 270
    pad_l, pad_t = 30, 70
    W, H = int((xmax - xmin) * k) + 300, int((ymax - ymin) * k) + 90
    s = Svg(W, H, "Stage 01 top plan (proposed, metres; north = toward The Shepherd)")
    X = lambda x: pad_l + (x - xmin) * k
    Y = lambda y: pad_t + (ymax - y) * k
    # backdrop
    ov = L["backdrop"]["overpass"]
    oy1, oy0 = min(ov["y1"], ymax), max(ov["y0"], ymin)
    s.rect(X(ov["x"] - ov["width"] / 2), Y(oy1), ov["width"] * k, (oy1 - oy0) * k, "#d4d4d8", MUTED)
    s.text(X(ov["x"] - ov["width"] / 2), Y(oy0) + 14, "elevated roadway (backdrop, 14 m deck)", 10, MUTED)
    tl = L["backdrop"]["tree_line_north"]
    for x in range(int(tl["x0"]), int(tl["x1"]), 7):
        s.circle(X(x), Y(tl["y"]), 2.6 * k, "#a3b8a5", "none")
    tw = L["backdrop"]["tree_line_west"]
    for y in range(int(tw["y0"]), int(tw["y1"]), 8):
        s.circle(X(tw["x"]), Y(y), 2.6 * k, "#a3b8a5", "none")
    wt = L["backdrop"]["water_tower"]
    s.circle(X(wt["x"]), Y(wt["y"]), wt["tank_r"] * k, "#cbd5e1", MUTED)
    s.text(X(wt["x"]), Y(wt["y"]) + 4, "water tower", 10, MUTED, "middle")
    ob = L["perimeter"]["outer_barrier"]
    s.rect(X(-ob["x"]), Y(ob["y1"]), 2 * ob["x"] * k, (ob["y1"] - ob["y0"]) * k, "none", MUTED, 1.2, "6 4")
    s.text(X(ob["x"]) - 4, Y(ob["y1"]) + 14, "outer barrier", 10, MUTED, "end")
    # playground relics (west margin)
    for p in L["playground_relics"]:
        s.rect(X(p["x"] - p["w"] / 2), Y(p["y"] + p["d"] / 2), p["w"] * k, p["d"] * k, "#e9d5ff", PROPOSED)
    # yard
    s.rect(X(-W2), Y(Y_BACK), G["width"] * k, (Y_BACK - START_NOW) * k, FIELD, INK, 1.5)
    s.rect(X(-W2), Y(START_NOW), G["width"] * k, (START_NOW - START_NEW) * k, "#ede9fe", PROPOSED, 1, "4 3")
    s.text(X(0), Y(START_NEW) + 12, "proposed: start zone 15 m deep (now 12 m)", 10, PROPOSED, "middle")
    for i in range(1, int(G["width"] // G["lane_spacing"])):
        x = -W2 + i * G["lane_spacing"]
        s.line(X(x), Y(L_COURSE), X(x), Y(0), "#c8c0b0", 0.8)
    s.rect(X(-W2), Y(Y_FIN_END), G["width"] * k, G["finish_trigger_depth"] * k, "#fed7aa", ACCENT)
    s.rect(X(-W2), Y(Y_BACK), G["width"] * k, G["safe_zone_depth"] * k, "#d1fae5", SIGNAL)
    s.text(X(0), Y(Y_BACK) + 14, "SAFE ZONE (immune)", 10, SIGNAL, "middle", 700)
    s.text(X(0), Y(L_COURSE) - 3, "FINISH LINE  Y 160", 10, ACCENT, "middle", 700)
    s.line(X(-W2), Y(0), X(W2), Y(0), INK, 2)
    s.text(X(0), Y(0) - 4, "START LINE  Y 0", 10, INK, "middle", 700)
    for i, (x, y) in enumerate(spawns(), 1):
        s.circle(X(x), Y(y), 2.2, ACCENT if i == 1 else INK, "none")
    s.text(X(W2) + 6, Y(-4.5) + 4, "30 spawns", 10)
    # observation and towers
    ga = L["observation"]["gantry_east"]
    s.rect(X(ga["x"] - ga["width"] / 2), Y(ga["y1"]), ga["width"] * k, (ga["y1"] - ga["y0"]) * k, "#fde68a", INK)
    s.text(X(ga["x"]) + 12, Y((ga["y0"] + ga["y1"]) / 2), "spectator gantry", 10)
    jb = L["observation"]["judges_booth"]
    s.rect(X(jb["x"] - jb["w"] / 2), Y(jb["y"] + jb["d"] / 2), jb["w"] * k, jb["d"] * k, "#fde68a", INK)
    s.text(X(jb["x"]) + 16, Y(jb["y"]) + 4, "judges' booth", 10)
    be = L["observation"]["benches_east"]
    y = be["y0"]
    while y <= be["y1"]:
        s.rect(X(be["x"] - 0.4), Y(y + 2), 0.8 * k, 4 * k, MUTED, "none")
        y += be["spacing"]
    ft = L["floodlight_towers"]
    for side in (-1, 1):
        for y in ft["ys"]:
            s.rect(X(side * ft["x"]) - 4, Y(y) - 4, 8, 8, "#fbbf24", INK)
    s.text(X(-ft["x"]), Y(ft["ys"][-1]) - 8, "floodlight towers (22 m)", 10, INK, "middle")
    # Shepherd + coverage cone (presentation: covers the whole field)
    hx, hy = SH["x"], SH["y"]
    cone = 55
    far = (SH["y"] - START_NEW) / math.cos(math.radians(cone)) + 10  # reaches the start-zone corners
    p1 = (hx - far * math.sin(math.radians(cone)), hy - far * math.cos(math.radians(cone)))
    p2 = (hx + far * math.sin(math.radians(cone)), hy - far * math.cos(math.radians(cone)))
    # Clip the 110° wedge to the yard: the scan covers every part of the playable area.
    s.add(f'<clipPath id="yard"><rect x="{X(-W2):.1f}" y="{Y(Y_BACK):.1f}" width="{G["width"] * k:.1f}" height="{(Y_BACK - START_NEW) * k:.1f}"/></clipPath>')
    s.add('<g clip-path="url(#yard)">')
    s.poly([(X(hx), Y(hy)), (X(p1[0]), Y(p1[1])), (X(p2[0]), Y(p2[1]))], COVER, SIGNAL, 1, "5 4")
    s.add('</g>')
    for ex, ey in ((-W2, L_COURSE), (W2, L_COURSE)):
        s.line(X(hx), Y(hy), X(ex), Y(ey), SIGNAL, 1, "5 4")
    ps = SH["platform_size"]
    s.rect(X(hx - ps / 2), Y(hy + ps / 2), ps * k, ps * k, "#94a3b8", INK, 1.5)
    s.circle(X(hx), Y(hy), 3.6 * k, ACCENT, INK)
    s.text(X(hx) + 22, Y(hy) - 6, "THE SHEPHERD (faces south)", 11, ACCENT, "start", 700)
    s.text(X(hx) + 22, Y(hy) + 8, "scan coverage 110°", 10, SIGNAL)
    s.line(X(-W2), Y(Y_BACK), X(W2), Y(Y_BACK), INK, 2)
    # cameras
    for name, c in L["cameras"].items():
        if name == "CAM_STG01_Overview":
            continue
        px, py = c["pos"][0], c["pos"][1]
        if not (xmin < px < xmax and ymin < py < ymax):
            continue
        s.poly([(X(px), Y(py) - 5), (X(px) - 4, Y(py) + 4), (X(px) + 4, Y(py) + 4)], "#2563eb", "none")
        dx = -6 if name.endswith(("Gameplay", "Spectator_02")) else 6
        s.text(X(px) + dx, Y(py) + (14 if name.endswith("Gameplay") else 3), name.replace("CAM_STG01_", ""), 9, "#2563eb", "end" if dx < 0 else "start")
    # axes, scale, legend
    s.text(X(0), H - 12, "X = 0", 10, MUTED, "middle")
    s.line(X(-W2), H - 30, X(-W2 + 50), H - 30, INK, 3)
    s.text(X(-W2), H - 36, "50 m", 10)
    lx = W - 260
    for i, (col, label) in enumerate([
        (FIELD, "playable yard 60 m x 184 m"), ("#fed7aa", "finish trigger (qualify)"), ("#d1fae5", "safe zone"),
        ("#ede9fe", "proposed change"), ("#fde68a", "observation structures"), ("#e9d5ff", "playground relics (no collision inside yard)"),
        (COVER, "Shepherd scan coverage"), ("#fbbf24", "floodlight tower"), ("#2563eb", "camera viewpoint"),
    ]):
        s.rect(lx, 60 + i * 20, 14, 12, col, INK, 0.6)
        s.text(lx + 20, 70 + i * 20, label, 10)
    s.save("STG01_top_plan.svg")


# ------------------------------------------------------------------ front elevation
def front_elevation():
    k, xmin, xmax, zmax = 5.0, -95, 95, 46
    W, H = int((xmax - xmin) * k) + 60, int(zmax * k) + 120
    gy = H - 50
    s = Svg(W, H, "Stage 01 front elevation, seen from the start zone looking north (heights to scale, depth flattened)")
    X = lambda x: 30 + (x - xmin) * k
    Z = lambda z: gy - z * k
    s.line(X(xmin), Z(0), X(xmax), Z(0), INK, 1.5)
    # backdrop
    for sil in G["greybox_visual"]["silhouettes"]:
        if xmin < sil["x"] < xmax:
            s.rect(X(sil["x"] - sil["w"] / 2), Z(min(sil["h"], zmax)), sil["w"] * k, min(sil["h"], zmax) * k, "#e5e7eb", "none")
    ov = L["backdrop"]["overpass"]
    s.rect(X(ov["x"] - ov["width"] / 2), Z(ov["deck_z"] + 1.5), ov["width"] * k, 1.5 * k, "#a1a1aa", INK)
    s.rect(X(ov["x"] - 1), Z(ov["deck_z"]), 2 * k, ov["deck_z"] * k, "#a1a1aa", "none")
    s.text(X(ov["x"]), Z(ov["deck_z"] + 3), "roadway 14 m", 10, MUTED, "middle")
    wt = L["backdrop"]["water_tower"]
    s.rect(X(wt["x"] - 0.6), Z(wt["tank_z"]), 1.2 * k, wt["tank_z"] * k, "#94a3b8", "none")
    s.rect(X(wt["x"] - wt["tank_r"]), Z(wt["tank_z"] + 9), 2 * wt["tank_r"] * k, 9 * k, "#cbd5e1", INK)
    s.text(X(wt["x"]), Z(wt["tank_z"] + 11), "water tower ~39 m", 10, MUTED, "middle")
    # towers, gantry, booth
    ft = L["floodlight_towers"]
    for side in (-1, 1):
        x = side * ft["x"]
        s.rect(X(x - 0.5), Z(ft["height"]), 1 * k, ft["height"] * k, "#9ca3af", INK)
        s.rect(X(x - ft["head_w"] / 2), Z(ft["height"] + 1.5), ft["head_w"] * k, 1.5 * k, "#fbbf24", INK)
    s.text(X(-ft["x"]), Z(ft["height"] + 3), "floodlights 22 m", 10, INK, "middle")
    ga = L["observation"]["gantry_east"]
    s.rect(X(ga["x"] - ga["width"] / 2), Z(ga["roof_z"]), ga["width"] * k, (ga["roof_z"] - ga["deck_z"]) * k, "#fde68a", INK)
    s.rect(X(ga["x"] - ga["width"] / 2), Z(ga["deck_z"]), ga["width"] * k, ga["deck_z"] * k, "none", INK, 1, "3 3")
    s.text(X(ga["x"]), Z(ga["roof_z"] + 1.5), "gantry", 10, INK, "middle")
    for p in L["playground_relics"]:
        if p["id"].endswith("RocketFrame_A"):
            s.poly([(X(p["x"] - 3), Z(0)), (X(p["x"] + 3), Z(0)), (X(p["x"]), Z(p["h"]))], "#e9d5ff", PROPOSED)
            s.text(X(p["x"]), Z(p["h"] + 1.5), "rocket frame 16 m", 10, PROPOSED, "middle")
    # fence and finish gate
    s.rect(X(-W2), Z(3), G["width"] * k, 3 * k, "none", MUTED, 1, "2 3")
    fg = L["finish_gate"]
    for side in (-1, 1):
        s.rect(X(side * fg["post_x"] - 0.6), Z(fg["height"]), 1.2 * k, fg["height"] * k, "#9ca3af", INK)
    s.rect(X(-fg["post_x"] - 0.6), Z(fg["height"]), (2 * fg["post_x"] + 1.2) * k, 1.2 * k, "#9ca3af", INK)
    s.text(X(-fg["post_x"]) + 4, Z(fg["height"]) - 4, "finish gate 9 m (beam below the sightline)", 10, INK)
    # Shepherd option A
    pz = SH["platform_height"]
    s.rect(X(-SH["platform_size"] / 2), Z(pz), SH["platform_size"] * k, pz * k, "#94a3b8", INK)
    body_h = SH["height"] - 2 * HEAD_R
    s.rect(X(-SH["height"] * 0.13), Z(pz + body_h), 2 * SH["height"] * 0.13 * k, body_h * k, "#fdba74", ACCENT, 1.5)
    s.circle(X(0), Z(HEAD_Z), HEAD_R * k, "#fdba74", ACCENT, 1.5)
    s.text(X(0) + HEAD_R * k + 8, Z(HEAD_Z), f"The Shepherd: 28 m on a 4 m platform (head centre {HEAD_Z:.1f} m)", 11, ACCENT, "start", 700)
    # option B outline
    tb = L["shepherd_option_b_tower"]
    s.poly([(X(-tb["base"] / 2), Z(0)), (X(tb["base"] / 2), Z(0)), (X(1.5), Z(tb["height"])), (X(-1.5), Z(tb["height"]))], "none", PROPOSED, 1.2, "6 4")
    s.text(X(-tb["base"] / 2) - 6, Z(tb["height"] - 2), "option B: cage tower 34 m", 10, PROPOSED, "end")
    # scale figure
    s.rect(X(-W2 + 4), Z(1.2), 0.6 * k, 1.2 * k, INK, "none")
    s.text(X(-W2 + 7), Z(1.4), "contestant 1.2 m", 10, INK)
    for z in (10, 20, 30, 40):
        s.line(X(xmin), Z(z), X(xmin) + 8, Z(z), MUTED)
        s.text(X(xmin) + 12, Z(z) + 4, f"{z} m", 9, MUTED)
    s.save("STG01_front_elevation.svg")


# ------------------------------------------------------------------ side section
def side_section():
    k, kz, ymin, ymax, zmax = 3.2, 9.0, -25, 210, 36
    W, H = int((ymax - ymin) * k) + 80, int(zmax * kz) + 120
    gy = H - 50
    s = Svg(W, H, "Stage 01 side section along X = 0 (vertical scale exaggerated x2.8) with sightlines to The Shepherd")
    Y = lambda y: 40 + (y - ymin) * k
    Z = lambda z: gy - z * kz
    s.line(Y(ymin), Z(0), Y(ymax), Z(0), INK, 1.5)
    s.rect(Y(START_NEW), Z(0.4), (START_NOW - START_NEW) * k, 0.4 * kz, "#ede9fe", PROPOSED)
    s.rect(Y(START_NOW), Z(0.4), (0 - START_NOW) * k, 0.4 * kz, "#e5e7eb", INK)
    s.text(Y(START_NOW / 2), Z(0) + 16, "start zone", 10, INK, "middle")
    s.rect(Y(L_COURSE), Z(3), G["finish_trigger_depth"] * k, 3 * kz, "#fed7aa", ACCENT)
    s.rect(Y(Y_FIN_END), Z(3), G["safe_zone_depth"] * k, 3 * kz, "#d1fae5", SIGNAL)
    s.text(Y(L_COURSE), Z(0) + 16, "finish 160", 10, ACCENT, "middle")
    s.line(Y(Y_BACK), Z(0), Y(Y_BACK), Z(3), INK, 2)
    fg = L["finish_gate"]
    s.line(Y(fg["y"]), Z(0), Y(fg["y"]), Z(fg["height"]), INK, 2)
    s.text(Y(fg["y"]) - 4, Z(fg["height"]) - 4, "gate 9 m", 10, INK, "end")
    s.rect(Y(SH["y"] - SH["platform_size"] / 2), Z(SH["platform_height"]), SH["platform_size"] * k, SH["platform_height"] * kz, "#94a3b8", INK)
    body_h = SH["height"] - 2 * HEAD_R
    s.rect(Y(SH["y"] - 2), Z(SH["platform_height"] + body_h), 4 * k, body_h * kz, "#fdba74", ACCENT)
    s.circle(Y(SH["y"]), Z(HEAD_Z), HEAD_R * k, "#fdba74", ACCENT)
    s.text(Y(SH["y"]) - 10, Z(SH["platform_height"] + SH["height"]) - 8, "The Shepherd", 11, ACCENT, "end", 700)
    # sightlines
    for y0, label, eye in ((G["spawns"]["row_y"][0], "front row eye 1.0 m", 1.0), (G["spawns"]["row_y"][-1], "back row eye 1.0 m", 1.0), (-7.5, "camera 3.0 m", 3.0)):
        s.line(Y(y0), Z(eye), Y(SH["y"]), Z(HEAD_Z), SIGNAL if eye == 1.0 else "#2563eb", 1, "5 4")
    s.text(Y(60), Z(9.6), "sightlines clear the finish gate by ~15 m", 10, SIGNAL)
    for y in (0, 40, 80, 120, 160, 200):
        s.text(Y(y), H - 18, f"Y {y}", 9, MUTED, "middle")
    for z in (10, 20, 30):
        s.text(Y(ymin) + 4, Z(z) + 4, f"{z} m", 9, MUTED)
    s.save("STG01_side_section.svg")


if __name__ == "__main__":
    top_plan()
    front_elevation()
    side_section()
    print("wrote", ", ".join(p.name for p in sorted(OUT.glob("STG01_*.svg"))))
