"""Mesh and material kit for the Stage 01 environment (Prompt 05).

MeshBuilder writes low-poly game meshes with bmesh: boxes, oriented beams, cylinders, cones,
polygons and extruded profiles, several materials per mesh, and world-scale box-projected UVs (each
material sets its own tile size, so textures keep a constant texel density). Materials are plain
glTF-compatible Principled BSDF networks (image textures, packed ORM, normal map, Round alpha clip).
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / "blender/textures/STG01"
Z = Vector((0, 0, 1))


# ----------------------------------------------------------------------------------- materials
# name: (texture set or None, uv tile in metres, options)
MATERIALS = {
    "MAT_Asphalt_Wet": ("T_Asphalt_Wet", 8.0, {}),
    "MAT_Ground_DirtGrass": ("T_Ground_DirtGrass", 10.0, {}),
    "MAT_Ground_Far": ("T_Ground_DirtGrass", 45.0, {"tint": (0.55, 0.6, 0.6)}),
    "MAT_Concrete_Weathered": ("T_Concrete_Weathered", 4.0, {}),
    "MAT_Metal_RustPaint": ("T_Metal_RustPaint", 2.0, {}),
    "MAT_Steel_Dark": ("T_Steel_Dark", 2.0, {}),
    "MAT_Steel_Galvanised": ("T_Steel_Galvanised", 2.0, {}),
    "MAT_ChainLink": ("T_ChainLink", 0.6, {"clip": True, "double": True}),
    "MAT_Wood_Weathered": ("T_Wood_Weathered", 1.0, {}),
    "MAT_Paint_Line": ("T_Paint_Worn", 1.0, {"clip": True}),
    "MAT_Stripes_Hazard": ("T_Stripes_Hazard", 1.0, {}),
    "MAT_Stripes_Barrier": ("T_Stripes_Barrier", 1.0, {}),
    "MAT_Checker_Finish": ("T_Checker_Finish", 1.6, {}),
    "MAT_Foliage": ("T_Foliage", 3.0, {"double": True}),
    "MAT_Puddle": (None, 1.0, {"colour": (0.01, 0.013, 0.016), "rough": 0.04, "metal": 0.0}),
    "MAT_Cable": (None, 1.0, {"colour": (0.012, 0.012, 0.012), "rough": 0.55, "metal": 0.0}),
    "MAT_Silhouette": (None, 1.0, {"colour": (0.012, 0.022, 0.026), "rough": 1.0, "metal": 0.0}),
    "MAT_Glass_Window_Warm": (None, 1.0, {"colour": (0.20, 0.10, 0.04), "emit": (1.0, 0.55, 0.22), "strength": 3.0, "rough": 0.2}),
    "MAT_Light_Warm": (None, 1.0, {"colour": (0.9, 0.6, 0.35), "emit": (1.0, 0.58, 0.26), "strength": 12.0, "rough": 0.3}),
    "MAT_Light_Sodium": (None, 1.0, {"colour": (0.9, 0.55, 0.25), "emit": (1.0, 0.50, 0.18), "strength": 8.0, "rough": 0.3}),
    "MAT_Light_Aviation": (None, 1.0, {"colour": (0.9, 0.4, 0.1), "emit": (1.0, 0.42, 0.08), "strength": 20.0, "rough": 0.3}),
    # Signal lenses: one material per colour so the runtime can drive each state (Prompt 05 brief).
    "MAT_Signal_Red": (None, 1.0, {"colour": (0.25, 0.02, 0.02), "emit": (1.0, 0.04, 0.03), "strength": 1.0, "rough": 0.15}),
    "MAT_Signal_Amber": (None, 1.0, {"colour": (0.25, 0.12, 0.01), "emit": (1.0, 0.45, 0.02), "strength": 1.0, "rough": 0.15}),
    "MAT_Signal_Green": (None, 1.0, {"colour": (0.02, 0.2, 0.06), "emit": (0.05, 1.0, 0.25), "strength": 1.0, "rough": 0.15}),
    "MAT_TimerBoard_Screen": (None, 1.0, {"colour": (0.01, 0.01, 0.01), "emit": (1.0, 0.45, 0.1), "strength": 0.4, "rough": 0.25}),
    # The Shepherd stays a placeholder (enemy production is a later milestone); only its finish changes.
    "MAT_Shepherd_Placeholder": (None, 1.0, {"colour": (0.10, 0.085, 0.07), "rough": 0.55, "metal": 0.7}),
    "MAT_Shepherd_Face": (None, 1.0, {"colour": (0.5, 0.48, 0.42), "emit": (0.85, 0.82, 0.7), "strength": 0.6, "rough": 0.4}),
    "MAT_Shepherd_Lantern": (None, 1.0, {"colour": (0.4, 0.3, 0.1), "emit": (1.0, 0.7, 0.3), "strength": 6.0, "rough": 0.3}),
    "MAT_VFX_Dust": (None, 1.0, {"colour": (0.6, 0.5, 0.4), "emit": (1.0, 0.75, 0.5), "strength": 1.5, "rough": 0.9}),
    "MAT_VFX_Haze": ("T_Haze", 1.0, {"blend": True, "emit": (0.30, 0.55, 0.55), "strength": 0.25, "colour": (0.3, 0.5, 0.5)}),
}


def _img(name: str, non_color: bool):
    path = TEX / f"{name}.png"
    img = bpy.data.images.get(path.name) or bpy.data.images.load(str(path))
    img.name = path.name
    img.filepath = bpy.path.relpath(str(path)) if bpy.data.filepath else str(path)
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return img


def make_material(name: str):
    tex, tile, o = MATERIALS[name]
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
    if tex:
        bc = nt.nodes.new("ShaderNodeTexImage")
        bc.image = _img(f"{tex}_BC", False)
        if "tint" in o:
            mul = nt.nodes.new("ShaderNodeMix")
            mul.data_type = "RGBA"
            mul.blend_type = "MULTIPLY"
            mul.inputs["Factor"].default_value = 1.0
            mul.inputs[7].default_value = (*o["tint"], 1)
            nt.links.new(bc.outputs["Color"], mul.inputs[6])
            nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
        else:
            nt.links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])
        if o.get("clip"):
            rnd = nt.nodes.new("ShaderNodeMath")
            rnd.operation = "ROUND"  # glTF alphaMode MASK, cutoff 0.5
            nt.links.new(bc.outputs["Alpha"], rnd.inputs[0])
            nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
        if o.get("blend"):
            nt.links.new(bc.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.surface_render_method = "BLENDED"
        orm_path = TEX / f"{tex}_ORM.png"
        if orm_path.exists():
            orm = nt.nodes.new("ShaderNodeTexImage")
            orm.image = _img(f"{tex}_ORM", True)
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
            nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
            nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        n_path = TEX / f"{tex}_N.png"
        if n_path.exists():
            nimg = nt.nodes.new("ShaderNodeTexImage")
            nimg.image = _img(f"{tex}_N", True)
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(nimg.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if "emit" in o:
        bsdf.inputs["Emission Color"].default_value = (*o["emit"], 1)
        bsdf.inputs["Emission Strength"].default_value = o["strength"]
    mat.use_backface_culling = not o.get("double", False)
    return mat


def all_materials():
    return {n: make_material(n) for n in MATERIALS}


# ----------------------------------------------------------------------------------- meshes
class MeshBuilder:
    """Collects geometry in world coordinates and writes it relative to `origin`."""

    def __init__(self, origin=(0.0, 0.0, 0.0)):
        self.bm = bmesh.new()
        self.o = Vector(origin)
        self.mats: list[str] = []

    def _mi(self, mat: str) -> int:
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _v(self, p):
        return self.bm.verts.new(Vector(p) - self.o)

    def _closed(self, faces):
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)

    # --- primitives
    def box(self, mn, mx, mat: str):
        mn, mx = Vector(mn), Vector(mx)
        v = [self._v((mx.x if i & 1 else mn.x, mx.y if i & 2 else mn.y, mx.z if i & 4 else mn.z)) for i in range(8)]
        idx = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
        faces = [self.bm.faces.new([v[i] for i in f]) for f in idx]
        m = self._mi(mat)
        for f in faces:
            f.material_index = m
        self._closed(faces)
        return faces

    def boxc(self, c, size, mat: str):
        c, s = Vector(c), Vector(size) / 2
        return self.box(c - s, c + s, mat)

    def _frame(self, p0, p1, up=None):
        d = (p1 - p0).normalized()
        up = Vector(up) if up else (Z if abs(d.dot(Z)) < 0.95 else Vector((1, 0, 0)))
        side = d.cross(up).normalized()
        up2 = side.cross(d).normalized()
        return d, side, up2

    def beam(self, p0, p1, w: float, h: float | None, mat: str, up=None):
        """Box beam from p0 to p1 with a w x h section."""
        p0, p1 = Vector(p0), Vector(p1)
        h = w if h is None else h
        _, s, u = self._frame(p0, p1, up)
        pts = []
        for p in (p0, p1):
            for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                pts.append(self._v(p + s * a * w / 2 + u * b * h / 2))
        a, b = pts[:4], pts[4:]
        faces = [self.bm.faces.new((a[3], a[2], a[1], a[0])), self.bm.faces.new((b[0], b[1], b[2], b[3]))]
        for i in range(4):
            j = (i + 1) % 4
            faces.append(self.bm.faces.new((a[i], a[j], b[j], b[i])))
        m = self._mi(mat)
        for f in faces:
            f.material_index = m
        self._closed(faces)
        return faces

    def cyl(self, p0, p1, r0: float, mat: str, seg: int = 8, r1: float | None = None, caps=True, smooth=True):
        p0, p1 = Vector(p0), Vector(p1)
        r1 = r0 if r1 is None else r1
        _, s, u = self._frame(p0, p1)
        ring0, ring1 = [], []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            off = s * math.cos(a) + u * math.sin(a)
            ring0.append(self._v(p0 + off * r0))
            ring1.append(None if r1 == 0 else self._v(p1 + off * r1))
        faces = []
        m = self._mi(mat)
        if r1 == 0:
            tip = self._v(p1)
            for i in range(seg):
                f = self.bm.faces.new((ring0[i], ring0[(i + 1) % seg], tip))
                f.smooth = smooth
                faces.append(f)
        else:
            for i in range(seg):
                j = (i + 1) % seg
                f = self.bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
                f.smooth = smooth
                faces.append(f)
            if caps:
                faces.append(self.bm.faces.new(list(reversed(ring1))))
        if caps:
            faces.append(self.bm.faces.new(ring0))
        for f in faces:
            f.material_index = m
        if caps:
            self._closed(faces)
        return faces

    def poly(self, pts, mat: str, flip=False):
        vs = [self._v(p) for p in pts]
        f = self.bm.faces.new(list(reversed(vs)) if flip else vs)
        f.material_index = self._mi(mat)
        return f

    def quad2(self, pts, mat):
        """Quad visible from both sides via a double-sided material."""
        return self.poly(pts, mat)

    def prism_profile(self, profile, p0, p1, mat: str, up=None):
        """Extrude a closed 2D profile [(across, up)] from p0 to p1."""
        p0, p1 = Vector(p0), Vector(p1)
        _, s, u = self._frame(p0, p1, up)
        a = [self._v(p0 + s * x + u * y) for x, y in profile]
        b = [self._v(p1 + s * x + u * y) for x, y in profile]
        n = len(profile)
        faces = [self.bm.faces.new(list(reversed(a))), self.bm.faces.new(b)]
        for i in range(n):
            j = (i + 1) % n
            faces.append(self.bm.faces.new((a[i], a[j], b[j], b[i])))
        m = self._mi(mat)
        for f in faces:
            f.material_index = m
        self._closed(faces)
        return faces

    def catenary(self, p0, p1, sag: float, r: float, mat: str, segs: int = 16, seg_r: int = 4):
        p0, p1 = Vector(p0), Vector(p1)
        pts = [p0.lerp(p1, t) - Z * (sag * 4 * t * (1 - t)) for t in (i / segs for i in range(segs + 1))]
        for a, b in zip(pts, pts[1:]):
            self.cyl(a, b, r, mat, seg=seg_r, caps=False)

    def polyline_tube(self, pts, r: float, mat: str, seg_r: int = 4):
        for a, b in zip(pts, pts[1:]):
            self.cyl(Vector(a), Vector(b), r, mat, seg=seg_r, caps=False)

    # --- output
    def mesh(self, name: str, materials: dict):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        uv = bm.loops.layers.uv.new("UVMap")
        tiles = [materials[m].get("uv_tile_m", 1.0) for m in self.mats]
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            t = tiles[f.material_index] if self.mats else 1.0
            for loop in f.loops:
                p = loop.vert.co + self.o
                if ax == 2:
                    loop[uv].uv = (p.x / t, p.y / t)
                elif ax == 0:
                    loop[uv].uv = (p.y / t, p.z / t)
                else:
                    loop[uv].uv = (p.x / t, p.z / t)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(materials[m])
        return me


def triangles(me) -> int:
    return sum(len(p.vertices) - 2 for p in me.polygons)
