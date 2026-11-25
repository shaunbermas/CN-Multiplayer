"""Prompt 06: build THE WATCHER, Stage 01's original robotic-doll enemy (decision 023).

Saves blender/scenes/THE_WATCHER.blend: one skinned game mesh with rigid (single-bone) weights, a
`Watcher_` armature, signal-state lenses, gameplay anchors, a LOD1 mesh, material swatches and nine
animation clips. Height 28 m (spec L9 / decision 014); origin at the feet (ground centre); faces -Y.

Design (original; see docs/THE_WATCHER_SPEC.md): an antique toy automaton at monument scale. Ivory
porcelain head with one recessed camera-lens eye (the other eye sealed shut), swept-back lacquered
hair tied in a bun, deep-teal enamel coat with brass buttons and a charcoal sash, a visible waist
turret ring (the upper body turns on it), a brass wind-up key in its back, porcelain limbs on steel
ball joints, heavy iron boots. It deliberately avoids the retired doll concept's bob-and-pigtails,
yellow top, orange pinafore and strap shoes.

Signal states: three lens discs (neutral, red, green) and matching rear status lights are weighted to
`Watcher_LensNeutral` / `_LensRed` / `_LensGreen`; clips show one state by scaling the others to 1 %.
The emissive materials (MAT_Watcher_Lens_*) can also be driven directly by the runtime. No detection
or elimination logic is in this file: the server owns it.

    python blender/scripts/watcher_build.py
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
TEX = ROOT / "blender/textures/WATCHER"
OUT = ROOT / "blender/scenes/THE_WATCHER.blend"
FPS = 24
HEIGHT = 28.0

# ----------------------------------------------------------------------------------- materials
MATS = {
    "MAT_Watcher_Porcelain": ("T_W_Porcelain", 3.0, {}),
    "MAT_Watcher_EnamelTeal": ("T_W_EnamelTeal", 3.0, {}),
    "MAT_Watcher_Brass": ("T_W_Brass", 1.5, {}),
    "MAT_Watcher_SteelDark": ("T_W_SteelDark", 1.5, {}),
    "MAT_Watcher_Rubber": ("T_W_Rubber", 1.5, {}),
    "MAT_Watcher_Textile": ("T_W_Textile", 1.2, {}),
    "MAT_Watcher_HairLacquer": ("T_W_HairLacquer", 4.0, {}),
    "MAT_Watcher_LensGlass": (None, 1.0, {"colour": (0.004, 0.006, 0.008), "rough": 0.05, "metal": 0.0}),
    "MAT_Watcher_Seam": (None, 1.0, {"colour": (0.02, 0.016, 0.012), "rough": 0.9, "metal": 0.0}),
    "MAT_Watcher_FiberOptic": (None, 1.0, {"colour": (0.03, 0.05, 0.07), "emit": (0.25, 0.6, 1.0), "strength": 0.55, "rough": 0.3}),
    "MAT_Watcher_EyeWhite": (None, 1.0, {"colour": (0.72, 0.7, 0.64), "rough": 0.12}),
    "MAT_Watcher_Iris": (None, 1.0, {"colour": (0.05, 0.035, 0.03), "rough": 0.15}),
    "MAT_Watcher_LipPaint": (None, 1.0, {"colour": (0.36, 0.16, 0.14), "rough": 0.55}),
    "MAT_Watcher_Lens_Neutral": (None, 1.0, {"colour": (0.3, 0.33, 0.35), "emit": (0.75, 0.85, 0.9), "strength": 1.2, "rough": 0.1}),
    "MAT_Watcher_Lens_Red": (None, 1.0, {"colour": (0.4, 0.02, 0.02), "emit": (1.0, 0.02, 0.01), "strength": 2.0, "rough": 0.1}),
    "MAT_Watcher_Lens_Green": (None, 1.0, {"colour": (0.02, 0.35, 0.08), "emit": (0.05, 1.0, 0.25), "strength": 1.8, "rough": 0.1}),
}


def make_material(name):
    tex, tile, o = MATS[name]
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat["uv_tile_m"] = tile
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = o.get("rough", 0.8)
    bsdf.inputs["Metallic"].default_value = o.get("metal", 0.0)
    bsdf.inputs["Base Color"].default_value = (*o.get("colour", (0.5, 0.5, 0.5)), 1)
    mat.diffuse_color = (*o.get("colour", (0.4, 0.4, 0.4)), 1)

    def img(suffix, non_color):
        p = TEX / f"{tex}_{suffix}.png"
        if not p.exists():
            return None
        im = bpy.data.images.get(p.name) or bpy.data.images.load(str(p))
        im.name = p.name
        im.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = im
        return node

    if tex:
        bc = img("BC", False)
        nt.links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])
        orm = img("ORM", True)
        if orm:
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
            nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
            nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        nrm = img("N", True)
        if nrm:
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if name == "MAT_Watcher_HairLacquer":
        mat.use_backface_culling = False  # the hair ribbons are seen from both sides (glTF doubleSided)
    if "emit" in o:
        bsdf.inputs["Emission Color"].default_value = (*o["emit"], 1)
        bsdf.inputs["Emission Strength"].default_value = o["strength"]
    return mat


# ----------------------------------------------------------------------------------- mesh builder
class Body:
    """One bmesh; every part belongs to one bone (rigid weight 1.0) and one material."""

    def __init__(self):
        self.bm = bmesh.new()
        self.dl = self.bm.verts.layers.deform.verify()
        self.uv = self.bm.loops.layers.uv.verify()
        self.groups: list[str] = []
        self.mats: list[str] = []
        self.project: set = set()  # faces that get box-projected UVs at the end

    def _g(self, bone):
        if bone not in self.groups:
            self.groups.append(bone)
        return self.groups.index(bone)

    def _m(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _v(self, p, gi):
        v = self.bm.verts.new(Vector(p))
        v[self.dl][gi] = 1.0
        return v

    def lathe(self, p0, axis, prof, mat, bone, seg=24, sx=1.0, sy=1.0, cap0=True, cap1=True,
              wobble=None, keep=None, side=None, smooth=True):
        """Surface of revolution: prof = [(t, r)] along `axis` from p0. sx/sy scale the cross-section
        (for vertical axes: X and Y). wobble(theta) multiplies r (pleats). keep(face_centre) culls."""
        p0, d = Vector(p0), Vector(axis).normalized()
        a = Vector(side) if side else (Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0)))
        a = (a - d * a.dot(d)).normalized()
        b = d.cross(a).normalized()
        gi, mi = self._g(bone), self._m(mat)
        tile = MATS[mat][1]
        rmax = max(r for _, r in prof) * max(sx, sy)
        U = max(1, round(2 * math.pi * rmax / tile))
        rings = []
        for t, r in prof:
            ring = []
            for i in range(seg):
                th = 2 * math.pi * i / seg
                rr = r * (wobble(th) if wobble else 1.0)
                ring.append(self._v(p0 + d * t + a * (math.cos(th) * rr * sx) + b * (math.sin(th) * rr * sy), gi))
            rings.append(ring)
        faces = []
        for k in range(len(prof) - 1):
            for i in range(seg):
                j = (i + 1) % seg
                f = self.bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
                f.material_index, f.smooth = mi, smooth
                for loop, (u, v) in zip(f.loops, ((i, prof[k][0]), (i + 1, prof[k][0]), (i + 1, prof[k + 1][0]), (i, prof[k + 1][0]))):
                    loop[self.uv].uv = (u / seg * U, v / tile)
                faces.append(f)
        for cap, ring, flip in ((cap0, rings[0], True), (cap1, rings[-1], False)):
            if cap and prof[0 if flip else -1][1] > 1e-6:
                f = self.bm.faces.new(list(reversed(ring)) if flip else ring)
                f.material_index = mi
                self.project.add(f)
                faces.append(f)
        if keep:
            dead = [f for f in faces if not keep(f.calc_center_median())]
            bmesh.ops.delete(self.bm, geom=dead, context="FACES")
            faces = [f for f in faces if f.is_valid]
        self._outward(faces, p0, d)
        return faces

    def _outward(self, faces, p0, d):
        """Point lathe normals away from the axis (closed or open)."""
        for f in faces:
            if not f.is_valid:
                continue
            c = f.calc_center_median()
            rel = c - p0
            radial = rel - d * rel.dot(d)
            if radial.length < 1e-6:
                continue
            if f.normal.dot(radial) < 0 and abs(f.normal.dot(d)) < 0.95:
                f.normal_flip()

    def ellipsoid(self, c, radii, mat, bone, seg=20, rings=12, keep=None):
        c = Vector(c)
        prof = [(-radii[2] * math.cos(math.pi * k / rings), radii[0] * math.sin(math.pi * k / rings)) for k in range(rings + 1)]
        prof[0] = (prof[0][0], 0.0)
        prof[-1] = (prof[-1][0], 0.0)
        faces = self._ellip(c, prof, radii, mat, bone, seg, keep)
        return faces

    def _ellip(self, c, prof, radii, mat, bone, seg, keep):
        # lathe with collapsed poles
        gi, mi = self._g(bone), self._m(mat)
        tile = MATS[mat][1]
        U = max(1, round(2 * math.pi * max(radii[0], radii[1]) / tile))
        sy = radii[1] / radii[0]
        bottom = self._v(c + Vector((0, 0, prof[0][0])), gi)
        top = self._v(c + Vector((0, 0, prof[-1][0])), gi)
        rings = []
        for t, r in prof[1:-1]:
            rings.append([self._v(c + Vector((math.cos(2 * math.pi * i / seg) * r, math.sin(2 * math.pi * i / seg) * r * sy, t)), gi) for i in range(seg)])
        faces = []
        vs = [t for t, _ in prof]

        def uvset(f, pts):
            for loop, (u, v) in zip(f.loops, pts):
                loop[self.uv].uv = (u / seg * U, v / tile)

        for i in range(seg):
            j = (i + 1) % seg
            f = self.bm.faces.new((bottom, rings[0][j], rings[0][i]))
            uvset(f, ((i + 0.5, vs[0]), (i + 1, vs[1]), (i, vs[1])))
            faces.append(f)
            for k in range(len(rings) - 1):
                f = self.bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
                uvset(f, ((i, vs[k + 1]), (i + 1, vs[k + 1]), (i + 1, vs[k + 2]), (i, vs[k + 2])))
                faces.append(f)
            f = self.bm.faces.new((rings[-1][i], rings[-1][j], top))
            uvset(f, ((i, vs[-2]), (i + 1, vs[-2]), (i + 0.5, vs[-1])))
            faces.append(f)
        for f in faces:
            f.material_index, f.smooth = mi, True
        if keep:
            dead = [f for f in faces if not keep(f.calc_center_median())]
            bmesh.ops.delete(self.bm, geom=dead, context="FACES")
            faces = [f for f in faces if f.is_valid]
        for f in faces:
            if f.normal.dot(f.calc_center_median() - c) < 0:
                f.normal_flip()
        return faces

    def cyl(self, p0, p1, r0, mat, bone, seg=12, r1=None, caps=True):
        p0, p1 = Vector(p0), Vector(p1)
        L = (p1 - p0).length
        return self.lathe(p0, p1 - p0, [(0, r0), (L, r0 if r1 is None else r1)], mat, bone, seg=seg, cap0=caps, cap1=caps)

    def box(self, mn, mx, mat, bone):
        mn, mx = Vector(mn), Vector(mx)
        gi, mi = self._g(bone), self._m(mat)
        v = [self._v((mx.x if i & 1 else mn.x, mx.y if i & 2 else mn.y, mx.z if i & 4 else mn.z), gi) for i in range(8)]
        faces = [self.bm.faces.new([v[i] for i in f]) for f in [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]]
        for f in faces:
            f.material_index = mi
            self.project.add(f)
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        return faces

    def beam(self, p0, p1, w, h, mat, bone, up=(0, 0, 1)):
        p0, p1 = Vector(p0), Vector(p1)
        d = (p1 - p0).normalized()
        upv = Vector(up) if abs(d.dot(Vector(up))) < 0.95 else Vector((1, 0, 0))
        s = d.cross(upv).normalized()
        u = s.cross(d).normalized()
        gi, mi = self._g(bone), self._m(mat)
        pts = [self._v(p + s * a * w / 2 + u * c * h / 2, gi) for p in (p0, p1) for a, c in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        A, B = pts[:4], pts[4:]
        faces = [self.bm.faces.new((A[3], A[2], A[1], A[0])), self.bm.faces.new(B)]
        for i in range(4):
            j = (i + 1) % 4
            faces.append(self.bm.faces.new((A[i], A[j], B[j], B[i])))
        for f in faces:
            f.material_index = mi
            self.project.add(f)
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        return faces

    def mesh(self, name, materials):
        for f in self.project:
            if not f.is_valid:
                continue
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            t = MATS[self.mats[f.material_index]][1]
            for loop in f.loops:
                p = loop.vert.co
                loop[self.uv].uv = (p.x / t, p.y / t) if ax == 2 else ((p.y / t, p.z / t) if ax == 0 else (p.x / t, p.z / t))
        loose = [v for v in self.bm.verts if not v.link_faces]
        bmesh.ops.delete(self.bm, geom=loose, context="VERTS")
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(materials[m])
        return me


# ----------------------------------------------------------------------------------- proportions
HEAD_C = Vector((0.0, 0.0, 23.95))
HEAD_R = (3.4, 3.2, 3.75)         # x (width/2), y (depth/2), z (height/2); with the hair the crown is at exactly 28 m
EYE_R_X, EYE_Z = -1.3, 23.6        # the lens sits in the character's right eye (-X when facing -Y)
SHOULDER = 3.6
HIP = 1.45


def head_surface_y(x, z, pad=0.0):
    """Front surface (-Y) of the head ellipsoid at (x, z)."""
    rx, ry, rz = HEAD_R[0] + pad, HEAD_R[1] + pad, HEAD_R[2] + pad
    k = 1 - (x / rx) ** 2 - ((z - HEAD_C.z) / rz) ** 2
    return -ry * math.sqrt(max(k, 0.0))


def hash01(n: int) -> float:
    """Deterministic pseudo-random number in [0, 1) (the build must be reproducible)."""
    x = math.sin(n * 12.9898 + 78.233) * 43758.5453
    return x - math.floor(x)


def _g(x, z, cx, cz, sx, sz):
    return math.exp(-((x - cx) / sx) ** 2 - ((z - cz) / sz) ** 2)


def face_disp(x, z):
    """Forward relief of the sculpted doll face, in metres (decision 039)."""
    d = 0.0
    for s in (-1, 1):
        d -= 0.3 * _g(x, z, s * 1.3, 23.58, 0.9, 0.62)                                      # eye sockets
        d -= 0.07 * _g(x, z, s * 0.55, 23.45, 0.22, 0.3)                                    # inner corners beside the bridge
        d += 0.06 * _g(x, z, s * 1.35, 22.95, 0.6, 0.16)                                    # lower lid
        d += 0.17 * _g(x, z, s * 1.3, 24.4, 1.05, 0.32)                                    # brow ridge
        d += 0.17 * _g(x, z, s * 1.9, 22.85, 0.6, 0.45)                                     # cheekbones
        d -= 0.11 * _g(x, z, s * 1.55, 21.85, 0.5, 0.45)                                    # cheek hollows
        d += 0.09 * _g(x, z, s * 0.3, 22.72, 0.2, 0.16)                                     # nostril wings
        d -= 0.06 * _g(x, z, s * 0.62, 21.95, 0.16, 0.2)                                    # mouth corners
    d += 0.2 * _g(x, z, 0, 22.95, 0.3, 0.5) + 0.08 * _g(x, z, 0, 23.65, 0.24, 0.5)        # base under the nose mesh
    d += 0.17 * _g(x, z, 0, 22.17, 0.55, 0.14)                                               # upper lip
    d += 0.2 * _g(x, z, 0, 21.72, 0.45, 0.15)                                                # lower lip
    d -= 0.12 * _g(x, z, 0, 21.93, 0.5, 0.06)                                                # parting of the lips
    d += 0.22 * _g(x, z, 0, 20.95, 0.55, 0.36)                                               # chin
    return d


EYE_HOLE = (0.62, 0.36)   # half width and half height of each eye opening (decision 040)
EYE_BALL = 0.66


def in_eye_hole(c) -> bool:
    if c.y > -1.0:
        return False
    for ex in (EYE_R_X, -EYE_R_X):
        if ((c.x - ex) / EYE_HOLE[0]) ** 2 + ((c.z - EYE_Z) / EYE_HOLE[1]) ** 2 < 1.0:
            return True
    return False


def _front(x, z):
    y = head_surface_y(x, z)
    return min(1.0, max(0.0, -y / HEAD_R[1] * 1.7 - 0.35))


def face_y(x, z):
    """Front surface (-Y) of the sculpted face at (x, z)."""
    return head_surface_y(x, z) - face_disp(x, z) * _front(x, z)


def face_normal(x, z, e=0.02):
    dydx = (face_y(x + e, z) - face_y(x - e, z)) / (2 * e)
    dydz = (face_y(x, z + e) - face_y(x, z - e)) / (2 * e)
    return Vector((dydx, -1.0, dydz)).normalized()


# cracks: start x, start z, heading (radians), segments
CRACKS = [(-0.4, 25.6, -1.9, 9), (0.9, 25.4, -1.2, 7), (2.3, 24.0, -1.7, 8), (-2.4, 22.9, -1.4, 6), (0.35, 24.1, -1.3, 5),
          (-0.9, 21.3, -1.8, 4), (1.2, 21.0, -1.5, 4), (-1.9, 25.0, -2.3, 5), (2.6, 22.6, -2.0, 4)]


def hair_strands(b: Body, mat):
    """Long, messy hair: tapered ribbons from the parting and the crown down to the shoulders, with curtains
    that cover the sides of the face (decision 039). A shoulder-length fall with a centre parting, deliberately
    not the retired concept's straight bob, fringe or pigtails."""
    gi, mi = b._g("Watcher_Head"), b._m(mat)
    tile = MATS[mat][1]
    rx, ry, rz = HEAD_R[0] + 0.24, HEAD_R[1] + 0.26, HEAD_R[2] + 0.22
    c = HEAD_C + Vector((0, 0.05, 0.1))

    def shell(phi, z, off):
        # over the dome the hair follows the skull; below the widest point it hangs straight down
        k = math.sqrt(max(0.0, 1 - ((z - c.z) / rz) ** 2)) if z > c.z else 1.0
        return Vector((math.sin(phi) * (rx + off) * k, c.y - math.cos(phi) * (ry + off) * k, z))

    strands = []
    # front curtains from the parting, swept over the temples and down past the cheeks
    for s in (-1, 1):
        for i in range(16):
            u = i / 15
            strands.append((s, s * (0.06 + 0.25 * u), s * (0.8 + 0.35 * u + 0.08 * hash01(i * 7 + (s > 0))), 27.85 - 0.4 * u, 18.9 + 0.9 * hash01(i * 11 + 3 + (s > 0)), 0.05 + 0.12 * u, 0.5))
    # sides and back
    for i in range(54):
        phi = 2 * math.pi * (i + 0.5) / 54
        if math.cos(phi) > 0.86:  # phi = 0 is the front: leave the face free; the curtains frame it
            continue
        back = math.cos(phi) < -0.8  # around the rear control housing the hair stops above it
        end = 24.0 if back else 18.6 + 1.0 * hash01(i * 13)
        strands.append((0, phi, phi + 0.08 * (hash01(i * 17) - 0.5), 27.9 - 0.3 * hash01(i), end, 0.02 + 0.1 * hash01(i * 19), 0.62))
    # a messy outer layer and a few strays over the face's edge
    for i in range(26):
        phi = 2 * math.pi * hash01(900 + i)
        if math.cos(phi) > 0.7:
            phi = math.copysign(0.8 + 0.3 * hash01(950 + i), math.sin(phi) or 1)
        strands.append((0, phi, phi + 0.25 * (hash01(920 + i) - 0.5), 27.6, 19.0 + 1.2 * hash01(940 + i), 0.2 + 0.08 * hash01(960 + i), 0.38))
    for s in (-1, 1):
        for i in range(4):
            strands.append((s, s * 0.35, s * (0.7 + 0.04 * i), 27.4, 20.4 + 0.6 * hash01(980 + i + (s > 0) * 5), 0.14, 0.16))

    faces = []
    for n, (side, phi0, phi1, z0, z1, off, width) in enumerate(strands):
        segs = 18
        rows = []
        for k in range(segs + 1):
            t = k / segs
            z = z0 + (z1 - z0) * t ** 1.35  # finer steps over the curve of the skull
            phi = phi0 + (phi1 - phi0) * min(1.0, t * 3.0) ** 0.8
            wob = 0.05 * math.sin(t * 7 + n) + 0.04 * math.sin(t * 13 + n * 1.7)
            flare = 0.25 * max(0.0, t - 0.75) / 0.25 * hash01(n * 3)  # ends lift off the shoulders a little
            p = shell(phi + wob * 0.3, z, off + wob + flare)
            tang = Vector((math.cos(phi), math.sin(phi) * (ry / rx), 0))  # around the head
            w = width * (1 - 0.85 * t ** 1.6) * (0.8 + 0.4 * hash01(n * 23))
            mid = p + (p - Vector((c.x, c.y, p.z))).normalized() * 0.05 * w
            rows.append([b._v(p - tang * w / 2, gi), b._v(mid, gi), b._v(p + tang * w / 2, gi)])
        for k in range(segs):
            for j in range(2):
                f = b.bm.faces.new((rows[k][j], rows[k][j + 1], rows[k + 1][j + 1], rows[k + 1][j]))
                f.material_index, f.smooth = mi, True
                for loop, (u, v) in zip(f.loops, ((j, k), (j + 1, k), (j + 1, k + 1), (j, k + 1))):
                    loop[b.uv].uv = (u * 0.5 * width / tile + n * 0.37, v * (z0 - z1) / segs / tile)
                faces.append(f)
    for f in faces:
        cc = f.calc_center_median()
        if f.normal.dot(cc - Vector((c.x, c.y, cc.z))) < 0:
            f.normal_flip()

