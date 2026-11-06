# fortnite external — single-file transcription

`fortnite_external.cpp` is the whole of
[`xetzzy/Fortnite-External-Source`](https://github.com/xetzzy/Fortnite-External-Source)
collapsed into one translation unit.

## What changed vs. the original

| original | here |
|---|---|
| `km/main.cpp`, `defs.hpp`, `utils.hpp` | same driver logic under `#ifdef _KERNEL_MODE` |
| `um/librarys.hpp`, `driver.hpp`, `settings.hpp`, `offsets.hpp`, `sdk.hpp`, `input.hpp`, `gui.hpp`, `game.hpp`, `main.cpp` | same code, flattened into namespaces |
| `um/imgui/*` (~57k lines of third-party) | dropped — replaced with a GDI glyph atlas + an immediate-mode draw list and menu (~350 lines) |

Two real fixes carried over from reading the original:

- `render_menu()`'s aim-key switch had no `break`s, so `current_key` always ended as
  `VK_RBUTTON`. Here the key is picked by the button and actually applied.
- the font/camera handling is rebuilt on resize and device-lost instead of once at startup.

## Build

User mode (MSVC x64 developer prompt):

```
cl /std:c++17 /O2 /EHsc /W3 /D_CRT_SECURE_NO_WARNINGS fortnite_external.cpp /link /SUBSYSTEM:CONSOLE /OUT:fortnite_external.exe
```

Kernel mode: new **Empty WDM Driver** project (x64/Release) in Visual Studio with the WDK,
add this `.cpp`, add `_KERNEL_MODE` to *Preprocessor Definitions*, build with `msbuild`.
Driver has to be mapped manually (kdmapper or equivalent) — it is not signed.

## Runtime

- `INSERT` — menu (click-through turns off while it is open)
- `END` — unload
- aim key defaults to RMB, held; set it in the Aim tab

`cfg::kUseCallbackDriver = false` in the config block switches reads to plain
`OpenProcess` + `ReadProcessMemory` if the driver is not loaded.

## Offsets

`namespace off` is the original `um/offsets.hpp` verbatim (early-2023 season).
`off::UWorld` moves every patch — refresh it from a Fortnite SDK dump (Dumper-7 or
a community offset dump) and rebuild. The rest of the struct offsets have been
stable for years.

## Footgun

This carries a kernel driver that hooks a win32k syscall — run it in a VM, and
exclude the build folder from Defender before you build.
