// ============================================================================
//  fortnite_external.cpp — user-mode external for Fortnite (UE5, v43.00 dump)
//
//  Originally a transcription of https://github.com/xetzzy/Fortnite-External-Source
//  (a WDM driver + a UIAccess overlay). This file is the user-mode half only:
//
//    * OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION)
//    * ReadProcessMemory for every read
//    * SendInput for the mouse
//    * D3D9Ex layered overlay + the small immediate-mode menu
//
//  No driver, no physical-memory reads, no writes into the game, no injection,
//  no syscall stubs, no token duplication — removed on purpose, not stubbed out.
//
//  Build (MSVC x64 Developer prompt, this folder):
//    cl /nologo /std:c++17 /O2 /EHsc /W3 /D_CRT_SECURE_NO_WARNINGS ^
//       fortnite_external.cpp /link /SUBSYSTEM:CONSOLE ^
//       /OUT:fortnite_external.exe ^
//       d3d9.lib dwmapi.lib user32.lib gdi32.lib psapi.lib winmm.lib
//
//  Cross build (Linux/macOS, zig or mingw-w64):
//    ../tools/syntax_check.py            # same compile, used as the CI gate
//
//  Offsets: offsets_gen.hpp, generated from tools/fortnite_offsets_43.00.json.
//  Regenerate per patch — never hand-edit the header:
//    python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json \
//        > fortnite-external/offsets_gen.hpp
//
//  Keys: INSERT menu · END unload · aim key (default RMB) HELD to aim
//  Nothing fires on launch: aimbot and visuals start disabled.
//
//  Run elevated; the game has to be windowed or borderless on the primary
//  monitor.
// ============================================================================

// lowercase on purpose: MinGW/zig on Linux is case-sensitive, MSVC is not
#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>     // EnumProcessModules
#include <dwmapi.h>
#include <d3d9.h>
#include <cstdint>
#include <cstddef>
#include <cmath>
#include <cfloat>
#include <cstdio>
#include <cstring>
#include <vector>

#pragma comment(lib, "d3d9.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "psapi.lib")
#pragma comment(lib, "winmm.lib")   // timeBeginPeriod(1): makes Sleep(4) mean 4ms

// ---------------------------------------------------------------------------
//  CONFIG — one place to tune. Menu overrides the mutable copies at runtime.
// ---------------------------------------------------------------------------
namespace cfg
{
    constexpr const wchar_t* kProcessName = L"FortniteClient-Win64-Shipping.exe";

    constexpr int   kTickMs        = 4;              // poll rate (Sleep floor per loop)
    constexpr int   kAimKey        = VK_RBUTTON;     // held
    constexpr int   kMenuKey       = VK_INSERT;      // toggle
    constexpr int   kExitKey       = VK_END;         // hard unload
    constexpr float kFovPx         = 150.f;          // screen radius, pixels
    constexpr float kAimSmoothing  = 5.f;            // higher = slower
    constexpr float kMaxScreenStep = 60.f;           // px per tick, no cross-screen snaps
    constexpr float kMinTargetPx   = 6.f;            // ignore targets closer than this to centre
    constexpr bool  kTeamCheck     = true;
    constexpr float kMaxTargetM    = 400.f;          // metres; beyond that it is stale data
    constexpr float kCapsuleHalfHeightFallback = 88.f;
    constexpr float kNearPlane     = 1.0;            // world units; behind this = discard

    // --- visibility -------------------------------------------------------
    // bRecentlyRendered (SkinnedMeshComponent 0x7E1) is a bitfield byte, and the
    // dump gives the byte but NOT the bit. 0x01 below is a guess, so the feature
    // is off by default and the bit is marked FILL.
    // FILL: read that byte on a pawn you can see and one behind cover; the bit
    //       that flips is the real one. Until then leave this false.
    constexpr bool    kVisibleOnly         = false;
    constexpr uint8_t kRecentlyRenderedBit = 0x01;   // FILL: unverified

    // --- bones ------------------------------------------------------------
    // Bone aiming needs the bone array: pointer, element stride and whether it
    // is bone-space or component-space. The dump carries neither the pointer nor
    // the stride, so this stays off and the aim point is derived from the
    // capsule (Pawn::BaseEyeHeight over FortPawn::CapsuleHalfHeightFortPawn).
    // FILL: see the BoneArray block in offsets_gen.hpp for the in-game recipe;
    //       then fill kTransformStride / kBoneTransformsAreFloat and flip this.
    constexpr bool  kBoneWorldLocations   = false;
    constexpr int   kHeadBone             = 109;     // FILL: verify index < NumBones
    constexpr uintptr_t kTransformStride  = 0x0;     // FILL: 0x60 (FTransform) or 0x30 (FTransform3f)
    constexpr bool  kBoneTransformsAreFloat = false; // FILL: FTransform3f vs FTransform

    // --- UWorld -----------------------------------------------------------
    // The dump has no globals section, so GWorld is unknown. Resolution order:
    //   1. argv --uworld 0x...          (validated, never trusted blindly)
    //   2. off::UWorld if the dump ever ships it
    //   3. bounded scan of the module's writable sections, chunked over several
    //      ticks and rate-limited — never a full-range sweep inside one tick
    constexpr uintptr_t kUWorldOverride    = 0x0;    // code default; --uworld wins
    constexpr bool      kAutoResolveUWorld = true;
    constexpr uintptr_t kScanChunkBytes    = 0x20000;   // 128 KiB per read
    constexpr int       kScanChunksPerStep = 8;         // 1 MiB per step, then yield
    constexpr int       kScanRetryMs       = 500;       // between scan steps
    constexpr int       kResolveRetryMs    = 2000;      // between re-resolve attempts
    constexpr size_t    kMaxScanSectionBytes = 0x8000000; // per section cap (128 MiB)
    // Only used if the PE headers cannot be read for some reason.
    constexpr uintptr_t kScanStartFallback = 0x8000000;
    constexpr uintptr_t kScanEndFallback   = 0x20000000;

    constexpr int   kFontPx        = 14;
    constexpr int   kMaxPlayers    = 256;
    constexpr int   kMaxChainDepth = 16;
    constexpr const char* kConfigPath = "fortnite_external.cfg.json";
}

// ---------------------------------------------------------------------------
//  OFFSETS — generated from the v43.00 dump. Do not hand-edit the header.
// ---------------------------------------------------------------------------
#include "offsets_gen.hpp"

// ---------------------------------------------------------------------------
//  settings (runtime copies the menu mutates; defaults are all "off")
// ---------------------------------------------------------------------------
namespace settings
{
    inline int width  = 0;
    inline int height = 0;
    inline int center_x = 0;
    inline int center_y = 0;

    inline bool show_menu = true;
    inline int  tab = 0;

    namespace aimbot
    {
        inline bool  enable     = false;
        inline bool  show_fov   = false;
        inline float fov        = cfg::kFovPx;
        inline float smoothness = cfg::kAimSmoothing;
        inline int   aim_key    = cfg::kAimKey;
    }
    namespace visuals
    {
        inline bool enable     = false;
        inline bool box        = false;
        inline bool fill_box   = false;
        inline bool line       = false;
        inline bool distance   = false;
        inline bool health_bar = false;
    }
}

// ---------------------------------------------------------------------------
//  process access — one handle, closed on every exit path
// ---------------------------------------------------------------------------
class Mem
{
public:
    DWORD     pid  = 0;
    uintptr_t base = 0;

    Mem() = default;
    Mem(const Mem&) = delete;
    Mem& operator=(const Mem&) = delete;

    ~Mem() { detach(); }

    bool attach(const wchar_t* process_name)
    {
        detach();

        pid = find_pid(process_name);
        if (!pid) return false;

        hproc = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, FALSE, pid);
        if (!hproc) return false;

        HMODULE mods[1024];
        DWORD needed = 0;
        if (!EnumProcessModules(hproc, mods, sizeof(mods), &needed) || needed < sizeof(HMODULE))
        {
            detach();
            return false;
        }

        base = reinterpret_cast<uintptr_t>(mods[0]);
        if (!base)
        {
            detach();
            return false;
        }
        return true;
    }

    void detach()
    {
        if (hproc)
        {
            CloseHandle(hproc);
            hproc = nullptr;
        }
        pid = 0;
        base = 0;
    }

    bool alive() const { return hproc != nullptr && pid != 0 && base != 0; }

    // Every read reports failure. Callers must not use `out` when this is false.
    template <typename T>
    bool read(uintptr_t address, T& out) const
    {
        out = T{};
        if (!plausible(address) || address > UINTPTR_MAX - sizeof(T)) return false;

        SIZE_T got = 0;
        if (!ReadProcessMemory(hproc, reinterpret_cast<LPCVOID>(address), &out, sizeof(T), &got))
            return false;
        if (got != sizeof(T))
        {
            out = T{};
            return false;
        }
        return true;
    }

    bool read_raw(uintptr_t address, void* buffer, SIZE_T size) const
    {
        if (!plausible(address) || !buffer || size == 0) return false;
        if (address > UINTPTR_MAX - size) return false;

        SIZE_T got = 0;
        if (!ReadProcessMemory(hproc, reinterpret_cast<LPCVOID>(address), buffer, size, &got))
            return false;
        return got == size;
    }

    // Any address we are willing to hand to ReadProcessMemory. Alignment is NOT
    // required: TeamIndex (0xF81) and bRecentlyRendered (0x7E1) are byte fields
    // at unaligned offsets, and demanding 8-byte alignment silently broke both.
    static bool plausible(uintptr_t p)
    {
        return p > 0x10000 && p < 0x7FFFFFFFFFFFULL;
    }

    // A value we are willing to treat as a pointer: range plus pointer alignment.
    static bool plausible_ptr(uintptr_t p)
    {
        return p > 0x10000 && p < 0x7FFFFFFFFFFFULL && (p % sizeof(void*)) == 0;
    }

private:
    HANDLE hproc = nullptr;

    static DWORD find_pid(const wchar_t* name)
    {
        HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snap == INVALID_HANDLE_VALUE) return 0;

        PROCESSENTRY32W pe{};
        pe.dwSize = sizeof(pe);
        DWORD found = 0;
        if (Process32FirstW(snap, &pe))
        {
            do {
                if (_wcsicmp(pe.szExeFile, name) == 0) { found = pe.th32ProcessID; break; }
            } while (Process32NextW(snap, &pe));
        }
        CloseHandle(snap);
        return found;
    }
};

inline Mem mem;

// ---------------------------------------------------------------------------
//  input — SendInput only. MOUSEEVENTF_MOVE with accumulated sub-pixel residue.
// ---------------------------------------------------------------------------
namespace input
{
    inline double acc_x = 0.0;
    inline double acc_y = 0.0;

    inline bool move_mouse(double dx, double dy)
    {
        if (!std::isfinite(dx) || !std::isfinite(dy)) return false;

        // clamp per call so a bad frame can never fling the cursor across the desk
        if (dx > 400.0) dx = 400.0; else if (dx < -400.0) dx = -400.0;
        if (dy > 400.0) dy = 400.0; else if (dy < -400.0) dy = -400.0;

        acc_x += dx;
        acc_y += dy;

        const int mx = static_cast<int>(acc_x);
        const int my = static_cast<int>(acc_y);
        if (mx == 0 && my == 0) return true;

        acc_x -= mx;
        acc_y -= my;

        INPUT in{};
        in.type       = INPUT_MOUSE;
        in.mi.dx      = mx;
        in.mi.dy      = my;
        in.mi.dwFlags = MOUSEEVENTF_MOVE;
        return SendInput(1, &in, sizeof(in)) == 1;
    }
}

