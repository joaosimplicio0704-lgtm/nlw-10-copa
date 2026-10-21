'use strict';

/**
 * Schema do banco.
 *
 * Uma única base SQLite guarda os dados de todas as contas, mas cada linha de
 * dado de negócio tem `tenant_id` apontando para o usuário dono. Todas as
 * consultas da API filtram por `tenant_id`, então uma conta nunca enxerga os
 * dados de outra.
 *
 * `tenant_id = 0` é usado apenas nos arquivos de backup exportados por conta
 * (para permitir restaurar em qualquer conta).
 */
module.exports = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  empresa TEXT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'admin' CHECK (papel IN ('admin', 'atendente')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

CREATE TABLE IF NOT EXISTS servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  num TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Em andamento'
    CHECK (status IN ('Em andamento', 'Pronto', 'Entregue')),
  notebook TEXT,
  cfont TEXT DEFAULT 'Não',
  cmaleta TEXT DEFAULT 'Não',
  descricao TEXT,
  data TEXT,
  local TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_servicos_tenant ON servicos(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_servicos_num_conta ON servicos(tenant_id, num);

CREATE TABLE IF NOT EXISTS telefones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tel1 TEXT NOT NULL,
  tel2 TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_telefones_tenant ON telefones(tenant_id, nome);

CREATE TABLE IF NOT EXISTS financeiro (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DEVENDO' CHECK (status IN ('DEVENDO', 'PAGO')),
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  notebook TEXT,
  referente TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_financeiro_tenant ON financeiro(tenant_id, status);

CREATE TABLE IF NOT EXISTS pecas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente TEXT NOT NULL,
  item TEXT NOT NULL,
  data TEXT,
  status TEXT NOT NULL DEFAULT 'Não devolvido'
    CHECK (status IN ('Não devolvido', 'Devolvido')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pecas_tenant ON pecas(tenant_id, status);

CREATE TABLE IF NOT EXISTS notebooks_loja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  notebook TEXT NOT NULL,
  modelo TEXT NOT NULL,
  processador TEXT,
  memoria TEXT,
  tela TEXT,
  bateria TEXT,
  nvme TEXT,
  ssd TEXT,
  video TEXT,
  preco TEXT,
  status TEXT NOT NULL DEFAULT 'Disponível'
    CHECK (status IN ('Disponível', 'Reservado', 'Vendido')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notebooks_tenant ON notebooks_loja(tenant_id, status);

CREATE TABLE IF NOT EXISTS os (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  cliente TEXT NOT NULL,
  equipamento TEXT,
  data TEXT,
  detalhes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_os_tenant ON os(tenant_id, numero);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  acao TEXT NOT NULL CHECK (acao IN ('criar', 'alterar', 'excluir', 'importar', 'backup', 'conta')),
  descricao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_auditoria_tenant ON auditoria(tenant_id, criado_em);

CREATE TABLE IF NOT EXISTS config_conta (
  tenant_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  valor TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, chave)
);

PRAGMA user_version = 1;
`;
