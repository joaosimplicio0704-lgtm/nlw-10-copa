#!/usr/bin/env node
'use strict';

/**
 * Cria um backup manual do banco completo no servidor.
 * Uso: npm run backup
 */

const backups = require('../lib/backups');

try {
  const arquivo = backups.criarBackupLocal('manual');

  if (arquivo) {
    console.log(`Backup criado em: ${arquivo}`);
  } else {
    console.error('Banco ainda não existe. Rode o servidor uma vez antes do backup.');
    process.exitCode = 1;
  }
} catch (erro) {
  console.error('Erro ao criar backup:', erro);
  process.exit(1);
}