// ---------------------------------------------------------------------------
//  math + SDK (doubles end to end: this dump is LWC)
// ---------------------------------------------------------------------------
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

struct Vector2
{
    double x = 0, y = 0;
    Vector2() = default;
    Vector2(double _x, double _y) : x(_x), y(_y) {}
};

struct Vector3
{
    double x = 0, y = 0, z = 0;

    Vector3() = default;
    Vector3(double _x, double _y, double _z) : x(_x), y(_y), z(_z) {}

    double dot(const Vector3& v) const { return x * v.x + y * v.y + z * v.z; }

    double distance(const Vector3& v) const
    {
        const double dx = v.x - x, dy = v.y - y, dz = v.z - z;
        return std::sqrt(dx * dx + dy * dy + dz * dz);
    }

    Vector3 operator-(const Vector3& v) const { return Vector3(x - v.x, y - v.y, z - v.z); }
    Vector3 operator+(const Vector3& v) const { return Vector3(x + v.x, y + v.y, z + v.z); }
};

// MinimalViewInfo: Location +0x00, Rotation +0x18, FOV +0x30 — three doubles per
// vector, three per rotator. That spacing is asserted in offsets_gen.hpp, so a
// dump with a different layout fails the build instead of skewing the W2S.
static_assert(sizeof(Vector3) == 0x18, "Vector3 must be 3 doubles");

struct Rotator
{
    double pitch = 0, yaw = 0, roll = 0;
};
static_assert(sizeof(Rotator) == 0x18, "Rotator must be 3 doubles");

// Column-in-row storage: translation lives in row 3 (row-vector convention,
// p' = p * M), which is what the attach-chain compose below assumes.
struct Mat4
{
    double m[4][4]{};
};

inline Mat4 identity_matrix()
{
    Mat4 m{};
    m.m[0][0] = m.m[1][1] = m.m[2][2] = m.m[3][3] = 1.0;
    return m;
}

inline Mat4 matrix_multiplication(const Mat4& a, const Mat4& b)
{
    Mat4 o{};
    for (int r = 0; r < 4; ++r)
        for (int c = 0; c < 4; ++c)
        {
            double sum = 0.0;
            for (int k = 0; k < 4; ++k) sum += a.m[r][k] * b.m[k][c];
            o.m[r][c] = sum;
        }
    return o;
}

inline bool finite_mat(const Mat4& m)
{
    for (int r = 0; r < 4; ++r)
        for (int c = 0; c < 4; ++c)
            if (!std::isfinite(m.m[r][c])) return false;
    return true;
}

inline Mat4 rotation_matrix(const Rotator& rot)
{
    // Unreal rotator (pitch, yaw, roll) in degrees -> basis rows.
    const double p = rot.pitch * M_PI / 180.0;
    const double y = rot.yaw   * M_PI / 180.0;
    const double r = rot.roll  * M_PI / 180.0;

    const double sp = std::sin(p), cp = std::cos(p);
    const double sy = std::sin(y), cy = std::cos(y);
    const double sr = std::sin(r), cr = std::cos(r);

    Mat4 m = identity_matrix();
    // X = forward, Y = right, Z = up
    m.m[0][0] = cp * cy;              m.m[0][1] = cp * sy;              m.m[0][2] = sp;
    m.m[1][0] = sr * sp * cy - cr * sy; m.m[1][1] = sr * sp * sy + cr * cy; m.m[1][2] = -sr * cp;
    m.m[2][0] = cr * sp * cy + sr * sy; m.m[2][1] = cy * sr - cr * sp * sy; m.m[2][2] = cr * cp;
    return m;
}

// Local transform of a SceneComponent: T * R * S with the translation in row 3.
inline Mat4 local_transform_matrix(const Vector3& location, const Rotator& rotation, const Vector3& scale)
{
    Mat4 out = rotation_matrix(rotation);

    out.m[0][0] *= scale.x; out.m[0][1] *= scale.x; out.m[0][2] *= scale.x;
    out.m[1][0] *= scale.y; out.m[1][1] *= scale.y; out.m[1][2] *= scale.y;
    out.m[2][0] *= scale.z; out.m[2][1] *= scale.z; out.m[2][2] *= scale.z;

    out.m[3][0] = location.x;
    out.m[3][1] = location.y;
    out.m[3][2] = location.z;
    return out;
}

// Playable-world sanity box. UE5 LWC doubles can hold far more than this, so
// anything outside means we read stale or wrong memory.
inline bool valid_vector(const Vector3& v, double limit = 500000.0)
{
    return std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z) &&
           std::fabs(v.x) < limit && std::fabs(v.y) < limit && std::fabs(v.z) < limit;
}

inline bool valid_rotator(const Rotator& r)
{
    return std::isfinite(r.pitch) && std::isfinite(r.yaw) && std::isfinite(r.roll) &&
           std::fabs(r.pitch) <= 90.5 && std::fabs(r.yaw) <= 360.5 && std::fabs(r.roll) <= 360.5;
}

inline bool valid_scale(const Vector3& s)
{
    return std::isfinite(s.x) && std::isfinite(s.y) && std::isfinite(s.z) &&
           std::fabs(s.x) > 1e-6 && std::fabs(s.y) > 1e-6 && std::fabs(s.z) > 1e-6 &&
           std::fabs(s.x) < 1000.0 && std::fabs(s.y) < 1000.0 && std::fabs(s.z) < 1000.0;
}

struct Camera
{
    Vector3 location;
    Rotator rotation;
    double  fov = 90.0;
    bool    valid = false;
};

namespace cache
{
    inline uintptr_t uworld = 0;
    inline uintptr_t game_instance = 0;
    inline uintptr_t local_players = 0;
    inline uintptr_t player_controller = 0;
    inline uintptr_t local_pawn = 0;
    inline uintptr_t player_state = 0;
    inline uintptr_t game_state = 0;
    inline uintptr_t player_array = 0;
    inline int       player_count = 0;

    inline Vector3   local_origin;      // capsule centre of the local pawn
    inline int       my_team_id = 0;
    inline bool      my_team_valid = false;

    inline double    closest_distance = DBL_MAX;
    inline uintptr_t closest_mesh = 0;
    inline uintptr_t closest_pawn = 0;

    inline Camera    camera;            // refreshed once per tick

    inline bool      uworld_ready = false;
    inline ULONGLONG last_resolve_ms = 0;
}

// ---------------------------------------------------------------------------
//  component transforms — world = compose(attach chain), no ComponentToWorld
//  field in this dump (SceneComponent exposes only the relative block)
// ---------------------------------------------------------------------------
inline bool read_relative_block(uintptr_t component, Vector3& loc, Rotator& rot, Vector3& scale)
{
    // three doubles per field, spacing asserted in offsets_gen.hpp
    if (!mem.read(component + off::RelativeLocation, loc)) return false;
    if (!mem.read(component + off::RelativeRotation, rot)) return false;
    if (!mem.read(component + off::RelativeScale3D, scale)) return false;

    return valid_vector(loc) && valid_rotator(rot) && valid_scale(scale);
}

inline bool build_component_to_world(uintptr_t component, Mat4& world)
{
    world = identity_matrix();
    if (!mem.alive() || !Mem::plausible_ptr(component)) return false;

    Mat4 chain[cfg::kMaxChainDepth];
    int depth = 0;
    uintptr_t current = component;

    while (current && depth < cfg::kMaxChainDepth)
    {
        Vector3 loc, scale;
        Rotator rot;
        if (!read_relative_block(current, loc, rot, scale)) break;

        chain[depth++] = local_transform_matrix(loc, rot, scale);

        uintptr_t parent = 0;
        if (!mem.read(current + off::AttachParent, parent)) break;
        if (parent && !Mem::plausible_ptr(parent)) break;
        current = parent;
    }

    if (depth == 0) return false;

    // chain[0] is the deepest component; the root cap is applies last
    for (int i = depth - 1; i >= 0; --i)
        world = matrix_multiplication(chain[i], world);

    return finite_mat(world);
}

inline bool component_world_location(uintptr_t component, Vector3& out)
{
    Mat4 world;
    if (!build_component_to_world(component, world)) return false;

    out = Vector3(world.m[3][0], world.m[3][1], world.m[3][2]);
    return valid_vector(out);
}

// Bone path. Disabled by default (cfg::kBoneWorldLocations): the dump does not
// say whether CachedBoneSpaceTransforms is bone-space or component-space, nor
// whether the stride is FTransform (0x60) or FTransform3f (0x30).
// FILL: see the BoneArray block in offsets_gen.hpp — then set kTransformStride,
//       kBoneTransformsAreFloat and flip kBoneWorldLocations.
inline bool bone_component_location(uintptr_t mesh, int bone_id, Vector3& out)
{
    if (!cfg::kBoneWorldLocations) return false;
    if (!mem.alive() || !mesh || bone_id < 0) return false;
    if (cfg::kTransformStride < 0x20) return false;      // stride not filled in yet

    // Preferred: the real bone array pointer if someone dumps it into off::BoneArray.
    // Fallback: CachedComponentSpaceTransforms (a TArray; its data pointer is at
    // the field offset). Component space is what we can use without a per-bone
    // parent walk, which this dump does not give us.
    uintptr_t array = 0;
    const uintptr_t field = off::BoneArray ? off::BoneArray : off::ComponentSpaceTransforms;
    if (!mem.read(mesh + field, array)) return false;
    if (!Mem::plausible_ptr(array)) return false;

    const uintptr_t at = array + static_cast<uintptr_t>(bone_id) * cfg::kTransformStride;
    if (!Mem::plausible(at)) return false;

    Vector3 translation;
    Vector3 scale(1.0, 1.0, 1.0);

    if (cfg::kBoneTransformsAreFloat)
    {
        float t[3] = { 0, 0, 0 };
        if (!mem.read_raw(at + 0x10, t, sizeof(t))) return false;
        translation = Vector3(t[0], t[1], t[2]);

        float s[3] = { 1, 1, 1 };
        if (mem.read_raw(at + 0x20, s, sizeof(s))) scale = Vector3(s[0], s[1], s[2]);
    }
    else
    {
        if (!mem.read(at + 0x20, translation)) return false;
        if (!mem.read(at + 0x40, scale)) return false;
    }

    if (!valid_vector(translation) || !valid_scale(scale)) return false;

    out = translation;
    return valid_vector(out);
}

inline bool bone_world_location(uintptr_t mesh, int bone_id, Vector3& out)
{
    Vector3 local;
    if (!bone_component_location(mesh, bone_id, local)) return false;

    Mat4 c2w;
    if (!build_component_to_world(mesh, c2w)) return false;

    // row-vector: p_world = p_local * component_to_world
    const double x = local.x * c2w.m[0][0] + local.y * c2w.m[1][0] + local.z * c2w.m[2][0] + c2w.m[3][0];
    const double y = local.x * c2w.m[0][1] + local.y * c2w.m[1][1] + local.z * c2w.m[2][1] + c2w.m[3][1];
    const double z = local.x * c2w.m[0][2] + local.y * c2w.m[1][2] + local.z * c2w.m[2][2] + c2w.m[3][2];

    out = Vector3(x, y, z);
    return valid_vector(out);
}

