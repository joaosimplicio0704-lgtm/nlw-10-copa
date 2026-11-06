# fortnite external — single-file transcription, v43.00 offsets

`fortnite_external.cpp` is the whole of
[`xetzzy/Fortnite-External-Source`](https://github.com/xetzzy/Fortnite-External-Source)
collapsed into one translation unit, re-pointed at an OffsetDeck dump for
**Fortnite v43.00 (UE5)**. `offsets_gen.hpp` next to it is generated, never
hand-edited.

## Files

| file | what |
|---|---|
| **`fortnite_external_single.cpp`** | **everything in one file** — driver + cheat + offsets, no local includes. This is the one to compile |
| `fortnite_external.cpp` | same program, offsets in `offsets_gen.hpp` (easier to diff) |
| `offsets_gen.hpp` | generated offset table (`off::` flat + `sch::` full dump) |
| `../tools/gen_offsets.py` | offset generator; reads the dump JSON |
| `../tools/build_single.py` | collapses source + offsets into the single file |
| `../tools/syntax_check.py` | compiles the user-mode half with g++ against fake Win32/D3D9 headers |
| `../tools/syntax_check_km.py` | same for the driver half against a fake `<ntifs.h>` |
| `../tools/check_all.sh` | regenerate + rebuild single file + both gates |
| `../tools/fortnite_offsets_43.00.json` | the dump this was built from (5886 fields, 240 structs) |
| `../tools/fortnite_offsets_43.00.provenance.json` | source/version of that dump |

## What changed vs. the original source

| original | here |
|---|---|
| `km/main.cpp`, `defs.hpp`, `utils.hpp` | same driver logic under `#ifdef _KERNEL_MODE` |
| `um/librarys.hpp` … `um/main.cpp` | same code, flattened into namespaces |
| `um/imgui/*` (~57k lines) | dropped; GDI glyph atlas + immediate-mode draw list and menu |
| hardcoded 2023 offsets | `offsets_gen.hpp`, generated from the v43.00 dump |

Behaviour fixes that came out of reading the original:

- `render_menu()`'s aim-key switch had no `break`s → the key always ended as RMB.
- camera was read from `UWorld+0x110/0x120` (a 2023 layout). Now it comes from
  `APlayerCameraManager::CameraCachePrivate` → `FCameraCacheEntry::POV`
  (`FMinimalViewInfo`: location +0x00, rotation +0x18, FOV +0x30).
- visibility used `LastSubmitTime` / `LastRenderTimeOnScreen`, which are private
  in this build. Replaced by `SkinnedMeshComponent::bRecentlyRendered` (0x7E1).
- the original recomputed the camera inside every W2S call (3 matrix reads per
  bone); the camera is now read once per tick.

## The walk (v43.00)

```
base + UWorld                       // FILL — not in the dump, see below
  + World::OwningGameInstance   0x248
  + GameInstance::LocalPlayers  0x38   -> TArray<ULocalPlayer*>
  ULocalPlayer + 0x30                  -> APlayerController (not reflected)
  + Controller::Pawn            0x2B8  -> AFortPlayerPawn
  + Character::Mesh             0x2F8  -> USkeletalMeshComponent
  + Pawn::PlayerState           0x298  -> AFortPlayerStateAthena
  + FortPlayerStateAthena::TeamIndex 0xF81  (int32, low byte holds the team; sparse)

World::GameState                0x1D0 -> AGameStateBase
  + GameStateBase::PlayerArray  0x290 -> TArray<APlayerState*>  (ptr then count)
  PlayerState::PawnPrivate      0x2F0
```

Bones and world transforms:

- `SkeletalMeshComponent::CachedBoneSpaceTransforms` at **0x9B8**, `FTransform3f`,
  **0x30 stride** (quat 0x00, translation 0x10, scale 0x20).
- `ComponentToWorld` is **not in the dump** (private). The cheat rebuilds it by
  walking `SceneComponent::AttachParent` (0xD0) and composing
  `RelativeLocation 0x140` / `RelativeRotation 0x158` / `RelativeScale3D 0x170`,
  depth-capped at 16 links.
- Head bone stays 109; root 0.

Health comes from the ability set: `FortPawn::HealthSet` 0x1430 →
`FortHealthSet::Health 0x48`, `MaxHealth 0x70` (floats).

## Three values the dump does not carry (FILL)

1. **`off::UWorld`** — the OffsetDeck export shipped `globals: {}`, and `UWorld`
   is not inside any struct, so it is the one number you have to supply.
   `cfg::kUWorldFallback` is the second chance if `off::UWorld` is 0.
   Get it from a dump that exposes globals (OffsetDeck's full dump usually does,
   or a Dumper-7 SDK's `GWorld`), then either:
   ```
   python3 tools/gen_offsets.py dump.json > fortnite-external/offsets_gen.hpp   # if globals.UWorld exists
   ```
   or just set `cfg::kUWorldFallback = 0x...;` in the config block.
2. **`bRecentlyRendered` / `bIsSpectator` / `bIsDBNO` bit indices** — the dump
   gives byte offsets for bitfields only. Defaults are `0x01` and the bit-gated
   features are off (`kVisibleOnly = false`, `kSkipSpectators = false`,
   `kMarkDowned = false`). Read the byte on two known states and set the mask.
3. **`BoneArray`** — not exposed; the code walks the cached array instead, which
   is the one the renderer fills. If you dump the real pointer, put it in
   `off::BoneArray` and it takes priority automatically.

## ESP semantics with the v43 dump

- box: white = recently rendered, red = not (only meaningful when
  `kVisibleOnly` is on), amber = DBNO (`kMarkDowned`).
- distance is metres, from the local mesh root to the enemy root.
- health bar: green fill, plus `m + hp` in the distance label when enabled.

## Build

User mode (MSVC x64 developer prompt, from this folder):

```
cl /std:c++17 /O2 /EHsc /W3 /D_CRT_SECURE_NO_WARNINGS fortnite_external_single.cpp /link /SUBSYSTEM:CONSOLE /OUT:fortnite_external.exe
```

Kernel mode: **Empty WDM Driver** project (x64/Release) with the WDK, add the
`.cpp`, add `_KERNEL_MODE` to preprocessor definitions, `msbuild`. The driver is
unsigned — map it with kdmapper or equivalent.

`cfg::kUseCallbackDriver = false` switches reads to `OpenProcess` +
`ReadProcessMemory` when the driver is not loaded.

## Runtime

- `INSERT` — menu (click-through is disabled while it is open)
- `END` — unload
- aim key defaults to RMB, held; switchable in the Aim tab
- per-tick mouse step is capped (`kMaxScreenStep`) so a target cannot produce a
  screen-crossing flick

## Verified how

No MSVC/WDK on this machine, so both halves of the single file are compiled with
g++ against fake platform headers (`tools/syntax_check.py`, `tools/syntax_check_km.py`,
wired together in `tools/check_all.sh`). That catches type errors, bad argument
counts, scope mistakes and missing declarations, and it did catch two:

- `Vector2(x, y)` on a struct with no such constructor — `project_world_to_screen`
  would not have compiled anywhere.
- `static_cast` between the distinct GDI handle types — now `reinterpret_cast`.

It does **not** prove MSVC acceptance of the WDK specifics (`__readcr3`,
`MmCopyIoSpaceEx`, the win32k signature) — those still need one real build.

## Footgun

This carries a kernel driver that hooks a win32k syscall — run it in a VM, and
exclude the build folder from Defender before you build.
