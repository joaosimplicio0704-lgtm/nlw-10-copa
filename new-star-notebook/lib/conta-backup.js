'use strict';

/**
 * Backup e restauração POR CONTA.
 *
 * O banco principal é único (multi-tenant), mas o arquivo entregue ao usuário
 * contém APENAS os dados da conta dele, com `tenant_id = 0`. Assim:
 *  - baixar o banco não expõe dados de outros usuários;
 *  - o arquivo pode ser restaurado em qualquer conta (o tenant é remapeado).
 */

const db = require('./db');
const SCHEMA = require('./schema');
const { CHAVES_POR_TABELA } = require('./entidades');

const TABELAS = ['servicos', 'telefones', 'financeiro', 'pecas', 'notebooks_loja', 'os'];

function copiarLinhas(bancoTemporario, tabela, tenantId) {
  const linhas = db.all(`SELECT * FROM ${tabela} WHERE tenant_id = ?`, [tenantId]);
  if (!linhas.length) return 0;

  for (const linha of linhas) {
    const copia = { ...linha, tenant_id: 0 };
    const colunas = Object.keys(copia);

    bancoTemporario.run(
      `INSERT INTO ${tabela} (${colunas.join(', ')})
       VALUES (${colunas.map(() => '?').join(', ')})`,
      colunas.map((coluna) => (copia[coluna] === undefined ? null : copia[coluna]))
    );
  }

  return linhas.length;
}

/** Gera um Buffer com um banco SQLite independente, só com os dados da conta. */
function exportarBancoConta(usuario) {
  const SQL = db.driver();
  const temporario = new SQL.Database();

  try {
    temporario.run('PRAGMA foreign_keys = OFF');
    temporario.exec(SCHEMA);

    // Linha descritiva da conta (o hash de senha NÃO é exportado)
    temporario.run(
      `INSERT INTO usuarios (id, nome, empresa, email, senha_hash, papel)
       VALUES (0, ?, ?, ?, '', 'admin')`,
      [usuario.nome, usuario.empresa || '', usuario.email]
    );

    const resumo = {};
    for (const tabela of TABELAS) {
      resumo[CHAVES_POR_TABELA[tabela]] = copiarLinhas(temporario, tabela, usuario.id);
    }

    return { buffer: Buffer.from(temporario.export()), resumo };
  } finally {
    temporario.close();
  }
}

/** Exporta em JSON (mais fácil de abrir no Excel/Google Sheets). */
function exportarJsonConta(usuario) {
  const dados = {
    exportadoEm: new Date().toISOString(),
    versao: 2,
    usuario: {
      nome: usuario.nome,
      empresa: usuario.empresa || '',
      email: usuario.email,
    },
  };

  const mapa = {
    servicos: 'servicos',
    telefones: 'telefones',
    financeiro: 'financeiro',
    pecas: 'pecas',
    notebooksLoja: 'notebooks_loja',
    osProntas: 'os',
  };

  for (const [chave, tabela] of Object.entries(mapa)) {
    dados[chave] = db.all(
      `SELECT * FROM ${tabela} WHERE tenant_id = ? ORDER BY id ASC`,
      [usuario.id]
    );

    // Não exporta o tenant_id interno
    for (const linha of dados[chave]) delete linha.tenant_id;
  }

  return dados;
}

module.exports = { exportarBancoConta, exportarJsonConta, TABELAS };
