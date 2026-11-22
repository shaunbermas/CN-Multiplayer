"""CN TRIAL shared contestant: the procedural garment and body generator (no bpy needed here).

Every part is a parametric surface built from the same functions at any resolution, so LOD0, LOD1 and
LOD2 share one UV layout (the atlas below) and the same regions. Units are metres, Blender axes:
Z up, the character faces -Y, its left hand is on +X. Ground at Z 0, total height 1.235 m.

Each Part carries outer faces with atlas UVs and a colour REGION per face (the 30 colourways recolour
regions; geometry never changes). Parts with `thick` get an inner lining and rims (solidified in
Blender); `rim_region` lets a rim read as piping in the trim or accent colour.

Design notes: docs/stage15/CONTESTANT_CHARACTER_SPEC.md. The coat is the signature: a two-panel shell
with a centre-back seam and vent, A-line opening below a cinched belt, V opening with peaked lapels
above it, raised two-sided collar, back yoke, storm flap, epaulettes, patch pockets with flaps, sleeves
with elbow bunching and turned-back cuffs, modelled gathers at the belt and folds toward the hem.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from mathutils import Vector

# ----------------------------------------------------------------------------------------- regions
# Region ids are written to the vertex colour (R = id / 15) and recoloured per colourway at runtime.
REGION = {
    "coatBase": 0, "coatSecondary": 1, "trim": 2, "beltAccent": 3, "identifierAccent": 4,
    "faceplate": 5, "emblem": 6, "leather": 7, "inner": 8, "sole": 9, "lining": 10,
}
FIXED_COLOURS = {  # regions that are the same for every contestant (linear-ish sRGB hex)
    "faceplate": "0B0B0E", "emblem": "F4F4F2", "leather": "1E1C20", "inner": "222126", "sole": "121214", "lining": "151418",
}

# ----------------------------------------------------------------------------------------- body plan
H_TOTAL = 1.235
Z_HEM, Z_BELT, Z_SHOULDER, Z_COAT_TOP = 0.17, 0.47, 0.69, 0.725
Z_VENT = 0.335
SHOULDER = (0.165, 0.0, 0.665)
ELBOW = (0.212, -0.012, 0.528)
WRIST = (0.236, -0.024, 0.418)
HIP_X = 0.078
HOOD_C = (0.0, 0.012, 0.985)
HOOD_R = (0.27, 0.26, 0.25)
FACE_C = (0.0, 0.03, 0.972)
FACE_R = (0.212, 0.155, 0.205)


def smooth(e0, e1, x):
    if e0 == e1:
        return 1.0 if x >= e1 else 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def interp(keys, x):
    """Smooth piecewise interpolation through (x, value) keys."""
    if x <= keys[0][0]:
        return keys[0][1]
    for (x0, a), (x1, b) in zip(keys, keys[1:]):
        if x <= x1:
            return a + (b - a) * smooth(x0, x1, x)
    return keys[-1][1]


COAT_RX = [(0.17, 0.252), (0.30, 0.212), (0.42, 0.170), (0.47, 0.158), (0.55, 0.168), (0.63, 0.180), (0.69, 0.182), (0.725, 0.132)]
COAT_RY = [(0.17, 0.214), (0.30, 0.181), (0.42, 0.140), (0.47, 0.128), (0.55, 0.134), (0.63, 0.136), (0.69, 0.128), (0.725, 0.112)]
COAT_OPEN = [(0.17, 25.0), (0.30, 15.0), (0.43, 5.5), (0.47, 3.5), (0.52, 6.5), (0.62, 20.0), (0.70, 33.0), (0.725, 38.0)]


def ellipse_r(rx, ry, th):
    return rx * ry / math.sqrt((ry * math.sin(th)) ** 2 + (rx * math.cos(th)) ** 2)


def coat_fold(th, z):
    """Garment folds: gathers bunched just under the belt and deeper folds that grow toward the hem."""
    hem = 0.030 * smooth(0.44, Z_HEM, z) * (0.55 * math.sin(7 * th + 0.8 + 3.0 * z) + 0.45 * math.sin(12 * th - 1.1 + 5.0 * z))
    gather = 0.016 * math.exp(-(((z - 0.445) / 0.03) ** 2)) * math.sin(17 * th + 0.4)
    drag = 0.008 * math.exp(-(((z - 0.52) / 0.03) ** 2)) * math.sin(13 * th + 1.7)
    return hem + gather + drag


def coat_point(th_deg, z, off=0.0, folds=True):
    th = math.radians(th_deg)
    r = ellipse_r(interp(COAT_RX, z), interp(COAT_RY, z), th)
    if folds:
        r *= 1.0 + coat_fold(th, z)
    r += off
    return Vector((math.sin(th) * r, -math.cos(th) * r, z))


def coat_open(z):
    return interp(COAT_OPEN, z)


# ----------------------------------------------------------------------------------------- atlas
# Each UV group gets a rectangle sized from its world size (uniform texel density), packed into one atlas.
GROUP_SIZE = {  # (width m, height m) of the part's UV space
    "coat": (1.20, 0.56), "hood": (1.55, 0.62), "collar": (0.95, 0.17), "sleeve": (0.40, 0.29), "lapel": (0.10, 0.22),
    "yoke": (0.42, 0.16), "belt": (1.05, 0.04), "pocket": (0.09, 0.10), "flap": (0.10, 0.04), "storm": (0.13, 0.12),
    "cuff": (0.42, 0.055), "glove": (0.20, 0.14), "boot": (0.42, 0.30), "trouser": (0.38, 0.34), "shirt": (0.90, 0.27),
    "epaulette": (0.10, 0.035), "patch": (0.045, 0.035), "buckle": (0.07, 0.05), "face": (0.42, 0.42), "plain": (0.05, 0.05),
}
ATLAS_PX = 1024
FABRIC_GROUPS = {"coat", "hood", "collar", "sleeve", "lapel", "yoke", "pocket", "flap", "storm", "cuff", "epaulette", "shirt", "trouser", "patch", "plain"}
LEATHER_GROUPS = {"belt", "glove", "boot"}


def _pack():
    pad = 6 / ATLAS_PX
    items = sorted(GROUP_SIZE.items(), key=lambda kv: -kv[1][1])
    scale = 0.62
    while True:
        rects, x, y, row_h, ok = {}, pad, pad, 0.0, True
        for name, (w, h) in items:
            pw, ph = w * scale, h * scale
            if x + pw + pad > 1.0:
                x, y, row_h = pad, y + row_h + pad, 0.0
            if pw + 2 * pad > 1.0 or y + ph + pad > 1.0:
                ok = False
                break
            rects[name] = (x, y, pw, ph)
            x += pw + pad
            row_h = max(row_h, ph)
        if ok:
            return rects, scale
        scale *= 0.97


ATLAS, ATLAS_SCALE = _pack()  # group -> (u0, v0, du, dv); metres -> UV factor


def auv(group, u, v):
    u0, v0, du, dv = ATLAS[group]
    return (u0 + max(0.0, min(1.0, u)) * du, v0 + max(0.0, min(1.0, v)) * dv)


# ----------------------------------------------------------------------------------------- parts
@dataclass
class Part:
    name: str
    rule: str                       # weighting rule used in Blender
    side: int = 0                   # -1 right, +1 left, 0 centre
    thick: float = 0.0
    region_in: str = "lining"
    region_rim: str | None = None   # None: same as the outer face
    hard: bool = False              # flat-shaded hard surface (buckles, soles)
    verts: list = field(default_factory=list)
    faces: list = field(default_factory=list)   # (vertex ids, uvs, region)
    ref: tuple = (0.0, 0.0, 0.0)    # a point inside the part, to orient normals outward
    ref_axis: tuple | None = None   # or an axis segment (a, b): outward = away from the nearest axis point

    def v(self, p):
        self.verts.append(Vector(p))
        return len(self.verts) - 1

    def grid(self, P, uvs, region, wrap=False, weld_cols=False):
        """P[r][c] points, uvs[r][c] atlas UVs. Rows run along the part's v, columns along u."""
        R, C = len(P), len(P[0])
        ids = [[self.v(p) for p in row] for row in P]
        cols = C if wrap else C - 1
        for r in range(R - 1):
            for c in range(cols):
                c1 = (c + 1) % C
                q = (ids[r][c], ids[r][c1], ids[r + 1][c1], ids[r + 1][c])
                uv = (uvs[r][c], uvs[r][c1] if not (wrap and c1 == 0) else (uvs[r][C - 1][0] + (uvs[r][1][0] - uvs[r][0][0]), uvs[r][c1][1]),
                      uvs[r + 1][c1] if not (wrap and c1 == 0) else (uvs[r + 1][C - 1][0] + (uvs[r + 1][1][0] - uvs[r + 1][0][0]), uvs[r + 1][c1][1]),
                      uvs[r + 1][c])
                self.faces.append((q, uv, region))
        return ids


