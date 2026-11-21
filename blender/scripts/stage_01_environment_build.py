"""Prompt 05: build the detailed Stage 01 visual environment.

Opens a copy of the approved collision-ready scene (blender/scenes/STAGE_01_COLLISION_READY.blend,
itself built from the approved greybox) and saves blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend.

Rules it keeps (checked by validate_stage_01_environment.py):
- Gameplay collections (GAMEPLAY_*, PLAYER_SPAWNS, WATCHER_REFERENCE, SPECTATOR_LOCATIONS,
  SIGNAL_ANCHORS) are not touched: same objects, transforms, meshes and properties.
- Every visual object that a collision proxy was fitted to keeps its name and origin and is rebuilt
  inside that proxy's bounds, so collision still covers it.
- Nothing visual stands inside the yard above the ground except the finish gate and the raised start
  barrier arm (approved), so no new obstacles and The Shepherd stays visible from every spawn.
- Only glTF-compatible materials (stage_01_env_kit.MATERIALS) with the generated textures.
- Visual models, collision models and lighting live in separate collections.

Tone follows decision 008 (playful; eerie atmosphere, no horror imagery): rust, damp concrete, teal
haze and warm practical lights, but no gore, skulls or threatening signage.

    python blender/scripts/stage_01_environment_build.py
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cn_blender as cb  # noqa: E402
import stage_01_env_kit as kit  # noqa: E402
from stage_01_env_kit import MeshBuilder as MB  # noqa: E402

ROOT = cb.REPO_ROOT
SOURCE = ROOT / "blender/scenes/STAGE_01_COLLISION_READY.blend"
OUT = ROOT / "blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend"
GAMEPLAY = ("GAMEPLAY_COLLISION", "GAMEPLAY_TRIGGERS", "GAMEPLAY_BOUNDARIES", "GAMEPLAY_MARKERS",
            "PLAYER_SPAWNS", "WATCHER_REFERENCE", "SPECTATOR_LOCATIONS", "SIGNAL_ANCHORS")
VISUAL = ("VISUAL_ARCHITECTURE", "VISUAL_PROPS", "VISUAL_SIGNAL_DEVICES", "VISUAL_MACHINERY",
          "VISUAL_FOLIAGE", "VISUAL_BACKDROP", "VISUAL_WATCHER", "VISUAL_VFX")
RNG = random.Random(5)

# Finishes (materials) by role.
CONC, RUST, DARK, GALV = "MAT_Concrete_Weathered", "MAT_Metal_RustPaint", "MAT_Steel_Dark", "MAT_Steel_Galvanised"
LINK, WOOD, HAZ, WARM = "MAT_ChainLink", "MAT_Wood_Weathered", "MAT_Stripes_Hazard", "MAT_Light_Warm"


def bbox(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


class Env:
    def __init__(self) -> None:
        if not SOURCE.exists():
            sys.exit(f"Missing approved input: {SOURCE.relative_to(ROOT)}")
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
        self.O = bpy.data.objects
        self.scene = bpy.context.scene
        self.mats = kit.all_materials()
        self.cols = {c.name: c for c in self.scene.collection.children}
        for name in VISUAL + ("LIGHTING",):
            if name not in self.cols:
                col = bpy.data.collections.new(name)
                self.scene.collection.children.link(col)
                self.cols[name] = col
        self.tris = {}

    # ------------------------------------------------------------------ helpers
    def move(self, obj, coll: str) -> None:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        self.cols[coll].objects.link(obj)

    def set_mesh(self, objs, mb: MB, mesh_name: str):
        """Give existing objects (one shared mesh) new geometry; keep names, origins and transforms."""
        objs = list(objs)
        old = {o.data for o in objs}
        me = mb.mesh(mesh_name + "_tmp", self.mats)
        for o in objs:
            o.data = me
        for m in old:
            if m.users == 0:
                bpy.data.meshes.remove(m)
        me.name = mesh_name
        return me

    def new_obj(self, name: str, mb: MB | None, coll: str, loc=(0, 0, 0), mesh=None, props=None):
        me = mesh if mesh is not None else mb.mesh(name, self.mats)
        o = bpy.data.objects.new(name, me)
        o.location = loc
        self.cols[coll].objects.link(o)
        for k, v in (props or {}).items():
            o[k] = v
        return o

    def objs(self, prefix: str):
        return sorted((o for o in self.O if o.name.startswith(prefix) and o.type == "MESH"), key=lambda o: o.name)

    # ------------------------------------------------------------------ collections
    def reorganise(self) -> None:
        for o in list(self.cols["LIGHTING"].objects):
            if o.type != "LIGHT":
                n = o.name
                self.move(o, "VISUAL_SIGNAL_DEVICES" if n.startswith(("PRP_KIT_SignalLamp", "PRP_KIT_Loudspeaker")) else "VISUAL_ARCHITECTURE")
        for o in list(self.cols["VISUAL_PROPS"].objects):
            if o.name.startswith("STG01_BG_Tree"):
                self.move(o, "VISUAL_FOLIAGE")
            elif o.name.startswith("STG01_BG_"):
                self.move(o, "VISUAL_BACKDROP")

    # ------------------------------------------------------------------ ground and markings
    def ground(self) -> None:
        y = self.O["STG01_Ground_Yard"]
        mn, mx = bbox(y)
        mb = MB(y.location)
        xs = [mn.x + (mx.x - mn.x) * i / 6 for i in range(7)]
        ys = [mn.y + (mx.y - mn.y) * j / 17 for j in range(18)]
        for i in range(6):
            for j in range(17):
                mb.poly([(xs[i], ys[j], mx.z), (xs[i + 1], ys[j], mx.z), (xs[i + 1], ys[j + 1], mx.z), (xs[i], ys[j + 1], mx.z)], "MAT_Asphalt_Wet")
        mb.box((mn.x, mn.y, mn.z), (mx.x, mx.y, mx.z - 0.001), "MAT_Asphalt_Wet")
        self.set_mesh([y], mb, "STG01_Ground_Yard")

        g = self.O["STG01_Ground_Outer"]
        mn, mx = bbox(g)
        mb = MB(g.location)
        mb.box(mn, mx, "MAT_Ground_DirtGrass")
        self.set_mesh([g], mb, "STG01_Ground_Outer")

        mb = MB((0, 100, -0.16))
        mb.box((-400, -260, -0.18), (400, 470, -0.16), "MAT_Ground_Far")
        self.new_obj("STG01_BG_Ground_Far", mb, "VISUAL_BACKDROP", (0, 100, -0.16))

        # Painted markings keep their footprint; worn paint with alpha holes.
        for prefix, mat in (("STG01_LaneLine", "MAT_Paint_Line"), ("STG01_StartBand", "MAT_Paint_Line"), ("STG01_FinishBand", "MAT_Checker_Finish")):
            objs = self.objs(prefix)
            ref = objs[0]
            lo, hi = Vector([min(v.co[i] for v in ref.data.vertices) for i in range(3)]), Vector([max(v.co[i] for v in ref.data.vertices) for i in range(3)])
            mb = MB((0, 0, 0))
            mb.box((lo.x, lo.y, 0.0), (hi.x, hi.y, 0.008), mat)
            self.set_mesh(objs, mb, ref.data.name)

        # Decals: a painted ring under every spawn and damp puddles in the yard and margins (flat, no height).
        spawns = sorted((o for o in self.cols["PLAYER_SPAWNS"].objects if o.type == "EMPTY"), key=lambda o: o.name)
        mb = MB()
        segs = 16
        for k in range(segs):
            a0, a1 = 2 * math.pi * k / segs, 2 * math.pi * (k + 1) / segs
            ring = [(math.cos(a) * r, math.sin(a) * r, 0.006) for a, r in ((a0, 0.42), (a1, 0.42), (a1, 0.34), (a0, 0.34))]
            mb.poly(ring, "MAT_Paint_Line", flip=True)
        ring_mesh = mb.mesh("STG01_Decal_SpawnMark", self.mats)
        for s in spawns:
            idx = s.name[-2:]
            self.new_obj(f"STG01_Decal_SpawnMark_{idx}", None, "VISUAL_ARCHITECTURE", s.matrix_world.translation, mesh=ring_mesh)
        for i in range(28):
            inside = i < 18
            x = RNG.uniform(-26, 26) if inside else RNG.choice((-1, 1)) * RNG.uniform(31.5, 36.5)
            y = RNG.uniform(5, 155) if inside else RNG.uniform(-12, 165)
            if inside and abs(x) < 15 and y < 10:
                y += 12  # keep the spawn rows dry
            mb = MB((x, y, 0))
            r = RNG.uniform(1.2, 3.2)
            pts = []
            for k in range(10):
                a = 2 * math.pi * k / 10
                rr = r * RNG.uniform(0.6, 1.0)
                pts.append((x + math.cos(a) * rr * 1.4, y + math.sin(a) * rr, 0.004 if inside else -0.025))
            mb.poly(pts, "MAT_Puddle", flip=False)
            self.new_obj(f"STG01_Decal_Puddle_{i + 1:02d}", mb, "VISUAL_ARCHITECTURE", (x, y, 0))

    # ------------------------------------------------------------------ perimeter
    def fence(self, obj, axis: str) -> None:
        """Concrete plinth, hazard band, chain-link on posts every 4 m, rails and barbed strands,
        all inside the fence's own footprint (= the boundary wall)."""
        mn, mx = bbox(obj)
        mb = MB(obj.location)
        if axis == "y":  # runs along Y; thickness in X
            c = (mn.x + mx.x) / 2
            out = 1 if c > 0 else -1
            L0, L1 = mn.y, mx.y

            def P(a, along, z):  # a = offset across (outward +), along Y
                return Vector((c + out * a, along, z))
        else:
            c = (mn.y + mx.y) / 2
            out = 1 if c > 0 else -1
            L0, L1 = mn.x, mx.x

            def P(a, along, z):
                return Vector((along, c + out * a, z))
        half = (mx.x - mn.x if axis == "y" else mx.y - mn.y) / 2
        top = mx.z

        def slab(a0, a1, z0, z1, mat):
            p, q = P(a0, L0, z0), P(a1, L1, z1)
            mb.box((min(p.x, q.x), min(p.y, q.y), z0), (max(p.x, q.x), max(p.y, q.y), z1), mat)

        slab(-0.18, 0.18, 0.0, 0.45, CONC)
        slab(-0.185, 0.185, 0.45, 0.6, HAZ)
        n = int((L1 - L0) // 4)
        for k in range(n + 1):
            t = L0 + (L1 - L0) * k / n
            mb.boxc(P(0, t, 1.8), (0.08, 0.08, 2.4) if axis == "y" else (0.08, 0.08, 2.4), DARK)
            mb.beam(P(0, t, 2.72), P(0.2, t, top - 0.02), 0.04, 0.04, DARK)
        mb.beam(P(0, L0, 0.64), P(0, L1, 0.64), 0.05, 0.05, DARK)
        mb.beam(P(0, L0, 2.72), P(0, L1, 2.72), 0.06, 0.06, DARK)
        for a, z in ((0.07, 2.8), (0.13, 2.88), (0.19, top - 0.03)):
            if a <= half:
                mb.beam(P(a, L0, z), P(a, L1, z), 0.012, 0.012, DARK)
        mb.quad2([P(0, L0, 0.62), P(0, L1, 0.62), P(0, L1, 2.72), P(0, L0, 2.72)], LINK)
        self.set_mesh([obj], mb, obj.data.name)

    def perimeter(self) -> None:
        self.fence(self.O["PRP_STG01_Fence_W"], "y")
        self.fence(self.O["PRP_STG01_Fence_E"], "y")
        self.fence(self.O["PRP_STG01_Fence_S"], "x")
        self.fence(self.O["PRP_STG01_Fence_N"], "x")
        # Service gates (shared 4 m gate in the east fence line).
        gates = self.objs("PRP_KIT_ServiceGate_")
        lo = Vector([min(v.co[i] for v in gates[0].data.vertices) for i in range(3)])
        hi = Vector([max(v.co[i] for v in gates[0].data.vertices) for i in range(3)])
        mb = MB()
        x = (lo.x + hi.x) / 2
        y0, y1, h = lo.y + 0.05, hi.y - 0.05, hi.z - 0.05
        for yy in (y0, y1):
            mb.boxc((x, yy, h / 2 + 0.025), (0.1, 0.1, h + 0.05), GALV)
        for z in (0.1, h / 2, h):
            mb.beam((x, y0, z), (x, y1, z), 0.06, 0.06, GALV)
        mb.beam((x, y0, 0.1), (x, y1, h), 0.05, 0.05, GALV)
        mb.quad2([(x, y0, 0.1), (x, y1, 0.1), (x, y1, h), (x, y0, h)], LINK)
        mb.boxc((x - 0.06, (y0 + y1) / 2, 1.5), (0.02, 0.8, 0.5), HAZ)
        self.set_mesh(gates, mb, "PRP_KIT_ServiceGate_4m")
        # Outer barrier: 3 m jersey blocks, rusty mesh above (no collision needed: unreachable).
        prof = [(-0.4, 0.0), (0.4, 0.0), (0.4, 0.08), (0.18, 0.33), (0.13, 1.2), (-0.13, 1.2), (-0.18, 0.33), (-0.4, 0.08)]
        for side in "WENS":
            o = self.O[f"PRP_KIT_ConcreteBarrier_{side}"]
            mn, mx = bbox(o)
            mb = MB(o.location)
            mesh_top = MB()
            along_y = side in "WE"
            L0, L1 = (mn.y, mx.y) if along_y else (mn.x, mx.x)
            c = (mn.x + mx.x) / 2 if along_y else (mn.y + mx.y) / 2
            n = int((L1 - L0) // 3)
            for k in range(n):
                a, b = L0 + (L1 - L0) * k / n + 0.03, L0 + (L1 - L0) * (k + 1) / n - 0.03
                p0 = Vector((c, a, 0)) if along_y else Vector((a, c, 0))
                p1 = Vector((c, b, 0)) if along_y else Vector((b, c, 0))
                if k % 5 == 2:  # every fifth block wears a hazard band on its top
                    mb.prism_profile(prof[:4] + [(0.1371, 0.95), (-0.1371, 0.95)] + prof[6:], p0, p1, CONC, up=(0, 0, 1))
                    mb.prism_profile([(-0.1371, 0.95), (0.1371, 0.95), (0.13, 1.2), (-0.13, 1.2)], p0, p1, HAZ, up=(0, 0, 1))
                else:
                    mb.prism_profile(prof, p0, p1, CONC, up=(0, 0, 1))
            m = int((L1 - L0) // 6)
            for k in range(m + 1):
                t = L0 + (L1 - L0) * k / m
                p = Vector((c, t, 0)) if along_y else Vector((t, c, 0))
                mesh_top.cyl(p + Vector((0, 0, 1.0)), p + Vector((0, 0, 3.2)), 0.04, DARK, seg=6)
            a, b = (Vector((c, L0, 0)), Vector((c, L1, 0))) if along_y else (Vector((L0, c, 0)), Vector((L1, c, 0)))
            mesh_top.quad2([a + Vector((0, 0, 1.2)), b + Vector((0, 0, 1.2)), b + Vector((0, 0, 3.1)), a + Vector((0, 0, 3.1))], LINK)
            mesh_top.beam(a + Vector((0, 0, 3.1)), b + Vector((0, 0, 3.1)), 0.05, 0.05, DARK)
            self.set_mesh([o], mb, o.data.name)
            self.new_obj(f"PRP_KIT_BarrierMesh_{side}", mesh_top, "VISUAL_PROPS")

    # ------------------------------------------------------------------ towers and signal devices
    def towers(self) -> None:
        masts = self.objs("PRP_KIT_FloodlightTower_")
        masts = [m for m in masts if "_Head_" not in m.name]
        h = 22.0
        mb = MB()
        a = 0.42
        mb.box((-0.5, -0.5, 0), (0.5, 0.5, 0.3), CONC)
        corners = [(-a, -a), (a, -a), (a, a), (-a, a)]
        for x, y in corners:
            mb.cyl((x, y, 0.3), (x, y, h), 0.055, DARK, seg=6)
        z = 0.3
        k = 0
        while z < h - 0.5:
            z1 = min(z + 2.0, h - 0.05)
            for i in range(4):
                (x0, y0), (x1, y1) = corners[i], corners[(i + 1) % 4]
                mb.beam((x0, y0, z1), (x1, y1, z1), 0.04, 0.04, DARK)
                if (i + k) % 2:
                    mb.beam((x0, y0, z), (x1, y1, z1), 0.03, 0.03, DARK)
                else:
                    mb.beam((x1, y1, z), (x0, y0, z1), 0.03, 0.03, DARK)
            z, k = z1, k + 1
        mb.cyl((a - 0.08, 0.0, 0.3), (a - 0.08, 0.0, h - 0.2), 0.035, "MAT_Cable", seg=5)  # power conduit
        mb.boxc((0.0, -a + 0.05, 1.3), (0.4, 0.1, 0.55), GALV)  # junction box
        self.set_mesh(masts, mb, "PRP_KIT_FloodlightTower_Mast")

        heads = self.objs("PRP_KIT_FloodlightTower_Head_")
        for side, sgn in (("W", 1), ("E", -1)):
            mb = MB()
            mast_x = -0.8 * sgn
            mb.box((-2.0, -0.4, 0.0), (2.0, 0.4, 0.07), DARK)  # service grating
            mb.beam((-2.0, 0.38, 0.07), (2.0, 0.38, 0.07), 0.03, 0.03, DARK)
            for x in (-2.0, 2.0):
                mb.beam((x, 0.38, 0.07), (x, 0.38, 1.0), 0.03, 0.03, DARK)
            mb.beam((-2.0, 0.38, 1.0), (2.0, 0.38, 1.0), 0.04, 0.04, DARK)
            mb.beam((mast_x, 0, 0.07), (mast_x, 0, 1.55), 0.12, 0.12, DARK)
            mb.beam((-1.8, 0, 1.45), (1.8, 0, 1.45), 0.1, 0.1, DARK)
            tilt = math.radians(55)
            d = Vector((sgn * math.cos(tilt), 0, -math.sin(tilt)))  # aims inward and down 55° (spec)
            for row, zc in enumerate((1.05, 0.55)):
                for i, xc in enumerate((-1.3, 0.0, 1.3)):
                    c = Vector((xc + sgn * 0.15 * row, 0.0, zc))
                    back, front = c - d * 0.22, c + d * 0.18
                    mb.beam(back, front, 0.55, 0.4, DARK, up=(0, 1, 0))
                    mb.beam(front, front + d * 0.03, 0.48, 0.34, WARM, up=(0, 1, 0))
            self.set_mesh([o for o in heads if (o.location.x < 0) == (side == "W")], mb, f"PRP_KIT_FloodlightTower_Head_{side}")

        lamps = self.objs("PRP_KIT_SignalLamp_")
        for side, sgn in (("W", 1), ("E", -1)):
            mb = MB()
            fx = 0.12 * sgn
            mb.boxc((fx, 0, 0.4), (0.42, 0.46, 0.8), DARK)
            face = fx + sgn * 0.21
            for zc, mat in ((0.64, "MAT_Signal_Red"), (0.4, "MAT_Signal_Amber"), (0.16, "MAT_Signal_Green")):
                mb.cyl((face, 0, zc), (face + sgn * 0.02, 0, zc), 0.095, mat, seg=10, smooth=False)
                mb.beam((face, 0, zc + 0.11), (face + sgn * 0.14, 0, zc + 0.11), 0.24, 0.015, DARK, up=(0, 0, 1))
            self.set_mesh([o for o in lamps if (o.location.x < 0) == (side == "W")], mb, f"PRP_KIT_SignalLamp_{side}")

        spk = self.objs("PRP_KIT_Loudspeaker_")
        for side, sgn in (("W", 1), ("E", -1)):
            mb = MB()
            mast_x = -0.8 * sgn
            d = Vector((sgn * math.cos(math.radians(20)), 0, -math.sin(math.radians(20))))
            throat = Vector((0, 0, 0.5)) - d * 0.3
            mb.cyl(throat - d * 0.15, throat, 0.12, DARK, seg=8)
            mb.cyl(throat, throat + d * 0.6, 0.06, GALV, seg=10, r1=0.42, caps=False)
            mb.beam((mast_x + sgn * 0.42, 0, 0.5), throat - d * 0.1, 0.05, 0.05, DARK)
            self.set_mesh([o for o in spk if (o.location.x < 0) == (side == "W")], mb, f"PRP_KIT_Loudspeaker_{side}")

    # ------------------------------------------------------------------ observation structures
    def benches(self) -> None:
        benches = self.objs("PRP_KIT_Bench_")
        lo = Vector([min(v.co[i] for v in benches[0].data.vertices) for i in range(3)])
        hi = Vector([max(v.co[i] for v in benches[0].data.vertices) for i in range(3)])
        mb = MB()
        w = hi.x - lo.x
        for y in (lo.y + 0.3, 0.0, hi.y - 0.3):
            for x in (lo.x + 0.06, hi.x - 0.06):
                mb.boxc((x, y, 0.2), (0.05, 0.05, 0.4), DARK)
            mb.box((lo.x + 0.02, y - 0.03, 0.34), (hi.x - 0.02, y + 0.03, 0.4), DARK)
        for i in range(4):
            x0 = lo.x + 0.02 + i * (w - 0.04) / 4
            mb.box((x0 + 0.01, lo.y, hi.z - 0.05), (x0 + (w - 0.04) / 4 - 0.01, hi.y, hi.z), WOOD)
        self.set_mesh(benches, mb, "PRP_KIT_Bench_4m")

    def gantry(self) -> None:
        legs = self.objs("PRP_STG01_SpectatorGantry_Leg_")
        lo = Vector([min(v.co[i] for v in legs[0].data.vertices) for i in range(3)])
        hi = Vector([max(v.co[i] for v in legs[0].data.vertices) for i in range(3)])
        mb = MB()
        t = 0.03
        mb.box((lo.x, lo.y, lo.z), (hi.x, lo.y + t, hi.z), GALV)
        mb.box((lo.x, hi.y - t, lo.z), (hi.x, hi.y, hi.z), GALV)
        mb.box((-0.02, lo.y, lo.z), (0.02, hi.y, hi.z), GALV)
        mb.box((lo.x, lo.y, 0), (hi.x, hi.y, 0.02), DARK)
        self.set_mesh(legs, mb, "PRP_STG01_SpectatorGantry_Leg")

        deck = self.O["PRP_STG01_SpectatorGantry_Deck"]
        mn, mx = bbox(deck)
        mb = MB(deck.location)
        mb.box((mn.x, mn.y, mn.z), (mn.x + 0.2, mx.y, mx.z - 0.06), GALV)
        mb.box((mx.x - 0.2, mn.y, mn.z), (mx.x, mx.y, mx.z - 0.06), GALV)
        y = mn.y
        while y <= mx.y + 1e-6:
            mb.box((mn.x + 0.2, max(mn.y, y - 0.06), mn.z + 0.1), (mx.x - 0.2, min(mx.y, y + 0.06), mx.z - 0.06), GALV)
            y += 2.5
        mb.box((mn.x, mn.y, mx.z - 0.06), (mx.x, mx.y, mx.z), DARK)
        self.set_mesh([deck], mb, deck.data.name)

        rail = self.O["PRP_STG01_SpectatorGantry_Rail"]
        mn, mx = bbox(rail)
        mb = MB(rail.location)
        xc = (mn.x + mx.x) / 2
        y = mn.y
        while y <= mx.y + 1e-6:
            mb.box((xc - 0.025, max(mn.y, y - 0.025), mn.z), (xc + 0.025, min(mx.y, y + 0.025), mx.z - 0.06), GALV)
            y += 2.5
        mb.box((mn.x, mn.y, mx.z - 0.06), (mx.x, mx.y, mx.z), GALV)
        mb.box((xc - 0.02, mn.y, mn.z + 0.5), (xc + 0.02, mx.y, mn.z + 0.54), GALV)
        mb.box((mn.x, mn.y, mn.z), (mn.x + 0.02, mx.y, mn.z + 0.15), HAZ)
        self.set_mesh([rail], mb, rail.data.name)

        roof = self.O["PRP_STG01_SpectatorGantry_Roof"]
        mn, mx = bbox(roof)
        mb = MB(roof.location)
        x = mn.x
        while x <= mx.x + 1e-6:
            mb.box((max(mn.x, x - 0.05), mn.y, mn.z), (min(mx.x, x + 0.05), mx.y, mx.z - 0.06), DARK)
            x += 1.4
        prof = []
        n = 24
        for i in range(n + 1):  # corrugated sheet profile across X
            px = mn.x + (mx.x - mn.x) * i / n
            prof.append((px, mx.z - (0.0 if i % 2 else 0.05)))
        for (x0, z0), (x1, z1) in zip(prof, prof[1:]):
            mb.poly([(x0, mn.y, z0), (x1, mn.y, z1), (x1, mx.y, z1), (x0, mx.y, z0)], RUST, flip=True)
        self.set_mesh([roof], mb, roof.data.name)

        # Under-roof warm strips, stairs at the south end and back bracing (decorative, outside the yard).
        lights = MB()
        for yy in range(int(mn.y) + 5, int(mx.y), 10):
            lights.boxc(((mn.x + mx.x) / 2, yy, mn.z - 0.04), (0.15, 1.6, 0.06), WARM)
        self.new_obj("PRP_STG01_GantryRoofLights", lights, "VISUAL_ARCHITECTURE")
        st = MB()
        x0, x1 = 44.2, 46.2
        y_top, z_top = deck.location.y - 50.0, 6.0
        steps = 16
        run = 6.0
        for s in range(steps):
            z = z_top * (s + 1) / steps
            yy = y_top - run + run * s / steps
            st.box((x0, yy, z - 0.05), (x1, yy + run / steps, z), GALV)
        for x in (x0, x1):
            st.beam((x, y_top - run, 0.0), (x, y_top, z_top), 0.06, 0.25, GALV)
            st.beam((x, y_top - run, 1.0), (x, y_top, z_top + 1.0), 0.04, 0.04, GALV)
        self.new_obj("PRP_STG01_GantryStairs", st, "VISUAL_ARCHITECTURE")
        br = MB()
        bx = 46.8
        for y0 in range(30, 130, 20):
            br.beam((bx, y0, 0.5), (bx, y0 + 10, 5.4), 0.05, 0.05, GALV)
            br.beam((bx, y0 + 10, 0.5), (bx, y0, 5.4), 0.05, 0.05, GALV)
        self.new_obj("PRP_STG01_GantryBracing", br, "VISUAL_ARCHITECTURE")

    def booth(self) -> None:
        cab = self.O["PRP_STG01_JudgesBooth_Cabin"]
        mn, mx = bbox(cab)
        mb = MB(cab.location)
        mb.box((mn.x, mn.y, mn.z), (mx.x, mx.y, mn.z + 0.25), CONC)
        w = 0.2
        z0, zw0, zw1, z1 = mn.z + 0.25, mn.z + 1.15, mn.z + 3.0, mx.z - 0.2
        walls = [((mn.x, mn.y), (mn.x + w, mx.y)), ((mx.x - w, mn.y), (mx.x, mx.y)),
                 ((mn.x, mn.y), (mx.x, mn.y + w)), ((mn.x, mx.y - w), (mx.x, mx.y))]
        for i, ((ax, ay), (bx, by)) in enumerate(walls):
            mb.box((ax, ay, z0), (bx, by, zw0), GALV)
            mb.box((ax, ay, zw1), (bx, by, z1), GALV)
            if i in (0, 2, 3):  # windows face the yard, the start and the back
                mb.box((ax + 0.02, ay + 0.02, zw0), (bx - 0.02, by - 0.02, zw1), "MAT_Glass_Window_Warm")
            else:
                mb.box((ax, ay, zw0), (bx, by, zw1), GALV)
        mb.box((mn.x, mn.y, z1), (mx.x, mx.y, mx.z - 0.12), DARK)
        for (ax, ay), (bx, by) in walls:
            mb.box((ax, ay, mx.z - 0.12), (bx, by, mx.z), RUST)
        self.set_mesh([cab], mb, cab.data.name)

        legs = self.objs("PRP_STG01_JudgesBooth_Leg_")
        lo = Vector([min(v.co[i] for v in legs[0].data.vertices) for i in range(3)])
        hi = Vector([max(v.co[i] for v in legs[0].data.vertices) for i in range(3)])
        mb = MB()
        mb.box((lo.x, lo.y, lo.z), (hi.x, hi.y, lo.z + 0.4), CONC)
        mb.box((lo.x + 0.08, lo.y + 0.08, lo.z + 0.4), (hi.x - 0.08, hi.y - 0.08, hi.z), DARK)
        self.set_mesh(legs, mb, "PRP_STG01_JudgesBooth_Leg")

        tb = self.O["PRP_STG01_JudgesBooth_TimerBoard"]
        mn, mx = bbox(tb)
        mb = MB(tb.location)
        mb.box((mn.x + 0.1, mn.y, mn.z), (mx.x, mx.y, mx.z), DARK)
        mb.box((mn.x, mn.y + 0.2, mn.z + 0.2), (mn.x + 0.1, mx.y - 0.2, mx.z - 0.2), "MAT_TimerBoard_Screen")
        self.set_mesh([tb], mb, tb.data.name)

        st = MB()
        x0, x1 = 47.2, 48.6
        for flight, (ya, yb, za, zb) in enumerate(((164.5, 168.0, 0.0, 4.5), (168.0, 171.5, 4.5, 9.0))):
            n = 12
            for s in range(n):
                z = za + (zb - za) * (s + 1) / n
                y = ya + (yb - ya) * s / n if flight == 0 else ya + (yb - ya) * s / n
                st.box((x0, y, z - 0.05), (x1, y + (yb - ya) / n, z), GALV)
            for x in (x0, x1):
                st.beam((x, ya, za), (x, yb, zb), 0.06, 0.25, GALV)
        st.box((x0, 167.6, 4.4), (x1, 168.4, 4.5), GALV)
        for y in (164.5, 168.0, 171.5):
            st.boxc((x1 - 0.05, y, 4.5), (0.12, 0.12, 9.0), GALV)
        self.new_obj("PRP_STG01_BoothStairs", st, "VISUAL_ARCHITECTURE")

    # ------------------------------------------------------------------ finish, start and Shepherd plinth
    def finish(self) -> None:
        posts = self.objs("PRP_STG01_FinishGate_Post_")
        lo = Vector([min(v.co[i] for v in posts[0].data.vertices) for i in range(3)])
        hi = Vector([max(v.co[i] for v in posts[0].data.vertices) for i in range(3)])
        mb = MB()
        a = (hi.x - lo.x) / 2 - 0.1
        mb.box((lo.x, lo.y, 0), (hi.x, hi.y, 0.12), DARK)
        corners = [(-a, -a), (a, -a), (a, a), (-a, a)]
        for x, y in corners:
            mb.cyl((x, y, 0.12), (x, y, hi.z), 0.06, GALV, seg=6)
        z = 0.12
        k = 0
        while z < hi.z - 0.3:
            z1 = min(z + 1.0, hi.z - 0.05)
            for i in range(4):
                (x0, y0), (x1, y1) = corners[i], corners[(i + 1) % 4]
                mb.beam((x0, y0, z1), (x1, y1, z1), 0.035, 0.035, GALV)
                p, q = ((x0, y0, z), (x1, y1, z1)) if (i + k) % 2 else ((x1, y1, z), (x0, y0, z1))
                mb.beam(p, q, 0.03, 0.03, GALV)
            z, k = z1, k + 1
        mb.boxc((0, lo.y + 0.02, 4.0), (0.6, 0.03, 4.0), "MAT_Checker_Finish")
        self.set_mesh(posts, mb, "PRP_STG01_FinishGate_Post")

        beam = self.O["PRP_STG01_FinishGate_Beam"]
        mn, mx = bbox(beam)
        mb = MB(beam.location)
        ys, zs = (mn.y + 0.1, mx.y - 0.1), (mn.z + 0.1, mx.z - 0.1)
        for y in ys:
            for z in zs:
                mb.cyl((mn.x, y, z), (mx.x, y, z), 0.06, GALV, seg=6)
        n = int((mx.x - mn.x) // 1.5)
        for k in range(n + 1):
            x = min(max(mn.x + (mx.x - mn.x) * k / n, mn.x + 0.06), mx.x - 0.06)
            for y in ys:
                mb.beam((x, y, zs[0]), (x, y, zs[1]), 0.03, 0.03, GALV)
            for z in zs:
                mb.beam((x, ys[0], z), (x, ys[1], z), 0.03, 0.03, GALV)
            if k < n:
                x1 = min(max(mn.x + (mx.x - mn.x) * (k + 1) / n, mn.x + 0.06), mx.x - 0.06)
                for y in ys:
                    mb.beam((x, y, zs[k % 2]), (x1, y, zs[1 - k % 2]), 0.025, 0.025, GALV)
        mb.box((mn.x + 1.2, mn.y + 0.005, mn.z + 0.25), (mx.x - 1.2, mn.y + 0.02, mx.z - 0.25), "MAT_Checker_Finish")
        mb.box((mn.x + 1.2, mx.y - 0.02, mn.z + 0.25), (mx.x - 1.2, mx.y - 0.005, mx.z - 0.25), "MAT_Checker_Finish")
        self.set_mesh([beam], mb, beam.data.name)

        strip = self.O["PRP_STG01_FinishGate_LightStrip"]
        mn, mx = bbox(strip)
        mb = MB(strip.location)
        n = 32
        for k in range(n):
            x0 = mn.x + (mx.x - mn.x) * k / n + 0.15
            x1 = mn.x + (mx.x - mn.x) * (k + 1) / n - 0.15
            mb.box((x0, mn.y + 0.03, mn.z + 0.08), (x1, mx.y, mx.z), DARK)
            mb.box((x0 + 0.05, mn.y, mn.z + 0.1), (x1 - 0.05, mn.y + 0.03, mx.z - 0.03), WARM)
            mb.box((x0 + 0.05, mn.y + 0.05, mn.z), (x1 - 0.05, mx.y - 0.05, mn.z + 0.08), WARM)
        self.set_mesh([strip], mb, strip.data.name)

    def start_barrier(self) -> None:
        posts = self.objs("PRP_STG01_StartBarrier_Post_")
        lo = Vector([min(v.co[i] for v in posts[0].data.vertices) for i in range(3)])
        hi = Vector([max(v.co[i] for v in posts[0].data.vertices) for i in range(3)])
        mb = MB()
        mb.box((lo.x, lo.y, 0), (hi.x, hi.y, 1.0), DARK)
        mb.box((lo.x - 0.0, lo.y, 1.0), (hi.x, hi.y, 1.25), HAZ)
        mb.box((-0.11, -0.11, 1.25), (0.11, 0.11, hi.z - 0.45), GALV)
        mb.box((lo.x, lo.y, hi.z - 0.45), (hi.x, hi.y, hi.z), DARK)
        mb.cyl((0, lo.y, hi.z - 0.2), (0, lo.y - 0.0, hi.z - 0.2), 0.1, GALV, seg=8)
        self.set_mesh(posts, mb, "PRP_STG01_StartBarrier_Post")
        arm = self.O["PRP_STG01_StartBarrier_Arm"]
        mn, mx = bbox(arm)
        mb = MB(arm.location)
        mb.box(mn, mx, "MAT_Stripes_Barrier")
        self.set_mesh([arm], mb, arm.data.name)

    def platform(self) -> None:
        p = self.O["PRP_STG01_ShepherdPlatform"]
        mn, mx = bbox(p)
        mb = MB(p.location)
        mb.box((mn.x + 0.3, mn.y + 0.3, mn.z), (mx.x - 0.3, mx.y - 0.3, 3.55), CONC)
        mb.box((mn.x, mn.y, mn.z), (mx.x, mx.y, 0.5), CONC)
        mb.box((mn.x, mn.y, 3.55), (mx.x, mx.y, 3.75), RUST)
        mb.box((mn.x + 0.15, mn.y + 0.15, 3.75), (mx.x - 0.15, mx.y - 0.15, mx.z), CONC)
        for x in (mn.x + 0.35, mx.x - 0.35):  # buttresses
            for y in (mn.y + 0.35, mx.y - 0.35):
                mb.boxc((x, y, 1.8), (0.7, 0.7, 3.4), CONC)
        cx = (mn.x + mx.x) / 2
        for x in (cx - 0.25, cx + 0.25):  # service ladder on the back face
            mb.box((x - 0.03, mx.y - 0.12, 0.5), (x + 0.03, mx.y - 0.06, mx.z), DARK)
        for z in [0.8 + 0.3 * i for i in range(11)]:
            mb.box((cx - 0.25, mx.y - 0.1, z), (cx + 0.25, mx.y - 0.08, z + 0.03), DARK)
        mb.box((mn.x + 1.0, mn.y + 1.0, mx.z - 0.001), (mn.x + 1.25, mx.y - 1.0, mx.z), "MAT_Cable")  # taped cable runs
        mb.box((mx.x - 1.25, mn.y + 1.0, mx.z - 0.001), (mx.x - 1.0, mx.y - 1.0, mx.z), "MAT_Cable")
        for x in (mn.x + 0.6, mx.x - 0.6):  # warm uplights at the front corners
            mb.boxc((x, mn.y + 0.6, 3.87), (0.4, 0.3, 0.2), DARK)
            mb.boxc((x, mn.y + 0.6, 3.975), (0.32, 0.22, 0.02), WARM)
        self.set_mesh([p], mb, p.data.name)

    # ------------------------------------------------------------------ playground relics (west margin)
    def relics(self) -> None:
        o = self.O["PRP_STG01_SwingSet_A"]
        mn, mx = bbox(o)
        mb = MB(o.location)
        yc = (mn.y + mx.y) / 2
        top = mx.z - 0.08
        for x in (mn.x + 0.3, mx.x - 0.3):
            for y in (mn.y + 0.08, mx.y - 0.08):
                mb.cyl((x, y, 0), (x, yc, top), 0.06, RUST, seg=6)
        mb.cyl((mn.x + 0.1, yc, top), (mx.x - 0.1, yc, top), 0.07, RUST, seg=8)
        for i, xs in enumerate((mn.x + 1.5, (mn.x + mx.x) / 2, mx.x - 1.5)):
            broken = i == 2
            for dx in (-0.25, 0.25):
                if broken and dx > 0:
                    mb.beam((xs + dx, yc, top), (xs + dx + 0.05, yc + 0.25, top - 1.4), 0.015, 0.015, DARK)
                    continue
                zb = 0.55 if not broken else 0.35
                mb.beam((xs + dx, yc, top), (xs + dx, yc, zb), 0.015, 0.015, DARK)
            if broken:
                mb.beam((xs - 0.27, yc, 0.36), (xs + 0.2, yc, 0.08), 0.18, 0.04, WOOD)
            else:
                mb.box((xs - 0.27, yc - 0.1, 0.5), (xs + 0.27, yc + 0.1, 0.55), WOOD)
        self.set_mesh([o], mb, o.data.name)

        o = self.O["PRP_STG01_Slide_A"]
        mn, mx = bbox(o)
        mb = MB(o.location)
        xc = (mn.x + mx.x) / 2
        py0, py1, pz = mn.y + 1.0, mn.y + 2.4, 2.4
        for x in (mn.x + 0.4, mx.x - 0.4):
            for y in (py0, py1):
                mb.cyl((x, y, 0), (x, y, 3.5), 0.05, RUST, seg=6)
            mb.beam((x, mn.y + 0.05, 0), (x, py0, pz), 0.05, 0.05, RUST)
            mb.beam((x, py0, pz + 0.9), (x, py1, pz + 0.9), 0.04, 0.04, RUST)
        for i in range(7):
            t = (i + 1) / 8
            mb.beam((mn.x + 0.4, mn.y + 0.05 + (py0 - mn.y - 0.05) * t, pz * t), (mx.x - 0.4, mn.y + 0.05 + (py0 - mn.y - 0.05) * t, pz * t), 0.03, 0.03, DARK)
        mb.box((mn.x + 0.35, py0, pz - 0.06), (mx.x - 0.35, py1, pz), DARK)
        # canopy (pyramid roof) and chute
        apex = Vector((xc, (py0 + py1) / 2, mx.z))
        rc = [(mn.x + 0.25, py0 - 0.15, 3.5), (mx.x - 0.25, py0 - 0.15, 3.5), (mx.x - 0.25, py1 + 0.15, 3.5), (mn.x + 0.25, py1 + 0.15, 3.5)]
        for i in range(4):
            mb.poly([rc[i], rc[(i + 1) % 4], apex], RUST)
        cw = 0.7
        a0, a1 = Vector((xc, py1, pz)), Vector((xc, mx.y - 0.3, 0.45))
        mb.beam(a0, a1, cw, 0.05, GALV)
        for s in (-1, 1):
            mb.beam(a0 + Vector((s * cw / 2, 0, 0.12)), a1 + Vector((s * cw / 2, 0, 0.12)), 0.04, 0.25, GALV)
        mb.box((xc - cw / 2, mx.y - 0.3, 0.3), (xc + cw / 2, mx.y, 0.45), GALV)
        mb.cyl((xc, mx.y - 1.6, 0), (xc, mx.y - 1.6, 0.9), 0.05, RUST, seg=6)
        self.set_mesh([o], mb, o.data.name)

        o = self.O["PRP_STG01_RoundaboutSpinner_A"]
        mn, mx = bbox(o)
        mb = MB(o.location)
        c = (mn + mx) / 2
        r = (mx.x - mn.x) / 2
        mb.cyl((c.x, c.y, 0.0), (c.x, c.y, 0.18), 0.4, DARK, seg=8)
        mb.cyl((c.x, c.y, 0.18), (c.x, c.y, 0.28), r - 0.02, RUST, seg=16, smooth=False)
        mb.cyl((c.x, c.y, 0.28), (c.x, c.y, mx.z - 0.25), 0.08, RUST, seg=8)
        for k in range(6):
            a = 2 * math.pi * k / 6
            rim = Vector((c.x + math.cos(a) * (r - 0.25), c.y + math.sin(a) * (r - 0.25), 0.28))
            up = rim + Vector((0, 0, mx.z - 0.28 - 0.05))
            hub = Vector((c.x + math.cos(a) * 0.15, c.y + math.sin(a) * 0.15, mx.z - 0.3))
            mb.cyl(rim, up, 0.03, RUST, seg=6)
            mb.cyl(up, hub, 0.03, RUST, seg=6)
        self.set_mesh([o], mb, o.data.name)

        o = self.O["PRP_STG01_RocketFrame_A"]
        mn, mx = bbox(o)
        mb = MB(o.location)
        c = (mn + mx) / 2
        R, n = 2.4, 12
        body_top = 11.0
        ring = [Vector((c.x + math.cos(2 * math.pi * k / n) * R, c.y + math.sin(2 * math.pi * k / n) * R, 0)) for k in range(n)]
        for p in ring:
            mb.cyl(p + Vector((0, 0, 0.3)), p + Vector((0, 0, body_top)), 0.06, RUST, seg=6)
            mb.cyl(p + Vector((0, 0, body_top)), Vector((c.x, c.y, mx.z - 0.6)), 0.05, RUST, seg=6)
        for z in (0.3, 2.0, 4.0, 6.0, 8.0, 10.0, body_top):
            for k in range(n):
                mb.cyl(ring[k] + Vector((0, 0, z)), ring[(k + 1) % n] + Vector((0, 0, z)), 0.05 if z in (0.3, body_top) else 0.035, RUST if z in (0.3, 6.0, body_top) else DARK, seg=5)
        for z, rr in ((12.5, R * 0.75), (14.0, R * 0.4)):
            pts = [Vector((c.x + math.cos(2 * math.pi * k / n) * rr, c.y + math.sin(2 * math.pi * k / n) * rr, z)) for k in range(n)]
            for k in range(n):
                mb.cyl(pts[k], pts[(k + 1) % n], 0.035, DARK, seg=5)
        mb.cyl((c.x, c.y, mx.z - 0.6), (c.x, c.y, mx.z), 0.06, RUST, seg=6, r1=0.0)
        for k in range(4):  # fins
            a = 2 * math.pi * (k + 0.5) / 4
            d = Vector((math.cos(a), math.sin(a), 0))
            base = Vector((c.x, c.y, 0)) + d * R
            tip = Vector((c.x, c.y, 0)) + d * (min(mx.x - c.x, mx.y - c.y) - 0.05)
            mb.cyl(base + Vector((0, 0, 3.2)), tip + Vector((0, 0, 0.05)), 0.05, RUST, seg=5)
            mb.cyl(tip + Vector((0, 0, 0.05)), base + Vector((0, 0, 0.3)), 0.05, RUST, seg=5)
        pts = [Vector((c.x + math.cos(2 * math.pi * k / 8) * (R - 0.1), c.y + math.sin(2 * math.pi * k / 8) * (R - 0.1), 6.0)) for k in range(8)]
        mb.poly(pts, DARK)
        mb.poly([p + Vector((0, 0, -0.06)) for p in reversed(pts)], DARK)
        for i in range(19):  # inside ladder
            z = 0.3 + i * 0.3
            mb.beam((c.x - 0.25, c.y - R + 0.4, z), (c.x + 0.25, c.y - R + 0.4, z), 0.03, 0.03, DARK)
        self.set_mesh([o], mb, o.data.name)

        o = self.O["PRP_STG01_SeeSaw_A"]
        mn, mx = bbox(o)
        mb = MB(o.location)
        c = (mn + mx) / 2
        for dy in (-0.3, 0.3):
            mb.beam((c.x - 0.35, c.y + dy, 0), (c.x, c.y + dy * 0.5, 0.65), 0.06, 0.06, RUST)
            mb.beam((c.x + 0.35, c.y + dy, 0), (c.x, c.y + dy * 0.5, 0.65), 0.06, 0.06, RUST)
        a0 = Vector((mn.x + 0.1, c.y, 0.22))
        a1 = Vector((mx.x - 0.1, c.y, 1.08))
        mb.beam(a0, a1, 0.3, 0.06, WOOD, up=(0, 0, 1))
        for p in (a0, a1):
            q = a0.lerp(a1, 0.08) if p is a0 else a0.lerp(a1, 0.92)
            mb.cyl(q, q + Vector((0, 0, 0.38)), 0.025, RUST, seg=6)
            mb.cyl(q + Vector((0, -0.15, 0.38)), q + Vector((0, 0.15, 0.38)), 0.025, RUST, seg=6)
        self.set_mesh([o], mb, o.data.name)

    # ------------------------------------------------------------------ machinery and cables
    def machinery(self) -> None:
        gen = MB()
        gen.box((-0.6, -1.2, 0), (0.6, 1.2, 0.15), HAZ)
        gen.box((-0.55, -1.1, 0.15), (0.55, 1.1, 1.25), GALV)
        gen.box((-0.56, 0.5, 0.3), (0.56, 1.0, 1.1), DARK)  # radiator grille
        gen.box((-0.3, -0.9, 1.25), (0.3, -0.3, 1.45), DARK)
        gen.cyl((0.25, 0.7, 1.25), (0.25, 0.7, 2.1), 0.07, DARK, seg=8)
        gen.boxc((0.0, -1.12, 0.9), (0.4, 0.04, 0.3), DARK)
        gen.boxc((0.1, -1.145, 0.95), (0.06, 0.01, 0.04), "MAT_Light_Warm")
        gen_mesh = gen.mesh("PRP_KIT_Generator", self.mats)
        spots = [(-34.5, 55.0), (-34.5, 125.0), (35.9, 15.0), (-34.5, 178.0)]
        for i, (x, y) in enumerate(spots):
            self.new_obj(f"PRP_KIT_Generator_{i + 1:02d}", None, "VISUAL_MACHINERY", (x, y, 0), mesh=gen_mesh)
        # Ground cables from each generator to the nearest tower base.
        towers = [m for m in self.objs("PRP_KIT_FloodlightTower_") if "_Head_" not in m.name]
        for i, (x, y) in enumerate(spots):
            t = min(towers, key=lambda m: (m.location.x - x) ** 2 + (m.location.y - y) ** 2).location
            mb = MB((x, y, 0))
            a, b = Vector((x, y, 0.04)), Vector((t.x, t.y, 0.04))
            pts = [a.lerp(b, k / 8) + Vector((math.sin(k * 1.7) * 0.4, math.cos(k * 1.3) * 0.4, 0)) * (0 < k < 8) for k in range(9)]
            mb.polyline_tube(pts, 0.035, "MAT_Cable")
            self.new_obj(f"PRP_STG01_Cable_Ground_{i + 1:02d}", mb, "VISUAL_MACHINERY", (x, y, 0))
        # Overhead power cables between neighbouring towers on each side (outside the yard).
        for side in (-1, 1):
            ts = sorted((m for m in towers if (m.location.x > 0) == (side > 0)), key=lambda m: m.location.y)
            for k, (t0, t1) in enumerate(zip(ts, ts[1:])):
                mb = MB(t0.location)
                for dz, sag in ((18.0, 1.6), (17.4, 1.9)):
                    mb.catenary(t0.location + Vector((0, 0.45, dz)), t1.location + Vector((0, -0.45, dz)), sag, 0.025, "MAT_Cable", segs=18)
                self.new_obj(f"PRP_STG01_Cable_Overhead_{'W' if side < 0 else 'E'}_{k + 1:02d}", mb, "VISUAL_MACHINERY", t0.location)
        # Transformer behind The Shepherd's plinth with cables onto the platform.
        tr = MB((10.0, 188.0, 0))
        tr.box((8.9, 186.9, 0), (11.1, 189.1, 0.3), CONC)
        tr.box((9.3, 187.3, 0.3), (10.7, 188.7, 2.2), DARK)
        for k in range(6):
            tr.box((9.15, 187.4 + k * 0.24, 0.5), (9.3, 187.5 + k * 0.24, 2.0), DARK)
        for k in range(3):
            tr.cyl((9.6 + k * 0.4, 188.0, 2.2), (9.6 + k * 0.4, 188.0, 2.75), 0.07, "MAT_Concrete_Weathered", seg=8)
        tr.polyline_tube([(9.3, 188.0, 0.05), (7.5, 187.6, 0.05), (6.1, 187.0, 0.05), (6.05, 187.0, 3.9), (5.2, 187.0, 4.02)], 0.05, "MAT_Cable")
        tr.polyline_tube([(9.3, 188.4, 0.05), (7.4, 189.6, 0.05), (6.1, 189.5, 0.05), (6.05, 189.5, 3.9), (5.2, 189.5, 4.02)], 0.05, "MAT_Cable")
        self.new_obj("PRP_STG01_Transformer_01", tr, "VISUAL_MACHINERY", (10.0, 188.0, 0))

    # ------------------------------------------------------------------ backdrop
    def backdrop(self) -> None:
        deck = self.O["STG01_BG_Overpass_Deck"]
        mn, mx = bbox(deck)
        mb = MB(deck.location)
        mb.box((mn.x, mn.y, mx.z - 0.6), (mx.x, mx.y, mx.z), CONC)
        for x in (mn.x + 2.5, mx.x - 2.5):
            mb.box((x - 1.2, mn.y, mn.z), (x + 1.2, mx.y, mx.z - 0.6), CONC)
        mb.box((mn.x, mn.y, mx.z), (mn.x + 0.3, mx.y, mx.z + 1.1), CONC)
        self.set_mesh([deck], mb, deck.data.name)
        rail = self.O["STG01_BG_Overpass_Rail"]
        mn, mx = bbox(rail)
        mb = MB(rail.location)
        mb.box((mn.x, mn.y, mn.z), (mx.x, mx.y, mn.z + 0.8), CONC)
        mb.box((mn.x + 0.05, mn.y, mx.z - 0.1), (mx.x - 0.05, mx.y, mx.z), DARK)
        self.set_mesh([rail], mb, rail.data.name)
        piers = self.objs("STG01_BG_OverpassPier_")
        lo = Vector([min(v.co[i] for v in piers[0].data.vertices) for i in range(3)])
        hi = Vector([max(v.co[i] for v in piers[0].data.vertices) for i in range(3)])
        mb = MB()
        mb.box((lo.x + 0.15, lo.y + 0.15, 0), (hi.x - 0.15, hi.y - 0.15, hi.z - 1.0), CONC)
        mb.box((-5.5, lo.y, hi.z - 1.0), (5.5, hi.y, hi.z), CONC)
        self.set_mesh(piers, mb, "STG01_BG_OverpassPier")
        lamp = MB()
        lamp.cyl((0, 0, 0), (0, 0, 7.0), 0.1, DARK, seg=6)
        lamp.beam((0, 0, 7.0), (1.6, 0, 7.4), 0.08, 0.08, DARK)
        lamp.box((1.4, -0.2, 7.2), (2.1, 0.2, 7.4), DARK)
        lamp.box((1.45, -0.15, 7.17), (2.05, 0.15, 7.2), "MAT_Light_Sodium")
        lamp_mesh = lamp.mesh("STG01_BG_StreetLamp", self.mats)
        for i, y in enumerate(range(-40, 321, 40)):
            self.new_obj(f"STG01_BG_StreetLamp_{i + 1:02d}", None, "VISUAL_BACKDROP", (-72.6, y, 16.7), mesh=lamp_mesh)

        stem, tank = self.O["STG01_BG_WaterTower_Stem"], self.O["STG01_BG_WaterTower_Tank"]
        smn, smx = bbox(stem)
        tmn, tmx = bbox(tank)
        c = (smn + smx) / 2
        mb = MB(stem.location)
        top = smx.z
        legs = [(c.x + sx * 6.0, c.y + sy * 6.0) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        tops = [(c.x + sx * 4.5, c.y + sy * 4.5) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for (x0, y0), (x1, y1) in zip(legs, tops):
            mb.cyl((x0, y0, 0), (x1, y1, top), 0.35, DARK, seg=8)
        for z in (7.5, 15.0, 22.5):
            t = z / top
            pts = [Vector((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z)) for a, b in zip(legs, tops)]
            for k in range(4):
                mb.beam(pts[k], pts[(k + 1) % 4], 0.15, 0.15, DARK)
        for z0, z1 in ((0.5, 7.5), (7.5, 15.0), (15.0, 22.5), (22.5, top)):
            for k in range(4):
                a0 = Vector(legs[k]).lerp(Vector(tops[k]), z0 / top).to_3d()
                a0.z = z0
                b1 = Vector(legs[(k + 1) % 4]).lerp(Vector(tops[(k + 1) % 4]), z1 / top).to_3d()
                b1.z = z1
                mb.beam(a0, b1, 0.08, 0.08, DARK)
        mb.cyl((c.x, c.y, 0), (c.x, c.y, top), 0.7, RUST, seg=10)
        self.set_mesh([stem], mb, stem.data.name)
        mb = MB(tank.location)
        tc = (tmn + tmx) / 2
        r = (tmx.x - tmn.x) / 2 - 0.2
        mb.cyl((tc.x, tc.y, tmn.z + 0.4), (tc.x, tc.y, tmx.z - 2.2), r, RUST, seg=24)
        mb.cyl((tc.x, tc.y, tmx.z - 2.2), (tc.x, tc.y, tmx.z - 0.3), r + 0.2, RUST, seg=24, r1=0.6)
        mb.cyl((tc.x, tc.y, tmn.z), (tc.x, tc.y, tmn.z + 0.4), r + 0.2, DARK, seg=24)  # catwalk
        mb.cyl((tc.x, tc.y, tmx.z - 0.3), (tc.x, tc.y, tmx.z), 0.25, "MAT_Light_Aviation", seg=8)
        self.set_mesh([tank], mb, tank.data.name)

        for o in self.objs("STG01_BG_Silhouette_"):
            mn, mx = bbox(o)
            rng = random.Random(o.name)
            mb = MB(o.location)
            w, d, h = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
            mb.box((mn.x, mn.y, 0), (mn.x + w * 0.62, mx.y, h * 0.45), "MAT_Silhouette")
            mb.box((mn.x + w * 0.55, mn.y + d * 0.2, 0), (mx.x, mx.y - d * 0.1, h * 0.3), "MAT_Silhouette")
            for k in range(2):
                x = mn.x + w * (0.2 + 0.25 * k)
                mb.cyl((x, (mn.y + mx.y) / 2, h * 0.45), (x, (mn.y + mx.y) / 2, h * rng.uniform(0.8, 1.0)), 1.1, "MAT_Silhouette", seg=8, r1=0.8)
            for k in range(rng.randint(3, 6)):  # a few lit windows facing the yard
                x = mn.x + w * rng.uniform(0.05, 0.55)
                z = h * rng.uniform(0.1, 0.38)
                mb.box((x, mn.y - 0.05, z), (x + 1.4, mn.y, z + 0.9), "MAT_Glass_Window_Warm")
            self.set_mesh([o], mb, o.data.name)

        trees = self.objs("STG01_BG_Tree_")
        lo = Vector([min(v.co[i] for v in trees[0].data.vertices) for i in range(3)])
        hi = Vector([max(v.co[i] for v in trees[0].data.vertices) for i in range(3)])
        mb = MB()
        R, H = (hi.x - lo.x) / 2, hi.z
        mb.cyl((0, 0, 0), (0, 0, H * 0.25), R * 0.08, WOOD, seg=5)
        for i, (z0, z1, rr) in enumerate(((0.18, 0.55, 1.0), (0.4, 0.78, 0.75), (0.62, 1.0, 0.5))):
            mb.cyl((0, 0, H * z0), (0, 0, H * z1), R * rr, "MAT_Foliage", seg=7, r1=0.0)
        self.set_mesh(trees, mb, "STG01_BG_Tree")
        for o in trees:
            o.rotation_euler.z = RNG.uniform(0, math.tau)
        # Grass tufts outside the fence (no collision, never inside the yard).
        tuft = MB()
        for k in range(6):
            a = math.tau * k / 6
            b = Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0))
            tip = b * 3 + Vector((0, 0, 0.45 + 0.1 * (k % 2)))
            tuft.poly([b + Vector((-0.04 * math.sin(a), 0.04 * math.cos(a), 0)), b - Vector((-0.04 * math.sin(a), 0.04 * math.cos(a), 0)), tip], "MAT_Foliage")
        tuft_mesh = tuft.mesh("STG01_Foliage_Tuft", self.mats)
        n = 0
        for i in range(90):
            side = RNG.choice((-1, 1))
            x = side * RNG.uniform(30.9, 31.6) if i < 60 else RNG.uniform(-48, 48)
            y = RNG.uniform(-14, 171) if i < 60 else RNG.choice((RNG.uniform(-38, -18), RNG.uniform(176, 212)))
            n += 1
            o = self.new_obj(f"STG01_Foliage_Tuft_{n:03d}", None, "VISUAL_FOLIAGE", (x, y, 0), mesh=tuft_mesh)
            o.rotation_euler.z = RNG.uniform(0, math.tau)

    # ------------------------------------------------------------------ Shepherd placeholder finish
    def watcher(self) -> None:
        mats = {"ENM_Shepherd_Placeholder_Body": "MAT_Shepherd_Placeholder", "ENM_Shepherd_Placeholder_Head": "MAT_Shepherd_Placeholder",
                "ENM_Shepherd_Placeholder_Crook": "MAT_Steel_Dark", "ENM_Shepherd_Placeholder_Face": "MAT_Shepherd_Face",
                "ENM_Shepherd_Placeholder_Lantern": "MAT_Shepherd_Lantern"}
        for name, mat in mats.items():
            me = self.O[name].data
            me.materials.clear()
            me.materials.append(self.mats[mat])

    # ------------------------------------------------------------------ atmosphere and lighting
    def vfx(self) -> None:
        mb = MB()
        # Margins and backdrop only: no haze over the yard (start, finish and players stay clear).
        spots = [(-52, y, 20) for y in range(-30, 191, 20)] + [(32, y, 20) for y in range(-30, 191, 40)]
        spots += [(-110, y, 60) for y in (-40, 40, 120, 200)] + [(x, 222, 60) for x in (-90, -30, 30)]
        for x0, y0, s in spots:
            for z in (0.6, 1.8):
                mb.poly([(x0, y0, z), (x0 + s, y0, z), (x0 + s, y0 + s, z), (x0, y0 + s, z)], "MAT_VFX_Haze")
        me = mb.mesh("VFX_GroundHaze", self.mats)
        uv = me.uv_layers[0]
        for poly in me.polygons:
            for li, (u, v) in zip(poly.loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
                uv.data[li].uv = (u, v)
        self.new_obj("VFX_GroundHaze", None, "VISUAL_VFX", mesh=me, props={"vfx": "ground_haze", "quality_tier": "high"})
        # Dust motes for review renders only; the runtime spawns its own particles (STAGE_01_LIGHTING.json).
        dust = MB()
        for _ in range(500):
            x, y, z = RNG.uniform(-45, 45), RNG.uniform(-20, 190), RNG.uniform(1.0, 20.0)
            s = RNG.uniform(0.008, 0.02)
            dust.poly([(x - s, y, z), (x + s, y, z), (x, y, z + 2 * s)], "MAT_VFX_Dust")
        self.new_obj("VFX_DustMotes_Review", dust, "VISUAL_VFX", props={"review_only": True})

    def lighting(self) -> None:
        warm = (1.0, 0.52, 0.24)
        for l in [o for o in self.cols["LIGHTING"].objects if o.name.startswith("LGT_STG01_Flood_")]:
            sgn = 1 if l.location.x < 0 else -1
            d = Vector((sgn * math.cos(math.radians(55)), 0, -math.sin(math.radians(55))))
            l.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
            l.data.color = warm
            l.data.energy = 60000
            l.data.spot_size = math.radians(85)
            l.data.spot_blend = 0.7
            l.data.shadow_soft_size = 1.0
            l["runtime"] = "spot"
        moon = self.O["LGT_STG01_Moon"]
        moon.data.color = (0.45, 0.65, 0.75)
        moon.data.energy = 0.8
        moon.rotation_euler = (math.radians(62), 0, math.radians(-140))
        moon["runtime"] = "directional"

        def light(name, kind, loc, colour, energy, rot=None, size=None, props=None):
            ld = bpy.data.lights.new(name, kind)
            ld.color = colour
            ld.energy = energy
            if size and kind == "AREA":
                ld.size = size
            if kind == "SPOT":
                ld.spot_size = math.radians(40)
                ld.spot_blend = 0.5
            o = bpy.data.objects.new(name, ld)
            o.location = loc
            if rot is not None:
                o.rotation_euler = rot
            self.cols["LIGHTING"].objects.link(o)
            for k, v in (props or {}).items():
                o[k] = v
            return o

        rim_dir = (Vector((0, 182, 22)) - Vector((0, 215, 40))).normalized()
        light("LGT_STG01_ShepherdRim", "SPOT", (0, 215, 40), (0.45, 0.85, 0.9), 400000, rim_dir.to_track_quat("-Z", "Y").to_euler(), props={"runtime": "spot"})
        light("LGT_STG01_Finish", "AREA", (0, 162, 7.4), (1.0, 0.62, 0.35), 9000, (0, 0, 0), size=60, props={"runtime": "rect_area"})
        light("LGT_STG01_Booth", "POINT", (42, 163, 11), (1.0, 0.6, 0.3), 3000, props={"runtime": "point"})
        lan = self.O["ENM_Shepherd_Placeholder_Lantern"]
        lmn, lmx = bbox(lan)
        light("LGT_STG01_Lantern", "POINT", ((lmn + lmx) / 2 + Vector((0, -1.2, 0)))[:], (1.0, 0.7, 0.3), 6000, props={"runtime": "point", "follows": "ENM_Shepherd_Placeholder_Lantern"})

        w = self.scene.world or bpy.data.worlds.new("World")
        self.scene.world = w
        nt = w.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new("ShaderNodeOutputWorld")
        bg = nt.nodes.new("ShaderNodeBackground")
        grad = nt.nodes.new("ShaderNodeTexGradient")
        coord = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        nt.links.new(coord.outputs["Generated"], sep.inputs[0])
        nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
        ramp.color_ramp.elements[0].position = 0.5
        ramp.color_ramp.elements[0].color = (0.035, 0.11, 0.12, 1)  # teal horizon haze
        ramp.color_ramp.elements[1].position = 0.75
        ramp.color_ramp.elements[1].color = (0.06, 0.035, 0.10, 1)  # dusky violet overhead
        nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.45
        nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
        # Review-render fog: a bounded volume around the stage (an infinite world volume would hide the
        # sky). Blender-only, never exported; the runtime uses THREE.Fog from STAGE_01_LIGHTING.json.
        fog_mat = bpy.data.materials.get("MAT_VFX_FogVolume_Review") or bpy.data.materials.new("MAT_VFX_FogVolume_Review")
        fnt = fog_mat.node_tree
        for n in list(fnt.nodes):
            fnt.nodes.remove(n)
        fout = fnt.nodes.new("ShaderNodeOutputMaterial")
        vol = fnt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = (0.45, 0.72, 0.74, 1)
        vol.inputs["Density"].default_value = 0.003
        vol.inputs["Anisotropy"].default_value = 0.35
        fnt.links.new(vol.outputs["Volume"], fout.inputs["Volume"])
        mb = MB()
        mb.box((-150, -90, -1), (150, 300, 38), "MAT_Cable")
        fog = self.new_obj("VFX_FogVolume_Review", mb, "VISUAL_VFX", props={"review_only": True})
        fog.data.materials.clear()
        fog.data.materials.append(fog_mat)
        grad.location = (-900, 0)

    # ------------------------------------------------------------------ review cameras
    def cameras(self) -> None:
        def cam(name, loc, target=None, rot=None, ortho=None, res=(1600, 900), lens=28, review=None):
            cd = bpy.data.cameras.new(name)
            o = bpy.data.objects.new(name, cd)
            o.location = loc
            if target is not None:
                o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
            else:
                o.rotation_euler = rot
            if ortho:
                cd.type = "ORTHO"
                cd.ortho_scale = ortho
            cd.lens = lens
            cd.clip_end = 3000
            o["res"] = list(res)
            o["review_name"] = review
            o["env_review"] = True
            self.cols["CAMERAS"].objects.link(o)

        cam("CAM_STG01_Env_Wide", (-58.0, -52.0, 30.0), (0.0, 110.0, 6.0), lens=24, review="STAGE_01_ENV_WIDE")
        cam("CAM_STG01_Env_ThirdPerson", (-1.5, -12.5, 2.6), (-1.5, 185.0, 14.0), lens=30, review="STAGE_01_ENV_THIRD_PERSON")
        cam("CAM_STG01_Env_Front", (0.0, -40.0, 9.0), (0.0, 120.0, 9.0), lens=35, review="STAGE_01_ENV_FRONT")
        cam("CAM_STG01_Env_Side", (-250.0, 92.0, 16.0), rot=(math.radians(90), 0, math.radians(-90)), ortho=235.0, res=(2000, 560), review="STAGE_01_ENV_SIDE")
        cam("CAM_STG01_Env_Top", (0.0, 92.0, 300.0), rot=(0, 0, 0), ortho=240.0, res=(1200, 1600), review="STAGE_01_ENV_TOP")

    def cleanup(self) -> None:
        for m in list(bpy.data.materials):
            if m.users == 0:
                bpy.data.materials.remove(m)
        for me in list(bpy.data.meshes):
            if me.users == 0:
                bpy.data.meshes.remove(me)
        self.scene["environment_build"] = "stage_01_environment_build.py"

    def save(self) -> None:
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT), compress=True, relative_remap=True)
        print("Saved", OUT.relative_to(ROOT))


def main() -> None:
    e = Env()
    e.reorganise()
    e.ground()
    e.perimeter()
    e.towers()
    e.benches()
    e.gantry()
    e.booth()
    e.finish()
    e.start_barrier()
    e.platform()
    e.relics()
    e.machinery()
    e.backdrop()
    e.watcher()
    e.vfx()
    e.lighting()
    e.cameras()
    e.cleanup()
    e.save()


if __name__ == "__main__":
    main()
