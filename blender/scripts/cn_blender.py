"""Shared helpers for CN Trials Blender scripts.

Works both inside `blender --background --python <script> -- args` and as plain
`python <script>` with the `bpy` module (pip install bpy==5.3.0).
Conventions: docs/BLENDER_PIPELINE.md (metres, Z-up in Blender, course toward +Y).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy

REPO_ROOT = Path(__file__).resolve().parents[2]
PINNED_BLENDER = (5, 3, 0)


# ---------------------------------------------------------------- arguments
def parse_args(parser: argparse.ArgumentParser) -> argparse.Namespace:
    """Parse args after `--` when run by Blender, or normally when run by python."""
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    return parser.parse_args(argv)


def check_version() -> list[str]:
    if tuple(bpy.app.version) != PINNED_BLENDER:
        return [f"Blender {bpy.app.version_string} is not the pinned 5.3.0"]
    return []


# ---------------------------------------------------------------- spec
def load_spec(path: str | Path) -> tuple[dict, str]:
    raw = Path(path).read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()[:16]


# ---------------------------------------------------------------- scene
def new_empty_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    return scene


def collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    """Get or create a collection and empty it (scripts own their collections)."""
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    return col


# ---------------------------------------------------------------- materials
def material(name: str, rgb, emission: float = 0.0, alpha: float = 1.0, roughness: float = 0.8):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:  # older files; new materials always have nodes in 5.x
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    color = (*rgb, 1.0)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    if emission > 0:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    mat.diffuse_color = (*rgb, alpha)
    return mat


# ---------------------------------------------------------------- meshes
def _finish_mesh(name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if mat is not None:
        mesh.materials.append(mat)
    return mesh


def box_mesh(name: str, sx: float, sy: float, sz: float, mat=None, origin="bottom"):
    """Axis-aligned box. origin='bottom' puts the origin at the bottom centre."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    z_off = 0.5 if origin == "bottom" else 0.0
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z = (v.co.z + z_off) * sz
    return _finish_mesh(name, bm, mat)


def cylinder_mesh(name: str, radius: float, height: float, segments: int = 16, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=height)
    for v in bm.verts:
        v.co.z += height / 2.0
    return _finish_mesh(name, bm, mat)


def sphere_mesh(name: str, radius: float, segments: int = 16, rings: int = 10, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    return _finish_mesh(name, bm, mat)


def place(name: str, data, col: bpy.types.Collection, loc=(0.0, 0.0, 0.0), props: dict | None = None):
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    col.objects.link(obj)
    for k, v in (props or {}).items():
        obj[k] = v
    return obj


def empty(name: str, col, loc, display="PLAIN_AXES", size=0.5, yaw_deg: float = 0.0, props: dict | None = None):
    obj = place(name, None, col, loc, props)
    obj.empty_display_type = display
    obj.empty_display_size = size
    obj.rotation_euler = (0.0, 0.0, math.radians(yaw_deg))
    return obj


# ---------------------------------------------------------------- coordinates
def to_game(vec) -> list[float]:
    """Blender (X, Y, Z-up) -> game / glTF (X, Y-up, Z). Blender +Y becomes game -Z."""
    return [round(vec[0], 4), round(vec[2], 4), round(-vec[1], 4)]


def quat_to_game(q) -> list[float]:
    """Blender quaternion (w, x, y, z) -> glTF order (x, y, z, w) in Y-up space."""
    return [round(q.x, 6), round(q.z, 6), round(-q.y, 6), round(q.w, 6)]


def triangle_count(obj) -> int:
    if obj.type != "MESH":
        return 0
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def cone_mesh(name: str, radius: float, height: float, segments: int = 12, mat=None):
    """Cone with its base on Z = 0 and the tip at Z = height."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=0.0, depth=height)
    for v in bm.verts:
        v.co.z += height / 2.0
    return _finish_mesh(name, bm, mat)
