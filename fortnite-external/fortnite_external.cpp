// ============================================================================
//  fortnite_external.cpp — single-file Fortnite external, transcribed from
//  https://github.com/xetzzy/Fortnite-External-Source and re-pointed at an
//  OffsetDeck dump (Fortnite v43.00, UE5).
//
//  Original repo = km/ (WDM driver that swaps the win32k.sys NtUser callback
//  qword for external phys-memory R/W) + um/ (D3D9Ex overlay in the UIAccess
//  band, ImGui menu, aimbot via spoofed NtUserSendInput, ESP).
//
//  This file is the same program with ImGui removed (third-party, ~57k lines).
//  Everything the overlay used from it — font atlas, line/rect/text batching, a
//  small immediate-mode menu — is reimplemented here in ~400 lines of D3D9, so
//  the whole thing is one translation unit plus one generated header.
//
//  Compiles twice:
//    * user mode   -> fortnite_external.exe   (default)
//    * kernel mode -> driver                  (compile with _KERNEL_MODE, WDK)
//
//  UM build (MSVC x64, Developer prompt, from this folder):
//    cl /std:c++17 /O2 /EHsc /W3 /D_CRT_SECURE_NO_WARNINGS fortnite_external.cpp ^
//       /link /SUBSYSTEM:CONSOLE /OUT:fortnite_external.exe
//
//  KM build: new project from the WDK "Empty WDM Driver" template (not KMDF —
//  the driver touches no framework calls), x64/Release, add this .cpp, add
//  _KERNEL_MODE to preprocessor definitions, then
//    msbuild .\fortnite_external.vcxproj /p:Configuration=Release /p:Platform=x64
//
//  Offsets come from offsets_gen.hpp — generated, not hand-written:
//    python3 tools/gen_offsets.py tools/fortnite_offsets_43.00.json > offsets_gen.hpp
//
//  Protocol between the two halves: a 48-byte DRIVER_REQUEST struct whose
//  address is pushed into the kernel by calling NtUserRegisterErrorReportingDialog
//  (win32u.sys -> win32k!g_ulCleanupRoutine). The driver redirects that qword
//  during DriverEntry.
//
//  Rootkit-level driver: test in a VM, and Defender/anti-cheat will flag the
//  artefacts — exclude the build folder before you run anything.
// ============================================================================


// ============================================================================
//  KERNEL MODE  (compile with /D_KERNEL_MODE)
// ============================================================================
#ifdef _KERNEL_MODE

#include <ntifs.h>
#include <stdint.h>

#ifndef IMAGE_SCN_MEM_EXECUTE
#define IMAGE_SCN_MEM_EXECUTE 0x20000000
#endif
#ifndef IMAGE_FIRST_SECTION
#define IMAGE_FIRST_SECTION(ntheader) ((PIMAGE_SECTION_HEADER)((ULONG_PTR)(ntheader) + \
    FIELD_OFFSET(IMAGE_NT_HEADERS64, OptionalHeader) + (ntheader)->FileHeader.SizeOfOptionalHeader))
#endif

static const uintptr_t pmask = (~0xfull << 8) & 0xfffffffffull;

typedef enum _SYSTEM_INFORMATION_CLASS_LOCAL
{
    SystemModuleInformationLocal = 0x0B
} SYSTEM_INFORMATION_CLASS_LOCAL;

typedef struct _RTL_PROCESS_MODULE_INFORMATION_LOCAL
{
    HANDLE Section;
    PVOID  MappedBase;
    PVOID  ImageBase;
    ULONG  ImageSize;
    ULONG  Flags;
    USHORT LoadOrderIndex;
    USHORT InitOrderIndex;
    USHORT LoadCount;
    USHORT OffsetToFileName;
    UCHAR  FullPathName[256];
} RTL_PROCESS_MODULE_INFORMATION_LOCAL;

typedef struct _RTL_PROCESS_MODULES_LOCAL
{
    ULONG NumberOfModules;
    RTL_PROCESS_MODULE_INFORMATION_LOCAL Modules[1];
} RTL_PROCESS_MODULES_LOCAL;

enum REQUEST_TYPE : int { NONE, BASE, WRITE, READ };

typedef struct _DRIVER_REQUEST_LOCAL
{
    REQUEST_TYPE type;
    HANDLE       pid;
    PVOID        address;
    PVOID        buffer;
    SIZE_T       size;
    PVOID        base;
} DRIVER_REQUEST_LOCAL, *PDRIVER_REQUEST_LOCAL;

extern "C"
{
    NTSTATUS NTAPI ZwQuerySystemInformation(ULONG SystemInformationClass, PVOID SystemInformation,
                                            ULONG SystemInformationLength, PULONG ReturnLength);
    PVOID  NTAPI PsGetProcessSectionBaseAddress(PEPROCESS Process);
}

// --- original signature from km/main.cpp: 8 repeats of the same 26-byte stub
#define nt_qword_sig \
    "\x48\x8B\x05\x00\x00\x00\x00\x48\x85\xC0\x74\x06\xFF\x15\x00\x00\x00\x00\x48\x83\xC4\x28\xC3\xCC" \
    "\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\x48\x83\xEC\x38\x48\x8B\x05\x00\x00\x00\x00\x48\x85\xC0\x74\x06" \
    "\xFF\x15\x00\x00\x00\x00\x48\x83\xC4\x38\xC3\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\x48\x83\xEC\x28" \
    "\x48\x8B\x05\x00\x00\x00\x00\x48\x85\xC0\x74\x06\xFF\x15\x00\x00\x00\x00\x48\x83\xC4\x28\xC3\xCC" \
    "\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\x48\x83\xEC\x28\x48\x8B\x05\x00\x00\x00\x00\x48\x85\xC0\x74\x06" \
    "\xFF\x15\x00\x00\x00\x00\x48\x83\xC4\x28\xC3\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\x48\x83\xEC\x28" \
    "\x48\x8B\x05\x00\x00\x00\x00\x48\x85\xC0\x74\x06\xFF\x15\x00\x00\x00\x00\x48\x83\xC4\x28\xC3\xCC" \
    "\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\x48\x83\xEC\x28\x48\x8B\x05\x00\x00\x00\x00\x48\x85\xC0\x74\x06" \
    "\xFF\x15\x00\x00\x00\x00\x48\x83\xC4\x28\xC3\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\x48\x83\xEC\x28" \
    "\x48\x8B\x05\x00\x00\x00\x00\x48\x85\xC0\x74\x06\xFF\x15\x00\x00\x00\x00\x48\x83\xC4\x28\xC3\xCC" \
    "\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\x48\x83\xEC\x28\x48\x8B\x05\x00\x00\x00\x00\x48\x85\xC0\x74\x06" \
    "\xFF\x15\x00\x00\x00\x00\x48\x83\xC4\x28\xC3\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\xCC\x48\x83\xEC\x38"

#define nt_qword_mask "xxx????xxxxxxx????xxxxxxxxxxxxxxxxxxxxx????xxxxxxx????xxxxxxxxxxxxxxxxxxxxx????xxxxxxx????xxxxxxxxxxxxxxxxxxxxx????xxxxxxx????xxxxxxxxxxxxxxxxxxxxx????xxxxxxx????xxxxxxxxxxxxxxxxxxxxx????xxxxxxx????xxxxxxxxxxxxxxxxxxxxx????xxxxxxx????xxxxxxxxxxxxxxxxxxxxx????xxxxxxx????xxxxxxxxxxxxxxxxxx"

namespace kmu
{
    static int kstrcmp(const char* a, const char* b)
    {
        while (*a && *a == *b) { ++a; ++b; }
        return (unsigned char)*a - (unsigned char)*b;
    }

    static PVOID get_system_information(ULONG information_class)
    {
        ULONG size = 32;
        char buffer[32];
        ZwQuerySystemInformation(information_class, buffer, size, &size);

        PVOID info = ExAllocatePoolZero(NonPagedPool, size, 0x736B6572 /* 'reks' as ULONG */);
        if (!info) return 0;

        if (ZwQuerySystemInformation(information_class, info, size, &size) != STATUS_SUCCESS)
        {
            ExFreePool(info);
            return 0;
        }
        return info;
    }

    static uintptr_t get_kernel_module(const char* name)
    {
        const PRTL_PROCESS_MODULES_LOCAL info =
            (PRTL_PROCESS_MODULES_LOCAL)get_system_information(SystemModuleInformationLocal);
        if (!info) return 0;

        for (ULONG i = 0; i < info->NumberOfModules; ++i)
        {
            const auto& module = info->Modules[i];
            const char* file = (const char*)module.FullPathName + module.OffsetToFileName;
            if (kstrcmp(file, name) == 0)
            {
                const uintptr_t address = (uintptr_t)module.ImageBase;
                ExFreePool(info);
                return address;
            }
        }
        ExFreePool(info);
        return 0;
    }

    static size_t kstrlen(const char* text)
    {
        size_t len = 0;
        while (text[len]) ++len;
        return len;
    }

    static uintptr_t pattern_scan_range(uintptr_t base, size_t range, const char* pattern, const char* mask)
    {
        range -= kstrlen(mask);
        for (size_t i = 0; i < range; ++i)
        {
            const char* candidate = (const char*)(base + i);
            const char* m = mask;
            const char* p = pattern;
            bool hit = true;
            for (; *m; ++candidate, ++p, ++m)
            {
                if (*m == 'x' && *candidate != *p) { hit = false; break; }
            }
            if (hit) return base + i;
        }
        return 0;
    }

