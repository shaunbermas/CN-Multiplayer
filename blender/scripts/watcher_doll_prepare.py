"""Decision 041: prepare the owner's Creepy doll model as THE WATCHER's source mesh.

The owner supplied the model (CGTrader "Creepy doll", Creepydoll.glb: one mesh, 625,965 triangles, one
2048 px base-colour texture, no rig) and asked: do not change the model, add red glowing eyes, keep as
much detail as possible while reducing polygons (two more stages still need budget).

This script changes nothing about the look. It only:
  - welds the duplicate vertices the file splits at every UV seam (UVs are kept per face corner),
  - clears the imported custom normals so the decimated mesh shades cleanly (smooth shading),
  - scales the doll to the Watcher's 28 m height with its feet on Z = 0, centred, facing -Y
    (the file already faces -Y with +Z up, so there is no rotation),
  - decimates (collapse, uniform) to TARGET_TRIS. A face-protecting vertex group was tried and wrecked the
    body and hair, so the decimation is uniform; at this count the face reads nearly the same as the original
    (100,000 was tried and made the two-browser test lag under software rendering),
  - writes the original texture (unchanged bytes) to blender/textures/WATCHER/ and the mesh (no image) to
    blender/source/THE_WATCHER_DOLL.glb.

The 25 MB original is not committed; pass its path:

    python blender/scripts/watcher_doll_prepare.py -- /path/to/Creepydoll.glb
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
OUT = ROOT / "blender/source/THE_WATCHER_DOLL.glb"
TEX = ROOT / "blender/textures/WATCHER/T_W_Doll_BC.jpg"
HEIGHT = 28.0
TARGET_TRIS = 50000


def main() -> None:
    src = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else None
    if not src or not src.exists():
        sys.exit("pass the original Creepydoll.glb after --")
    cb.new_empty_scene()
    bpy.ops.import_scene.gltf(filepath=str(src))
    obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    me = obj.data
    print("source tris", len(me.polygons))

    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
    bm.to_mesh(me)
    bm.free()
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for p in me.polygons:
        p.use_smooth = True

    t = time.time()
    dec = obj.modifiers.new("Decimate", "DECIMATE")
    dec.ratio = TARGET_TRIS / len(me.polygons)
    dec.use_collapse_triangulate = True
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier="Decimate")
    print("decimated to", len(me.polygons), "in", round(time.time() - t, 1), "s")

    # scale to 28 m, feet on Z = 0, centred on X and Y (bounds centre)
    mn = Vector([min(v.co[i] for v in me.vertices) for i in range(3)])
    mx = Vector([max(v.co[i] for v in me.vertices) for i in range(3)])
    s = HEIGHT / (mx.z - mn.z)
    me.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))))
    me.update()

    mat = me.materials[0]
    mat.name = "MAT_Watcher_Doll"
    img = next(n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE")
    TEX.parent.mkdir(parents=True, exist_ok=True)
    TEX.write_bytes(bytes(img.packed_file.data))  # the original JPEG, byte for byte (no re-encode)
    obj.name = me.name = "Watcher_Doll"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", use_selection=False, export_yup=True,
                              export_image_format="NONE", export_animations=False,
                              export_skins=False, export_cameras=False, export_lights=False)
    print("wrote", OUT.relative_to(ROOT), "scale", round(s, 4), "tris", len(me.polygons))


if __name__ == "__main__":
    main()
