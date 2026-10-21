'use strict';

const db = require('./db');

function obter(tenantId, chave, padrao = null) {
  const linha = db.get(
    'SELECT valor FROM config_conta WHERE tenant_id = ? AND chave = ?',
    [tenantId, chave]
  );
  return linha ? linha.valor : padrao;
}

function definir(tenantId, chave, valor) {
  db.run(
    `INSERT INTO config_conta (tenant_id, chave, valor, atualizado_em)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(tenant_id, chave)
     DO UPDATE SET valor = excluded.valor, atualizado_em = datetime('now')`,
    [tenantId, chave, valor]
  );
}

module.exports = { obter, definir };
