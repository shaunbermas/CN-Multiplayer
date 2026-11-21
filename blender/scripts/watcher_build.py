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


def hair_shell(b: Body, mat, seg=48, rows=10):
    rx, ry, rz = HEAD_R[0] + 0.18, HEAD_R[1] + 0.2, HEAD_R[2] + 0.2
    c = HEAD_C + Vector((0, 0.05, HEIGHT - HEAD_C.z - HEAD_R[2] - 0.2))
    gi, mi = b._g("Watcher_Head"), b._m(mat)
    tile = MATS[mat][1]

    def hairline(phi):  # phi = 0 at the front (-Y)
        back = (1 - math.cos(phi)) / 2  # 0 front, 1 back
        return c.z + rz * (0.55 - 1.05 * back ** 0.8)

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
    # --- head: porcelain shell, swept-back lacquered hair, bun, rear control housing
    b.ellipsoid(HEAD_C, HEAD_R, P, "Watcher_Head", seg=32, rings=20)

    # Hair: a smooth parametric shell on a slightly larger ellipsoid, from a swept-back hairline
    # (high at the forehead, low at the nape) up to the crown. No fringe, no bob, no pigtails.
    hair_shell(b, HR)
    b.ellipsoid((0, 3.75, 25.2), (1.55, 1.4, 1.5), HR, "Watcher_Head", seg=16, rings=10)
    b.lathe((0, 2.85, 25.2), (0, 1, 0), [(0, 1.05), (0.35, 1.1), (0.7, 1.05)], BR, "Watcher_Head", seg=16)
    b.box((-1.2, 3.05, 22.4), (1.2, 3.45, 23.6), ST, "Watcher_Head")
    for k in range(4):
        b.box((-1.0, 3.45, 22.6 + 0.22 * k), (1.0, 3.5, 22.7 + 0.22 * k), BR, "Watcher_Head")
    for i, (bone, mat) in enumerate((("Watcher_LensNeutral", "MAT_Watcher_Lens_Neutral"), ("Watcher_LensRed", "MAT_Watcher_Lens_Red"),
                                      ("Watcher_LensGreen", "MAT_Watcher_Lens_Green"))):
        for x in (-0.6, 0.0, 0.6):  # rear status lights, one set per signal state
            b.box((x - 0.15, 3.38 + 0.004 * i, 23.62), (x + 0.15, 3.46 + 0.004 * i, 23.86), mat, bone)

    # --- face: one recessed camera-lens eye, sealed left eye, small nose, seam mouth, plate seams
    ey = head_surface_y(EYE_R_X, EYE_Z)
    b.cyl((EYE_R_X, ey + 0.55, EYE_Z), (EYE_R_X, ey - 0.08, EYE_Z), 0.78, ST, "Watcher_Eye", seg=20)
    b.lathe((EYE_R_X, ey - 0.02, EYE_Z), (0, -1, 0), [(0, 0.86), (0.08, 0.88), (0.12, 0.72), (0.06, 0.7)], BR, "Watcher_Eye", seg=20, cap0=False, cap1=False)
    b.cyl((EYE_R_X, ey - 0.02, EYE_Z), (EYE_R_X, ey - 0.06, EYE_Z), 0.6, "MAT_Watcher_LensGlass", "Watcher_Eye", seg=20)
    for i, (bone, mat) in enumerate((("Watcher_LensNeutral", "MAT_Watcher_Lens_Neutral"), ("Watcher_LensRed", "MAT_Watcher_Lens_Red"),
                                      ("Watcher_LensGreen", "MAT_Watcher_Lens_Green"))):
        y = ey - 0.065 - 0.006 * i
        b.cyl((EYE_R_X, y, EYE_Z), (EYE_R_X, y - 0.02, EYE_Z), 0.24, mat, bone, seg=16)
    b.lathe((EYE_R_X, ey - 0.07, EYE_Z), (0, -1, 0), [(0, 0.46), (0.04, 0.46), (0.04, 0.36), (0.0, 0.36)], ST, "Watcher_Eye", seg=20, cap0=False, cap1=False)
    lx = -EYE_R_X
    b.beam((lx - 0.5, head_surface_y(lx - 0.5, EYE_Z + 0.05) - 0.03, EYE_Z + 0.05),
           (lx + 0.5, head_surface_y(lx + 0.5, EYE_Z) - 0.03, EYE_Z), 0.07, 0.07, seam, "Watcher_Head")
    b.ellipsoid((0, head_surface_y(0, 23.0) + 0.05, 23.0), (0.24, 0.2, 0.36), P, "Watcher_Head", seg=10, rings=6)
    b.beam((-0.5, head_surface_y(-0.5, 22.0) - 0.02, 22.0), (0.5, head_surface_y(0.5, 22.0) - 0.02, 22.0), 0.06, 0.06, seam, "Watcher_Head")
    for s in (-1, 1):
        pts = [(s * (2.75 - 0.9 * t), 25.6 - 4.4 * t) for t in [k / 6 for k in range(7)]]
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            b.beam((x0, head_surface_y(x0, z0) - 0.01, z0), (x1, head_surface_y(x1, z1) - 0.01, z1), 0.05, 0.05, seam, "Watcher_Head")

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
    arm.pose.bones["Watcher_Eye"].location = (0, pose.get("eye_out", 0.0), 0)  # bone Y points out of the face
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
