"""Build THE WATCHER from the owner's Creepy doll model (decision 041).

Saves blender/scenes/THE_WATCHER.blend: the doll mesh exactly as supplied (only decimated, see
watcher_doll_prepare.py), a small `Watcher_` rig, red/green/neutral glowing eyes placed on the doll's own
irises, gameplay anchors, a LOD1 mesh and nine animation clips. Height 28 m (spec L9 / decision 014);
origin at the feet (ground centre); faces -Y.

Owner's brief (25 Nov 2026): do not change anything on the model; add red glowing eyes on the doll's eyes;
more dirt is allowed (done in the runtime shader, watcherLook.ts); reduce polygons but keep the detail;
make the rotation as seamless as possible; no raised hand, only slight creepy movement: when it stops
(RED) it leans and tilts its head to look down at the players.

Rig: Watcher_Root (ground, never animated) > Watcher_Turn (the whole doll turns on it) > Watcher_Chest >
Watcher_Neck > Watcher_Head > Watcher_Eye > Watcher_LensNeutral / _LensRed / _LensGreen. The doll mesh has
smooth weights (Turn, Chest, Head) so the head lean bends at the neck without a seam. Each eye has a
glowing ring and pupil per signal state; clips show one state by scaling the other two to 1 % (their
bones sit inside the head, so a hidden state shrinks out of sight). No detection or elimination logic is
in this file: the server owns it.

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
from mathutils.bvhtree import BVHTree  # noqa: E402

import cn_blender as cb  # noqa: E402

ROOT = cb.REPO_ROOT
SOURCE = ROOT / "blender/source/THE_WATCHER_DOLL.glb"
TEX = ROOT / "blender/textures/WATCHER/T_W_Doll_BC.jpg"
OUT = ROOT / "blender/scenes/THE_WATCHER.blend"
FPS = 24
HEIGHT = 28.0

# The doll's irises, measured on a front orthographic render of the prepared mesh (metres, 28 m scale).
EYE_R = Vector((-2.52, 0.0, 19.55))   # the character's right eye (-X when facing -Y)
EYE_L = Vector((1.90, 0.0, 19.60))
EYE_MID = (EYE_R + EYE_L) / 2
NECK_Z = 16.0                          # chin line; the head bends here
LENS_STATES = (("Watcher_LensNeutral", "MAT_Watcher_Lens_Neutral"), ("Watcher_LensRed", "MAT_Watcher_Lens_Red"),
               ("Watcher_LensGreen", "MAT_Watcher_Lens_Green"))
LENS = tuple(b for b, _ in LENS_STATES)

LENS_MATS = {
    "MAT_Watcher_Lens_Neutral": {"colour": (0.3, 0.33, 0.35), "emit": (0.75, 0.85, 0.9), "strength": 1.2},
    "MAT_Watcher_Lens_Red": {"colour": (0.4, 0.02, 0.02), "emit": (1.0, 0.02, 0.01), "strength": 2.0},
    "MAT_Watcher_Lens_Green": {"colour": (0.02, 0.35, 0.08), "emit": (0.05, 1.0, 0.25), "strength": 1.8},
}


def lens_material(name):
    o = LENS_MATS[name]
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*o["colour"], 1)
    bsdf.inputs["Roughness"].default_value = 0.1
    bsdf.inputs["Emission Color"].default_value = (*o["emit"], 1)
    bsdf.inputs["Emission Strength"].default_value = o["strength"]
    mat.diffuse_color = (*o["colour"], 1)
    return mat


# ----------------------------------------------------------------------------------- rig
EYE_Y = -3.2  # replaced in main() by the measured surface depth of the eyes
BONES = [
    # name, head, tail, parent
    ("Watcher_Root", (0, 0, 0), (0, 0, 2.0), None),
    ("Watcher_Turn", (0, 0, 0.2), (0, 0, 9.0), "Watcher_Root"),
    ("Watcher_Chest", (0, 0, 9.0), (0, 0, 15.2), "Watcher_Turn"),
    ("Watcher_Neck", (EYE_MID.x, 0.4, 15.2), (EYE_MID.x, 0.4, NECK_Z), "Watcher_Chest"),
    ("Watcher_Head", (EYE_MID.x, 0.4, NECK_Z), (EYE_MID.x, 0.4, HEIGHT), "Watcher_Neck"),
    ("Watcher_Eye", (EYE_MID.x, -1.5, EYE_MID.z), (EYE_MID.x, -3.0, EYE_MID.z), "Watcher_Head"),
    # lens-state bones sit inside the head: a state scaled to 1 % collapses there, out of sight
    ("Watcher_LensNeutral", (EYE_MID.x, 1.0, EYE_MID.z), (EYE_MID.x, 0.5, EYE_MID.z), "Watcher_Eye"),
    ("Watcher_LensRed", (EYE_MID.x, 1.0, EYE_MID.z + 0.01), (EYE_MID.x, 0.5, EYE_MID.z + 0.01), "Watcher_Eye"),
    ("Watcher_LensGreen", (EYE_MID.x, 1.0, EYE_MID.z + 0.02), (EYE_MID.x, 0.5, EYE_MID.z + 0.02), "Watcher_Eye"),
]


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


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def skin_weights(obj):
    """Head above the chin, chest above the waist, the rest turns with Watcher_Turn. Side hair that hangs
    out past the arms follows the head from lower down."""
    vg = {n: obj.vertex_groups.new(name=n) for n in ("Watcher_Turn", "Watcher_Chest", "Watcher_Head")}
    groups = {n: {} for n in vg}
    for v in obj.data.vertices:
        x, y, z = v.co
        z0 = 13.2 if abs(x - EYE_MID.x) > 6.4 else 15.0
        h = smooth(z0, NECK_Z + 0.6, z)
        c = smooth(9.0, 13.0, z)
        w = {"Watcher_Head": h, "Watcher_Chest": (1 - h) * c, "Watcher_Turn": (1 - h) * (1 - c)}
        for n, wt in w.items():
            if wt > 1e-3:
                groups[n].setdefault(round(wt, 3), []).append(v.index)
    for n, by_w in groups.items():
        for wt, idx in by_w.items():
            vg[n].add(idx, wt, "REPLACE")


# ----------------------------------------------------------------------------------- glowing eyes
def build_eyes(doll, mats):
    """A glowing iris ring and pupil on each of the doll's own eyes, one copy per signal state, laid on the
    eye surface by ray casts from the front (parts hidden under a lid are skipped)."""
    bm_src = bmesh.new()
    bm_src.from_mesh(doll.data)
    bvh = BVHTree.FromBMesh(bm_src)
    bm_src.free()

    def hit(x, z):
        loc, nrm, _, _ = bvh.ray_cast(Vector((x, -60.0, z)), Vector((0, 1, 0)))
        return loc

    me = bpy.data.meshes.new("Watcher_Eyes")
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    depths = {}
    for eye in (EYE_R, EYE_L):
        c = hit(eye.x, eye.z)
        depths[tuple(eye)] = c.y
        # (inner radius, outer radius): the glowing ring and the pupil, with the doll's dark iris between
        for r0, r1, seg in ((0.36, 0.64, 40), (0.03, 0.17, 20)):
            for mi in range(len(LENS_STATES)):
                rows = []
                for r in (r0, (r0 + r1) / 2, r1):
                    row = []
                    for k in range(seg):
                        a = 2 * math.pi * k / seg
                        x, z = eye.x + r * math.cos(a), eye.z + r * math.sin(a)
                        p = hit(x, z)
                        ok = p is not None and abs(p.y - c.y) < 0.35
                        y = (p.y if ok else c.y) - 0.04 - 0.002 * mi
                        bv = bm.verts.new((x, y, z))
                        bv[deform][3 + mi] = 1.0  # groups 0-2 are the doll's Turn, Chest, Head
                        row.append((bv, ok))
                    rows.append(row)
                for i in range(2):
                    for k in range(seg):
                        q = [rows[i][k], rows[i][(k + 1) % seg], rows[i + 1][(k + 1) % seg], rows[i + 1][k]]
                        if not all(ok for _, ok in q):
                            continue
                        try:
                            f = bm.faces.new([bv for bv, _ in q])
                        except ValueError:
                            continue
                        f.material_index = 1 + mi  # material 0 is the doll
                        f.smooth = True
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # faces point at the camera (-Y)
    for f in bm.faces:
        if f.normal.y > 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    return me, depths


# ----------------------------------------------------------------------------------- poses and clips
def qworld(pb, axis, deg):
    """Local pose quaternion for a rotation of `deg` about an armature-space axis at the bone."""
    M = pb.bone.matrix_local.to_quaternion()
    q = Quaternion(Vector({"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis]), math.radians(deg))
    return M.inverted() @ q @ M


def apply_pose(arm, pose):
    """pose: {"rot": {bone: (yaw about Z, pitch about X (+ looks down), roll about Y)}, "lens": state}."""
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    for bone, (yaw, pitch, roll) in pose.get("rot", {}).items():
        pb = arm.pose.bones[bone]
        pb.rotation_quaternion = qworld(pb, "Z", yaw) @ qworld(pb, "X", pitch) @ qworld(pb, "Y", roll)
    state = pose.get("lens", "neutral")
    for name in LENS:
        on = name.lower().endswith(state)
        arm.pose.bones[name].scale = (1, 1, 1) if on else (0.01, 0.01, 0.01)


def key_all(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)
        pb.keyframe_insert("scale", frame=frame)


def ease(t):
    """Smootherstep: zero velocity and acceleration at both ends, so turns start and stop without a jolt."""
    t = min(1.0, max(0.0, t))
    return t * t * t * (t * (6 * t - 15) + 10)


def seg(f, a, b):
    return ease((f - a) / (b - a))


def wave(f, period, phase=0.0):
    return math.sin(2 * math.pi * (f - 1) / period + phase)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


Z3 = (0.0, 0.0, 0.0)
# The creepy look-down: the doll leans in and tilts its head to stare down at the yard (no raised hand).
LEAN = {"Watcher_Chest": (0.0, 5.0, 0.0), "Watcher_Neck": (0.0, 7.0, 4.0), "Watcher_Head": (0.0, 11.0, 13.0)}
REST = {"Watcher_Chest": Z3, "Watcher_Neck": Z3, "Watcher_Head": (0.0, 3.0, 5.0)}


def blend(p, q, t):
    return {b: mix(p.get(b, Z3), q.get(b, Z3), t) for b in set(p) | set(q)}


def pose_idle(f):  # 97 frames, loops: a slow, uneasy head tilt and breathing
    r = dict(REST)
    r["Watcher_Head"] = (3.0 * wave(f, 96), 3.0 + 1.0 * wave(f, 48), 5.0 + 4.0 * wave(f, 96, 1.2))
    r["Watcher_Chest"] = (0.0, 0.8 * wave(f, 48), 0.0)
    return {"rot": r, "lens": "neutral"}


def pose_turn_away(f):  # 37 frames: the whole doll turns its back, the head lags a little behind
    t = seg(f, 2, 31)
    r = blend(REST, {"Watcher_Head": (0.0, 2.0, 0.0)}, t)
    r["Watcher_Turn"] = (180.0 * t, 0.0, 0.0)
    r["Watcher_Neck"] = (-14.0 * math.sin(math.pi * t), 0.0, 0.0)
    return {"rot": r, "lens": "green" if f >= 31 else "neutral"}


def pose_green(f):  # 49 frames, loops: back turned, a faint sway
    return {"rot": {"Watcher_Turn": (180.0, 0.0, 0.0), "Watcher_Head": (0.0, 2.0, 3.0 * wave(f, 48)),
                    "Watcher_Chest": (0.0, 0.6 * wave(f, 48, 0.8), 0.0)}, "lens": "green"}


def pose_turn_to_field(f):  # 37 frames (played fast for the RED snap): the head leads, the body follows
    t = seg(f, 1, 33)
    th = seg(f, 1, 25)
    r = blend({"Watcher_Head": (0.0, 2.0, 0.0)}, REST, t)
    r["Watcher_Turn"] = (180.0 * (1 - t), 0.0, 0.0)
    r["Watcher_Neck"] = (-180.0 * (th - t) * 0.35, 0.0, 0.0)   # head ahead of the body, settles to 0
    return {"rot": r, "lens": "green" if f < 6 else "neutral"}


def pose_focus_lock(f):  # 25 frames: leans in and tilts the head down at the players, eyes go red
    return {"rot": blend(REST, LEAN, seg(f, 1, 22)), "lens": "red" if f >= 7 else "neutral"}


def pose_red(f):  # 49 frames, loops: holds the stare; the head tilt creeps a little further and back
    r = dict(LEAN)
    y, p, ro = LEAN["Watcher_Head"]
    r["Watcher_Head"] = (1.5 * wave(f, 48, 0.6), p + 1.5 * (1 - math.cos(2 * math.pi * (f - 1) / 48)) / 2, ro + 4.0 * (1 - math.cos(2 * math.pi * (f - 1) / 48)) / 2)
    r["Watcher_Chest"] = (0.0, LEAN["Watcher_Chest"][1] + 0.6 * wave(f, 48), 0.0)
    return {"rot": r, "lens": "red"}


def pose_scan(f):  # 97 frames, loops: leaning, the head sweeps slowly across the yard
    r = dict(LEAN)
    s = math.sin(2 * math.pi * (f - 1) / 96)
    y, p, ro = LEAN["Watcher_Head"]
    r["Watcher_Head"] = (24.0 * s, p, ro - 6.0 * s)
    r["Watcher_Neck"] = (6.0 * s, LEAN["Watcher_Neck"][1], LEAN["Watcher_Neck"][2])
    r["Watcher_Chest"] = (4.0 * s, LEAN["Watcher_Chest"][1], 0.0)
    return {"rot": r, "lens": "red"}


DETECT = {"Watcher_Chest": (6.0, 8.0, 0.0), "Watcher_Neck": (6.0, 8.0, 6.0), "Watcher_Head": (16.0, 14.0, 24.0)}


def pose_detect(f):  # 41 frames: a sharp jerk of the head toward the player, a deep tilt, then it holds
    t = ease((f - 1) / 6.0)
    r = blend(LEAN, DETECT, t)
    if f > 7:  # tiny twitch while it holds the stare
        y, p, ro = r["Watcher_Head"]
        r["Watcher_Head"] = (y, p, ro + 2.0 * math.sin(math.pi * (f - 7) / 6.0) * max(0.0, 1 - (f - 7) / 18))
    return {"rot": r, "lens": "red"}


def pose_return(f):  # 37 frames: settles back to the neutral stance
    t = seg(f, 1, 30)
    return {"rot": blend(DETECT, REST, t), "lens": "red" if f < 25 else "neutral"}


CLIPS = {
    # name: (loop, last frame, pose function); every clip starts at frame 1
    "Watcher_Idle": (True, 97, pose_idle),
    "Watcher_TurnAway": (False, 37, pose_turn_away),
    "Watcher_GreenSignal": (True, 49, pose_green),
    "Watcher_TurnToField": (False, 37, pose_turn_to_field),
    "Watcher_FocusLock": (False, 25, pose_focus_lock),
    "Watcher_RedSignal": (True, 49, pose_red),
    "Watcher_ScanSweep": (True, 97, pose_scan),
    "Watcher_Detect": (False, 41, pose_detect),
    "Watcher_ReturnNeutral": (False, 37, pose_return),
}
CLIP_USE = {
    "Watcher_Idle": "Lobby and briefing: a slow, uneasy head tilt",
    "Watcher_TurnAway": "Start of GREEN: the whole doll turns its back, eyes to green",
    "Watcher_GreenSignal": "GREEN loop: back turned, faint sway",
    "Watcher_TurnToField": "Turn back to the field (played fast as the RED snap): head leads, body follows",
    "Watcher_FocusLock": "Start of RED: leans in and tilts its head down at the players, eyes red",
    "Watcher_RedSignal": "RED loop: holds the downward stare, the tilt creeps",
    "Watcher_ScanSweep": "RED loop alternative: leaning, slow head sweep across the yard",
    "Watcher_Detect": "A player is spotted (server event): head jerks toward them and tilts deeper",
    "Watcher_ReturnNeutral": "Back to the neutral stance and neutral eyes (results, lobby)",
}


def build_clips(arm):
    arm.animation_data_create()
    for name, (loop, last, fn) in CLIPS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        act.use_frame_range = True
        act.frame_start, act.frame_end = 1, last
        act.use_cyclic = loop
        act["loop"] = loop
        act["use"] = CLIP_USE[name]
        arm.animation_data.action = act
        prev = {}
        for frame in range(1, last + 1):  # loop poses are periodic, so the last frame equals the first
            apply_pose(arm, fn(frame))
            for pb in arm.pose.bones:  # keep neighbouring quaternions on the same hemisphere
                q = pb.rotation_quaternion
                if pb.name in prev and prev[pb.name].dot(q) < 0:
                    pb.rotation_quaternion = -q
                prev[pb.name] = pb.rotation_quaternion.copy()
            key_all(arm, frame)
        for fc in _fcurves(act):
            stepped = any(f'"{b}"' in fc.data_path and fc.data_path.endswith("scale") for b in LENS)
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT" if stepped else "LINEAR"
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, act)
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

    # the doll, exactly as prepared
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    doll = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    for c in list(doll.users_collection):
        c.objects.unlink(doll)
    doll.matrix_world = Matrix.Identity(4)
    dmat = doll.data.materials[0]
    dmat.name = "MAT_Watcher_Doll"
    nt = dmat.node_tree
    for n in list(nt.nodes):  # the source mesh carries no image: wire the original texture from disk
        if n.type not in {"OUTPUT_MATERIAL", "BSDF_PRINCIPLED"}:
            nt.nodes.remove(n)
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(TEX))  # saved relative (relative_remap) with the .blend
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.8
    mats = {n: lens_material(n) for n in LENS_MATS}

    eyes, depths = build_eyes(doll, mats)
    arm = build_rig(cols["WATCHER_RIG"])
    skin_weights(doll)

    # append the eyes to the doll mesh so the game gets one skinned mesh
    for n in LENS:
        doll.vertex_groups.new(name=n)
    for _, m in LENS_STATES:
        doll.data.materials.append(mats[m])
    bm = bmesh.new()
    bm.from_mesh(doll.data)
    bm.from_mesh(eyes)
    bm.to_mesh(doll.data)
    bm.free()
    bpy.data.meshes.remove(eyes)
    cols["WATCHER_CHARACTER"].objects.link(doll)
    obj = doll
    obj.name = obj.data.name = "Watcher_Body"
    mod = obj.modifiers.new("Armature", "ARMATURE")  # not parented: glTF wants the skinned mesh at the root
    mod.object = arm
    obj["lod"] = 0

    # LOD1: the same mesh decimated to about half (weights survive the decimation)
    lod = obj.copy()
    lod.data = obj.data.copy()
    lod.name = lod.data.name = "Watcher_Body_LOD1"
    cols["WATCHER_EXPORT"].objects.link(lod)
    for c in list(lod.users_collection):
        if c.name != "WATCHER_EXPORT":
            c.objects.unlink(lod)
    dec = lod.modifiers.new("Decimate", "DECIMATE")
    dec.ratio = 0.5
    lod.modifiers.move(len(lod.modifiers) - 1, 0)
    with bpy.context.temp_override(object=lod, active_object=lod):
        bpy.ops.object.modifier_apply(modifier="Decimate")
    lod["lod"] = 1
    lod.hide_render = True

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

    yr, yl = depths[tuple(EYE_R)], depths[tuple(EYE_L)]
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    half = [max(abs(p[i]) for p in pts) for i in range(2)]
    anchor("Watcher_Root", (0, 0, 0), "Watcher_Root", "ARROWS", 2.0, {"role": "root_ground_pivot"})
    anchor("Watcher_Facing", (0, -4.0, 0), "Watcher_Root", "SINGLE_ARROW", 2.0, {"role": "facing", "forward": "-Y in Blender, -Z in glTF (toward the start line)"})
    anchor("Watcher_OpticalOrigin", (EYE_R.x, yr - 0.1, EYE_R.z), "Watcher_Eye", "SPHERE", 0.4, {"role": "optical_origin"})
    anchor("Watcher_OpticalOrigin_L", (EYE_L.x, yl - 0.1, EYE_L.z), "Watcher_Eye", "SPHERE", 0.4, {"role": "optical_origin_left_pupil"})
    anchor("Watcher_DetectionForward", (EYE_R.x, yr - 6.0, EYE_R.z), "Watcher_Eye", "SINGLE_ARROW", 1.0, {"role": "detection_forward"})
    anchor("Watcher_AudioOrigin", (0, -2.0, 13.0), "Watcher_Chest", "SPHERE", 0.6, {"role": "audio_origin"})
    ib = anchor("Watcher_InteractionBounds", (0, 0, HEIGHT / 2), "Watcher_Root", "CUBE", 1.0,
                {"role": "interaction_bounds", "half_extents_m": [round(half[0], 2), round(half[1], 2), HEIGHT / 2]})
    ib.scale = (half[0], half[1], HEIGHT / 2)
    for e in cols["WATCHER_GAMEPLAY_ANCHORS"].objects:
        e["note"] = "integration reference only; detection and elimination are server-side"

    # Collision proxy (camera / occlusion helper; never exported)
    cm = bpy.data.meshes.new("Watcher_Collision_Body")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 2 * half[0]
        v.co.y *= 2 * half[1]
        v.co.z = (v.co.z + 0.5) * HEIGHT
    bm.to_mesh(cm)
    bm.free()
    col_obj = bpy.data.objects.new("Watcher_Collision_Body", cm)
    col_obj.display_type = "WIRE"
    col_obj.hide_render = True
    col_obj["collider"] = "box"
    cols["WATCHER_COLLISION"].objects.link(col_obj)

    # Material swatches for the material reference render (not exported)
    for i, m in enumerate([dmat, *mats.values()]):
        sme = bpy.data.meshes.new(f"Watcher_Swatch_{m.name[13:]}")
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=0.9)
        bm.to_mesh(sme)
        bm.free()
        sme.materials.append(m)
        so = bpy.data.objects.new(sme.name, sme)
        so.location = (30 + i * 2.4, 0, 1.2)
        cols["WATCHER_MATERIALS"].objects.link(so)

    build_clips(arm)
    idx = bpy.data.objects.new("Watcher_AnimationIndex", None)
    cols["WATCHER_ANIMATION"].objects.link(idx)
    idx["clips"] = ",".join(CLIPS)
    idx["fps"] = FPS

    scene["asset_id"] = "THE_WATCHER"
    scene["height_m"] = HEIGHT
    scene["build_script"] = "blender/scripts/watcher_build.py"
    scene["source"] = "blender/source/THE_WATCHER_DOLL.glb (owner's Creepy doll, decision 041)"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT), compress=True, relative_remap=True)
    tri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)  # noqa: E731
    print("Saved", OUT.relative_to(ROOT), "| tris", tri(obj), "| LOD1", tri(lod), "| bones", len(arm.data.bones),
          "| eye depth", round(yr, 2), round(yl, 2))


if __name__ == "__main__":
    main()
