#!/usr/bin/env python3
"""
gen_offsets.py — emit um/offsets_gen.hpp from an OffsetDeck Fortnite dump.

    python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json \
        > fortnite-external/offsets_gen.hpp

What it does:
  * reads offsets.structs.<Struct>.<Field> from the JSON
  * maps every field the cheat needs onto a `namespace off` constant
  * keeps the full struct table as `namespace sch` (string -> offset) so new
    features can pull fields without regenerating by hand
  * refuses to emit silently-missing values: anything the dump does not carry
    is written as a commented `// FILL:` line with the exact recipe to get it

Field names absent from OffsetDeck (private/protected UPROPERTYs) that the
cheat works around are listed in DERIVED below.
"""

import json
import sys

# ---------------------------------------------------------------------------
# field map: our constant name -> (Struct, Field)
# ---------------------------------------------------------------------------
WANT = {
    # --- core walk ---------------------------------------------------------
    "GameInstance":        ("World", "OwningGameInstance"),
    "LocalPlayers":        ("GameInstance", "LocalPlayers"),
    "ControllerId":        ("LocalPlayer", "ControllerId"),
    "LocalPawn":           ("Controller", "Pawn"),
    "PlayerState":         ("Pawn", "PlayerState"),
    "GameState":           ("World", "GameState"),
    "PlayerArray":         ("GameStateBase", "PlayerArray"),

    # --- pawn / mesh -------------------------------------------------------
    "Mesh":                ("Character", "Mesh"),
    "RootComponent":       ("Actor", "RootComponent"),
    "RelativeLocation":    ("SceneComponent", "RelativeLocation"),
    "RelativeRotation":    ("SceneComponent", "RelativeRotation"),
    "RelativeScale3D":     ("SceneComponent", "RelativeScale3D"),
    "AttachParent":        ("SceneComponent", "AttachParent"),
    "BoneSpaceTransforms": ("SkeletalMeshComponent", "CachedBoneSpaceTransforms"),
    "RootBoneTranslation": ("SkeletalMeshComponent", "RootBoneTranslation"),
    "RecentlyRendered":    ("SkinnedMeshComponent", "bRecentlyRendered"),

    # --- player state ------------------------------------------------------
    "PawnPrivate":         ("PlayerState", "PawnPrivate"),
    "TeamIndex":           ("FortPlayerStateAthena", "TeamIndex"),
    "PlayerNamePrivate":   ("PlayerState", "PlayerNamePrivate"),

    # --- health / flags ----------------------------------------------------
    "HealthSet":           ("FortPawn", "HealthSet"),
    "Health":              ("FortHealthSet", "Health"),
    "MaxHealth":           ("FortHealthSet", "MaxHealth"),
    "bIsDBNO":             ("FortPawn", "bIsDBNO"),
    "bIsSpectator":        ("PlayerState", "bIsSpectator"),

    # --- camera ------------------------------------------------------------
    "PlayerCameraManager": ("PlayerController", "PlayerCameraManager"),
    "CameraCachePrivate":  ("PlayerCameraManager", "CameraCachePrivate"),
    "CameraPOV":           ("CameraCacheEntry", "POV"),
    "CameraLocation":      ("MinimalViewInfo", "Location"),
    "CameraRotation":      ("MinimalViewInfo", "Rotation"),
    "CameraFOV":           ("MinimalViewInfo", "FOV"),
    "ControlRotation":     ("Controller", "ControlRotation"),
}

# Values that are genuinely not in the dump, with the way to obtain each.
FILL = {
    "UWorld": ("globals", "0x0"),
    "BoneArray": ("SkeletalMeshComponent", "0x0"),
}

# ULocalPlayer::PlayerController is not a reflected UPROPERTY in the dumps, so it
# is not in the table. APlayerController* sits right after the ULocalPlayer
# header; 0x30 is the long-standing value and the one the original source used.
LOCAL_PLAYER_CONTROLLER = 0x30


def hexint(value):
    if isinstance(value, int):
        return value
    return int(str(value), 16)


