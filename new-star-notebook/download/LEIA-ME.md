# 📥 Arquivos para baixar

> 👉 **Não sabe por onde começar? Abra o [`PASSO-A-PASSO.md`](./PASSO-A-PASSO.md).**
> Ele tem o passo a passo com o que clicar, o que deve aparecer e o que fazer se der erro.

Aqui estão as versões prontas do **New Star Notebook 2.0.1**.

## Atalho: abrir com um clique (Windows)

Baixe estes dois arquivos para a **mesma pasta**:

- `ABRIR-SITE.bat`
- `new-star-notebook-servidor.js`

Depois dê **dois cliques em `ABRIR-SITE.bat`**. Ele confere o Node.js, instala o que falta
e abre o navegador sozinho. No Mac/Linux, use `ABRIR-SITE.sh`.

---

## 1. `new-star-notebook.html` — o mais simples

Sistema completo em **um arquivo HTML**. Não precisa instalar nada.

1. Baixe o arquivo (no GitHub: abra o arquivo e clique em **Download raw file**).
2. Dê **dois cliques** nele (Chrome, Edge ou Firefox).
3. Entre com:

| E-mail | Senha | O que tem |
|---|---|---|
| `ana@teste.com` | `senha12345` | dados de exemplo |
| `bruno@teste.com` | `senha12345` | conta vazia |

Os dados ficam salvos **neste navegador**. O backup é em `.json` (aba **Backup e conta**).

## 2. `new-star-notebook-servidor.js` — o completo

Sistema completo em **um arquivo JavaScript**, com banco SQLite, backup `.sqlite`, restauração e
backup em nuvem.

Requisitos: Node.js 18+ e as bibliotecas `express` e `sql.js`.

```bash
npm install express sql.js
node new-star-notebook-servidor.js
```

Abra `http://localhost:3000`. As contas de demonstração são criadas automaticamente:

- `ana@teste.com` / `senha12345` (com dados)
- `bruno@teste.com` / `senha12345` (vazia)

Os dados ficam nas pastas `data/` e `backups/`, criadas ao lado do arquivo.

## 3. Extrair o `.zip` usando apenas o Node.js

Não tem WinRAR ou 7-Zip? Dá para descompactar com o próprio Node:

1. Baixe o `extrair-zip.js` desta pasta.
2. Coloque na **mesma pasta** do `.zip`.
3. Rode:

```bash
node extrair-zip.js                                  # extrai o único .zip da pasta
node extrair-zip.js new-star-notebook-2.0.1.zip      # escolhe o arquivo
node extrair-zip.js arquivo.zip minha-pasta          # escolhe o destino
node extrair-zip.js --listar arquivo.zip             # só mostra o conteúdo
```

Funciona no Windows, macOS e Linux, sem instalar nada.

## 4. Desempacotar o `.js` único de volta para o projeto

O `new-star-notebook-servidor.js` tem o código-fonte inteiro dentro. Para voltar
a ter os arquivos separados (`config.js`, `lib/`, `public/`, `server.js`...):

```bash
node new-star-notebook-servidor.js --extrair
node new-star-notebook-servidor.js --extrair minha-pasta
```

Ele cria a pasta com todos os arquivos e um `package.json`. Depois:

```bash
cd new-star-notebook-extraido
npm install
npm start
```

## 5. Quer a pasta completa (com `node_modules`)?


Baixe o `new-star-notebook-2.0.1-pronto.zip` que fica na raiz do projeto (fora desta pasta) ou use
**Code → Download ZIP** no GitHub para o repositório inteiro.

## Qual escolher?

| | `.html` | `.js` |
|---|---|---|
| Instalar algo | não | `npm install express sql.js` |
| Onde ficam os dados | navegador | computador (SQLite) |
| Backup `.sqlite` | não (só `.json`) | sim |
| Nuvem (Supabase/WebDAV) | não | sim |
| Vários computadores | não | sim |
| Serve para demonstração / 1 PC | ✅ | ✅ |
| Serve para a loja | ❌ | ✅ |

## Como gerar de novo

Na pasta do projeto:

```bash
npm run html-unico        # gera download/new-star-notebook.html
npm run servidor-unico    # gera download/new-star-notebook-servidor.js
npm run pacote            # gera os dois arquivos, os .zip e este LEIA-ME
npm run extrair           # extrai um .zip usando só o Node
```
