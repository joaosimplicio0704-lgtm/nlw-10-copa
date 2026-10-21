'use strict';

/**
 * Importação de dados.
 *
 * Aceita três origens:
 *  - JSON antigo salvo no localStorage (chave `newStarData`) da versão 1;
 *  - JSON exportado por esta versão;
 *  - arquivo .sqlite exportado por esta versão (ou um banco antigo de uma conta).
 *
 * Tudo é normalizado e gravado dentro de UMA transação, sempre com o
 * `tenant_id` do usuário logado. Nada de um arquivo pode cair na conta errada.
 */

const db = require('./db');
const { ErroValidacao, normalizarData } = require('./validacao');
const { ENTIDADES } = require('./entidades');

const LIMITE_LINHAS = 20000;

const STATUS = {
  servicos: ['Em andamento', 'Pronto', 'Entregue'],
  financeiro: ['DEVENDO', 'PAGO'],
  pecas: ['Não devolvido', 'Devolvido'],
  notebooksLoja: ['Disponível', 'Reservado', 'Vendido'],
};

function texto(valor, max = 300) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim().slice(0, max);
}

function statusValido(valor, lista, padrao) {
  const limpo = texto(valor, 40);
  return lista.includes(limpo) ? limpo : padrao;
}

/** Converte "R$ 1.234,56", "1234.56" ou 1234.56 em centavos (123456). */
function paraCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number' && Number.isFinite(valor)) return Math.round(valor * 100);

  const limpo = String(valor).replace(/[^\d,.-]/g, '').trim();
  if (!limpo) return 0;

  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

function jsonSeguro(valor, limite = 30000) {
  if (!valor) return null;
  if (typeof valor === 'string') {
    const textoLimpo = valor.trim();
    if (!textoLimpo) return null;
    try {
      JSON.parse(textoLimpo);
      return textoLimpo.slice(0, limite);
    } catch (_) {
      return null;
    }
  }
  if (typeof valor === 'object') {
    const json = JSON.stringify(valor);
    return json.length <= limite ? json : null;
  }
  return null;
}

function normalizarServico(linha) {
  const nome = texto(linha.nome ?? linha.cliente, 120);
  const num = texto(linha.num ?? linha.numero, 40);
  if (!nome || !num) return null;

  return {
    nome,
    num,
    status: statusValido(linha.status, STATUS.servicos, 'Em andamento'),
    notebook: texto(linha.notebook ?? linha.equipamento, 160),
    cfont: texto(linha.cfont, 10) || 'Não',
    cmaleta: texto(linha.cmaleta, 10) || 'Não',
    descricao: texto(linha.descricao ?? linha.desc ?? linha.problema, 2000),
    data: normalizarData(linha.data ?? linha.data_entrada) || '',
    local: texto(linha.local, 160),
  };
}

function normalizarTelefone(linha) {
  const nome = texto(linha.nome, 120);
  const tel1 = texto(linha.tel1 ?? linha.telefone, 40);
  if (!nome || !tel1) return null;

  return {
    nome,
    tel1,
    tel2: texto(linha.tel2, 40) || '-',
  };
}

function normalizarFinanceiro(linha) {
  const nome = texto(linha.nome ?? linha.cliente, 120);
  if (!nome) return null;

  const centavos =
    linha.valor_centavos !== undefined && linha.valor_centavos !== null
      ? Math.round(Number(linha.valor_centavos)) || 0
      : paraCentavos(linha.valor);

  return {
    nome,
    status: statusValido(linha.status, STATUS.financeiro, 'DEVENDO'),
    valor_centavos: centavos,
    notebook: texto(linha.notebook, 160),
    referente: texto(linha.referente, 200),
  };
}

function normalizarPeca(linha) {
  const cliente = texto(linha.cliente, 160);
  const item = texto(linha.item, 300);
  if (!cliente || !item) return null;

  return {
    cliente,
    item,
    data: normalizarData(linha.data ?? linha.data_entrada) || '',
    status: statusValido(linha.status, STATUS.pecas, 'Não devolvido'),
  };
}

function normalizarNotebook(linha) {
  const notebook = texto(linha.notebook ?? linha.marca, 160);
  const modelo = texto(linha.modelo, 120);
  if (!notebook || !modelo) return null;

  return {
    notebook,
    modelo,
    processador: texto(linha.processador, 120),
    memoria: texto(linha.memoria, 120),
    tela: texto(linha.tela, 120),
    bateria: texto(linha.bateria, 120),
    nvme: texto(linha.nvme, 120),
    ssd: texto(linha.ssd, 120),
    video: texto(linha.video, 120),
    preco: texto(linha.preco, 120),
    status: statusValido(linha.status, STATUS.notebooksLoja, 'Disponível'),
  };
}

