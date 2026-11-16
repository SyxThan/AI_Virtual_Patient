#!/usr/bin/env bash
# Build -> Draco -> validate.  Usage: ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out
python3 build_clinic_scene.py --out out/mother_child_raw.glb --blend out/mother_child.blend --render out/preview.png --closeup out/preview_closeup.png
npx gltf-transform draco out/mother_child_raw.glb out/mother_child.glb --quantize-position 14
node validate_avatar.mjs out/mother_child.glb
