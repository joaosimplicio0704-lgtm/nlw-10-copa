'use strict';

/**
 * Gera o servidor em UM ÚNICO ARQUIVO JavaScript.
 *
 * Junta em `download/new-star-notebook-servidor.js`:
 *   - config.js, lib/*.js e server.js (backend completo)
 *   - a interface (public/index.html, style.css, script.js e html2pdf)
 *
 * O arquivo final roda com:
 *   node new-star-notebook-servidor.js
 *
 * Dependências externas: express e sql.js (npm install express sql.js).
 * Elas ficam em node_modules porque são bibliotecas de terceiros, não código
 * do sistema.
 *
 * Uso: npm run servidor-unico
 */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = (...partes) => fs.readFileSync(path.join(raiz, ...partes), 'utf8');

const MODULOS = [
  'config.js',
  'lib/schema.js',
  'lib/db.js',
  'lib/validacao.js',
  'lib/entidades.js',
  'lib/auditoria.js',
  'lib/auth.js',
  'lib/config-conta.js',
  'lib/backups.js',
  'lib/nuvem.js',
  'lib/conta-backup.js',
  'lib/importacao.js',
  'server.js',
  'scripts/backup.js',
  'tests/smoke.js',
];

const PUBLICOS = [
  ['index.html', 'public/index.html', 'text/html; charset=utf-8'],
  ['style.css', 'public/style.css', 'text/css; charset=utf-8'],
  ['script.js', 'public/script.js', 'application/javascript; charset=utf-8'],
  [
    'vendor/html2pdf.bundle.min.js',
    'public/vendor/html2pdf.bundle.min.js',
    'application/javascript; charset=utf-8',
  ],
];

/** Fecha um `</script>` acidental dentro de string, por segurança. */
const seguro = (codigo) => codigo.replace(/<\/script/gi, '<\\/script');