    static uintptr_t pattern_scan(uintptr_t base, const char* pattern, const char* mask)
    {
        const PIMAGE_NT_HEADERS64 headers =
            (PIMAGE_NT_HEADERS64)(base + ((PIMAGE_DOS_HEADER)base)->e_lfanew);
        const PIMAGE_SECTION_HEADER sections = IMAGE_FIRST_SECTION(headers);

        for (USHORT i = 0; i < headers->FileHeader.NumberOfSections; i++)
        {
            const PIMAGE_SECTION_HEADER section = &sections[i];
            if (section->Characteristics & IMAGE_SCN_MEM_EXECUTE)
            {
                const uintptr_t match = pattern_scan_range(base + section->VirtualAddress,
                                                           section->Misc.VirtualSize, pattern, mask);
                if (match) return match;
            }
        }
        return 0;
    }

    static NTSTATUS read_physical_memory(PVOID address, PVOID buffer, SIZE_T size, PSIZE_T bytes)
    {
        if (!address) return STATUS_UNSUCCESSFUL;
        MM_COPY_ADDRESS to_read = { 0 };
        to_read.PhysicalAddress.QuadPart = (LONGLONG)address;
        return MmCopyMemory(buffer, to_read, size, MM_COPY_MEMORY_PHYSICAL, bytes);
    }

    static NTSTATUS write_physical_memory(PVOID address, PVOID buffer, SIZE_T size, PSIZE_T bytes)
    {
        if (!address) return STATUS_UNSUCCESSFUL;
        PHYSICAL_ADDRESS to_write = { 0 };
        to_write.QuadPart = (LONGLONG)address;
        PVOID mapped = MmMapIoSpaceEx(to_write, size, PAGE_READWRITE);
        if (!mapped) return STATUS_UNSUCCESSFUL;
        RtlCopyMemory(mapped, buffer, size);
        *bytes = size;
        MmUnmapIoSpace(mapped, size);
        return STATUS_SUCCESS;
    }

    // --- CR3 handling / page-table walk, identical to km/utils.hpp -----------
    static ULONG get_winver()
    {
        RTL_OSVERSIONINFOW ver = { 0 };
        RtlGetVersion(&ver);
        switch (ver.dwBuildNumber)
        {
        case 17134: case 17763:                 return 0x0278;
        case 18362: case 18363:                 return 0x0280;
        case 19041: case 19042: case 19043:
        case 19044: case 19045:                 return 0x0388;
        case 22000: case 22621:                 return 0x0390;
        default:                                return 0x0390;
        }
    }

    static uintptr_t saved_dirbase = 0;
    static bool      already_attached = false;

    static uintptr_t get_process_cr3(PEPROCESS pprocess)
    {
        if (!pprocess) return 0;
        uintptr_t process_dirbase = *(uintptr_t*)((UINT8*)pprocess + 0x28);
        if (process_dirbase == 0)
        {
            process_dirbase = *(uintptr_t*)((UINT8*)pprocess + get_winver());
        }
        if ((process_dirbase >> 0x38) == 0x40)
        {
            if (!already_attached)
            {
                KAPC_STATE apc_state{};
                KeStackAttachProcess(pprocess, &apc_state);
                saved_dirbase = __readcr3();
                KeUnstackDetachProcess(&apc_state);
                already_attached = true;
            }
            if (saved_dirbase) return saved_dirbase;
        }
        return process_dirbase;
    }

    static uintptr_t translate_linear(uintptr_t directory_table_base, uintptr_t virtual_address)
    {
        directory_table_base &= ~0xf;
        uintptr_t pageoffset = virtual_address & ~(~0ull << 12);
        uintptr_t pte  = (virtual_address >> 12) & 0x1ffll;
        uintptr_t pt   = (virtual_address >> 21) & 0x1ffll;
        uintptr_t pd   = (virtual_address >> 30) & 0x1ffll;
        uintptr_t pdp  = (virtual_address >> 39) & 0x1ffll;
        SIZE_T readsize = 0;

        uintptr_t pdpe = 0;
        read_physical_memory((PVOID)(directory_table_base + 8 * pdp), &pdpe, sizeof(pdpe), &readsize);
        if (~pdpe & 1) return 0;

        uintptr_t pde = 0;
        read_physical_memory((PVOID)((pdpe & pmask) + 8 * pd), &pde, sizeof(pde), &readsize);
        if (~pde & 1) return 0;

        if (pde & 0x80)
            return (pde & (~0ull << 42 >> 12)) + (virtual_address & ~(~0ull << 30));

        uintptr_t ptraddr = 0;
        read_physical_memory((PVOID)((pde & pmask) + 8 * pt), &ptraddr, sizeof(ptraddr), &readsize);
        if (~ptraddr & 1) return 0;

        if (ptraddr & 0x80)
            return (ptraddr & pmask) + (virtual_address & ~(~0ull << 21));

        virtual_address = 0;
        read_physical_memory((PVOID)((ptraddr & pmask) + 8 * pte), &virtual_address, sizeof(virtual_address), &readsize);
        virtual_address &= pmask;
        if (!virtual_address) return 0;
        return virtual_address + pageoffset;
    }

    static NTSTATUS read_process_memory(PDRIVER_REQUEST_LOCAL in)
    {
        if (!in->pid) return STATUS_UNSUCCESSFUL;
        PEPROCESS process = 0;
        PsLookupProcessByProcessId(in->pid, &process);
        if (!process) return STATUS_UNSUCCESSFUL;

        uintptr_t dirbase = get_process_cr3(process);
        ObDereferenceObject(process);
        if (!dirbase) return STATUS_UNSUCCESSFUL;

        uintptr_t physical = translate_linear(dirbase, (uintptr_t)in->address);
        if (!physical) return STATUS_UNSUCCESSFUL;

        SIZE_T remaining = in->size;
        SIZE_T done = 0;
        while (remaining)
        {
            SIZE_T chunk = PAGE_SIZE - (physical & 0xFFF);
            if (chunk > remaining) chunk = remaining;
            SIZE_T bytes = 0;
            if (!NT_SUCCESS(read_physical_memory((PVOID)physical, (PUCHAR)in->buffer + done, chunk, &bytes)))
                return STATUS_PARTIAL_COPY;
            done += chunk;
            physical += chunk;
            remaining -= chunk;
        }
        return STATUS_SUCCESS;
    }

    static NTSTATUS write_process_memory(PDRIVER_REQUEST_LOCAL in)
    {
        if (!in->pid) return STATUS_UNSUCCESSFUL;
        PEPROCESS process = 0;
        PsLookupProcessByProcessId(in->pid, &process);
        if (!process) return STATUS_UNSUCCESSFUL;

        uintptr_t dirbase = get_process_cr3(process);
        ObDereferenceObject(process);
        if (!dirbase) return STATUS_UNSUCCESSFUL;

        uintptr_t physical = translate_linear(dirbase, (uintptr_t)in->address);
        if (!physical) return STATUS_UNSUCCESSFUL;

        SIZE_T remaining = in->size;
        SIZE_T done = 0;
        while (remaining)
        {
            SIZE_T chunk = PAGE_SIZE - (physical & 0xFFF);
            if (chunk > remaining) chunk = remaining;
            SIZE_T bytes = 0;
            if (!NT_SUCCESS(write_physical_memory((PVOID)physical, (PUCHAR)in->buffer + done, chunk, &bytes)))
                return STATUS_PARTIAL_COPY;
            done += chunk;
            physical += chunk;
            remaining -= chunk;
        }
        return STATUS_SUCCESS;
    }

    static PVOID get_base_address(PDRIVER_REQUEST_LOCAL in)
    {
        if (!in->pid) return 0;
        PEPROCESS process = 0;
        PsLookupProcessByProcessId(in->pid, &process);
        if (!process) return 0;
        PVOID image_base = PsGetProcessSectionBaseAddress(process);
        ObDereferenceObject(process);
        return image_base;
    }
}

static uintptr_t* g_callback_slot = nullptr;
static uintptr_t  g_callback_original = 0;

static long long request_handler(uintptr_t request)
{
    PDRIVER_REQUEST_LOCAL in = reinterpret_cast<PDRIVER_REQUEST_LOCAL>(request);
    switch (in->type)
    {
    case BASE:  in->base = kmu::get_base_address(in);      break;
    case WRITE: kmu::write_process_memory(in);             break;
    case READ:  kmu::read_process_memory(in);              break;
    default:                                               break;
    }
    return 0;
}

extern "C" VOID km_unload(PDRIVER_OBJECT)
{
    // put the original routine back so win32k does not call into freed code
    if (g_callback_slot) *g_callback_slot = g_callback_original;
}

extern "C" NTSTATUS DriverEntry(PDRIVER_OBJECT drv, PUNICODE_STRING)
{
    const uintptr_t win32k = kmu::get_kernel_module("win32k.sys");
    if (!win32k) return STATUS_FAILED_DRIVER_ENTRY;

    const uintptr_t nt_qword = kmu::pattern_scan(win32k, nt_qword_sig, nt_qword_mask);
    if (!nt_qword) return STATUS_FAILED_DRIVER_ENTRY;

    // mov rax, [rip+disp32] -> resolve the qword the stub points at
    const uintptr_t slot = nt_qword + *(int*)((PUCHAR)nt_qword + 3) + 7;

    g_callback_slot = reinterpret_cast<uintptr_t*>(slot);
    g_callback_original = *g_callback_slot;
    *g_callback_slot = reinterpret_cast<uintptr_t>(&request_handler);

    drv->DriverUnload = km_unload;
    return STATUS_SUCCESS;
}

