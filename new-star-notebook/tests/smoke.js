'use strict';

/**
 * Teste rápido da API — sem dependências externas.
 *
 * Sobe o servidor numa porta separada, com pasta de dados temporária, e valida:
 *  - cadastro e login
 *  - isolamento entre contas
 *  - regras de validação
 *  - backup por conta e restauração
 *  - importação do formato antigo (localStorage)
 *
 * Uso: npm test
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORTA = 3210;
const BASE = `http://127.0.0.1:${PORTA}`;
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'newstar-teste-'));

let servidor;
let falhas = 0;

function ok(nome) {
  console.log(`  ✓ ${nome}`);
}

async function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function esperarServidor() {
  for (let tentativa = 0; tentativa < 80; tentativa++) {
    try {
      const resposta = await fetch(`${BASE}/health`);
      if (resposta.ok) return;
    } catch (_) {
      // ainda subindo
    }
    await esperar(150);
  }
  throw new Error('O servidor não respondeu em /health.');
}

async function api(metodo, caminho, corpo, token, opcoes = {}) {
  const cabecalhos = {};
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    redirect: opcoes.redirect,
  });

  const texto = await resposta.text();
  let dados = null;
  try {
    dados = JSON.parse(texto);
  } catch (_) {
    dados = texto;
  }

  return { status: resposta.status, dados, headers: resposta.headers };
}

async function testar(nome, fn) {
  try {
    await fn();
    ok(nome);
  } catch (erro) {
    falhas += 1;
    console.error(`  ✗ ${nome}`);
    console.error(`    ${erro.message}`);
  }
}

async function principal() {
  console.log('\nNew Star Notebook — teste de fumaça\n');

  servidor = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORTA),
      HOST: '127.0.0.1',
      DATA_DIR: path.join(PASTA, 'data'),
      BACKUP_DIR: path.join(PASTA, 'backups'),
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });

  await esperarServidor();

  let tokenA;
  let tokenB;

  await testar('health check responde', async () => {
    const resposta = await api('GET', '/health');
    assert.strictEqual(resposta.status, 200);
    assert.strictEqual(resposta.dados.ok, true);
  });

  await testar('cadastro cria conta e devolve token', async () => {
    const resposta = await api('POST', '/api/auth/registrar', {
      nome: 'Ana Teste',
      empresa: 'Loja A',
      email: 'ana@teste.local',
      senha: 'senha12345',
    });
    assert.strictEqual(resposta.status, 201);
    assert.ok(resposta.dados.token);
    tokenA = resposta.dados.token;
  });

  await testar('cadastro de outra conta', async () => {
    const resposta = await api('POST', '/api/auth/registrar', {
      nome: 'Bruno Teste',
      email: 'bruno@teste.local',
      senha: 'senha12345',
    });
    assert.strictEqual(resposta.status, 201);
    tokenB = resposta.dados.token;
  });

  await testar('e-mail duplicado é recusado', async () => {
    const resposta = await api('POST', '/api/auth/registrar', {
      nome: 'Outra',
      email: 'ANA@teste.local',
      senha: 'senha12345',
    });
    assert.strictEqual(resposta.status, 409);
  });

  await testar('senha errada não entra', async () => {
    const resposta = await api('POST', '/api/auth/entrar', {
      email: 'ana@teste.local',
      senha: 'errada123',
    });
    assert.strictEqual(resposta.status, 401);
  });

  await testar('login devolve token', async () => {
    const resposta = await api('POST', '/api/auth/entrar', {
      email: 'ana@teste.local',
      senha: 'senha12345',
    });
    assert.strictEqual(resposta.status, 200);
    assert.ok(resposta.dados.token);
  });

  await testar('rota protegida sem token responde 401', async () => {
    const resposta = await api('GET', '/api/dados');
    assert.strictEqual(resposta.status, 401);
  });

  await testar('conta A cria serviço e enxerga só o seu', async () => {
    const criado = await api(
      'POST',
      '/api/servicos',
      { nome: 'Cliente A', num: '100', notebook: 'Dell', data: '2026-10-01' },
      tokenA
    );
    assert.strictEqual(criado.status, 201);

    const dados = await api('GET', '/api/dados', undefined, tokenA);
    assert.strictEqual(dados.dados.servicos.length, 1);
    assert.strictEqual(dados.dados.servicos[0].nome, 'Cliente A');
  });

  await testar('conta B não vê os dados da conta A', async () => {
    const dados = await api('GET', '/api/dados', undefined, tokenB);
    assert.strictEqual(dados.dados.servicos.length, 0);
    assert.strictEqual(dados.dados.telefones.length, 0);
  });

  await testar('conta B não consegue editar registro da conta A', async () => {
    const dados = await api('GET', '/api/dados', undefined, tokenA);
    const id = dados.dados.servicos[0].id;

    const tentativa = await api(
      'PUT',
      `/api/servicos/${id}`,
      { nome: 'invadido' },
      tokenB
    );
    assert.strictEqual(tentativa.status, 404);
  });

  await testar('conta B não consegue excluir registro da conta A', async () => {
    const dados = await api('GET', '/api/dados', undefined, tokenA);
    const id = dados.dados.servicos[0].id;

    const tentativa = await api('DELETE', `/api/servicos/${id}`, undefined, tokenB);
    assert.strictEqual(tentativa.status, 404);
  });

  await testar('entidade inexistente responde 404', async () => {
    const resposta = await api('POST', '/api/__proto__', { nome: 'x' }, tokenA);
    assert.strictEqual(resposta.status, 404);
  });

  await testar('nº de OS duplicado na mesma conta responde 409', async () => {
    const resposta = await api(
      'POST',
      '/api/servicos',
      { nome: 'Outro', num: '100', notebook: 'X', data: '2026-10-02' },
      tokenA
    );
    assert.strictEqual(resposta.status, 409);
  });

  await testar('status inválido é recusado', async () => {
    const resposta = await api(
      'POST',
      '/api/servicos',
      { nome: 'X', num: '200', notebook: 'Y', data: '2026-10-02', status: 'HACKEADO' },
      tokenA
    );
    assert.strictEqual(resposta.status, 400);
  });

  await testar('OS com o mesmo número é atualizada, não duplicada', async () => {
    const primeira = await api(
      'POST',
      '/api/os',
      { numero: '500', cliente: 'Cliente A', equipamento: 'Dell', data: '2026-10-01', detalhes: { itens: 'x' } },
      tokenA
    );
    assert.strictEqual(primeira.status, 201);

    const segunda = await api(
      'POST',
      '/api/os',
      { numero: '500', cliente: 'Cliente A editado', equipamento: 'Dell', data: '2026-10-01', detalhes: { itens: 'y' } },
      tokenA
    );
    assert.strictEqual(segunda.status, 200);
    assert.strictEqual(segunda.dados.atualizado, true);

    const dados = await api('GET', '/api/dados', undefined, tokenA);
    assert.strictEqual(dados.dados.osProntas.length, 1);
  });

  let backup;

  await testar('backup .sqlite é gerado só com os dados da conta', async () => {
    const resposta = await fetch(`${BASE}/api/backup.sqlite`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(resposta.status, 200);

    backup = Buffer.from(await resposta.arrayBuffer());
    assert.strictEqual(backup.subarray(0, 15).toString('utf8'), 'SQLite format 3');
    assert.ok(backup.length > 1000);

    const texto = backup.toString('latin1');
    assert.ok(texto.includes('Cliente A'));
    assert.ok(!texto.includes('Bruno Teste'), 'backup não deve conter a outra conta');
  });

  await testar('restauração substitui os dados da conta', async () => {
    await api(
      'POST',
      '/api/servicos',
      { nome: 'Extra', num: '300', notebook: 'X', data: '2026-10-03' },
      tokenA
    );

    let dados = await api('GET', '/api/dados', undefined, tokenA);
    assert.strictEqual(dados.dados.servicos.length, 2);

    const restaurado = await api(
      'POST',
      '/api/restaurar',
      { sqlite: backup.toString('base64'), substituir: true },
      tokenA
    );
    assert.strictEqual(restaurado.status, 200);
    assert.ok(restaurado.dados.total >= 1);

    dados = await api('GET', '/api/dados', undefined, tokenA);
    assert.strictEqual(dados.dados.servicos.length, 1);
    assert.strictEqual(dados.dados.servicos[0].num, '100');
  });

  await testar('importação do formato antigo (localStorage) converte valores', async () => {
    const legado = {
      servicos: [
        { nome: 'Legado', num: '55', notebook: 'Positivo', desc: 'desc antiga', data: '2026-09-01' },
      ],
      financeiro: [
        { nome: 'Legado', status: 'DEVENDO', valor: 'R$ 1.234,56', notebook: 'Positivo' },
      ],
      osProntas: [
        { numero: '55', cliente: 'Legado', equipamento: 'Positivo', data: '2026-09-01' },
      ],
    };

    const resposta = await api('POST', '/api/importar', { dados: legado }, tokenB);
    assert.strictEqual(resposta.status, 200);
    assert.strictEqual(resposta.dados.total, 3);

    const dados = await api('GET', '/api/dados', undefined, tokenB);
    assert.strictEqual(dados.dados.servicos[0].descricao, 'desc antiga');
    assert.strictEqual(dados.dados.financeiro[0].valor_centavos, 123456);
  });

  await testar('login pelo caminho antigo (/api/login) continua funcionando', async () => {
    const resposta = await api('POST', '/api/login', {
      email: 'ana@teste.local',
      senha: 'senha12345',
    });

    assert.strictEqual(resposta.status, 200);
    assert.ok(resposta.dados.token);
  });

  await testar('autenticação pelo header X-Sessao', async () => {
    const resposta = await fetch(`${BASE}/api/dados`, {
      headers: { 'X-Sessao': tokenA },
    });

    assert.strictEqual(resposta.status, 200);
  });

  await testar('autenticação pelo cookie de sessão (sem header)', async () => {
    const entrada = await api('POST', '/api/auth/entrar', {
      email: 'ana@teste.local',
      senha: 'senha12345',
    });

    const cookies = entrada.headers.getSetCookie ? entrada.headers.getSetCookie() : [];
    const sessao = cookies.find((c) => c.startsWith('newstar_sessao='));
    assert.ok(sessao, 'o login deve definir o cookie newstar_sessao');
    assert.ok(/HttpOnly/i.test(sessao), 'o cookie deve ser HttpOnly');
    assert.ok(/SameSite=/i.test(sessao), 'o cookie deve ter SameSite');

    const resposta = await fetch(`${BASE}/api/dados`, {
      headers: { Cookie: sessao.split(';')[0] },
    });

    assert.strictEqual(resposta.status, 200);
    const dados = await resposta.json();
    assert.ok(Array.isArray(dados.servicos));
  });

  await testar('escrita com cookie e outra origem é bloqueada (CSRF)', async () => {
    const entrada = await api('POST', '/api/auth/entrar', {
      email: 'ana@teste.local',
      senha: 'senha12345',
    });

    const cookies = entrada.headers.getSetCookie ? entrada.headers.getSetCookie() : [];
    const sessao = cookies.find((c) => c.startsWith('newstar_sessao='));
    assert.ok(sessao);

    const resposta = await fetch(`${BASE}/api/servicos`, {
      method: 'POST',
      headers: {
        Cookie: sessao.split(';')[0],
        Origin: 'https://site-malicioso.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nome: 'Invasão', num: '999', status: 'Em andamento' }),
    });

    assert.strictEqual(resposta.status, 403);
  });

  await testar('respostas da API não são guardadas em cache', async () => {
    const resposta = await api('GET', '/api/dados', undefined, tokenA);
    assert.strictEqual(resposta.status, 200);
    assert.strictEqual(resposta.headers.get('cache-control'), 'no-store');
    assert.ok(String(resposta.headers.get('vary')).includes('Authorization'));
  });

  await testar('sair invalida o token', async () => {
    const saida = await api('POST', '/api/auth/sair', {}, tokenB);
    assert.strictEqual(saida.status, 200);

    const depois = await api('GET', '/api/dados', undefined, tokenB);
    assert.strictEqual(depois.status, 401);
  });

  await testar('nuvem sem configuração responde erro claro', async () => {
    const resposta = await api('POST', '/api/backup/nuvem', {}, tokenA);
    assert.strictEqual(resposta.status, 400);
    assert.ok(String(resposta.dados.erro).includes('SUPABASE'));
  });

  console.log(`\n${falhas === 0 ? 'Tudo certo!' : `${falhas} teste(s) falharam.`}\n`);
}

principal()
  .catch((erro) => {
    console.error('\nErro fatal:', erro);
    falhas += 1;
  })
  .finally(async () => {
    if (servidor) servidor.kill('SIGTERM');
    await esperar(600);
    fs.rmSync(PASTA, { recursive: true, force: true });
    process.exit(falhas === 0 ? 0 : 1);
  });