def res_n(base, res, lo=3):
    return max(lo, int(round(base * res)))


def frame(d):
    d = Vector(d).normalized()
    a = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    x = (a - d * a.dot(d)).normalized()
    return x, d.cross(x).normalized()


def tube(part, path, radii, seg, group, region, u_wrap=1.0, wobble=None, sx=1.0, sy=1.0, up=None):
    """Lathe along a polyline: path [points], radii [r] per point. UV u around, v along."""
    P, U = [], []
    n = len(path)
    lengths = [0.0]
    for a, b in zip(path, path[1:]):
        lengths.append(lengths[-1] + (Vector(b) - Vector(a)).length)
    L = lengths[-1] or 1.0
    for k in range(n):
        d = (Vector(path[min(k + 1, n - 1)]) - Vector(path[max(k - 1, 0)])).normalized()
        if up is not None:
            x = (Vector(up) - d * Vector(up).dot(d)).normalized()
            y = d.cross(x).normalized()
        else:
            x, y = frame(d)
        row, urow = [], []
        for i in range(seg + 1):
            ps = 2 * math.pi * i / seg
            r = radii[k] * (wobble(ps, lengths[k] / L) if wobble else 1.0)
            row.append(Vector(path[k]) + x * (math.cos(ps) * r * sx) + y * (math.sin(ps) * r * sy))
            urow.append(auv(group, i / seg * u_wrap, lengths[k] / L))
        P.append(row)
        U.append(urow)
    return part.grid(P, U, region)


def ellipsoid(part, c, r, seg, rings, region, group="plain", e0=-90.0, e1=90.0, frame_m=None, squash=None):
    c = Vector(c)
    P, U = [], []
    for j in range(rings + 1):
        e = math.radians(e0 + (e1 - e0) * j / rings)
        row, urow = [], []
        for i in range(seg + 1):
            a = 2 * math.pi * i / seg
            p = Vector((math.cos(e) * math.sin(a) * r[0], -math.cos(e) * math.cos(a) * r[1], math.sin(e) * r[2]))
            if squash:
                p = squash(p)
            if frame_m:
                p = frame_m(p)
            row.append(c + p)
            urow.append(auv(group, i / seg, j / rings))
        P.append(row)
        U.append(urow)
    return part.grid(P, U, region)


def superellipsoid(part, c, half, n_e, n_a, seg, rings, region, group="boot", taper=None):
    """Rounded box: exponents n_e (vertical), n_a (horizontal); taper(p) may reshape (e.g. a bigger toe)."""
    c = Vector(c)
    sgn = lambda x: (x > 0) - (x < 0)  # noqa: E731
    pw = lambda x, n: sgn(x) * abs(x) ** n  # noqa: E731
    P, U = [], []
    for j in range(rings + 1):
        e = -math.pi / 2 + math.pi * j / rings
        row, urow = [], []
        for i in range(seg + 1):
            a = 2 * math.pi * i / seg
            ce, se = pw(math.cos(e), n_e), pw(math.sin(e), n_e)
            p = Vector((ce * pw(math.sin(a), n_a) * half[0], -ce * pw(math.cos(a), n_a) * half[1], se * half[2]))
            if taper:
                p = taper(p)
            row.append(c + p)
            urow.append(auv(group, i / seg, j / rings))
        P.append(row)
        U.append(urow)
    return part.grid(P, U, region)


