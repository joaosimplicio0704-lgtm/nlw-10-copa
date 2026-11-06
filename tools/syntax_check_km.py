#!/usr/bin/env python3
"""
syntax_check_km.py — syntax-gate for the _KERNEL_MODE half on Linux.

Same idea as tools/syntax_check.py: no WDK here, so g++ gets a fake <ntifs.h>
carrying the WDK declarations the driver uses. Catches typos, wrong signatures,
missing casts, scope mistakes in the driver half.

    python3 tools/syntax_check_km.py [file.cpp]
"""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAKE = os.path.join(ROOT, "tools", "fake_km")

NTIFS_H = r"""
#pragma once
// ---------------------------------------------------------------------------
//  fake <ntifs.h> — declarations only, values are arbitrary
// ---------------------------------------------------------------------------
#include <cstdint>
#include <cstddef>
#include <cstring>

#define NTAPI
#define NTKERNELAPI
#define POOL_FLAG_NON_PAGED 0
#define PAGE_SIZE 0x1000
#define PAGE_READWRITE 0x04
#define NonPagedPool 1
#define PA_ALIGNMENT 0

typedef long NTSTATUS;
typedef void* PVOID;
typedef const void* PCVOID;
typedef unsigned char UCHAR, *PUCHAR;
typedef unsigned short USHORT;
typedef unsigned long ULONG, *PULONG;
typedef long LONG;
typedef unsigned long long ULONG64;
typedef unsigned long long SIZE_T;
typedef long long LONGLONG;
typedef struct _RTL_PROCESS_MODULE_INFORMATION_LOCAL* PRTL_PROCESS_MODULE_INFORMATION_LOCAL;
typedef struct _RTL_PROCESS_MODULES_LOCAL* PRTL_PROCESS_MODULES_LOCAL;
typedef short CSHORT;
typedef wchar_t WCHAR;
typedef void VOID;
typedef void* HANDLE;
typedef struct _UNICODE_STRING* PUNICODE_STRING;
typedef const struct _UNICODE_STRING* PCUNICODE_STRING;
typedef unsigned long long ULONGLONG;
typedef unsigned long long ULONG_PTR;
typedef SIZE_T* PSIZE_T;
typedef unsigned char UINT8;
typedef unsigned short UINT16;
typedef unsigned int UINT32;
typedef unsigned long long UINT64;


typedef char* PWSTR_placeholder;
typedef struct _UNICODE_STRING { USHORT Length, MaximumLength; PWSTR_placeholder Buffer; } UNICODE_STRING;

#define STATUS_SUCCESS ((NTSTATUS)0x00000000L)
#define STATUS_UNSUCCESSFUL ((NTSTATUS)0xC0000001L)
#define STATUS_FAILED_DRIVER_ENTRY ((NTSTATUS)0xC0000369L)
#define STATUS_PARTIAL_COPY ((NTSTATUS)0x8000000DL)
#define NT_SUCCESS(status) (((NTSTATUS)(status)) >= 0)

typedef struct _PHYSICAL_ADDRESS { union { long long QuadPart; }; } PHYSICAL_ADDRESS;
typedef struct _MM_COPY_ADDRESS { union { PVOID VirtualAddress; PHYSICAL_ADDRESS PhysicalAddress; }; } MM_COPY_ADDRESS;
#define MM_COPY_MEMORY_PHYSICAL 0x1
#define MM_COPY_MEMORY_VIRTUAL 0x2

typedef struct _KAPC_STATE { int opaque; } KAPC_STATE, *PKAPC_STATE;
typedef struct _KPROCESS* PEPROCESS;
typedef struct _DRIVER_OBJECT
{
    short Type;
    short Size;
    void* DeviceObject;
    void* Flags;
    void* DriverStart;
    unsigned long DriverSize;
    void* DriverSection;
    void* DriverExtension;
    UNICODE_STRING DriverName;
    UNICODE_STRING* HardwareDatabase;
    void* FastIoDispatch;
    void* DriverInit;
    void* DriverStartIo;
    void (*DriverUnload)(struct _DRIVER_OBJECT*);
    void* MajorFunction[28];
} DRIVER_OBJECT, *PDRIVER_OBJECT;
typedef struct _RTL_OSVERSIONINFOW
{
    ULONG dwOSVersionInfoSize, dwMajorVersion, dwMinorVersion, dwBuildNumber, dwPlatformId;
    WCHAR szCSDVersion[128];
} RTL_OSVERSIONINFOW, *PRTL_OSVERSIONINFOW;

namespace fake_nt
{
    inline PVOID ExAllocatePoolZero(int, SIZE_T, ULONG) { return nullptr; }
    inline void ExFreePool(PVOID) {}
    inline NTSTATUS MmCopyMemory(PVOID, MM_COPY_ADDRESS, SIZE_T, ULONG, SIZE_T*) { return 0; }
    inline PVOID MmMapIoSpaceEx(PHYSICAL_ADDRESS, SIZE_T, ULONG) { return nullptr; }
    inline void MmUnmapIoSpace(PVOID, SIZE_T) {}
    inline void RtlCopyMemory(void* d, const void* s, SIZE_T n) { std::memcpy(d, s, n); }
    inline NTSTATUS RtlGetVersion(PRTL_OSVERSIONINFOW v) { v->dwBuildNumber = 19045; return 0; }
    inline unsigned long long __readcr3() { return 0; }
    inline NTSTATUS PsLookupProcessByProcessId(HANDLE, PEPROCESS*) { return 0; }
    inline ULONG PsGetProcessSectionBaseAddress(PEPROCESS) { return 0; }
    inline void ObDereferenceObject(PVOID) {}
    inline void KeStackAttachProcess(PEPROCESS, PKAPC_STATE) {}
    inline void KeUnstackDetachProcess(PKAPC_STATE) {}
    inline NTSTATUS IofCompleteRequest(void*, signed char) { return 0; }
    inline void DbgPrint(const char*, ...) {}
}
using fake_nt::ExAllocatePoolZero;
using fake_nt::ExFreePool;
using fake_nt::MmCopyMemory;
using fake_nt::MmMapIoSpaceEx;
using fake_nt::MmUnmapIoSpace;
using fake_nt::RtlCopyMemory;
using fake_nt::RtlGetVersion;
using fake_nt::__readcr3;
using fake_nt::PsLookupProcessByProcessId;

using fake_nt::ObDereferenceObject;
using fake_nt::KeStackAttachProcess;
using fake_nt::KeUnstackDetachProcess;

// --- <ntimage.h> bits the pattern scanner needs -----------------------------
#define IMAGE_DOS_SIGNATURE 0x5A4D
#define FIELD_OFFSET(type, field) ((long)offsetof(type, field))

typedef struct _IMAGE_DOS_HEADER { USHORT e_magic; USHORT e_cblp, e_cp, e_crlc, e_cparhdr, e_minalloc, e_maxalloc, e_ss, e_sp, e_csum, e_ip, e_cs, e_lfarlc, e_ovno; USHORT e_res[4]; USHORT e_oemid, e_oeminfo; USHORT e_res2[10]; LONG e_lfanew; } IMAGE_DOS_HEADER, *PIMAGE_DOS_HEADER;
typedef struct _IMAGE_FILE_HEADER { USHORT Machine, NumberOfSections; ULONG TimeDateStamp, PointerToSymbolTable, NumberOfSymbols; USHORT SizeOfOptionalHeader, Characteristics; } IMAGE_FILE_HEADER;
typedef struct _IMAGE_DATA_DIRECTORY { ULONG VirtualAddress, Size; } IMAGE_DATA_DIRECTORY;
typedef struct _IMAGE_OPTIONAL_HEADER64
{
    USHORT Magic; UCHAR MajorLinkerVersion, MinorLinkerVersion;
    ULONG SizeOfCode, SizeOfInitializedData, SizeOfUninitializedData, AddressOfEntryPoint, BaseOfCode;
    ULONGLONG ImageBase; ULONG SectionAlignment, FileAlignment;
    USHORT MajorOperatingSystemVersion, MinorOperatingSystemVersion, MajorImageVersion, MinorImageVersion, MajorSubsystemVersion, MinorSubsystemVersion;
    ULONG Win32VersionValue, SizeOfImage, SizeOfHeaders, CheckSum;
    USHORT Subsystem, DllCharacteristics;
    ULONGLONG SizeOfStackReserve, SizeOfStackCommit, SizeOfHeapReserve, SizeOfHeapCommit;
    ULONG LoaderFlags, NumberOfRvaAndSizes;
    IMAGE_DATA_DIRECTORY DataDirectory[16];
} IMAGE_OPTIONAL_HEADER64;
typedef struct _IMAGE_NT_HEADERS64 { ULONG Signature; IMAGE_FILE_HEADER FileHeader; IMAGE_OPTIONAL_HEADER64 OptionalHeader; } IMAGE_NT_HEADERS64, *PIMAGE_NT_HEADERS64;
typedef struct _IMAGE_SECTION_HEADER
{
    UCHAR Name[8];
    union { ULONG PhysicalAddress, VirtualSize; } Misc;
    ULONG VirtualAddress, SizeOfRawData, PointerToRawData, PointerToRelocations, PointerToLinenumbers;
    USHORT NumberOfRelocations, NumberOfLinenumbers;
    ULONG Characteristics;
} IMAGE_SECTION_HEADER, *PIMAGE_SECTION_HEADER;

typedef char* PWSTR_placeholder;

"""


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        ROOT, "fortnite-external", "fortnite_external.cpp")

    os.makedirs(FAKE, exist_ok=True)
    with open(os.path.join(FAKE, "ntifs.h"), "w", encoding="utf-8") as fh:
        fh.write(NTIFS_H)

    with open(target, "r", encoding="utf-8") as fh:
        text = fh.read()

    km = text[text.index("#ifdef _KERNEL_MODE"):text.index("#else // _KERNEL_MODE")]
    km = km.replace("#ifdef _KERNEL_MODE", "#define _KERNEL_MODE 1")
    # the inline header comment in the single file version mentions the guard; harmless

    staged = os.path.join(FAKE, "stage_km.cpp")
    with open(staged, "w", encoding="utf-8") as fh:
        fh.write('#include "ntifs.h"\n' + km)

    cmd = [
        "g++", "-std=c++17", "-fsyntax-only", "-Wall",
        "-Wno-unused-parameter", "-Wno-unused-variable", "-Wno-unused-function",
        "-Wno-missing-field-initializers", "-Wno-unused-but-set-variable",
        "-I", FAKE, staged,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    if result.returncode == 0:
        print("KM half: syntax OK")
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
