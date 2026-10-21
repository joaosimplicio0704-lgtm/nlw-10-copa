'use strict';

/**
 * New Star Notebook — servidor
 *
 * - Login/cadastro com senha em scrypt e sessão por token
 * - Cada conta tem seu próprio conjunto de dados (isolamento por tenant_id)
 * - API protegida por login em todas as rotas
 * - Backup por conta em .sqlite e .json; nuvem opcional (Supabase/WebDAV)
 * - Importação dos dados antigos que estavam no localStorage
 */

const express = require('express');
const path = require('path');

const config = require('./config');
const db = require('./lib/db');
const auth = require('./lib/auth');
const auditoria = require('./lib/auditoria');
const nuvem = require('./lib/nuvem');
const backups = require('./lib/backups');
const configConta = require('./lib/config-conta');
const importacao = require('./lib/importacao');
const contaBackup = require('./lib/conta-backup');
const { ENTIDADES, existeEntidade } = require('./lib/entidades');
const {
  ErroValidacao,
  normalizarEntidade,
  validarEmail,
  validarSenha,
  validarNome,
  inteiroPositivo,
} = require('./lib/validacao');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Hash fictício usado para gastar o mesmo tempo de scrypt quando o e-mail não existe
const HASH_FALSO = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

// ---------------------------------------------------------------------------
// Middlewares básicos
// ---------------------------------------------------------------------------

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    // Impede que navegador/proxy guarde respostas da API (inclusive um 401 antigo)
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization, Cookie');
  }

  res.on('finish', () => {
    // Só registra 401 quando alguma credencial foi enviada: assim dá para
    // diferenciar "visita nova" de "token recusado".
    if (res.statusCode === 401) {
      const temHeader = Boolean(req.headers.authorization || req.headers['x-sessao']);
      const temCookie = /newstar_sessao=/.test(String(req.headers.cookie || ''));

      if (temHeader || temCookie) {
        console.log(
          `[401] ${req.method} ${req.originalUrl} · header=${temHeader} cookie=${temCookie} ` +
            `host=${req.headers.host || '-'} origem=${req.headers.origin || '-'}`
        );
      }
    }
  });

  next();
});

app.use(express.json({ limit: '30mb' }));

// Limite simples de tentativas de login/cadastro por IP (em memória)
const tentativas = new Map();

function limitarAutenticacao(req, res, next) {
  const agora = Date.now();
  const janela = config.janelaTentativasMin * 60 * 1000;
  const chave = req.ip || 'desconhecido';

  const registro = tentativas.get(chave) || { contagem: 0, reiniciaEm: agora + janela };

  if (agora > registro.reiniciaEm) {
    registro.contagem = 0;
    registro.reiniciaEm = agora + janela;
  }

  registro.contagem += 1;
  tentativas.set(chave, registro);

  if (registro.contagem > config.limiteTentativas) {
    const esperar = Math.ceil((registro.reiniciaEm - agora) / 1000);
    res.setHeader('Retry-After', String(esperar));
    return res.status(429).json({
      erro: `Muitas tentativas. Aguarde ${Math.ceil(esperar / 60)} minuto(s) e tente novamente.`,
    });
  }

  next();
}

const limparTentativas = setInterval(() => {
  const agora = Date.now();
  for (const [chave, registro] of tentativas) {
    if (agora > registro.reiniciaEm) tentativas.delete(chave);
  }
}, 10 * 60 * 1000);
limparTentativas.unref();

// Envolve rotas async e encaminha erros para o middleware final
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    empresa: usuario.empresa || '',
    email: usuario.email,
    papel: usuario.papel,
    criado_em: usuario.criado_em,
  };
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    versao: config.versao,
    banco: db.ativo(),
    ambiente: config.ambiente,
    horario: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

// Handler único, registrado em dois caminhos por compatibilidade com
// navegadores que ainda tenham o script antigo em cache.
const registrarConta = rota(async (req, res) => {
  const nome = validarNome(req.body?.nome, 'Nome');
  const empresa = String(req.body?.empresa || '').trim().slice(0, 120);
  const email = validarEmail(req.body?.email);
  const senha = validarSenha(req.body?.senha);

  const existe = db.get('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (existe) {
    throw new ErroValidacao('Já existe uma conta com esse e-mail. Faça login.', 409);
  }

  const hash = await auth.hashSenha(senha);

  const id = db.transacao(() => {
    const resultado = db.run(
      'INSERT INTO usuarios (nome, empresa, email, senha_hash) VALUES (?, ?, ?, ?)',
      [nome, empresa, email, hash]
    );

    auditoria.registrar({
      tenantId: resultado.id,
      usuarioId: resultado.id,
      entidade: 'conta',
      acao: 'conta',
      descricao: `Criou a conta (${email}).`,
    });

    return resultado.id;
  });

  const sessao = auth.criarSessao(id);
  db.salvarAgora();

  const usuario = db.get(
    'SELECT id, nome, empresa, email, papel, criado_em FROM usuarios WHERE id = ?',
    [id]
  );

  auth.definirCookieSessao(req, res, sessao.token);

  res.status(201).json({
    token: sessao.token,
    expiraEm: sessao.expiraEm,
    usuario: usuarioPublico(usuario),
  });
});