// ============================================================================
//  USER MODE
// ============================================================================
#else // _KERNEL_MODE

#include <Windows.h>
#include <TlHelp32.h>
#include <dwmapi.h>
#include <d3d9.h>
#include <cstdint>
#include <cmath>
#include <cfloat>
#include <cstdio>
#include <cstring>
#include <vector>
#include <psapi.h>

#pragma comment(lib, "d3d9.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "psapi.lib")

// ---------------------------------------------------------------------------
//  CONFIG — one place to tune. Menu overrides the mutable copies at runtime.
// ---------------------------------------------------------------------------
namespace cfg
{
    constexpr const wchar_t* kProcessName = L"FortniteClient-Win64-Shipping.exe";

    constexpr int   kTickMs        = 4;              // read/aim poll rate
    constexpr int   kAimKey        = VK_RBUTTON;     // held
    constexpr int   kMenuKey       = VK_INSERT;      // toggle
    constexpr int   kExitKey       = VK_END;         // hard unload
    constexpr float kFovPx         = 150.f;
    constexpr float kAimSmoothing  = 5.f;
    constexpr int   kHeadBone      = 109;
    constexpr float kMaxScreenStep = 60.f;           // px per tick, stops snapping across the screen
    constexpr int   kRootBone      = 0;
    constexpr bool  kTeamCheck     = true;
    // OffsetDeck gives byte offsets for bitfields but no bit index, so anything
    // gated on a bit reads whole-byte by default and the bit checks are opt-in.
    constexpr bool  kVisibleOnly   = false;          // aim only at recently-rendered meshes
    constexpr bool  kSkipSpectators = false;
    constexpr bool  kMarkDowned    = false;

    // FILL: bRecentlyRendered bit inside the byte at off::RecentlyRendered (0x7E1).
    //       Dump it: read that byte on a visible enemy vs an occluded one.
    constexpr uint8_t kRecentlyRenderedBit = 0x01;   // used only when kVisibleOnly
    // FILL: bIsSpectator bit inside the byte at off::bIsSpectator (PlayerState 0x282)
    constexpr uint8_t bIsSpectatorBit      = 0x01;
    // FILL: bIsDBNO bit inside the byte at off::bIsDBNO (FortPawn 0x892)
    constexpr uint8_t bIsDBNOBit           = 0x01;

    constexpr bool  kUseCallbackDriver = true;       // false -> OpenProcess/ReadProcessMemory fallback
    constexpr bool  kUseSpoofedInput   = true;       // false -> plain SendInput
    constexpr bool  kTryUiAccessBand   = true;       // requires a signed binary in a trusted path
    constexpr int   kFontPx            = 14;

    // GWorld. Three chances, in order: the generated header, a manual value, then
    // a runtime scan of the image's writable data for a self-consistent UWorld.
    constexpr uintptr_t kUWorldFallback = 0x0;   // optional, if you have the number
    constexpr bool      kAutoResolveUWorld = true;
    // scan window: GWorld lives in the module's .data, well past the code
    constexpr uintptr_t kScanStart = 0x8000000;
    constexpr uintptr_t kScanEnd   = 0x20000000;
}

// ---------------------------------------------------------------------------
//  OFFSETS — generated from an OffsetDeck Fortnite dump (v43.00), see
//  tools/gen_offsets.py. Regenerate per patch, don't hand-edit offsets_gen.hpp.
//
//  `sch::table` keeps the full dump (240 structs, ~5900 fields) so new features
//  can pull a field by name at runtime instead of regenerating the header.
// ---------------------------------------------------------------------------
#include "offsets_gen.hpp"

// ---------------------------------------------------------------------------
//  settings (um/settings.hpp)
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
        inline bool enable   = false;
        inline bool box      = false;
        inline bool fill_box = false;
        inline bool line     = false;
        inline bool distance = false;
        inline bool health_bar = false;
    }
}

// ---------------------------------------------------------------------------
//  librarys (um/librarys.hpp)
// ---------------------------------------------------------------------------
namespace librarys
{
    inline HMODULE user32 = nullptr;
    inline HMODULE win32u = nullptr;

    inline bool init()
    {
        LoadLibraryA("user32.dll");
        LoadLibraryA("win32u.dll");
        user32 = GetModuleHandleA("user32.dll");
        win32u = GetModuleHandleA("win32u.dll");
        return user32 && win32u;
    }
}

// ---------------------------------------------------------------------------
//  driver client (um/driver.hpp)
// ---------------------------------------------------------------------------
namespace km
{
    enum REQUEST_TYPE : int { NONE, BASE, WRITE, READ };

    struct DRIVER_REQUEST
    {
        REQUEST_TYPE type;
        HANDLE       pid;
        void*        address;
        void*        buffer;
        SIZE_T       size;
        void*        base;
    };
}

class Mem
{
public:
    DWORD     pid  = 0;
    uintptr_t base = 0;

    bool attach(const wchar_t* process_name)
    {
        pid = find_pid(process_name);
        if (!pid) return false;

        if (cfg::kUseCallbackDriver && setup_callback())
        {
            base = get_base_address();
            if (base) return true;
            via_driver = false;
        }

        hproc = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, FALSE, pid);
        if (!hproc) return false;

        HMODULE mods[1024];
        DWORD needed = 0;
        if (!EnumProcessModules(hproc, mods, sizeof(mods), &needed)) return false;
        base = reinterpret_cast<uintptr_t>(mods[0]);
        return base != 0;
    }

    bool alive() const { return pid != 0 && base != 0; }

    template <typename T>
    T read(uintptr_t address)
    {
        T out{};
        if (!address) return out;
        read_raw(reinterpret_cast<void*>(address), &out, sizeof(T));
        return out;
    }

    template <typename T>
    void write(uintptr_t address, T value)
    {
        if (!address) return;
        write_raw(reinterpret_cast<void*>(address), &value, sizeof(T));
    }

    bool read_raw(void* address, void* buffer, SIZE_T size)
    {
        if (via_driver)
        {
            km::DRIVER_REQUEST req{};
            req.type = km::READ;
            req.pid  = reinterpret_cast<HANDLE>(static_cast<uintptr_t>(pid));
            req.address = address;
            req.buffer  = buffer;
            req.size    = size;
            send_request(&req);
            return true;
        }
        return ReadProcessMemory(hproc, address, buffer, size, nullptr) != 0;
    }

    void write_raw(void* address, void* buffer, SIZE_T size)
    {
        if (via_driver)
        {
            km::DRIVER_REQUEST req{};
            req.type = km::WRITE;
            req.pid  = reinterpret_cast<HANDLE>(static_cast<uintptr_t>(pid));
            req.address = address;
            req.buffer  = buffer;
            req.size    = size;
            send_request(&req);
            return;
        }
        WriteProcessMemory(hproc, address, buffer, size, nullptr);
    }

private:
    using nt_user_fn = long long(*)(uintptr_t);

    nt_user_fn callback = nullptr;
    HANDLE     hproc    = nullptr;
    bool       via_driver = false;

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

    bool setup_callback()
    {
        callback = reinterpret_cast<nt_user_fn>(
            GetProcAddress(librarys::user32, "NtUserRegisterErrorReportingDialog"));
        if (!callback)
            callback = reinterpret_cast<nt_user_fn>(
                GetProcAddress(librarys::win32u, "NtUserRegisterErrorReportingDialog"));
        if (!callback) return false;
        via_driver = true;
        return true;
    }

    uintptr_t get_base_address()
    {
        km::DRIVER_REQUEST req{};
        req.type = km::BASE;
        req.pid  = reinterpret_cast<HANDLE>(static_cast<uintptr_t>(pid));
        send_request(&req);   // driver zeroes the struct before dispatching
        return reinterpret_cast<uintptr_t>(req.base);
    }

    void send_request(km::DRIVER_REQUEST* out)
    {
        if (!callback) return;
        callback(reinterpret_cast<uintptr_t>(out));
    }
};

inline Mem mem;

// ---------------------------------------------------------------------------
//  input (um/input.hpp)
//  Spoofed NtUserSendInput: the first 30 bytes of the real stub get copied into
//  fresh RWX memory and invoked there, so the call does not originate from the
//  user32 section. Validated before use; falls back to SendInput otherwise.
// ---------------------------------------------------------------------------
namespace input
{
    inline BYTE        stub_bytes[30];
    inline void*       stub_page = nullptr;
    inline bool        ready     = false;
    inline double      acc_x = 0.0, acc_y = 0.0;