// ---------------------------------------------------------------------------
//  camera + projection
// ---------------------------------------------------------------------------
inline Camera get_view_point()
{
    Camera view{};

    if (!mem.alive() || !Mem::plausible_ptr(cache::player_controller)) return view;

    uintptr_t camera_manager = 0;
    if (!mem.read(cache::player_controller + off::PlayerCameraManager, camera_manager)) return view;
    if (!Mem::plausible_ptr(camera_manager)) return view;

    // FCameraCacheEntry { double Timestamp @0x00; FMinimalViewInfo POV @0x10; }
    const uintptr_t pov = camera_manager + off::CameraCachePrivate + off::CameraPOV;

    Vector3 location, rotation;
    float   fov = 0.f;      // float, not double: FOV 0x30 / DesiredFOV 0x34 in the dump

    if (!mem.read(pov + off::CameraLocation, location)) return view;
    if (!mem.read(pov + off::CameraRotation, rotation)) return view;
    if (!mem.read(pov + off::CameraFOV, fov)) return view;

    if (!valid_vector(location)) return view;
    if (!std::isfinite(rotation.x) || !std::isfinite(rotation.y) || !std::isfinite(rotation.z)) return view;

    // FOV is horizontal degrees; outside this it is a read from the wrong offset
    if (!std::isfinite(fov) || fov <= 1.f || fov >= 180.f) return view;

    view.location = location;
    view.rotation.pitch = rotation.x;   // rotation is stored as (pitch, yaw, roll)
    view.rotation.yaw   = rotation.y;
    view.rotation.roll  = rotation.z;
    view.fov = static_cast<double>(fov);
    view.valid = valid_rotator(view.rotation);
    return view;
}

// World -> screen. UE basis (X forward, Y right, Z up), camera rotator projected
// onto its own axes, screen Y flipped. Returns false for anything at or behind
// the near plane instead of clamping depth to 1 (which used to draw targets
// behind the player as if they were in front).
inline bool project_world_to_screen(const Vector3& world, Vector2& out,
                                    const Camera& camera = cache::camera)
{
    if (!camera.valid) return false;
    if (settings::center_x <= 0 || settings::center_y <= 0) return false;
    if (!valid_vector(world)) return false;

    const Mat4 basis = rotation_matrix(camera.rotation);

    const Vector3 axis_forward(basis.m[0][0], basis.m[0][1], basis.m[0][2]);
    const Vector3 axis_right  (basis.m[1][0], basis.m[1][1], basis.m[1][2]);
    const Vector3 axis_up     (basis.m[2][0], basis.m[2][1], basis.m[2][2]);

    const Vector3 delta = world - camera.location;

    const double forward = delta.dot(axis_forward);
    if (!(forward > cfg::kNearPlane)) return false;    // behind or on the camera plane

    const double right = delta.dot(axis_right);
    const double up    = delta.dot(axis_up);

    const double focal = (settings::center_x / std::tan(camera.fov * M_PI / 360.0));
    if (!std::isfinite(focal) || focal <= 0.0) return false;

    const double sx = settings::center_x + right * focal / forward;
    const double sy = settings::center_y - up    * focal / forward;

    if (!std::isfinite(sx) || !std::isfinite(sy)) return false;

    out = Vector2(sx, sy);
    return true;
}

// bRecentlyRendered bit — FILL, see cfg::kVisibleOnly
inline bool is_visible(uintptr_t mesh)
{
    if (!mesh || !mem.alive()) return false;

    uint8_t flags = 0;
    if (!mem.read(mesh + off::RecentlyRendered, flags)) return false;
    return (flags & cfg::kRecentlyRenderedBit) != 0;
}

// ---------------------------------------------------------------------------
//  UWorld resolution — validated offset first, bounded chunked scan second
// ---------------------------------------------------------------------------
inline bool looks_like_uworld(uintptr_t candidate)
{
    if (!Mem::plausible_ptr(candidate)) return false;

    uintptr_t game_instance = 0, local_players = 0, game_state = 0, player_array = 0;

    if (!mem.read(candidate + off::GameInstance, game_instance)) return false;
    if (!Mem::plausible_ptr(game_instance)) return false;

    if (!mem.read(game_instance + off::LocalPlayers, local_players)) return false;
    if (!Mem::plausible_ptr(local_players)) return false;

    if (!mem.read(candidate + off::GameState, game_state)) return false;
    if (!Mem::plausible_ptr(game_state)) return false;

    // GameStateBase::PlayerArray is a TArray: its data pointer must be readable
    if (!mem.read(game_state + off::PlayerArray, player_array)) return false;
    if (!Mem::plausible_ptr(player_array)) return false;

    return true;
}

struct ScanSection
{
    uintptr_t start;
    size_t    size;
};

namespace scanner
{
    inline std::vector<ScanSection> sections;
    inline size_t    index = 0;
    inline uintptr_t cursor = 0;
    inline bool      prepared = false;
    inline bool      exhausted = false;
    inline ULONGLONG next_step_ms = 0;

    inline ULONGLONG now_ms()
    {
        return GetTickCount64();
    }

    inline bool prepare(uintptr_t module_base)
    {
        sections.clear();
        index = 0;
        cursor = 0;
        exhausted = false;
        prepared = true;

        IMAGE_DOS_HEADER dos{};
        if (!mem.read_raw(module_base, &dos, sizeof(dos)) || dos.e_magic != IMAGE_DOS_SIGNATURE)
        {
            sections.push_back({ cfg::kScanStartFallback, cfg::kScanEndFallback - cfg::kScanStartFallback });
            return true;
        }

        IMAGE_NT_HEADERS64 nt{};
        if (!mem.read_raw(module_base + static_cast<uintptr_t>(dos.e_lfanew), &nt, sizeof(nt)) ||
            nt.Signature != IMAGE_NT_SIGNATURE)
        {
            sections.push_back({ cfg::kScanStartFallback, cfg::kScanEndFallback - cfg::kScanStartFallback });
            return true;
        }

        const uintptr_t section_table = module_base + static_cast<uintptr_t>(dos.e_lfanew) +
            FIELD_OFFSET(IMAGE_NT_HEADERS64, OptionalHeader) + nt.FileHeader.SizeOfOptionalHeader;

        for (WORD i = 0; i < nt.FileHeader.NumberOfSections; ++i)
        {
            IMAGE_SECTION_HEADER sh{};
            if (!mem.read_raw(section_table + i * sizeof(IMAGE_SECTION_HEADER), &sh, sizeof(sh))) break;
            if (!(sh.Characteristics & IMAGE_SCN_MEM_WRITE)) continue;

            size_t size = sh.Misc.VirtualSize ? sh.Misc.VirtualSize : sh.SizeOfRawData;
            if (!size) continue;
            if (size > cfg::kMaxScanSectionBytes) size = cfg::kMaxScanSectionBytes;

            sections.push_back({ module_base + sh.VirtualAddress, size });
        }

        if (sections.empty())
            sections.push_back({ cfg::kScanStartFallback, cfg::kScanEndFallback - cfg::kScanStartFallback });

        size_t total = 0;
        for (const auto& s : sections) total += s.size;
        printf("[*] UWorld scan prepared: %zu writable section(s), %.1f MiB total\n",
               sections.size(), static_cast<double>(total) / (1024.0 * 1024.0));
        return true;
    }

    // One bounded step: up to cfg::kScanChunksPerStep chunks, then yields.
    // Returns 0 when nothing was found (yet, or ever — check `exhausted`).
    inline uintptr_t step(uintptr_t module_base)
    {
        if (!mem.alive()) return 0;

        if (!prepared && !prepare(module_base)) return 0;
        if (exhausted) return 0;

        const ULONGLONG now = now_ms();
        if (now < next_step_ms) return 0;
        next_step_ms = now + cfg::kScanRetryMs;

        static uint8_t buffer[0x20000];

        for (int chunk = 0; chunk < cfg::kScanChunksPerStep; ++chunk)
        {
            while (index < sections.size())
            {
                const ScanSection& sec = sections[index];
                const uintptr_t end = sec.start + sec.size;

                if (cursor < sec.start) cursor = sec.start;
                if (cursor >= end)
                {
                    ++index;
                    cursor = 0;
                    continue;
                }

                size_t want = static_cast<size_t>(end - cursor);
                if (want > cfg::kScanChunkBytes) want = cfg::kScanChunkBytes;
                if (want > sizeof(buffer)) want = sizeof(buffer);

                // A failed read skips just that range (unmapped page), it does
                // not abort the step and it is never treated as data. One retry
                // at 4 KiB granularity so a single bad page cannot hide a hit.
                size_t scanned = 0;
                while (scanned < want)
                {
                    const uintptr_t at = cursor + scanned;
                    size_t len = want - scanned;
                    if (len > 0x1000) len = 0x1000;

                    if (mem.read_raw(at, buffer, len))
                    {
                        for (size_t offset = 0; offset + sizeof(uintptr_t) <= len; offset += sizeof(uintptr_t))
                        {
                            uintptr_t value = 0;
                            memcpy(&value, buffer + offset, sizeof(value));
                            if (!Mem::plausible_ptr(value)) continue;

                            if (looks_like_uworld(value))
                            {
                                const uintptr_t hit = at + offset;
                                printf("[*] UWorld resolved by scan: base+0x%llX -> 0x%llX\n",
                                       static_cast<unsigned long long>(hit - module_base),
                                       static_cast<unsigned long long>(value));
                                return value;
                            }
                        }
                    }
                    scanned += len;
                }

                cursor += want;
                break;      // next chunk
            }

            if (index >= sections.size())
            {
                exhausted = true;
                printf("[!] UWorld scan finished with no hit. Use --uworld 0x... (see README)\n");
                return 0;
            }
        }

        return 0;
    }
}

inline uintptr_t resolve_uworld()
{
    if (!mem.alive()) return 0;

    // 1 + 2: a validated offset, if we have one
    if (off::UWorld)
    {
        uintptr_t world = 0;
        if (mem.read(mem.base + off::UWorld, world) && looks_like_uworld(world))
            return world;
    }
    if (cfg::kUWorldOverride)
    {
        uintptr_t world = 0;
        if (mem.read(mem.base + cfg::kUWorldOverride, world) && looks_like_uworld(world))
            return world;
    }

    // 3: bounded scan
    if (cfg::kAutoResolveUWorld)
        return scanner::step(mem.base);

    return 0;
}

// ---------------------------------------------------------------------------
//  overlay window (topmost, click-through unless the menu is open)
// ---------------------------------------------------------------------------
namespace overlay
{
    inline IDirect3D9Ex*       d3d = nullptr;
    inline IDirect3DDevice9Ex* device = nullptr;
    inline D3DPRESENT_PARAMETERS params{};
    inline HWND hwnd = nullptr;
    inline HWND game_wnd = nullptr;
    inline bool running = true;
    inline bool device_ok = false;

    inline LRESULT CALLBACK wnd_proc(HWND h, UINT msg, WPARAM wp, LPARAM lp)
    {
        switch (msg)
        {
        case WM_ERASEBKGND: return 1;
        case WM_DESTROY:    PostQuitMessage(0); return 0;
        default:            return DefWindowProcA(h, msg, wp, lp);
        }
    }

    inline int click_through_applied = -1;       // -1 = unknown, re-applied per window

    inline void set_click_through(bool click_through)
    {
        if (!hwnd) return;

        const int want = click_through ? 1 : 0;
        if (click_through_applied == want) return;
        click_through_applied = want;

        LONG_PTR ex = GetWindowLongPtrA(hwnd, GWL_EXSTYLE);
        ex |= WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE;
        if (click_through) ex |= WS_EX_TRANSPARENT;
        else               ex &= ~static_cast<LONG_PTR>(WS_EX_TRANSPARENT);

        SetWindowLongPtrA(hwnd, GWL_EXSTYLE, ex);
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                     SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }

