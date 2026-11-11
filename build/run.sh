#!/usr/bin/env bash
cd "$(dirname "$0")"
xdg-open index.html 2>/dev/null || open index.html 2>/dev/null || echo "abra o index.html no navegador"
