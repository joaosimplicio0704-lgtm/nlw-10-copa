#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  NEW STAR NOTEBOOK — ABRIR O SISTEMA (macOS e Linux)
#
#  Uso: clique duas vezes (se o sistema permitir) ou rode no Terminal:
#        bash ABRIR-SITE.sh
# ---------------------------------------------------------------------------

cd "$(dirname "$0")" || exit 1

echo ""
echo "  =================================================="
echo "    NEW STAR NOTEBOOK - ABRIR O SISTEMA"
echo "  =================================================="
echo ""

# ---------- 1. Node.js ----------
if ! command -v node >/dev/null 2>&1; then
  echo "  [X] O Node.js não está instalado."
  echo ""
  echo "      1. Abra https://nodejs.org"
  echo "      2. Baixe a versão LTS e instale"
  echo "      3. Rode este arquivo de novo"
  echo ""
  exit 1
fi
echo "  [1/4] Node.js encontrado: $(node --version)"

# ---------- 2. Arquivos do sistema ----------
if [ ! -f "new-star-notebook-servidor.js" ]; then
  ZIP="$(printf '%s\n' *.zip 2>/dev/null | grep -i '\.zip$' | head -n 1)"

  if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
    echo ""
    echo "  [X] Não encontrei o new-star-notebook-servidor.js nem um .zip aqui."
    echo "      Coloque este script na mesma pasta do arquivo."
    echo "      Pasta atual: $(pwd)"
    echo ""
    exit 1
  fi

  if [ ! -f "extrair-zip.js" ]; then
    echo ""
    echo "  [X] Existe um .zip aqui, mas falta o extrair-zip.js."
    echo "      Baixe o extrair-zip.js da pasta download do projeto."
    echo ""
    exit 1
  fi

  echo "  [2/4] Extraindo \"$ZIP\"..."
  if ! node extrair-zip.js "$ZIP" sistema; then
    echo ""
    echo "  [X] Não consegui extrair. Tente copiar os arquivos manualmente."
    echo ""
    exit 1
  fi

  cp -f "sistema/new-star-notebook-servidor.js" .
  [ -f "sistema/new-star-notebook.html" ] && cp -f "sistema/new-star-notebook.html" .
fi
echo "  [2/4] Arquivos do sistema: OK"

# ---------- 3. Bibliotecas ----------
if [ ! -d "node_modules/express" ] || [ ! -d "node_modules/sql.js" ]; then
  echo "  [3/4] Instalando bibliotecas (precisa de internet, só na primeira vez)..."

  if ! npm install express@4 sql.js --no-audit --no-fund; then
    echo ""
    echo "  [X] Falhou o npm install. Verifique a internet e tente de novo."
    echo ""
    exit 1
  fi
fi
echo "  [3/4] Bibliotecas: OK"

# ---------- 4. Servidor ----------
echo "  [4/4] Iniciando o sistema..."
echo ""
echo "  --------------------------------------------------"
echo "    ENDEREÇO:   http://localhost:3000"
echo ""
echo "    Entrar com:  ana@teste.com   /  senha12345"
echo "             ou  bruno@teste.com /  senha12345"
echo ""
echo "    Para FECHAR: aperte Ctrl+C"
echo "  --------------------------------------------------"
echo ""

( sleep 3
  if command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000 >/dev/null 2>&1
  elif command -v open >/dev/null 2>&1; then open http://localhost:3000
  fi ) &

node new-star-notebook-servidor.js

echo ""
echo "  O sistema foi encerrado."
