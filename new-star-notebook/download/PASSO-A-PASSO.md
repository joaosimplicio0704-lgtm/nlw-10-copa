# 📖 PASSO A PASSO — New Star Notebook

Escolha **um** dos caminhos abaixo. Não precisa dos dois.

- **Caminho A** → só quer ver o site funcionando (mais fácil, nada para instalar)
- **Caminho B** → quer o sistema completo, com banco de dados e backup `.sqlite`

---

# 🟢 Caminho A — abrir o site (2 cliques, nada para instalar)

## Passo 1 — Baixar o arquivo HTML

1. Abra a pasta **`download`** do projeto.
2. Clique em **`new-star-notebook.html`**.
3. Clique no botão de download (**Download raw file**, ícone ↓ no canto direito).

> O arquivo tem cerca de **1 MB**. Ele vai para a sua pasta **Downloads**.

## Passo 2 — Abrir

1. Vá até a pasta **Downloads**.
2. Dê **dois cliques** em `new-star-notebook.html`.

✅ **Deu certo se:** o navegador abrir a tela azul escrito **NEW STAR NOTEBOOK**.

❌ **Se abrir o Bloco de Notas ou o código:**
clique com o botão direito no arquivo → **Abrir com** → **Google Chrome** (ou Edge).

## Passo 3 — Entrar

Na tela de login, digite:

| Campo | Valor |
|---|---|
| E-mail | `ana@teste.com` |
| Senha | `senha12345` |

Clique em **Entrar**.

✅ **Deu certo se:** aparecer a lista com 3 serviços (Carlos Andrade, Fernanda Lima, Roberto Dias).

## Passo 4 — Fazer backup (importante)

1. Clique na aba **Backup e conta** (última aba, à direita).
2. Clique em **Baixar backup (.json)**.
3. Guarde esse arquivo no pen drive ou no Google Drive.

> ⚠️ Neste modo os dados ficam **no navegador**. Se você limpar o histórico/cookies,
> eles somem. O backup `.json` é a sua segurança.

---

# 🔵 Caminho B — sistema completo (com banco de dados)

Aqui os dados ficam no computador, em um banco SQLite de verdade, com backup `.sqlite`
e possibilidade de acessar de outros computadores da loja.

## Passo 1 — Instalar o Node.js (só uma vez)

1. Abra **https://nodejs.org**
2. Clique no botão verde **LTS**.
3. Abra o arquivo baixado e clique **Next → Next → I agree → Next → Install → Finish**.
4. **Feche e abra de novo** o Explorador de Arquivos.

✅ **Como saber se instalou:** abra o **Prompt de Comando** (tecla Windows → digite `cmd` → Enter)
e digite:

```
node --version
```

Deve aparecer algo como `v20.11.0`. Se aparecer "não é reconhecido", reinicie o computador
e tente de novo.

## Passo 2 — Baixar os arquivos

Você precisa de **3 arquivos** da pasta `download` do projeto:

| Arquivo | Para que serve |
|---|---|
| `ABRIR-SITE.bat` | é o que você vai clicar (Windows) |
| `new-star-notebook-servidor.js` | o sistema completo |
| `extrair-zip.js` | só é usado se você preferir o `.zip` |

**Como baixar cada um:** abra o arquivo no GitHub → clique em **Download raw file** (ícone ↓).

> No Mac ou Linux, baixe o **`ABRIR-SITE.sh`** no lugar do `.bat`.

## Passo 3 — Juntar tudo numa pasta

1. Crie uma pasta nova, por exemplo: **`C:\NewStar`**
   (área de trabalho → botão direito → Novo → Pasta)
2. Coloque os arquivos baixados **dentro dela**.

A pasta deve ficar assim:

```
C:\NewStar\
├── ABRIR-SITE.bat
├── new-star-notebook-servidor.js
└── extrair-zip.js
```

## Passo 4 — Dois cliques em `ABRIR-SITE.bat`

Vai abrir uma **janela preta** que faz tudo sozinho:

```
[1/4] Node.js encontrado: v20.11.0
[2/4] Arquivos do sistema: OK
[3/4] Instalando bibliotecas (precisa de internet, só na primeira vez)...
[4/4] Iniciando o sistema...

   ENDEREÇO:  http://localhost:3000
   Entrar com:  ana@teste.com  /  senha12345
```