    inline bool init()
    {
        if (!cfg::kUseSpoofedInput) return true;

        void* addr = reinterpret_cast<void*>(GetProcAddress(librarys::user32, "NtUserSendInput"));
        if (!addr) addr = reinterpret_cast<void*>(GetProcAddress(librarys::win32u, "NtUserSendInput"));
        if (!addr) return false;

        memcpy(stub_bytes, addr, sizeof(stub_bytes));

        // 4C 8B D1          mov r10, rcx
        // B8 imm32          mov eax, <ssn>
        if (!(stub_bytes[0] == 0x4C && stub_bytes[1] == 0x8B && stub_bytes[2] == 0xD1 && stub_bytes[3] == 0xB8))
            return false;  // hooked / different stub shape -> use SendInput

        stub_page = VirtualAlloc(nullptr, 0x1000, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
        if (!stub_page) return false;

        memcpy(stub_page, stub_bytes, sizeof(stub_bytes));
        ready = true;
        return true;
    }

    inline bool send(UINT count, LPINPUT inputs, int size)
    {
        if (ready && stub_page)
        {
            using fn_t = LONG(NTAPI*)(UINT, LPINPUT, int);
            const LONG status = reinterpret_cast<fn_t>(stub_page)(count, inputs, size);
            if (status > 0) return true;
        }
        return SendInput(count, inputs, size) == count;
    }

    inline bool move_mouse(double dx, double dy)
    {
        acc_x += dx;
        acc_y += dy;

        const int mx = static_cast<int>(acc_x);
        const int my = static_cast<int>(acc_y);
        if (mx == 0 && my == 0) return true;

        acc_x -= mx;
        acc_y -= my;

        INPUT input{};
        input.type       = INPUT_MOUSE;
        input.mi.dx      = mx;
        input.mi.dy      = my;
        input.mi.dwFlags = MOUSEEVENTF_MOVE;
        return send(1, &input, sizeof(input));
    }
}

// ---------------------------------------------------------------------------
//  math + SDK (um/sdk.hpp)
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
        return sqrt(dx * dx + dy * dy + dz * dz);
    }

    Vector3 operator-(const Vector3& v) const { return Vector3(x - v.x, y - v.y, z - v.z); }
};

struct FQuat { double x, y, z, w; };

// UE5 LWC: FQuat is double[4], FVector is double[3], so FTransform =
// 32 (rot) + 24 (translation) + 8 (pad to 16) + 24 (scale) + 8 (pad) = 0x60.
// FTransform3f (float path used by the renderer's cached bone arrays) = 0x30.
struct FTransform
{
    FQuat   rot;          // 0x00
    Vector3 translation;  // 0x20
    char    pad[8];       // 0x38
    Vector3 scale;        // 0x40
    char    pad1[8];      // 0x58

    D3DMATRIX to_matrix_with_scale() const
    {
        D3DMATRIX m{};
        m._41 = static_cast<float>(translation.x);
        m._42 = static_cast<float>(translation.y);
        m._43 = static_cast<float>(translation.z);

        const float x2 = static_cast<float>(rot.x + rot.x);
        const float y2 = static_cast<float>(rot.y + rot.y);
        const float z2 = static_cast<float>(rot.z + rot.z);
        const float xx2 = static_cast<float>(rot.x) * x2;
        const float yy2 = static_cast<float>(rot.y) * y2;
        const float zz2 = static_cast<float>(rot.z) * z2;

        const float sx = static_cast<float>(scale.x);
        const float sy = static_cast<float>(scale.y);
        const float sz = static_cast<float>(scale.z);

        m._11 = (1.0f - (yy2 + zz2)) * sx;
        m._22 = (1.0f - (xx2 + zz2)) * sy;
        m._33 = (1.0f - (xx2 + yy2)) * sz;

        const float yz2 = static_cast<float>(rot.y) * z2;
        const float wx2 = static_cast<float>(rot.w) * x2;
        m._32 = (yz2 - wx2) * sz;
        m._23 = (yz2 + wx2) * sy;

        const float xy2 = static_cast<float>(rot.x) * y2;
        const float wz2 = static_cast<float>(rot.w) * z2;
        m._21 = (xy2 - wz2) * sy;
        m._12 = (xy2 + wz2) * sx;

        const float xz2 = static_cast<float>(rot.x) * z2;
        const float wy2 = static_cast<float>(rot.w) * y2;
        m._31 = (xz2 + wy2) * sz;
        m._13 = (xz2 - wy2) * sx;

        m._14 = 0.0f; m._24 = 0.0f; m._34 = 0.0f; m._44 = 1.0f;
        return m;
    }
};

inline D3DMATRIX matrix_multiplication(const D3DMATRIX& a, const D3DMATRIX& b)
{
    D3DMATRIX o{};
    const float* pa = &a._11;
    const float* pb = &b._11;
    float* po = &o._11;
    for (int r = 0; r < 4; ++r)
        for (int c = 0; c < 4; ++c)
        {
            float sum = 0.f;
            for (int k = 0; k < 4; ++k) sum += pa[r * 4 + k] * pb[k * 4 + c];
            po[r * 4 + c] = sum;
        }
    return o;
}

inline D3DMATRIX rotation_matrix(const Vector3& rot, const Vector3& origin = Vector3())
{
    // Unreal rotation (pitch, yaw, roll) in degrees -> column-vector basis
    const float radpitch = static_cast<float>(rot.x * M_PI / 180.0);
    const float radyaw   = static_cast<float>(rot.y * M_PI / 180.0);
    const float radroll  = static_cast<float>(rot.z * M_PI / 180.0);

    const float sp = sinf(radpitch), cp = cosf(radpitch);
    const float sy = sinf(radyaw),   cy = cosf(radyaw);
    const float sr = sinf(radroll),  cr = cosf(radroll);

    D3DMATRIX m{};
    m.m[0][0] = cp * cy;
    m.m[0][1] = cp * sy;
    m.m[0][2] = sp;
    m.m[0][3] = 0.f;
    m.m[1][0] = sr * sp * cy - cr * sy;
    m.m[1][1] = sr * sp * sy + cr * cy;
    m.m[1][2] = -sr * cp;
    m.m[1][3] = 0.f;
    m.m[2][0] = -(cr * sp * cy + sr * sy);
    m.m[2][1] = cy * sr - cr * sp * sy;
    m.m[2][2] = cr * cp;
    m.m[2][3] = 0.f;
    m.m[3][0] = static_cast<float>(origin.x);
    m.m[3][1] = static_cast<float>(origin.y);
    m.m[3][2] = static_cast<float>(origin.z);
    m.m[3][3] = 1.f;
    return m;
}

inline D3DMATRIX identity_matrix()
{
    D3DMATRIX m{};
    m._11 = m._22 = m._33 = m._44 = 1.f;
    return m;
}

// FVector3f read into a double Vector3 (the dump's world fields are float even
// in UE5 — only the double-precision actor locations are LWC)
inline Vector3 read_vector3f(uintptr_t address)
{
    return Vector3(mem.read<float>(address),
                   mem.read<float>(address + 4),
                   mem.read<float>(address + 8));
}

inline bool valid_vector(const Vector3& v)
{
    // reject NaN/denormals and anything outside the playable world box
    const double limit = 200000.0;
    return std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z) &&
           fabs(v.x) < limit && fabs(v.y) < limit && fabs(v.z) < limit;
}

// SceneComponent local transform (relative loc / rot / scale) as a matrix,
// column-vector convention to match D3D row-major storage.
inline D3DMATRIX local_transform_matrix(const Vector3& location, const Vector3& rotation, const Vector3& scale)
{
    D3DMATRIX out = rotation_matrix(rotation);
    out._11 = static_cast<float>(out._11 * scale.x);
    out._12 = static_cast<float>(out._12 * scale.x);
    out._13 = static_cast<float>(out._13 * scale.x);
    out._21 = static_cast<float>(out._21 * scale.y);
    out._22 = static_cast<float>(out._22 * scale.y);
    out._23 = static_cast<float>(out._23 * scale.y);
    out._31 = static_cast<float>(out._31 * scale.z);
    out._32 = static_cast<float>(out._32 * scale.z);
    out._33 = static_cast<float>(out._33 * scale.z);
    out._41 = static_cast<float>(location.x);
    out._42 = static_cast<float>(location.y);
    out._43 = static_cast<float>(location.z);
    return out;
}

// Bone array. OffsetDeck does not expose `BoneArray`, only
// SkeletalMeshComponent::CachedBoneSpaceTransforms (0x9B8), which the renderer
// fills with FTransform3f (float, 0x30 stride). If you dump the real bone array
// pointer, drop it into off::BoneArray and it wins over the cache path.
inline D3DMATRIX cached_bone_matrix(uintptr_t mesh, int bone_id)
{
    if (!mesh) return identity_matrix();

    uintptr_t bones = off::BoneArray ? mem.read<uintptr_t>(mesh + off::BoneArray) : 0;
    uintptr_t stride = 0x30;
    if (!bones)
    {
        bones = mem.read<uintptr_t>(mesh + off::BoneSpaceTransforms);
        stride = 0x30;
    }
    if (!bones) return identity_matrix();

    const uintptr_t at = bones + static_cast<uintptr_t>(bone_id) * stride;

    // FTransform3f: quat 0x00 (16B), translation 0x10 (12B), scale 0x20 (12B)
    FTransform bone{};
    bone.rot.x         = mem.read<float>(at + 0x00);
    bone.rot.y         = mem.read<float>(at + 0x04);
    bone.rot.z         = mem.read<float>(at + 0x08);
    bone.rot.w         = mem.read<float>(at + 0x0C);
    bone.translation.x = mem.read<float>(at + 0x10);
    bone.translation.y = mem.read<float>(at + 0x14);
    bone.translation.z = mem.read<float>(at + 0x18);
    bone.scale.x       = mem.read<float>(at + 0x20);
    bone.scale.y       = mem.read<float>(at + 0x24);
    bone.scale.z       = mem.read<float>(at + 0x28);

    return bone.to_matrix_with_scale();
}

struct Camera
{
    Vector3 location;
    Vector3 rotation;   // pitch, yaw, roll in degrees
    float   fov = 90.f;
};

namespace cache
{
    inline uintptr_t uworld = 0;
    inline uintptr_t game_instance = 0;
    inline uintptr_t local_players = 0;
    inline uintptr_t player_controller = 0;
    inline uintptr_t local_pawn = 0;
    inline uintptr_t local_root = 0;
    inline uintptr_t player_state = 0;
    inline uintptr_t game_state = 0;
    inline uintptr_t player_array = 0;

