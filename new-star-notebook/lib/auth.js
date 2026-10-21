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
  // datetime() normaliza tanto "AAAA-MM-DD HH:MM:SS" quanto o ISO antigo
  db.run(`DELETE FROM sessoes WHERE datetime(expira_em) <= datetime('now')`);
}

/* --------------------------- Cookie de sessão --------------------------- */
/*
 * O token vai em DOIS lugares: no header (Authorization / X-Sessao) e em um
 * cookie HttpOnly. Assim o login continua funcionando mesmo se um proxy do
 * preview remover o header Authorization, e o cookie não pode ser lido por
 * JavaScript (proteção contra XSS).
 */

const NOME_COOKIE = 'newstar_sessao';

function conexaoSegura(req) {
  if (req.secure) return true;

  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (proto === 'https') return true;

  // Preview/produção atrás de proxy: se não é localhost, assume HTTPS.
  const host = String(req.headers.host || '');
  return Boolean(host) && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

function opcoesCookie(req) {
  // Em HTTPS (inclusive atrás de proxy) o cookie precisa ser Secure + SameSite=None
  // para funcionar dentro de iframe. Em HTTP local fica Lax, senão o navegador descarta.
  return conexaoSegura(req)
    ? 'Path=/; HttpOnly; Secure; SameSite=None'
    : 'Path=/; HttpOnly; SameSite=Lax';
}

function definirCookieSessao(req, res, token) {
  const maxAge = config.diasSessao * 24 * 60 * 60;
  res.append(
    'Set-Cookie',
    `${NOME_COOKIE}=${encodeURIComponent(token)}; ${opcoesCookie(req)}; Max-Age=${maxAge}`
  );
}

function limparCookieSessao(req, res) {
  res.append('Set-Cookie', `${NOME_COOKIE}=; ${opcoesCookie(req)}; Max-Age=0`);
}

/** Lista os tokens presentes na requisição, na ordem de preferência. */
function tokensDaRequisicao(req) {
  const tokens = [];

  const xSessao = req.headers['x-sessao'];
  if (xSessao && String(xSessao).trim()) {
    tokens.push({ token: String(xSessao).trim(), fonte: 'header' });
  }

  const cabecalho = String(req.headers.authorization || '');
  if (cabecalho.startsWith('Bearer ')) {
    const token = cabecalho.slice(7).trim();
    if (token) tokens.push({ token, fonte: 'header' });
  }

  const cookies = String(req.headers.cookie || '');
  const parte = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${NOME_COOKIE}=`));

  if (parte) {
    try {
      const doCookie = decodeURIComponent(parte.slice(NOME_COOKIE.length + 1));
      if (doCookie && !tokens.some((t) => t.token === doCookie)) {
        tokens.push({ token: doCookie, fonte: 'cookie' });
      }
    } catch (_) {
      // cookie inválido: ignora
    }
  }

  return tokens;
}

/** Primeiro token disponível (compatibilidade). */
function credenciaisDaRequisicao(req) {
  return tokensDaRequisicao(req)[0] || { token: null, fonte: null };
}

function temCookieDeSessao(req) {
  return /(?:^|;\s*)newstar_sessao=/.test(String(req.headers.cookie || ''));
}

function tokenDaRequisicao(req) {
  return credenciaisDaRequisicao(req).token;
}

/** Requisições que mudam dados feitas com cookie precisam vir da mesma origem. */
function origemPermitida(req) {
  const origem = req.headers.origin;
  if (!origem) return true;

  try {
    return new URL(origem).host === req.headers.host;
  } catch (_) {
    return false;
  }
}

/** Busca o usuário dono do token, se a sessão existir e não estiver vencida. */
function usuarioPorToken(token) {
  if (!token) return null;
  const linha = db.get(
    `SELECT u.id, u.nome, u.empresa, u.email, u.papel, u.criado_em
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ?
        AND datetime(s.expira_em) > datetime('now')`,
    [hashToken(token)]
  );
  return linha || null;
}

/** Middleware: exige sessão válida em todas as rotas /api protegidas. */
function exigirLogin(req, res, next) {
  const candidatos = tokensDaRequisicao(req);

  // Tenta o header e, se ele estiver vencido (ex.: outra aba já renovou a
  // sessão), tenta o cookie antes de recusar.
  let aceito = null;
  let usuario = null;

  for (const candidato of candidatos) {
    usuario = usuarioPorToken(candidato.token);
    if (usuario) {
      aceito = candidato;
      break;
    }
  }

  if (!usuario) {
    return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  }

  // O navegador manda o cookie sozinho; exigir mesma origem nas escritas evita
  // CSRF sem atrapalhar o app (que é sempre same-origin).
  const metodoSeguro = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (temCookieDeSessao(req) && !metodoSeguro && !origemPermitida(req)) {
    return res.status(403).json({ erro: 'Origem não permitida.' });
  }

  req.usuario = usuario;
  req.token = aceito.token;
  req.autenticadoPorCookie = aceito.fonte === 'cookie';
  next();
}

module.exports = {
  hashSenha,
  verificarSenha,
  criarSessao,
  destruirSessao,
  destruirSessoesDoUsuario,
  limparSessoesVencidas,
  definirCookieSessao,
  limparCookieSessao,
  credenciaisDaRequisicao,
  tokensDaRequisicao,
  tokenDaRequisicao,
  usuarioPorToken,
  exigirLogin,
};