function normalizarOS(linha) {
  const numero = texto(linha.numero ?? linha.num, 40);
  const cliente = texto(linha.cliente ?? linha.nome, 160);
  if (!numero || !cliente) return null;

  return {
    numero,
    cliente,
    equipamento: texto(linha.equipamento ?? linha.notebook, 200),
    data: normalizarData(linha.data ?? linha.data_entrada) || '',
    detalhes: jsonSeguro(linha.detalhes),
  };
}

const NORMALIZADORES = {
  servicos: normalizarServico,
  telefones: normalizarTelefone,
  financeiro: normalizarFinanceiro,
  pecas: normalizarPeca,
  notebooksLoja: normalizarNotebook,
  osProntas: normalizarOS,
};

const TABELAS = {
  servicos: { tabela: 'servicos', colunas: ['nome', 'num', 'status', 'notebook', 'cfont', 'cmaleta', 'descricao', 'data', 'local'], ignorarDuplicado: true },
  telefones: { tabela: 'telefones', colunas: ['nome', 'tel1', 'tel2'] },
  financeiro: { tabela: 'financeiro', colunas: ['nome', 'status', 'valor_centavos', 'notebook', 'referente'] },
  pecas: { tabela: 'pecas', colunas: ['cliente', 'item', 'data', 'status'] },
  notebooksLoja: { tabela: 'notebooks_loja', colunas: ['notebook', 'modelo', 'processador', 'memoria', 'tela', 'bateria', 'nvme', 'ssd', 'video', 'preco', 'status'] },
  osProntas: { tabela: 'os', colunas: ['numero', 'cliente', 'equipamento', 'data', 'detalhes'], ignorarDuplicado: true, chaveDuplicado: 'numero' },
};

function conjuntoVazio() {
  return {
    servicos: [],
    telefones: [],
    financeiro: [],
    pecas: [],
    notebooksLoja: [],
    osProntas: [],
  };
}

/** Extrai as listas de um JSON no formato antigo ou no formato exportado. */
function lerJson(objeto) {
  if (!objeto || typeof objeto !== 'object') {
    throw new ErroValidacao('Arquivo JSON inválido.');
  }

  const origem =
    objeto.dados && typeof objeto.dados === 'object' ? objeto.dados : objeto;

  const conjunto = conjuntoVazio();

  conjunto.servicos = Array.isArray(origem.servicos) ? origem.servicos : [];
  conjunto.telefones = Array.isArray(origem.telefones) ? origem.telefones : [];
  conjunto.financeiro = Array.isArray(origem.financeiro) ? origem.financeiro : [];
  conjunto.pecas = Array.isArray(origem.pecas) ? origem.pecas : [];
  conjunto.notebooksLoja = Array.isArray(origem.notebooksLoja)
    ? origem.notebooksLoja
    : Array.isArray(origem.notebooks_loja)
    ? origem.notebooks_loja
    : [];
  conjunto.osProntas = Array.isArray(origem.osProntas)
    ? origem.osProntas
    : Array.isArray(origem.os)
    ? origem.os
    : [];

  const total = Object.values(conjunto).reduce((soma, lista) => soma + lista.length, 0);
  if (total === 0) {
    throw new ErroValidacao('O arquivo não contém registros reconhecidos.');
  }

  for (const [nome, lista] of Object.entries(conjunto)) {
    if (lista.length > LIMITE_LINHAS) {
      throw new ErroValidacao(`A lista "${nome}" tem registros demais (máximo ${LIMITE_LINHAS}).`);
    }
  }

  return conjunto;
}

/** Lê uma tabela de um banco SQLite temporário, já filtrando por conta. */
function lerTabelaSqlite(bancoTemporario, tabela, tenantId) {
  let colunas = [];
  try {
    const resultado = bancoTemporario.exec(`PRAGMA table_info(${tabela})`);
    if (!resultado.length) return [];
    colunas = resultado[0].values.map((linha) => linha[1]);
  } catch (_) {
    return [];
  }

  const temTenant = colunas.includes('tenant_id');
  const sql = temTenant
    ? `SELECT * FROM ${tabela} WHERE tenant_id IN (0, ?)`
    : `SELECT * FROM ${tabela}`;

  const stmt = bancoTemporario.prepare(sql);
  try {
    if (temTenant) stmt.bind([tenantId]);
    const linhas = [];
    while (stmt.step()) linhas.push(stmt.getAsObject());
    return linhas;
  } finally {
    stmt.free();
  }
}