# ----------------------------------------------------------------------------------------- garment
def coat_shell(res):
    """Two panels (left +X, right -X) meeting at a centre-back seam; the back vent splits them below Z_VENT."""
    parts = []
    rows = res_n(26, res, 6)
    cols = res_n(28, res, 6)
    for side in (1, -1):
        p = Part(f"CNT_Coat_{'L' if side > 0 else 'R'}", "coat", side, thick=0.011, region_in="lining", region_rim="trim",
                 ref_axis=((0, 0, 0), (0, 0, 1)))
        P, U = [], []
        for r in range(rows + 1):
            v = r / rows
            z = Z_HEM + (Z_COAT_TOP - Z_HEM) * v
            th0 = coat_open(z)
            row, urow = [], []
            for c in range(cols + 1):
                t = c / cols
                gap = 2.6 * smooth(Z_VENT, Z_HEM, z)  # the back vent opens below Z_VENT
                th = th0 + (180.0 - gap - th0) * t
                row.append(coat_point(side * th, z))
                u = 0.5 * t if side > 0 else 1.0 - 0.5 * t
                urow.append(auv("coat", u, v))
            P.append(row)
            U.append(urow)
        p.grid(P, U, "coatBase")
        p.meta = {"rows": rows, "cols": cols}
        parts.append(p)
    return parts


def collar(res):
    p = Part("CNT_Collar", "collar", thick=0.013, region_in="coatSecondary", region_rim="trim", ref_axis=((0, 0, 0.5), (0, 0, 1.2)))
    cols, rows = res_n(34, res, 10), res_n(6, res, 3)
    tc = 36.0
    P, U = [], []
    for r in range(rows + 1):
        h = r / rows
        row, urow = [], []
        for c in range(cols + 1):
            t = c / cols
            th = tc + (360 - 2 * tc) * t
            thr = math.radians(th)
            back = 0.5 - 0.5 * math.cos(thr)  # 0 front, 1 back
            z0 = 0.700 + 0.008 * back
            z1 = 0.800 + 0.080 * back ** 0.7
            rx = 0.134 + (0.218 - 0.134) * h ** 1.3
            ry = 0.114 + (0.192 - 0.114) * h ** 1.3
            z = z0 + (z1 - z0) * h
            rr = ellipse_r(rx, ry, thr) * (1 + 0.012 * math.sin(9 * thr) * h)
            row.append(Vector((math.sin(thr) * rr, -math.cos(thr) * rr, z)))
            urow.append(auv("collar", t, h))
        P.append(row)
        U.append(urow)
    p.grid(P, U, "coatBase")
    return [p]


def lapels(res):
    out = []
    rows, cols = res_n(16, res, 4), res_n(5, res, 2)
    for side in (1, -1):
        p = Part(f"CNT_Lapel_{'L' if side > 0 else 'R'}", "coat", side, thick=0.006, region_in="coatSecondary", region_rim="trim",
                 ref_axis=((0, 0, 0), (0, 0, 1)))
        P, U = [], []
        for r in range(rows + 1):
            v = r / rows
            z = 0.505 + (0.718 - 0.505) * v
            w = 0.082 * smooth(0.0, 1.0, v) ** 0.8 * (1.0 - 0.25 * smooth(0.86, 1.0, v))  # peaked lapel, eased at the top
            th0 = coat_open(z)
            rr = interp(COAT_RX, z)
            dth = math.degrees(w / max(rr, 0.05))
            row, urow = [], []
            for c in range(cols + 1):
                s = c / cols
                curl = 0.006 * s * s
                row.append(coat_point(side * (th0 - 2.2 + dth * s), z, off=0.0125 + curl, folds=True))
                urow.append(auv("lapel", s if side > 0 else 1 - s, v))
            P.append(row)
            U.append(urow)
        p.grid(P, U, "coatSecondary")
        out.append(p)
    return out


def yoke(res):
    p = Part("CNT_Yoke", "coat", thick=0.006, region_in="lining", region_rim="identifierAccent", ref_axis=((0, 0, 0), (0, 0, 1)))
    rows, cols = res_n(5, res, 2), res_n(16, res, 6)
    P, U = [], []
    for r in range(rows + 1):
        v = r / rows
        row, urow = [], []
        for c in range(cols + 1):
            t = c / cols
            th = 116 + (244 - 116) * t
            zb = 0.560 - 0.012 * math.sin(math.pi * t)
            z = zb + (0.712 - zb) * v
            row.append(coat_point(th, z, off=0.009 + 0.002 * (1 - v), folds=False))
            urow.append(auv("yoke", t, v))
        P.append(row)
        U.append(urow)
    p.grid(P, U, "coatBase")
    return [p]


def storm_flap(res):
    p = Part("CNT_StormFlap", "coat", -1, thick=0.006, region_in="lining", region_rim="trim", ref_axis=((0, 0, 0), (0, 0, 1)))
    rows, cols = res_n(4, res, 2), res_n(5, res, 2)
    P, U = [], []
    for r in range(rows + 1):
        v = r / rows
        z = 0.565 + (0.685 - 0.565) * v
        th0 = coat_open(z) + 8
        row, urow = [], []
        for c in range(cols + 1):
            t = c / cols
            th = -(th0 + 34 * t + 6 * (1 - v) * t)
            row.append(coat_point(th, z, off=0.011, folds=False))
            urow.append(auv("storm", t, v))
        P.append(row)
        U.append(urow)
    p.grid(P, U, "coatBase")
    return [p]


