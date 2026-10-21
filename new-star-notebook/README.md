# New Star Notebook

Sistema de **ordens de serviço, estoque, financeiro e peças** para loja de notebooks.
Agora com **login e cadastro**, **um banco de dados por conta** (isolamento real entre usuários),
**backup em `.sqlite`/`.json`**, **backup em nuvem opcional** e **importação dos dados antigos** que
estavam no `localStorage`.

> Esta é a versão 2.0 do sistema. A análise técnica que originou as mudanças está em
> [`ANALISE.md`](./ANALISE.md). Os arquivos originais ficaram guardados em
> [`legacy-versao-1/`](./legacy-versao-1/) apenas como referência — não são usados para rodar.

---

## Sumário

- [O que mudou](#o-que-mudou)
- [Como rodar](#como-rodar)
- [Versão de arquivo único](#versão-de-arquivo-único-um-html)
- [Versão de um único arquivo .js (servidor completo)](#versão-de-um-único-arquivo-js-servidor-completo)
- [Contas e isolamento dos dados](#contas-e-isolamento-dos-dados)
- [Backup e restauração](#backup-e-restauração)
- [Backup em nuvem (opcional)](#backup-em-nuvem-opcional)
- [Importar os dados da versão antiga](#importar-os-dados-da-versão-antiga)
- [Configuração (.env)](#configuração-env)
- [Colocar em produção](#colocar-em-produção)
- [API](#api)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Segurança](#segurança)
- [Solução de problemas](#solução-de-problemas)

---

## O que mudou

| Versão antiga | Versão 2.0 |
|---|---|
| Dados no `localStorage` do navegador | Dados no servidor, em SQLite |
| Só notebooks passavam pelo servidor | Todas as entidades passam pela API |
| Sem login nem senha | Cadastro, login, sessão por token e senha com scrypt |
| Uma base compartilhada | Cada conta vê **apenas** os próprios dados (`tenant_id`) |
| SQLite via pacote nativo `sqlite3` (falha no Windows) | SQLite via `sql.js` (WASM), instala em qualquer lugar |
| Sem backup | Download `.sqlite`/`.json` por conta + nuvem opcional + backup automático no servidor |
| XSS armazenado nas tabelas | Todo dado do usuário é escapado no HTML |
| Nome de tabela da URL interpolado no SQL | Allowlist fixa de entidades e colunas |
| "Imprimir Direto" em branco | Documento de OS próprio, impressão e PDF funcionando |
| Sem responsividade | Layout adaptado para celular/tablet |
| Dinheiro como texto | Valores em centavos (`INTEGER`) e formatação `R$ 1.234,56` |

---

## Baixar pronto

Na pasta [`download/`](./download/) ficam as versões prontas em **arquivo único**:

| Arquivo | O que é |
|---|---|
| `new-star-notebook.html` | Sistema completo em um HTML. Dois cliques, sem instalar nada. |
| `new-star-notebook-servidor.js` | Sistema completo em um `.js`, com SQLite, backup `.sqlite` e nuvem. |
| `new-star-notebook-2.0.1.zip` | Os dois arquivos acima + instruções. |
| `new-star-notebook-2.0.1-projeto.zip` | Projeto com os arquivos separados (rode `npm install` uma vez). |

No GitHub, para baixar: abra a pasta `download/`, entre no arquivo e clique em **Download raw file**.
Para o repositório inteiro: **Code → Download ZIP**.

Para regenerar tudo: `npm run pacote`.

---

## Como rodar

Pré-requisito: **Node.js 18.17 ou superior** (recomendado Node 20+).

```bash
cd new-star-notebook
npm install
npm start
```

Abra **http://localhost:3000**.

- Na primeira vez, clique em **Criar conta**.
- Para abrir já com dados de exemplo: `npm run demo` (cria as contas abaixo).
- Cada conta tem um banco de dados próprio: os dados de um login não aparecem no outro.
- Para desenvolvimento com reinício automático: `npm run dev`.
- Para encerrar: `Ctrl + C` (o banco é gravado no disco antes de sair).

O arquivo do banco fica em `data/newstar.sqlite` e **não é versionado** (veja `.gitignore`).

### Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor na porta 3000 |
| `npm run dev` | Sobe com `node --watch` (reinicia ao salvar) |
| `npm test` | Roda o teste rápido da API (isolamento, backup, importação) |
| `npm run backup` | Cria um backup do banco completo em `backups/` |
| `npm run demo` | Cria contas de demonstração com dados de exemplo (só em banco vazio) |
| `npm run html-unico` | Gera a versão de arquivo único em `download/new-star-notebook.html` |
| `npm run servidor-unico` | Gera o servidor completo em um único `.js` em `download/` |
| `npm run pacote` | Gera os dois arquivos acima + os `.zip` em `download/` |

---

### Contas de demonstração

O comando `npm run demo` cria duas contas (apenas se o banco ainda não tiver nenhuma):

| E-mail | Senha | Conteúdo |
|---|---|---|
| `ana@teste.com` | `senha12345` | serviços, contatos, financeiro, peças, estoque e uma OS |
| `bruno@teste.com` | `senha12345` | conta vazia, útil para ver o isolamento |

Para recomeçar do zero, apague a pasta `data/` e rode `npm start` (banco vazio) ou `npm run demo`.

---

## Versão de arquivo único (um `.html`)

Além do sistema com servidor, existe uma versão que é **um único arquivo `.html`** — abre com dois
cliques, sem Node.js, sem instalar nada e sem internet.

```bash
npm run html-unico      # gera download/new-star-notebook.html
```

O arquivo já contém a interface, o CSS, o `html2pdf` e um "servidor" que roda dentro do navegador
e responde às mesmas rotas `/api/*`, guardando tudo no `localStorage`.

**O que funciona igual:** login, cadastro, contas separadas (cada login vê só os próprios dados),
serviços/OS, contatos, financeiro, peças, estoque, impressão, PDF e backup em `.json`.

**O que muda:**

| No servidor | Arquivo único |
|---|---|
| Dados em SQLite no computador servidor | Dados no `localStorage` **deste navegador** |
| Backup `.sqlite` e `.json` | Backup apenas `.json` |
| Backup em nuvem (Supabase/WebDAV) | Não disponível |
| Vários computadores acessam o mesmo banco | Cada navegador tem os seus dados |
| Senha protegida no servidor | Senha com hash no navegador — separa contas, mas não protege contra quem usa o mesmo computador |

Use a versão de arquivo único para demonstração, uso em um único computador ou para levar no pen
drive. Para a loja com vários computadores e backup em nuvem, use a versão com servidor.

Contas de demonstração no arquivo único: `ana@teste.com` e `bruno@teste.com`, senha `senha12345`.
Para apagar tudo e recomeçar, abra o console do navegador (F12) e rode `NewStarArquivoUnico.zerar()`.

---

## Versão de um único arquivo `.js` (servidor completo)

Se você quer **um só arquivo de código** mas com todos os recursos do servidor (banco SQLite,
backup `.sqlite`/`.json`, restauração e nuvem), gere:

```bash
npm run servidor-unico     # gera download/new-star-notebook-servidor.js
```

Depois:

```bash
node new-star-notebook-servidor.js
```

O arquivo tem o backend completo **e a interface embutida** (HTML, CSS, JS e o gerador de PDF).
Ele cria sozinho as pastas `data/` e `backups/` ao lado de onde estiver, e no primeiro uso cria as
contas de demonstração (`ana@teste.com` / `bruno@teste.com`, senha `senha12345`).

Únicas dependências externas: `express` e `sql.js` (bibliotecas de terceiros).

```bash
npm install express sql.js
```

| | Vários arquivos (projeto) | Um único `.js` | Um único `.html` |
|---|---|---|---|
| Manutenção/leitura | melhor | código empacotado | código empacotado |
| Instalar | `npm install` | `npm install express sql.js` | nada |
| Banco | SQLite no computador | SQLite no computador | navegador |
| Backup `.sqlite` | sim | sim | não (só `.json`) |
| Nuvem | sim | sim | não |
| Vários computadores | sim | sim | não |

---

## Contas e isolamento dos dados

O sistema usa **uma única base SQLite** com o campo `tenant_id` em todas as tabelas de negócio.
O `tenant_id` é o `id` do usuário logado, e **toda consulta da API filtra por ele**.

```
usuarios
  id 1  Ana      -> servicos.tenant_id = 1
  id 2  Bruno    -> servicos.tenant_id = 2
```

Na prática:

- Ana não consegue listar, editar nem excluir registros do Bruno (a API responde **404**).
- O backup `.sqlite` de Ana contém **somente** os dados dela (e nenhum hash de senha).
- Um arquivo de backup restaurado é remapeado para a conta que está restaurando.
- Sessões e senhas ficam na mesma base, mas nunca são devolvidas pela API.

> Se você precisa de contas que compartilham os mesmos dados (ex.: dois atendentes da mesma loja),
> isso ainda não existe. Hoje **cada login = uma loja/conta independente**. É possível adicionar
> "membros da equipe" depois, ligando vários usuários ao mesmo `tenant_id`.

### Senhas

- Mínimo de 8 caracteres.
- Hash com **scrypt** (salt aleatório por senha), nunca texto puro.
- Sessão com token aleatório de 32 bytes, guardado **hasheado** no banco (SHA-256).
- Token vale 30 dias (configurável) e é apagado no "Sair".

---

## Backup e restauração

Na aba **Backup e conta**:

| Botão | Resultado |
|---|---|
| **Baixar banco (.sqlite)** | Arquivo SQLite só com os dados da conta, pronto para abrir em DB Browser, DBeaver etc. |
| **Baixar JSON** | Mesmos dados em JSON (fácil de importar em planilha) |
| **Restaurar do arquivo** | Envia um `.sqlite` ou `.json` e **substitui** os dados da conta |
| **Enviar backup para a nuvem** | Sobe a cópia para Supabase Storage ou WebDAV (se configurado) |
| **Restaurar da nuvem** | Baixa e restaura o último backup enviado |

Regras importantes:

1. **A restauração substitui** os dados atuais da conta (a conta, a senha e o histórico de ações são mantidos).
2. O arquivo baixado **não contém dados de outras contas**.
3. O download pode ser feito a qualquer momento, mesmo sem nuvem configurada.
4. O servidor também cria backups automáticos do banco completo em `backups/`
   (a cada 24 h, mantendo 30 dias por padrão). Esses backups são para recuperação de desastre
   e **não** ficam expostos pela API.

**Faça um backup antes de qualquer atualização do sistema.** Um arquivo `.sqlite` guardado em outro
computador/nuvem é a garantia contra perda de dados.

---

## Backup em nuvem (opcional)

O sistema funciona sem nuvem. Para ativar, copie `.env.example` para `.env` e preencha **uma** das opções.

### Opção A — Supabase Storage

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings → API**, copie a **URL** e a **service_role key**.
3. No `.env`:

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...
SUPABASE_BUCKET=newstar
```

O bucket `newstar` é criado automaticamente no primeiro envio (privado).
Cada conta envia para `newstar/conta-<id>/backup.sqlite`.

### Opção B — WebDAV (Nextcloud, ownCloud, InfiniCLOUD, HiDrive…)

```env
WEBDAV_URL=https://nuvem.exemplo.com/remote.php/dav/files/usuario/newstar
WEBDAV_USER=usuario
WEBDAV_PASS=senha-de-app
```

O arquivo vai para `newstar-conta-<id>.sqlite` dentro dessa pasta.

> ⚠️ A `service_role key` do Supabase tem poder total sobre o projeto. Mantenha o `.env` fora do Git
> (já está no `.gitignore`) e nunca a coloque no front-end.

---

## Importar os dados da versão antiga

Os dados antigos estavam em `localStorage`, no navegador em que o sistema era usado.

1. Entre na conta nova.
2. Se o navegador tiver dados antigos, aparece um **aviso amarelo** no topo.
3. Clique em **Importar para minha conta** (ou use a aba **Backup e conta → Dados antigos deste navegador**).

O que é convertido automaticamente:

- `servicos`: `desc` → `descricao`, inclusão de `cmaleta`, status validado.
- `financeiro`: `valor` em texto (`R$ 1.234,56`) → centavos (`123456`).
- `pecas`: data e status (a versão antiga não salvava esses campos no SQLite).
- `notebooksLoja`: status padrão "Disponível".
- `osProntas`: viram a tabela `os` (e o mesmo número atualiza a OS em vez de duplicar).

A importação **não apaga** o `localStorage` original. Faça um backup do navegador antes, por segurança:

```js
// Console do navegador (F12), na página do sistema antigo
const blob = new Blob([localStorage.getItem('newStarData') || '{}'], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'backup-new-star-antigo.json';
a.click();
```

Esse arquivo também pode ser restaurado pela aba **Backup e conta → Restaurar de um arquivo**.

> **Importante:** o `localStorage` é por origem. Se você abria o sistema antigo como arquivo
> (`file://`) e agora abre em `http://localhost:3000`, são "bancos" diferentes. Importe no
> navegador e endereço em que os dados antigos apareciam.

---

## Configuração (.env)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `NODE_ENV` | `development` | Ambiente |
| `SESSION_DAYS` | `30` | Validade da sessão em dias |
| `DATA_DIR` | `./data` | Onde fica o SQLite |
| `BACKUP_DIR` | `./backups` | Onde ficam os backups automáticos |
| `BACKUP_INTERVALO_HORAS` | `24` | Intervalo dos backups do servidor |
| `BACKUP_RETER_DIAS` | `30` | Quantos dias de backup manter |
| `LOGIN_MAX_TENTATIVAS` | `20` | Tentativas de login por IP na janela |
| `LOGIN_JANELA_MIN` | `15` | Janela em minutos |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_BUCKET` | — | Nuvem Supabase |
| `WEBDAV_URL` / `WEBDAV_USER` / `WEBDAV_PASS` | — | Nuvem WebDAV |

O arquivo `.env` é lido automaticamente (sem dependência `dotenv`). Variáveis do sistema têm prioridade.

---

## Colocar em produção

O cenário mais comum é um PC na loja ou uma VPS pequena.

### 1. Rodar como serviço (Linux, com systemd)

```ini
# /etc/systemd/system/newstar.service
[Unit]
Description=New Star Notebook
After=network.target

[Service]
Type=simple
User=newstar
WorkingDirectory=/opt/new-star-notebook
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now newstar
```

### 2. HTTPS (obrigatório se sair da rede local)

Use **Caddy** (mais simples) na frente do Node:

```
# /etc/caddy/Caddyfile
sistema.sualoja.com.br {
    reverse_proxy 127.0.0.1:3000
}
```

Se o acesso for só na rede da loja, ainda assim use senha forte e mantenha o servidor atrás do roteador
(sem abrir a porta para a internet).

### 3. Windows (loja)

- Instale o Node.js LTS.
- Rode `npm install` e depois `npm start` na pasta.
- Para iniciar com o Windows, crie uma tarefa no **Agendador de Tarefas** apontando para
  `node.exe server.js` com "Iniciar em" = pasta do projeto.
- Configure o backup: copie a pasta `backups/` para o Google Drive/OneDrive ou use a nuvem no sistema.

### Atualizar o sistema

1. Faça um backup (`.sqlite`) pela interface **ou** `npm run backup`.
2. Substitua os arquivos do projeto (mantenha `data/` e `.env`).
3. `npm install` e reinicie o serviço.

---

## API

Todas as rotas `/api/*` (exceto login/cadastro) exigem sessão válida. O token pode ir em
`Authorization: Bearer <token>`, no header `X-Sessao: <token>` **ou** no cookie
`newstar_sessao` (HttpOnly), que o login define sozinho. Os caminhos antigos
`/api/login` e `/api/registrar` continuam aceitos como alias.

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/auth/registrar` (ou `/api/registrar`) | Criar conta |
| POST | `/api/auth/entrar` (ou `/api/login`) | Login (devolve token e define cookie) |
| GET | `/api/auth/eu` | Usuário da sessão |
| POST | `/api/auth/sair` | Encerrar sessão (apaga o cookie) |
| GET | `/api/dados` | Todos os dados da conta (uma chamada) |
| POST | `/api/servicos` | Criar serviço |
| PUT | `/api/servicos/:id` | Atualizar serviço |
| PATCH | `/api/servicos/:id/status` | Alterar status |
| DELETE | `/api/servicos/:id` | Excluir |
| … | `/api/telefones`, `/api/financeiro`, `/api/pecas`, `/api/notebooks_loja`, `/api/os` | Mesmo padrão |
| GET | `/api/backup.sqlite` | Baixar banco da conta |
| GET | `/api/backup.json` | Baixar JSON da conta |
| POST | `/api/restaurar` | Restaurar `.sqlite` (base64) ou JSON |
| POST | `/api/importar` | Importar `newStarData` antigo |
| GET | `/api/backup/nuvem` | Status da nuvem |
| POST | `/api/backup/nuvem` | Enviar backup |
| POST | `/api/backup/nuvem/restaurar` | Restaurar da nuvem |
| GET | `/health` | Health check (sem autenticação) |

Exemplo:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/entrar \
  -H 'Content-Type: application/json' \
  -d '{"email":"voce@exemplo.com","senha":"sua-senha"}' | jq -r .token)

curl -s http://localhost:3000/api/dados -H "Authorization: Bearer $TOKEN"
curl -s -OJ http://localhost:3000/api/backup.sqlite -H "Authorization: Bearer $TOKEN"
```

---

## Estrutura do projeto

```
new-star-notebook/
├── server.js                # servidor Express + rotas
├── config.js                # configuração e leitura do .env
├── lib/
│   ├── schema.js            # schema SQLite
│   ├── db.js                # acesso ao sql.js (gravação atômica)
│   ├── auth.js              # senha (scrypt) e sessões
│   ├── entidades.js         # allowlist de entidades/campos
│   ├── validacao.js         # validação e normalização
│   ├── auditoria.js         # trilha de ações
│   ├── config-conta.js      # preferências por conta
│   ├── importacao.js        # importação (localStorage, JSON, SQLite)
│   ├── conta-backup.js      # exportação por conta
│   ├── nuvem.js             # Supabase/WebDAV
│   └── backups.js           # backups automáticos do servidor
├── public/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── vendor/html2pdf.bundle.min.js
├── scripts/backup.js
├── tests/smoke.js
├── download/                # versões prontas para baixar (geradas)
├── legacy-versao-1/         # arquivos originais, só para referência
├── data/                    # banco (fora do Git)
├── backups/                 # backups do servidor (fora do Git)
├── .env.example
└── package.json
```

---

## Segurança

O que já está implementado:

- Senha com **scrypt** + salt; token de sessão aleatório guardado com hash.
- Isolamento por conta em **todas** as consultas (`tenant_id`).
- Allowlist de entidades e colunas — nada de SQL montado com dado da URL.
- Parâmetros vinculados (`?`) em todos os valores.
- Escape de HTML em todas as saídas (XSS armazenado não executa).
- CSP restritiva, `nosniff`, `Referrer-Policy`, sem `x-powered-by`.
- Limite de tentativas de login por IP.
- Erros genéricos para não revelar detalhes internos.
- Auditoria de criação/alteração/exclusão, backup e conta.

O que **você** deve fazer:

- Usar HTTPS (Caddy/Nginx) se o sistema for acessível fora do próprio PC.
- Não abrir a porta do Node diretamente para a internet.
- Manter o `.env` e a pasta `data/` fora do Git (já configurado).
- Fazer backup com frequência e **testar a restauração** de vez em quando.
- Atualizar as dependências (`npm audit`, `npm update`) periodicamente.

Limitações conhecidas:

- **Sem "esqueci minha senha"** (não há envio de e-mail). Se precisar, a senha pode ser redefinida
  por um administrador com acesso ao servidor (ou implemente recuperação por e-mail).
- **Sem compartilhamento de conta entre atendentes** (cada login é uma conta separada).
- **Sem anexos/fotos** na OS.
- O token fica no `localStorage` do navegador; em caso de XSS ele poderia ser lido — por isso todo
  conteúdo é escapado e a CSP bloqueia scripts externos.

---

## Solução de problemas

**"Não foi possível conectar ao servidor"**
Verifique se `npm start` está rodando e se a porta 3000 está livre (`lsof -i :3000` no Linux/macOS,
`netstat -ano | findstr :3000` no Windows).

**"Já existe uma conta com esse e-mail"**
Use "Entrar" ou outro e-mail. As contas são independentes.

**Perdi os dados ao abrir em outro computador**
Os dados agora ficam **no servidor**, não no navegador. Se o servidor for o mesmo, abra o mesmo endereço
(ex.: `http://192.168.0.10:3000`). Se você trocou o endereço, os dados antigos podem estar em outro
`localStorage` — veja "Importar os dados da versão antiga".

**O PDF não é gerado**
Confirme que `public/vendor/html2pdf.bundle.min.js` existe (ele é servido localmente, não vem de CDN).
Se estiver bloqueado por extensão do navegador, use "Imprimir" e escolha "Salvar como PDF".

**A nuvem não aparece como configurada**
Confira o `.env`, reinicie o servidor e abra `GET /api/backup/nuvem` com o token.
Erros de bucket/permissão aparecem na resposta do botão "Enviar backup para a nuvem".

**Apareceu "Sua sessão expirou. Entre novamente."**
Isso acontece quando o token salvo no navegador não vale mais (sessão vencida, logout em outra aba
ou banco restaurado). O sistema já limpa o token, volta para o login e guarda o e-mail; basta digitar
a senha. Se a página estiver aberta desde antes de uma atualização, recarregue com **Ctrl+F5**.
Em preview/iframe o login usa também um cookie `HttpOnly`, então funciona mesmo se o proxy
remover o header `Authorization`.

**Esqueci a senha**
Hoje não há recuperação automática. Com acesso ao servidor, é possível redefinir via API/console
(ex.: gerar um hash com `lib/auth.hashSenha` e atualizar `usuarios.senha_hash`).

---

## Licença

Uso interno da loja. Sinta-se livre para adaptar.
