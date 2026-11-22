"""Validate the shared contestant asset against the owner pack's acceptance rules (22 Nov 2026).

  python blender/scripts/validate_contestant.py [--report path.json]

Checks the committed .blend, GLBs, textures, manifest and the colourway data:
  one canonical mesh set (LOD0/1/2) and one armature; all LODs skinned to the same joints; 16 clips covering the
  required movement list; triangle budgets; shared UV layout (every UV inside its atlas group); the emblem is a
  separate part; regions present; exactly 30 colourways with unique ids; no per-colourway texture files;
  the runtime GLB carries COLOR_0, TEXCOORD_0, TANGENT, JOINTS_0/WEIGHTS_0. Exits 1 on any failure.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402

import cn_blender as cb  # noqa: E402
import contestant_geometry as G  # noqa: E402

ROOT = cb.REPO_ROOT
BLEND = ROOT / "blender/scenes/CNTRIAL_CONTESTANT_MASTER.blend"
EXP = ROOT / "blender/exports/contestant"
REQUIRED_CLIPS = {"Idle", "Walk", "Run", "Start", "Stop", "JumpStart", "JumpAir", "JumpLand", "Dive", "Push", "Pull",
                  "Stumble", "Fall", "Recover", "Eliminated", "Victory"}
BUDGET = {0: (12000, 24000), 1: (6000, 10000), 2: (1500, 3800)}


def glb_json(p: Path):
    d = p.read_bytes()
    return json.loads(d[20:20 + struct.unpack_from("<I", d, 12)[0]])


def main() -> None:
    results = []

    def check(name, ok, detail=""):
        results.append({"check": name, "pass": bool(ok), "detail": detail})

    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    char = bpy.data.collections["CNT_CHARACTER"].objects
    meshes = [o for o in char if o.type == "MESH"]
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    check("one armature", len(arms) == 1, [a.name for a in arms])
    check("three LOD meshes, nothing else in CNT_CHARACTER", sorted(o.name for o in meshes) == [f"CNT_Contestant_LOD{i}" for i in range(3)], [o.name for o in meshes])
    for o in meshes:
        lod = o["lod"]
        tri = sum(len(p.vertices) - 2 for p in o.data.polygons)
        lo, hi = BUDGET[lod]
        check(f"LOD{lod} triangle budget {lo}-{hi}", lo <= tri <= hi, tri)
        mods = [m for m in o.modifiers if m.type == "ARMATURE"]
        check(f"LOD{lod} skinned to CNT_Rig", len(mods) == 1 and mods[0].object == arms[0])
        check(f"LOD{lod} one material", len(o.data.materials) == 1 and o.data.materials[0].name == "MAT_CNT_Contestant")
        check(f"LOD{lod} has the CNT region/AO colour attribute", "CNT" in o.data.color_attributes)
        regions = {round(c.color[0] * 15) for c in o.data.color_attributes["CNT"].data}
        check(f"LOD{lod} regions", {0, 1, 2, 5, 6, 7}.issubset(regions), sorted(regions))
        # every UV lies in the atlas
        uv = o.data.uv_layers.active.data
        bad = sum(1 for d in uv if not (0.0 <= d.uv[0] <= 1.0 and 0.0 <= d.uv[1] <= 1.0))
        check(f"LOD{lod} UVs inside the shared atlas", bad == 0, bad)
        groups = {g.name for g in o.vertex_groups}
        check(f"LOD{lod} weights only to rig bones", groups.issubset({b.name for b in arms[0].data.bones}), sorted(groups - {b.name for b in arms[0].data.bones}))
    check("emblem is a separate source part", "SRC_Emblem" in bpy.data.objects)
    check("coat parts modelled separately", all(n in bpy.data.objects for n in ("SRC_Coat", "SRC_Collar", "SRC_Lapel_L", "SRC_Yoke", "SRC_Belt", "SRC_Buckle", "SRC_Pocket_L", "SRC_PocketFlap_L", "SRC_Cuff_L", "SRC_Sleeve_L", "SRC_StormFlap", "SRC_Epaulette_L")))
    acts = {a.name for a in bpy.data.actions}
    check("animation library covers the required clips", REQUIRED_CLIPS.issubset(acts), sorted(REQUIRED_CLIPS - acts))
    check("coat secondary-motion bones", all(b in arms[0].data.bones for b in ("CNT_CoatFront_L", "CNT_CoatFront2_L", "CNT_CoatBack_L", "CNT_CoatBack2_R", "CNT_HoodTip")))

    for name in ("CNTRIAL_CONTESTANT_MASTER.glb", "CNTRIAL_CONTESTANT_MASTER.meshopt.glb"):
        g = glb_json(EXP / name)
        mesh_nodes = [n for n in g["nodes"] if "mesh" in n]
        check(f"{name}: three skinned LOD meshes", len(mesh_nodes) == 3 and all("skin" in n for n in mesh_nodes), [n["name"] for n in mesh_nodes])
        joint_sets = {tuple(sorted(g["nodes"][j]["name"] for j in s["joints"])) for s in g["skins"]}
        check(f"{name}: every skin uses the same joints (one skeleton)", len(joint_sets) == 1, len(joint_sets))
        check(f"{name}: 16 clips", {a["name"] for a in g["animations"]} == REQUIRED_CLIPS, sorted(a["name"] for a in g["animations"]))
        attrs = set(g["meshes"][0]["primitives"][0]["attributes"])
        check(f"{name}: attributes", {"POSITION", "NORMAL", "TANGENT", "TEXCOORD_0", "COLOR_0", "JOINTS_0", "WEIGHTS_0"}.issubset(attrs), sorted(attrs))
        check(f"{name}: no embedded textures (shared maps ship separately)", not g.get("images"), len(g.get("images", [])))

    man = json.loads((EXP / "CNTRIAL_CONTESTANT_MANIFEST.json").read_text())
    tex_files = sorted(p.name for p in EXP.glob("*.webp"))
    check("exactly one shared texture set (2 maps)", tex_files == ["CNT_Detail.webp", "CNT_Normal.webp"], tex_files)
    cws = json.loads((ROOT / "packages/shared/src/contestant-colorways.json").read_text())["colorways"]
    check("30 colourways", len(cws) == 30, len(cws))
    check("colourway ids unique and stable", [c["id"] for c in cws] == [f"CW{i:02d}" for i in range(1, 31)])
    check("manifest lists the regions used by the shader", man["regions"] == G.REGION)
    check("runtime GLB under 1.2 MB", man["bytes"]["runtime_glb"] < 1_200_000, man["bytes"]["runtime_glb"])
    ok = all(r["pass"] for r in results)
    report = {"result": "PASS" if ok else "FAIL", "checks": results}
    if "--report" in sys.argv:
        cb.write_json(Path(sys.argv[sys.argv.index("--report") + 1]), report)
    for r in results:
        print(("PASS " if r["pass"] else "FAIL ") + r["check"] + ("" if r["pass"] else f"  ({r['detail']})"))
    print("RESULT", report["result"])
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