    inline Vector3   relative_location;
    inline int       my_team_id = 0;
    inline int       player_count = 0;

    inline float     closest_distance = 0.f;
    inline uintptr_t closest_mesh = 0;

    inline Camera    camera;   // refreshed once per tick, not once per projection
}

// The one number the dump does not ship: GWorld (the UWorld**) base offset in
// FortniteClient-Win64-Shipping.exe. It changes every patch.
// Cheap validity gate used while scanning: every hop must land in user space and
// be 8-byte aligned, which kills the vast majority of false positives.
inline bool plausible_ptr(uintptr_t p)
{
    return p > 0x10000 && p < 0x7FFFFFFFFFFFULL && (p % sizeof(void*)) == 0;
}

// Is `candidate` a UWorld? Walk the two pointers the cheat actually needs and
// check they resolve: OwningGameInstance -> LocalPlayers (a TArray's data ptr),
// and GameState. Two independent hops landing as pointers is a very strong
// signature; a random qword in .data almost never passes both.
inline bool looks_like_uworld(uintptr_t candidate)
{
    if (!plausible_ptr(candidate)) return false;

    const uintptr_t game_instance = mem.read<uintptr_t>(candidate + off::GameInstance);
    if (!plausible_ptr(game_instance)) return false;

    const uintptr_t local_players = mem.read<uintptr_t>(game_instance + off::LocalPlayers);
    if (!plausible_ptr(local_players)) return false;

    const uintptr_t game_state = mem.read<uintptr_t>(candidate + off::GameState);
    if (!plausible_ptr(game_state)) return false;

    // GameStateBase::PlayerArray is a TArray; its Data ptr must be valid too
    const uintptr_t player_array = mem.read<uintptr_t>(game_state + off::PlayerArray);
    if (!plausible_ptr(player_array)) return false;

    return true;
}

inline uintptr_t scan_for_uworld()
{
    for (uintptr_t at = cfg::kScanStart; at < cfg::kScanEnd; at += sizeof(uintptr_t))
    {
        const uintptr_t world = mem.read<uintptr_t>(mem.base + at);
        if (!plausible_ptr(world)) continue;

        if (looks_like_uworld(world))
        {
            printf("[*] UWorld resolved by scan: base+0x%llX -> 0x%llX\n",
                   static_cast<unsigned long long>(at),
                   static_cast<unsigned long long>(world));
            return world;
        }
    }
    return 0;
}

inline uintptr_t resolve_uworld()
{
    const uintptr_t from_base = mem.read<uintptr_t>(mem.base + off::UWorld);
    if (plausible_ptr(from_base) && looks_like_uworld(from_base)) return from_base;

    if (cfg::kUWorldFallback)
    {
        const uintptr_t from_image = mem.read<uintptr_t>(mem.base + cfg::kUWorldFallback);
        if (plausible_ptr(from_image) && looks_like_uworld(from_image)) return from_image;
    }

    if (cfg::kAutoResolveUWorld)
        return scan_for_uworld();

    return 0;
}

// Camera comes from APlayerCameraManager::CameraCachePrivate (FCameraCacheEntry),
// whose first member after the timestamp is FMinimalViewInfo POV at +0x10:
//   POV+0x00 FVector Location, POV+0x18 FRotator Rotation, POV+0x30 float FOV.
// This replaces the original source's UWorld+0x110/0x120 double-matrix hack,
// which does not exist with the same layout in UE5.
inline Camera get_view_point()
{
    Camera view{};

    if (!cache::player_controller) return view;

    const uintptr_t camera_manager = mem.read<uintptr_t>(cache::player_controller + off::PlayerCameraManager);
    if (!camera_manager) return view;

    const uintptr_t cache_entry = camera_manager + off::CameraCachePrivate;
    const uintptr_t pov = cache_entry + off::CameraPOV;

    const Vector3 location = read_vector3f(pov + off::CameraLocation);
    const Vector3 rotation = read_vector3f(pov + off::CameraRotation);   // pitch, yaw, roll
    float fov = mem.read<float>(pov + off::CameraFOV);

    if (!(fov > 1.f && fov < 180.f)) fov = 90.f;

    view.location = location;
    view.rotation = rotation;
    view.fov = fov;
    return view;
}

// Rotation-basis projection off the cached camera. Unreal convention, Y inverted.
inline Vector2 project_world_to_screen(const Vector3& world)
{
    const D3DMATRIX m = rotation_matrix(cache::camera.rotation);

    const Vector3 axis_x(m.m[0][0], m.m[0][1], m.m[0][2]);
    const Vector3 axis_y(m.m[1][0], m.m[1][1], m.m[1][2]);
    const Vector3 axis_z(m.m[2][0], m.m[2][1], m.m[2][2]);

    const Vector3 delta = world - cache::camera.location;
    Vector3 transformed(delta.dot(axis_y), delta.dot(axis_z), delta.dot(axis_x));
    if (transformed.z < 1.0) transformed.z = 1.0;

    const double f = (settings::center_x / tan(cache::camera.fov * M_PI / 360.0)) / transformed.z;
    return Vector2(settings::center_x + transformed.x * f,
                   settings::center_y - transformed.y * f);
}

// ComponentToWorld is private in this dump (SceneComponent exposes only the
// relative transform + AttachParent), so the world transform is rebuilt by
// walking up the attach chain and composing:
//   world = parent_world * local(relative loc/rot/scale)
// Depth-capped because a broken AttachParent link reads as garbage, and the
// cheap range checks below reject those instead of letting NaN into the W2S.
inline D3DMATRIX build_component_to_world(uintptr_t component)
{
    D3DMATRIX world = identity_matrix();

    D3DMATRIX chain[16];
    int depth = 0;
    uintptr_t current = component;

    while (current && depth < 16)
    {
        // FRotator = 3 floats (pitch, yaw, roll); FVector = 3 floats
        const Vector3 loc   = read_vector3f(current + off::RelativeLocation);
        const Vector3 rot   = read_vector3f(current + off::RelativeRotation);
        const Vector3 scale = read_vector3f(current + off::RelativeScale3D);

        if (!valid_vector(loc) || !valid_vector(scale)) break;

        chain[depth++] = local_transform_matrix(loc, rot, scale);
        current = mem.read<uintptr_t>(current + off::AttachParent);
    }

    for (int i = depth - 1; i >= 0; --i)
        world = matrix_multiplication(chain[i], world);

    return world;
}

inline Vector3 bone_world_location(uintptr_t mesh, int bone_id)
{
    if (!mesh || bone_id < 0) return Vector3();

    const D3DMATRIX bone_to_component = cached_bone_matrix(mesh, bone_id);
    const D3DMATRIX component_to_world = build_component_to_world(mesh);

    const D3DMATRIX world = matrix_multiplication(bone_to_component, component_to_world);
    const Vector3 out(world._41, world._42, world._43);

    return valid_vector(out) ? out : Vector3();
}

// alias kept so the original source's naming still reads the same
inline Vector3 get_entity_bone(uintptr_t mesh, int bone_id) { return bone_world_location(mesh, bone_id); }

// bRecentlyRendered is the dump's replacement for LastSubmitTime /
// LastRenderTimeOnScreen (those moved to private PrimitiveComponent::SceneProxy
// bookkeeping). It is a bitfield, one bit at 0x7E1.
inline bool is_visible(uintptr_t mesh)
{
    if (!mesh) return false;
    const uint8_t flags = mem.read<uint8_t>(mesh + off::RecentlyRendered);
    return (flags & cfg::kRecentlyRenderedBit) != 0;
}

// ---------------------------------------------------------------------------
//  UIACCESS band window (um/gui.hpp)
// ---------------------------------------------------------------------------
namespace gui
{
    using fn_create_window_in_band = HWND(WINAPI*)(DWORD, ATOM, LPCWSTR, DWORD, int, int, int, int,
                                                   HWND, HMENU, HINSTANCE, LPVOID, DWORD);

    enum ZBID
    {
        ZBID_DEFAULT = 0,
        ZBID_DESKTOP = 1,
        ZBID_UIACCESS = 2,
    };

    inline fn_create_window_in_band create_window_in_band = nullptr;

    inline DWORD duplicate_winlogon_token(DWORD session_id, DWORD desired_access, PHANDLE out_token)
    {
        DWORD err = ERROR_NOT_FOUND;
        PRIVILEGE_SET ps{};
        ps.PrivilegeCount = 1;
        ps.Control = PRIVILEGE_SET_ALL_NECESSARY;
        if (!LookupPrivilegeValueA(nullptr, SE_TCB_NAME, &ps.Privilege[0].Luid)) return GetLastError();

        HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snap == INVALID_HANDLE_VALUE) return GetLastError();

        PROCESSENTRY32W pe{};
        pe.dwSize = sizeof(pe);
        bool found = false;
        for (BOOL cont = Process32FirstW(snap, &pe); cont; cont = Process32NextW(snap, &pe))
        {
            if (_wcsicmp(pe.szExeFile, L"winlogon.exe") != 0) continue;

            HANDLE process_handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pe.th32ProcessID);
            if (!process_handle) continue;