app.post('/api/auth/registrar', limitarAutenticacao, registrarConta);
app.post('/api/registrar', limitarAutenticacao, registrarConta);

const entrarNaConta = rota(async (req, res) => {
  const email = validarEmail(req.body?.email);
  const senha = String(req.body?.senha || '');

  const usuario = db.get('SELECT * FROM usuarios WHERE email = ?', [email]);

  // Mesmo sem usuário, executa o scrypt para não revelar quais e-mails existem
  const senhaOk = usuario
    ? await auth.verificarSenha(senha, usuario.senha_hash)
    : await auth.verificarSenha(senha, HASH_FALSO);

  if (!usuario || !senhaOk) {
    throw new ErroValidacao('E-mail ou senha incorretos.', 401);
  }

  auth.limparSessoesVencidas();
  const sessao = auth.criarSessao(usuario.id);

  auditoria.registrar({
    tenantId: usuario.id,
    usuarioId: usuario.id,
    entidade: 'conta',
    acao: 'conta',
    descricao: 'Entrou no sistema.',
  });

  db.salvarAgora();

  auth.definirCookieSessao(req, res, sessao.token);

  res.json({
    token: sessao.token,
    expiraEm: sessao.expiraEm,
    usuario: usuarioPublico(usuario),
  });
});

app.post('/api/auth/entrar', limitarAutenticacao, entrarNaConta);
app.post('/api/login', limitarAutenticacao, entrarNaConta);

// A partir daqui, tudo em /api exige sessão válida
app.use('/api', auth.exigirLogin);

app.get('/api/auth/eu', (req, res) => {
  res.json({ usuario: usuarioPublico(req.usuario) });
});

app.post('/api/auth/sair', (req, res) => {
  auth.destruirSessao(req.token);
  auth.limparCookieSessao(req, res);
  db.salvarAgora();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Leitura geral (uma chamada por carregamento de tela)
// ---------------------------------------------------------------------------

function linhaSaida(entidade, linha) {
  const copia = { ...linha };
  delete copia.tenant_id;

  if (entidade === 'os' && typeof copia.detalhes === 'string') {
    try {
      copia.detalhes = JSON.parse(copia.detalhes);
    } catch (_) {
      copia.detalhes = {};
    }
  }

  return copia;
}

app.get('/api/dados', (req, res) => {
  const tenantId = req.usuario.id;
  const dados = {};

  for (const [entidade, conf] of Object.entries(ENTIDADES)) {
    const linhas = db.all(
      `SELECT * FROM ${conf.tabela} WHERE tenant_id = ? ORDER BY id DESC`,
      [tenantId]
    );
    dados[conf.chave] = linhas.map((linha) => linhaSaida(entidade, linha));
  }

  const totais = db.get(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'DEVENDO' THEN valor_centavos ELSE 0 END), 0) AS devendo,
       COALESCE(SUM(CASE WHEN status = 'PAGO' THEN valor_centavos ELSE 0 END), 0) AS pago,
       COUNT(*) AS lancamentos
     FROM financeiro WHERE tenant_id = ?`,
    [tenantId]
  );

  const contagens = {
    servicos: dados.servicos.length,
    servicosEmAndamento: dados.servicos.filter((s) => s.status === 'Em andamento').length,
    notebooks: dados.notebooksLoja.length,
    osProntas: dados.osProntas.length,
  };

  res.json({
    usuario: usuarioPublico(req.usuario),
    ...dados,
    totais,
    contagens,
    nuvem: {
      ...nuvem.status(),
      ultimoEnvio: configConta.obter(tenantId, 'nuvem_ultimo_envio'),
    },
    auditoria: auditoria.listar(tenantId, 30),
    versao: config.versao,
  });
});

// ---------------------------------------------------------------------------
// Backup: download, restauração e nuvem
// ---------------------------------------------------------------------------

function nomeArquivo(usuario, extensao) {
  const data = new Date().toISOString().slice(0, 10);
  const apelido = String(usuario.email || 'conta')
    .split('@')[0]
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase();
  return `newstar-${apelido}-${data}.${extensao}`;
}

app.get('/api/backup.sqlite', (req, res) => {
  const { buffer } = contaBackup.exportarBancoConta(req.usuario);

  auditoria.registrar({
    tenantId: req.usuario.id,
    usuarioId: req.usuario.id,
    entidade: 'backup',
    acao: 'backup',
    descricao: 'Baixou o banco de dados (.sqlite).',
  });
  db.salvarAgora();

  res.setHeader('Content-Type', 'application/vnd.sqlite3');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo(req.usuario, 'sqlite')}"`);
  res.send(buffer);
});