def pockets(res, detail=True):
    out = []
    for side in (1, -1):
        thc = 52.0
        for kind, z0, z1, w, off, region, group, thick in (
                ("Pocket", 0.232, 0.322, 0.084, 0.006, "coatBase", "pocket", 0.005),
                ("PocketFlap", 0.309, 0.347, 0.094, 0.012, "coatSecondary", "flap", 0.006)):
            if not detail and kind == "Pocket":
                continue
            p = Part(f"CNT_{kind}_{'L' if side > 0 else 'R'}", "coat", side, thick=thick, region_in="lining", region_rim="trim",
                     ref_axis=((0, 0, 0), (0, 0, 1)))
            rows, cols = res_n(4, res, 2), res_n(6, res, 2)
            P, U = [], []
            for r in range(rows + 1):
                v = r / rows
                z = z0 + (z1 - z0) * v
                rr = interp(COAT_RX, z)
                dth = math.degrees(w / rr)
                row, urow = [], []
                for c in range(cols + 1):
                    t = c / cols
                    zz = z - (0.006 * math.sin(math.pi * t) if kind == "PocketFlap" and r == 0 else 0.0)
                    row.append(coat_point(side * (thc - dth / 2 + dth * t), zz, off=off + 0.005, folds=True))
                    urow.append(auv(group, t, v))
                P.append(row)
                U.append(urow)
            p.grid(P, U, region)
            out.append(p)
    return out


def belt(res, detail=True):
    out = []
    p = Part("CNT_Belt", "belt", thick=0.005, region_in="leather", ref_axis=((0, 0, 0), (0, 0, 1)))
    cols = res_n(56, res, 14)
    P, U = [], []
    for r, z in enumerate((0.452, 0.470, 0.489)):
        row, urow = [], []
        for c in range(cols + 1):
            t = c / cols
            row.append(coat_point(360 * t, z, off=0.0075, folds=False))
            urow.append(auv("belt", t, r / 2))
        P.append(row)
        U.append(urow)
    p.grid(P, U, "leather")
    out.append(p)
    # buckle: a rounded-rectangle frame with a centre prong, on the front
    b = Part("CNT_Buckle", "belt", hard=True, ref=(0, 0, 0.47))
    yb = coat_point(0, 0.47, off=0.0075, folds=False).y - 0.006
    ow, oh, iw, ih, depth = 0.031, 0.024, 0.021, 0.014, 0.007
    n = res_n(5, res, 2)

    def rrect(w, h, rad):
        pts = []
        for cx, cz, a0 in ((w - rad, h - rad, 0), (-w + rad, h - rad, 90), (-w + rad, -h + rad, 180), (w - rad, -h + rad, 270)):
            for k in range(n + 1):
                a = math.radians(a0 + 90 * k / n)
                pts.append((cx + rad * math.cos(a), cz + rad * math.sin(a)))
        return pts

    outer, inner = rrect(ow, oh, 0.008), rrect(iw, ih, 0.004)
    m = len(outer)
    z0 = 0.4705
    layers = []
    for y in (yb, yb - depth):
        layers.append(([b.v((x, y, z0 + zz)) for x, zz in outer], [b.v((x, y, z0 + zz)) for x, zz in inner]))
    uv = [auv("buckle", 0.5, 0.5)] * 4
    (fo, fi), (bo, bi) = layers[1], layers[0]
    for i in range(m):
        j = (i + 1) % m
        b.faces.append(((fo[i], fo[j], fi[j], fi[i]), uv, "beltAccent"))       # front face
        b.faces.append(((bo[j], bo[i], fo[i], fo[j]), uv, "beltAccent"))       # outer wall
        b.faces.append(((fi[i], fi[j], bi[j], bi[i]), uv, "beltAccent"))       # inner wall
    prong = [b.v(p) for p in ((-0.0025, yb - 0.004, z0 - ih), (0.0025, yb - 0.004, z0 - ih), (0.0025, yb - 0.009, z0 + 0.004),
                              (-0.0025, yb - 0.009, z0 + 0.004))]
    b.faces.append(((prong[0], prong[1], prong[2], prong[3]), uv, "beltAccent"))
    out.append(b)
    if detail:
        # tongue end through the buckle toward the wearer's left, with two eyelets
        t = Part("CNT_BeltTongue", "belt", thick=0.004, region_in="leather", ref_axis=((0, 0, 0), (0, 0, 1)))
        P, U = [], []
        for r, z in enumerate((0.455, 0.486)):
            row, urow = [], []
            for c in range(5):
                th = 2 + 16 * c / 4
                row.append(coat_point(th, z, off=0.0135, folds=False))
                urow.append(auv("belt", 0.9 + 0.1 * c / 4, r))
            P.append(row)
            U.append(urow)
        t.grid(P, U, "leather")
        out.append(t)
        for k, th in enumerate((9.0, 14.0)):
            e = Part(f"CNT_Eyelet_{k}", "belt", hard=False, ref=tuple(coat_point(th, 0.4705, off=0.0)))
            c = coat_point(th, 0.4705, off=0.0185, folds=False)
            ellipsoid(e, c, (0.0035, 0.0018, 0.0035), res_n(8, res, 6), 3, "beltAccent")
            out.append(e)
        # keepers (belt loops) at the sides and back, in the coat colour
        for th in (62, 118, 242, 298):
            k = Part(f"CNT_Keeper_{th}", "belt", thick=0.003, region_in="lining", ref_axis=((0, 0, 0), (0, 0, 1)))
            P, U = [], []
            for r, z in enumerate((0.446, 0.495)):
                row, urow = [], []
                for c in range(3):
                    row.append(coat_point(th - 2.4 + 2.4 * c, z, off=0.0125, folds=False))
                    urow.append(auv("yoke", c / 2, r))
                P.append(row)
                U.append(urow)
            k.grid(P, U, "beltAccent")
            out.append(k)
    return out


def epaulettes(res, detail=True):
    out = []
    for side in (1, -1):
        p = Part(f"CNT_Epaulette_{'L' if side > 0 else 'R'}", "epaulette", side, thick=0.006, region_in="lining", region_rim="trim",
                 ref=(side * 0.14, 0.0, 0.60))
        n = res_n(5, res, 2)
        P, U = [], []
        for r, dy in enumerate((-0.017, 0.017)):
            row, urow = [], []
            for c in range(n + 1):
                t = c / n
                x = side * (0.105 + 0.085 * t)
                z = 0.722 - 0.040 * t ** 1.5
                row.append(Vector((x, dy, z)))
                urow.append(auv("epaulette", t, r))
            P.append(row)
            U.append(urow)
        p.grid(P, U, "coatSecondary")
        out.append(p)
    return out


