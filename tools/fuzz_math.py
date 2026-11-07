#!/usr/bin/env python3
"""
fuzz_math.py — stress the parts of the external that are pure computation, so
that bugs which would only show up in a live match (NaN camera, absurd FOV,
degenerate rotators, huge deltas, garbage indices) are caught here instead.

It does not touch Windows or the game: it extracts the math from
fortnite_external.cpp, compiles that as plain C++17 on the host and hammers it.

    python3 tools/fuzz_math.py [iterations] [seed]

Exit 0 = every invariant held. 1 = a real failure was reproduced (input printed).
Exit 3 = no host compiler, nothing was run.

Invariants
----------
1. rotation_matrix() is a proper rotation for any in-band rotator: finite,
   det == 1, rows orthonormal — including pitch at +-90 and yaw/roll wraps.
2. project_world_to_screen() never returns NaN/inf and never accepts a point at
   or behind the near plane, whatever the camera or the FOV.
3. A point on the forward axis always lands on the screen centre.
4. plausible_translation() rejects NaN / inf / zero / absurd coordinates.
5. valid_vector() / valid_rotator() reject out-of-range and non-finite input.
"""

import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "fortnite-external", "fortnite_external.cpp")


def find_compiler():
    if os.environ.get("CXX"):
        return [os.environ["CXX"]]
    for cc in ("g++", "clang++"):
        found = shutil.which(cc)
        if found:
            return [found]
    zig = shutil.which("zig")
    if zig:
        return [zig, "c++"]
    return None


def extract(src, start_marker, end_marker):
    start = src.index(start_marker)
    end = src.index(end_marker, start)
    return src[start:end]


PRELUDE = r"""
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cfloat>
#include <limits>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Same values the program ships with.
namespace cfg { constexpr float kNearPlane = 1.0f; }
namespace settings { inline double center_x = 960.0, center_y = 540.0; }
"""

DRIVER = r"""
// ---------------------------------------------------------------------------
//  driver
// ---------------------------------------------------------------------------
static int failures = 0;

static void fail(const char* what, const char* detail)
{
    ++failures;
    if (failures <= 25) std::printf("FAIL %-40s %s\n", what, detail);
}

static Rotator make_rot(double p, double y, double r)
{
    Rotator out;
    out.pitch = p;
    out.yaw = y;
    out.roll = r;
    return out;
}

static double pick_fov(int k)
{
    const double sane[] = { 60.0, 80.0, 90.0, 103.0, 120.0, 150.0 };
    if (k < 6) return sane[k];
    if (k == 6) return 0.5;        // absurdly small
    return 4000.0;                 // absurdly large
}

static bool proper_rotation(const Mat4& m)
{
    for (int r = 0; r < 3; ++r)
        for (int c = 0; c < 3; ++c)
            if (!std::isfinite(m.m[r][c])) return false;

    for (int a = 0; a < 3; ++a)
        for (int b = 0; b < 3; ++b)
        {
            double dot = 0;
            for (int c = 0; c < 3; ++c) dot += m.m[a][c] * m.m[b][c];
            const double want = (a == b) ? 1.0 : 0.0;
            if (std::fabs(dot - want) > 1e-9) return false;
        }

    const double det =
        m.m[0][0] * (m.m[1][1] * m.m[2][2] - m.m[1][2] * m.m[2][1]) -
        m.m[0][1] * (m.m[1][0] * m.m[2][2] - m.m[1][2] * m.m[2][0]) +
        m.m[0][2] * (m.m[1][0] * m.m[2][1] - m.m[1][1] * m.m[2][0]);
    return std::fabs(det - 1.0) < 1e-9;
}

int main(int argc, char** argv)
{
    const int iters = argc > 1 ? std::atoi(argv[1]) : 200000;
    unsigned seed = argc > 2 ? static_cast<unsigned>(std::atoi(argv[2])) : 12345u;
    std::srand(seed);

    auto rnd = [](double lo, double hi) {
        return lo + (hi - lo) * (static_cast<double>(std::rand()) / RAND_MAX);
    };

    for (int i = 0; i < iters; ++i)
    {
        char buf[256];

        // -- 1: rotator -> basis, including the poles ------------------------
        Rotator r;
        switch (i % 6)
        {
        case 0: r = make_rot(rnd(-89.9, 89.9), rnd(-180, 180), rnd(-180, 180)); break;
        case 1: r = make_rot(90.0, rnd(-180, 180), rnd(-180, 180)); break;
        case 2: r = make_rot(-90.0, rnd(-180, 180), rnd(-180, 180)); break;
        case 3: r = make_rot(0.0, rnd(-180, 180), rnd(-180, 180)); break;
        case 4: r = make_rot(rnd(-89, 89), rnd(0, 359.999), rnd(-359.999, 359.999)); break;
        default: r = make_rot(rnd(-89, 89), rnd(-180, 180), rnd(-180, 180)); break;
        }

        if (!proper_rotation(rotation_matrix(r)))
        {
            std::snprintf(buf, sizeof(buf), "pitch %.3f yaw %.3f roll %.3f", r.pitch, r.yaw, r.roll);
            fail("rotation_matrix not orthonormal", buf);
        }

        if (!valid_rotator(r))
        {
            std::snprintf(buf, sizeof(buf), "pitch %.3f yaw %.3f roll %.3f", r.pitch, r.yaw, r.roll);
            fail("valid_rotator rejected an in-band rotator", buf);
        }

        // -- 2/3: projection ------------------------------------------------
        Camera cam;
        cam.location = Vector3(rnd(-400000, 400000), rnd(-400000, 400000), rnd(-10000, 200000));
        cam.rotation = r;
        cam.fov = pick_fov(i % 8);
        cam.valid = valid_rotator(cam.rotation) && std::isfinite(cam.fov) &&
                    cam.fov > 1.0 && cam.fov < 170.0;

        const Mat4 basis = rotation_matrix(cam.rotation);
        const Vector3 fwd(basis.m[0][0], basis.m[0][1], basis.m[0][2]);
        const double dist = rnd(10, 100000);
        Vector2 out;

        const Vector3 on_axis = cam.location + Vector3(fwd.x * dist, fwd.y * dist, fwd.z * dist);

        if (cam.valid)
        {
            if (!project_world_to_screen(on_axis, out, cam))
            {
                std::snprintf(buf, sizeof(buf), "fov %.2f dist %.1f", cam.fov, dist);
                fail("on-axis point rejected", buf);
            }
            else if (!std::isfinite(out.x) || !std::isfinite(out.y) ||
                     std::fabs(out.x - 960.0) > 0.5 || std::fabs(out.y - 540.0) > 0.5)
            {
                std::snprintf(buf, sizeof(buf), "got (%.3f, %.3f) fov %.2f", out.x, out.y, cam.fov);
                fail("on-axis point not centred", buf);
            }
        }

        // an absurd FOV must never be accepted as a usable camera
        if (!cam.valid && project_world_to_screen(on_axis, out, cam))
            fail("projection accepted an invalid camera", "");

        // behind the camera: rejected, never clamped to the near plane
        const Vector3 behind = cam.location - Vector3(fwd.x * dist, fwd.y * dist, fwd.z * dist);
        if (cam.valid && project_world_to_screen(behind, out, cam))
            fail("behind-camera point accepted", "");

        for (int k = 0; k < 8; ++k)
        {
            const Vector3 p(cam.location.x + rnd(-50000, 50000),
                            cam.location.y + rnd(-50000, 50000),
                            cam.location.z + rnd(-50000, 50000));
            if (project_world_to_screen(p, out, cam) &&
                (!std::isfinite(out.x) || !std::isfinite(out.y)))
                fail("projection returned non-finite", "");
        }

        // -- 4: plausibility of a component translation ----------------------
        if (plausible_translation(NAN, 0, 0, 500000.0)) fail("NaN translation accepted", "");
        if (plausible_translation(INFINITY, 0, 0, 500000.0)) fail("inf translation accepted", "");
        if (plausible_translation(0, 0, 0, 500000.0)) fail("zero translation accepted", "");
        if (plausible_translation(1e12, 0, 0, 500000.0)) fail("absurd translation accepted", "");
        if (!plausible_translation(1234.5, -600.25, 88.0, 500000.0)) fail("sane translation rejected", "");

        // -- 5: vector/rotator validation ------------------------------------
        if (valid_vector(Vector3(NAN, 0, 0))) fail("valid_vector accepted NaN", "");
        if (valid_vector(Vector3(INFINITY, 0, 0))) fail("valid_vector accepted inf", "");
        if (valid_vector(Vector3(1e9, 0, 0))) fail("valid_vector accepted absurd x", "");
        if (!valid_vector(Vector3(1234.5, -600.25, 88.0))) fail("valid_vector rejected sane point", "");

        if (valid_rotator(make_rot(NAN, 0, 0))) fail("valid_rotator accepted NaN", "");
        if (valid_rotator(make_rot(91.0, 0, 0))) fail("valid_rotator accepted pitch 91", "");
        if (valid_rotator(make_rot(0, 361.0, 0))) fail("valid_rotator accepted yaw 361", "");
    }

    std::printf("%s (%d iterations, seed %u)\n",
                failures ? "FAILED" : "all fuzz invariants hold", iters, seed);
    return failures ? 1 : 0;
}
"""


