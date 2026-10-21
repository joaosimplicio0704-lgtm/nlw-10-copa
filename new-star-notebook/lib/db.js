'use strict';

/**
 * Camada de acesso ao SQLite usando sql.js (SQLite compilado para WebAssembly).
 *
 * Por que sql.js e não o pacote `sqlite3`?
 *  - `sqlite3` é um addon nativo e costuma falhar na instalação no Windows
 *    (precisa de build tools) e em servidores sem acesso à internet.
 *  - `sql.js` é JavaScript puro/WASM: instala em qualquer lugar com `npm install`.
 *
 * O banco inteiro fica em memória e é gravado no disco de forma atômica
 * (arquivo temporário + rename) após cada transação. Para o volume de uma
 * loja (milhares de registros) isso é rápido: 30 mil linhas ~ 130 ms e a
 * gravação de um banco de 1,3 MB leva poucos milissegundos.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const config = require('../config');
const SCHEMA = require('./schema');

let SQL = null;
let banco = null;
let gravando = false;
let gravacaoPendente = false;

async function abrir() {
  if (banco) return banco;

  SQL = await initSqlJs();

  const existe = fs.existsSync(config.arquivoBanco);
  if (existe) {
    const bytes = fs.readFileSync(config.arquivoBanco);
    banco = new SQL.Database(new Uint8Array(bytes));
  } else {
    banco = new SQL.Database();
  }

  banco.run('PRAGMA foreign_keys = ON');
  banco.exec(SCHEMA);

  // Primeira gravação: garante que o arquivo exista no disco
  salvarAgora();
  return banco;
}

/** Exposto para criar bancos temporários (backup/restauração por conta). */
function driver() {
  if (!SQL) throw new Error('Banco ainda não inicializado');
  return SQL;
}

function ativo() {
  return Boolean(banco);
}

function all(sql, parametros = []) {
  const stmt = banco.prepare(sql);
  try {
    stmt.bind(parametros);
    const linhas = [];
    while (stmt.step()) linhas.push(stmt.getAsObject());
    return linhas;
  } finally {
    stmt.free();
  }
}

function get(sql, parametros = []) {
  const linhas = all(sql, parametros);
  return linhas[0];
}

/**
 * Executa uma escrita. Retorna `{ id, alteracoes }`.
 * `id` é o rowid do último INSERT (ou 0 em updates/deletes).
 */
function run(sql, parametros = []) {
  const stmt = banco.prepare(sql);
  try {
    stmt.run(parametros.map((v) => (v === undefined ? null : v)));
  } finally {
    stmt.free();
  }
  const alteracoes = banco.getRowsModified();
  const linha = get('SELECT last_insert_rowid() AS id');
  return { id: linha ? linha.id : 0, alteracoes };
}

function executar(sql) {
  banco.run(sql);
}

/**
 * Transação com gravação em disco no final.
 * Se qualquer passo falhar, tudo é desfeito (ROLLBACK).
 */
function transacao(fn) {
  banco.run('BEGIN');
  try {
    const resultado = fn();
    banco.run('COMMIT');
    salvarAgora();
    return resultado;
  } catch (erro) {
    try {
      banco.run('ROLLBACK');
    } catch (_) {
      // rollback pode falhar se a transação já foi encerrada
    }
    throw erro;
  }
}

/** Grava o banco no disco de forma atômica. */
function salvarAgora() {
  if (!banco) return;

  // Evita gravações concorrentes (não deve acontecer em Node single-thread,
  // mas protege contra chamadas reentrantes de hooks de saída).
  if (gravando) {
    gravacaoPendente = true;
    return;
  }

  gravando = true;
  try {
    const bytes = banco.export(); // Uint8Array
    const temporario = `${config.arquivoBanco}.tmp`;
    fs.writeFileSync(temporario, Buffer.from(bytes));
    fs.renameSync(temporario, config.arquivoBanco);
  } finally {
    gravando = false;
    if (gravacaoPendente) {
      gravacaoPendente = false;
      salvarAgora();
    }
  }
}

function fechar() {
  if (!banco) return;
  try {
    salvarAgora();
    banco.close();
  } finally {
    banco = null;
  }
}

// Garante que nada fique só na memória quando o processo terminar.
process.on('exit', () => {
  try {
    if (banco) salvarAgora();
  } catch (_) {
    // melhor esforço
  }
});

module.exports = {
  abrir,
  ativo,
  driver,
  all,
  get,
  run,
  executar,
  transacao,
  salvarAgora,
  fechar,
  arquivo: config.arquivoBanco,
  pasta: path.dirname(config.arquivoBanco),
};
