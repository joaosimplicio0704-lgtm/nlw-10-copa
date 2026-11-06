#!/usr/bin/env python3
"""
check_math.py — the projection/basis invariants, without a game to test against.

    python3 tools/check_math.py

`fortnite_external.cpp` gets its world-to-screen from a rotator basis, so the
cheap way to catch a broken basis is to assert what a correct one must do:

  * rows and columns are unit length and mutually orthogonal, det == +1
  * a point on the camera's forward axis lands exactly on the screen centre
  * a point on the up axis lands above the centre, on the right axis to the right
  * a point behind the camera is rejected instead of projected

The expressions below are transcribed from rotation_matrix() and
project_world_to_screen() in fortnite_external.cpp. If either changes, this file
must change with it — that is the point: it is a second, independent estimate of
the same maths, not an import of the C++.

Exit 0 = all invariants hold.
"""

import itertools
import math
import sys


def basis(pitch, yaw, roll):
    p, y, r = (math.radians(v) for v in (pitch, yaw, roll))
    sp, cp = math.sin(p), math.cos(p)
    sy, cy = math.sin(y), math.cos(y)
    sr, cr = math.sin(r), math.cos(r)
    return [
        [cp * cy, cp * sy, sp],
        [sr * sp * cy - cr * sy, sr * sp * sy + cr * cy, -sr * cp],
        [-(cr * sp * cy + sr * sy), cy * sr - cr * sp * sy, cr * cp],
    ]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def det(m):
    return (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))


def col(m, i):
    return [m[k][i] for k in range(3)]


def project(point, camera, rot, fov, w, h, near=1.0):
    m = basis(*rot)
    d = [point[i] - camera[i] for i in range(3)]
    fwd, right, up = dot(d, m[0]), dot(d, m[1]), dot(d, m[2])
    if not fwd > near:
        return None                      # behind the camera: rejected
    focal = (w / 2.0) / math.tan(math.radians(fov) / 2.0)
    return (w / 2.0 + right * focal / fwd, h / 2.0 - up * focal / fwd)


def main():
    failures = []

    worst = 0.0
    for pitch, yaw, roll in itertools.product(range(-90, 91, 15), range(0, 360, 30), range(0, 360, 45)):
        m = basis(pitch, yaw, roll)
        for i in range(3):
            for j in range(3):
                want = 1.0 if i == j else 0.0
                worst = max(worst, abs(dot(m[i], m[j]) - want))
                worst = max(worst, abs(dot(col(m, i), col(m, j)) - want))
        worst = max(worst, abs(det(m) - 1.0))
    print(f"orthonormality / determinant: max deviation {worst:.2e}")
    if worst > 1e-9:
        failures.append("basis is not a proper rotation matrix")

    w, h, fov = 1920, 1080, 90.0
    centre = (w / 2.0, h / 2.0)
    for rot in [(0, 0, 0), (30, 0, 0), (-40, 90, 0), (10, 200, 25), (60, 10, 0), (-85, 300, 180)]:
        m = basis(*rot)
        cam = [100.0, 200.0, 300.0]
        forward = [cam[i] + m[0][i] * 500 for i in range(3)]
        upward = [forward[i] + m[2][i] * 300 for i in range(3)]
        rightward = [forward[i] + m[1][i] * 300 for i in range(3)]
        behind = [cam[i] - m[0][i] * 500 for i in range(3)]

        p_fwd = project(forward, cam, rot, fov, w, h)
        p_up = project(upward, cam, rot, fov, w, h)
        p_right = project(rightward, cam, rot, fov, w, h)
        p_back = project(behind, cam, rot, fov, w, h)

        ok = (p_fwd is not None
              and abs(p_fwd[0] - centre[0]) < 1e-6 and abs(p_fwd[1] - centre[1]) < 1e-6
              and p_up is not None and p_up[1] < centre[1]
              and p_right is not None and p_right[0] > centre[0]
              and p_back is None)
        print(f"  rot{rot}: forward->{p_fwd and tuple(round(v, 1) for v in p_fwd)} "
              f"up->{p_up and round(p_up[1], 1)} right->{p_right and round(p_right[0], 1)} "
              f"behind->{p_back} {'ok' if ok else 'FAIL'}")
        if not ok:
            failures.append(f"projection invariants broken at rot{rot}")

    if failures:
        for f in failures:
            print(f"FAIL: {f}", file=sys.stderr)
        return 1

    print("all projection invariants hold")
    return 0


if __name__ == "__main__":
    sys.exit(main())