def main():
    if len(sys.argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        doc = json.load(fh)

    version = doc.get("version", "unknown")
    structs = doc["offsets"]["structs"]
    globals_ = doc["offsets"].get("globals") or {}

    missing = []
    lines = []

    def emit(name, value, comment):
        lines.append(f"    constexpr uintptr_t {name:<20} = 0x{value:X};  // {comment}")

    for name, (struct, field) in WANT.items():
        if struct not in structs or field not in structs[struct]:
            missing.append(f"{name} ({struct}::{field})")
            lines.append(f"    // FILL: {name} - {struct}::{field} absent from dump")
            continue
        emit(name, hexint(structs[struct][field]), f"{struct}::{field}")

    lines.append("")
    for name, (struct, hint) in FILL.items():
        if name == "UWorld" and "UWorld" in globals_:
            emit(name, hexint(globals_["UWorld"]), "globals::UWorld")
            continue
        lines.append(f"    // FILL: {name} - not exposed in OffsetDeck structs.")
        if name == "BoneArray":
            lines.append(f"    //   bone array ptr lives right after RootBoneTranslation/ComponentSpaceFlags;")
            lines.append(f"    //   dump it in-game: scan SkeletalMeshComponent, look for a heap ptr whose")
            lines.append(f"    //   elements are 32-byte (FTransform3f) or 48-byte (FTransform) entries,")
            lines.append(f"    //   count == SkeletalMesh->RefSkeleton.NumBones.")
            lines.append(f"    //   0 = not dumped: the cheat then walks CachedBoneSpaceTransforms (0x9B8).")
        elif name == "ComponentToWorld":
            lines.append(f"    //   SceneComponent::ComponentToWorld is private; it sits after the")
            lines.append(f"    //   RelativeLocation/Rotation/Scale3D block. The cheat rebuilds it from")
            lines.append(f"    //   the attach chain instead, so this is only the fallback.")
        note = "0 = use the cached bone array path" if name == "BoneArray" else "FILL before trusting"
        lines.append(f"    constexpr uintptr_t {name:<20} = {hint};  // {note}")

    head = [
        "#pragma once",
        "// ---------------------------------------------------------------------------",
        f"//  offsets_gen.hpp - generated by tools/gen_offsets.py from",
        f"//  OffsetDeck Fortnite dump v{version}.",
        "//",
        "//  DO NOT EDIT BY HAND. Regenerate instead:",
        "//    python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json > fortnite-external/offsets_gen.hpp",
        "//",
        "//  `namespace off` is the flat table the cheat reads.",
        "//  `namespace sch` keeps every struct field of the dump as string -> offset,",
        "//  so a new feature never needs a regenerated header.",
        "// ---------------------------------------------------------------------------",
        "",
        "#include <stdint.h>",
        "",
        "namespace off",
        "{",
    ]

    tail = [
        "",
        f"    // ULocalPlayer field block: LocalPlayer -> PlayerController (not reflected)",
        f"    constexpr uintptr_t LocalPlayerController = 0x{LOCAL_PLAYER_CONTROLLER:X};",
        "}",
        "",
        "namespace sch",
        "{",
        "    struct Field { const char* name; uintptr_t offset; };",
        "    struct Struct { const char* name; const Field* fields; unsigned count; };",
        "",
    ]

    for sname in sorted(structs):
        ident = "".join(ch if ch.isalnum() else "_" for ch in sname)
        fields = structs[sname]
        tail.append(f"    inline constexpr Field fields_{ident}[] = {{")
        for fname in sorted(fields, key=lambda k: hexint(fields[k])):
            tail.append(f'        {{ "{fname}", 0x{hexint(fields[fname]):X} }},')
        tail.append("    };")
        tail.append("")

    tail.append("    inline constexpr Struct table[] = {")
    for sname in sorted(structs):
        ident = "".join(ch if ch.isalnum() else "_" for ch in sname)
        tail.append(f'        {{ "{sname}", fields_{ident}, {len(structs[sname])} }},')
    tail.append("    };")
    tail.append("}")
    tail.append("")

    out = "\n".join(head + lines + tail)
    sys.stdout.write(out)

    if missing:
        print("warning: missing fields -> " + ", ".join(missing), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