def ponytail(b: Body, mat):
    """One high ponytail tied at the back of the crown and swept down beside the rear control housing
    (decision 040). A single tail on purpose: not twin pigtails."""
    ctrl = [Vector(p) for p in ((0.35, 3.35, 26.75), (0.9, 4.05, 26.0), (1.45, 4.3, 24.6), (1.8, 4.15, 22.9), (1.95, 3.85, 21.3), (2.05, 3.45, 19.9), (2.25, 3.25, 19.0))]

    def cr(t):  # Catmull-Rom through the control points
        n = len(ctrl) - 1
        u = min(n - 1e-6, max(0.0, t * n))
        i = int(u)
        f = u - i
        p0, p1, p2, p3 = ctrl[max(0, i - 1)], ctrl[i], ctrl[i + 1], ctrl[min(n, i + 2)]
        return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)

    # the tie: a dark band round the gathered hair
    t0 = (cr(0.06) - cr(0.0)).normalized()
    b.lathe(cr(0.02) - t0 * 0.12, t0, [(0, 0.42), (0.1, 0.46), (0.24, 0.46), (0.34, 0.42)], "MAT_Watcher_Rubber", "Watcher_Head", seg=16)
    for k in range(30):
        a = 2 * math.pi * k / 30 + hash01(700 + k)
        rr = 0.1 + 0.22 * hash01(710 + k)
        pts = []
        for j in range(17):
            t = j / 16
            c = cr(t)
            tan = (cr(min(1, t + 0.02)) - cr(max(0, t - 0.02))).normalized()
            s1 = tan.cross(Vector((0, 0, 1))).normalized() if abs(tan.z) < 0.95 else Vector((1, 0, 0))
            s2 = tan.cross(s1).normalized()
            spread = rr * (0.9 + 2.2 * math.sin(math.pi * min(1.0, t * 1.15)) * (1 - 0.6 * t)) + 0.04
            wob = 0.06 * math.sin(t * 9 + k)
            pts.append(c + s1 * math.cos(a) * (spread + wob) + s2 * math.sin(a) * (spread + wob) * 0.8)
        for j, (p0, p1) in enumerate(zip(pts, pts[1:])):
            r = 0.17 * (1 - 0.8 * (j / 16) ** 1.3) + 0.02
            b.cyl(p0, p1, r, mat, "Watcher_Head", seg=5, caps=False)

