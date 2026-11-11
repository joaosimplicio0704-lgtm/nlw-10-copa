# build — IA do zero (executável)

Esta pasta contém o site completo da IA, pronto para rodar offline no navegador.

## Como executar

**Windows:** dê duplo clique em `start.bat` (abre o `index.html` no navegador padrão).  
**Linux/Mac:** rode `./run.sh` ou abra o `index.html` diretamente no navegador.

## Sobre o .exe

Não há compilador cross-platform (MinGW/Wine) neste ambiente, então não foi possível gerar um binário `.exe` de Windows direto do Linux. O `start.bat` cumpre a mesma função: inicia a interface da IA no navegador. Se precisar de um `.exe` verdadeiro, compila com Electron ou com um empacotador que rode `index.html` em uma janela nativa.

## Estrutura

- `index.html` — interface
- `main.js` — lógica da rede, treino e análise
- `style.css` — visual
- `ai/` — rede neural, otimizadores, parser e analisador (escritos do zero, sem biblioteca externa)