            HANDLE token_handle = nullptr;
            if (OpenProcessToken(process_handle, TOKEN_QUERY | TOKEN_DUPLICATE, &token_handle))
            {
                BOOL has_tcb = FALSE;
                DWORD retlen = 0, sid = 0;
                if (PrivilegeCheck(token_handle, &ps, &has_tcb) && has_tcb &&
                    GetTokenInformation(token_handle, TokenSessionId, &sid, sizeof(sid), &retlen) &&
                    sid == session_id)
                {
                    found = true;
                    if (DuplicateTokenEx(token_handle, desired_access, nullptr, SecurityImpersonation,
                                         TokenImpersonation, out_token))
                        err = ERROR_SUCCESS;
                    else
                        err = GetLastError();
                }
                CloseHandle(token_handle);
            }
            CloseHandle(process_handle);
            if (found) break;
        }
        CloseHandle(snap);
        return err;
    }

    inline DWORD create_ui_access_token(PHANDLE out_token)
    {
        DWORD err = ERROR_SUCCESS;
        HANDLE self_token = nullptr;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY | TOKEN_DUPLICATE, &self_token))
            return GetLastError();

        DWORD session_id = 0, retlen = 0;
        if (!GetTokenInformation(self_token, TokenSessionId, &session_id, sizeof(session_id), &retlen))
        {
            CloseHandle(self_token);
            return GetLastError();
        }

        HANDLE system_token = nullptr;
        err = duplicate_winlogon_token(session_id, TOKEN_IMPERSONATE, &system_token);
        if (err == ERROR_SUCCESS)
        {
            if (SetThreadToken(nullptr, system_token))
            {
                if (!DuplicateTokenEx(self_token,
                                      TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_ASSIGN_PRIMARY | TOKEN_ADJUST_DEFAULT,
                                      nullptr, SecurityAnonymous, TokenPrimary, out_token))
                    err = GetLastError();
                else
                {
                    BOOL ui_access = TRUE;
                    if (!SetTokenInformation(*out_token, TokenUIAccess, &ui_access, sizeof(ui_access)))
                    {
                        err = GetLastError();
                        CloseHandle(*out_token);
                    }
                }
                RevertToSelf();
            }
            else err = GetLastError();
            CloseHandle(system_token);
        }
        CloseHandle(self_token);
        return err;
    }

    inline BOOL check_for_ui_access(bool* ui_access)
    {
        HANDLE token = nullptr;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return FALSE;

        DWORD value = 0, retlen = 0;
        BOOL result = GetTokenInformation(token, TokenUIAccess, &value, sizeof(value), &retlen);
        *ui_access = value != 0;
        CloseHandle(token);
        return result;
    }

    // Re-launches the process with a UIAccess primary token. Requires the binary
    // to be signed and sitting in a trusted location (Program Files), otherwise
    // CreateProcessAsUser fails and we fall back to a normal overlay window.
    inline DWORD prepare_for_ui_access()
    {
        bool ui_access = false;
        if (!check_for_ui_access(&ui_access)) return GetLastError();
        if (ui_access) return ERROR_SUCCESS;

        HANDLE token = nullptr;
        DWORD err = create_ui_access_token(&token);
        if (err != ERROR_SUCCESS) return err;

        STARTUPINFOW si{};
        PROCESS_INFORMATION pi{};
        GetStartupInfoW(&si);
        if (CreateProcessAsUserW(token, nullptr, GetCommandLineW(), nullptr, nullptr, FALSE, 0,
                                 nullptr, nullptr, &si, &pi))
        {
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
            ExitProcess(0);
        }
        err = GetLastError();
        CloseHandle(token);
        return err;
    }

    inline bool init()
    {
        if (cfg::kTryUiAccessBand)
        {
            const DWORD err = prepare_for_ui_access();
            if (err != ERROR_SUCCESS)
                printf("[!] UIAccess unavailable (%lu), using plain topmost overlay\n", err);
        }

        create_window_in_band = reinterpret_cast<fn_create_window_in_band>(
            GetProcAddress(librarys::user32, "CreateWindowInBand"));
        if (!create_window_in_band)
            create_window_in_band = reinterpret_cast<fn_create_window_in_band>(
                GetProcAddress(librarys::win32u, "CreateWindowInBand"));
        return true;  // band is optional; create_overlay falls back
    }
}

// ---------------------------------------------------------------------------
//  glyph atlas + immediate-mode draw list (replaces imgui)
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

    inline std::vector<Vertex> flat_verts;  // untextured quads
    inline std::vector<Vertex> text_verts;  // atlas quads
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
            dc = CreateCompatibleDC(screen_dc);

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
            SelectObject(dc, reinterpret_cast<HGDIOBJ>(hfont));

            SetBkMode(dc, TRANSPARENT);
            SetTextColor(dc, RGB(255, 255, 255));

            TEXTMETRICA tm{};
            GetTextMetricsA(dc, &tm);
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
                if (old_bitmap) SelectObject(dc, old_bitmap);
                DeleteObject(reinterpret_cast<HGDIOBJ>(dib));
                dib = nullptr;
            }
            if (dc) { DeleteDC(dc); dc = nullptr; }
            if (screen_dc) { ReleaseDC(nullptr, screen_dc); screen_dc = nullptr; }
            bits = nullptr;
        }
    };

    inline bool create_font(IDirect3DDevice9* device, Font& f, int px, const char* face)
    {
        f.tex = nullptr;

        FontBuilder builder;
        if (!builder.begin(px, face)) { builder.end(); return false; }

        f.line_h = static_cast<float>(builder.cell_h);

        int pen_x = 1, pen_y = 1;
        for (int c = 32; c < 128; ++c)
        {
            const char ch = static_cast<char>(c);
            SIZE size{};
            GetTextExtentPoint32A(builder.dc, &ch, 1, &size);

            const int adv = (size.cx > 0) ? size.cx : (px / 3);
            if (pen_x + adv + 2 >= atlas::kWidth) { pen_x = 1; pen_y += builder.cell_h + 1; }
            if (pen_y + builder.cell_h + 1 >= atlas::kHeight) break;

            TextOutA(builder.dc, pen_x, pen_y, &ch, 1);

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

        if (FAILED(device->CreateTexture(atlas::kWidth, atlas::kHeight, 1, D3DUSAGE_DYNAMIC,
                                         D3DFMT_A8R8G8B8, D3DPOOL_DEFAULT, &f.tex, nullptr)))
        {
            builder.end();
            return false;
        }

        D3DLOCKED_RECT locked{};
        if (FAILED(f.tex->LockRect(0, &locked, nullptr, D3DLOCK_DISCARD)))
        {
            builder.end();
            return false;
        }

        const BYTE* src = static_cast<const BYTE*>(builder.bits);
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
        const float len = sqrtf(dx * dx + dy * dy);
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
        float px = cx + radius, py = cy;
        for (int i = 1; i <= segments; ++i)
        {
            const float a = (static_cast<float>(i) / segments) * 6.28318530718f;
            const float nx = cx + cosf(a) * radius;
            const float ny = cy + sinf(a) * radius;
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

            if (*p != ' ')
            {
                const Vertex a{ pen,        y,            0, 1, color, g.u0, g.v0 };
                const Vertex b{ pen + g.w,  y,            0, 1, color, g.u1, g.v0 };
                const Vertex c{ pen + g.w,  y + g.h,      0, 1, color, g.u1, g.v1 };
                const Vertex d{ pen,        y + g.h,      0, 1, color, g.u0, g.v1 };
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

    inline void flush(IDirect3DDevice9* device)
    {
        device->SetFVF(kFvf);
        device->SetRenderState(D3DRS_ZENABLE, FALSE);
        device->SetRenderState(D3DRS_LIGHTING, FALSE);
        device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
        device->SetRenderState(D3DRS_ALPHABLENDENABLE, TRUE);
        device->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
        device->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);

        if (!flat_verts.empty())
        {
            device->SetTexture(0, nullptr);
            device->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_SELECTARG2);
            device->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
            device->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG2);
            device->SetTextureStageState(0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
            device->DrawPrimitiveUP(D3DPT_TRIANGLELIST,
                                    static_cast<UINT>(flat_verts.size() / 3),
                                    flat_verts.data(), sizeof(Vertex));
        }

        if (!text_verts.empty() && font.tex)
        {
            device->SetTexture(0, font.tex);
            device->SetSamplerState(0, D3DSAMP_MINFILTER, D3DTEXF_LINEAR);
            device->SetSamplerState(0, D3DSAMP_MAGFILTER, D3DTEXF_LINEAR);
            device->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_MODULATE);
            device->SetTextureStageState(0, D3DTSS_COLORARG1, D3DTA_TEXTURE);
            device->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
            device->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_MODULATE);
            device->SetTextureStageState(0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE);
            device->SetTextureStageState(0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
            device->DrawPrimitiveUP(D3DPT_TRIANGLELIST,
                                    static_cast<UINT>(text_verts.size() / 3),
                                    text_verts.data(), sizeof(Vertex));
            device->SetTexture(0, nullptr);
        }
    }
}

// ---------------------------------------------------------------------------
//  tiny immediate-mode UI (replaces imgui menu)
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

        const float frac = (*value - lo) / (hi - lo);
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
//  overlay + device (um/game.hpp)
// ---------------------------------------------------------------------------
namespace overlay
{
    inline IDirect3D9Ex*       d3d = nullptr;
    inline IDirect3DDevice9Ex* device = nullptr;
    inline D3DPRESENT_PARAMETERS params{};
    inline HWND hwnd = nullptr;
    inline HWND game_wnd = nullptr;
    inline bool running = true;