def hair_shell(b: Body, mat, seg=48, rows=10):
    rx, ry, rz = HEAD_R[0] + 0.18, HEAD_R[1] + 0.2, HEAD_R[2] + 0.2
    c = HEAD_C + Vector((0, 0.05, HEIGHT - HEAD_C.z - HEAD_R[2] - 0.2))
    gi, mi = b._g("Watcher_Head"), b._m(mat)
    tile = MATS[mat][1]

    def hairline(phi):  # phi = 0 at the front (-Y)
        back = (1 - math.cos(phi)) / 2  # 0 front, 1 back
        return c.z + rz * (0.42 - 0.92 * back ** 0.8)  # decision 039: a lower front hairline under the parting

    top = b._v(c + Vector((0, 0, rz)), gi)
    grid = []
    for i in range(seg):
        phi = 2 * math.pi * i / seg
        z0 = hairline(phi)
        col = []
        for k in range(rows):
            z = z0 + (c.z + rz * 0.985 - z0) * (k / (rows - 1)) ** 0.9
            rr = math.sqrt(max(1e-6, 1 - ((z - c.z) / rz) ** 2))
            col.append(b._v((c.x + math.sin(phi) * rx * rr, c.y - math.cos(phi) * ry * rr, z), gi))
        grid.append(col)
    faces = []
    for i in range(seg):
        j = (i + 1) % seg
        for k in range(rows - 1):
            f = b.bm.faces.new((grid[i][k], grid[i][k + 1], grid[j][k + 1], grid[j][k]))
            for loop, (u, v) in zip(f.loops, ((i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k))):
                loop[b.uv].uv = (u / seg * 6, v / rows * 2)
            faces.append(f)
        f = b.bm.faces.new((grid[i][-1], top, grid[j][-1]))
        faces.append(f)
    for f in faces:
        f.material_index, f.smooth = mi, True
        if f.normal.dot(f.calc_center_median() - c) < 0:
            f.normal_flip()
    # rolled edge along the hairline
    ring = [grid[i][0] for i in range(seg)]
    for i in range(seg):
        a, bb = ring[i].co, ring[(i + 1) % seg].co
        b.beam(a, bb, 0.22, 0.22, mat, "Watcher_Head", up=tuple((a - c).normalized()))