def buttons(res):
    """Small domed buttons: pocket flaps, epaulettes, storm flap, cuff tabs (positions fixed)."""
    out = []
    spots = []
    for side in (1, -1):
        spots.append((coat_point(side * 52, 0.318, off=0.019, folds=False), (0, -1, 0), "button_pocket", side))
        spots.append((Vector((side * 0.118, 0.0, 0.726)), (0, 0, 1), "button_epaulette", side))
    spots.append((coat_point(-(coat_open(0.575) + 40), 0.577, off=0.018, folds=False), (0, -1, 0), "button_storm", -1))
    for pos, nrm, name, side in spots:
        b = Part(f"CNT_{name}_{'L' if side > 0 else 'R'}", "coat" if "epaulette" not in name else "epaulette", side,
                 ref=tuple(pos - Vector(nrm) * 0.01))
        n = Vector(nrm)
        ellipsoid(b, pos, (0.0085, 0.0085, 0.0085), res_n(8, res, 6), res_n(4, res, 3), "trim", e0=-90, e1=90,
                  squash=(lambda p: Vector((p.x, p.y * 0.35, p.z))) if abs(n.z) < 0.5 else (lambda p: Vector((p.x, p.y, p.z * 0.35))))
        out.append(b)
    return out


def arm_path(side):
    s, e, w = Vector(SHOULDER), Vector(ELBOW), Vector(WRIST)
    s, e, w = (Vector((side * v.x, v.y, v.z)) for v in (s, e, w))
    return s, e, w


def sleeves(res, detail=True):
    out = []
    seg = res_n(18, res, 8)
    for side in (1, -1):
        s, e, w = arm_path(side)
        start = s + (s - e).normalized() * 0.035 + Vector((-side * 0.012, 0, 0.0))
        nup, nlo = res_n(6, res, 2), res_n(6, res, 2)
        path = [start + (s - start) * (k / 2) for k in range(2)] + [s + (e - s) * (k / nup) for k in range(nup)] + \
               [e + (w - e) * (k / nlo) for k in range(nlo + 1)]
        L_up = (s - start).length + (e - s).length
        L = L_up + (w - e).length

        def radius(p, i):
            # distance along the arm -> radius: shoulder puff, upper arm, elbow, forearm, wrist
            d = sum((Vector(path[k + 1]) - Vector(path[k])).length for k in range(i))
            t = d / L
            return interp([(0.0, 0.074), (0.12, 0.069), (0.45, 0.060), (0.58, 0.059), (1.0, 0.054)], t)

        radii = [radius(p, i) for i, p in enumerate(path)]
        te = L_up / L

        def wob(ps, t):
            return 1.0 + 0.07 * math.exp(-(((t - te) / 0.07) ** 2)) * max(0.0, math.sin(3 * ps + 0.5)) - 0.02 * math.exp(-(((t - te) / 0.05) ** 2))

        p = Part(f"CNT_Sleeve_{'L' if side > 0 else 'R'}", "arm", side, thick=0.008, region_in="lining", ref_axis=(tuple(s), tuple(w)))
        tube(p, path, radii, seg, "sleeve", "coatBase", wobble=wob)
        out.append(p)
        # turned-back cuff with a rolled lip
        d = (w - e).normalized()
        cuff_path = [w - d * 0.050, w - d * 0.044, w - d * 0.010, w + d * 0.004]
        c = Part(f"CNT_Cuff_{'L' if side > 0 else 'R'}", "arm", side, thick=0.008, region_in="lining", region_rim="trim", ref_axis=(tuple(e), tuple(w)))
        tube(c, cuff_path, [0.061, 0.067, 0.068, 0.064], seg, "cuff", "coatSecondary")
        out.append(c)
        if detail:
            a = Part(f"CNT_CuffAccent_{'L' if side > 0 else 'R'}", "arm", side, ref_axis=(tuple(e), tuple(w)))
            tube(a, [w - d * 0.033, w - d * 0.027], [0.0695, 0.0695], seg, "cuff", "identifierAccent")
            out.append(a)
            # shoulder patch (identifier accent): readable from the side and from behind
            q = Part(f"CNT_ArmPatch_{'L' if side > 0 else 'R'}", "arm", side, thick=0.003, region_in="lining", region_rim="trim",
                     ref_axis=(tuple(s), tuple(e)))
            dd = (e - s).normalized()
            x, y = frame(dd)
            out_dir = Vector((side, 0, 0))
            out_dir = (out_dir - dd * out_dir.dot(dd)).normalized()
            P, U = [], []
            for r in range(3):
                row, urow = [], []
                for k in range(4):
                    ang = (-0.42 + 0.84 * k / 3)
                    side_dir = dd.cross(out_dir).normalized()
                    centre = s + dd * (0.035 + 0.030 * r)
                    rr = 0.0655
                    row.append(centre + (out_dir * math.cos(ang) + side_dir * math.sin(ang)) * rr)
                    urow.append(auv("patch", k / 3, r / 2))
                P.append(row)
                U.append(urow)
            q.grid(P, U, "identifierAccent")
            out.append(q)
    return out


def gloves(res):
    out = []
    for side in (1, -1):
        s, e, w = arm_path(side)
        d = (w - e).normalized()
        x, y = frame(d)
        g = Part(f"CNT_Glove_{'L' if side > 0 else 'R'}", "hand", side, ref=tuple(w + d * 0.05))
        centre = w + d * 0.056

        def fm(p, d=d, x=x, y=y):
            return x * p.x + (-y) * p.y + d * p.z

        ellipsoid(g, centre, (0.047, 0.040, 0.054), res_n(14, res, 8), res_n(9, res, 5), "leather", "glove",
                  squash=lambda p: Vector((p.x * (1.0 + 0.10 * max(0.0, -p.z) / 0.054), p.y, p.z)), frame_m=fm)
        thumb_c = centre + y * (-0.030) + d * (-0.004) + x * (side * 0.0 - 0.0)
        th = Part(f"CNT_Thumb_{'L' if side > 0 else 'R'}", "hand", side, ref=tuple(thumb_c))
        ellipsoid(th, thumb_c + (-x * side) * 0.022, (0.017, 0.017, 0.028), res_n(8, res, 6), res_n(6, res, 4), "leather", "glove", frame_m=fm)
        out += [g, th]
        cuffg = Part(f"CNT_GloveCuff_{'L' if side > 0 else 'R'}", "hand", side, thick=0.005, region_in="leather", ref_axis=(tuple(e), tuple(w)))
        tube(cuffg, [w - d * 0.012, w + d * 0.022], [0.050, 0.055], res_n(16, res, 8), "glove", "leather")
        out.append(cuffg)
    return out


