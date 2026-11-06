#!/usr/bin/env python3
"""
syntax_check.py — real compile gate for the user-mode external.

No fake headers, no -fsyntax-only: it compiles the file for
x86_64-windows-gnu against the real Windows/D3D9 headers and links it. If zig is
available (`zig c++ -target x86_64-windows-gnu`) it uses that; otherwise it falls
back to mingw-w64 g++. Either way it is a full compile + link of the same source
MSVC builds.

    python3 tools/syntax_check.py [file.cpp]        # compile + link
    python3 tools/syntax_check.py --obj [file.cpp]  # compile only, faster

Exit 0 means the file compiles and links as given.
"""

import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "fortnite-external", "fortnite_external_single.cpp")
LIBS = ["-ld3d9", "-ldwmapi", "-luser32", "-lgdi32", "-lpsapi", "-lwinmm"]

# -Wno flags: the Windows headers are noise under -Wall, our own code is not.
WARN = ["-Wall", "-Wextra", "-Wno-unused-parameter", "-Wno-unknown-pragmas",
        "-Wno-cast-function-type", "-Wno-missing-field-initializers"]


def find_compiler():
    zig = shutil.which("zig")
    if zig:
        return [zig, "c++", "-target", "x86_64-windows-gnu"]
    for cc in ("x86_64-w64-mingw32-g++", "x86_64-w64-mingw32-g++-posix"):
        found = shutil.which(cc)
        if found:
            return [found]
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    obj_only = "--obj" in sys.argv
    src = args[0] if args else DEFAULT_SRC

    if not os.path.exists(src):
        print(f"error: {src} does not exist (run tools/build_single.py)", file=sys.stderr)
        return 1

    cc = find_compiler()
    if not cc:
        print("error: neither zig nor mingw-w64 g++ found; cannot verify the build",
              file=sys.stderr)
        return 1

    out = os.path.join(ROOT, "tools", f".gate_{os.getpid()}.obj" if obj_only
                       else f".gate_{os.getpid()}.exe")

    cmd = cc + ["-std=c++17", "-O2", "-D_CRT_SECURE_NO_WARNINGS"] + WARN + [src]
    cmd += ["-c", "-o", out] if obj_only else ["-o", out] + LIBS

    print(" ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)

    for suffix in ("", ".pdb"):
        leftover = out + suffix
        if os.path.exists(leftover):
            os.remove(leftover)

    if result.returncode != 0:
        print(f"FAILED ({result.returncode})", file=sys.stderr)
        return result.returncode

    print(f"OK — {os.path.relpath(src, ROOT)} compiled"
          + (" and linked" if not obj_only else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
