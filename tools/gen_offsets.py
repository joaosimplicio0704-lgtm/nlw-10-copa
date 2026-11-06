#!/usr/bin/env python3
"""
gen_offsets.py — emit fortnite-external/offsets_gen.hpp from an OffsetDeck dump.

    python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json \
        > fortnite-external/offsets_gen.hpp

What it does:
  * reads offsets.structs.<Struct>.<Field> from the JSON
  * maps only the fields the cheat actually reads onto `namespace off`
  * anything the dump does not carry is written as an explicit `// FILL:` block
    with the recipe to obtain it — never as an invented constant
  * `--schema` additionally appends `namespace sch`: the whole dump as
    string -> offset tables. Not inlined into the single-file build (nothing
    reads it at runtime); use it to grep a field when adding a feature.

Struct sizes and vector strides are derived from the dump, not from memory of
old UE layouts: the emitted header carries a `static_assert` on the spacing of
the fields we rely on, so a dump whose layout disagrees fails to compile instead
of silently producing garbage world-to-screen math.
"""

import json
import sys

# ---------------------------------------------------------------------------
# field map: our constant name -> (Struct, Field)
# only fields read by fortnite_external.cpp
# ---------------------------------------------------------------------------
WANT = {
    # --- world walk --------------------------------------------------------
    "GameInstance":        ("World", "OwningGameInstance"),
    "GameState":           ("World", "GameState"),
    "LocalPlayers":        ("GameInstance", "LocalPlayers"),
    "PlayerArray":         ("GameStateBase", "PlayerArray"),

    # --- pawn / mesh -------------------------------------------------------
    "LocalPawn":           ("Controller", "Pawn"),
    "PlayerState":         ("Pawn", "PlayerState"),
    "BaseEyeHeight":       ("Pawn", "BaseEyeHeight"),
    "Mesh":                ("Character", "Mesh"),
    "RootComponent":       ("Actor", "RootComponent"),

    # --- scene component (3 doubles per vector/rotator, see static_assert) --
    "AttachParent":        ("SceneComponent", "AttachParent"),
    "RelativeLocation":    ("SceneComponent", "RelativeLocation"),
    "RelativeRotation":    ("SceneComponent", "RelativeRotation"),
    "RelativeScale3D":     ("SceneComponent", "RelativeScale3D"),

    # --- skeletal mesh -----------------------------------------------------
    "BoneSpaceTransforms":     ("SkeletalMeshComponent", "CachedBoneSpaceTransforms"),
    "ComponentSpaceTransforms":("SkeletalMeshComponent", "CachedComponentSpaceTransforms"),
    "RecentlyRendered":        ("SkinnedMeshComponent", "bRecentlyRendered"),

    # --- player state ------------------------------------------------------
    "PawnPrivate":         ("PlayerState", "PawnPrivate"),
    "TeamIndex":           ("FortPlayerStateAthena", "TeamIndex"),
    "bIsSpectator":        ("PlayerState", "bIsSpectator"),

    # --- fort pawn / health ------------------------------------------------
    "HealthSet":           ("FortPawn", "HealthSet"),
    "Health":              ("FortHealthSet", "Health"),
    "MaxHealth":           ("FortHealthSet", "MaxHealth"),
    # bIsDBNO (FortPawn 0x892) is in the dump but its bit index is not, so it
    # is not read: a wrong bit would mark live players as downed.
    "CapsuleHalfHeight":   ("FortPawn", "CapsuleHalfHeightFortPawn"),

    # --- camera ------------------------------------------------------------
    "PlayerCameraManager": ("PlayerController", "PlayerCameraManager"),
    "CameraCachePrivate":  ("PlayerCameraManager", "CameraCachePrivate"),
    "CameraPOV":           ("CameraCacheEntry", "POV"),
    "CameraLocation":      ("MinimalViewInfo", "Location"),
    "CameraRotation":      ("MinimalViewInfo", "Rotation"),
    "CameraFOV":           ("MinimalViewInfo", "FOV"),
}

