@echo off
setlocal enabledelayedexpansion
title New Star Notebook
cd /d "%~dp0"
color 07

echo.
echo  ==================================================
echo    NEW STAR NOTEBOOK - ABRIR O SISTEMA
echo  ==================================================
echo.

REM ---------- 1. Node.js instalado? ----------
where node >nul 2>nul
if errorlevel 1 goto SEM_NODE
for /f "delims=" %%v in ('node --version') do set "VERSAO_NODE=%%v"
echo  [1/4] Node.js encontrado: !VERSAO_NODE!

REM ---------- 2. O sistema esta aqui? Se nao, tenta extrair o .zip ----------
if exist "new-star-notebook-servidor.js" goto TEM_SISTEMA

set "ZIP="
for %%f in (*.zip) do if not defined ZIP set "ZIP=%%f"

if not defined ZIP goto SEM_ARQUIVO

echo  [2/4] Extraindo "!ZIP!"...
if not exist "extrair-zip.js" goto SEM_EXTRATOR

node extrair-zip.js "!ZIP!" "sistema"
if not exist "sistema\new-star-notebook-servidor.js" goto FALHA_EXTRACAO

copy /y "sistema\new-star-notebook-servidor.js" . >nul
if exist "sistema\new-star-notebook.html" copy /y "sistema\new-star-notebook.html" . >nul
echo        Arquivos prontos.

:TEM_SISTEMA
echo  [2/4] Arquivos do sistema: OK

REM ---------- 3. Bibliotecas instaladas? ----------
if exist "node_modules\express" if exist "node_modules\sql.js" goto TEM_BIBLIOTECAS

echo  [3/4] Instalando bibliotecas (precisa de internet, so na primeira vez)...
call npm install express@4 sql.js --no-audit --no-fund
if errorlevel 1 goto FALHA_NPM
echo        Bibliotecas instaladas.

:TEM_BIBLIOTECAS
echo  [3/4] Bibliotecas: OK

REM ---------- 4. Abrir o navegador e subir o servidor ----------
echo  [4/4] Iniciando o sistema...
echo.
echo  --------------------------------------------------
echo    ENDERECO:  http://localhost:3000
echo.
echo    Entrar com:  ana@teste.com   /  senha12345
echo             ou  bruno@teste.com /  senha12345
echo.
echo    Para FECHAR o sistema: aperte Ctrl+C aqui
echo    ou simplesmente feche esta janela.
echo  --------------------------------------------------
echo.

start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"

node new-star-notebook-servidor.js

echo.
echo  O sistema foi encerrado.
pause
exit /b 0

REM ======================= MENSAGENS DE ERRO =======================

:SEM_NODE
echo.
echo  [X] O Node.js nao esta instalado neste computador.
echo.
echo      1. Abra https://nodejs.org
echo      2. Baixe a versao "LTS" e instale (Next, Next, Finish)
echo      3. FECHE esta janela
echo      4. Abra este arquivo de novo
echo.
pause
exit /b 1

:SEM_ARQUIVO
echo.
echo  [X] Nao encontrei o arquivo "new-star-notebook-servidor.js"
echo      nem nenhum .zip nesta pasta.
echo.
echo      Coloque este .bat na MESMA PASTA do arquivo
echo      "new-star-notebook-servidor.js" (ou do .zip) e tente de novo.
echo.
echo      Pasta atual: %CD%
echo.
pause
exit /b 1

:SEM_EXTRATOR
echo.
echo  [X] Existe um .zip aqui, mas falta o "extrair-zip.js".
echo.
echo      Baixe o extrair-zip.js na pasta "download" do projeto
echo      e coloque junto deste .bat. Depois abra de novo.
echo.
pause
exit /b 1

:FALHA_EXTRACAO
echo.
echo  [X] Nao consegui extrair o .zip automaticamente.
echo.
echo      Alternativa: clique com o botao direito no .zip,
echo      escolha "Extrair Tudo...", e depois abra este .bat
echo      dentro da pasta extraida.
echo.
pause
exit /b 1

:FALHA_NPM
echo.
echo  [X] Falhou o download das bibliotecas (npm install).
echo.
echo      Verifique sua internet e tente de novo.
echo      Se estiver em rede de empresa, rode este arquivo
echo      como administrador ou peca para liberarem o acesso.
echo.
pause
exit /b 1