def trousers(res):
    out = []
    for side in (1, -1):
        p = Part(f"CNT_Trouser_{'L' if side > 0 else 'R'}", "leg", side, ref_axis=((side * HIP_X, 0, 0), (side * HIP_X, 0, 1)))
        n = res_n(9, res, 3)
        path = [(side * HIP_X, 0.004, 0.445 - (0.445 - 0.11) * k / n) for k in range(n + 1)]
        radii = [interp([(0.0, 0.062), (0.5, 0.058), (1.0, 0.056)], k / n) for k in range(n + 1)]

        def wob(ps, t):
            return 1.0 + 0.06 * smooth(0.7, 1.0, t) * math.sin(5 * ps + 1.3 + 9 * t)

        tube(p, path, radii, res_n(14, res, 8), "trouser", "inner", wobble=wob, up=(1, 0, 0))
        out.append(p)
    return out


def boots(res, detail=True):
    out = []
    for side in (1, -1):
        x0 = side * 0.080
        shaft = Part(f"CNT_BootShaft_{'L' if side > 0 else 'R'}", "foot", side, thick=0.006, region_in="leather", ref_axis=((x0, 0, 0), (x0, 0, 1)))
        n = res_n(5, res, 2)
        tube(shaft, [(x0, 0.006, 0.055 + 0.118 * k / n) for k in range(n + 1)], [interp([(0, 0.066), (0.8, 0.069), (1, 0.073)], k / n) for k in range(n + 1)],
             res_n(16, res, 8), "boot", "leather", sx=1.0, sy=1.08, up=(1, 0, 0))
        out.append(shaft)
        foot = Part(f"CNT_BootFoot_{'L' if side > 0 else 'R'}", "foot", side, ref=(x0, -0.03, 0.06))
        superellipsoid(foot, (x0, -0.034, 0.064), (0.062, 0.108, 0.046), 0.55, 0.42, res_n(18, res, 10), res_n(10, res, 6), "leather",
                       taper=lambda p: Vector((p.x * (1.0 + 0.12 * smooth(0.0, -0.1, p.y)), p.y, p.z * (1.0 - 0.18 * smooth(0.0, -0.1, p.y) * (p.z > 0)))))
        out.append(foot)
        sole = Part(f"CNT_Sole_{'L' if side > 0 else 'R'}", "foot", side, ref=(x0, -0.03, 0.02))
        superellipsoid(sole, (x0, -0.036, 0.016), (0.069, 0.117, 0.016), 0.22, 0.40, res_n(18, res, 10), res_n(4, res, 3), "sole", "boot",
                       taper=lambda p: Vector((p.x * (1.0 + 0.10 * smooth(0.0, -0.1, p.y)), p.y, p.z)))
        out.append(sole)
        if detail:
            strap = Part(f"CNT_BootStrap_{'L' if side > 0 else 'R'}", "foot", side, thick=0.004, region_in="leather", ref_axis=((x0, 0, 0), (x0, 0, 1)))
            tube(strap, [(x0, 0.006, 0.150), (x0, 0.006, 0.168)], [0.0745, 0.0755], res_n(16, res, 8), "boot", "leather", sy=1.08, up=(1, 0, 0))
            out.append(strap)
            bk = Part(f"CNT_BootBuckle_{'L' if side > 0 else 'R'}", "foot", side, ref=(x0 + side * 0.06, 0.0, 0.16))
            ellipsoid(bk, (x0 + side * 0.075, 0.0, 0.159), (0.006, 0.016, 0.012), 6, 3, "beltAccent",
                      squash=lambda p: Vector((p.x * 0.6, p.y, p.z)))
            out.append(bk)
    return out


def shirt(res, detail=True):
    out = []
    p = Part("CNT_Shirt", "torso", ref_axis=((0, 0, 0), (0, 0, 1)))
    rows, cols = res_n(7, res, 3), res_n(24, res, 10)
    P, U = [], []
    for r in range(rows + 1):
        v = r / rows
        z = 0.46 + (0.715 - 0.46) * v
        rx = interp([(0.46, 0.142), (0.62, 0.150), (0.715, 0.120)], z)
        ry = interp([(0.46, 0.112), (0.62, 0.116), (0.715, 0.100)], z)
        row, urow = [], []
        for c in range(cols + 1):
            th = 2 * math.pi * c / cols
            rr = ellipse_r(rx, ry, th)
            row.append(Vector((math.sin(th) * rr, -math.cos(th) * rr, z)))
            urow.append(auv("shirt", c / cols, v))
        P.append(row)
        U.append(urow)
    p.grid(P, U, "inner")
    out.append(p)
    if detail:
        for side in (1, -1):  # crossover wrap visible in the V
            w = Part(f"CNT_ShirtWrap_{'L' if side > 0 else 'R'}", "torso", side, thick=0.004, region_in="inner", ref_axis=((0, 0, 0), (0, 0, 1)))
            P, U = [], []
            for r in range(5):
                v = r / 4
                z = 0.50 + 0.21 * v
                cx = side * (-0.045 + 0.095 * v)
                row, urow = [], []
                for c in range(3):
                    x = cx + (c - 1) * 0.018
                    rx, ry = 0.150, 0.118
                    th = math.asin(max(-0.99, min(0.99, x / rx)))
                    rr = ellipse_r(rx, ry, th) + 0.004
                    row.append(Vector((math.sin(th) * rr, -math.cos(th) * rr, z + (c - 1) * 0.01 * side)))
                    urow.append(auv("shirt", 0.45 + 0.05 * c, v))
                P.append(row)
                U.append(urow)
            w.grid(P, U, "inner")
            out.append(w)
    return out


