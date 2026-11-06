#!/usr/bin/env python3
"""
Syntax-gate for the user-mode half of fortnite_external.cpp on Linux.

There is no MSVC/WDK here, so this compiles the user-mode translation unit with
g++ against a fake <Windows.h> + <d3d9.h> + friends. Types come from the real
Windows headers' declarations by memory; values are arbitrary as long as the
code compiles, which is exactly what we want to catch: typos, wrong argument
counts, missing members, const/non-const mismatches, scope errors.

    python3 tools/syntax_check.py

Exit code 0 means the user-mode half parses and type-checks.
"""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAKE = os.path.join(ROOT, "tools", "fake_win")

WINDOWS_H = r"""
#pragma once
// ---------------------------------------------------------------------------
//  fake <Windows.h> — declarations only, values are arbitrary
// ---------------------------------------------------------------------------
#include <cstdint>
#include <cstddef>
#include <cstring>
#include <cmath>
#include <cstdio>

typedef unsigned long DWORD;
typedef unsigned short WORD;
typedef unsigned int UINT;
typedef int BOOL;
typedef unsigned char BYTE;
typedef unsigned char UCHAR;
typedef unsigned short USHORT;
typedef short SHORT;
typedef long LONG;
typedef unsigned long ULONG;
typedef wchar_t WCHAR;
typedef void* PVOID;
typedef void* LPVOID;
typedef const void* LPCVOID;
typedef unsigned long long ULONG_PTR;
typedef long long LONG_PTR;
typedef unsigned long long UINT_PTR;
typedef ULONG_PTR DWORD_PTR;
typedef LONG_PTR LPARAM;
typedef UINT_PTR WPARAM;
typedef long long LONG_PTR;
typedef unsigned long long SIZE_T;
typedef long long LONG64;
typedef char* LPSTR;
typedef const char* LPCSTR;
typedef wchar_t* LPWSTR;
typedef const wchar_t* LPCWSTR;
typedef DWORD* LPDWORD;
typedef int* LPINT;
typedef BYTE* LPBYTE;
typedef unsigned short* LPWORD;
typedef long* LPLONG;

#define WINAPI
#define NTAPI
#define APIENTRY
#define CALLBACK
#define TRUE 1
#define FALSE 0
#ifndef NULL
#define NULL 0
#endif
#define MAX_PATH 260

typedef struct HINSTANCE__* HINSTANCE;
typedef struct HINSTANCE__* HMODULE;
typedef struct HWND__* HWND;
typedef struct HDC__* HDC;
typedef struct HBITMAP__* HBITMAP;
typedef struct HFONT__* HFONT;
typedef struct HGDIOBJ__* HGDIOBJ;

typedef struct HMENU__* HMENU;
typedef struct HICON__* HICON;
typedef struct HCURSOR__* HCURSOR;
typedef struct HBRUSH__* HBRUSH;
typedef struct HANDLE__* HANDLE;
typedef struct HKEY__* HKEY;
typedef HANDLE* PHANDLE;

typedef unsigned short ATOM;

typedef long HRESULT;
typedef unsigned long NTSTATUS;
#define S_OK ((HRESULT)0L)
#define SUCCEEDED(hr) (((HRESULT)(hr)) >= 0)
#define FAILED(hr) (((HRESULT)(hr)) < 0)

typedef struct tagRECT { LONG left, top, right, bottom; } RECT, *PRECT, *LPRECT;
typedef struct tagPOINT { LONG x, y; } POINT, *LPPOINT;
typedef struct tagSIZE { LONG cx, cy; } SIZE, *PSIZE;

typedef struct _FILETIME { DWORD dwLowDateTime, dwHighDateTime; } FILETIME;

typedef struct _LARGE_INTEGER
{
    union { struct { DWORD LowPart; LONG HighPart; }; long long QuadPart; };
} LARGE_INTEGER, *PLARGE_INTEGER;

typedef struct _MEMORY_BASIC_INFORMATION { PVOID BaseAddress; } MEMORY_BASIC_INFORMATION;

typedef struct _SECURITY_ATTRIBUTES { DWORD nLength; PVOID lpSecurityDescriptor; BOOL bInheritHandle; } SECURITY_ATTRIBUTES;
typedef struct _STARTUPINFOW { DWORD cb; } STARTUPINFOW, *LPSTARTUPINFOW;
typedef struct _PROCESS_INFORMATION { HANDLE hProcess, hThread; DWORD dwProcessId, dwThreadId; } PROCESS_INFORMATION, *LPPROCESS_INFORMATION;
typedef struct _PROCESSENTRY32W
{
    DWORD dwSize, cntUsage, th32ProcessID;
    ULONG_PTR th32DefaultHeapID;
    DWORD th32ModuleID, cntThreads, th32ParentProcessID;
    LONG pcPriClassBase;
    DWORD dwFlags;
    WCHAR szExeFile[MAX_PATH];
} PROCESSENTRY32W, *LPPROCESSENTRY32W;
typedef struct tagMSG { HWND hwnd; UINT message; UINT_PTR wParam; LONG_PTR lParam; DWORD time; POINT pt; } MSG, *LPMSG;
typedef LONG_PTR(WINAPI* WNDPROC)(HWND, UINT, UINT_PTR, LONG_PTR);

typedef struct tagWNDCLASSEXA
{
    UINT cbSize;
    UINT style;
    WNDPROC lpfnWndProc;
    int cbClsExtra;
    int cbWndExtra;
    HINSTANCE hInstance;
    HICON hIcon;
    HCURSOR hCursor;
    HBRUSH hbrBackground;
    LPCSTR lpszMenuName;
    LPCSTR lpszClassName;
    HICON hIconSm;
} WNDCLASSEXA, *LPWNDCLASSEXA;
typedef struct _PRIVILEGE_SET
{
    DWORD PrivilegeCount;
    DWORD Control;
    struct { struct { DWORD LowPart; LONG HighPart; } Luid; DWORD Attributes; } Privilege[1];
} PRIVILEGE_SET, *PPRIVILEGE_SET;

typedef struct _BITMAPINFOHEADER
{
    DWORD biSize; LONG biWidth, biHeight;
    WORD biPlanes, biBitCount;
    DWORD biCompression, biSizeImage;
    LONG biXPelsPerMeter, biYPelsPerMeter;
    DWORD biClrUsed, biClrImportant;
} BITMAPINFOHEADER;
typedef struct tagRGBQUAD { BYTE rgbBlue, rgbGreen, rgbRed, rgbReserved; } RGBQUAD;
typedef struct tagBITMAPINFO { BITMAPINFOHEADER bmiHeader; RGBQUAD bmiColors[1]; } BITMAPINFO, *LPBITMAPINFO;
typedef struct tagTEXTMETRICA
{
    LONG tmHeight, tmAscent, tmDescent, tmInternalLeading, tmExternalLeading;
    LONG tmAveCharWidth, tmMaxCharWidth, tmWeight, tmOverhang;
    LONG tmDigitizedAspectX, tmDigitizedAspectY;
    BYTE tmFirstChar, tmLastChar, tmDefaultChar, tmBreakChar;
    BYTE tmItalic, tmUnderlined, tmStruckOut, tmPitchAndFamily, tmCharSet;
} TEXTMETRICA, *LPTEXTMETRICA;
typedef struct tagMARGINS { int cxLeftWidth, cxRightWidth, cyTopHeight, cyBottomHeight; } MARGINS;

typedef struct tagINPUT
{
    DWORD type;
    union
    {
        struct { LONG dx, dy; DWORD mouseData, dwFlags, time; ULONG_PTR dwExtraInfo; } mi;
        struct { WORD wVk, wScan; DWORD dwFlags, time; ULONG_PTR dwExtraInfo; } ki;
        struct { DWORD type; } hi;
    };
} INPUT, *LPINPUT;

typedef BOOL(CALLBACK* WNDENUMPROC)(HWND, LPARAM);

#define INPUT_MOUSE 0
#define MOUSEEVENTF_MOVE 0x0001
#define MOUSEEVENTF_LEFTDOWN 0x0002
#define MOUSEEVENTF_LEFTUP 0x0004
#define MOUSEEVENTF_RIGHTDOWN 0x0008
#define MOUSEEVENTF_RIGHTUP 0x0010
#define MOUSEEVENTF_VIRTUALDESK 0x4000

#define IDI_APPLICATION ((LPCSTR)32512)
#define IDC_ARROW ((LPCSTR)32512)
#define SYSTEM_FONT 13
#define FW_SEMIBOLD 600
#define DEFAULT_CHARSET 1
#define OUT_TT_PRECIS 4
#define CLIP_DEFAULT_PRECIS 0
#define ANTIALIASED_QUALITY 4
#define DEFAULT_PITCH 0
#define FF_DONTCARE 0
#define TRANSPARENT 1
#define RGB(r, g, b) ((DWORD)(((BYTE)(r) | ((WORD)((BYTE)(g)) << 8)) | (((DWORD)(BYTE)(b)) << 16)))
#define DIB_RGB_COLORS 0
#define BI_RGB 0

#define SM_CXSCREEN 0
#define SM_CYSCREEN 1

#define VK_LBUTTON 0x01
#define VK_RBUTTON 0x02
#define VK_INSERT 0x2D
#define VK_END 0x23
#define VK_SPACE 0x20

#define GWL_EXSTYLE (-20)
#define WS_POPUP 0x80000000
#define WS_EX_TOPMOST 0x00000008
#define WS_EX_TRANSPARENT 0x00000020
#define WS_EX_TOOLWINDOW 0x00000080
#define WS_EX_LAYERED 0x00080000
#define LWA_ALPHA 0x00000002
#define CS_VREDRAW 0x0001
#define CS_HREDRAW 0x0002
#define SW_HIDE 0
#define SW_SHOW 5
#define SW_SHOWNOACTIVATE 4
#define HWND_TOPMOST ((HWND)-1)
#define SWP_NOSIZE 0x0001
#define SWP_NOMOVE 0x0002
#define SWP_NOACTIVATE 0x0010
#define SWP_NOREDRAW 0x0008
#define GW_HWNDPREV 3
#define PM_REMOVE 0x0001

#define PROCESS_VM_READ 0x0010
#define PROCESS_QUERY_INFORMATION 0x0400
#define PROCESS_QUERY_LIMITED_INFORMATION 0x1000
#define TH32CS_SNAPPROCESS 0x00000002
#define INVALID_HANDLE_VALUE ((HANDLE)(LONG_PTR)-1)
#define MEM_COMMIT 0x1000
#define MEM_RESERVE 0x2000
#define MEM_RELEASE 0x8000
#define PAGE_EXECUTE_READWRITE 0x40

#define TOKEN_QUERY 0x0008
#define TOKEN_DUPLICATE 0x0002
#define TOKEN_IMPERSONATE 0x0004
#define TOKEN_ASSIGN_PRIMARY 0x0001
#define TOKEN_ADJUST_DEFAULT 0x0080
#define TokenSessionId 12
#define TokenUIAccess 26
#define SecurityAnonymous 0
#define SecurityImpersonation 2
#define TokenPrimary 1
#define TokenImpersonation 2
#define PRIVILEGE_SET_ALL_NECESSARY 1
#define SE_TCB_NAME "SeTcbPrivilege"
#define ERROR_SUCCESS 0L
#define ERROR_NOT_FOUND 1168L

#define ERROR_ALREADY_EXISTS 183L

inline int GetSystemMetrics(int) { return 1920; }
inline HDC GetDC(HWND) { return (HDC)0; }
inline int ReleaseDC(HWND, HDC) { return 1; }
inline HWND GetDesktopWindow() { return (HWND)0; }
inline BOOL GetWindowRect(HWND, LPRECT) { return 1; }
inline HWND GetForegroundWindow() { return (HWND)0; }
inline HWND GetWindow(HWND, UINT) { return (HWND)0; }
inline BOOL SetWindowPos(HWND, HWND, int, int, int, int, UINT) { return 1; }
inline BOOL ShowWindow(HWND, int) { return 1; }
inline BOOL UpdateWindow(HWND) { return 1; }
inline BOOL IsWindow(HWND) { return 1; }
inline BOOL IsWindowVisible(HWND) { return 1; }
inline BOOL DestroyWindow(HWND) { return 1; }
inline BOOL SetLayeredWindowAttributes(HWND, DWORD, BYTE, DWORD) { return 1; }
inline LONG_PTR GetWindowLongPtrA(HWND, int) { return 0; }
inline LONG_PTR SetWindowLongPtrA(HWND, int, LONG_PTR) { return 0; }
inline ATOM RegisterClassExA(const WNDCLASSEXA*) { return 1; }
inline HWND CreateWindowExA(DWORD, LPCSTR, LPCSTR, DWORD, int, int, int, int, HWND, HMENU, HINSTANCE, LPVOID) { return (HWND)0; }
inline LONG_PTR DefWindowProcA(HWND, UINT, UINT_PTR, LPARAM) { return 0; }
inline BOOL EnumWindows(WNDENUMPROC, LPARAM) { return 1; }
inline HICON LoadIconA(HINSTANCE, LPCSTR) { return (HICON)0; }
#define LoadIcon LoadIconA
inline HCURSOR LoadCursorA(HINSTANCE, LPCSTR) { return (HCURSOR)0; }
#define LoadCursor LoadCursorA
inline DWORD GetWindowThreadProcessId(HWND, LPDWORD) { return 0; }
inline BOOL PeekMessageA(LPMSG, HWND, UINT, UINT, UINT) { return 0; }
inline BOOL TranslateMessage(const MSG*) { return 1; }
inline LONG_PTR DispatchMessageA(const MSG*) { return 0; }
inline SHORT GetAsyncKeyState(int) { return 0; }
inline BOOL GetCursorPos(LPPOINT) { return 1; }
inline DWORD GetLastError() { return 0; }
inline void SetLastError(DWORD) {}
inline HANDLE GetCurrentProcess() { return (HANDLE)0; }
inline HMODULE GetModuleHandleA(LPCSTR) { return (HMODULE)0; }
inline HMODULE LoadLibraryA(LPCSTR) { return (HMODULE)0; }
inline void* GetProcAddress(HMODULE, LPCSTR) { return nullptr; }
inline LPWSTR GetCommandLineW() { return (LPWSTR)L""; }
inline void GetStartupInfoW(LPSTARTUPINFOW) {}
inline void ExitProcess(UINT) {}
inline void Sleep(DWORD) {}
inline BOOL CloseHandle(HANDLE) { return 1; }
inline HANDLE CreateToolhelp32Snapshot(DWORD, DWORD) { return (HANDLE)0; }
inline BOOL Process32FirstW(HANDLE, LPPROCESSENTRY32W) { return 0; }
inline BOOL Process32NextW(HANDLE, LPPROCESSENTRY32W) { return 0; }
inline HANDLE OpenProcess(DWORD, BOOL, DWORD) { return (HANDLE)0; }
inline BOOL ReadProcessMemory(HANDLE, LPCVOID, LPVOID, SIZE_T, SIZE_T*) { return 1; }
inline BOOL WriteProcessMemory(HANDLE, LPVOID, LPCVOID, SIZE_T, SIZE_T*) { return 1; }
inline BOOL EnumProcessModules(HANDLE, HMODULE*, DWORD, LPDWORD) { return 1; }
inline UINT SendInput(UINT, LPINPUT, int) { return 1; }
inline LPVOID VirtualAlloc(LPVOID, SIZE_T, DWORD, DWORD) { return nullptr; }
inline BOOL VirtualFree(LPVOID, SIZE_T, DWORD) { return 1; }
inline void ZeroMemory(void* p, size_t n) { memset(p, 0, n); }
inline void RtlSecureZeroMemory(void* p, size_t n) { memset(p, 0, n); }
inline int _wcsicmp(const wchar_t*, const wchar_t*) { return 0; }
inline int lstrcmpi(const char*, const char*) { return 0; }
inline BOOL SetProcessDPIAware() { return 1; }
inline BOOL SetConsoleTitleA(LPCSTR) { return 1; }
inline BOOL QueryPerformanceFrequency(LARGE_INTEGER* f) { f->QuadPart = 10000000; return 1; }
inline BOOL QueryPerformanceCounter(LARGE_INTEGER* c) { c->QuadPart = 0; return 1; }
inline BOOL LookupPrivilegeValueA(LPCSTR, LPCSTR, void*) { return 1; }
inline BOOL OpenProcessToken(HANDLE, DWORD, PHANDLE) { return 0; }
inline BOOL GetTokenInformation(HANDLE, int, LPVOID, DWORD, LPDWORD) { return 0; }
inline BOOL SetTokenInformation(HANDLE, int, LPVOID, DWORD) { return 0; }
inline BOOL DuplicateTokenEx(HANDLE, DWORD, PVOID, int, int, PHANDLE) { return 0; }
inline BOOL SetThreadToken(PHANDLE, HANDLE) { return 1; }
inline BOOL RevertToSelf() { return 1; }
inline BOOL PrivilegeCheck(HANDLE, PPRIVILEGE_SET, BOOL*) { return 0; }
inline BOOL CreateProcessAsUserW(HANDLE, LPCWSTR, LPWSTR, PVOID, PVOID, BOOL, DWORD, LPVOID, LPCWSTR, LPSTARTUPINFOW, LPPROCESS_INFORMATION) { return 0; }

// GDI
inline HDC CreateCompatibleDC(HDC) { return (HDC)0; }
inline BOOL DeleteDC(HDC) { return 1; }
inline HBITMAP CreateDIBSection(HDC, const BITMAPINFO*, UINT, void**, HANDLE, DWORD) { return (HBITMAP)0; }
inline HGDIOBJ SelectObject(HDC, HGDIOBJ) { return (HGDIOBJ)0; }
inline HGDIOBJ GetStockObject(int) { return (HGDIOBJ)0; }
inline HFONT CreateFontA(int, int, int, int, int, DWORD, DWORD, DWORD, DWORD, DWORD, DWORD, DWORD, DWORD, LPCSTR) { return (HFONT)0; }
inline BOOL DeleteObject(HGDIOBJ) { return 1; }
inline int SetBkMode(HDC, int) { return 1; }
inline DWORD SetTextColor(HDC, DWORD) { return 0; }
inline BOOL GetTextMetricsA(HDC, LPTEXTMETRICA) { return 1; }
inline BOOL GetTextExtentPoint32A(HDC, LPCSTR, int, PSIZE) { return 1; }
inline BOOL TextOutA(HDC, int, int, LPCSTR, int) { return 1; }

// dwmapi
typedef struct _MARGINS_DWM { int cxLeftWidth, cxRightWidth, cyTopHeight, cyBottomHeight; } DWM_MARGINS_T;

extern "C" long DwmExtendFrameIntoClientArea(HWND, const MARGINS*);
inline long DwmExtendFrameIntoClientArea(HWND, const MARGINS*) { return 0; }
"""