    inline bool create_window()
    {
        WNDCLASSEXA wc{};
        wc.cbSize        = sizeof(wc);
        wc.style         = CS_VREDRAW | CS_HREDRAW;
        wc.lpfnWndProc   = wnd_proc;
        wc.hInstance     = GetModuleHandleA(nullptr);
        wc.hIcon         = LoadIcon(nullptr, IDI_APPLICATION);
        wc.hCursor       = LoadCursor(nullptr, IDC_ARROW);
        wc.lpszClassName = "overlay_class";

        if (!RegisterClassExA(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
        {
            printf("[!] RegisterClassExA failed (%lu)\n", GetLastError());
            return false;
        }

        hwnd = CreateWindowExA(WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE |
                               (settings::show_menu ? 0 : WS_EX_TRANSPARENT),
                               wc.lpszClassName, "overlay", WS_POPUP,
                               0, 0, settings::width, settings::height,
                               nullptr, nullptr, wc.hInstance, nullptr);
        if (!hwnd)
        {
            printf("[!] CreateWindowExA failed (%lu)\n", GetLastError());
            return false;
        }

        // Per-pixel alpha comes from the DWM-composited frame (the A channel of the
        // backbuffer). If that is unavailable, fall back to a black colour key so
        // the window is still see-through rather than an opaque black rectangle.
        MARGINS margins = { -1, -1, -1, -1 };
        const HRESULT hr = DwmExtendFrameIntoClientArea(hwnd, &margins);
        if (FAILED(hr))
        {
            printf("[!] DwmExtendFrameIntoClientArea failed (0x%08lX), using colour key\n",
                   static_cast<unsigned long>(hr));
            if (!SetLayeredWindowAttributes(hwnd, RGB(0, 0, 0), 0, LWA_COLORKEY))
                printf("[!] SetLayeredWindowAttributes(COLORKEY) failed (%lu)\n", GetLastError());
        }
        else if (!SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA))
        {
            printf("[!] SetLayeredWindowAttributes(ALPHA) failed (%lu)\n", GetLastError());
        }

        click_through_applied = -1;
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        UpdateWindow(hwnd);
        return true;
    }

    inline void destroy_window()
    {
        if (hwnd)
        {
            DestroyWindow(hwnd);
            hwnd = nullptr;
        }
        click_through_applied = -1;
    }

    inline bool init_device()
    {
        HRESULT hr = Direct3DCreate9Ex(D3D_SDK_VERSION, &d3d);
        if (FAILED(hr) || !d3d)
        {
            printf("[!] Direct3DCreate9Ex failed (0x%08lX)\n", static_cast<unsigned long>(hr));
            d3d = nullptr;
            return false;
        }

        ZeroMemory(&params, sizeof(params));
        params.Windowed               = TRUE;
        params.SwapEffect             = D3DSWAPEFFECT_DISCARD;
        params.hDeviceWindow          = hwnd;
        params.MultiSampleType        = D3DMULTISAMPLE_NONE;
        params.BackBufferFormat       = D3DFMT_A8R8G8B8;
        params.BackBufferWidth        = static_cast<UINT>(settings::width);
        params.BackBufferHeight       = static_cast<UINT>(settings::height);
        params.EnableAutoDepthStencil = FALSE;
        params.PresentationInterval    = D3DPRESENT_INTERVAL_IMMEDIATE;

        hr = d3d->CreateDeviceEx(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, hwnd,
                                 D3DCREATE_HARDWARE_VERTEXPROCESSING,
                                 &params, nullptr, &device);
        if (FAILED(hr))
        {
            printf("[!] CreateDeviceEx(HAL) failed (0x%08lX), retrying software vertex processing\n",
                   static_cast<unsigned long>(hr));
            hr = d3d->CreateDeviceEx(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, hwnd,
                                     D3DCREATE_SOFTWARE_VERTEXPROCESSING,
                                     &params, nullptr, &device);
        }
        if (FAILED(hr) || !device)
        {
            printf("[!] CreateDeviceEx failed (0x%08lX)\n", static_cast<unsigned long>(hr));
            device = nullptr;
            if (d3d) { d3d->Release(); d3d = nullptr; }
            return false;
        }

        device_ok = true;
        return true;
    }

    inline void release_font();

    inline void destroy_device()
    {
        release_font();
        if (device) { device->Release(); device = nullptr; }
        if (d3d)    { d3d->Release(); d3d = nullptr; }
        device_ok = false;
    }

    inline HWND find_process_window(DWORD pid)
    {
        struct Ctx { HWND hwnd; DWORD pid; } ctx{ nullptr, pid };

        EnumWindows([](HWND h, LPARAM lp) -> BOOL {
            auto* c = reinterpret_cast<Ctx*>(lp);
            DWORD owner = 0;
            GetWindowThreadProcessId(h, &owner);
            if (owner == c->pid && IsWindowVisible(h) && GetWindow(h, GW_OWNER) == nullptr)
            {
                c->hwnd = h;
                return FALSE;
            }
            return TRUE;
        }, reinterpret_cast<LPARAM>(&ctx));

        return ctx.hwnd;
    }
}

// ---------------------------------------------------------------------------
//  glyph atlas + immediate-mode draw list
// ---------------------------------------------------------------------------
namespace draw
{
    namespace atlas
    {
        constexpr int kWidth  = 512;
        constexpr int kHeight = 512;
    }

    struct Glyph
    {
        float u0 = 0, v0 = 0, u1 = 0, v1 = 0;
        float w = 0, h = 0, adv = 0;
    };

    struct Font
    {
        IDirect3DTexture9* tex = nullptr;
        Glyph  glyphs[96];
        float  line_h = 0;
    };

    struct Vertex
    {
        float x, y, z, rhw;
        DWORD color;
        float u, v;
    };

    constexpr DWORD kFvf = D3DFVF_XYZRHW | D3DFVF_DIFFUSE | D3DFVF_TEX1;

    inline std::vector<Vertex> flat_verts;
    inline std::vector<Vertex> text_verts;
    inline Font font;

    // GDI glyph atlas: draw ASCII into a DIB section, upload coverage as alpha.
    struct FontBuilder
    {
        HDC      dc = nullptr;
        HDC      screen_dc = nullptr;
        HBITMAP  dib = nullptr;
        HGDIOBJ  old_bitmap = nullptr;
        HFONT    hfont = nullptr;
        void*    bits = nullptr;
        int      cell_h = 0;

        bool begin(int px, const char* face)
        {
            screen_dc = GetDC(nullptr);
            if (!screen_dc) return false;

            dc = CreateCompatibleDC(screen_dc);
            if (!dc) return false;

            BITMAPINFO bmi{};
            bmi.bmiHeader.biSize        = sizeof(BITMAPINFOHEADER);
            bmi.bmiHeader.biWidth       = atlas::kWidth;
            bmi.bmiHeader.biHeight      = -atlas::kHeight;
            bmi.bmiHeader.biPlanes      = 1;
            bmi.bmiHeader.biBitCount    = 32;
            bmi.bmiHeader.biCompression = BI_RGB;

            dib = CreateDIBSection(dc, &bmi, DIB_RGB_COLORS, &bits, nullptr, 0);
            if (!dib || !bits) return false;

            old_bitmap = SelectObject(dc, reinterpret_cast<HGDIOBJ>(dib));
            memset(bits, 0, static_cast<size_t>(atlas::kWidth) * atlas::kHeight * 4);

            hfont = CreateFontA(px, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                                OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS, ANTIALIASED_QUALITY,
                                DEFAULT_PITCH | FF_DONTCARE, face);
            if (!hfont) return false;
            SelectObject(dc, reinterpret_cast<HGDIOBJ>(hfont));

            SetBkMode(dc, TRANSPARENT);
            SetTextColor(dc, RGB(255, 255, 255));

            TEXTMETRICA tm{};
            if (!GetTextMetricsA(dc, &tm)) return false;
            cell_h = tm.tmHeight + 2;
            return true;
        }

        void end()
        {
            if (dc && hfont)
            {
                SelectObject(dc, static_cast<HGDIOBJ>(GetStockObject(SYSTEM_FONT)));
                DeleteObject(reinterpret_cast<HGDIOBJ>(hfont));
                hfont = nullptr;
            }
            if (dib)
            {
                if (dc && old_bitmap) SelectObject(dc, old_bitmap);
                DeleteObject(reinterpret_cast<HGDIOBJ>(dib));
                dib = nullptr;
            }
            if (dc) { DeleteDC(dc); dc = nullptr; }
            if (screen_dc) { ReleaseDC(nullptr, screen_dc); screen_dc = nullptr; }
            bits = nullptr;
            old_bitmap = nullptr;
        }

        ~FontBuilder() { end(); }
    };

    // D3DPOOL_DEFAULT + D3DUSAGE_DYNAMIC, so the texture has to be released
    // before Reset and recreated after — overlay::handle_reset does that.
    inline bool create_font(IDirect3DDevice9* dev, Font& f, int px, const char* face)
    {
        if (!dev) return false;

        if (f.tex) { f.tex->Release(); f.tex = nullptr; }
        ZeroMemory(f.glyphs, sizeof(f.glyphs));
        f.line_h = 0;

        FontBuilder builder;
        if (!builder.begin(px, face))
        {
            builder.end();
            printf("[!] font atlas: GDI setup failed\n");
            return false;
        }

        f.line_h = static_cast<float>(builder.cell_h);

        int pen_x = 1, pen_y = 1;
        int drawn = 0;
        for (int c = 32; c < 128; ++c)
        {
            const char ch = static_cast<char>(c);
            SIZE size{};
            GetTextExtentPoint32A(builder.dc, &ch, 1, &size);

            const int adv = (size.cx > 0) ? size.cx : (px / 3);
            if (pen_x + adv + 2 >= atlas::kWidth) { pen_x = 1; pen_y += builder.cell_h + 1; }
            if (pen_y + builder.cell_h + 1 >= atlas::kHeight) break;

            TextOutA(builder.dc, pen_x, pen_y, &ch, 1);
            ++drawn;

            Glyph& g = f.glyphs[c - 32];
            g.adv = static_cast<float>(adv);
            g.w   = static_cast<float>(adv);
            g.h   = static_cast<float>(builder.cell_h);
            g.u0  = static_cast<float>(pen_x) / atlas::kWidth;
            g.v0  = static_cast<float>(pen_y) / atlas::kHeight;
            g.u1  = static_cast<float>(pen_x + adv) / atlas::kWidth;
            g.v1  = static_cast<float>(pen_y + builder.cell_h) / atlas::kHeight;

            pen_x += adv + 1;
        }

        if (drawn < 90)
        {
            builder.end();
            printf("[!] font atlas: only %d/96 glyphs fit at %dpx\n", drawn, px);
            return false;
        }

        HRESULT hr = dev->CreateTexture(atlas::kWidth, atlas::kHeight, 1, D3DUSAGE_DYNAMIC,
                                        D3DFMT_A8R8G8B8, D3DPOOL_DEFAULT, &f.tex, nullptr);
        if (FAILED(hr) || !f.tex)
        {
            f.tex = nullptr;
            builder.end();
            printf("[!] font texture creation failed (0x%08lX)\n", static_cast<unsigned long>(hr));
            return false;
        }

        D3DLOCKED_RECT locked{};
        hr = f.tex->LockRect(0, &locked, nullptr, D3DLOCK_DISCARD);
        if (FAILED(hr) || !locked.pBits)
        {
            builder.end();
            f.tex->Release();
            f.tex = nullptr;
            printf("[!] font texture lock failed (0x%08lX)\n", static_cast<unsigned long>(hr));
            return false;
        }

        const BYTE* src = static_cast<const BYTE*>(builder.bits);
        if (src)
        {
            for (int y = 0; y < atlas::kHeight; ++y)
            {
                DWORD* dst_row = reinterpret_cast<DWORD*>(static_cast<BYTE*>(locked.pBits) + y * locked.Pitch);
                const DWORD* src_row = reinterpret_cast<const DWORD*>(src + static_cast<size_t>(y) * atlas::kWidth * 4);
                for (int x = 0; x < atlas::kWidth; ++x)
                {
                    const DWORD px32 = src_row[x];
                    const DWORD r = (px32 >> 16) & 0xFF;
                    const DWORD g = (px32 >> 8) & 0xFF;
                    const DWORD b = px32 & 0xFF;
                    DWORD a = r > g ? r : g;
                    if (b > a) a = b;
                    dst_row[x] = (a << 24) | 0x00FFFFFF;   // white RGB, coverage in alpha
                }
            }
        }

        f.tex->UnlockRect(0);
        builder.end();
        return true;
    }

