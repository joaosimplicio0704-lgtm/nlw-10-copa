# fortnite external — user-mode only, v43.00 dump

External cheat shell for Fortnite (UE5), transcribed from
[`xetzzy/Fortnite-External-Source`](https://github.com/xetzzy/Fortnite-External-Source)
and re-pointed at an OffsetDeck dump for **v43.00**.

**User mode only.** `OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION)` +
`ReadProcessMemory` for reads, `SendInput` for the mouse, a D3D9Ex layered window
for the overlay. The kernel driver, the win32k callback hook, physical-memory
reads, `WriteProcessMemory`, the copied `NtUserSendInput` syscall stub and the
winlogon/UIAccess token duplication were **removed**, not disabled. Nothing is
written into the game process and nothing is injected.

## Files

| file | what |
|---|---|
| **`fortnite_external_single.cpp`** | **generated** single translation unit — this is the one you compile |
| `fortnite_external.cpp` | same program with `#include "offsets_gen.hpp"` (easier to diff) |
| `offsets_gen.hpp` | generated offset table + layout asserts for this dump |
| `build.bat` | MSVC build; finds `vcvars64.bat` itself |
| `fortnite_external.sln` / `.vcxproj` | VS 2022 solution, x64, C++17, console |
| `GUIA.md` | passo a passo em português |
| `../tools/gen_offsets.py` | dump JSON → `offsets_gen.hpp` |
| `../tools/build_single.py` | source + header → single file, then runs the gate |
| `../tools/syntax_check.py` | **real** compile + link for x86_64-windows (zig or mingw-w64); exits 3 = not compiled |
| `../tools/check_math.py` | projection/basis invariants — orthonormality, forward→centre, behind rejected |
| `../tools/check_all.sh` | regenerate + rebuild + gate |
| `../tools/fortnite_offsets_43.00.json` | the dump (240 structs, 5886 fields) |

## Dependencies

C++17, Windows SDK only. No ImGui, no Boost, no vcpkg, nothing to fetch.

```
d3d9.lib dwmapi.lib user32.lib gdi32.lib psapi.lib winmm.lib
```

`winmm` is for `timeBeginPeriod(1)` so the 4 ms `Sleep` floor is really 4 ms.

## Build

MSVC x64 Developer prompt (or `build.bat`):

```
cl /nologo /std:c++17 /O2 /EHsc /W3 /D_CRT_SECURE_NO_WARNINGS ^
   fortnite_external_single.cpp ^
   /link /SUBSYSTEM:CONSOLE /OUT:fortnite_external.exe ^
   d3d9.lib dwmapi.lib user32.lib gdi32.lib psapi.lib winmm.lib
```

Regenerate after editing `fortnite_external.cpp` or the dump:

```
python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json > fortnite-external/offsets_gen.hpp
python3 tools/build_single.py
```

## Run

```
fortnite_external.exe                      # resolve UWorld in the background
fortnite_external.exe --uworld 0x1C8E1578  # try a known GWorld offset (validated)
fortnite_external.exe --scan               # walk the writable sections up front
```

Run elevated, game windowed or borderless on the primary monitor.

| key | action |
|---|---|
| `INSERT` | menu (opens with aimbot/visuals **off**) |
| `END` | unload |
| aim key (RMB default) | **held** to aim |

Mouse deltas are only produced when: game process owns the foreground window,
the menu is closed, `enable aimbot` is on, and the aim key is held. Camera,
target and position are re-validated every tick; anything that fails is skipped
rather than aimed at.

## What is real and what is still marked `// FILL:`

Real — read from the dump and asserted at compile time:

| value | source |
|---|---|
| `World::OwningGameInstance` 0x248, `World::GameState` 0x1D0 | dump |
| `GameStateBase::PlayerArray` 0x290 (+ Num/Max at +0x298/+0x29C) | dump |
| `Character::Mesh` 0x2F8, `Actor::RootComponent` 0x1B0 | dump |
| `SceneComponent::{RelativeLocation,Rotation,Scale3D,AttachParent}` | dump |
| `FortPawn::HealthSet` 0x1430 → `FortHealthSet::{Health,MaxHealth}` | dump |
| `FortPlayerStateAthena::TeamIndex` 0xF81 (uint8) | dump |
| `PlayerController::PlayerCameraManager` 0x330 → `CameraCachePrivate` 0x15A0 → `POV` 0x10 | dump |
| `MinimalViewInfo` Location 0x00 / Rotation 0x18 / FOV 0x30 | dump |

Everything else it needs is derived, and the derivations are checked:

- `rotation_matrix()` uses UE's canonical basis with the third row negated. An
  earlier revision had the sign dropped on one term, which made the frame
  **non-orthonormal** (det up to 2.94, "up" axis pointing backwards) — W2S was
  wrong at any pitch != 0. `tools/check_math.py` now asserts det == 1, axis
  orthogonality, forward→screen centre, up→above centre and behind→rejected.

Layout facts derived from the dump, not assumed — `offsets_gen.hpp` carries
`static_assert`-style checks for each, so a dump with a different layout fails
the build instead of skewing the math:

- `Rotation - Location == 0x18` and `FOV - Rotation == 0x18` → `Location` and
  `Rotation` are **three doubles** each (`FVector`/`FRotator`, LWC).
- `RelativeRotation - RelativeLocation == 0x18` and `Scale3D - Rotation == 0x18`
  → the SceneComponent relative block is double as well.
- `DesiredFOV - FOV == 4` → **FOV is a 4-byte float.** Reading it as a double
  would fold `DesiredFOV` into the high half. (The generated header caught this
  while this rewrite was being written.)
- `TeamIndex - AlwaysIncludeTeamAsAllies == 1` → TeamIndex is one byte.

Still `// FILL:` — the cheat does not guess any of these:

| unknown | state | how to get it |
|---|---|---|
| `UWorld` (GWorld static) | not in the dump; `off::UWorld = 0` | `--uworld 0x...` (validated), `--scan`, or AOB the `mov rax,[GWorld]` load. `0x1C8E1578` from the forum dump is **unverified for v43.00** — pass it and the console tells you whether validation accepted it |
| bone array / `kBoneWorldLocations` | **off**; aim point comes from `Pawn::BaseEyeHeight - FortPawn::CapsuleHalfHeightFortPawn` over the capsule centre | `CachedBoneSpaceTransforms` is *not* assumed to be component space and *not* assumed to be `FTransform3f`. Determine stride (`0x60` vs `0x30`), space, and `NumBones` in-game, then set `kTransformStride` / `kBoneTransformsAreFloat` and flip the switch |
| `bRecentlyRendered` bit | **off** (`kVisibleOnly = false`); box colour is neutral, not a visibility claim | byte 0x7E1 is in the dump, the bit index is not. Read it on a visible pawn and an occluded one |
| `bIsSpectator` / `bIsDBNO` bits | not read at all | byte offsets are in the dump, bit indices are not — a wrong bit marks live players as downed/spectating |
| `ULocalPlayer::PlayerController` | `0x30`, validated by the walk failing safely | not a reflected property. Confirm by printing `ULocalPlayer+0x00..0x80` |

## UWorld resolution

1. `--uworld 0x...` → validated by `looks_like_uworld()` before use.
2. `off::UWorld` from the generated header, when a dump ships it.
3. Bounded scan of the module's **writable** sections (PE header tells us which),
   1 MiB per step, one step every 500 ms, never a whole-range sweep inside a
   tick. The pointer is re-validated at most every 2 s, not every 4 ms.

`looks_like_uworld()` requires four independent hops to resolve:
`UWorld+0x248` → `GameInstance+0x38` → `UWorld+0x1D0` → `GameState+0x290`.
Random data in `.data` does not survive that.

## Verified

- Compiled and linked for `x86_64-windows-gnu` with `zig c++`
  (`python3 tools/syntax_check.py`), including the D3D9Ex path and the PE-header
  scan. **Not** compiled with MSVC, and **not** run against the game — no
  Windows machine and no Fortnite here. Treat every runtime number above as
  unverified until you have run it.
- Projection maths verified numerically (`python3 tools/check_math.py`): the
  rotator basis is a proper rotation and the W2S invariants hold at six camera
  orientations, including roll and negative pitch.
