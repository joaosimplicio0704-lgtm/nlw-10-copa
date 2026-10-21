'use strict';

const fs = require('fs');
const path = require('path');

const raiz = __dirname;

/**
 * Carrega variáveis de um arquivo .env, sem dependência externa.
 * Variáveis já definidas no ambiente têm prioridade.
 */
function carregarEnv() {
  const arquivo = path.join(raiz, '.env');
  if (!fs.existsSync(arquivo)) return;

  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) continue;

    const separador = texto.indexOf('=');
    if (separador === -1) continue;

    const chave = texto.slice(0, separador).trim();
    let valor = texto.slice(separador + 1).trim();

    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    if (chave && process.env[chave] === undefined) process.env[chave] = valor;
  }
}

carregarEnv();

// Pastas configuráveis por variável de ambiente (útil para produção/backup)
const pastaDados = path.resolve(process.env.DATA_DIR || path.join(raiz, 'data'));
const pastaBackups = path.resolve(process.env.BACKUP_DIR || path.join(raiz, 'backups'));

for (const pasta of [pastaDados, pastaBackups]) {
  fs.mkdirSync(pasta, { recursive: true });
}

module.exports = {
  raiz,
  pastaDados,
  pastaBackups,
  pastaPublica: path.join(raiz, 'public'),
  arquivoBanco: path.join(pastaDados, 'newstar.sqlite'),

  porta: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  ambiente: process.env.NODE_ENV || 'development',
  versao: '2.0.1',

  // Sessão: token opaco enviado no header Authorization.
  nomeTokenLocal: 'newstar_token',
  diasSessao: Number(process.env.SESSION_DAYS) || 30,

  // Backups automáticos do arquivo completo no servidor
  intervaloBackupHoras: Number(process.env.BACKUP_INTERVALO_HORAS) || 24,
  reterBackupsDias: Number(process.env.BACKUP_RETER_DIAS) || 30,

  // Limite de tentativas de login por IP
  limiteTentativas: Number(process.env.LOGIN_MAX_TENTATIVAS) || 20,
  janelaTentativasMin: Number(process.env.LOGIN_JANELA_MIN) || 15,
};
