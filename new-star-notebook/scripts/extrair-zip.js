#!/usr/bin/env node
'use strict';

/**
 * Extrator de ZIP que usa SOMENTE o Node.js.
 *
 * Não precisa de WinRAR, 7-Zip, nem do comando `zip`/`unzip` instalado.
 * Funciona com arquivos .zip comuns (deflate ou sem compressão), inclusive
 * os gerados por este projeto.
 *
 * COMO USAR
 *   1. Coloque este arquivo na mesma pasta do .zip
 *   2. Rode:
 *        node extrair-zip.js                    (extrai o único .zip da pasta)
 *        node extrair-zip.js arquivo.zip        (escolhe o arquivo)
 *        node extrair-zip.js arquivo.zip pasta  (escolhe a pasta de destino)
 *        node extrair-zip.js --listar           (só mostra o conteúdo)
 *
 * O destino padrão é uma pasta com o nome do .zip (sem o .zip).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSINATURA_EOCD = 0x06054b50; // fim do diretório central
const ASSINATURA_CD = 0x02014b50; // entrada do diretório central
const ASSINATURA_LOCAL = 0x04034b50; // cabeçalho local

function falhar(mensagem) {
  console.error(`\n  Erro: ${mensagem}\n`);
  process.exit(1);
}

/** Localiza o "fim do diretório central" (EOCD), que fica no final do arquivo. */
function encontrarEOCD(buffer) {
  const tamanhoMinimo = 22;
  if (buffer.length < tamanhoMinimo) return -1;

  const limite = Math.max(0, buffer.length - (65535 + tamanhoMinimo));

  for (let posicao = buffer.length - tamanhoMinimo; posicao >= limite; posicao--) {
    if (buffer.readUInt32LE(posicao) === ASSINATURA_EOCD) return posicao;
  }

  return -1;
}

