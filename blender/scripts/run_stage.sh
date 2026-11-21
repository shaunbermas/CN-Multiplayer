#!/usr/bin/env bash
# One command for the whole Stage greybox pipeline: build -> export -> validate -> previews -> browser check.
# Installs the pinned Blender Python module if it is missing. Run from anywhere:
#   bash blender/scripts/run_stage.sh STG01            # everything
#   bash blender/scripts/run_stage.sh STG01 --no-render
set -euo pipefail
STAGE="${1:-STG01}"
RENDER=1
[[ "${2:-}" == "--no-render" ]] && RENDER=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
lower="$(echo "$STAGE" | tr '[:upper:]' '[:lower:]')"
SPEC="blender/scripts/specs/${lower}_greybox.json"
NAME="$(python3 -c "import json;print(json.load(open('$SPEC'))['name'])")"
BLEND="blender/scenes/${STAGE}_${NAME}.blend"

python3 -c "import bpy" 2>/dev/null || pip install --quiet bpy==5.3.0

echo "== build";    python3 "blender/scripts/build_${lower}_greybox.py" --spec "$SPEC" --out "$BLEND" | tail -1
echo "== export";   python3 blender/scripts/export_stage.py --blend "$BLEND" --stage "$STAGE" | tail -1
echo "== validate"; python3 blender/scripts/validate_asset.py --blend "$BLEND" --spec "$SPEC" --stage "$STAGE" | grep -E '"result"|Report'
if [[ $RENDER == 1 ]]; then
  echo "== previews"; python3 blender/scripts/render_preview.py --blend "$BLEND" --stage "$STAGE" | grep Rendered
fi
echo "== browser"
( cd tools/asset-check && npm ci --no-audit --no-fund --silent )
NODE_PATH="$(npm root -g)" node tools/asset-check/check-glb.mjs "$STAGE"