D3D9_H = r"""
#pragma once
typedef struct _D3DMATRIX
{
    union
    {
        struct
        {
            float _11, _12, _13, _14;
            float _21, _22, _23, _24;
            float _31, _32, _33, _34;
            float _41, _42, _43, _44;
        };
        float m[4][4];
    };
} D3DMATRIX;

typedef struct _D3DPRESENT_PARAMETERS_
{
    UINT BackBufferWidth;
    UINT BackBufferHeight;
    int BackBufferFormat;
    UINT BackBufferCount;
    int MultiSampleType;
    DWORD MultiSampleQuality;
    int SwapEffect;
    HWND hDeviceWindow;
    BOOL Windowed;
    BOOL EnableAutoDepthStencil;
    int AutoDepthStencilFormat;
    DWORD Flags;
    UINT FullScreen_RefreshRateInHz;
    UINT PresentationInterval;
} D3DPRESENT_PARAMETERS;

typedef struct _D3DLOCKED_RECT { int Pitch; void* pBits; } D3DLOCKED_RECT;

struct IDirect3DTexture9
{
    virtual HRESULT LockRect(UINT, D3DLOCKED_RECT*, const RECT*, DWORD) = 0;
    virtual HRESULT UnlockRect(UINT) = 0;
    virtual ULONG Release() = 0;
};
struct IDirect3DDevice9
{
    virtual HRESULT Reset(D3DPRESENT_PARAMETERS*) = 0;
    virtual HRESULT Present(const RECT*, const RECT*, HWND, const void*) = 0;
    virtual HRESULT Clear(DWORD, const void*, DWORD, DWORD, float, DWORD) = 0;
    virtual HRESULT BeginScene() = 0;
    virtual HRESULT EndScene() = 0;
    virtual HRESULT SetFVF(DWORD) = 0;
    virtual HRESULT SetRenderState(int, DWORD) = 0;
    virtual HRESULT SetSamplerState(DWORD, int, DWORD) = 0;
    virtual HRESULT SetTextureStageState(DWORD, int, DWORD) = 0;
    virtual HRESULT SetTexture(DWORD, IDirect3DTexture9*) = 0;
    virtual HRESULT DrawPrimitiveUP(int, UINT, const void*, UINT) = 0;
    virtual HRESULT TestCooperativeLevel() = 0;
    virtual HRESULT CreateTexture(UINT, UINT, UINT, DWORD, int, int, IDirect3DTexture9**, void*) = 0;
    virtual ULONG Release() = 0;
};
struct IDirect3DDevice9Ex : IDirect3DDevice9 {};
struct IDirect3D9Ex
{
    virtual HRESULT CreateDeviceEx(UINT, int, HWND, DWORD, D3DPRESENT_PARAMETERS*, void*, IDirect3DDevice9Ex**) = 0;
    virtual ULONG Release() = 0;
};

#define D3D_SDK_VERSION 32
#define D3DADAPTER_DEFAULT 0
#define D3DDEVTYPE_HAL 1
#define D3DCREATE_HARDWARE_VERTEXPROCESSING 0x40
#define D3DSWAPEFFECT_DISCARD 1
#define D3DMULTISAMPLE_NONE 0
#define D3DFMT_A8R8G8B8 21
#define D3DFMT_D16 80
#define D3DPRESENT_INTERVAL_IMMEDIATE 0x80000000
#define D3DPRESENT_INTERVAL_DEFAULT 0
#define D3DERR_DEVICELOST ((HRESULT)0x88760868L)
#define D3DERR_DEVICENOTRESET ((HRESULT)0x88760869L)
#define D3DCLEAR_TARGET 0x1
#define D3DPT_TRIANGLELIST 4
#define D3DFVF_XYZRHW 0x004
#define D3DFVF_DIFFUSE 0x040
#define D3DFVF_TEX1 0x100
#define D3DUSAGE_DYNAMIC 0x200
#define D3DPOOL_DEFAULT 0
#define D3DLOCK_DISCARD 0x2000
#define D3DRS_ZENABLE 7
#define D3DRS_LIGHTING 137
#define D3DRS_CULLMODE 22
#define D3DRS_ALPHABLENDENABLE 27
#define D3DRS_SRCBLEND 19
#define D3DRS_DESTBLEND 20
#define D3DRS_SCISSORTESTENABLE 152
#define D3DBLEND_SRCALPHA 5
#define D3DBLEND_INVSRCALPHA 6
#define D3DCULL_NONE 1
#define D3DTSS_COLOROP 1
#define D3DTSS_COLORARG1 2
#define D3DTSS_COLORARG2 3
#define D3DTSS_ALPHAOP 4
#define D3DTSS_ALPHAARG1 5
#define D3DTSS_ALPHAARG2 6
#define D3DTOP_MODULATE 4
#define D3DTOP_SELECTARG2 3
#define D3DTA_TEXTURE 2
#define D3DTA_DIFFUSE 1
#define D3DSAMP_MINFILTER 5
#define D3DSAMP_MAGFILTER 6
#define D3DTEXF_LINEAR 2
#define D3DCOLOR_ARGB(a, r, g, b) ((DWORD)((((a) & 0xff) << 24) | (((r) & 0xff) << 16) | (((g) & 0xff) << 8) | ((b) & 0xff)))

#define FAILED_D3D
extern "C" HRESULT Direct3DCreate9Ex(UINT, IDirect3D9Ex**);
inline HRESULT Direct3DCreate9Ex(UINT, IDirect3D9Ex**) { return 0; }
"""