    inline void create_window()
    {
        WNDCLASSEXA wc{};
        wc.cbSize = sizeof(wc);
        wc.style = CS_VREDRAW | CS_HREDRAW;
        wc.lpfnWndProc = DefWindowProcA;
        wc.hInstance = GetModuleHandleA(nullptr);
        wc.hIcon = LoadIcon(nullptr, IDI_APPLICATION);
        wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
        wc.lpszClassName = "overlay_class";

        const ATOM atom = RegisterClassExA(&wc);
        const int sw = settings::width;
        const int sh = settings::height;

        // click-through is dropped while the menu is open, restored when it closes
        DWORD ex_style = WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TOOLWINDOW;
        if (!settings::show_menu) ex_style |= WS_EX_TRANSPARENT;

        if (gui::create_window_in_band)
            hwnd = gui::create_window_in_band(ex_style, atom, L"overlay", WS_POPUP, 0, 0, sw, sh,
                                              nullptr, nullptr, wc.hInstance, nullptr, gui::ZBID_UIACCESS);

        if (!hwnd)
            hwnd = CreateWindowExA(ex_style, wc.lpszClassName, "overlay", WS_POPUP, 0, 0, sw, sh,
                                   nullptr, nullptr, wc.hInstance, nullptr);

        if (!hwnd) return;

        SetLayeredWindowAttributes(hwnd, RGB(0, 0, 0), 255, LWA_ALPHA);

        MARGINS margins = { -1, -1, -1, -1 };
        DwmExtendFrameIntoClientArea(hwnd, &margins);

        ShowWindow(hwnd, SW_SHOW);
        UpdateWindow(hwnd);
    }

    inline bool init_device()
    {
        if (FAILED(Direct3DCreate9Ex(D3D_SDK_VERSION, &d3d))) return false;

        ZeroMemory(&params, sizeof(params));
        params.Windowed = TRUE;
        params.SwapEffect = D3DSWAPEFFECT_DISCARD;
        params.hDeviceWindow = hwnd;
        params.MultiSampleType = D3DMULTISAMPLE_NONE;
        params.BackBufferFormat = D3DFMT_A8R8G8B8;
        params.BackBufferWidth = settings::width;
        params.BackBufferHeight = settings::height;
        params.EnableAutoDepthStencil = FALSE;
        params.PresentationInterval = D3DPRESENT_INTERVAL_IMMEDIATE;

        if (FAILED(d3d->CreateDeviceEx(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, hwnd,
                                       D3DCREATE_HARDWARE_VERTEXPROCESSING,
                                       &params, nullptr, &device)))
        {
            d3d->Release();
            d3d = nullptr;
            return false;
        }
        return true;
    }

    inline void release_font()
    {
        if (draw::font.tex) { draw::font.tex->Release(); draw::font.tex = nullptr; }
    }

    inline void on_device_lost()
    {
        release_font();
        while (device->TestCooperativeLevel() == D3DERR_DEVICELOST) Sleep(50);
        device->Reset(&params);
        draw::create_font(device, draw::font, cfg::kFontPx, "Consolas");
    }

    inline HWND find_process_window(DWORD pid)
    {
        struct Ctx { HWND hwnd; DWORD pid; } ctx{ nullptr, pid };
        EnumWindows([](HWND h, LPARAM lp) -> BOOL {
            auto* c = reinterpret_cast<Ctx*>(lp);
            DWORD owner = 0;
            GetWindowThreadProcessId(h, &owner);
            if (owner == c->pid && IsWindowVisible(h))
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
//  game logic (um/game.hpp)
// ---------------------------------------------------------------------------
inline void aimbot(uintptr_t target_mesh)
{
    if (!target_mesh) return;
    if (cfg::kVisibleOnly && !is_visible(target_mesh)) return;

    const Vector3 head3d = bone_world_location(target_mesh, cfg::kHeadBone);
    if (!valid_vector(head3d)) return;

    const Vector2 head2d = project_world_to_screen(head3d);
    if (head2d.x == 0 && head2d.y == 0) return;

    // gain = 1/smoothness, then the per-tick step is capped so a target that
    // teleports across the screen never produces a 300px mouse jump.
    const float smoothness = settings::aimbot::smoothness > 0.1f ? settings::aimbot::smoothness : 1.f;
    const double gain = 1.0 / smoothness;

    double dx = (head2d.x - settings::center_x) * gain;
    double dy = (head2d.y - settings::center_y) * gain;

    const double step = sqrt(dx * dx + dy * dy);
    if (step > cfg::kMaxScreenStep)
    {
        const double scale = cfg::kMaxScreenStep / step;
        dx *= scale;
        dy *= scale;
    }

    input::move_mouse(dx, dy);
}

inline void draw_distance_label(const Vector2& at, float distance)
{
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "%.0fm", distance);
    draw::text_centered(static_cast<float>(at.x), static_cast<float>(at.y), D3DCOLOR_ARGB(255, 240, 240, 240), buffer);
}

inline void game_tick()
{
    if (!mem.alive()) return;

    if (!cache::uworld || !looks_like_uworld(cache::uworld))
        cache::uworld = resolve_uworld();
    if (!cache::uworld) return;

    cache::game_instance = mem.read<uintptr_t>(cache::uworld + off::GameInstance);
    if (!cache::game_instance) return;

    // UGameInstance::LocalPlayers is a TArray<ULocalPlayer*>: data ptr, then Num.
    const uintptr_t local_players_array = mem.read<uintptr_t>(cache::game_instance + off::LocalPlayers);
    if (!local_players_array) return;

    cache::local_players = mem.read<uintptr_t>(local_players_array);
    if (!cache::local_players) return;

    // ULocalPlayer::PlayerController is not reflected, sits at +0x30.
    cache::player_controller = mem.read<uintptr_t>(cache::local_players + off::LocalPlayerController);
    if (!cache::player_controller) return;

    cache::local_pawn = mem.read<uintptr_t>(cache::player_controller + off::LocalPawn);

    if (cache::local_pawn)
    {
        // own position off the root component's relative transform: cheaper than
        // the bone path and valid without a bone array
        const uintptr_t root = mem.read<uintptr_t>(cache::local_pawn + off::RootComponent);
        cache::local_root = root;

        if (root)
        {
            cache::relative_location = read_vector3f(root + off::RelativeLocation);
            if (!valid_vector(cache::relative_location)) cache::relative_location = Vector3();
        }

        cache::player_state = mem.read<uintptr_t>(cache::local_pawn + off::PlayerState);
        if (cache::player_state)
            cache::my_team_id = mem.read<uint8_t>(cache::player_state + off::TeamIndex);
    }

    cache::game_state = mem.read<uintptr_t>(cache::uworld + off::GameState);
    if (!cache::game_state) return;

    // TArray<APlayerState*> at GameStateBase::PlayerArray
    cache::player_array = mem.read<uintptr_t>(cache::game_state + off::PlayerArray);
    cache::player_count = mem.read<int>(cache::game_state + off::PlayerArray + sizeof(uintptr_t));
    if (!cache::player_array || cache::player_count <= 0 || cache::player_count > 256) return;

    cache::camera = get_view_point();
    if (!valid_vector(cache::camera.location)) return;

    cache::closest_distance = FLT_MAX;
    cache::closest_mesh = 0;

    for (int i = 0; i < cache::player_count; ++i)
    {
        const uintptr_t player_state = mem.read<uintptr_t>(cache::player_array + (i * sizeof(uintptr_t)));
        if (!player_state) continue;

        if (cfg::kSkipSpectators)
        {
            // bIsSpectator shares its byte with bIsABot/bIsInactive/bIsInactive
            const uint8_t pstate_flags = mem.read<uint8_t>(player_state + off::bIsSpectator);
            if (pstate_flags & cfg::bIsSpectatorBit) continue;
        }

        const int team = mem.read<int>(player_state + off::TeamIndex) & 0xFF;
        if (cfg::kTeamCheck && team == cache::my_team_id) continue;

        const uintptr_t pawn = mem.read<uintptr_t>(player_state + off::PawnPrivate);
        if (!pawn || pawn == cache::local_pawn) continue;

        // DBNO pawns stay valid targets, just drawn amber when the bit is known
        bool downed = false;
        if (cfg::kMarkDowned)
        {
            const uint8_t pawn_flags = mem.read<uint8_t>(pawn + off::bIsDBNO);
            downed = (pawn_flags & cfg::bIsDBNOBit) != 0;
        }

        const uintptr_t mesh = mem.read<uintptr_t>(pawn + off::Mesh);
        if (!mesh) continue;

        const Vector3 head3d = bone_world_location(mesh, cfg::kHeadBone);
        const Vector3 bottom3d = bone_world_location(mesh, cfg::kRootBone);
        if (!valid_vector(head3d) || !valid_vector(bottom3d)) continue;

        const Vector2 head2d = project_world_to_screen(head3d);
        const Vector2 bottom2d = project_world_to_screen(bottom3d);

        const float box_height = static_cast<float>(fabs(head2d.y - bottom2d.y));
        const float box_width = box_height * 0.50f;
        const float distance = static_cast<float>(cache::relative_location.distance(bottom3d)) / 100.f;

        // health out of the ability system set: UFORTHealthSet { Health 0x48, MaxHealth 0x70 }
        float hp = 0.f, max_hp = 0.f;
        const uintptr_t health_set = mem.read<uintptr_t>(pawn + off::HealthSet);
        if (health_set)
        {
            hp = mem.read<float>(health_set + off::Health);
            max_hp = mem.read<float>(health_set + off::MaxHealth);
        }

        const bool visible = is_visible(mesh);

        if (settings::visuals::enable && box_height > 2.f)
        {
            const float bx = static_cast<float>(head2d.x) - box_width * 0.5f;
            const float by = static_cast<float>(head2d.y);

            const DWORD box_color = downed    ? D3DCOLOR_ARGB(255, 240, 200, 60)
                                  : visible   ? D3DCOLOR_ARGB(255, 245, 245, 245)
                                              : D3DCOLOR_ARGB(255, 240, 60, 60);

            if (settings::visuals::box)
                draw::cornered_box(bx, by, box_width, box_height, box_color, 1.f);

            if (settings::visuals::fill_box)
                draw::rect_filled(bx, by, box_width, box_height, D3DCOLOR_ARGB(45, 0, 0, 0));

            if (settings::visuals::health_bar && max_hp > 0.f && hp > 0.f)
            {
                const float frac = (hp / max_hp) > 1.f ? 1.f : (hp / max_hp);
                draw::rect_filled(bx - 5.f, by, 3.f, box_height, D3DCOLOR_ARGB(120, 0, 0, 0));
                draw::rect_filled(bx - 5.f, by + box_height * (1.f - frac), 3.f, box_height * frac,
                                  D3DCOLOR_ARGB(255, 90, 220, 120));
            }

            if (settings::visuals::line)
                draw::line(static_cast<float>(settings::center_x), static_cast<float>(settings::height),
                           static_cast<float>(bottom2d.x), static_cast<float>(bottom2d.y), box_color, 1.f);

            if (settings::visuals::distance)
            {
                char label[64];
                snprintf(label, sizeof(label), "%.0fm", distance);
                if (settings::visuals::health_bar && max_hp > 0.f)
                {
                    char with_hp[96];
                    snprintf(with_hp, sizeof(with_hp), "%.0fm  %.0fhp", distance, hp);
                    draw::text_centered(static_cast<float>(bottom2d.x), static_cast<float>(bottom2d.y),
                                        D3DCOLOR_ARGB(255, 240, 240, 240), with_hp);
                }
                else
                {
                    draw::text_centered(static_cast<float>(bottom2d.x), static_cast<float>(bottom2d.y),
                                        D3DCOLOR_ARGB(255, 240, 240, 240), label);
                }
            }
        }

        if (cfg::kVisibleOnly && !visible) continue;

        const double dx = head2d.x - settings::center_x;
        const double dy = head2d.y - settings::center_y;
        const float screen_dist = static_cast<float>(sqrt(dx * dx + dy * dy));
        if (screen_dist <= settings::aimbot::fov && screen_dist < cache::closest_distance)
        {
            cache::closest_distance = screen_dist;
            cache::closest_mesh = mesh;
        }
    }
}

// ---------------------------------------------------------------------------
//  menu (um/game.hpp render_menu)
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
                   settings::visuals::enable ? "white = visible, red = occluded, amber = downed" : "");
    }
    else
    {
        draw::text(x, y, ui::kColTextDim, "INSERT toggles this menu");
        y += 22.f;
        draw::text(x, y, ui::kColTextDim, "END unloads the cheat");
        y += 22.f;
        draw::text(x, y, ui::kColTextDim, input::ready ? "input: spoofed NtUserSendInput" : "input: SendInput fallback");
        y += 22.f;
        draw::text(x, y, ui::kColTextDim, "offsets: season-locked, refresh off::UWorld per patch");
        y += 34.f;
        if (ui::button(x, y, 140.f, 24.f, "unload")) overlay::running = false;
    }
}