app.get('/api/backup.json', (req, res) => {
  const dados = contaBackup.exportarJsonConta(req.usuario);

  auditoria.registrar({
    tenantId: req.usuario.id,
    usuarioId: req.usuario.id,
    entidade: 'backup',
    acao: 'backup',
    descricao: 'Baixou o backup em JSON.',
  });
  db.salvarAgora();

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo(req.usuario, 'json')}"`);
  res.send(JSON.stringify(dados, null, 2));
});

app.get('/api/backup/nuvem', (req, res) => {
  res.json({
    ...nuvem.status(),
    ultimoEnvio: configConta.obter(req.usuario.id, 'nuvem_ultimo_envio'),
  });
});

app.post(
  '/api/backup/nuvem',
  rota(async (req, res) => {
    if (!nuvem.provedor()) {
      throw new ErroValidacao(nuvem.status().instrucao, 400);
    }

    const { buffer, resumo } = contaBackup.exportarBancoConta(req.usuario);
    const resultado = await nuvem.enviar(buffer, req.usuario.id);

    configConta.definir(req.usuario.id, 'nuvem_ultimo_envio', resultado.enviadoEm);
    auditoria.registrar({
      tenantId: req.usuario.id,
      usuarioId: req.usuario.id,
      entidade: 'backup',
      acao: 'backup',
      descricao: `Enviou backup para a nuvem (${resultado.provedor}).`,
    });
    db.salvarAgora();

    res.json({ ok: true, ...resultado, resumo, nuvem: nuvem.status() });
  })
);

app.post(
  '/api/backup/nuvem/restaurar',
  rota(async (req, res) => {
    const { buffer } = await nuvem.baixar(req.usuario.id);
    const conjunto = importacao.lerSqlite(buffer, req.usuario.id);
    const resultado = importacao.importarConjunto(req.usuario.id, conjunto, {
      substituir: true,
      origem: 'backup na nuvem',
    });

    res.json({ ok: true, ...resultado, restauradoEm: new Date().toISOString() });
  })
);

app.post('/api/restaurar', (req, res) => {
  const { sqlite, json, substituir = true } = req.body || {};

  let conjunto;
  let origem;

  if (typeof sqlite === 'string' && sqlite.length > 0) {
    const bytes = Buffer.from(sqlite, 'base64');
    conjunto = importacao.lerSqlite(bytes, req.usuario.id);
    origem = 'arquivo .sqlite';
  } else if (json && typeof json === 'object') {
    conjunto = importacao.lerJson(json);
    origem = 'arquivo .json';
  } else {
    throw new ErroValidacao('Envie um arquivo .sqlite ou .json para restaurar.');
  }

  const resultado = importacao.importarConjunto(req.usuario.id, conjunto, {
    substituir: Boolean(substituir),
    origem,
  });

  res.json({ ok: true, ...resultado });
});

// Importação dos dados antigos do navegador (localStorage "newStarData")
app.post('/api/importar', (req, res) => {
  const { dados: dadosAntigos, substituir = false } = req.body || {};

  if (!dadosAntigos || typeof dadosAntigos !== 'object') {
    throw new ErroValidacao('Nenhum dado antigo foi enviado.');
  }

  const conjunto = importacao.lerJson(dadosAntigos);

  const resultado = importacao.importarConjunto(req.usuario.id, conjunto, {
    substituir: Boolean(substituir),
    origem: 'dados antigos do navegador',
  });

  res.json({ ok: true, ...resultado });
});

// ---------------------------------------------------------------------------
// CRUD genérico com allowlist de entidades
// ---------------------------------------------------------------------------

function configDaEntidade(req) {
  const entidade = String(req.params.entidade || '');
  if (!existeEntidade(entidade)) throw new ErroValidacao('Recurso não encontrado.', 404);
  return { entidade, conf: ENTIDADES[entidade] };
}

