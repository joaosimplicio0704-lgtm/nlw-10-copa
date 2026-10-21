'use strict';

/**
 * Gera o pacote de download:
 *   download/new-star-notebook.html              (sistema em um HTML)
 *   download/new-star-notebook-servidor.js       (sistema em um .js)
 *   download/new-star-notebook-2.0.1.zip         (os dois + LEIA-ME)
 *   download/new-star-notebook-2.0.1-projeto.zip (projeto completo, sem node_modules)
 *
 * Uso: npm run pacote
 *
 * O .zip usa o comando `zip` do sistema quando existe. Se não existir,
 * os arquivos soltos são gerados do mesmo jeito e o zip é apenas avisado.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const saida = path.join(raiz, 'download');

function gerar(script) {
  console.log(`\n> ${script}`);
  execFileSync(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
    cwd: raiz,
  });
}

function compactar(arquivos, destino) {
  try {
    execFileSync('zip', ['-q', '-9', '-j', destino, ...arquivos], { cwd: saida });
    console.log(`\n  Pacote .zip: ${destino}`);
    return true;
  } catch (erro) {
    if (erro.code === 'ENOENT') {
      console.log(
        '\n  O comando "zip" não existe neste sistema. Os dois arquivos foram gerados ' +
          'e podem ser baixados separadamente na pasta download/.'
      );
    } else {
      console.error('\n  Não foi possível criar o .zip:', erro.message);
    }
    return false;
  }
}

gerar('gerar-arquivo-unico.js');
gerar('gerar-servidor-unico.js');

const nomes = ['new-star-notebook.html', 'new-star-notebook-servidor.js'];

if (fs.existsSync(path.join(saida, 'LEIA-ME.md'))) nomes.push('LEIA-ME.md');

fs.rmSync(path.join(saida, 'new-star-notebook-2.0.1.zip'), { force: true });
compactar(nomes, 'new-star-notebook-2.0.1.zip');

// Projeto completo (código-fonte separado, sem node_modules/dados/backups)
const itensProjeto = [
  'config.js',
  'lib',
  'public',
  'scripts',
  'tests',
  'legacy-versao-1',
  'server.js',
  'package.json',
  'package-lock.json',
  '.env.example',
  '.gitignore',
  'README.md',
  'ANALISE.md',
].filter((item) => fs.existsSync(path.join(raiz, item)));

const destinoProjeto = path.join(saida, 'new-star-notebook-2.0.1-projeto.zip');
fs.rmSync(destinoProjeto, { force: true });

try {
  execFileSync('zip', ['-q', '-9', '-r', destinoProjeto, ...itensProjeto], { cwd: raiz });
  console.log(`\n  Projeto completo: ${destinoProjeto}`);
} catch (erro) {
  if (erro.code !== 'ENOENT') {
    console.error('\n  Não foi possível criar o .zip do projeto:', erro.message);
  }
}

console.log('\n  Arquivos em download/:');
for (const nome of fs.readdirSync(saida).sort()) {
  const tamanho = (fs.statSync(path.join(saida, nome)).size / 1024 / 1024).toFixed(2);
  console.log(`    ${nome.padEnd(40)} ${tamanho} MB`);
}
console.log('');