    inline void reset()
    {
        flat_verts.clear();
        text_verts.clear();
    }

    inline void quad_flat(float x0, float y0, float x1, float y1, DWORD color)
    {
        const Vertex a{ x0, y0, 0, 1, color, 0, 0 };
        const Vertex b{ x1, y0, 0, 1, color, 0, 0 };
        const Vertex c{ x1, y1, 0, 1, color, 0, 0 };
        const Vertex d{ x0, y1, 0, 1, color, 0, 0 };
        flat_verts.push_back(a); flat_verts.push_back(b); flat_verts.push_back(c);
        flat_verts.push_back(a); flat_verts.push_back(c); flat_verts.push_back(d);
    }

    inline void rect_filled(float x, float y, float w, float h, DWORD color)
    {
        if (w <= 0 || h <= 0) return;
        quad_flat(x, y, x + w, y + h, color);
    }

    inline void line(float x0, float y0, float x1, float y1, DWORD color, float thickness = 1.f)
    {
        float dx = x1 - x0, dy = y1 - y0;
        const float len = std::sqrt(dx * dx + dy * dy);
        if (len < 0.001f) return;

        dx /= len; dy /= len;
        const float nx = -dy * (thickness * 0.5f);
        const float ny = dx * (thickness * 0.5f);

        const Vertex a{ x0 + nx, y0 + ny, 0, 1, color, 0, 0 };
        const Vertex b{ x1 + nx, y1 + ny, 0, 1, color, 0, 0 };
        const Vertex c{ x1 - nx, y1 - ny, 0, 1, color, 0, 0 };
        const Vertex d{ x0 - nx, y0 - ny, 0, 1, color, 0, 0 };
        flat_verts.push_back(a); flat_verts.push_back(b); flat_verts.push_back(c);
        flat_verts.push_back(a); flat_verts.push_back(c); flat_verts.push_back(d);
    }

    inline void rect(float x, float y, float w, float h, DWORD color, float thickness = 1.f)
    {
        line(x, y, x + w, y, color, thickness);
        line(x + w, y, x + w, y + h, color, thickness);
        line(x + w, y + h, x, y + h, color, thickness);
        line(x, y + h, x, y, color, thickness);
    }

    inline void cornered_box(float x, float y, float w, float h, DWORD color, float thickness = 1.f)
    {
        const float cw = w / 3.f, ch = h / 3.f;
        line(x, y, x, y + ch, color, thickness);
        line(x, y, x + cw, y, color, thickness);
        line(x + w - cw, y, x + w, y, color, thickness);
        line(x + w, y, x + w, y + ch, color, thickness);
        line(x, y + h - ch, x, y + h, color, thickness);
        line(x, y + h, x + cw, y + h, color, thickness);
        line(x + w - cw, y + h, x + w, y + h, color, thickness);
        line(x + w, y + h - ch, x + w, y + h, color, thickness);
    }

    inline void circle(float cx, float cy, float radius, DWORD color, int segments = 96)
    {
        if (radius <= 0.f || segments < 3) return;
        float px = cx + radius, py = cy;
        for (int i = 1; i <= segments; ++i)
        {
            const float a = (static_cast<float>(i) / segments) * 6.28318530718f;
            const float nx = cx + std::cos(a) * radius;
            const float ny = cy + std::sin(a) * radius;
            line(px, py, nx, ny, color, 1.f);
            px = nx; py = ny;
        }
    }

    inline float text_width(const char* text)
    {
        float w = 0;
        for (const char* p = text; *p; ++p)
        {
            if (*p == '\n') continue;
            const int idx = static_cast<int>(*p) - 32;
            if (idx < 0 || idx > 95) continue;
            w += font.glyphs[idx].adv;
        }
        return w;
    }

    inline void text(float x, float y, DWORD color, const char* str)
    {
        float pen = x;
        for (const char* p = str; *p; ++p)
        {
            const int idx = static_cast<int>(*p) - 32;
            if (idx < 0 || idx > 95) continue;
            const Glyph& g = font.glyphs[idx];

            if (*p != ' ' && g.w > 0.f)
            {
                const Vertex a{ pen,       y,          0, 1, color, g.u0, g.v0 };
                const Vertex b{ pen + g.w, y,          0, 1, color, g.u1, g.v0 };
                const Vertex c{ pen + g.w, y + g.h,    0, 1, color, g.u1, g.v1 };
                const Vertex d{ pen,       y + g.h,    0, 1, color, g.u0, g.v1 };
                text_verts.push_back(a); text_verts.push_back(b); text_verts.push_back(c);
                text_verts.push_back(a); text_verts.push_back(c); text_verts.push_back(d);
            }
            pen += g.adv;
        }
    }

    inline void text_centered(float cx, float y, DWORD color, const char* str)
    {
        text(cx - text_width(str) * 0.5f, y, color, str);
    }

    inline void flush(IDirect3DDevice9* dev)
    {
        if (!dev) return;

        dev->SetFVF(kFvf);
        dev->SetRenderState(D3DRS_ZENABLE, FALSE);
        dev->SetRenderState(D3DRS_LIGHTING, FALSE);
        dev->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
        dev->SetRenderState(D3DRS_ALPHABLENDENABLE, TRUE);
        dev->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
        dev->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);

        if (!flat_verts.empty())
        {
            dev->SetTexture(0, nullptr);
            dev->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_SELECTARG2);
            dev->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
            dev->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG2);
            dev->SetTextureStageState(0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
            dev->DrawPrimitiveUP(D3DPT_TRIANGLELIST,
                                 static_cast<UINT>(flat_verts.size() / 3),
                                 flat_verts.data(), sizeof(Vertex));
        }

        if (!text_verts.empty() && font.tex)
        {
            dev->SetTexture(0, font.tex);
            dev->SetSamplerState(0, D3DSAMP_MINFILTER, D3DTEXF_LINEAR);
            dev->SetSamplerState(0, D3DSAMP_MAGFILTER, D3DTEXF_LINEAR);
            dev->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_MODULATE);
            dev->SetTextureStageState(0, D3DTSS_COLORARG1, D3DTA_TEXTURE);
            dev->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
            dev->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_MODULATE);
            dev->SetTextureStageState(0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE);
            dev->SetTextureStageState(0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
            dev->DrawPrimitiveUP(D3DPT_TRIANGLELIST,
                                 static_cast<UINT>(text_verts.size() / 3),
                                 text_verts.data(), sizeof(Vertex));
            dev->SetTexture(0, nullptr);
        }
    }
}

// ---------------------------------------------------------------------------
//  tiny immediate-mode UI
// ---------------------------------------------------------------------------
namespace ui
{
    inline float g_mx = 0, g_my = 0;
    inline bool  g_down = false;
    inline bool  g_clicked = false;
    inline int   g_next_id = 1;
    inline int   g_active_id = 0;

    constexpr DWORD kColBg      = D3DCOLOR_ARGB(235, 26, 26, 28);
    constexpr DWORD kColPanel   = D3DCOLOR_ARGB(255, 38, 38, 42);
    constexpr DWORD kColBorder  = D3DCOLOR_ARGB(255, 90, 90, 96);
    constexpr DWORD kColText    = D3DCOLOR_ARGB(255, 220, 220, 224);
    constexpr DWORD kColTextDim = D3DCOLOR_ARGB(255, 150, 150, 156);
    constexpr DWORD kColAccent  = D3DCOLOR_ARGB(255, 120, 190, 255);
    constexpr DWORD kColFrame   = D3DCOLOR_ARGB(255, 52, 52, 58);

    inline bool hovered(float x, float y, float w, float h)
    {
        return g_mx >= x && g_mx <= x + w && g_my >= y && g_my <= y + h;
    }

    inline void begin_frame()
    {
        g_next_id = 1;
        POINT p{};
        GetCursorPos(&p);
        g_mx = static_cast<float>(p.x);
        g_my = static_cast<float>(p.y);

        static bool last_down = false;
        g_down = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
        g_clicked = g_down && !last_down;
        last_down = g_down;
        if (!g_down) g_active_id = 0;
    }

    inline bool checkbox(float x, float y, const char* label, bool* value)
    {
        constexpr float box = 13.f;
        const bool hit = hovered(x, y, 260.f, 18.f);
        draw::rect_filled(x, y, box, box, hit ? kColFrame : kColPanel);
        draw::rect(x, y, box, box, kColBorder);
        if (*value) draw::rect_filled(x + 3, y + 3, box - 6, box - 6, kColAccent);
        draw::text(x + box + 7, y - 1, kColText, label);

        if (g_clicked && hit) { *value = !*value; return true; }
        return false;
    }

    inline bool slider(float x, float y, float w, const char* label, float* value,
                       float lo, float hi, const char* fmt)
    {
        const int id = g_next_id++;
        constexpr float track_y_off = 16.f;
        constexpr float track_h = 4.f;

        const float ty = y + track_y_off;
        const bool track_hit = hovered(x, ty - 5.f, w, track_h + 10.f);

        draw::text(x, y, kColTextDim, label);
        draw::rect_filled(x, ty, w, track_h, kColFrame);

        float frac = (*value - lo) / (hi - lo);
        if (frac < 0.f) frac = 0.f;
        if (frac > 1.f) frac = 1.f;

        draw::rect_filled(x, ty, w * frac, track_h, kColAccent);
        draw::rect_filled(x + w * frac - 4.f, ty - 4.f, 8.f, track_h + 8.f, kColAccent);

        char buffer[96];
        snprintf(buffer, sizeof(buffer), fmt, *value);
        draw::text(x + w + 12.f, y, kColText, buffer);

        if (track_hit && g_down && (g_active_id == 0 || g_active_id == id))
        {
            g_active_id = id;
            float t = (g_mx - x) / w;
            if (t < 0) t = 0;
            if (t > 1) t = 1;
            *value = lo + t * (hi - lo);
            return true;
        }
        return false;
    }

    inline bool button(float x, float y, float w, float h, const char* label, bool active = false)
    {
        const bool hit = hovered(x, y, w, h);
        draw::rect_filled(x, y, w, h, active ? kColFrame : (hit ? kColFrame : kColPanel));
        draw::rect(x, y, w, h, active ? kColAccent : kColBorder);
        draw::text_centered(x + w * 0.5f, y + (h - draw::font.line_h) * 0.5f,
                            active ? kColAccent : kColText, label);
        return g_clicked && hit;
    }
}

