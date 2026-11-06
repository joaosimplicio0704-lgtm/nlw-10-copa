@echo off
setlocal enabledelayedexpansion
title build fortnite_external

rem ---------------------------------------------------------------------------
rem  compila o fortnite_external_single.cpp sem abrir o Visual Studio
rem  acha o vcvars64.bat sozinho (VS 2022 / 2019 / 2017, qualquer edicao)
rem ---------------------------------------------------------------------------

echo.
echo [1/3] procurando o Visual Studio...

set "VCVARS="

rem 1) caminho oficial registrado pelo Visual Studio Installer
for /f "usebackq delims=" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
    if exist "%%i\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=%%i\VC\Auxiliary\Build\vcvars64.bat"
)

rem 2) varredura manual (caso o vswhere nao exista)
if not defined VCVARS (
    for %%e in (Community Professional Enterprise BuildTools Preview) do (
        for %%y in (2022 2019 2017) do (
            if not defined VCVARS (
                if exist "%ProgramFiles%\Microsoft Visual Studio\%%y\%%e\VC\Auxiliary\Build\vcvars64.bat" (
                    set "VCVARS=%ProgramFiles%\Microsoft Visual Studio\%%y\%%e\VC\Auxiliary\Build\vcvars64.bat"
                )
            )
            if not defined VCVARS (
                if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\%%y\%%e\VC\Auxiliary\Build\vcvars64.bat" (
                    set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\%%y\%%e\VC\Auxiliary\Build\vcvars64.bat"
                )
            )
        )
    )
)

if not defined VCVARS (
    echo.
    echo [ERRO] nao achei nenhum Visual Studio com o compilador C++ x64.
    echo        abra o Visual Studio Installer, clique em "Modificar" no seu VS
    echo        e marque:  Desenvolvimento para desktop com C++  ^(e o MSVC v143^)
    echo.
    pause
    exit /b 1
)

echo       usando: !VCVARS!
call "!VCVARS!" >nul 2>&1
if errorlevel 1 (
    echo [ERRO] falha ao preparar o ambiente do compilador.
    pause
    exit /b 1
)

echo.
echo [2/3] compilando...

if not exist "%~dp0fortnite_external_single.cpp" (
    echo [ERRO] fortnite_external_single.cpp nao esta nesta pasta:
    echo        %~dp0
    pause
    exit /b 1
)

pushd "%~dp0"
cl /nologo /std:c++17 /O2 /EHsc /W3 /D_CRT_SECURE_NO_WARNINGS ^
   fortnite_external_single.cpp ^
   /link /SUBSYSTEM:CONSOLE /OUT:fortnite_external.exe ^
   d3d9.lib dwmapi.lib user32.lib gdi32.lib psapi.lib winmm.lib
set "BUILD_RESULT=%errorlevel%"
popd

echo.
if not "%BUILD_RESULT%"=="0" (
    echo [3/3] FALHOU. copie as mensagens de erro acima.
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0fortnite_external.exe" (
    echo [3/3] o compilador terminou mas o .exe nao apareceu.
    pause
    exit /b 1
)

echo [3/3] pronto: %~dp0fortnite_external.exe
echo.
echo       agora rode o fortnite, entre numa partida, deixe o jogo em
echo       "janela sem bordas" e execute o .exe como ADMINISTRADOR.
echo.
pause