# ----------------------------------------------------------------------------------------- head
def hood(res):
    p = Part("CNT_Hood", "head", thick=0.024, region_in="lining", region_rim="coatSecondary", ref=HOOD_C)
    rows, cols = res_n(22, res, 8), res_n(40, res, 12)
    Phi, E, ec = 55.0, 51.0, -6.0
    e_min = -62.0
    cx, cy, cz = HOOD_C
    rx, ry, rz = HOOD_R
    P, U = [], []
    for r in range(rows + 1):
        e = e_min + (90.0 - e_min) * r / rows
        er = math.radians(e)
        phs = Phi * math.sqrt(max(0.0, 1 - ((e - ec) / E) ** 2))
        pinch = 1.0 - 0.38 * smooth(-12.0, e_min, e)
        row, urow = [], []
        for c in range(cols + 1):
            t = c / cols
            ph = phs + (360.0 - 2 * phs) * t
            a = math.radians(ph)
            hz = math.cos(er) * pinch
            x = math.sin(a) * hz * rx
            y = -math.cos(a) * hz * ry
            z = math.sin(er) * rz
            back = max(0.0, -math.cos(a)) ** 2 * smooth(-25.0, 45.0, e) * (1.0 - smooth(55.0, 90.0, e))
            y += 0.046 * back
            z += 0.012 * back
            # a soft centre crease from the crown to the back (the seam)
            crease = math.exp(-((math.sin(a) / 0.08) ** 2)) * smooth(10.0, 70.0, e) * (math.cos(a) < 0)
            y -= 0.006 * crease
            row.append(Vector((cx + x, cy + y, cz + z)))
            urow.append(auv("hood", t, (e - e_min) / (90.0 - e_min)))
        P.append(row)
        U.append(urow)
    p.grid(P, U, "coatBase")
    p.weld = True   # rows outside the face opening close at the front; the crown is a pole
    return [p]


def faceplate(res):
    p = Part("CNT_Faceplate", "head", ref=FACE_C)
    ellipsoid(p, FACE_C, FACE_R, res_n(28, res, 12), res_n(18, res, 8), "faceplate", "face")
    p.weld = True
    return [p]


def face_y(x, z, lift=0.0):
    cx, cy, cz = FACE_C
    rx, ry, rz = FACE_R
    k = 1 - (x / rx) ** 2 - ((z - cz) / rz) ** 2
    return cy - ry * math.sqrt(max(k, 0.0)) - lift


EMBLEM = {"half_diagonal": 0.094, "stroke": 0.0118, "corner_radius": 0.020, "centre_z": 0.976, "chevron_apex": 0.0, "relief": 0.0035}


def emblem(res):
    """White geometric emblem: a rounded diamond outline and a chevron inside it, laid on the faceplate.
    A separate part so the design can be replaced without touching the rest of the model."""
    p = Part("CNT_Emblem", "head", hard=False, ref=FACE_C)
    a, sw, rad, zc = EMBLEM["half_diagonal"], EMBLEM["stroke"], EMBLEM["corner_radius"], EMBLEM["centre_z"]
    n = res_n(6, res, 3)

    def diamond(half):
        # rounded square rotated 45 degrees: corners at top, right, bottom, left
        pts = []
        corners = [(0, half), (half, 0), (0, -half), (-half, 0)]
        for k, (cx, cz) in enumerate(corners):
            ang_c = math.radians(90 - 90 * k)
            inset = rad * math.sqrt(2)
            ccx, ccz = cx - math.cos(ang_c) * inset, cz - math.sin(ang_c) * inset
            for j in range(n + 1):
                ang = ang_c + math.radians(45 - 90 * j / n)
                pts.append((ccx + rad * math.cos(ang), ccz + rad * math.sin(ang)))
        return pts

    def dense(pts, closed=True, step=0.0042 / max(res, 0.2) ** 1.2):
        out = []
        n_pts = len(pts)
        for i in range(n_pts if closed else n_pts - 1):
            (x0, z0), (x1, z1) = pts[i], pts[(i + 1) % n_pts]
            k = max(1, int(math.hypot(x1 - x0, z1 - z0) / step))
            out += [(x0 + (x1 - x0) * j / k, z0 + (z1 - z0) * j / k) for j in range(k)]
        if not closed:
            out.append(pts[-1])
        return out

    relief = EMBLEM["relief"]

    def P3(x, z, lift):
        return Vector((x, face_y(x, zc + z, lift), zc + z))

    uv = [auv("plain", 0.5, 0.5)] * 4

    def ribbon(left, right, closed):
        """Raised stroke between two matching polylines (left/right edges)."""
        m = len(left)
        tl = [p.v(P3(x, z, relief)) for x, z in left]
        tr = [p.v(P3(x, z, relief)) for x, z in right]
        bl = [p.v(P3(x, z, -0.003)) for x, z in left]
        br = [p.v(P3(x, z, -0.003)) for x, z in right]
        for i in range(m if closed else m - 1):
            j = (i + 1) % m
            p.faces.append(((tl[i], tr[i], tr[j], tl[j]), uv, "emblem"))
            p.faces.append(((bl[i], tl[i], tl[j], bl[j]), uv, "emblem"))
            p.faces.append(((tr[i], br[i], br[j], tr[j]), uv, "emblem"))
        if not closed:
            p.faces.append(((bl[0], br[0], tr[0], tl[0]), uv, "emblem"))
            p.faces.append(((tl[-1], tr[-1], br[-1], bl[-1]), uv, "emblem"))

    # outline: offset curves of one centre line keep matching vertex counts
    centre = dense(diamond(a), True)
    m = len(centre)
    outer, inner = [], []
    for i in range(m):
        (xa, za), (xb, zb) = centre[i - 1], centre[(i + 1) % m]
        tx, tz = xb - xa, zb - za
        ln = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / ln, tx / ln  # outward for this clockwise loop
        x, z = centre[i]
        outer.append((x + nx * sw / 2, z + nz * sw / 2))
        inner.append((x - nx * sw / 2, z - nz * sw / 2))
    ribbon(outer, inner, True)
    # chevron: apex at the centre, arms parallel to the upper edges, ending on the lower edges
    c0 = EMBLEM["chevron_apex"]
    t_end = (a + c0) / 2 - sw * 0.5
    line = dense([(-t_end, c0 - t_end), (0.0, c0), (t_end, c0 - t_end)], closed=False)
    up, dn = [], []
    for i, (x, z) in enumerate(line):
        if abs(x) < 1e-6:
            up.append((0.0, z + sw / 2 * math.sqrt(2)))
            dn.append((0.0, z - sw / 2 * math.sqrt(2)))
            continue
        sx = 1 if x > 0 else -1  # arm direction (sx, -1); its upper normal is (sx, 1)
        up.append((x + 0.7071 * sw / 2 * sx, z + 0.7071 * sw / 2))
        dn.append((x - 0.7071 * sw / 2 * sx, z - 0.7071 * sw / 2))
    ribbon(up, dn, False)
    return [p]