// ---------------------------------------------------------------------------
//  config IO — flat JSON, no dependencies. Written next to the exe.
// ---------------------------------------------------------------------------
namespace config
{
    inline bool save()
    {
        FILE* f = nullptr;
        if (fopen_s(&f, cfg::kConfigPath, "wb") != 0 || !f) return false;

        fprintf(f, "{\n");
        fprintf(f, "  \"aimbot\": { \"enable\": %s, \"show_fov\": %s, \"fov\": %.1f, \"smoothness\": %.2f, \"aim_key\": %d },\n",
                settings::aimbot::enable ? "true" : "false",
                settings::aimbot::show_fov ? "true" : "false",
                settings::aimbot::fov, settings::aimbot::smoothness, settings::aimbot::aim_key);
        fprintf(f, "  \"visuals\": { \"enable\": %s, \"box\": %s, \"fill_box\": %s, \"line\": %s, \"distance\": %s, \"health_bar\": %s }\n",
                settings::visuals::enable ? "true" : "false",
                settings::visuals::box ? "true" : "false",
                settings::visuals::fill_box ? "true" : "false",
                settings::visuals::line ? "true" : "false",
                settings::visuals::distance ? "true" : "false",
                settings::visuals::health_bar ? "true" : "false");
        fprintf(f, "}\n");

        fclose(f);
        return true;
    }

    inline bool load()
    {
        FILE* f = nullptr;
        if (fopen_s(&f, cfg::kConfigPath, "rb") != 0 || !f) return false;

        char buffer[4096] = { 0 };
        const size_t got = fread(buffer, 1, sizeof(buffer) - 1, f);
        fclose(f);
        if (got == 0) return false;

        // flat scan helpers: find `key` after `from`, then read the value after ':'
        auto value_at = [](const char* from, const char* key) -> const char* {
            if (!from) return nullptr;
            const char* at = strstr(from, key);
            if (!at) return nullptr;
            at = strchr(at, ':');
            if (!at) return nullptr;
            ++at;
            while (*at == ' ' || *at == '\t') ++at;
            return at;
        };

        auto read_bool = [&](const char* from, const char* key, bool* out) {
            const char* at = value_at(from, key);
            if (!at) return;
            if (strncmp(at, "true", 4) == 0) *out = true;
            else if (strncmp(at, "false", 5) == 0) *out = false;
        };

        auto read_float = [&](const char* from, const char* key, double lo, double hi, float* out) {
            const char* at = value_at(from, key);
            if (!at) return;
            double v = 0.0;
            if (sscanf_s(at, "%lf", &v) != 1) return;
            if (!std::isfinite(v) || v < lo || v > hi) return;   // never load garbage
            *out = static_cast<float>(v);
        };

        auto read_int = [&](const char* from, const char* key, int lo, int hi, int* out) {
            const char* at = value_at(from, key);
            if (!at) return;
            int v = 0;
            if (sscanf_s(at, "%d", &v) != 1) return;
            if (v < lo || v > hi) return;
            *out = v;
        };

        const char* aimbot = strstr(buffer, "\"aimbot\"");
        if (aimbot)
        {
            read_bool(aimbot, "\"enable\"", &settings::aimbot::enable);
            read_bool(aimbot, "\"show_fov\"", &settings::aimbot::show_fov);
            read_float(aimbot, "\"fov\"", 10.0, 400.0, &settings::aimbot::fov);
            read_float(aimbot, "\"smoothness\"", 1.0, 15.0, &settings::aimbot::smoothness);
            read_int(aimbot, "\"aim_key\"", VK_LBUTTON, VK_RBUTTON, &settings::aimbot::aim_key);
        }

        const char* visuals = strstr(buffer, "\"visuals\"");
        if (visuals)
        {
            read_bool(visuals, "\"enable\"", &settings::visuals::enable);
            read_bool(visuals, "\"box\"", &settings::visuals::box);
            read_bool(visuals, "\"fill_box\"", &settings::visuals::fill_box);
            read_bool(visuals, "\"line\"", &settings::visuals::line);
            read_bool(visuals, "\"distance\"", &settings::visuals::distance);
            read_bool(visuals, "\"health_bar\"", &settings::visuals::health_bar);
        }

        return true;
    }
}

// ---------------------------------------------------------------------------
//  game logic
// ---------------------------------------------------------------------------
inline bool game_foreground()
{
    if (!mem.alive()) return false;

    const HWND fg = GetForegroundWindow();
    if (!fg) return false;

    DWORD owner = 0;
    GetWindowThreadProcessId(fg, &owner);
    if (owner == mem.pid) return true;

    // the game sometimes owns a wrapping window; fall back to the cached one
    if (!overlay::game_wnd || !IsWindow(overlay::game_wnd))
        overlay::game_wnd = overlay::find_process_window(mem.pid);

    return overlay::game_wnd && fg == overlay::game_wnd;
}

// Aim point off the capsule: centre + (BaseEyeHeight - CapsuleHalfHeight) on Z.
// Both fields are validated; if either is implausible we fall back to the centre
// (which is still a real, validated position) instead of inventing a height.
inline bool pawn_aim_point(uintptr_t pawn, uintptr_t root, const Vector3& centre, Vector3& out)
{
    out = centre;

    if (cfg::kBoneWorldLocations)
    {
        uintptr_t mesh = 0;
        if (mem.read(pawn + off::Mesh, mesh) && Mem::plausible_ptr(mesh))
        {
            if (bone_world_location(mesh, cfg::kHeadBone, out)) return true;
        }
    }

    float eye_height = 0.f;
    float capsule_half = 0.f;

    const bool have_eye = mem.read(pawn + off::BaseEyeHeight, eye_height) &&
                          std::isfinite(eye_height) && eye_height > 0.f && eye_height < 500.f;
    const bool have_capsule = mem.read(pawn + off::CapsuleHalfHeight, capsule_half) &&
                              std::isfinite(capsule_half) && capsule_half > 1.f && capsule_half < 500.f;

    if (have_eye)
    {
        const double half = have_capsule ? static_cast<double>(capsule_half)
                                         : static_cast<double>(cfg::kCapsuleHalfHeightFallback);

        // BaseEyeHeight is measured from the actor origin, the capsule spans
        // +/- half, so the delta is (eye - half). Clamped into the capsule: a
        // misread or patched BaseEyeHeight must not aim above the player.
        double delta = static_cast<double>(eye_height) - half;
        if (delta > half)  delta = half;
        if (delta < -half) delta = -half;

        out = Vector3(centre.x, centre.y, centre.z + delta);
        return valid_vector(out);
    }

    (void)root;
    return valid_vector(out);
}

// Single pass over GameState->PlayerArray. Clears the previous target first, so a
// tick that returns early can never leave a stale mesh behind for the aimbot.
inline void game_tick()
{
    cache::closest_mesh = 0;
    cache::closest_pawn = 0;
    cache::closest_distance = DBL_MAX;

    cache::camera = Camera{};

    if (!mem.alive()) return;

    // re-validate the world pointer at a bounded rate instead of every tick
    const ULONGLONG now = GetTickCount64();
    if (looks_like_uworld(cache::uworld))
    {
        cache::uworld_ready = true;
    }
    else
    {
        cache::uworld = 0;
        cache::uworld_ready = false;
        if (now - cache::last_resolve_ms < static_cast<ULONGLONG>(cfg::kResolveRetryMs)) return;
        cache::last_resolve_ms = now;

        cache::uworld = resolve_uworld();
        if (!cache::uworld) return;
        cache::uworld_ready = true;
    }

    if (!mem.read(cache::uworld + off::GameInstance, cache::game_instance)) return;
    if (!Mem::plausible_ptr(cache::game_instance)) return;

    // UGameInstance::LocalPlayers is a TArray<ULocalPlayer*> { Data, Num, Max }
    uintptr_t local_players = 0;
    if (!mem.read(cache::game_instance + off::LocalPlayers, local_players)) return;
    if (!Mem::plausible_ptr(local_players)) return;

    cache::local_players = 0;
    if (!mem.read(local_players, cache::local_players)) return;
    if (!Mem::plausible_ptr(cache::local_players)) return;

    // ULocalPlayer::PlayerController is not in this dump; 0x30 is the long-standing
    // offset and is validation-gated below (camera + pawn must resolve through it).
    // FILL: print ULocalPlayer+0x00..0x80 with a known controller and confirm; the
    //       walk fails safe if it is wrong.
    constexpr uintptr_t kLocalPlayerController = 0x30;

    cache::player_controller = 0;
    if (!mem.read(cache::local_players + kLocalPlayerController, cache::player_controller)) return;
    if (!Mem::plausible_ptr(cache::player_controller)) return;

    cache::local_pawn = 0;
    if (!mem.read(cache::player_controller + off::LocalPawn, cache::local_pawn)) cache::local_pawn = 0;
    if (cache::local_pawn && !Mem::plausible_ptr(cache::local_pawn)) cache::local_pawn = 0;

    cache::my_team_valid = false;
    if (cache::local_pawn)
    {
        uintptr_t root = 0;
        if (mem.read(cache::local_pawn + off::RootComponent, root) && Mem::plausible_ptr(root))
            component_world_location(root, cache::local_origin);   // validated inside

        uintptr_t player_state = 0;
        if (mem.read(cache::local_pawn + off::PlayerState, player_state) && Mem::plausible_ptr(player_state))
        {
            cache::player_state = player_state;
            uint8_t team = 0;
            if (mem.read(player_state + off::TeamIndex, team))
            {
                cache::my_team_id = team;
                cache::my_team_valid = true;
            }
        }
    }

    cache::game_state = 0;
    if (!mem.read(cache::uworld + off::GameState, cache::game_state)) return;
    if (!Mem::plausible_ptr(cache::game_state)) return;

    // GameStateBase::PlayerArray { Data @+0x290, Num @+0x298, Max @+0x29C }
    uintptr_t data = 0;
    int32_t num = 0, max = 0;
    if (!mem.read(cache::game_state + off::PlayerArray, data)) return;
    if (!mem.read(cache::game_state + off::PlayerArray + 0x08, num)) return;
    if (!mem.read(cache::game_state + off::PlayerArray + 0x0C, max)) return;

    if (!Mem::plausible_ptr(data)) return;
    if (num <= 0 || num > cfg::kMaxPlayers) return;
    if (max < num || max > 4096) return;

    cache::player_array = data;
    cache::player_count = num;

    cache::camera = get_view_point();
    if (!cache::camera.valid)
    {
        cache::player_count = 0;
        return;
    }

    for (int i = 0; i < num; ++i)
    {
        uintptr_t player_state = 0;
        if (!mem.read(data + static_cast<uintptr_t>(i) * sizeof(uintptr_t), player_state)) continue;
        if (!Mem::plausible_ptr(player_state)) continue;
        if (player_state == cache::player_state) continue;

        uint8_t spectator_flags = 0;
        if (mem.read(player_state + off::bIsSpectator, spectator_flags))
        {
            // FILL: bIsSpectator shares its byte with bIsABot/bIsInactive; the bit
            // index is not in the dump. Until it is confirmed the whole byte is
            // ignored rather than guessed.
            (void)spectator_flags;
        }

        uint8_t team = 0;
        if (mem.read(player_state + off::TeamIndex, team))
        {
            if (cfg::kTeamCheck && cache::my_team_valid && team == cache::my_team_id) continue;
        }

        uintptr_t pawn = 0;
        if (!mem.read(player_state + off::PawnPrivate, pawn)) continue;
        if (!Mem::plausible_ptr(pawn)) continue;
        if (pawn == cache::local_pawn) continue;

        uintptr_t root = 0;
        if (!mem.read(pawn + off::RootComponent, root)) continue;
        if (!Mem::plausible_ptr(root)) continue;

        Vector3 centre;
        if (!component_world_location(root, centre)) continue;
        if (!valid_vector(centre)) continue;

        const double distance_m = cache::camera.location.distance(centre) / 100.0;
        if (!std::isfinite(distance_m) || distance_m > cfg::kMaxTargetM) continue;

        Vector3 aim;
        if (!pawn_aim_point(pawn, root, centre, aim)) continue;

        Vector2 aim2d;
        if (!project_world_to_screen(aim, aim2d)) continue;

        uintptr_t mesh = 0;
        if (!mem.read(pawn + off::Mesh, mesh)) mesh = 0;
        if (mesh && !Mem::plausible_ptr(mesh)) mesh = 0;

        const bool visible = mesh ? is_visible(mesh) : false;

        // --- visuals ------------------------------------------------------
        if (settings::visuals::enable)
        {
            double half = cfg::kCapsuleHalfHeightFallback;
            float capsule_half = 0.f;
            if (mem.read(pawn + off::CapsuleHalfHeight, capsule_half) &&
                std::isfinite(capsule_half) && capsule_half > 1.f && capsule_half < 500.f)
                half = capsule_half;

            const Vector3 top(centre.x, centre.y, centre.z + half);
            const Vector3 bottom(centre.x, centre.y, centre.z - half);

            Vector2 top2d, bottom2d;
            if (project_world_to_screen(top, top2d) && project_world_to_screen(bottom, bottom2d))
            {
                const float box_height = static_cast<float>(std::fabs(bottom2d.y - top2d.y));
                const float box_width = box_height * 0.50f;

                if (box_height > 2.f && box_height < 4000.f)
                {
                    const float bx = static_cast<float>(top2d.x) - box_width * 0.5f;
                    const float by = static_cast<float>(top2d.y);

                    // red/white only when the bRecentlyRendered bit is trusted;
                    // otherwise a neutral colour that claims nothing
                    const DWORD box_color = !cfg::kVisibleOnly ? D3DCOLOR_ARGB(255, 245, 245, 245)
                                          : visible           ? D3DCOLOR_ARGB(255, 245, 245, 245)
                                                              : D3DCOLOR_ARGB(255, 240, 60, 60);

                    if (settings::visuals::box)
                        draw::cornered_box(bx, by, box_width, box_height, box_color, 1.f);

                    if (settings::visuals::fill_box)
                        draw::rect_filled(bx, by, box_width, box_height, D3DCOLOR_ARGB(45, 0, 0, 0));

                    if (settings::visuals::health_bar)
                    {
                        uintptr_t health_set = 0;
                        float hp = 0.f, max_hp = 0.f;

                        if (mem.read(pawn + off::HealthSet, health_set) && Mem::plausible_ptr(health_set) &&
                            mem.read(health_set + off::Health, hp) && mem.read(health_set + off::MaxHealth, max_hp) &&
                            std::isfinite(hp) && std::isfinite(max_hp) && max_hp > 0.f && max_hp < 100000.f &&
                            hp >= 0.f && hp <= max_hp * 2.f)
                        {
                            float frac = static_cast<float>(hp / max_hp);
                            if (frac > 1.f) frac = 1.f;

                            draw::rect_filled(bx - 5.f, by, 3.f, box_height, D3DCOLOR_ARGB(120, 0, 0, 0));
                            draw::rect_filled(bx - 5.f, by + box_height * (1.f - frac), 3.f, box_height * frac,
                                              D3DCOLOR_ARGB(255, 90, 220, 120));
                        }
                    }

                    if (settings::visuals::line)
                        draw::line(static_cast<float>(settings::center_x), static_cast<float>(settings::height),
                                   static_cast<float>(bottom2d.x), static_cast<float>(bottom2d.y), box_color, 1.f);

                    if (settings::visuals::distance)
                    {
                        char label[64];
                        snprintf(label, sizeof(label), "%.0fm", distance_m);
                        draw::text_centered(static_cast<float>(bottom2d.x), static_cast<float>(bottom2d.y),
                                            D3DCOLOR_ARGB(255, 240, 240, 240), label);
                    }
                }
            }
        }

        // --- target selection --------------------------------------------
        if (cfg::kVisibleOnly && !visible) continue;

        const double dx = aim2d.x - settings::center_x;
        const double dy = aim2d.y - settings::center_y;
        const double screen_dist = std::sqrt(dx * dx + dy * dy);

        if (!std::isfinite(screen_dist)) continue;
        if (screen_dist < cfg::kMinTargetPx) continue;          // already on it
        if (screen_dist > settings::aimbot::fov) continue;
        if (screen_dist >= cache::closest_distance) continue;

        cache::closest_distance = screen_dist;
        cache::closest_mesh = mesh;
        cache::closest_pawn = pawn;
    }
}

