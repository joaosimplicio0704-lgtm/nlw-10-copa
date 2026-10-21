'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const db = require('./db');
const config = require('../config');

const scrypt = promisify(crypto.scrypt);

// Parâmetros do scrypt (equilíbrio segurança x tempo em uma máquina de loja)
const SCRYPT = { N: 16384, r: 8, p: 1, tamanho: 64 };

/** Gera um hash de senha no formato `scrypt$salt$hash`. */
async function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivada = await scrypt(senha, salt, SCRYPT.tamanho, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt}$${derivada.toString('hex')}`;
}

/** Compara a senha digitada com o hash salvo, em tempo constante. */
async function verificarSenha(senha, armazenado) {
  try {
    const partes = String(armazenado || '').split('$');
    if (partes.length !== 3 || partes[0] !== 'scrypt') return false;

    const [, salt, hashHex] = partes;
    const derivada = await scrypt(senha, salt, SCRYPT.tamanho, {
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
      maxmem: 64 * 1024 * 1024,
    });

    const esperado = Buffer.from(hashHex, 'hex');
    if (esperado.length !== derivada.length) return false;
    return crypto.timingSafeEqual(esperado, derivada);
  } catch (_) {
    return false;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Cria uma sessão e devolve o token que o navegador deve guardar. */
function criarSessao(usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiraDate = new Date(Date.now() + config.diasSessao * 24 * 60 * 60 * 1000);
  // Formato igual ao datetime('now') do SQLite (UTC), para comparação correta
  const expiraBanco = expiraDate.toISOString().slice(0, 19).replace('T', ' ');

  db.run(
    `INSERT INTO sessoes (token_hash, usuario_id, expira_em)
     VALUES (?, ?, ?)`,
    [hashToken(token), usuarioId, expiraBanco]
  );

  return { token, expiraEm: expiraDate.toISOString() };
}

function destruirSessao(token) {
  if (!token) return;
  db.run('DELETE FROM sessoes WHERE token_hash = ?', [hashToken(token)]);
}

function destruirSessoesDoUsuario(usuarioId) {
  db.run('DELETE FROM sessoes WHERE usuario_id = ?', [usuarioId]);
}

function limparSessoesVencidas() {
  db.run(`DELETE FROM sessoes WHERE expira_em < datetime('now')`);
}

function tokenDaRequisicao(req) {
  const cabecalho = req.headers.authorization || '';
  if (cabecalho.startsWith('Bearer ')) return cabecalho.slice(7).trim();

  // Compatibilidade: aceita também cookie (caso o front use cookie no futuro)
  const cookies = String(req.headers.cookie || '');
  const nome = 'newstar_sessao=';
  const parte = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith(nome));
  return parte ? decodeURIComponent(parte.slice(nome.length)) : null;
}

/** Busca o usuário dono do token, se a sessão existir e não estiver vencida. */
function usuarioPorToken(token) {
  if (!token) return null;
  const linha = db.get(
    `SELECT u.id, u.nome, u.empresa, u.email, u.papel, u.criado_em
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ?
        AND s.expira_em > datetime('now')`,
    [hashToken(token)]
  );
  return linha || null;
}

/** Middleware: exige sessão válida em todas as rotas /api protegidas. */
function exigirLogin(req, res, next) {
  const token = tokenDaRequisicao(req);
  const usuario = usuarioPorToken(token);

  if (!usuario) {
    return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  }

  req.usuario = usuario;
  req.token = token;
  next();
}

module.exports = {
  hashSenha,
  verificarSenha,
  criarSessao,
  destruirSessao,
  destruirSessoesDoUsuario,
  limparSessoesVencidas,
  tokenDaRequisicao,
  usuarioPorToken,
  exigirLogin,
};