/** Lê um arquivo .sqlite (Buffer) e devolve as listas no formato interno. */
function lerSqlite(buffer, tenantId) {
  if (!buffer || buffer.length < 16) {
    throw new ErroValidacao('O arquivo enviado está vazio.');
  }
  if (buffer.subarray(0, 15).toString('utf8') !== 'SQLite format 3') {
    throw new ErroValidacao('O arquivo não é um banco SQLite válido.');
  }

  const SQL = db.driver();
  let temporario;
  try {
    temporario = new SQL.Database(new Uint8Array(buffer));
  } catch (_) {
    throw new ErroValidacao('Não foi possível abrir o arquivo SQLite.');
  }

  const conjunto = conjuntoVazio();

  try {
    conjunto.servicos = lerTabelaSqlite(temporario, 'servicos', tenantId);
    conjunto.telefones = lerTabelaSqlite(temporario, 'telefones', tenantId);
    conjunto.financeiro = lerTabelaSqlite(temporario, 'financeiro', tenantId);
    conjunto.pecas = lerTabelaSqlite(temporario, 'pecas', tenantId);
    conjunto.notebooksLoja = lerTabelaSqlite(temporario, 'notebooks_loja', tenantId);

    const os = lerTabelaSqlite(temporario, 'os', tenantId);
    const osAntigas = lerTabelaSqlite(temporario, 'osProntas', tenantId);
    conjunto.osProntas = os.length ? os : osAntigas;
  } finally {
    temporario.close();
  }

  const total = Object.values(conjunto).reduce((soma, lista) => soma + lista.length, 0);
  if (total === 0) {
    throw new ErroValidacao('O banco enviado não tem registros desta conta.');
  }

  return conjunto;
}

function inserir(tenantId, tabela, colunas, linha, ignorarDuplicado) {
  const marcadores = colunas.map(() => '?').join(', ');
  const sql = `INSERT ${ignorarDuplicado ? 'OR IGNORE' : 'OR ABORT'} INTO ${tabela}
               (tenant_id, ${colunas.join(', ')}) VALUES (?, ${marcadores})`;

  const resultado = db.run(sql, [tenantId, ...colunas.map((coluna) => linha[coluna])]);
  return resultado.alteracoes > 0;
}

/**
 * Importa um conjunto normalizado para a conta.
 * `substituir = true` apaga os dados atuais da conta antes de importar.
 */
function importarConjunto(tenantId, conjunto, { substituir = false, origem = 'arquivo' } = {}) {
  const contagem = {
    servicos: { importados: 0, ignorados: 0 },
    telefones: { importados: 0, ignorados: 0 },
    financeiro: { importados: 0, ignorados: 0 },
    pecas: { importados: 0, ignorados: 0 },
    notebooksLoja: { importados: 0, ignorados: 0 },
    osProntas: { importados: 0, ignorados: 0 },
  };

  return db.transacao(() => {
    if (substituir) {
      for (const config of Object.values(TABELAS)) {
        db.run(`DELETE FROM ${config.tabela} WHERE tenant_id = ?`, [tenantId]);
      }
    }

    for (const [chave, config] of Object.entries(TABELAS)) {
      const lista = conjunto[chave] || [];
      const normalizador = NORMALIZADORES[chave];

      for (const bruta of lista) {
        if (!bruta || typeof bruta !== 'object') {
          contagem[chave].ignorados += 1;
          continue;
        }

        const linha = normalizador(bruta);
        if (!linha) {
          contagem[chave].ignorados += 1;
          continue;
        }

        // OS prontas: se o número já existe, atualiza em vez de duplicar
        if (config.chaveDuplicado === 'numero') {
          const existente = db.get(
            `SELECT id FROM ${config.tabela} WHERE tenant_id = ? AND numero = ?`,
            [tenantId, linha.numero]
          );
          if (existente) {
            db.run(
              `UPDATE os SET cliente = ?, equipamento = ?, data = ?, detalhes = ?
                WHERE id = ? AND tenant_id = ?`,
              [linha.cliente, linha.equipamento, linha.data, linha.detalhes, existente.id, tenantId]
            );
            contagem[chave].importados += 1;
            continue;
          }
        }

        const inseriu = inserir(
          tenantId,
          config.tabela,
          config.colunas,
          linha,
          Boolean(config.ignorarDuplicado)
        );

        if (inseriu) contagem[chave].importados += 1;
        else contagem[chave].ignorados += 1;
      }
    }

    const total = Object.values(contagem).reduce(
      (soma, item) => soma + item.importados,
      0
    );

    db.run(
      `INSERT INTO auditoria (tenant_id, usuario_id, entidade, entidade_id, acao, descricao)
       VALUES (?, ?, 'conta', NULL, 'importar', ?)`,
      [tenantId, tenantId, `Importou ${total} registros (${origem}).`]
    );

    return { contagem, total };
  });
}

module.exports = {
  lerJson,
  lerSqlite,
  importarConjunto,
  paraCentavos,
  conjuntoVazio,
  TABELAS,
};