def build_body(b: Body, side_parts=True):
    P, E, BR, ST, RB, TX, HR = ("MAT_Watcher_Porcelain", "MAT_Watcher_EnamelTeal", "MAT_Watcher_Brass", "MAT_Watcher_SteelDark",
                                "MAT_Watcher_Rubber", "MAT_Watcher_Textile", "MAT_Watcher_HairLacquer")
    seam = "MAT_Watcher_Seam"
    FO = "MAT_Watcher_FiberOptic"
    # --- head (decisions 038-039, owner 25 Nov 2026: "do it exactly like this" with a reference image). A sculpted
    # porcelain doll face (sockets, brow, nose, cheekbones, parted lips, chin) on the same head ellipsoid, long messy
    # hair that covers the sides of the face, a stapled-shut eye with a steel pin, a ringed camera-lens eye, cracks,
    # and exposed fiber-optic lines in a broken cheek and at the neck. Rear control housing and status lights unchanged.
    head = b.ellipsoid(HEAD_C, HEAD_R, P, "Watcher_Head", seg=72, rings=52, keep=lambda c: not in_eye_hole(c))
    hv = {v for f in head for v in f.verts}
    for v in hv:
        if v.co.y < 0:
            v.co.y = face_y(v.co.x, v.co.z) if v.co.y < -0.05 else v.co.y
    hair_shell(b, HR)
    hair_strands(b, HR)
    ponytail(b, HR)
    b.box((-1.2, 3.05, 22.4), (1.2, 3.45, 23.6), ST, "Watcher_Head")
    for k in range(4):
        b.box((-1.0, 3.45, 22.6 + 0.22 * k), (1.0, 3.5, 22.7 + 0.22 * k), BR, "Watcher_Head")
    for i, (bone, mat) in enumerate((("Watcher_LensNeutral", "MAT_Watcher_Lens_Neutral"), ("Watcher_LensRed", "MAT_Watcher_Lens_Red"),
                                      ("Watcher_LensGreen", "MAT_Watcher_Lens_Green"))):
        for x in (-0.6, 0.0, 0.6):  # rear status lights, one set per signal state
            b.box((x - 0.15, 3.38 + 0.004 * i, 23.62), (x + 0.15, 3.46 + 0.004 * i, 23.86), mat, bone)

    def on_face(x, z, lift=0.0):
        return Vector((x, face_y(x, z), z)) + face_normal(x, z) * lift

    def seam_path(pts, w=0.07, h=0.07, mat=seam, lift=0.0, bone="Watcher_Head"):
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            b.beam(on_face(x0, z0, lift), on_face(x1, z1, lift), w, h, mat, bone, up=tuple(face_normal((x0 + x1) / 2, (z0 + z1) / 2)))

    def face_disc(cx, cz, rx, rz, lift, mat, seg=24, jag=0.0, seed=0):
        """A thin patch lying on the face (fan), optionally with a jagged edge."""
        gi, mi = b._g("Watcher_Head"), b._m(mat)
        c = b._v(on_face(cx, cz, lift), gi)
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            j = 1 + jag * (hash01(seed * 131 + k) - 0.5) * 2
            ring.append(b._v(on_face(cx + math.cos(a) * rx * j, cz + math.sin(a) * rz * j, lift), gi))
        for k in range(seg):
            f = b.bm.faces.new((c, ring[(k + 1) % seg], ring[k]))
            f.material_index, f.smooth = mi, True
            b.project.add(f)
            if f.normal.dot(face_normal(cx, cz)) < 0:
                f.normal_flip()

    def tube(pts, r, mat, bone, seg=4):
        for p0, p1 in zip(pts, pts[1:]):
            b.cyl(p0, p1, r, mat, bone, seg=seg, caps=False)

    # two doll eyes (decision 040): eyeballs set in the cut-out sockets, a lid rim with an upper lid and lashes,
    # a dark iris and a pupil that glows with the signal state. The right eye rides on `Watcher_Eye` (its anchors
    # are unchanged); the pupils of both eyes are weighted to the three lens-state bones.
    EW, IR, LIP = "MAT_Watcher_EyeWhite", "MAT_Watcher_Iris", "MAT_Watcher_LipPaint"
    states = (("Watcher_LensNeutral", "MAT_Watcher_Lens_Neutral"), ("Watcher_LensRed", "MAT_Watcher_Lens_Red"), ("Watcher_LensGreen", "MAT_Watcher_Lens_Green"))
    for side in (-1, 1):
        ex = side * abs(EYE_R_X)
        bone = "Watcher_Eye" if ex == EYE_R_X else "Watcher_Head"
        n = face_normal(ex, EYE_Z)
        e0 = Vector((ex, face_y(ex, EYE_Z), EYE_Z))
        gaze = (n + Vector((0, 0, -0.12)) + Vector((-ex * 0.04, 0, 0))).normalized()  # looking down at the field, slightly inward
        cc = e0 - n * 0.42
        # a dark cup behind the opening, so nothing shows through round the eyeball
        b.ellipsoid(cc - n * 0.15, (EYE_HOLE[0] + 0.4, 0.55, EYE_HOLE[1] + 0.4), seam, "Watcher_Head", seg=16, rings=8)
        b.ellipsoid(cc, (EYE_BALL, EYE_BALL, EYE_BALL), EW, bone, seg=28, rings=18)
        front = cc + gaze * EYE_BALL
        b.lathe(front - gaze * 0.06, gaze, [(0, 0.36), (0.045, 0.335), (0.06, 0.0)], IR, bone, seg=28, cap0=False, cap1=False)
        b.lathe(front - gaze * 0.02, gaze, [(0.0, 0.2), (0.04, 0.19), (0.05, 0.0)], seam, bone, seg=20, cap0=False, cap1=False)
        for i, (sb, sm) in enumerate(states):  # glowing pupil, one disc per signal state
            b.lathe(front + gaze * (0.035 + 0.004 * i), gaze, [(0.0, 0.15), (0.012, 0.0)], sm, sb, seg=20, cap0=False, cap1=False)
        # lid rim: a soft porcelain ring round the opening, thicker on top (the upper lid), and lashes
        ring = []
        for k in range(33):
            a = 2 * math.pi * k / 32
            up = max(0.0, math.sin(a))
            ring.append((ex + math.cos(a) * (EYE_HOLE[0] + 0.03), EYE_Z + math.sin(a) * (EYE_HOLE[1] + 0.03 + 0.06 * up), up))
        for (x0, z0, u0), (x1, z1, u1) in zip(ring, ring[1:]):
            w = 0.16 + 0.12 * (u0 + u1) / 2
            b.beam(on_face(x0, z0, 0.02 + 0.06 * u0), on_face(x1, z1, 0.02 + 0.06 * u1), w, 0.13 + 0.08 * (u0 + u1) / 2, P, "Watcher_Head",
                   up=tuple(face_normal(x0, z0)))
        for k in range(11):
            a = math.pi * (0.12 + 0.76 * k / 10)
            lx0 = ex + math.cos(a) * (EYE_HOLE[0] + 0.1)
            lz0 = EYE_Z + math.sin(a) * (EYE_HOLE[1] + 0.1)
            out = 0.16 + 0.06 * math.sin(a)
            p0 = on_face(lx0, lz0, 0.16)
            p1 = on_face(lx0 + math.cos(a) * out * 0.5, lz0 + out * 0.5, 0.32)
            b.beam(p0, p1, 0.035, 0.025, HR, "Watcher_Head")
        # crease above the lid and a tired lower lid
        seam_path([(ex + math.cos(a) * (EYE_HOLE[0] + 0.28), EYE_Z + 0.08 + math.sin(a) * (EYE_HOLE[1] + 0.28)) for a in [math.pi * (0.1 + 0.8 * k / 12) for k in range(13)]],
                  0.04, 0.035, lift=0.0)
        seam_path([(ex + math.cos(a) * (EYE_HOLE[0] + 0.12), EYE_Z - 0.06 + math.sin(a) * (EYE_HOLE[1] + 0.22)) for a in [math.pi * (1.2 + 0.6 * k / 8) for k in range(9)]],
                  0.03, 0.03, lift=0.0)

    # a real nose: bridge, tip, wings and nostrils (sculpted parts, not paint)
    def ell(x, z, lift, r, mat=P, seg=14, rings=8):
        b.ellipsoid(on_face(x, z, lift), r, mat, "Watcher_Head", seg=seg, rings=rings)
    ell(0, 23.45, -0.1, (0.17, 0.2, 0.62))
    ell(0, 23.1, 0.0, (0.2, 0.26, 0.42))
    ell(0, 22.8, 0.04, (0.21, 0.23, 0.2), seg=16, rings=10)
    for s in (-1, 1):
        ell(s * 0.2, 22.72, -0.02, (0.15, 0.15, 0.13))
        b.ellipsoid(on_face(s * 0.11, 22.62, 0.12), (0.06, 0.05, 0.035), seam, "Watcher_Head", seg=8, rings=4)

    # real lips, slightly parted: swept tubes with a cupid's bow, painted a faded rose, over a dark mouth
    def sweep(pts, rads, mat, seg=10):
        gi, mi = b._g("Watcher_Head"), b._m(mat)
        rings_ = []
        for k, ((x, z, lift), (rh, rd)) in enumerate(zip(pts, rads)):
            p = on_face(x, z, lift)
            nn = face_normal(x, z)
            xa, za = pts[max(0, k - 1)][:2]
            xb, zb = pts[min(len(pts) - 1, k + 1)][:2]
            t = (on_face(xb, zb) - on_face(xa, za)).normalized()
            bb = t.cross(nn).normalized()
            rings_.append([b._v(p + nn * math.cos(2 * math.pi * j / seg) * rd + bb * math.sin(2 * math.pi * j / seg) * rh, gi) for j in range(seg)])
        fs = []
        for k in range(len(rings_) - 1):
            for j in range(seg):
                jj = (j + 1) % seg
                f = b.bm.faces.new((rings_[k][j], rings_[k][jj], rings_[k + 1][jj], rings_[k + 1][j]))
                f.material_index, f.smooth = mi, True
                b.project.add(f)
                fs.append(f)
        for f in fs:
            cen = f.calc_center_median()
            axis = min(range(len(pts)), key=lambda q: (on_face(pts[q][0], pts[q][1], pts[q][2]) - cen).length)
            if f.normal.dot(cen - on_face(pts[axis][0], pts[axis][1], pts[axis][2])) < 0:
                f.normal_flip()
    MZ = 21.93
    face_disc(0, MZ, 0.42, 0.07, 0.03, seam, seg=20)
    xs = [-0.55 + 1.1 * k / 12 for k in range(13)]
    sweep([(x, MZ + 0.11 + 0.035 * (1 - abs(abs(x) - 0.14) / 0.14) * (abs(x) < 0.28) - 0.06 * (abs(x) / 0.55) ** 2, 0.03) for x in xs],
          [(0.02 + 0.075 * (1 - (abs(x) / 0.55) ** 2), 0.03 + 0.06 * (1 - (abs(x) / 0.55) ** 2)) for x in xs], LIP)
    xs = [-0.48 + 0.96 * k / 12 for k in range(13)]
    sweep([(x, MZ - 0.12 + 0.07 * (abs(x) / 0.48) ** 2, 0.04) for x in xs],
          [(0.02 + 0.1 * (1 - (abs(x) / 0.48) ** 2), 0.03 + 0.08 * (1 - (abs(x) / 0.48) ** 2)) for x in xs], LIP)
    for k in range(4):  # a hint of upper teeth in the gap
        tx = -0.15 + 0.1 * k
        b.beam(on_face(tx, MZ + 0.05, 0.03), on_face(tx, MZ - 0.01, 0.03), 0.08, 0.03, EW, "Watcher_Head", up=tuple(face_normal(tx, MZ)))
    # philtrum ridges
    for s in (-1, 1):
        b.beam(on_face(s * 0.08, 22.5, 0.03), on_face(s * 0.1, 22.13, 0.04), 0.06, 0.05, P, "Watcher_Head", up=tuple(face_normal(0, 22.3)))

    # cracks across the porcelain (deterministic random walks)
    for k, (x0, z0, ang, n) in enumerate(CRACKS):
        pts, x, z, a = [(x0, z0)], x0, z0, ang
        for i in range(n):
            a += (hash01(k * 37 + i) - 0.5) * 1.1
            step = 0.22 + 0.12 * hash01(k * 53 + i)
            x, z = x + math.cos(a) * step, z + math.sin(a) * step
            pts.append((x, z))
            if i == n // 2:  # a branch
                bx, bz = x + math.cos(a + 0.9) * 0.3, z + math.sin(a + 0.9) * 0.3
                seam_path([(x, z), (bx, bz), (bx + math.cos(a + 0.5) * 0.22, bz + math.sin(a + 0.5) * 0.22)], 0.028, 0.025, lift=0.004)
        seam_path(pts, 0.035, 0.03, lift=0.004)

    # a broken cheek: porcelain chipped away, dark cavity, glowing fiber-optic lines crossing it
    hx, hz = 2.05, 21.75
    face_disc(hx, hz, 0.55, 0.42, 0.012, seam, seg=18, jag=0.28, seed=7)
    for k in range(9):
        a0 = math.pi * (0.15 + 0.7 * hash01(300 + k))
        za = hz - 0.38 + 0.76 * hash01(310 + k)
        p0 = on_face(hx - 0.55, za, 0.02)
        p1 = on_face(hx, hz + (hash01(320 + k) - 0.5) * 0.3, 0.06 + 0.04 * hash01(330 + k))
        p2 = on_face(hx + 0.5, hz - 0.35 + 0.7 * hash01(340 + k), 0.02)
        tube([p0, p0.lerp(p1, 0.5) + face_normal(hx, hz) * 0.02, p1, p1.lerp(p2, 0.5), p2], 0.022, FO, "Watcher_Head")
    for k in range(10):  # chipped shards around the edge
        a0 = 2 * math.pi * k / 10 + hash01(400 + k)
        sx0, sz0 = hx + math.cos(a0) * 0.55, hz + math.sin(a0) * 0.42
        b.beam(on_face(sx0, sz0, 0.02), on_face(sx0 + math.cos(a0) * 0.12, sz0 + math.sin(a0) * 0.1, 0.0), 0.09, 0.04, P, "Watcher_Head", up=tuple(face_normal(sx0, sz0)))

    # fiber-optic bundle under the chin and around the neck turret, feeding the head
    for k in range(14):
        a0 = math.pi * (1.15 + 0.7 * k / 13)  # front half of the neck
        r0 = 1.18
        p0 = Vector((math.cos(a0) * r0, math.sin(a0) * r0, 19.45))
        p1 = Vector((math.cos(a0) * (r0 + 0.12), math.sin(a0) * (r0 + 0.12), 20.0 + 0.2 * hash01(500 + k)))
        p2 = Vector((math.cos(a0) * 1.0, math.sin(a0) * 1.0 - 0.15, 20.75))
        tube([p0, p1, p2], 0.022, FO, "Watcher_Neck")

    # --- neck turret
    b.cyl((0, 0, 19.3), (0, 0, 20.7), 1.1, ST, "Watcher_Neck", seg=16)
    b.cyl((0, 0, 19.9), (0, 0, 20.15), 1.3, BR, "Watcher_Neck", seg=16)
    b.cyl((0, 0, 20.45), (0, 0, 20.6), 1.22, ST, "Watcher_Neck", seg=16)

    # --- torso coat, collar, buttons, sash, waist turret ring, skirt
    tprof = [(0, 2.75), (1.3, 2.9), (3.3, 3.3), (4.6, 3.25), (5.4, 2.6), (5.8, 1.9)]
    b.lathe((0, 0, 13.2), (0, 0, 1), tprof, E, "Watcher_Chest", seg=28, sx=1.1, sy=0.78)
    b.lathe((0, 0, 18.75), (0, 0, 1), [(0, 1.85), (0.5, 1.75), (1.0, 1.65)], TX, "Watcher_Chest", seg=20, cap0=False)

    def torso_r(z):
        t = z - 13.2
        for (t0, r0), (t1, r1) in zip(tprof, tprof[1:]):
            if t0 <= t <= t1:
                return r0 + (r1 - r0) * (t - t0) / (t1 - t0)
        return tprof[-1][1]

    # front placket seam from the collar to the hem, so the garment reads as a buttoned coat
    zs = [18.6, 17.5, 16.3, 15.0, 13.8]
    pts = [(z, -(torso_r(z) * 0.78) - 0.03) for z in zs]
    skirt = [(12.85, 2.8), (10.95, 3.3), (8.55, 3.9), (8.05, 4.0)]
    pts += [(z, -(r * 0.82 * 1.035) - 0.03) for z, r in skirt]
    for (z0, y0), (z1, y1) in zip(pts, pts[1:]):
        b.beam((0, y0, z0), (0, y1, z1), 0.09, 0.06, seam, "Watcher_Chest" if z1 >= 13.0 else "Watcher_Pelvis")
    for x in (-0.95, 0.95):
        for z in (14.3, 15.3, 16.3, 17.3):
            y = -(torso_r(z) * 0.78) * math.sqrt(max(0.0, 1 - (x / (torso_r(z) * 1.1)) ** 2)) - 0.05
            b.ellipsoid((x, y, z), (0.2, 0.12, 0.2), BR, "Watcher_Chest", seg=10, rings=6)
    b.lathe((0, 0, 13.15), (0, 0, 1), [(0, 2.95), (0.65, 2.98)], TX, "Watcher_Spine", seg=28, sx=1.1, sy=0.8)
    b.box((-0.5, -2.52, 13.18), (0.5, -2.3, 13.82), BR, "Watcher_Spine")
    b.lathe((0, 0, 12.85), (0, 0, 1), [(0, 2.9), (0.3, 2.9)], ST, "Watcher_Pelvis", seg=28, sx=1.08, sy=0.82)
    b.lathe((0, 0, 12.85), (0, 0, -1), [(0, 2.8), (1.9, 3.3), (4.3, 3.9), (4.85, 4.0)], E, "Watcher_Pelvis", seg=40, sy=0.82,
            wobble=lambda th: 1 + 0.035 * math.cos(10 * th))
    b.lathe((0, 0, 8.05), (0, 0, -1), [(0, 4.05), (0.3, 4.08)], BR, "Watcher_Pelvis", seg=40, sy=0.82, cap0=False, cap1=False)

    # --- wind-up key (back)
    b.cyl((0, 2.15, 16.3), (0, 3.9, 16.3), 0.3, BR, "Watcher_Key", seg=12)
    b.cyl((0, 2.15, 16.3), (0, 2.45, 16.3), 0.55, BR, "Watcher_Key", seg=12)
    b.ellipsoid((0, 4.0, 16.3), (0.35, 0.3, 0.35), BR, "Watcher_Key", seg=10, rings=6)
    for s in (-1, 1):
        b.ellipsoid((s * 0.95, 4.0, 16.3), (0.75, 0.22, 0.6), BR, "Watcher_Key", seg=14, rings=8)

    for s, sfx in ((1, "L"), (-1, "R")):
        # shoulder cap and arm
        b.ellipsoid((s * 3.3, 0, 18.3), (1.25, 1.15, 0.9), E, f"Watcher_Clavicle_{sfx}", seg=16, rings=8)
        sh = Vector((s * SHOULDER, 0, 18.0))
        el = Vector((s * 3.95, 0, 13.75))
        wr = Vector((s * 4.1, 0, 9.9))
        b.ellipsoid(sh, (0.95, 0.95, 0.95), ST, f"Watcher_UpperArm_{sfx}", seg=14, rings=8)
        b.lathe(sh + Vector((0, 0, -0.4)), el - sh, [(0, 0.88), (2.2, 0.85), ((el - sh).length - 0.35, 0.74)], P, f"Watcher_UpperArm_{sfx}", seg=14)
        b.ellipsoid(el, (0.72, 0.72, 0.72), ST, f"Watcher_Forearm_{sfx}", seg=14, rings=8)
        for k in range(5):  # decision 039: exposed fiber-optic lines across the elbow joint
            a0 = math.pi * (1.2 + 0.15 * k)
            off = Vector((math.cos(a0) * 0.74, math.sin(a0) * 0.74, 0))
            b.cyl(el + off * 1.08 + Vector((0, 0, 0.55)), el + off * 1.04, 0.022, "MAT_Watcher_FiberOptic", f"Watcher_UpperArm_{sfx}", seg=4, caps=False)
            b.cyl(el + off * 1.04, el + off * 1.06 - Vector((0, 0, 0.55)), 0.022, "MAT_Watcher_FiberOptic", f"Watcher_Forearm_{sfx}", seg=4, caps=False)
        b.lathe(el + (wr - el).normalized() * 0.35, wr - el, [(0, 0.72), (2.0, 0.68), ((wr - el).length - 0.5, 0.58)], P, f"Watcher_Forearm_{sfx}", seg=14)
        mid = el.lerp(wr, 0.45)
        b.lathe(mid, wr - el, [(0, 0.74), (0.25, 0.74)], BR, f"Watcher_Forearm_{sfx}", seg=14)
        b.cyl(wr + Vector((0, 0, 0.25)), wr - Vector((0, 0, 0.2)), 0.6, ST, f"Watcher_Hand_{sfx}", seg=12)
        b.ellipsoid((s * 4.15, 0, 9.0), (0.32, 0.62, 0.8), P, f"Watcher_Hand_{sfx}", seg=12, rings=8)
        for fy, fb in ((-0.38, "Index"), (0.0, "Middle"), (0.38, "Ring")):
            f0 = Vector((s * 4.15, fy, 8.25))
            bone = f"Watcher_{fb}_{sfx}"
            b.ellipsoid(f0, (0.17, 0.17, 0.17), ST, bone, seg=8, rings=5)
            b.cyl(f0, f0 + Vector((0, 0, -0.55)), 0.15, P, bone, seg=8)
            b.ellipsoid(f0 + Vector((0, 0, -0.6)), (0.14, 0.14, 0.14), ST, bone, seg=8, rings=5)
            b.cyl(f0 + Vector((0, 0, -0.6)), f0 + Vector((0, 0, -1.12)), 0.13, P, bone, seg=8, r1=0.11)
        t0 = Vector((s * 4.1, -0.55, 8.9))
        b.ellipsoid(t0, (0.18, 0.18, 0.18), ST, f"Watcher_Thumb_{sfx}", seg=8, rings=5)
        b.cyl(t0, Vector((s * 4.0, -0.95, 8.35)), 0.16, P, f"Watcher_Thumb_{sfx}", seg=8, r1=0.13)

        # leg
        hip = Vector((s * HIP, 0, 12.2))
        kn = Vector((s * HIP, 0, 7.25))
        an = Vector((s * HIP, 0, 1.65))
        b.ellipsoid(hip, (0.95, 0.95, 0.95), ST, f"Watcher_Thigh_{sfx}", seg=12, rings=6)
        b.lathe(hip, kn - hip, [(0.2, 1.05), ((kn - hip).length - 0.5, 0.9)], P, f"Watcher_Thigh_{sfx}", seg=14)
        b.ellipsoid(kn, (0.8, 0.8, 0.8), ST, f"Watcher_Shin_{sfx}", seg=14, rings=8)
        for k in range(5):  # decision 039: exposed fiber-optic lines behind the knee
            a0 = math.pi * (0.25 + 0.12 * k)
            off = Vector((math.cos(a0) * 0.82, math.sin(a0) * 0.82, 0))
            b.cyl(kn + off * 1.08 + Vector((0, 0, 0.6)), kn + off * 1.04, 0.022, "MAT_Watcher_FiberOptic", f"Watcher_Thigh_{sfx}", seg=4, caps=False)
            b.cyl(kn + off * 1.04, kn + off * 1.06 - Vector((0, 0, 0.6)), 0.022, "MAT_Watcher_FiberOptic", f"Watcher_Shin_{sfx}", seg=4, caps=False)
        b.ellipsoid(kn + Vector((0, -0.55, 0.05)), (0.62, 0.32, 0.7), P, f"Watcher_Shin_{sfx}", seg=12, rings=6)
        b.lathe(kn - Vector((0, 0, 0.35)), an - kn, [(0, 0.95), (1.5, 0.9), ((an - kn).length - 0.6, 0.68)], P, f"Watcher_Shin_{sfx}", seg=14)
        b.lathe(kn - Vector((0, 0, 0.9)), an - kn, [(0, 0.98), (0.3, 0.98)], BR, f"Watcher_Shin_{sfx}", seg=14)
        b.ellipsoid(an, (0.62, 0.62, 0.62), ST, f"Watcher_Foot_{sfx}", seg=12, rings=6)
        # boot
        x = s * HIP
        b.box((x - 0.9, -2.05, 0.0), (x + 0.9, 1.05, 0.42), RB, f"Watcher_Foot_{sfx}")
        b.lathe((x, 0, 0.42), (0, 0, 1), [(0, 1.0), (1.4, 0.93), (1.7, 0.9)], ST, f"Watcher_Foot_{sfx}", seg=16)
        b.ellipsoid((x, -1.05, 0.72), (0.88, 1.05, 0.55), ST, f"Watcher_Foot_{sfx}", seg=14, rings=8,
                    keep=lambda c: c.z > 0.4)
        b.lathe((x, 0, 1.95), (0, 0, 1), [(0, 1.0), (0.22, 1.0)], BR, f"Watcher_Foot_{sfx}", seg=16, cap0=False, cap1=False)
        for k in range(6):
            a = 2 * math.pi * k / 6 + 0.5
            b.ellipsoid((x + math.cos(a) * 0.97, math.sin(a) * 0.97, 1.55), (0.09, 0.09, 0.09), BR, f"Watcher_Foot_{sfx}", seg=6, rings=4)


