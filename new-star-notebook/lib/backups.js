'use strict';

const fs = require('fs');
const path = require('path');

const config = require('../config');
const db = require('./db');

function carimbo(data = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${data.getFullYear()}${p(data.getMonth() + 1)}${p(data.getDate())}-${p(
    data.getHours()
  )}${p(data.getMinutes())}${p(data.getSeconds())}`;
}

/**
 * Cópia de segurança do arquivo completo do banco, guardada no servidor.
 * Serve para recuperação de desastre (todas as contas). Não é exposta pela API.
 */
function criarBackupLocal(motivo = 'automatico') {
  // Quando chamado de dentro do servidor, garante que o arquivo está atualizado.
  // Quando chamado pelo script `npm run backup`, o banco não é aberto neste
  // processo (evita sobrescrever dados de um servidor em execução).
  if (db.ativo()) db.salvarAgora();

  if (!fs.existsSync(config.arquivoBanco)) return null;

  const nome = `newstar-${carimbo()}-${motivo}.sqlite`;
  const destino = path.join(config.pastaBackups, nome);
  fs.copyFileSync(config.arquivoBanco, destino);
  limparAntigos();
  return destino;
}

function limparAntigos() {
  const limite = Date.now() - config.reterBackupsDias * 24 * 60 * 60 * 1000;

  for (const arquivo of fs.readdirSync(config.pastaBackups)) {
    if (!arquivo.endsWith('.sqlite')) continue;
    const caminho = path.join(config.pastaBackups, arquivo);
    try {
      const info = fs.statSync(caminho);
      if (info.mtimeMs < limite) fs.unlinkSync(caminho);
    } catch (_) {
      // arquivo pode ter sido removido por outro processo
    }
  }
}

function listar() {
  return fs
    .readdirSync(config.pastaBackups)
    .filter((arquivo) => arquivo.endsWith('.sqlite'))
    .map((arquivo) => {
      const info = fs.statSync(path.join(config.pastaBackups, arquivo));
      return { arquivo, tamanho: info.size, criadoEm: info.mtime.toISOString() };
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

function iniciar() {
  // Um backup logo na subida e depois a cada N horas
  try {
    criarBackupLocal('inicio');
  } catch (erro) {
    console.error('[backup] falha ao criar backup inicial:', erro.message);
  }

  const intervalo = setInterval(() => {
    try {
      criarBackupLocal('agendado');
    } catch (erro) {
      console.error('[backup] falha no backup agendado:', erro.message);
    }
  }, Math.max(config.intervaloBackupHoras, 1) * 60 * 60 * 1000);

  intervalo.unref();
  return intervalo;
}

module.exports = { criarBackupLocal, limparAntigos, listar, iniciar, carimbo };
