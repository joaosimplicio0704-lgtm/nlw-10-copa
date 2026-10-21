'use strict';

/**
 * Backup em nuvem (opcional).
 *
 * Funciona com dois provedores, sem dependência extra:
 *
 * 1) Supabase Storage
 *    SUPABASE_URL=https://xxxx.supabase.co
 *    SUPABASE_SERVICE_KEY=...        (service role key)
 *    SUPABASE_BUCKET=newstar         (opcional; criado automaticamente)
 *
 * 2) WebDAV (Nextcloud, ownCloud, InfiniCLOUD, HiDrive...)
 *    WEBDAV_URL=https://nuvem.exemplo.com/remote.php/dav/files/usuario/newstar
 *    WEBDAV_USER=usuario
 *    WEBDAV_PASS=senha
 *
 * Cada conta envia para um caminho próprio, com o banco já exportado apenas
 * com os dados daquela conta (tenant_id = 0 no arquivo).
 */

function valor(nome) {
  const v = process.env[nome];
  return v && String(v).trim() ? String(v).trim() : null;
}

function provedor() {
  if (valor('SUPABASE_URL') && (valor('SUPABASE_SERVICE_KEY') || valor('SUPABASE_KEY'))) {
    return 'supabase';
  }
  if (valor('WEBDAV_URL') && valor('WEBDAV_USER')) return 'webdav';
  return null;
}

function status() {
  const atual = provedor();
  return {
    configurada: Boolean(atual),
    provedor: atual,
    nome:
      atual === 'supabase'
        ? 'Supabase Storage'
        : atual === 'webdav'
        ? 'WebDAV'
        : null,
    instrucao:
      atual === null
        ? 'Para ativar, preencha SUPABASE_* ou WEBDAV_* no arquivo .env do servidor. O backup local (baixar o arquivo) funciona sem configuração.'
        : null,
  };
}

function caminho(usuarioId) {
  return `newstar/conta-${usuarioId}/backup.sqlite`;
}

async function garantirBucketSupabase(base, bucket, chave) {
  // Cria o bucket se ainda não existir. Se já existir, o Supabase responde
  // 400/409 — ignoramos, porque o objetivo é apenas garantir a existência.
  try {
    await fetch(`${base}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: bucket, name: bucket, public: false }),
    });
  } catch (_) {
    // segue para o upload; se o bucket não existir, o erro aparecerá lá
  }
}

function cabecalhoWebdav() {
  const usuario = valor('WEBDAV_USER');
  const senha = valor('WEBDAV_PASS') || '';
  return `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}`;
}

async function enviar(buffer, usuarioId) {
  const tipo = provedor();
  if (!tipo) {
    throw new Error(
      'A nuvem não está configurada no servidor. Use "Baixar banco (.sqlite)" ou configure SUPABASE_* / WEBDAV_* no .env.'
    );
  }

  if (tipo === 'supabase') {
    const base = valor('SUPABASE_URL').replace(/\/+$/, '');
    const chave = valor('SUPABASE_SERVICE_KEY') || valor('SUPABASE_KEY');
    const bucket = valor('SUPABASE_BUCKET') || 'newstar';

    await garantirBucketSupabase(base, bucket, chave);

    const resposta = await fetch(
      `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${caminho(usuarioId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${chave}`,
          'x-upsert': 'true',
          'Content-Type': 'application/octet-stream',
          'cache-control': 'no-cache',
        },
        body: buffer,
      }
    );

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      throw new Error(`Falha no Supabase Storage (${resposta.status}): ${detalhe.slice(0, 300)}`);
    }
  } else {
    const base = valor('WEBDAV_URL').replace(/\/+$/, '');
    const url = `${base}/newstar-conta-${usuarioId}.sqlite`;

    const resposta = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: cabecalhoWebdav(),
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    });

    if (!resposta.ok) {
      throw new Error(`Falha no WebDAV (${resposta.status}). Verifique WEBDAV_URL/USUARIO/SENHA.`);
    }
  }

  return { provedor: tipo, enviadoEm: new Date().toISOString() };
}

async function baixar(usuarioId) {
  const tipo = provedor();
  if (!tipo) throw new Error('A nuvem não está configurada no servidor.');

  let resposta;

  if (tipo === 'supabase') {
    const base = valor('SUPABASE_URL').replace(/\/+$/, '');
    const chave = valor('SUPABASE_SERVICE_KEY') || valor('SUPABASE_KEY');
    const bucket = valor('SUPABASE_BUCKET') || 'newstar';

    resposta = await fetch(
      `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${caminho(usuarioId)}`,
      { headers: { Authorization: `Bearer ${chave}` } }
    );
  } else {
    const base = valor('WEBDAV_URL').replace(/\/+$/, '');
    resposta = await fetch(`${base}/newstar-conta-${usuarioId}.sqlite`, {
      headers: { Authorization: cabecalhoWebdav() },
    });
  }

  if (resposta.status === 404) {
    throw new Error('Nenhum backup desta conta foi encontrado na nuvem.');
  }
  if (!resposta.ok) {
    throw new Error(`Falha ao baixar da nuvem (${resposta.status}).`);
  }

  const bytes = Buffer.from(await resposta.arrayBuffer());
  if (bytes.length < 100) throw new Error('O arquivo na nuvem está vazio ou corrompido.');

  return { buffer: bytes, provedor: tipo };
}

module.exports = { status, enviar, baixar, provedor };