# ----------------------------------------------------------------------------------- rig
BONES = [
    # name, head, tail, parent
    ("Watcher_Root", (0, 0, 0), (0, 0, 2.0), None),
    ("Watcher_Pelvis", (0, 0, 12.4), (0, 0, 13.2), "Watcher_Root"),
    ("Watcher_Spine", (0, 0, 13.2), (0, 0, 16.0), "Watcher_Pelvis"),
    ("Watcher_Chest", (0, 0, 16.0), (0, 0, 19.0), "Watcher_Spine"),
    ("Watcher_Neck", (0, 0, 19.2), (0, 0, 20.6), "Watcher_Chest"),
    ("Watcher_Head", (0, 0, 20.6), (0, 0, 28.0), "Watcher_Neck"),
    ("Watcher_Eye", (EYE_R_X, -2.4, EYE_Z), (EYE_R_X, -3.4, EYE_Z), "Watcher_Head"),
    ("Watcher_LensNeutral", (EYE_R_X, -2.9, EYE_Z), (EYE_R_X, -3.2, EYE_Z), "Watcher_Eye"),
    ("Watcher_LensRed", (EYE_R_X, -2.9, EYE_Z + 0.01), (EYE_R_X, -3.2, EYE_Z + 0.01), "Watcher_Eye"),
    ("Watcher_LensGreen", (EYE_R_X, -2.9, EYE_Z + 0.02), (EYE_R_X, -3.2, EYE_Z + 0.02), "Watcher_Eye"),
    ("Watcher_Key", (0, 2.2, 16.3), (0, 4.2, 16.3), "Watcher_Chest"),
]
for s, sfx in ((1, "L"), (-1, "R")):
    BONES += [
        (f"Watcher_Clavicle_{sfx}", (s * 0.4, 0, 18.6), (s * 3.4, 0, 18.3), "Watcher_Chest"),
        (f"Watcher_UpperArm_{sfx}", (s * SHOULDER, 0, 18.0), (s * 3.95, 0, 13.75), f"Watcher_Clavicle_{sfx}"),
        (f"Watcher_Forearm_{sfx}", (s * 3.95, 0, 13.75), (s * 4.1, 0, 9.9), f"Watcher_UpperArm_{sfx}"),
        (f"Watcher_Hand_{sfx}", (s * 4.1, 0, 9.9), (s * 4.15, 0, 8.3), f"Watcher_Forearm_{sfx}"),
        (f"Watcher_Thumb_{sfx}", (s * 4.1, -0.55, 8.9), (s * 4.0, -0.95, 8.35), f"Watcher_Hand_{sfx}"),
        (f"Watcher_Index_{sfx}", (s * 4.15, -0.38, 8.25), (s * 4.15, -0.38, 7.13), f"Watcher_Hand_{sfx}"),
        (f"Watcher_Middle_{sfx}", (s * 4.15, 0.0, 8.25), (s * 4.15, 0.0, 7.13), f"Watcher_Hand_{sfx}"),
        (f"Watcher_Ring_{sfx}", (s * 4.15, 0.38, 8.25), (s * 4.15, 0.38, 7.13), f"Watcher_Hand_{sfx}"),
        (f"Watcher_Thigh_{sfx}", (s * HIP, 0, 12.2), (s * HIP, 0, 7.25), "Watcher_Pelvis"),
        (f"Watcher_Shin_{sfx}", (s * HIP, 0, 7.25), (s * HIP, 0, 1.65), f"Watcher_Thigh_{sfx}"),
        (f"Watcher_Foot_{sfx}", (s * HIP, 0, 1.65), (s * HIP, -1.6, 0.4), f"Watcher_Shin_{sfx}"),
    ]