function garantirNumeroUnico(conf, tenantId, valor, ignorarId = null) {
  if (!conf.unico) return;

  const existente = db.get(
    `SELECT id FROM ${conf.tabela} WHERE tenant_id = ? AND ${conf.unico.campo} = ?`,
    [tenantId, valor]
  );

  if (existente && existente.id !== ignorarId) {
    throw new ErroValidacao(conf.unico.mensagem, 409);
  }
}

function inserirRegistro(entidade, conf, tenantId, dados) {
  const colunas = conf.campos;
  const sql = `INSERT INTO ${conf.tabela}
    (tenant_id, ${colunas.join(', ')})
    VALUES (?, ${colunas.map(() => '?').join(', ')})`;

  return db.transacao(() => {
    const resultado = db.run(sql, [tenantId, ...colunas.map((campo) => dados[campo])]);

    auditoria.registrar({
      tenantId,
      usuarioId: tenantId,
      entidade: conf.rotulo,
      entidadeId: resultado.id,
      acao: 'criar',
      descricao: `Criou: ${conf.resumo(dados)}`,
    });

    return resultado.id;
  });
}

function atualizarRegistro(entidade, conf, tenantId, id, dados, origem = 'edição') {
  const sets = conf.campos.map((campo) => `${campo} = ?`).join(', ');

  return db.transacao(() => {
    const resultado = db.run(
      `UPDATE ${conf.tabela}
          SET ${sets}, atualizado_em = datetime('now')
        WHERE id = ? AND tenant_id = ?`,
      [...conf.campos.map((campo) => dados[campo]), id, tenantId]
    );

    if (resultado.alteracoes === 0) {
      throw new ErroValidacao('Registro não encontrado.', 404);
    }

    auditoria.registrar({
      tenantId,
      usuarioId: tenantId,
      entidade: conf.rotulo,
      entidadeId: id,
      acao: 'alterar',
      descricao: `Atualizou (${origem}): ${conf.resumo(dados)}`,
    });
  });
}

app.post('/api/:entidade', (req, res) => {
  const { entidade, conf } = configDaEntidade(req);
  const tenantId = req.usuario.id;
  const dados = normalizarEntidade(entidade, req.body);

  // OS prontas: mesmo número = atualiza a existente (evita duplicidade)
  if (conf.upsertPor) {
    const existente = db.get(
      `SELECT * FROM ${conf.tabela} WHERE tenant_id = ? AND ${conf.upsertPor} = ?`,
      [tenantId, dados[conf.upsertPor]]
    );

    if (existente) {
      atualizarRegistro(entidade, conf, tenantId, existente.id, dados, 'OS já existente');
      const linha = db.get(
        `SELECT * FROM ${conf.tabela} WHERE id = ? AND tenant_id = ?`,
        [existente.id, tenantId]
      );
      return res.json({ ...linhaSaida(entidade, linha), atualizado: true });
    }
  }

  if (conf.unico) garantirNumeroUnico(conf, tenantId, dados[conf.unico.campo]);

  const id = inserirRegistro(entidade, conf, tenantId, dados);
  const linha = db.get(`SELECT * FROM ${conf.tabela} WHERE id = ? AND tenant_id = ?`, [
    id,
    tenantId,
  ]);

  res.status(201).json({ ...linhaSaida(entidade, linha), atualizado: false });
});

app.put('/api/:entidade/:id', (req, res) => {
  const { entidade, conf } = configDaEntidade(req);
  const tenantId = req.usuario.id;
  const id = inteiroPositivo(req.params.id);

  const existente = db.get(`SELECT * FROM ${conf.tabela} WHERE id = ? AND tenant_id = ?`, [
    id,
    tenantId,
  ]);

  if (!existente) throw new ErroValidacao('Registro não encontrado.', 404);

  // Mescla o que veio com o que já existia (aceita atualização parcial)
  const mesclado = {};
  for (const campo of conf.campos) {
    mesclado[campo] = Object.prototype.hasOwnProperty.call(req.body || {}, campo)
      ? req.body[campo]
      : existente[campo];
  }

  const dados = normalizarEntidade(entidade, mesclado);

  if (conf.unico) garantirNumeroUnico(conf, tenantId, dados[conf.unico.campo], id);

  atualizarRegistro(entidade, conf, tenantId, id, dados);

  const linha = db.get(`SELECT * FROM ${conf.tabela} WHERE id = ? AND tenant_id = ?`, [
    id,
    tenantId,
  ]);

  res.json(linhaSaida(entidade, linha));
});

