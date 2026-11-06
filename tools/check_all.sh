#!/bin/sh
# Full gate: regenerate offsets, rebuild the single file, compile it for Windows.
set -e
cd "$(dirname "$0")/.."
python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json > fortnite-external/offsets_gen.hpp
python3 tools/build_single.py