LENS = ("Watcher_LensNeutral", "Watcher_LensRed", "Watcher_LensGreen")


def build_rig(col):
    ad = bpy.data.armatures.new("Watcher_Rig")
    ad.display_type = "OCTAHEDRAL"
    arm = bpy.data.objects.new("Watcher_Rig", ad)
    col.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name, h, t, parent in BONES:
        e = ad.edit_bones.new(name)
        e.head, e.tail = Vector(h), Vector(t)
        e.roll = 0.0
        if parent:
            e.parent = eb[parent]
            e.use_connect = False
        e.use_deform = True
        eb[name] = e
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


# ----------------------------------------------------------------------------------- poses and clips
def qworld(pb, axis, deg):
    """Local pose quaternion for a rotation of `deg` about an armature-space axis at the bone."""
    M = pb.bone.matrix_local.to_quaternion()
    q = Quaternion(Vector({"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis]), math.radians(deg))
    return M.inverted() @ q @ M


def apply_pose(arm, pose):
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    for bone, rots in pose.get("rot", {}).items():
        pb = arm.pose.bones[bone]
        q = Quaternion((1, 0, 0, 0))
        for axis, deg in rots:
            q = qworld(pb, axis, deg) @ q
        pb.rotation_quaternion = q
    state = pose.get("lens", "neutral")
    for name in LENS:
        on = name.lower().endswith(state)
        arm.pose.bones[name].scale = (1, 1, 1) if on else (0.01, 0.01, 0.01)
    arm.pose.bones["Watcher_Eye"].location = (0, 0.25 * pose.get("eye_out", 0.0), 0)  # bone Y points out of the face; decision 040: the doll eye only lurches
    arm.pose.bones["Watcher_Key"].rotation_quaternion = Quaternion(Vector((0, 1, 0)), math.radians(pose.get("key", 0.0)))


def key_all(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)
        pb.keyframe_insert("scale", frame=frame)


def merge(*poses):
    out = {"rot": {}}
    for p in poses:
        for k, v in p.items():
            if k == "rot":
                for bone, rots in v.items():
                    out["rot"].setdefault(bone, []).extend(rots)
            else:
                out[k] = v
    return out


AWAY = {"rot": {"Watcher_Spine": [("Z", 180)]}}
RED_ARM = {"rot": {"Watcher_UpperArm_L": [("X", -78), ("Y", -8)], "Watcher_Forearm_L": [("X", -92)],
                   "Watcher_Hand_L": [("Z", 90)], "Watcher_Head": [("X", 6)]}}
POINT_R = {"rot": {"Watcher_UpperArm_R": [("X", -82), ("Z", 22)], "Watcher_Forearm_R": [("X", -6)],
                   "Watcher_Middle_R": [("Y", -75)], "Watcher_Ring_R": [("Y", -75)], "Watcher_Thumb_R": [("Y", -40)]}}


def rot(**kw):
    return {"rot": {f"Watcher_{k}": v for k, v in kw.items()}}


CLIPS = {
    # name: (loop, [(frame, pose)])
    "Watcher_Idle": (True, [
        (1, merge(rot(Chest=[("X", 0.0)], Head=[("Z", 0)]), {"lens": "neutral", "key": 0})),
        (25, merge(rot(Chest=[("X", 1.2)], Head=[("Z", 3)]), {"lens": "neutral", "key": 90})),
        (49, merge(rot(Chest=[("X", 0.0)], Head=[("Z", 0)]), {"lens": "neutral", "key": 180})),
        (73, merge(rot(Chest=[("X", 1.2)], Head=[("Z", -3)]), {"lens": "neutral", "key": 270})),
        (97, merge(rot(Chest=[("X", 0.0)], Head=[("Z", 0)]), {"lens": "neutral", "key": 360})),
    ]),
    "Watcher_TurnAway": (False, [
        (1, {"lens": "neutral"}),
        (10, merge(rot(Spine=[("Z", 20)], Neck=[("Z", 15)]), {"lens": "neutral"})),
        (26, merge(rot(Spine=[("Z", 150)], Neck=[("Z", 25)]), {"lens": "neutral"})),
        (31, merge(AWAY, {"lens": "green"})),
        (37, merge(AWAY, {"lens": "green"})),
    ]),
    "Watcher_GreenSignal": (True, [
        (1, merge(AWAY, {"lens": "green", "key": 0})),
        (13, merge(AWAY, rot(Chest=[("X", 1.0)]), {"lens": "green", "key": 90})),
        (25, merge(AWAY, {"lens": "green", "key": 180})),
        (37, merge(AWAY, rot(Chest=[("X", 1.0)]), {"lens": "green", "key": 270})),
        (49, merge(AWAY, {"lens": "green", "key": 360})),
    ]),
    "Watcher_TurnToField": (False, [
        (1, merge(AWAY, {"lens": "green"})),
        (8, merge(rot(Spine=[("Z", 175)], Neck=[("Z", -45)]), {"lens": "neutral"})),
        (22, merge(rot(Spine=[("Z", 60)], Neck=[("Z", -30)]), {"lens": "neutral"})),
        (31, merge(rot(Spine=[("Z", -4)], Neck=[("Z", 2)]), {"lens": "neutral"})),
        (37, {"lens": "neutral"}),
    ]),
    "Watcher_FocusLock": (False, [
        (1, {"lens": "neutral"}),
        (9, merge(rot(Head=[("X", 4)]), {"lens": "neutral", "eye_out": 0.35})),
        (15, merge(rot(Head=[("X", 4)]), {"lens": "red", "eye_out": 0.35})),
        (25, merge(rot(Head=[("X", 4)]), {"lens": "red", "eye_out": 0.2})),
    ]),
    "Watcher_RedSignal": (True, [
        (1, merge(RED_ARM, {"lens": "red", "eye_out": 0.2})),
        (25, merge(RED_ARM, rot(Chest=[("X", 1.0)]), {"lens": "red", "eye_out": 0.2})),
        (49, merge(RED_ARM, {"lens": "red", "eye_out": 0.2})),
    ]),
    "Watcher_ScanSweep": (True, [
        (1, merge(rot(Head=[("Z", -32), ("X", 5)], Chest=[("Z", 6), ("X", 3)]), {"lens": "red", "eye_out": 0.2})),
        (49, merge(rot(Head=[("Z", 32), ("X", 5)], Chest=[("Z", -6), ("X", 3)]), {"lens": "red", "eye_out": 0.2})),
        (97, merge(rot(Head=[("Z", -32), ("X", 5)], Chest=[("Z", 6), ("X", 3)]), {"lens": "red", "eye_out": 0.2})),
    ]),
    "Watcher_Detect": (False, [
        (1, merge(rot(Head=[("X", 5)]), {"lens": "red", "eye_out": 0.2})),
        (6, merge(rot(Head=[("Z", 25), ("X", 7)], Chest=[("Z", 6)]), {"lens": "red", "eye_out": 0.45})),
        (12, merge(rot(Head=[("Z", 24), ("X", 7)], Chest=[("Z", 8)]), {"lens": "red", "eye_out": 0.45})),
        (20, merge(POINT_R, rot(Head=[("Z", 22), ("X", 7)], Chest=[("Z", 10), ("X", -2)]), {"lens": "red", "eye_out": 0.45})),
        (32, merge(POINT_R, rot(Head=[("Z", 22), ("X", 7)], Chest=[("Z", 10)]), {"lens": "red", "eye_out": 0.4})),
        (41, merge(POINT_R, rot(Head=[("Z", 22), ("X", 7)], Chest=[("Z", 10)]), {"lens": "red", "eye_out": 0.4})),
    ]),
    "Watcher_ReturnNeutral": (False, [
        (1, merge(POINT_R, rot(Head=[("Z", 22), ("X", 7)], Chest=[("Z", 10)]), {"lens": "red", "eye_out": 0.4})),
        (14, merge(rot(UpperArm_R=[("X", -30)], Head=[("Z", 8), ("X", 3)], Chest=[("Z", 4)]), {"lens": "red", "eye_out": 0.2})),
        (25, merge(rot(Head=[("Z", 1)]), {"lens": "neutral", "eye_out": 0.05})),
        (37, {"lens": "neutral"}),
    ]),
}
CLIP_USE = {
    "Watcher_Idle": "Lobby and briefing: mechanical idle, the key winds",
    "Watcher_TurnAway": "Start of GREEN: upper body turns away on the waist turret, lens to green",
    "Watcher_GreenSignal": "GREEN loop: turned away, green lens and rear lights",
    "Watcher_TurnToField": "WARNING: turns back to face the field, head leading",
    "Watcher_FocusLock": "Start of RED: lens telescopes out and locks red",
    "Watcher_RedSignal": "RED loop: hand raised (stop), red lens",
    "Watcher_ScanSweep": "RED loop alternative: deliberate head sweep across the yard",
    "Watcher_Detect": "A player is spotted (server event): head snaps, arm points",
    "Watcher_ReturnNeutral": "Back to the neutral stance and neutral lens (results, lobby)",
}


def build_clips(arm):
    arm.animation_data_create()
    for name, (loop, keys) in CLIPS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        act.use_frame_range = True
        act.frame_start, act.frame_end = keys[0][0], keys[-1][0]
        act.use_cyclic = loop
        act["loop"] = loop
        act["use"] = CLIP_USE[name]
        arm.animation_data.action = act
        for frame, pose in keys:
            apply_pose(arm, pose)
            key_all(arm, frame)
        for fc in _fcurves(act):
            stepped = any(f'"{b}"' in fc.data_path and fc.data_path.endswith("scale") for b in LENS)
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT" if stepped else "BEZIER"
                if not stepped:
                    kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(act.frame_start), act)
        track.mute = True
    arm.animation_data.action = None
    apply_pose(arm, {"lens": "neutral"})


def _fcurves(act):
    if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out += list(bag.fcurves)
    return out


# ----------------------------------------------------------------------------------- scene
def main() -> None:
    cb.new_empty_scene()
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, 97
    cols = {n: bpy.data.collections.new(n) for n in ("WATCHER_CHARACTER", "WATCHER_RIG", "WATCHER_MATERIALS", "WATCHER_ANIMATION",
                                                    "WATCHER_GAMEPLAY_ANCHORS", "WATCHER_COLLISION", "WATCHER_EXPORT")}
    for c in cols.values():
        scene.collection.children.link(c)
    mats = {n: make_material(n) for n in MATS}

    arm = build_rig(cols["WATCHER_RIG"])
    body = Body()
    build_body(body)
    groups = list(body.groups)
    me = body.mesh("Watcher_Body", mats)
    obj = bpy.data.objects.new("Watcher_Body", me)
    cols["WATCHER_CHARACTER"].objects.link(obj)
    for g in groups:
        obj.vertex_groups.new(name=g)
    mod = obj.modifiers.new("Armature", "ARMATURE")  # not parented: glTF wants the skinned mesh at the root
    mod.object = arm
    obj["lod"] = 0

    # LOD1: the same mesh decimated to about half (weights survive the decimation)
    lod = obj.copy()
    lod.data = obj.data.copy()
    lod.name = lod.data.name = "Watcher_Body_LOD1"
    cols["WATCHER_EXPORT"].objects.link(lod)
    dec = lod.modifiers.new("Decimate", "DECIMATE")
    dec.ratio = 0.5
    lod.modifiers.move(len(lod.modifiers) - 1, 0)
    bpy.context.view_layer.objects.active = lod
    with bpy.context.temp_override(object=lod, active_object=lod):
        bpy.ops.object.modifier_apply(modifier="Decimate")
    lod["lod"] = 1
    lod.hide_render = True

    # Gameplay anchors (integration references only)
    def anchor(name, loc, bone=None, display="PLAIN_AXES", size=1.0, props=None):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = display
        e.empty_display_size = size
        cols["WATCHER_GAMEPLAY_ANCHORS"].objects.link(e)
        e.parent = arm
        if bone:
            e.parent_type = "BONE"
            e.parent_bone = bone
        bpy.context.view_layer.update()
        e.matrix_world = Matrix.Translation(Vector(loc))
        for k, v in (props or {}).items():
            e[k] = v
        return e

    ey = head_surface_y(EYE_R_X, EYE_Z)
    anchor("Watcher_Root", (0, 0, 0), "Watcher_Root", "ARROWS", 2.0, {"role": "root_ground_pivot"})
    anchor("Watcher_Facing", (0, -4.0, 0), "Watcher_Root", "SINGLE_ARROW", 2.0, {"role": "facing", "forward": "-Y in Blender, -Z in glTF (toward the start line)"})
    anchor("Watcher_OpticalOrigin", (EYE_R_X, ey - 0.1, EYE_Z), "Watcher_Eye", "SPHERE", 0.4, {"role": "optical_origin"})
    anchor("Watcher_OpticalOrigin_L", (-EYE_R_X, ey - 0.1, EYE_Z), "Watcher_Head", "SPHERE", 0.4, {"role": "optical_origin_left_pupil"})
    anchor("Watcher_DetectionForward", (EYE_R_X, ey - 6.0, EYE_Z), "Watcher_Eye", "SINGLE_ARROW", 1.0, {"role": "detection_forward"})
    anchor("Watcher_AudioOrigin", (0, -2.7, 17.0), "Watcher_Chest", "SPHERE", 0.6, {"role": "audio_origin"})
    ib = anchor("Watcher_InteractionBounds", (0, -0.5, 14.0), "Watcher_Root", "CUBE", 1.0,
                {"role": "interaction_bounds", "half_extents_m": [4.6, 4.6, 14.0]})
    ib.scale = (4.6, 4.6, 14.0)
    for e in cols["WATCHER_GAMEPLAY_ANCHORS"].objects:
        e["note"] = "integration reference only; detection and elimination are server-side"

    # Collision proxy (camera / occlusion helper; never exported)
    cm = bpy.data.meshes.new("Watcher_Collision_Body")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 9.2
        v.co.y *= 9.2
        v.co.z = (v.co.z + 0.5) * HEIGHT
    bm.to_mesh(cm)
    bm.free()
    col_obj = bpy.data.objects.new("Watcher_Collision_Body", cm)
    col_obj.display_type = "WIRE"
    col_obj.hide_render = True
    col_obj["collider"] = "box"
    cols["WATCHER_COLLISION"].objects.link(col_obj)

    # Material swatches for the material reference render (not exported)
    for i, name in enumerate(MATS):
        sb = Body()
        sb.ellipsoid((0, 0, 0), (0.9, 0.9, 0.9), name, "swatch", seg=24, rings=14)
        sme = sb.mesh(f"Watcher_Swatch_{name[13:]}", mats)
        so = bpy.data.objects.new(f"Watcher_Swatch_{name[13:]}", sme)
        so.location = (30 + (i % 6) * 2.4, 0, 1.2 + (i // 6) * 2.4)
        cols["WATCHER_MATERIALS"].objects.link(so)

    build_clips(arm)
    idx = bpy.data.objects.new("Watcher_AnimationIndex", None)
    cols["WATCHER_ANIMATION"].objects.link(idx)
    idx["clips"] = ",".join(CLIPS)
    idx["fps"] = FPS

    scene["asset_id"] = "THE_WATCHER"
    scene["height_m"] = HEIGHT
    scene["build_script"] = "blender/scripts/watcher_build.py"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT), compress=True, relative_remap=True)
    print("Saved", OUT.relative_to(ROOT), "| tris", sum(len(p.vertices) - 2 for p in me.polygons),
          "| LOD1", sum(len(p.vertices) - 2 for p in lod.data.polygons), "| bones", len(arm.data.bones))


if __name__ == "__main__":
    main()