app.patch('/api/:entidade/:id/status', (req, res) => {
  const { entidade, conf } = configDaEntidade(req);
  const tenantId = req.usuario.id;
  const id = inteiroPositivo(req.params.id);

  if (!conf.status) {
    throw new ErroValidacao('Esta entidade não tem status editável.', 400);
  }

  const novoStatus = String(req.body?.status ?? '').trim();
  if (!conf.status.includes(novoStatus)) {
    throw new ErroValidacao(`Status inválido. Use: ${conf.status.join(', ')}.`);
  }

  const existente = db.get(`SELECT * FROM ${conf.tabela} WHERE id = ? AND tenant_id = ?`, [
    id,
    tenantId,
  ]);
  if (!existente) throw new ErroValidacao('Registro não encontrado.', 404);

  db.transacao(() => {
    const resultado = db.run(
      `UPDATE ${conf.tabela}
          SET status = ?, atualizado_em = datetime('now')
        WHERE id = ? AND tenant_id = ?`,
      [novoStatus, id, tenantId]
    );

    if (resultado.alteracoes === 0) throw new ErroValidacao('Registro não encontrado.', 404);

    auditoria.registrar({
      tenantId,
      usuarioId: tenantId,
      entidade: conf.rotulo,
      entidadeId: id,
      acao: 'alterar',
      descricao: `Alterou o status de "${existente.status}" para "${novoStatus}".`,
    });
  });

  res.json({ ok: true, id, status: novoStatus });
});

app.delete('/api/:entidade/:id', (req, res) => {
  const { conf } = configDaEntidade(req);
  const tenantId = req.usuario.id;
  const id = inteiroPositivo(req.params.id);

  const existente = db.get(`SELECT * FROM ${conf.tabela} WHERE id = ? AND tenant_id = ?`, [
    id,
    tenantId,
  ]);
  if (!existente) throw new ErroValidacao('Registro não encontrado.', 404);

  db.transacao(() => {
    db.run(`DELETE FROM ${conf.tabela} WHERE id = ? AND tenant_id = ?`, [id, tenantId]);

    auditoria.registrar({
      tenantId,
      usuarioId: tenantId,
      entidade: conf.rotulo,
      entidadeId: id,
      acao: 'excluir',
      descricao: `Excluiu: ${conf.resumo(existente)}`,
    });
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Arquivos estáticos e erros
// ---------------------------------------------------------------------------

app.use(
  express.static(config.pastaPublica, {
    index: 'index.html',
    etag: true,
    setHeaders(res, caminho) {
      if (/\.(html|js|css)$/i.test(caminho)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ erro: 'Rota não encontrada.' });
  }
  res.status(404).sendFile(path.join(config.pastaPublica, 'index.html'));
});

app.use((erro, req, res, next) => {
  if (res.headersSent) return next(erro);

  if (erro instanceof ErroValidacao) {
    return res.status(erro.status).json({ erro: erro.message });
  }

  if (erro && erro.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Arquivo grande demais. Limite: 30 MB.' });
  }

  if (erro && erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
  }

  console.error('[erro]', erro);
  res.status(500).json({ erro: 'Erro interno do servidor. Tente novamente.' });
});

// ---------------------------------------------------------------------------
// Inicialização e encerramento
// ---------------------------------------------------------------------------

async function iniciar() {
  await db.abrir();
  backups.iniciar();

  const servidor = app.listen(config.porta, config.host, () => {
    console.log(`\n  New Star Notebook v${config.versao}`);
    console.log(`  Servidor: http://localhost:${config.porta}`);
    console.log(`  Banco:    ${config.arquivoBanco}`);
    console.log(`  Nuvem:    ${nuvem.provedor() || 'não configurada (backup local disponível)'}`);

    const contas = db.get('SELECT COUNT(*) AS total FROM usuarios');
    if (!contas || contas.total === 0) {
      console.log('\n  Nenhuma conta ainda: abra o site e clique em "Criar conta".');
      console.log('  (ou rode `npm run demo` para criar contas com dados de exemplo)');
    }

    console.log('');
  });

  const encerrar = (sinal) => {
    console.log(`\n[${sinal}] encerrando...`);
    try {
      db.salvarAgora();
      db.fechar();
    } catch (erro) {
      console.error('Falha ao fechar o banco:', erro.message);
    }
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));

  return servidor;
}

if (require.main === module) {
  iniciar().catch((erro) => {
    console.error('Não foi possível iniciar o servidor:', erro);
    process.exit(1);
  });
}

module.exports = { app, iniciar };
