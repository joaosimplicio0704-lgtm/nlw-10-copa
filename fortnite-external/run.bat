@echo off
setlocal enabledelayedexpansion
title fortnite_external
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem  roda o fortnite_external.exe pedindo admin, sem depender de "Executar como
rem  administrador" na mao. Se o .exe sair, a janela fica aberta com o codigo de
rem  saida em vez de fechar sozinha.
rem ---------------------------------------------------------------------------

echo.
echo [fortnite_external] iniciando como administrador...

net session >nul 2>&1
if errorlevel 1 (
    echo       pedindo elevacao ^(aceite o UAC^)...
    powershell -NoProfile -Command "Start-Process -FilePath '%~dp0fortnite_external.exe' -ArgumentList '%*' -WorkingDirectory '%~dp0' -Verb RunAs" 2>nul
    if errorlevel 1 (
        echo.
        echo [ERRO] a elevacao falhou. Clique com o botao direito no
        echo        fortnite_external.exe e escolha "Executar como administrador".
        echo.
        pause
        exit /b 1
    )
    echo       processo elevado iniciado; esta janela pode ser fechada.
    echo.
    exit /b 0
)

if not exist "fortnite_external.exe" (
    echo [ERRO] fortnite_external.exe nao existe nesta pasta. Rode o build.bat primeiro.
    echo.
    pause
    exit /b 1
)

"%~dp0fortnite_external.exe" %*
set "EXITCODE=%errorlevel%"

echo.
echo [fortnite_external] terminou com codigo %EXITCODE%.
if not "%EXITCODE%"=="0" echo   ^(veja as mensagens [*] / [!] acima^)
echo.
echo   dicas se nao abriu nada na tela:
echo     - deixe o Fortnite em "janela sem bordas" no monitor principal
echo     - rode como administrador ^(o OpenProcess precisa disso^)
echo     - o console abaixo e a fonte da verdade: ele lista cada etapa
echo.
pause
exit /b %EXITCODE%
