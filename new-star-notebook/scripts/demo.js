'use strict';

/**
 * Cria contas de demonstração com dados de exemplo.
 *
 * Uso:
 *   npm run demo
 *
 * - ana@teste.com  / senha12345  → conta com dados de exemplo
 * - bruno@teste.com / senha12345 → conta vazia (para ver o isolamento)
 *
 * Só roda em banco sem nenhuma conta. Para recomeçar do zero:
 *   1. apague a pasta data/
 *   2. rode `npm run demo` (dados de exemplo) ou só `npm start` (banco vazio)
 */

const db = require('../lib/db');
const auth = require('../lib/auth');

const SENHA = 'senha12345';

const SERVICOS = [
  {
    nome: 'Carlos Andrade',
    num: '1001',
    status: 'Em andamento',
    notebook: 'Dell Inspiron 15 3520',
    cfont: 'Sim',
    cmaleta: 'Não',
    descricao: 'Não liga. Cliente relata que parou após queda de energia.',
    data: '2026-10-14',
    local: 'Balcão',
  },
  {
    nome: 'Fernanda Lima',
    num: '1002',
    status: 'Pronto',
    notebook: 'Lenovo IdeaPad 3',
    cfont: 'Não',
    cmaleta: 'Sim',
    descricao: 'Tela trincada, troca aprovada.',
    data: '2026-10-15',
    local: 'WhatsApp',
  },
  {
    nome: 'Roberto Dias',
    num: '1003',
    status: 'Entregue',
    notebook: 'Acer Aspire 5',
    cfont: 'Sim',
    cmaleta: 'Não',
    descricao: 'Limpeza e troca de pasta térmica.',
    data: '2026-10-10',
    local: 'Balcão',
  },
];

const TELEFONES = [
  { nome: 'Carlos Andrade', tel1: '(11) 98888-1010', tel2: '(11) 3333-1010' },
  { nome: 'Fernanda Lima', tel1: '(11) 97777-2020', tel2: null },
];

const FINANCEIRO = [
  {
    nome: 'Fernanda Lima',
    status: 'PAGO',
    valor_centavos: 45000,
    notebook: 'Lenovo IdeaPad 3',
    referente: 'Troca de tela',
  },
  {
    nome: 'Carlos Andrade',
    status: 'DEVENDO',
    valor_centavos: 32000,
    notebook: 'Dell Inspiron 15 3520',
    referente: 'Reparo na placa',
  },
];

const PECAS = [
  { cliente: 'Carlos Andrade', item: 'Fonte 19,5V 3,34A', data: '2026-10-14', status: 'Não devolvido' },
  { cliente: 'Fernanda Lima', item: 'Tela 15,6" LED', data: '2026-10-15', status: 'Devolvido' },
];

const NOTEBOOKS = [
  {
    notebook: 'Dell',
    modelo: 'Inspiron 15 3520',
    processador: 'Intel Core i5-1135G7',
    memoria: '8 GB',
    tela: '15,6"',
    bateria: 'Boa',
    nvme: '256 GB',
    ssd: null,
    video: 'Intel Iris Xe',
    preco: 'R$ 2.300,00',
    status: 'Disponível',
  },
  {
    notebook: 'Lenovo',
    modelo: 'IdeaPad 3i',
    processador: 'Intel Core i3-1115G4',
    memoria: '8 GB',
    tela: '15,6"',
    bateria: 'Boa',
    nvme: null,
    ssd: '480 GB',
    video: 'Intel UHD',
    preco: 'R$ 1.850,00',
    status: 'Reservado',
  },
];

const OS = [
  {
    numero: 'OS-1001',
    cliente: 'Carlos Andrade',
    equipamento: 'Dell Inspiron 15 3520',
    data: '2026-10-14',
    detalhes: {
      defeito: 'Não liga',
      laudo: 'Placa em análise',
      valor: 'R$ 320,00',
    },
  },
];

function inserir(tabela, colunas, linha, tenantId) {
  const nomes = ['tenant_id', ...colunas];
  const valores = [tenantId, ...colunas.map((coluna) => linha[coluna] ?? null)];
  const marcadores = nomes.map(() => '?').join(', ');

  db.run(`INSERT INTO ${tabela} (${nomes.join(', ')}) VALUES (${marcadores})`, valores);
}

async function principal() {
  await db.abrir();

  if (db.get('SELECT COUNT(*) AS total FROM usuarios').total > 0) {
    console.log('\n  Já existe pelo menos uma conta neste banco.');
    console.log('  Para criar as contas de demonstração, apague a pasta data/ e rode de novo.\n');
    return;
  }

  const hash = await auth.hashSenha(SENHA);

  const ana = db.transacao(() =>
    db.run(
      'INSERT INTO usuarios (nome, empresa, email, senha_hash) VALUES (?, ?, ?, ?)',
      ['Ana Silva', 'New Star Notebook', 'ana@teste.com', hash]
    ).id
  );

  const bruno = db.transacao(() =>
    db.run(
      'INSERT INTO usuarios (nome, empresa, email, senha_hash) VALUES (?, ?, ?, ?)',
      ['Bruno Souza', 'Loja B', 'bruno@teste.com', hash]
    ).id
  );

  db.transacao(() => {
    for (const linha of SERVICOS) {
      inserir(
        'servicos',
        ['nome', 'num', 'status', 'notebook', 'cfont', 'cmaleta', 'descricao', 'data', 'local'],
        linha,
        ana
      );
    }
    for (const linha of TELEFONES) {
      inserir('telefones', ['nome', 'tel1', 'tel2'], linha, ana);
    }
    for (const linha of FINANCEIRO) {
      inserir(
        'financeiro',
        ['nome', 'status', 'valor_centavos', 'notebook', 'referente'],
        linha,
        ana
      );
    }
    for (const linha of PECAS) {
      inserir('pecas', ['cliente', 'item', 'data', 'status'], linha, ana);
    }
    for (const linha of NOTEBOOKS) {
      inserir(
        'notebooks_loja',
        [
          'notebook',
          'modelo',
          'processador',
          'memoria',
          'tela',
          'bateria',
          'nvme',
          'ssd',
          'video',
          'preco',
          'status',
        ],
        linha,
        ana
      );
    }
    for (const linha of OS) {
      inserir(
        'os',
        ['numero', 'cliente', 'equipamento', 'data', 'detalhes'],
        { ...linha, detalhes: JSON.stringify(linha.detalhes) },
        ana
      );
    }
  });

  db.salvarAgora();

  console.log('\n  Contas de demonstração criadas:\n');
  console.log('    ana@teste.com    senha12345   (com dados de exemplo)');
  console.log(`    bruno@teste.com  senha12345   (vazia — id ${bruno})\n`);
  console.log('  Abra o site e entre com uma delas.\n');
}

principal()
  .catch((erro) => {
    console.error('\n  Erro ao criar dados de demonstração:', erro.message, '\n');
    process.exitCode = 1;
  })
  .finally(() => {
    db.fechar();
  });