// ---------------------------------------------------------------------------
//  main loop
// ---------------------------------------------------------------------------
inline bool params_dirty(UINT cur_w, int new_w, UINT cur_h, int new_h)
{
    return static_cast<int>(cur_w) != new_w || static_cast<int>(cur_h) != new_h;
}

inline void main_loop()
{
    LARGE_INTEGER freq{}, last{};
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&last);

    while (overlay::running)
    {
        MSG msg{};
        while (PeekMessageA(&msg, overlay::hwnd, 0, 0, PM_REMOVE))
        {
            TranslateMessage(&msg);
            DispatchMessageA(&msg);
        }

        if (GetAsyncKeyState(cfg::kMenuKey) & 1) settings::show_menu = !settings::show_menu;
        if (GetAsyncKeyState(cfg::kExitKey) & 1) break;

        static bool menu_was_shown = settings::show_menu;
        if (menu_was_shown != settings::show_menu)
        {
            menu_was_shown = settings::show_menu;
            LONG_PTR ex = GetWindowLongPtrA(overlay::hwnd, GWL_EXSTYLE);
            if (settings::show_menu) ex &= ~static_cast<LONG_PTR>(WS_EX_TRANSPARENT);
            else                     ex |= static_cast<LONG_PTR>(WS_EX_TRANSPARENT);
            SetWindowLongPtrA(overlay::hwnd, GWL_EXSTYLE, ex);
        }

        settings::width  = GetSystemMetrics(SM_CXSCREEN);
        settings::height = GetSystemMetrics(SM_CYSCREEN);
        settings::center_x = settings::width / 2;
        settings::center_y = settings::height / 2;

        // keep the overlay glued above the game
        if (!overlay::game_wnd || !IsWindow(overlay::game_wnd))
            overlay::game_wnd = overlay::find_process_window(mem.pid);

        static bool overlay_raised = false;
        const bool game_focused = overlay::game_wnd && GetForegroundWindow() == overlay::game_wnd;
        if (game_focused != overlay_raised)
        {
            overlay_raised = game_focused;
            if (game_focused)
                SetWindowPos(overlay::hwnd, HWND_TOPMOST, 0, 0, settings::width, settings::height,
                             SWP_NOACTIVATE);
            else
                ShowWindow(overlay::hwnd, SW_HIDE), ShowWindow(overlay::hwnd, SW_SHOWNOACTIVATE);
        }

        if (params_dirty(overlay::params.BackBufferWidth, settings::width,
                         overlay::params.BackBufferHeight, settings::height))
        {
            overlay::params.BackBufferWidth  = settings::width;
            overlay::params.BackBufferHeight = settings::height;
            SetWindowPos(overlay::hwnd, HWND_TOPMOST, 0, 0, settings::width, settings::height, SWP_NOACTIVATE);
            overlay::release_font();
            if (FAILED(overlay::device->Reset(&overlay::params)))
            {
                overlay::running = false;
                break;
            }
            draw::create_font(overlay::device, draw::font, cfg::kFontPx, "Consolas");
        }

        draw::reset();
        ui::begin_frame();

        const bool aiming = settings::aimbot::enable && !settings::show_menu &&
                            (GetAsyncKeyState(settings::aimbot::aim_key) & 0x8000);

        game_tick();

        if (aiming && cache::closest_mesh)
            aimbot(cache::closest_mesh);

        render_menu();

        overlay::device->Clear(0, nullptr, D3DCLEAR_TARGET, D3DCOLOR_ARGB(0, 0, 0, 0), 1.f, 0);
        if (SUCCEEDED(overlay::device->BeginScene()))
        {
            draw::flush(overlay::device);
            overlay::device->EndScene();
        }

        const HRESULT present = overlay::device->Present(nullptr, nullptr, nullptr, nullptr);
        if (present == D3DERR_DEVICELOST)
            overlay::on_device_lost();

        // tick floor: keeps the read rate at cfg::kTickMs without capping the overlay
        LARGE_INTEGER now{};
        QueryPerformanceCounter(&now);
        const double elapsed_ms = (now.QuadPart - last.QuadPart) * 1000.0 / freq.QuadPart;
        if (elapsed_ms < cfg::kTickMs)
            Sleep(static_cast<DWORD>(cfg::kTickMs - elapsed_ms));
        QueryPerformanceCounter(&last);
    }
}

int main()
{
    SetProcessDPIAware();
    SetConsoleTitleA("fortnite external");

    settings::width  = GetSystemMetrics(SM_CXSCREEN);
    settings::height = GetSystemMetrics(SM_CYSCREEN);
    settings::center_x = settings::width / 2;
    settings::center_y = settings::height / 2;

    if (!librarys::init())
    {
        printf("[!] librarys::init failed\n");
        Sleep(3000);
        return 1;
    }

    printf("[*] waiting for Fortnite...\n");
    while (!mem.alive())
    {
        if (!mem.attach(cfg::kProcessName)) { Sleep(500); continue; }
        Sleep(200);
    }

    if (!input::init())
        printf("[!] spoofed input unavailable, SendInput fallback active\n");

    gui::init();

    overlay::game_wnd = overlay::find_process_window(mem.pid);
    overlay::create_window();
    if (!overlay::hwnd)
    {
        printf("[!] overlay window creation failed\n");
        Sleep(3000);
        return 1;
    }
    if (!overlay::init_device())
    {
        printf("[!] D3D9Ex device creation failed\n");
        Sleep(3000);
        return 1;
    }

    draw::create_font(overlay::device, draw::font, cfg::kFontPx, "Consolas");

    printf("[*] base 0x%llX  pid %lu\n",
           static_cast<unsigned long long>(mem.base), static_cast<unsigned long>(mem.pid));

    if (!resolve_uworld())
        printf("[!] UWorld not found - menu opens, ESP/aim stay idle until the scan hits\n");
    else
        printf("[*] UWorld ready\n");

    main_loop();

    overlay::release_font();
    if (overlay::device) overlay::device->Release();
    if (overlay::d3d) overlay::d3d->Release();
    if (overlay::hwnd) DestroyWindow(overlay::hwnd);
    return 0;
}

#endif // _KERNEL_MODE