O navegador abre sozinho em 3 segundos.

✅ **Deu certo se:** aparecer a tela de login do New Star Notebook.

> ⚠️ **Deixe a janela preta aberta.** É ela que mantém o site funcionando.
> Para fechar o site: aperte **Ctrl+C** nela ou simplesmente feche a janela.

## Passo 5 — Entrar

| Campo | Valor |
|---|---|
| E-mail | `ana@teste.com` |
| Senha | `senha12345` |

Contas de demonstração:

| Conta | O que mostra |
|---|---|
| `ana@teste.com` | 3 serviços, contatos, financeiro, peças, estoque e 1 OS |
| `bruno@teste.com` | conta vazia (para ver que cada login tem dados separados) |

## Passo 6 — Fazer backup

Na aba **Backup e conta**, clique em **Baixar banco (.sqlite)**.
O arquivo pode ser aberto no [DB Browser for SQLite](https://sqlitebrowser.org) se precisar.

Além disso, o sistema guarda backups automáticos na pasta:

```
C:\NewStar\backups\
```

## Passo 7 — Abrir no dia seguinte

É só dar **dois cliques em `ABRIR-SITE.bat`** de novo. Os dados continuam lá
(ficam na pasta `C:\NewStar\data\`).

---

# ❓ Problemas comuns

## "O Node.js não está instalado"

Você baixou mas não instalou, ou instalou e não reiniciou o computador.
→ Instale em https://nodejs.org e **reinicie o computador**.

## "Falhou o download das bibliotecas (npm install)"

O computador está sem internet ou a rede bloqueia o acesso.
→ Conecte na internet e clique em `ABRIR-SITE.bat` de novo.
→ Se estiver na rede da loja, peça para liberarem o acesso ao `npmjs.com`.

## "Nao encontrei o arquivo new-star-notebook-servidor.js"

O `.bat` está numa pasta diferente do sistema.
→ Coloque o `.bat` na **mesma pasta** do `new-star-notebook-servidor.js`.

## O Windows avisa "Windows protegeu o computador"

O arquivo `.bat` foi baixado da internet.
→ Clique em **Mais informações** → **Executar assim mesmo**.

## Aparece "Sua sessão expirou"

Clique em **Entrar** de novo com o mesmo e-mail e senha. Seu e-mail já fica preenchido.

## A porta 3000 está ocupada

Outro programa está usando a porta. Feche a janela preta anterior (se ainda estiver aberta)
ou reinicie o computador.

## Quero começar do zero (apagar os dados de teste)

1. Feche a janela preta.
2. Apague a pasta **`data`**.
3. Abra `ABRIR-SITE.bat` de novo.

## Quero os dados da versão antiga do sistema

Se você já usou a versão antiga **neste mesmo navegador**, o sistema mostra um aviso
verde no topo: **"Encontramos dados da versão antiga"** e um botão **Importar para minha conta**.
Clique nele.

---

# 📁 O que é cada arquivo

| Arquivo | O que é |
|---|---|
| `new-star-notebook.html` | sistema inteiro em 1 arquivo. Abre com 2 cliques, sem instalar. Dados no navegador. |
| `new-star-notebook-servidor.js` | sistema completo em 1 arquivo. Precisa do Node.js. Dados em SQLite. |
| `ABRIR-SITE.bat` | clique nele no Windows para abrir o sistema completo |
| `ABRIR-SITE.sh` | o mesmo, para Mac e Linux |
| `extrair-zip.js` | descompacta `.zip` usando só o Node.js |
| `new-star-notebook-2.0.1.zip` | os arquivos do sistema + instruções, num download só |
| `new-star-notebook-2.0.1-projeto.zip` | o projeto com os arquivos separados (para quem vai mexer no código) |

---

# 🆘 Se ainda não funcionar

Anote e me mande:

1. **O que você clicou** (ex.: "dois cliques no ABRIR-SITE.bat")
2. **O que apareceu** (pode ser foto da tela)
3. **A mensagem de erro completa**, se houver

Com isso eu consigo dizer exatamente onde travou.
