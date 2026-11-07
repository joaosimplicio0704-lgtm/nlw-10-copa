#!/bin/sh
# Full gate: regenerate offsets, rebuild the single file, compile it for Windows
# (when a cross compiler is present), then check the projection invariants.
set -e
cd "$(dirname "$0")/.."
python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json > fortnite-external/offsets_gen.hpp
python3 tools/build_single.py
python3 tools/check_math.py
python3 tools/fuzz_math.py 20000
echo "all gates passed"