// Sends mouse deltas only. All the gating happens in main_loop; this function
// still refuses to move if the pieces it needs are not valid.
inline void aimbot()
{
    if (!cache::closest_mesh && !cache::closest_pawn) return;
    if (!cache::camera.valid) return;
    if (!mem.alive()) return;

    Vector3 aim;
    bool have = false;

    if (cfg::kBoneWorldLocations && cache::closest_mesh)
        have = bone_world_location(cache::closest_mesh, cfg::kHeadBone, aim);

    if (!have)
    {
        if (!cache::closest_pawn) return;

        uintptr_t root = 0;
        if (!mem.read(cache::closest_pawn + off::RootComponent, root) || !Mem::plausible_ptr(root)) return;

        Vector3 centre;
        if (!component_world_location(root, centre)) return;
        if (!pawn_aim_point(cache::closest_pawn, root, centre, aim)) return;
    }

    if (!valid_vector(aim)) return;

    Vector2 screen;
    if (!project_world_to_screen(aim, screen)) return;

    const float smoothness = settings::aimbot::smoothness > 0.1f ? settings::aimbot::smoothness : 1.f;
    const double gain = 1.0 / static_cast<double>(smoothness);

    double dx = (screen.x - settings::center_x) * gain;
    double dy = (screen.y - settings::center_y) * gain;

    const double step = std::sqrt(dx * dx + dy * dy);
    if (!std::isfinite(step)) return;

    if (step > cfg::kMaxScreenStep)
    {
        const double scale = cfg::kMaxScreenStep / step;
        dx *= scale;
        dy *= scale;
    }

    input::move_mouse(dx, dy);
}

// ---------------------------------------------------------------------------
//  menu — same layout/tabs as before, plus config save/load in Misc
// ---------------------------------------------------------------------------
inline void render_menu()
{
    if (settings::aimbot::show_fov)
        draw::circle(static_cast<float>(settings::center_x), static_cast<float>(settings::center_y),
                     settings::aimbot::fov, D3DCOLOR_ARGB(255, 245, 245, 245));

    if (!settings::show_menu) return;

    static float win_x = 80.f, win_y = 120.f;
    static bool  dragging = false;
    static float drag_dx = 0.f, drag_dy = 0.f;
    static ULONGLONG status_until = 0;
    static char  status_text[64] = { 0 };

    constexpr float w = 430.f, h = 300.f;
    constexpr float title_h = 24.f;

    draw::rect_filled(win_x, win_y, w, h, ui::kColBg);
    draw::rect(win_x, win_y, w, h, ui::kColBorder);
    draw::rect_filled(win_x, win_y, w, title_h, ui::kColPanel);
    draw::text(win_x + 10.f, win_y + 5.f, ui::kColText, "fortnite external");
    draw::text(win_x + w - 96.f, win_y + 5.f, ui::kColTextDim, "INSERT / END");

    // title drag
    if (ui::g_clicked && ui::hovered(win_x, win_y, w - 30.f, title_h))
    {
        dragging = true;
        drag_dx = ui::g_mx - win_x;
        drag_dy = ui::g_my - win_y;
    }
    if (!ui::g_down) dragging = false;
    if (dragging) { win_x = ui::g_mx - drag_dx; win_y = ui::g_my - drag_dy; }

    const float tab_y = win_y + title_h + 10.f;
    const float tab_w = (w - 40.f) / 3.f;

    if (ui::button(win_x + 10.f, tab_y, tab_w - 6.f, 22.f, "Aimbot", settings::tab == 0)) settings::tab = 0;
    if (ui::button(win_x + 10.f + tab_w, tab_y, tab_w - 6.f, 22.f, "Visuals", settings::tab == 1)) settings::tab = 1;
    if (ui::button(win_x + 10.f + tab_w * 2.f, tab_y, tab_w - 6.f, 22.f, "Misc", settings::tab == 2)) settings::tab = 2;

    float y = tab_y + 40.f;
    const float x = win_x + 16.f;
    const float col_w = w - 32.f;

    if (settings::tab == 0)
    {
        ui::checkbox(x, y, "enable aimbot", &settings::aimbot::enable);           y += 24.f;
        ui::checkbox(x, y, "show fov circle", &settings::aimbot::show_fov);       y += 24.f;
        ui::slider(x, y, col_w - 40.f, "fov (px)", &settings::aimbot::fov, 10.f, 400.f, "%.0f");   y += 40.f;
        ui::slider(x, y, col_w - 40.f, "smoothness", &settings::aimbot::smoothness, 1.f, 15.f, "%.1f"); y += 40.f;

        const bool lmb = settings::aimbot::aim_key == VK_LBUTTON;
        char label[64];
        snprintf(label, sizeof(label), "aim key: %s", lmb ? "LMB" : "RMB");
        if (ui::button(x, y, 160.f, 22.f, label))
            settings::aimbot::aim_key = lmb ? VK_RBUTTON : VK_LBUTTON;
        draw::text(x + 170.f, y + 4.f, ui::kColTextDim, "hold to aim");
    }
    else if (settings::tab == 1)
    {
        ui::checkbox(x, y, "enable visuals", &settings::visuals::enable);  y += 24.f;
        ui::checkbox(x, y, "box", &settings::visuals::box);                y += 24.f;
        ui::checkbox(x, y, "filled box", &settings::visuals::fill_box);    y += 24.f;
        ui::checkbox(x, y, "snaplines", &settings::visuals::line);         y += 24.f;
        ui::checkbox(x, y, "distance", &settings::visuals::distance);      y += 24.f;
        ui::checkbox(x, y, "health bar + hp", &settings::visuals::health_bar); y += 24.f;

        draw::text(x, y + 6.f, ui::kColTextDim,
                   settings::visuals::enable ? "box from validated capsule positions" : "");
    }
    else
    {
        char line[128];

        snprintf(line, sizeof(line), "input: SendInput (no driver, no injection)");
        draw::text(x, y, ui::kColTextDim, line); y += 22.f;

        snprintf(line, sizeof(line), "uworld: %s", cache::uworld_ready ? "validated" : "not resolved");
        draw::text(x, y, ui::kColTextDim, line); y += 22.f;

        snprintf(line, sizeof(line), "offsets: v43.00 dump, bones %s",
                 cfg::kBoneWorldLocations ? "on" : "off (capsule aim)");
        draw::text(x, y, ui::kColTextDim, line); y += 22.f;

        if (ui::button(x, y, 140.f, 24.f, "save cfg"))
        {
            snprintf(status_text, sizeof(status_text), config::save() ? "cfg saved" : "cfg save failed");
            status_until = GetTickCount64() + 2000;
        }
        if (ui::button(x + 150.f, y, 140.f, 24.f, "load cfg"))
        {
            snprintf(status_text, sizeof(status_text), config::load() ? "cfg loaded" : "cfg load failed");
            status_until = GetTickCount64() + 2000;
        }
        y += 34.f;

        if (status_text[0] && GetTickCount64() < status_until)
            draw::text(x, y, ui::kColAccent, status_text);
        y += 22.f;

        if (ui::button(x, y, 140.f, 24.f, "unload")) overlay::running = false;
    }
}

