#!/bin/sh
# Full gate: regenerate offsets, rebuild the single file, syntax-check both halves.
set -e
cd "$(dirname "$0")/.."
python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json > fortnite-external/offsets_gen.hpp
python3 tools/build_single.py            # user-mode half of the single file
python3 tools/syntax_check_km.py         # driver half of the split source
python3 tools/syntax_check_km.py fortnite-external/fortnite_external_single.cpp
echo "all gates passed"
