'use strict';

const db = require('./db');

/**
 * Trilha de auditoria: quem fez o quê e quando.
 * Nunca é apagada pela API (não existe rota DELETE para auditoria).
 */
function registrar({ tenantId, usuarioId, entidade, entidadeId = null, acao, descricao = '' }) {
  db.run(
    `INSERT INTO auditoria (tenant_id, usuario_id, entidade, entidade_id, acao, descricao)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, usuarioId || tenantId, entidade, entidadeId, acao, descricao]
  );
}

function listar(tenantId, limite = 30) {
  const quantidade = Math.min(Math.max(Number(limite) || 30, 1), 100);
  return db.all(
    `SELECT id, entidade, entidade_id, acao, descricao, criado_em
       FROM auditoria
      WHERE tenant_id = ?
      ORDER BY id DESC
      LIMIT ?`,
    [tenantId, quantidade]
  );
}

module.exports = { registrar, listar };