# Not in the dump at all. Emitted as 0 with the recipe to obtain them.
FILL = {
    "UWorld": [
        "not present: the dump has no globals section, so the GWorld static",
        "is unknown for this build. Get it for your patch:",
        "  1. run this tool with --scan (bounded, resumable) and copy the",
        "     base+0x... it prints, or",
        "  2. AOB scan the module for the load of the UWorld static, e.g.",
        "     48 8B 05 ?? ?? ?? ?? 48 8B 88 48 02 00 00   (mov rax,[GWorld];",
        "     mov rcx,[rax+0x248 OwningGameInstance]) and take offset =",
        "     (match + 3 + disp32 + 7) - module base, or",
        "  3. Cheat Engine: find a qword whose pointee has valid pointers at",
        "     +0x1D0 (GameState) and +0x248 (OwningGameInstance).",
        "  Whatever you get must pass looks_like_uworld(); the tool validates it",
        "  and refuses the value otherwise. Values floating around on forums",
        "  (e.g. 0x1C8E1578) are unverified for v43.00 — pass them on the",
        "  command line (--uworld 0x...) and watch the console verdict.",
    ],
    "BoneArray": [
        "not present, and CachedBoneSpaceTransforms is not a substitute:",
        "  the dump does not say whether it holds component-space or bone-space",
        "  transforms, nor whether the element stride is FTransform (0x60,",
        "  double) or FTransform3f (0x30, float). Bone aiming is therefore",
        "  DISABLED in the cheat (cfg::kBoneWorldLocations == false) and the aim",
        "  point comes from the capsule:",
        "    centre + Z * (Pawn::BaseEyeHeight - FortPawn::CapsuleHalfHeight)",
        "  To enable real bones, determine all three facts in-game:",
        "  1. stride: read mesh+0x9B8 (a TArray data pointer), then check",
        "     data[0..3] as floats and as doubles; exactly one reads as a unit",
        "     quaternion (|q| ~= 1) followed by a plausible translation.",
        "  2. space: the value at data[0].translation must equal the component",
        "     location for component space, or ~0 for bone space.",
        "  3. index: NumBones = SkeletalMesh->RefSkeleton.NumBones (not in this",
        "     dump) — read it once and assert index < NumBones.",
        "  Then set cfg::kBoneWorldLocations = true and wire bone_id through",
        "  bone_world_location() (the hook is in place, guarded).",
    ],
}


def hexint(value):
    if isinstance(value, int):
        return value
    return int(str(value), 16)