def build_harness(src):
    # The real types (Vector3/Rotator/Mat4/Camera), the rotator basis, the
    # validators and the projection — extracted verbatim, not retyped.
    types = extract(src, "struct Vector2", "namespace cache")
    proj = extract(src, "// World -> screen", "// bRecentlyRendered bit")
    plausible = extract(src, "inline bool plausible_translation", "inline bool read_vec3_float")

    # the projection's default argument needs cache::camera; the harness always
    # passes a camera explicitly
    proj = proj.replace("const Camera& camera = cache::camera", "const Camera& camera")

    return PRELUDE + types + proj + plausible + DRIVER


def main():
    iters = sys.argv[1] if len(sys.argv) > 1 else "200000"
    seed = sys.argv[2] if len(sys.argv) > 2 else "12345"

    if not os.path.exists(SRC):
        print(f"error: {SRC} not found", file=sys.stderr)
        return 1

    with open(SRC, "r", encoding="utf-8", errors="replace") as fh:
        src = fh.read()

    cc = find_compiler()
    if not cc:
        print("SKIPPED — no host C++ compiler (g++/clang++/zig), nothing was run")
        return 3

    harness = build_harness(src)

    with tempfile.TemporaryDirectory() as tmp:
        cpp = os.path.join(tmp, "harness.cpp")
        exe = os.path.join(tmp, "harness.exe")
        with open(cpp, "w") as fh:
            fh.write(harness)

        comp = subprocess.run(cc + ["-std=c++17", "-O2", "-w", "-o", exe, cpp],
                              capture_output=True, text=True)
        if comp.returncode != 0:
            print("harness failed to compile:\n" + comp.stdout + comp.stderr, file=sys.stderr)
            return 1

        run = subprocess.run([exe, iters, seed], capture_output=True, text=True)
        print(run.stdout.rstrip())
        if run.stderr.strip():
            print(run.stderr.rstrip(), file=sys.stderr)
        return run.returncode


if __name__ == "__main__":
    sys.exit(main())
