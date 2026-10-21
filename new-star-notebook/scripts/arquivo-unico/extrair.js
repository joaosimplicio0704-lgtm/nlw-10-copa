/* ======================= extrair o projeto de volta ======================= */

/**
 * O arquivo único guarda o código-fonte e a interface embutidos.
 * Aqui eles voltam para uma pasta normal, com a mesma estrutura do projeto.
 */

function fonteDoModulo(nome) {
  const texto = String(MODULOS[nome]);
  const marca = 'function (require, module, exports) {';
  const posicao = texto.indexOf(marca);

  let corpo = posicao === -1 ? texto : texto.slice(posicao + marca.length);

  if (corpo.startsWith('\n')) corpo = corpo.slice(1);

  // Remove o fechamento da função que envolve o módulo
  if (corpo.endsWith('\n  }')) corpo = corpo.slice(0, -4);

  return corpo;
}

function extrairProjeto(destino) {
  const escritos = [];

  for (const nome of Object.keys(MODULOS)) {
    const arquivo = path.join(destino, nome);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, fonteDoModulo(nome));
    escritos.push(nome);
  }

  for (const [url, conteudo] of Object.entries(ARQUIVOS)) {
    const arquivo = path.join(destino, 'public', url);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, Buffer.from(conteudo.base64, 'base64'));
    escritos.push('public/' + url);
  }

  const pacote = {
    name: 'new-star-notebook',
    version: '2.0.1',
    private: true,
    description: 'New Star Notebook — extraído do arquivo único',
    scripts: {
      start: 'node server.js',
      dev: 'node --watch server.js',
      backup: 'node scripts/backup.js',
      test: 'node tests/smoke.js',
    },
    dependencies: {
      express: '^4.21.2',
      'sql.js': '^1.13.0',
    },
  };

  fs.writeFileSync(path.join(destino, 'package.json'), JSON.stringify(pacote, null, 2) + '\n');
  escritos.push('package.json');

  return escritos;
}

const argumentos = process.argv.slice(2);
const indiceExtrair = argumentos.indexOf('--extrair');

if (indiceExtrair !== -1) {
  const informado = argumentos[indiceExtrair + 1];
  const destino = path.resolve(
    process.cwd(),
    informado && !informado.startsWith('-') ? informado : 'new-star-notebook-extraido'
  );

  const escritos = extrairProjeto(destino);
  const relativo = path.relative(process.cwd(), destino) || '.';

  console.log('');
  console.log('  Projeto extraído em: ' + destino);
  console.log('  ' + escritos.length + ' arquivo(s) criados.');
  console.log('');
  console.log('  Para rodar:');
  console.log('    cd ' + relativo);
  console.log('    npm install');
  console.log('    npm start');
  console.log('');

  process.exit(0);
}