function blocoModulos() {
  const partes = [];

  for (const nome of MODULOS) {
    // Shebang (#!) só vale no começo de um arquivo executável; dentro de uma
    // função ele quebraria a sintaxe.
    const codigo = ler(nome).replace(/^#!.*\n/, '');
    partes.push(
      `  ${JSON.stringify(nome)}: function (require, module, exports) {\n${codigo}\n  },`
    );
  }

  return `const MODULOS = {\n${partes.join('\n\n')}\n};`;
}

function blocoArquivos() {
  const partes = [];

  for (const [url, caminho, tipo] of PUBLICOS) {
    const base64 = fs.readFileSync(path.join(raiz, caminho)).toString('base64');
    partes.push(
      `  ${JSON.stringify(url)}: { tipo: ${JSON.stringify(tipo)}, base64: ${JSON.stringify(base64)} },`
    );
  }

  return `const ARQUIVOS = {\n${partes.join('\n')}\n};`;
}

const CABECALHO = `#!/usr/bin/env node
/*
 * ============================================================================
 *  NEW STAR NOTEBOOK 2.0.1 — SERVIDOR EM UM ÚNICO ARQUIVO
 * ============================================================================
 *
 *  Sistema completo em um só arquivo: login, contas separadas (cada login vê
 *  apenas os próprios dados), serviços/OS, contatos, financeiro, peças,
 *  estoque, backup .sqlite/.json, restauração, importação dos dados antigos
 *  e backup em nuvem opcional (Supabase/WebDAV).
 *
 *  COMO USAR
 *    1. Tenha o Node.js 18+ instalado.
 *    2. Nesta pasta, instale as duas bibliotecas de terceiros:
 *         npm install express sql.js
 *    3. Rode:
 *         node new-star-notebook-servidor.js
 *    4. Abra http://localhost:3000
 *
 *  CONTAS DE DEMONSTRAÇÃO (criadas sozinhas no primeiro uso)
 *    ana@teste.com    senha12345   (com dados de exemplo)
 *    bruno@teste.com  senha12345   (vazia)
 *
 *  ONDE FICAM OS DADOS
 *    ./data/newstar.sqlite     banco de dados
 *    ./backups/                backups automáticos
 *    (as pastas são criadas ao lado deste arquivo)
 *
 *  CONFIGURAÇÃO OPCIONAL
 *    PORT=3000  HOST=0.0.0.0  DATA_DIR=...  BACKUP_DIR=...
 *    SUPABASE_* / WEBDAV_*     (backup em nuvem)
 *    Ou crie um arquivo .env ao lado deste.
 *
 *  EXTRAIR O PROJETO DE VOLTA
 *    node new-star-notebook-servidor.js --extrair
 *    node new-star-notebook-servidor.js --extrair minha-pasta
 *
 *    Isso recria config.js, lib/, public/, server.js, scripts/ e tests/,
 *    além de um package.json. Depois é só rodar npm install e npm start.
 *
 *  Gerado automaticamente por scripts/gerar-servidor-unico.js
 *  A versão com vários arquivos (para manutenção) é a pasta do projeto.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/* ------------------------- dependências externas ------------------------- */

function conferirDependencias() {
  const faltando = [];

  for (const nome of ['express', 'sql.js']) {
    try {
      require.resolve(nome);
    } catch (_) {
      faltando.push(nome);
    }
  }

  if (!faltando.length) return;

  console.error(
    '\\n  Faltam bibliotecas: ' +
      faltando.join(', ') +
      '\\n\\n  Instale na pasta deste arquivo:\\n' +
      '      npm install express sql.js\\n\\n' +
      '  (precisa de internet só nesta primeira vez)\\n'
  );
  process.exit(1);
}

/* ------------------------ carregador de módulos -------------------------- */

const cache = Object.create(null);

function normalizar(caminho) {
  return caminho.replace(/\\\\/g, '/').replace(/^\\.\\//, '');
}

function resolver(pai, pedido) {
  const base = normalizar(path.posix.join(path.posix.dirname(pai), pedido));

  for (const candidato of [base, base + '.js', base + '/index.js']) {
    if (MODULOS[candidato]) return candidato;
  }

  throw new Error(
    'Módulo interno não encontrado: ' + pedido + ' (a partir de ' + pai + ')'
  );
}

function carregar(nome) {
  const chave = normalizar(nome);
  if (cache[chave]) return cache[chave].exports;

  const fabrica = MODULOS[chave];
  if (!fabrica) throw new Error('Módulo interno não encontrado: ' + chave);

  const modulo = { exports: {} };
  cache[chave] = modulo;

  const requireLocal = (pedido) => {
    if (pedido.startsWith('.') || pedido.startsWith('/')) {
      return carregar(resolver(chave, pedido));
    }
    return require(pedido);
  };

  fabrica(requireLocal, modulo, modulo.exports);
  return modulo.exports;
}

/* --------------------- interface embutida no arquivo --------------------- */

function prepararInterface() {
  const resumo = Object.keys(ARQUIVOS)
    .map((url) => url + ':' + ARQUIVOS[url].base64.length)
    .join('|');

  const hash = require('crypto').createHash('sha256').update(resumo).digest('hex').slice(0, 12);
  const pasta = path.join(os.tmpdir(), 'newstar-interface-' + hash);

  const completo = (url) => path.join(pasta, ...url.split('/'));
  const precisa = !Object.keys(ARQUIVOS).every((url) => {
    try {
      return fs.existsSync(completo(url));
    } catch (_) {
      return false;
    }
  });

  if (precisa) {
    for (const [url, conteudo] of Object.entries(ARQUIVOS)) {
      const destino = completo(url);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, Buffer.from(conteudo.base64, 'base64'));
    }
  }

  return pasta;
}

/* ------------------------ dados de demonstração -------------------------- */

async function semearDemonstracao() {
  const db = carregar('lib/db.js');
  const auth = carregar('lib/auth.js');

  for (let tentativa = 0; tentativa < 100 && !db.ativo(); tentativa++) {
    await new Promise((resolver) => setTimeout(resolver, 100));
  }

  if (!db.ativo()) return;
  if (db.get('SELECT COUNT(*) AS total FROM usuarios').total > 0) return;

  const hash = await auth.hashSenha('senha12345');

  const criarUsuario = (nome, empresa, email) =>
    db.transacao(() =>
      db.run('INSERT INTO usuarios (nome, empresa, email, senha_hash) VALUES (?, ?, ?, ?)', [
        nome,
        empresa,
        email,
        hash,
      ]).id
    );

  const ana = criarUsuario('Ana Silva', 'New Star Notebook', 'ana@teste.com');
  criarUsuario('Bruno Souza', 'Loja B', 'bruno@teste.com');

  const inserir = (tabela, colunas, linha) =>
    db.run(
      'INSERT INTO ' + tabela + ' (tenant_id, ' + colunas.join(', ') + ') VALUES (?, ' +
        colunas.map(() => '?').join(', ') + ')',
      [ana, ...colunas.map((coluna) => (linha[coluna] === undefined ? null : linha[coluna]))]
    );

  db.transacao(() => {
    inserir(
      'servicos',
      ['nome', 'num', 'status', 'notebook', 'cfont', 'cmaleta', 'descricao', 'data', 'local'],
      { nome: 'Carlos Andrade', num: '1001', status: 'Em andamento', notebook: 'Dell Inspiron 15 3520', cfont: 'Sim', cmaleta: 'Não', descricao: 'Não liga. Parou após queda de energia.', data: '2026-10-14', local: 'Balcão' }
    );
    inserir(
      'servicos',
      ['nome', 'num', 'status', 'notebook', 'cfont', 'cmaleta', 'descricao', 'data', 'local'],
      { nome: 'Fernanda Lima', num: '1002', status: 'Pronto', notebook: 'Lenovo IdeaPad 3', cfont: 'Não', cmaleta: 'Sim', descricao: 'Tela trincada, troca aprovada.', data: '2026-10-15', local: 'WhatsApp' }
    );
    inserir(
      'servicos',
      ['nome', 'num', 'status', 'notebook', 'cfont', 'cmaleta', 'descricao', 'data', 'local'],
      { nome: 'Roberto Dias', num: '1003', status: 'Entregue', notebook: 'Acer Aspire 5', cfont: 'Sim', cmaleta: 'Não', descricao: 'Limpeza e troca de pasta térmica.', data: '2026-10-10', local: 'Balcão' }
    );

    inserir('telefones', ['nome', 'tel1', 'tel2'], { nome: 'Carlos Andrade', tel1: '(11) 98888-1010', tel2: '(11) 3333-1010' });
    inserir('telefones', ['nome', 'tel1', 'tel2'], { nome: 'Fernanda Lima', tel1: '(11) 97777-2020', tel2: null });

    inserir('financeiro', ['nome', 'status', 'valor_centavos', 'notebook', 'referente'], { nome: 'Fernanda Lima', status: 'PAGO', valor_centavos: 45000, notebook: 'Lenovo IdeaPad 3', referente: 'Troca de tela' });
    inserir('financeiro', ['nome', 'status', 'valor_centavos', 'notebook', 'referente'], { nome: 'Carlos Andrade', status: 'DEVENDO', valor_centavos: 32000, notebook: 'Dell Inspiron 15 3520', referente: 'Reparo na placa' });

    inserir('pecas', ['cliente', 'item', 'data', 'status'], { cliente: 'Carlos Andrade', item: 'Fonte 19,5V 3,34A', data: '2026-10-14', status: 'Não devolvido' });
    inserir('pecas', ['cliente', 'item', 'data', 'status'], { cliente: 'Fernanda Lima', item: 'Tela 15,6" LED', data: '2026-10-15', status: 'Devolvido' });

    inserir(
      'notebooks_loja',
      ['notebook', 'modelo', 'processador', 'memoria', 'tela', 'bateria', 'nvme', 'ssd', 'video', 'preco', 'status'],
      { notebook: 'Dell', modelo: 'Inspiron 15 3520', processador: 'Intel Core i5-1135G7', memoria: '8 GB', tela: '15,6"', bateria: 'Boa', nvme: '256 GB', ssd: null, video: 'Intel Iris Xe', preco: 'R$ 2.300,00', status: 'Disponível' }
    );
    inserir(
      'notebooks_loja',
      ['notebook', 'modelo', 'processador', 'memoria', 'tela', 'bateria', 'nvme', 'ssd', 'video', 'preco', 'status'],
      { notebook: 'Lenovo', modelo: 'IdeaPad 3i', processador: 'Intel Core i3-1115G4', memoria: '8 GB', tela: '15,6"', bateria: 'Boa', nvme: null, ssd: '480 GB', video: 'Intel UHD', preco: 'R$ 1.850,00', status: 'Reservado' }
    );

    inserir('os', ['numero', 'cliente', 'equipamento', 'data', 'detalhes'], {
      numero: 'OS-1001',
      cliente: 'Carlos Andrade',
      equipamento: 'Dell Inspiron 15 3520',
      data: '2026-10-14',
      detalhes: JSON.stringify({ defeito: 'Não liga', laudo: 'Placa em análise', valor: 'R$ 320,00' }),
    });
  });

  db.salvarAgora();

  console.log('  Demonstração: ana@teste.com / bruno@teste.com — senha 12345... (senha12345)');
}

/* ------------------------------ inicialização ---------------------------- */

const config = carregar('config.js');
config.pastaPublica = prepararInterface();

const servidor = carregar('server.js');

// O server.js só sobe sozinho quando é o módulo principal. Aqui ele está
// dentro do bundle, então chamamos iniciar() explicitamente.
servidor.iniciar().catch((erro) => {
  console.error('Não foi possível iniciar o servidor:', erro);
  process.exit(1);
});

semearDemonstracao().catch((erro) => {
  console.error('  Não foi possível criar a demonstração:', erro.message);
});
`;

function montar() {
  // A inicialização precisa vir DEPOIS das declarações de MODULOS e ARQUIVOS.
  const marcador = '/* ------------------------------ inicialização ---------------------------- */';
  const [inicio, fim] = CABECALHO.split(marcador);

  if (fim === undefined) throw new Error('Marcador de inicialização não encontrado.');

  const extracao = ler('scripts', 'arquivo-unico', 'extrair.js');

  const corpo = [
    inicio,
    blocoModulos(),
    '',
    blocoArquivos(),
    '',
    extracao,
    '',
    marcador,
    fim,
  ].join('\n');

  const pastaSaida = path.join(raiz, 'download');
  fs.mkdirSync(pastaSaida, { recursive: true });

  const destino = path.join(pastaSaida, 'new-star-notebook-servidor.js');
  fs.writeFileSync(destino, seguro(corpo), 'utf8');
  fs.chmodSync(destino, 0o755);

  const tamanho = (fs.statSync(destino).size / 1024 / 1024).toFixed(2);
  console.log(`\n  Servidor em arquivo único: ${destino}`);
  console.log(`  Tamanho: ${tamanho} MB`);
  console.log('  Rode: node new-star-notebook-servidor.js\n');
}

montar();
