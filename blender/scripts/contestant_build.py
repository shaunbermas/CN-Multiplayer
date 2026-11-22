"""Build CNTRIAL_CONTESTANT_MASTER.blend: ONE contestant model for all 30 players (owner pack, 22 Nov 2026).

  python blender/scripts/contestant_build.py [--no-bake]

Saves blender/scenes/CNTRIAL_CONTESTANT_MASTER.blend with
  CNT_CHARACTER  CNT_Contestant_LOD0 / LOD1 / LOD2: one skinned mesh each, one material, shared UVs
  CNT_RIG        CNT_Rig: one armature (body, coat tails, hood tip) and 16 animation clips (actions + NLA)
  CNT_SOURCE     the LOD0 garment parts as separate named objects (coat, hood, collar, ...), hidden
The 30 colourways are not in the mesh: the vertex colour `CNT` stores a region id (R = id / 15) and
baked ambient occlusion (G); the material maps regions to the colourway's colours, read from object
properties (cw_*), so 30 objects can share one mesh and one material. Geometry: contestant_geometry.py.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

import cn_blender as cb  # noqa: E402
import contestant_geometry as G  # noqa: E402

ROOT = cb.REPO_ROOT
OUT = ROOT / "blender/scenes/CNTRIAL_CONTESTANT_MASTER.blend"
TEX = ROOT / "blender/textures/CONTESTANT"
COLORWAYS = json.loads((ROOT / "packages/shared/src/contestant-colorways.json").read_text())["colorways"]
FPS = 24

# ----------------------------------------------------------------------------------------- rig
# (name, head, tail, parent). Faces -Y; left side on +X.
def bones():
    B = [
        ("CNT_Root", (0, 0, 0), (0, 0, 0.12), None),
        ("CNT_Hips", (0, 0, 0.43), (0, 0, 0.50), "CNT_Root"),
        ("CNT_Spine", (0, 0, 0.50), (0, 0, 0.59), "CNT_Hips"),
        ("CNT_Chest", (0, 0, 0.59), (0, 0, 0.70), "CNT_Spine"),
        ("CNT_Neck", (0, 0, 0.70), (0, 0, 0.77), "CNT_Chest"),
        ("CNT_Head", (0, 0, 0.77), (0, 0, 1.12), "CNT_Neck"),
        ("CNT_HoodTip", (0, 0.10, 1.02), (0, 0.24, 0.95), "CNT_Head"),
    ]
    for side, sfx in ((1, "L"), (-1, "R")):
        s, e, w = (Vector((side * v[0], v[1], v[2])) for v in (G.SHOULDER, G.ELBOW, G.WRIST))
        d = (w - e).normalized()
        B += [
            (f"CNT_Shoulder_{sfx}", (side * 0.05, 0, 0.665), tuple(s), "CNT_Chest"),
            (f"CNT_UpperArm_{sfx}", tuple(s), tuple(e), f"CNT_Shoulder_{sfx}"),
            (f"CNT_Forearm_{sfx}", tuple(e), tuple(w), f"CNT_UpperArm_{sfx}"),
            (f"CNT_Hand_{sfx}", tuple(w), tuple(w + d * 0.085), f"CNT_Forearm_{sfx}"),
            (f"CNT_Thigh_{sfx}", (side * G.HIP_X, 0, 0.43), (side * G.HIP_X, 0, 0.265), "CNT_Hips"),
            (f"CNT_Shin_{sfx}", (side * G.HIP_X, 0, 0.265), (side * G.HIP_X, 0, 0.075), f"CNT_Thigh_{sfx}"),
            (f"CNT_Foot_{sfx}", (side * G.HIP_X, 0, 0.075), (side * G.HIP_X, -0.125, 0.03), f"CNT_Shin_{sfx}"),
            (f"CNT_CoatFront_{sfx}", (side * 0.10, -0.13, 0.465), (side * 0.13, -0.16, 0.33), "CNT_Hips"),
            (f"CNT_CoatFront2_{sfx}", (side * 0.13, -0.16, 0.33), (side * 0.165, -0.19, 0.18), f"CNT_CoatFront_{sfx}"),
            (f"CNT_CoatBack_{sfx}", (side * 0.07, 0.125, 0.465), (side * 0.09, 0.155, 0.33), "CNT_Hips"),
            (f"CNT_CoatBack2_{sfx}", (side * 0.09, 0.155, 0.33), (side * 0.11, 0.195, 0.18), f"CNT_CoatBack_{sfx}"),
        ]
    return B


def build_rig(col):
    ad = bpy.data.armatures.new("CNT_Rig")
    ad.display_type = "OCTAHEDRAL"
    arm = bpy.data.objects.new("CNT_Rig", ad)
    col.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name, h, t, parent in bones():
        e = ad.edit_bones.new(name)
        e.head, e.tail = Vector(h), Vector(t)
        e.roll = 0.0
        if parent:
            e.parent = eb[parent]
            e.use_connect = False
        e.use_deform = name != "CNT_Root"
        eb[name] = e
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


# ----------------------------------------------------------------------------------------- weights
def sm(e0, e1, x):
    return G.smooth(e0, e1, x)


def seg_t(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return t, (a + ab * t - p).length


def weights_for(rule, side, p):
    """Procedural skin weights by part rule and rest position. Returns {bone: w}."""
    W = {}

    def add(b, w):
        if w > 1e-4:
            W[b] = W.get(b, 0.0) + w

    x, y, z = p
    if rule in ("coat", "belt", "torso"):
        sL = sm(-0.035, 0.035, x)  # soft left/right split (the back is continuous above the vent)
        sides = (("L", sL), ("R", 1 - sL))
        if z >= G.Z_BELT - 0.015 or rule in ("belt", "torso"):
            up = sm(0.52, 0.64, z)
            mid = sm(0.455, 0.53, z)
            torso = {"CNT_Hips": 1 - mid, "CNT_Spine": mid * (1 - up), "CNT_Chest": up}
            if rule == "belt":
                torso = {"CNT_Hips": 0.75, "CNT_Spine": 0.25}
            sh = sm(0.115, 0.175, abs(x)) * sm(0.56, 0.665, z) * 0.65
            for b, w in torso.items():
                add(b, w * (1 - sh))
            add(f"CNT_Shoulder_{'L' if x > 0 else 'R'}", sh)
        else:
            s1 = sm(G.Z_BELT - 0.01, 0.335, z)
            s2 = sm(0.335, 0.20, z)
            th = math.degrees(math.atan2(x, -y))
            front = 1 - sm(65, 115, abs(th))
            add("CNT_Hips", 1 - s1)
            for sfx, ws in sides:
                add(f"CNT_CoatFront_{sfx}", ws * s1 * (1 - s2) * front)
                add(f"CNT_CoatFront2_{sfx}", ws * s1 * s2 * front)
                add(f"CNT_CoatBack_{sfx}", ws * s1 * (1 - s2) * (1 - front))
                add(f"CNT_CoatBack2_{sfx}", ws * s1 * s2 * (1 - front))
    elif rule == "collar":
        h = sm(0.70, 0.86, z)
        add("CNT_Chest", 0.8 - 0.35 * h)
        add("CNT_Neck", 0.2 + 0.35 * h)
    elif rule == "head":
        tip = sm(0.04, 0.20, y) * (1 - sm(1.05, 1.16, z)) * 0.55
        add("CNT_Head", 1 - tip)
        add("CNT_HoodTip", tip)
    elif rule in ("arm", "hand", "epaulette"):
        sfx = "L" if side > 0 else "R"
        s, e, w = (Vector((side * v[0], v[1], v[2])) for v in (G.SHOULDER, G.ELBOW, G.WRIST))
        if rule == "epaulette":
            add(f"CNT_Shoulder_{sfx}", 0.6)
            add("CNT_Chest", 0.4)
        elif rule == "hand":
            t, _ = seg_t(Vector(p), e, w)
            k = sm(0.80, 0.95, t)
            add(f"CNT_Hand_{sfx}", k)
            add(f"CNT_Forearm_{sfx}", 1 - k)
        else:
            P = Vector(p)
            t1, d1 = seg_t(P, s, e)
            t2, d2 = seg_t(P, e, w)
            if d1 <= d2 and t1 < 0.999:
                el = sm(0.78, 1.0, t1) * 0.5
                sh = (1 - sm(-0.25, 0.25, t1))
                ch = (1 - sm(-0.5, 0.05, t1)) * 0.5
                add("CNT_Chest", ch)
                add(f"CNT_Shoulder_{sfx}", sh * (1 - ch))
                add(f"CNT_UpperArm_{sfx}", (1 - sh) * (1 - ch) * (1 - el))
                add(f"CNT_Forearm_{sfx}", (1 - sh) * (1 - ch) * el)
            else:
                el = 1 - sm(0.0, 0.22, t2) * 0.5 - 0.5
                el = 0.5 * (1 - sm(0.0, 0.22, t2))
                hand = sm(0.93, 1.0, t2) * 0.4
                add(f"CNT_UpperArm_{sfx}", el)
                add(f"CNT_Forearm_{sfx}", (1 - el) * (1 - hand))
                add(f"CNT_Hand_{sfx}", (1 - el) * hand)
    elif rule == "leg":
        sfx = "L" if side > 0 else "R"
        hip = sm(0.37, 0.44, z) * 0.6
        knee = sm(0.295, 0.235, z)
        add("CNT_Hips", hip)
        add(f"CNT_Thigh_{sfx}", (1 - hip) * (1 - knee))
        add(f"CNT_Shin_{sfx}", (1 - hip) * knee)
    elif rule == "foot":
        sfx = "L" if side > 0 else "R"
        up = sm(0.10, 0.15, z) * 0.6
        add(f"CNT_Foot_{sfx}", 1 - up)
        add(f"CNT_Shin_{sfx}", up)
    else:
        add("CNT_Hips", 1.0)
    tot = sum(W.values())
    top = sorted(W.items(), key=lambda kv: -kv[1])[:4]
    tot = sum(w for _, w in top) or 1.0
    return {b: w / tot for b, w in top}


# ----------------------------------------------------------------------------------------- meshes
def part_object(part: G.Part, col, merge_with=None):
    parts = [part] + (merge_with or [])
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    reg = bm.faces.layers.int.new("region")
    for pt in parts:
        vs = [bm.verts.new(v) for v in pt.verts]
        for ids, uvs, region in pt.faces:
            if len(set(ids)) < 3:
                continue
            try:
                f = bm.faces.new([vs[i] for i in ids])
            except ValueError:
                continue
            f[reg] = G.REGION[region]
            for loop, uv in zip(f.loops, uvs):
                loop[uvl].uv = uv
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # drop faces collapsed by the weld (poles) and orient outward
    for f in list(bm.faces):
        if f.calc_area() < 1e-12:
            bm.faces.remove(f)
    bm.normal_update()
    # orient every face outward (parts mix mirrored halves, so one flip per part is not enough)
    flip = []
    for f in bm.faces:
        c = f.calc_center_median()
        if part.ref_axis:
            a, b = Vector(part.ref_axis[0]), Vector(part.ref_axis[1])
            t = max(0.0, min(1.0, (c - a).dot(b - a) / (b - a).length_squared))
            out = c - (a + (b - a) * t)
        else:
            out = c - Vector(part.ref)
        if f.normal.dot(out) < 0:
            flip.append(f)
    if flip:
        bmesh.ops.reverse_faces(bm, faces=flip)
    me = bpy.data.meshes.new(part.name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(part.name, me)
    col.objects.link(obj)
    obj["rule"], obj["side"] = part.rule, part.side
    obj["thick"], obj["region_in"], obj["region_rim"] = part.thick, part.region_in, part.region_rim or ""
    obj["hard"] = part.hard
    for _ in range(3):
        me.materials.append(None)
    return obj


def finish_part(obj):
    """Solidify (lining + rims), regions for new faces, shading, then skin weights."""
    me = obj.data
    if obj["thick"] > 0:
        mod = obj.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = obj["thick"]
        mod.offset = -1.0
        mod.use_rim = True
        mod.use_even_offset = False
        mod.use_quality_normals = True
        mod.material_offset = 1
        mod.material_offset_rim = 2
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    me = obj.data
    reg = me.attributes["region"].data
    uv = me.uv_layers.active.data
    plain = G.auv("plain", 0.5, 0.5)
    for poly in me.polygons:
        if poly.material_index == 1:
            reg[poly.index].value = G.REGION[obj["region_in"]]
        elif poly.material_index == 2 and obj["region_rim"]:
            reg[poly.index].value = G.REGION[obj["region_rim"]]
        if poly.material_index in (1, 2):
            for li in poly.loop_indices:
                uv[li].uv = plain
        poly.use_smooth = not obj["hard"]
    # sharp edges where lining or rim meets the outer face, so thin garment edges stay crisp
    bm = bmesh.new()
    bm.from_mesh(me)
    for e in bm.edges:
        fs = e.link_faces
        if len(fs) == 2 and fs[0].material_index != fs[1].material_index:
            e.smooth = False
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.material_index = 0
    # weights
    groups = {}
    for v in me.vertices:
        for b, w in weights_for(obj["rule"], obj["side"], tuple(v.co)).items():
            if b not in groups:
                groups[b] = obj.vertex_groups.new(name=b)
            groups[b].add([v.index], w, "REPLACE")


def build_lod(lod, col_char, col_src=None):
    parts = G.build_parts(lod)
    coat = [p for p in parts if p.name.startswith("CNT_Coat_")]
    rest = [p for p in parts if not p.name.startswith("CNT_Coat_")]
    tmp = bpy.data.collections.new(f"tmp_lod{lod}")
    bpy.context.scene.collection.children.link(tmp)
    objs = []
    c = part_object(coat[0], tmp, merge_with=coat[1:])
    c.name = c.data.name = "CNT_Coat"
    objs.append(c)
    for p in rest:
        objs.append(part_object(p, tmp))
    for o in objs:
        finish_part(o)
    if col_src is not None:
        for o in objs:
            cp = o.copy()
            cp.data = o.data.copy()
            cp.name = cp.data.name = o.name.replace("CNT_", "SRC_")
            col_src.objects.link(cp)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = body.data.name = f"CNT_Contestant_LOD{lod}"
    for k in list(body.keys()):
        del body[k]
    col_char.objects.link(body)
    tmp.objects.unlink(body)
    bpy.data.collections.remove(tmp)
    body["lod"] = lod
    me = body.data
    while len(me.materials) > 1:
        me.materials.pop()
    return body


def bake_ao(objs, samples=160):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    if not scene.world:
        scene.world = bpy.data.worlds.new("CNT_BakeWorld")
    scene.world.light_settings.distance = 0.07
    for o in objs:
        me = o.data
        if "AO" in me.color_attributes:
            me.color_attributes.remove(me.color_attributes["AO"])
        ao = me.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
        me.color_attributes.active_color = ao
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")


def write_cnt(o, baked):
    me = o.data
    if "CNT" in me.color_attributes:
        me.color_attributes.remove(me.color_attributes["CNT"])
    cnt = me.color_attributes.new("CNT", "FLOAT_COLOR", "CORNER")
    reg = me.attributes["region"].data
    ao = me.color_attributes.get("AO") if baked else None
    loops = me.loops
    for poly in me.polygons:
        r = reg[poly.index].value / 15.0
        for li in poly.loop_indices:
            a = ao.data[loops[li].vertex_index].color[0] if ao else 1.0
            a = 0.55 + 0.45 * max(0.0, min(1.0, a))  # keep occlusion gentle (the game adds its own lighting)
            cnt.data[li].color = (r, a, 0.0, 1.0)
    me.color_attributes.active_color = cnt
    me.color_attributes.render_color_index = me.color_attributes.find("CNT")


# ----------------------------------------------------------------------------------------- material
def hex_lin(h):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch(int(h[0:2], 16)), ch(int(h[2:4], 16)), ch(int(h[4:6], 16)))


CW_KEYS = ("coatBase", "coatSecondary", "trim", "beltAccent", "identifierAccent")


def apply_colorway(obj, cw):
    for k in CW_KEYS:
        obj[f"cw_{k}"] = list(hex_lin(cw[k]))
    obj["colorway"] = cw["id"]


def render_material():
    """One shared material: region id -> colour (colourway colours from object properties, fixed ones
    for faceplate, emblem, leather...), shared detail and normal textures, baked AO."""
    mat = bpy.data.materials.new("MAT_CNT_Contestant")
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N, L = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    L.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    attr = N.new("ShaderNodeAttribute")
    attr.attribute_type = "GEOMETRY"
    attr.attribute_name = "CNT"
    sep = N.new("ShaderNodeSeparateColor")
    L.new(attr.outputs["Color"], sep.inputs["Color"])
    detail = normal = None
    for name, nc in (("CNT_Detail.png", True), ("CNT_Normal.png", True)):
        p = TEX / name
        if p.exists():
            im = bpy.data.images.get(name) or bpy.data.images.load(str(p))
            im.colorspace_settings.name = "Non-Color"
            node = N.new("ShaderNodeTexImage")
            node.image = im
            if name.startswith("CNT_Detail"):
                detail = node
            else:
                normal = node
    colour = None
    emis = None
    for region, rid in G.REGION.items():
        cmp = N.new("ShaderNodeMath")
        cmp.operation = "COMPARE"
        L.new(sep.outputs["Red"], cmp.inputs[0])
        cmp.inputs[1].default_value = rid / 15.0
        cmp.inputs[2].default_value = 0.4 / 15.0
        if region in CW_KEYS:
            src = N.new("ShaderNodeAttribute")
            src.attribute_type = "OBJECT"
            src.attribute_name = f"cw_{region}"
            col_out = src.outputs["Color"]
        else:
            rgb = N.new("ShaderNodeRGB")
            rgb.outputs[0].default_value = (*hex_lin(G.FIXED_COLOURS[region]), 1)
            col_out = rgb.outputs[0]
        mix = N.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        L.new(cmp.outputs[0], mix.inputs["Factor"])
        if colour is None:
            mix.inputs["A"].default_value = (0, 0, 0, 1)
        else:
            L.new(colour, mix.inputs["A"])
        L.new(col_out, mix.inputs["B"])
        colour = mix.outputs["Result"]
        if region in ("emblem", "identifierAccent"):
            m2 = N.new("ShaderNodeMath")
            m2.operation = "MULTIPLY"
            L.new(cmp.outputs[0], m2.inputs[0])
            m2.inputs[1].default_value = 1.0 if region == "emblem" else 0.6
            if emis is None:
                emis = m2.outputs[0]
            else:
                add = N.new("ShaderNodeMath")
                L.new(emis, add.inputs[0])
                L.new(m2.outputs[0], add.inputs[1])
                emis = add.outputs[0]
    # stitches take the trim colour on fabric; detail R darkens seams; baked AO from the vertex colour
    if detail:
        dsep = N.new("ShaderNodeSeparateColor")
        L.new(detail.outputs["Color"], dsep.inputs["Color"])
        trim = N.new("ShaderNodeAttribute")
        trim.attribute_type = "OBJECT"
        trim.attribute_name = "cw_trim"
        st = N.new("ShaderNodeMix")
        st.data_type = "RGBA"
        L.new(dsep.outputs["Blue"], st.inputs["Factor"])
        L.new(colour, st.inputs["A"])
        L.new(trim.outputs["Color"], st.inputs["B"])
        colour = st.outputs["Result"]
        cav = N.new("ShaderNodeMix")
        cav.data_type = "RGBA"
        cav.blend_type = "MULTIPLY"
        cav.inputs["Factor"].default_value = 1.0
        L.new(colour, cav.inputs["A"])
        cav_k = N.new("ShaderNodeMath")
        cav_k.operation = "DIVIDE"
        L.new(dsep.outputs["Red"], cav_k.inputs[0])
        cav_k.inputs[1].default_value = 0.85  # 0.85 is neutral: seams darker, worn edges lighter
        L.new(cav_k.outputs[0], cav.inputs["B"])
        colour = cav.outputs["Result"]
        rough = N.new("ShaderNodeMapRange")
        L.new(dsep.outputs["Green"], rough.inputs["Value"])
        rough.inputs["To Min"].default_value = 0.35
        rough.inputs["To Max"].default_value = 1.0
        L.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = 0.8
    aom = N.new("ShaderNodeMix")
    aom.data_type = "RGBA"
    aom.blend_type = "MULTIPLY"
    aom.inputs["Factor"].default_value = 1.0
    L.new(colour, aom.inputs["A"])
    L.new(sep.outputs["Green"], aom.inputs["B"])
    L.new(aom.outputs["Result"], bsdf.inputs["Base Color"])
    if normal:
        nm = N.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 1.0
        L.new(normal.outputs["Color"], nm.inputs["Color"])
        L.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emis is not None:
        L.new(colour, bsdf.inputs["Emission Color"])
        L.new(emis, bsdf.inputs["Emission Strength"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    return mat


# ----------------------------------------------------------------------------------------- animation
def qworld(pb, axis, deg):
    M = pb.bone.matrix_local.to_quaternion()
    q = Quaternion(Vector({"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis]), math.radians(deg))
    return M.inverted() @ q @ M


def apply_pose(arm, pose):
    """pose: {bone: (x, y, z) degrees about armature axes at the bone}, 'root': (x, y, z) metres,
    'squash': (s_xy, s_z) on the hips. Right-side y/z rotations are mirrored by the clip functions."""
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    for bone, rot in pose.items():
        if bone in ("root", "squash"):
            continue
        rx, ry, rz = rot
        pb = arm.pose.bones[bone]
        q = qworld(pb, "X", rx)
        q = qworld(pb, "Y", ry) @ q
        q = qworld(pb, "Z", rz) @ q
        pb.rotation_quaternion = q
    if "root" in pose:
        pb = arm.pose.bones["CNT_Root"]
        pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector(pose["root"])
    if "squash" in pose:
        sxy, sz = pose["squash"]
        arm.pose.bones["CNT_Hips"].scale = (sxy, sz, sxy)  # bone Y is world Z for the hips


S = math.sin
C = math.cos
TAU = 2 * math.pi


def legs(pose, aL, kL, aR, kR, foot=0.6):
    """Thigh angle a (deg, negative = forward), knee flex k (deg, positive bends back)."""
    pose["CNT_Thigh_L"] = (aL, 0, 0)
    pose["CNT_Shin_L"] = (kL, 0, 0)
    pose["CNT_Foot_L"] = (-(aL + kL) * foot, 0, 0)
    pose["CNT_Thigh_R"] = (aR, 0, 0)
    pose["CNT_Shin_R"] = (kR, 0, 0)
    pose["CNT_Foot_R"] = (-(aR + kR) * foot, 0, 0)


def arms(pose, upL, foreL, upR, foreR, outL=0.0, outR=0.0):
    """Upper arm swing (deg, negative = forward), elbow bend (negative bends forward), out = abduction."""
    # raising an arm sideways is a rotation about the forward (Y) axis: -Y lifts the left arm, +Y the right
    pose["CNT_UpperArm_L"] = (upL, -outL, 0)
    pose["CNT_Forearm_L"] = (foreL, 0, 0)
    pose["CNT_UpperArm_R"] = (upR, outR, 0)
    pose["CNT_Forearm_R"] = (foreR, 0, 0)


def coat(pose, aL, aR, flare=0.0, back_lag=0.0):
    """Coat tails follow the thighs with lag and flare outward (secondary motion)."""
    pose["CNT_CoatFront_L"] = (aL * 0.55 - flare * 0.4, -flare * 0.5, 0)
    pose["CNT_CoatFront2_L"] = (aL * 0.25 - flare * 0.5, -flare * 0.2, 0)
    pose["CNT_CoatFront_R"] = (aR * 0.55 - flare * 0.4, flare * 0.5, 0)
    pose["CNT_CoatFront2_R"] = (aR * 0.25 - flare * 0.5, flare * 0.2, 0)
    pose["CNT_CoatBack_L"] = (max(0.0, aL) * 0.4 + flare + back_lag, -flare * 0.4, 0)
    pose["CNT_CoatBack2_L"] = (flare * 0.6 + back_lag * 0.6, 0, 0)
    pose["CNT_CoatBack_R"] = (max(0.0, aR) * 0.4 + flare + back_lag, flare * 0.4, 0)
    pose["CNT_CoatBack2_R"] = (flare * 0.6 + back_lag * 0.6, 0, 0)


def base(pose, out=12.0):
    arms(pose, 0, -8, 0, -8, out, out)


def clip_idle(t):
    p = {}
    b = S(TAU * t)
    base(p, 12 + 1.5 * b)
    p["CNT_Chest"] = (1.5 * b, 0, 0)
    p["CNT_Spine"] = (0.6 * b, 0, 1.2 * S(TAU * t * 0.5))
    p["CNT_Head"] = (-1.2 * b, 0, 2.0 * S(TAU * t * 0.5 + 0.6))
    p["CNT_HoodTip"] = (2.5 * S(TAU * t - 0.8), 0, 0)
    p["root"] = (0, 0, 0.004 * b)
    legs(p, 0, 2, 0, 2)
    coat(p, 1.2 * S(TAU * t - 0.6), 1.2 * S(TAU * t - 0.6), flare=0.6 * (1 + S(TAU * t - 1.0)))
    return p


def locomotion(t, A, K, lean, swing, elbow, bounce, yaw, flare_k, lag=0.07):
    p = {}
    ph = TAU * t
    aL, aR = -A * S(ph), A * S(ph)
    kL = 6 + K * max(0.0, C(ph)) ** 1.4
    kR = 6 + K * max(0.0, -C(ph)) ** 1.4
    legs(p, aL, kL, aR, kR)
    arms(p, swing * S(ph), elbow, -swing * S(ph), elbow, 10, 10)
    p["CNT_Hips"] = (0, 0, yaw * S(ph))
    p["CNT_Spine"] = (lean * 0.6, 0, -yaw * 0.6 * S(ph))
    p["CNT_Chest"] = (lean * 0.4, 0, -yaw * 0.5 * S(ph))
    p["CNT_Head"] = (-lean * 0.7, 0, yaw * 0.3 * S(ph))
    p["CNT_HoodTip"] = (6 * flare_k * S(2 * ph - 1.2) + 4 * flare_k, 0, 0)
    p["root"] = (0, 0, bounce * (0.5 + 0.5 * C(2 * ph)))
    lagA = -A * S(ph - TAU * lag)
    coat(p, lagA, -lagA, flare=flare_k * (5 + 4 * C(2 * ph - 1.0)), back_lag=flare_k * 6)
    return p


def clip_walk(t):
    return locomotion(t, A=24, K=34, lean=4, swing=24, elbow=-14, bounce=0.014, yaw=5, flare_k=0.5)


def clip_run(t):
    p = locomotion(t, A=40, K=72, lean=13, swing=52, elbow=-58, bounce=0.034, yaw=8, flare_k=1.3, lag=0.09)
    ph = TAU * t
    contact = max(0.0, C(2 * ph + 0.5)) ** 3
    p["squash"] = (1 + 0.03 * contact, 1 - 0.05 * contact)
    return p


def clip_start(t):
    p = locomotion(t * 0.5, A=30 * t, K=50 * t, lean=22 * S(math.pi * t) + 8 * t, swing=40 * t, elbow=-45, bounce=0.01, yaw=4, flare_k=1.0)
    p["root"] = (0, 0, -0.02 * S(math.pi * t))
    return p


def clip_stop(t):
    p = {}
    k = S(math.pi * min(1.0, t * 1.4))
    settle = (1 - t) * S(TAU * t * 1.5)
    legs(p, -28 * k, 22 * k, -12 * k, 10 * k)
    arms(p, -40 * k + 8 * settle, -30 * k, -36 * k + 8 * settle, -30 * k, 25 * k + 10, 25 * k + 10)
    p["CNT_Spine"] = (-14 * k + 6 * settle, 0, 0)
    p["CNT_Chest"] = (-6 * k + 4 * settle, 0, 0)
    p["CNT_Head"] = (8 * k, 0, 0)
    p["CNT_HoodTip"] = (-10 * k + 6 * settle, 0, 0)
    p["root"] = (0, 0.03 * k, -0.025 * k)
    coat(p, -20 * k + 10 * settle, -20 * k + 10 * settle, flare=-6 * k + 8 * settle)
    return p


def crouch(p, k):
    legs(p, -38 * k, 68 * k, -38 * k, 68 * k, foot=0.45)
    p["root"] = (0, 0, -0.07 * k)
    p["CNT_Spine"] = (16 * k, 0, 0)


def clip_jump_start(t):
    p = {}
    k = S(math.pi * min(1.0, t / 0.7)) if t < 0.7 else 0.0
    up = max(0.0, (t - 0.55) / 0.45)
    crouch(p, k)
    arms(p, 30 * k - 40 * up, -20, 30 * k - 40 * up, -20, 15 + 60 * up, 15 + 60 * up)
    p["squash"] = (1 + 0.06 * k - 0.03 * up, 1 - 0.09 * k + 0.07 * up)
    p["root"] = (0, 0, -0.07 * k + 0.05 * up)
    coat(p, 0, 0, flare=-8 * k + 10 * up)
    return p


def clip_jump_air(t):
    p = {}
    w = S(TAU * t)
    legs(p, -30 + 8 * w, 50 - 6 * w, -18 - 8 * w, 40 + 6 * w)
    arms(p, -35 + 8 * w, -20, -35 - 8 * w, -20, 82 + 10 * w, 82 - 10 * w)
    p["CNT_Spine"] = (-6, 0, 0)
    p["CNT_Head"] = (-6, 0, 0)
    p["CNT_HoodTip"] = (-14 + 4 * w, 0, 0)
    p["root"] = (0, 0, 0.0)
    coat(p, 8, 8, flare=16 + 4 * w, back_lag=8)
    p["squash"] = (0.97, 1.05)
    return p


def clip_jump_land(t):
    p = {}
    k = S(math.pi * min(1.0, t / 0.6)) if t < 0.6 else 0.0
    rebound = max(0.0, S(math.pi * (t - 0.5) / 0.5)) if t > 0.5 else 0.0
    crouch(p, 0.8 * k)
    arms(p, -30 * (1 - t), -20, -30 * (1 - t), -20, 40 * (1 - t) + 10, 40 * (1 - t) + 10)
    p["squash"] = (1 + 0.09 * k - 0.02 * rebound, 1 - 0.13 * k + 0.04 * rebound)
    p["CNT_HoodTip"] = (14 * k, 0, 0)
    coat(p, 0, 0, flare=10 * (1 - t) - 4 * k)
    return p


def clip_dive(t):
    p = {}
    k = sm(0.0, 0.45, t)
    slide = sm(0.45, 1.0, t)
    p["CNT_Root"] = (88 * k, 0, 0)
    p["root"] = (0, -0.42 * k - 0.18 * slide, 0.14 * k + 0.08 * S(math.pi * min(1.0, t / 0.45)))  # lying on the coat, not in the ground
    arms(p, -165 * k, -5, -165 * k, -5, 18, 18)
    legs(p, 22 * k, 30 * k, 26 * k, 36 * k)
    p["CNT_Head"] = (-30 * k, 0, 0)
    p["CNT_HoodTip"] = (-12 * k + 6 * slide, 0, 0)
    coat(p, 10, 10, flare=-6 * k, back_lag=-10 * k)
    p["squash"] = (1 + 0.04 * slide * (1 - slide) * 4, 1 - 0.06 * slide * (1 - slide) * 4)
    return p


def clip_push(t):
    p = locomotion(t, A=16, K=30, lean=26, swing=0, elbow=0, bounce=0.012, yaw=3, flare_k=0.4)
    arms(p, -78 + 4 * S(TAU * t * 2), -6, -78 - 4 * S(TAU * t * 2), -6, 14, 14)
    p["CNT_Head"] = (-18, 0, 0)
    return p


def clip_pull(t):
    p = {}
    ph = TAU * t
    tug = max(0.0, S(ph * 2)) ** 2
    legs(p, -26 - 6 * S(ph), 14 + 8 * max(0.0, C(ph)), -18 + 6 * S(ph), 10 + 8 * max(0.0, -C(ph)))
    p["CNT_Spine"] = (-20 - 6 * tug, 0, 3 * S(ph))
    p["CNT_Chest"] = (-8 - 3 * tug, 0, 0)
    p["CNT_Head"] = (14 + 3 * tug, 0, 0)
    arms(p, -52 + 8 * tug, -42 + 10 * tug, -46 + 8 * tug, -48 + 10 * tug, 6, 6)
    p["root"] = (0, 0.05 + 0.02 * tug, -0.03 - 0.01 * tug)
    p["CNT_HoodTip"] = (-6 - 6 * tug, 0, 0)
    coat(p, -14, -10, flare=-4 + 4 * tug)
    return p


def clip_stumble(t):
    p = {}
    k = S(math.pi * min(1.0, t / 0.55)) if t < 0.55 else 0.0
    rec = sm(0.45, 1.0, t)
    flail = S(TAU * t * 3) * (1 - rec)
    p["CNT_Spine"] = (30 * k, 0, 6 * flail)
    p["CNT_Chest"] = (12 * k, 0, 0)
    p["CNT_Head"] = (-10 * k, 0, 8 * flail)
    legs(p, -34 * k, 30 * k, 30 * k, 50 * k)
    arms(p, -40 * k - 30 * flail, -30, -40 * k + 30 * flail, -30, 60 * k + 10, 60 * k + 10)
    p["root"] = (0, -0.06 * k, -0.03 * k)
    p["CNT_HoodTip"] = (12 * k, 0, 0)
    coat(p, -20 * k, 20 * k, flare=12 * k)
    return p


def fall_pose(p, k, kick=0.0):
    p["CNT_Root"] = (-86 * k, 0, 0)
    p["root"] = (0, 0.05 * k, 0.15 * k)
    legs(p, -36 * k - 18 * kick, 30 * k, -28 * k + 18 * kick, 24 * k)
    arms(p, -140 * k, -20, -140 * k, -20, 50 * k + 10, 50 * k + 10)
    p["CNT_Head"] = (24 * k, 0, 0)
    p["CNT_HoodTip"] = (-14 * k, 0, 0)
    coat(p, -26 * k, -22 * k, flare=-10 * k)


def clip_fall(t):
    p = {}
    k = sm(0.0, 0.55, t) ** 1.6
    bounce = max(0.0, S(math.pi * (t - 0.55) / 0.25)) if 0.55 < t < 0.8 else 0.0
    fall_pose(p, k)
    p["root"] = (0, 0.05 * k, 0.15 * k + 0.035 * bounce)
    p["squash"] = (1 + 0.05 * bounce, 1 - 0.06 * bounce)
    return p


def clip_recover(t):
    p = {}
    k = 1 - sm(0.0, 0.75, t)
    sit = S(math.pi * min(1.0, t / 0.75))
    fall_pose(p, k)
    legs(p, -36 * k - 50 * sit * (1 - t), 30 * k + 70 * sit * (1 - t), -28 * k - 50 * sit * (1 - t), 24 * k + 70 * sit * (1 - t))
    shake = sm(0.75, 1.0, t) * S(TAU * t * 4) * (1 - t) * 4
    p["CNT_Head"] = (24 * k, 0, 10 * shake)
    p["CNT_Spine"] = (20 * sit * (1 - t), 0, 4 * shake)
    return p


def clip_eliminated(t):
    p = {}
    hop = S(math.pi * min(1.0, t / 0.25)) if t < 0.25 else 0.0
    k = sm(0.22, 0.55, t) ** 1.4
    kick = S(TAU * (t - 0.55) * 2.5) * (1 - sm(0.55, 0.95, t)) if t > 0.55 else 0.0
    if t < 0.25:
        arms(p, -150 * hop, -10, -150 * hop, -10, 60 * hop, 60 * hop)
        legs(p, -10 * hop, 20 * hop, -10 * hop, 20 * hop)
        p["root"] = (0, 0, 0.07 * hop)
        p["squash"] = (0.95, 1.07)
        p["CNT_HoodTip"] = (-12 * hop, 0, 0)
        coat(p, 0, 0, flare=10 * hop)
    else:
        fall_pose(p, k, kick)
    return p


def clip_victory(t):
    p = {}
    ph = TAU * t
    up = max(0.0, S(ph))
    legs(p, -18 * up, 30 * up, -18 * up, 30 * up)
    arms(p, -12, -10 - 25 * max(0.0, S(2 * ph)), -12, -10 - 25 * max(0.0, -S(2 * ph)), 118 + 14 * S(2 * ph), 118 - 14 * S(2 * ph))
    p["root"] = (0, 0, 0.09 * up)
    p["CNT_Spine"] = (-6 * up, 0, 6 * S(ph))
    p["CNT_Head"] = (-10 * up, 0, 0)
    p["CNT_HoodTip"] = (-14 * up + 6, 0, 0)
    land = max(0.0, -S(ph))
    p["squash"] = (1 + 0.06 * land, 1 - 0.08 * land + 0.04 * up)
    coat(p, 0, 0, flare=6 + 14 * up)
    return p


# name: (function, frames, loop, use)
CLIPS = {
    "Idle": (clip_idle, 48, True, "standing still (lobby, red light)"),
    "Walk": (clip_walk, 24, True, "slow movement; playback speed follows ground speed"),
    "Run": (clip_run, 12, True, "full speed (4 m/s); playback speed follows ground speed"),
    "Start": (clip_start, 8, False, "push-off from standing"),
    "Stop": (clip_stop, 10, False, "skid to a stop (e.g. on amber or red)"),
    "JumpStart": (clip_jump_start, 6, False, "jump take-off (lobby emote; no jump in Stage 01 rules)"),
    "JumpAir": (clip_jump_air, 12, True, "airborne"),
    "JumpLand": (clip_jump_land, 8, False, "landing compression"),
    "Dive": (clip_dive, 16, False, "forward dive / belly flop (lobby emote)"),
    "Push": (clip_push, 24, True, "Tug of War: push"),
    "Pull": (clip_pull, 24, True, "Tug of War: heave on the rope"),
    "Stumble": (clip_stumble, 16, False, "hit an obstacle at speed"),
    "Fall": (clip_fall, 20, False, "knocked down onto the back"),
    "Recover": (clip_recover, 24, False, "get back up from Fall"),
    "Eliminated": (clip_eliminated, 32, False, "spotted: comic hop and flop (spectator transition follows)"),
    "Victory": (clip_victory, 32, True, "finished / winner"),
}


def key_all(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)
        pb.keyframe_insert("scale", frame=frame)


def _fcurves(act):
    if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out += list(bag.fcurves)
    return out


def build_clips(arm):
    arm.animation_data_create()
    for name, (fn, frames, loop, use) in CLIPS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        act.use_frame_range = True
        act.frame_start, act.frame_end = 1, 1 + frames
        act.use_cyclic = loop
        act["loop"] = loop
        act["use"] = use
        arm.animation_data.action = act
        for f in range(frames + 1):
            t = f / frames
            if loop and f == frames:
                t = 0.0
            apply_pose(arm, fn(min(t, 1.0)))  # clip functions already mirror the right side
            key_all(arm, 1 + f)
        for fc in _fcurves(act):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, act)
        track.mute = True
    arm.animation_data.action = None
    apply_pose(arm, {})


# ----------------------------------------------------------------------------------------- main
def main() -> None:
    bake = "--no-bake" not in sys.argv
    cb.new_empty_scene()
    scene = bpy.context.scene
    scene.render.fps = FPS
    cols = {n: bpy.data.collections.new(n) for n in ("CNT_CHARACTER", "CNT_RIG", "CNT_SOURCE")}
    for c in cols.values():
        scene.collection.children.link(c)
    arm = build_rig(cols["CNT_RIG"])
    lods = [build_lod(0, cols["CNT_CHARACTER"], cols["CNT_SOURCE"]), build_lod(1, cols["CNT_CHARACTER"]), build_lod(2, cols["CNT_CHARACTER"])]
    cols["CNT_SOURCE"].hide_render = True
    cols["CNT_SOURCE"].hide_viewport = True
    if bake:
        bake_ao(lods)
    mat = render_material()
    for o in lods:
        write_cnt(o, bake)
        o.data.materials.clear()
        o.data.materials.append(mat)
        mod = o.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        apply_colorway(o, COLORWAYS[0])
        o.hide_render = o["lod"] != 0
    for o in cols["CNT_SOURCE"].objects:
        o.data.materials.clear()
        o.data.materials.append(mat)
        apply_colorway(o, COLORWAYS[0])
    build_clips(arm)
    scene.frame_start, scene.frame_end = 1, 49
    tri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)  # noqa: E731
    report = {f"LOD{o['lod']}": {"triangles": tri(o), "vertices": len(o.data.vertices), "groups": len(o.vertex_groups)} for o in lods}
    report["bones"] = len(arm.data.bones)
    report["clips"] = list(CLIPS)
    report["ao_baked"] = bake
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT), compress=True)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