/** Lê a lista de arquivos do ZIP a partir do diretório central. */
function listarEntradas(buffer) {
  const eocd = encontrarEOCD(buffer);
  if (eocd === -1) {
    falhar('este arquivo não parece ser um .zip válido (não achei o índice do ZIP).');
  }

  const total = buffer.readUInt16LE(eocd + 10);
  const inicioCD = buffer.readUInt32LE(eocd + 16);

  if (inicioCD === 0xffffffff || total === 0xffff) {
    falhar('este .zip usa o formato ZIP64, que este extrator não suporta. Use o WinRAR/7-Zip.');
  }

  const entradas = [];
  let posicao = inicioCD;

  for (let i = 0; i < total; i++) {
    if (buffer.readUInt32LE(posicao) !== ASSINATURA_CD) {
      falhar('o índice do .zip está corrompido.');
    }

    const metodo = buffer.readUInt16LE(posicao + 10);
    const tamanhoComprimido = buffer.readUInt32LE(posicao + 20);
    const tamanhoOriginal = buffer.readUInt32LE(posicao + 24);
    const tamanhoNome = buffer.readUInt16LE(posicao + 28);
    const tamanhoExtra = buffer.readUInt16LE(posicao + 30);
    const tamanhoComentario = buffer.readUInt16LE(posicao + 32);
    const atributoExterno = buffer.readUInt32LE(posicao + 38);
    const inicioLocal = buffer.readUInt32LE(posicao + 42);
    const nome = buffer.toString('utf8', posicao + 46, posicao + 46 + tamanhoNome);

    entradas.push({
      nome,
      metodo,
      tamanhoComprimido,
      tamanhoOriginal,
      modo: (atributoExterno >>> 16) & 0o777,
      inicioLocal,
    });

    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  return entradas;
}

/** Extrai os bytes de uma entrada. */
function conteudoDaEntrada(buffer, entrada) {
  if (buffer.readUInt32LE(entrada.inicioLocal) !== ASSINATURA_LOCAL) {
    falhar(`cabeçalho inválido no arquivo "${entrada.nome}".`);
  }

  const tamanhoNomeLocal = buffer.readUInt16LE(entrada.inicioLocal + 26);
  const tamanhoExtraLocal = buffer.readUInt16LE(entrada.inicioLocal + 28);
  const inicioDados = entrada.inicioLocal + 30 + tamanhoNomeLocal + tamanhoExtraLocal;

  const dados = buffer.subarray(inicioDados, inicioDados + entrada.tamanhoComprimido);

  if (entrada.metodo === 0) {
    return Buffer.from(dados); // sem compressão
  }

  if (entrada.metodo === 8) {
    return zlib.inflateRawSync(dados); // deflate
  }

  falhar(`o arquivo "${entrada.nome}" usa uma compressão não suportada (método ${entrada.metodo}).`);
}

/** Garante que o destino fique dentro da pasta escolhida (evita "zip slip"). */
function caminhoSeguro(raiz, nome) {
  const destino = path.resolve(raiz, nome);
  const prefixo = raiz.endsWith(path.sep) ? raiz : raiz + path.sep;

  if (destino !== raiz && !destino.startsWith(prefixo)) {
    falhar(`o .zip contém um caminho suspeito ("${nome}") e foi interrompido.`);
  }

  return destino;
}

function formatarTamanho(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function acharZipNaPasta() {
  const arquivos = fs
    .readdirSync(process.cwd())
    .filter((nome) => nome.toLowerCase().endsWith('.zip'));

  if (!arquivos.length) {
    falhar(
      'não encontrei nenhum .zip nesta pasta.\n' +
        '  Coloque este arquivo na mesma pasta do .zip ou informe o nome:\n' +
        '      node extrair-zip.js arquivo.zip'
    );
  }

  if (arquivos.length > 1) {
    falhar(
      `encontrei mais de um .zip nesta pasta: ${arquivos.join(', ')}.\n` +
        '  Informe qual extrair:\n' +
        '      node extrair-zip.js ' +
        arquivos[0]
    );
  }

  return arquivos[0];
}

function principal() {
  const argumentos = process.argv.slice(2);

  if (argumentos.includes('-h') || argumentos.includes('--ajuda')) {
    console.log(`
  Uso:
    node extrair-zip.js                     extrai o único .zip da pasta
    node extrair-zip.js arquivo.zip         extrai o arquivo indicado
    node extrair-zip.js arquivo.zip pasta   extrai para a pasta indicada
    node extrair-zip.js --listar [arquivo]  só lista o conteúdo
`);
    return;
  }

  const listar = argumentos.includes('--listar');
  const livres = argumentos.filter((item) => !item.startsWith('-'));

  const nomeZip = livres[0] || acharZipNaPasta();
  const caminhoZip = path.resolve(process.cwd(), nomeZip);

  if (!fs.existsSync(caminhoZip)) falhar(`não encontrei o arquivo "${nomeZip}".`);

  const buffer = fs.readFileSync(caminhoZip);
  const entradas = listarEntradas(buffer);

  if (listar) {
    console.log(`\n  Conteúdo de ${nomeZip} (${formatarTamanho(buffer.length)}):\n`);
    for (const entrada of entradas) {
      const marca = entrada.nome.endsWith('/') ? '[pasta]' : formatarTamanho(entrada.tamanhoOriginal);
      console.log(`    ${entrada.nome.padEnd(48)} ${marca}`);
    }
    console.log(`\n  ${entradas.length} item(ns).\n`);
    return;
  }

  const pastaDestino = path.resolve(
    process.cwd(),
    livres[1] ? livres[1] : path.basename(nomeZip, path.extname(nomeZip))
  );

  let arquivos = 0;
  let pastas = 0;
  let totalBytes = 0;

  console.log(`\n  Extraindo ${nomeZip} → ${pastaDestino}\n`);

  for (const entrada of entradas) {
    const destino = caminhoSeguro(pastaDestino, entrada.nome);

    if (entrada.nome.endsWith('/')) {
      fs.mkdirSync(destino, { recursive: true });
      pastas += 1;
      continue;
    }

    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, conteudoDaEntrada(buffer, entrada));

    // Preserva permissão de execução (scripts .sh)
    if (entrada.modo & 0o111) {
      try {
        fs.chmodSync(destino, entrada.modo);
      } catch (_) {
        // Windows não tem esse conceito — sem problema
      }
    }

    arquivos += 1;
    totalBytes += entrada.tamanhoOriginal;
    console.log(`    ✓ ${entrada.nome}`);
  }

  fs.mkdirSync(pastaDestino, { recursive: true });

  console.log(
    `\n  Pronto: ${arquivos} arquivo(s) e ${pastas} pasta(s), ${formatarTamanho(totalBytes)}.\n` +
      `  Onde: ${pastaDestino}\n`
  );
}

principal();
