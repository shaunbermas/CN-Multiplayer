#!/usr/bin/env bash
# Stage 1.5 (Prompt 08): meshopt-compressed runtime copies of the approved GLBs. The originals in
# blender/exports/ are never modified. Decoded in the browser by three's MeshoptDecoder (drei useGLTF).
# Pinned tool version; needs the npm registry once.
set -euo pipefail
cd "$(dirname "$0")/../.."
GT="npx --yes @gltf-transform/cli@4.2.1"
$GT meshopt blender/exports/STAGE_01_ENVIRONMENT.glb blender/exports/stage15/STAGE_01_ENVIRONMENT.meshopt.glb --level medium
$GT meshopt blender/exports/THE_WATCHER.glb blender/exports/stage15/THE_WATCHER.meshopt.glb --level medium
