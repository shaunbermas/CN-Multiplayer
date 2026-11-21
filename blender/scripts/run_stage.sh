#!/usr/bin/env bash
# One command for the whole Stage greybox pipeline: build -> export -> validate -> previews -> browser check.
# Installs the pinned Blender Python module if it is missing. Run from anywhere:
#   bash blender/scripts/run_stage.sh STG01            # everything
#   bash blender/scripts/run_stage.sh STG01 --no-render
set -eo pipefail
STAGE="${1:-STG01}"
RENDER=1
[[ "${2:-}" == "--no-render" ]] && RENDER=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
lower="$(echo "$STAGE" | tr '[:upper:]' '[:lower:]')"
SPEC="blender/scripts/specs/${lower}_greybox.json"
BLEND_NAME="$(python3 -c "import json;print(json.load(open('$SPEC'))['blend_name'])")"
GENERATOR="$(python3 -c "import json;print(json.load(open('$SPEC'))['generator'])")"
BLEND="blender/scenes/${BLEND_NAME}.blend"

python3 -c "import bpy" 2>/dev/null || pip install --quiet bpy==5.3.0

echo "== build";    python3 "blender/scripts/${GENERATOR}" --spec "$SPEC" --out "$BLEND" | tail -1
echo "== export";   python3 blender/scripts/export_stage.py --blend "$BLEND" --stage "$STAGE" | tail -1
echo "== validate"; python3 blender/scripts/validate_asset.py --blend "$BLEND" --spec "$SPEC" --stage "$STAGE" | grep -vE '^[0-9:.]+ +(blend|wm)' 
if [[ $RENDER == 1 ]]; then
  echo "== previews"; python3 blender/scripts/render_preview.py --blend "$BLEND" --stage "$STAGE" | grep Rendered
fi
echo "== browser"
( cd tools/asset-check && npm ci --no-audit --no-fund --silent )
NODE_PATH="$(npm root -g)" node tools/asset-check/check-glb.mjs "$STAGE"
if [[ -f blender/scripts/report_greybox.py && "$STAGE" == "STG01" ]]; then
  echo "== report"; python3 blender/scripts/report_greybox.py
fi
if [[ "$STAGE" == "STG01" ]]; then
  echo "== collision-ready scene and metadata (Prompt 04)"
  python3 -c "import jsonschema" 2>/dev/null || pip install --quiet jsonschema==4.26.0
  if [[ $RENDER == 1 ]]; then SHOTS=--screenshots; else SHOTS=; fi
  python3 blender/scripts/stage_01_collision_setup.py $SHOTS | grep -E '^(PASS|FAIL|RESULT|Rendered)'
fi