// ---------------------------------------------------------------------------
//  device loss / resize — one place, checked every frame
// ---------------------------------------------------------------------------
namespace overlay
{
    inline bool font_ok = false;

    inline void release_font()
    {
        if (draw::font.tex) { draw::font.tex->Release(); draw::font.tex = nullptr; }
        font_ok = false;
    }

    inline bool recreate_font()
    {
        font_ok = draw::create_font(device, draw::font, cfg::kFontPx, "Consolas");
        return font_ok;
    }

    inline bool reset_device()
    {
        if (!device) return false;

        release_font();

        const HRESULT hr = device->Reset(&params);
        if (FAILED(hr))
        {
            printf("[!] device Reset failed (0x%08lX)\n", static_cast<unsigned long>(hr));
            destroy_device();
            if (!init_device()) return false;
        }

        if (!recreate_font()) return false;
        return true;
    }

    // Returns false when the overlay can no longer render.
    inline bool ensure_device()
    {
        if (!device)
        {
            if (!init_device()) return false;
            return recreate_font();
        }

        const HRESULT coop = device->TestCooperativeLevel();
        if (coop == D3DERR_DEVICELOST) return true;          // wait for the next frame
        if (coop == D3DERR_DEVICENOTRESET)
            return reset_device();

        if (FAILED(coop))
        {
            printf("[!] TestCooperativeLevel failed (0x%08lX)\n", static_cast<unsigned long>(coop));
            destroy_device();
            return init_device() && recreate_font();
        }

        return true;
    }

    inline void resize(int w, int h)
    {
        if (!hwnd || w <= 0 || h <= 0) return;

        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, w, h, SWP_NOACTIVATE);
        params.BackBufferWidth  = static_cast<UINT>(w);
        params.BackBufferHeight = static_cast<UINT>(h);

        if (device)
        {
            if (!reset_device())
                printf("[!] overlay lost after resize\n");
        }
    }
}

inline bool params_dirty(UINT cur_w, int new_w, UINT cur_h, int new_h)
{
    return static_cast<int>(cur_w) != new_w || static_cast<int>(cur_h) != new_h;
}

// ---------------------------------------------------------------------------
//  main loop
// ---------------------------------------------------------------------------
inline void main_loop()
{
    LARGE_INTEGER freq{}, last{};
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&last);

    while (overlay::running)
    {
        MSG msg{};
        while (PeekMessageA(&msg, nullptr, 0, 0, PM_REMOVE))
        {
            TranslateMessage(&msg);
            DispatchMessageA(&msg);
        }

        if (GetAsyncKeyState(cfg::kMenuKey) & 1) settings::show_menu = !settings::show_menu;
        if (GetAsyncKeyState(cfg::kExitKey) & 1) break;

        settings::width  = GetSystemMetrics(SM_CXSCREEN);
        settings::height = GetSystemMetrics(SM_CYSCREEN);
        settings::center_x = settings::width / 2;
        settings::center_y = settings::height / 2;

        // menu state drives click-through: open = we want the cursor
        overlay::set_click_through(!settings::show_menu);

        const bool focused = game_foreground();
        static bool was_focused = false;
        if (focused != was_focused)
        {
            was_focused = focused;
            if (overlay::hwnd)
            {
                ShowWindow(overlay::hwnd, focused ? SW_SHOWNOACTIVATE : SW_HIDE);
                SetWindowPos(overlay::hwnd, HWND_TOPMOST, 0, 0, settings::width, settings::height,
                             SWP_NOACTIVATE | (focused ? 0 : SWP_NOREDRAW));
            }
        }

        if (params_dirty(overlay::params.BackBufferWidth, settings::width,
                         overlay::params.BackBufferHeight, settings::height))
            overlay::resize(settings::width, settings::height);

        if (!overlay::ensure_device())
        {
            printf("[!] overlay device unavailable, stopping\n");
            overlay::running = false;
            break;
        }

        // game handle can go stale (game restart); reattach at a slow cadence
        if (!mem.alive())
        {
            static ULONGLONG last_attach = 0;
            const ULONGLONG now = GetTickCount64();
            if (now - last_attach > 2000)
            {
                last_attach = now;
                if (mem.attach(cfg::kProcessName))
                {
                    cache::uworld = 0;
                    cache::uworld_ready = false;
                    scanner::prepared = false;
                    scanner::exhausted = false;
                    overlay::game_wnd = overlay::find_process_window(mem.pid);
                    printf("[*] attached: pid %lu base 0x%llX\n", static_cast<unsigned long>(mem.pid),
                           static_cast<unsigned long long>(mem.base));
                }
            }
        }

        draw::reset();
        ui::begin_frame();

        // mouse movement requires: game focused, menu closed, aimbot on, key held
        const bool aiming = settings::aimbot::enable && !settings::show_menu && focused &&
                            (GetAsyncKeyState(settings::aimbot::aim_key) & 0x8000) != 0;

        game_tick();

        if (aiming) aimbot();

        render_menu();

        if (overlay::device)
        {
            overlay::device->Clear(0, nullptr, D3DCLEAR_TARGET, D3DCOLOR_ARGB(0, 0, 0, 0), 1.f, 0);
            if (SUCCEEDED(overlay::device->BeginScene()))
            {
                draw::flush(overlay::device);
                overlay::device->EndScene();
            }

            const HRESULT present = overlay::device->Present(nullptr, nullptr, nullptr, nullptr);
            if (present == D3DERR_DEVICELOST || present == D3DERR_DEVICENOTRESET)
                overlay::reset_device();
        }

        // tick floor: keeps the read rate at cfg::kTickMs without capping the overlay
        LARGE_INTEGER now{};
        QueryPerformanceCounter(&now);
        const double elapsed_ms = (now.QuadPart - last.QuadPart) * 1000.0 /
                                  static_cast<double>(freq.QuadPart > 0 ? freq.QuadPart : 1);
        if (elapsed_ms < cfg::kTickMs)
            Sleep(static_cast<DWORD>(cfg::kTickMs - elapsed_ms));
        QueryPerformanceCounter(&last);
    }
}

// ---------------------------------------------------------------------------
//  startup / teardown
// ---------------------------------------------------------------------------
inline void parse_args(int argc, char** argv, uintptr_t& uworld_override, bool& force_scan)
{
    for (int i = 1; i < argc; ++i)
    {
        if (_stricmp(argv[i], "--uworld") == 0 && i + 1 < argc)
        {
            char* end = nullptr;
            const unsigned long long v = _strtoui64(argv[i + 1], &end, 0);
            if (end && *end == '\0' && v > 0x10000 && v < 0x7FFFFFFFFFFFULL)
            {
                uworld_override = static_cast<uintptr_t>(v);
                printf("[*] --uworld 0x%llX (will be validated before use)\n",
                       static_cast<unsigned long long>(v));
            }
            else
            {
                printf("[!] --uworld value not a plausible pointer: %s\n", argv[i + 1]);
            }
            ++i;
        }
        else if (_stricmp(argv[i], "--scan") == 0)
        {
            force_scan = true;
        }
        else if (_stricmp(argv[i], "--help") == 0 || _stricmp(argv[i], "-h") == 0)
        {
            printf("usage: fortnite_external [--uworld 0xOFFSET] [--scan]\n"
                   "  --uworld  GWorld offset inside the module (validated)\n"
                   "  --scan    run the bounded watcher-section scan now\n"
                   "keys: INSERT menu, END unload, aim key held to aim\n");
            ExitProcess(0);
        }
    }
}

int main(int argc, char** argv)
{
    SetProcessDPIAware();
    SetConsoleTitleA("fortnite external (user mode)");
    timeBeginPeriod(1);

    settings::width  = GetSystemMetrics(SM_CXSCREEN);
    settings::height = GetSystemMetrics(SM_CYSCREEN);
    settings::center_x = settings::width / 2;
    settings::center_y = settings::height / 2;

    uintptr_t uworld_override = cfg::kUWorldOverride;
    bool force_scan = false;
    parse_args(argc, argv, uworld_override, force_scan);

    printf("[*] waiting for Fortnite...\n");
    while (!mem.attach(cfg::kProcessName))
        Sleep(500);

    printf("[*] base 0x%llX  pid %lu\n",
           static_cast<unsigned long long>(mem.base), static_cast<unsigned long>(mem.pid));

    if (uworld_override)
    {
        const uintptr_t world = [&]() -> uintptr_t {
            uintptr_t w = 0;
            if (mem.read(mem.base + uworld_override, w) && looks_like_uworld(w)) return w;
            return 0;
        }();

        if (world)
        {
            cache::uworld = world;
            cache::uworld_ready = true;
            printf("[*] UWorld accepted from --uworld: 0x%llX\n", static_cast<unsigned long long>(world));
        }
        else
        {
            printf("[!] --uworld 0x%llX rejected by validation (wrong for this build?)\n",
                   static_cast<unsigned long long>(uworld_override));
        }
    }

    if (force_scan && !cache::uworld_ready)
    {
        printf("[*] --scan: walking the writable sections, 1 MiB per step\n");
        while (!scanner::exhausted && !cache::uworld_ready)
        {
            cache::uworld = scanner::step(mem.base);
            cache::uworld_ready = cache::uworld != 0;
            Sleep(static_cast<DWORD>(cfg::kScanRetryMs));
        }
    }

    if (!cache::uworld_ready)
    {
        cache::uworld = resolve_uworld();
        cache::uworld_ready = cache::uworld != 0;
        cache::last_resolve_ms = GetTickCount64();

        if (!cache::uworld_ready)
            printf("[!] UWorld not resolved yet — menu opens, aim/ESP stay idle. "
                   "The bounded scan continues in the background.\n");
    }

    // bone aim is configured but not wired: say so once, with the offsets to check
    if (cfg::kBoneWorldLocations && (cfg::kTransformStride < 0x20 || !off::BoneArray))
    {
        printf("[!] cfg::kBoneWorldLocations is on but the bone data is not validated:\n"
               "    kTransformStride=0x%llX (need 0x60 FTransform or 0x30 FTransform3f),\n"
               "    off::BoneArray=0x%llX (0 = falling back to mesh+0x%llX CachedComponentSpaceTransforms).\n"
               "    Falling back to capsule aim until those are filled in.\n",
               static_cast<unsigned long long>(cfg::kTransformStride),
               static_cast<unsigned long long>(off::BoneArray),
               static_cast<unsigned long long>(off::BoneSpaceTransforms));
    }

    overlay::game_wnd = overlay::find_process_window(mem.pid);
    if (!overlay::create_window())
    {
        printf("[!] overlay window creation failed\n");
        mem.detach();
        timeEndPeriod(1);
        return 1;
    }

    if (!overlay::init_device())
    {
        printf("[!] D3D9Ex device creation failed\n");
        overlay::destroy_window();
        mem.detach();
        timeEndPeriod(1);
        return 1;
    }

    if (!overlay::recreate_font())
    {
        printf("[!] font creation failed, not running with a null font\n");
        overlay::destroy_device();
        overlay::destroy_window();
        mem.detach();
        timeEndPeriod(1);
        return 1;
    }

    main_loop();

    // teardown, in the only order that is safe: font -> device -> d3d -> window
    overlay::release_font();
    overlay::destroy_device();
    overlay::destroy_window();
    mem.detach();
    timeEndPeriod(1);

    printf("[*] unloaded\n");
    return 0;
}