PSAPI_H = r"""
#pragma once
inline BOOL EnumProcessModules(HANDLE, HMODULE*, DWORD, LPDWORD);
"""

TLHELP32_H = r"""
#pragma once
"""

DWMAPI_H = r"""
#pragma once
"""


def main():
    # optional argument: path to the file to check (defaults to the split source)
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "fortnite-external", "fortnite_external.cpp")

    os.makedirs(FAKE, exist_ok=True)
    headers = {
        "Windows.h": WINDOWS_H,
        "d3d9.h": D3D9_H,
        "psapi.h": PSAPI_H,
        "TlHelp32.h": TLHELP32_H,
        "dwmapi.h": DWMAPI_H,
    }
    for name, body in headers.items():
        with open(os.path.join(FAKE, name), "w", encoding="utf-8") as fh:
            fh.write(body)

    # lane the real source through the fake headers: drop the KM half and neutralise
    # the pragma comment(lib) lines that gcc does not understand on Linux.
    src = target
    with open(src, "r", encoding="utf-8") as fh:
        text = fh.read()

    user = text[text.index("#else // _KERNEL_MODE"):]
    user = user.replace("#else // _KERNEL_MODE", "")
    user = user.replace("#endif // _KERNEL_MODE", "")
    user = "\n".join(line for line in user.splitlines()
                     if not line.strip().startswith("#pragma comment"))

    staged = os.path.join(FAKE, "stage_um.cpp")
    with open(staged, "w", encoding="utf-8") as fh:
        fh.write('#include "Windows.h"\n' + user)

    cmd = [
        "g++", "-std=c++17", "-fsyntax-only", "-Wall", "-Wextra",
        "-Wno-unused-parameter", "-Wno-unused-variable", "-Wno-unused-but-set-variable",
        "-Wno-missing-field-initializers", "-Wno-unused-function",
        "-I", FAKE, "-I", os.path.join(ROOT, "fortnite-external"), staged,
    ]
    print(" ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