# ----------------------------------------------------------------------------------------- assembly
LODS = {0: 1.0, 1: 0.58, 2: 0.25}


def build_parts(lod: int):
    res = LODS[lod]
    detail = lod == 0
    mid = lod <= 1
    parts = []
    parts += coat_shell(res) + collar(res) + lapels(res) + yoke(res) + belt(res, detail=mid) + sleeves(res, detail=mid)
    parts += hood(res) + faceplate(res) + emblem(res) + gloves(res) + boots(res, detail=mid) + trousers(res)
    parts += shirt(res, detail=mid) + pockets(res, detail=mid)
    if mid:
        parts += storm_flap(res) + epaulettes(res)
    if detail:
        parts += buttons(res)
    return parts


# Stitch and seam lines in each UV group's own [0,1]^2 space (drawn by contestant_textures.py).
def coat_u(side, th_deg, z):
    th0 = coat_open(z)
    t = (abs(th_deg) - th0) / (180.0 - th0)
    return 0.5 * t if side > 0 else 1.0 - 0.5 * t


def stitch_lines():
    L = {g: {"stitch": [], "seam": []} for g in GROUP_SIZE}
    zs = [Z_HEM + (Z_COAT_TOP - Z_HEM) * k / 60 for k in range(61)]
    vz = lambda z: (z - Z_HEM) / (Z_COAT_TOP - Z_HEM)  # noqa: E731
    for side in (1, -1):
        # side seams and princess seams follow constant angles
        for th, kind in ((96, "seam"), (140, "seam"), (35 if side else 35, "seam")):
            line = [(coat_u(side, th, z), vz(z)) for z in zs if coat_open(z) < th - 3]
            if len(line) > 1:
                L["coat"][kind].append(line)
                L["coat"]["stitch"].append([(u + (0.004 if side > 0 else -0.004), v) for u, v in line])
        # topstitching along the front opening edge and hem
        L["coat"]["stitch"].append([(coat_u(side, coat_open(z) + 2.2, z), vz(z)) for z in zs])
        L["coat"]["stitch"].append([(coat_u(side, th, Z_HEM + 0.012), 0.022) for th in range(int(coat_open(Z_HEM)) + 2, 180, 3)])
        # under-belt gathers read as a seam line at the waist
        L["coat"]["seam"].append([(coat_u(side, th, Z_BELT - 0.025), vz(Z_BELT - 0.025)) for th in range(int(coat_open(Z_BELT)) + 1, 180, 3)])
    L["coat"]["seam"].append([(0.5, v) for v in (vz(Z_VENT), 1.0)])
    L["coat"]["stitch"] += [[(0.493, v) for v in (vz(Z_VENT), 1.0)], [(0.507, v) for v in (vz(Z_VENT), 1.0)]]
    L["coat"]["stitch"].append([(0.47, vz(Z_VENT) + 0.02), (0.5, vz(Z_VENT) + 0.07), (0.53, vz(Z_VENT) + 0.02)])  # vent bar tack
    # hood: centre-back seam, crown seam and topstitching around the face opening
    L["hood"]["seam"] += [[(0.5, v) for v in (0.25, 1.0)]]
    L["hood"]["stitch"] += [[(0.49, v) for v in (0.25, 1.0)], [(0.51, v) for v in (0.25, 1.0)]]
    L["hood"]["stitch"] += [[(0.02, v / 20) for v in range(21)], [(0.98, v / 20) for v in range(21)]]
    L["hood"]["stitch"] += [[(u / 40, 0.035) for u in range(41)]]
    for g in ("collar", "lapel", "yoke", "flap", "pocket", "storm", "epaulette", "cuff", "patch"):
        m = 0.07 if g not in ("collar", "yoke") else 0.05
        L[g]["stitch"].append([(m, m), (1 - m, m), (1 - m, 1 - m), (m, 1 - m), (m, m)])
    L["collar"]["stitch"].append([(0.0, 0.82), (1.0, 0.82)])
    L["sleeve"]["seam"].append([(0.5, 0.0), (0.5, 1.0)])
    L["sleeve"]["stitch"] += [[(0.48, 0.0), (0.48, 1.0)], [(0.52, 0.0), (0.52, 1.0)], [(0.0, 0.11), (1.0, 0.11)]]
    L["sleeve"]["seam"].append([(0.0, 0.10), (1.0, 0.10)])
    L["belt"]["stitch"] += [[(0.0, 0.18), (1.0, 0.18)], [(0.0, 0.82), (1.0, 0.82)]]
    L["boot"]["stitch"] += [[(0.0, 0.3), (1.0, 0.3)], [(0.0, 0.85), (1.0, 0.85)]]
    L["glove"]["seam"] += [[(0.25, 0.1), (0.25, 0.9)], [(0.75, 0.1), (0.75, 0.9)]]
    L["trouser"]["seam"] += [[(0.25, 0.0), (0.25, 1.0)], [(0.75, 0.0), (0.75, 1.0)]]
    return L