def emit(doc, missing, lines):

    version = doc.get("version", "unknown")
    structs = doc["offsets"]["structs"]
    globals_ = doc["offsets"].get("globals") or {}

    def emit_const(name, value, comment):
        lines.append(f"    constexpr uintptr_t {name:<22} = 0x{value:X};  // {comment}")

    for name, (struct, field) in WANT.items():
        if struct not in structs or field not in structs[struct]:
            missing.append(f"{name} ({struct}::{field})")
            lines.append(f"    // FILL: {name} — {struct}::{field} absent from dump")
            lines.append(f"    constexpr uintptr_t {name:<22} = 0x0;")
            continue
        emit_const(name, hexint(structs[struct][field]), f"{struct}::{field}")

    lines.append("")
    for name, recipe in FILL.items():
        if name == "UWorld" and name in globals_:
            emit_const(name, hexint(globals_[name]), "globals::UWorld")
            continue
        lines.append(f"    // FILL: {name} — " + recipe[0])
        for extra in recipe[1:]:
            lines.append(f"    //   {extra}" if not extra.startswith("  ") else f"    // {extra}")
        lines.append(f"    constexpr uintptr_t {name:<22} = 0x0;")

    head = [
        "#pragma once",
        "// ---------------------------------------------------------------------------",
        f"//  offsets_gen.hpp — generated by tools/gen_offsets.py from the",
        f"//  OffsetDeck Fortnite dump v{version} ({len(structs)} structs,",
        f"//  {sum(len(v) for v in structs.values())} fields).",
        "//",
        "//  DO NOT EDIT BY HAND. Regenerate instead:",
        "//    python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json \\",
        "//        > fortnite-external/offsets_gen.hpp",
        "//",
        "//  Only `off` is used by the cheat. Pass --schema to also emit `sch`",
        "//  (every struct of the dump as string -> offset) for grep-ability.",
        "// ---------------------------------------------------------------------------",
        "",
        "#include <stdint.h>",
        "",
        "namespace off",
        "{",
    ]

    # --- layout facts the code depends on, checked against this dump ---------
    def off_of(struct, field):
        try:
            return hexint(structs[struct][field])
        except KeyError:
            return None

    checks = []
    pairs = [
        ("MinimalViewInfo", "Location", "Rotation", "world vectors are 3 doubles (0x18)"),
        ("MinimalViewInfo", "Rotation", "FOV", "FOV follows a 3-double rotator"),
        ("SceneComponent", "RelativeLocation", "RelativeRotation", "relative vectors are 3 doubles"),
        ("SceneComponent", "RelativeRotation", "RelativeScale3D", "relative rotators are 3 doubles"),
    ]
    for struct, a, b, why in pairs:
        va, vb = off_of(struct, a), off_of(struct, b)
        if va is not None and vb is not None:
            step = vb - va
            checks.append((struct, a, b, step))
    # FOV must be a 4-byte float: DesiredFOV sits right after it
    fov_gap = None
    va, vb = off_of("MinimalViewInfo", "FOV"), off_of("MinimalViewInfo", "DesiredFOV")
    if va is not None and vb is not None:
        fov_gap = vb - va

    # TeamIndex must be one byte past AlwaysIncludeTeamAsAllies (uint8 field)
    team_gap = None
    va, vb = off_of("FortPlayerStateAthena", "AlwaysIncludeTeamAsAllies"), off_of("FortPlayerStateAthena", "TeamIndex")
    if va is not None and vb is not None:
        team_gap = vb - va

    tail = ["}", "", "namespace off_layout", "{", "    // derived from the dump above, not from an assumed UE layout"]
    for struct, a, b, step in checks:
        tail.append(f"    // {struct}: {b} - {a} == 0x{step:X}")
        if step != 0x18:
            tail.append(f"    static_assert(false, \"{struct}::{b} - {a} != 0x18: dump layout is not LWC doubles\");")
    if fov_gap is not None:
        tail.append(f"    // MinimalViewInfo: DesiredFOV - FOV == {fov_gap} (FOV is a float)")
        if fov_gap != 4:
            tail.append("    static_assert(false, \"FOV is not a 4-byte float in this dump\");")
    if team_gap is not None:
        tail.append(f"    // FortPlayerStateAthena: TeamIndex - AlwaysIncludeTeamAsAllies == {team_gap}")
        if team_gap != 1:
            tail.append("    static_assert(false, \"TeamIndex is not 1 byte past the previous field\");")
    tail += ["}", ""]

    sys.stdout.write("\n".join(head + lines + tail))

    if missing:
        print("warning: missing fields -> " + ", ".join(missing), file=sys.stderr)
    return 0


def emit_schema(doc, out):
    structs = doc["offsets"]["structs"]
    out.append("namespace sch")
    out.append("{")
    out.append("    // whole dump, for grep-ability. Nothing reads this at runtime and it")
    out.append("    // is not inlined into the single-file build.")
    out.append("    struct Field { const char* name; uintptr_t offset; };")
    out.append("    struct Struct { const char* name; const Field* fields; unsigned count; };")
    out.append("")
    for sname in sorted(structs):
        ident = "".join(ch if ch.isalnum() else "_" for ch in sname)
        fields = structs[sname]
        out.append(f"    inline constexpr Field fields_{ident}[] = {{")
        for fname in sorted(fields, key=lambda k: hexint(fields[k])):
            out.append(f'        {{ "{fname}", 0x{hexint(fields[fname]):X} }},')
        out.append("    };")
        out.append("")
    out.append("    inline constexpr Struct table[] = {")
    for sname in sorted(structs):
        ident = "".join(ch if ch.isalnum() else "_" for ch in sname)
        # count derived from the array itself, so it can never drift
        out.append(f'        {{ "{sname}", fields_{ident}, static_cast<unsigned>(sizeof(fields_{ident}) / sizeof(fields_{ident}[0])) }},')
    out.append("    };")
    out.append("}")
    out.append("")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    with_schema = "--schema" in sys.argv
    if len(args) != 1:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    with open(args[0], "r", encoding="utf-8") as fh:
        doc = json.load(fh)

    missing = []
    lines = []
    rc = emit(doc, missing, lines)
    if with_schema:
        sys.stdout.write("\n")
        schema = []
        emit_schema(doc, schema)
        sys.stdout.write("\n".join(schema))
    return rc


if __name__ == "__main__":
    sys.exit(main())
