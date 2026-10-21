'use strict';

/**
 * Gera a versão de arquivo único do sistema.
 *
 * Junta em UM arquivo .html:
 *   - o HTML da interface (public/index.html)
 *   - o CSS (public/style.css)
 *   - o backend local que responde /api/* usando localStorage
 *   - o html2pdf (para gerar PDF da OS)
 *   - o script da aplicação (public/script.js)
 *   - os ajustes de interface do modo arquivo único
 *
 * Uso: npm run html-unico
 * Saída: dist/new-star-notebook.html
 */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const publico = path.join(raiz, 'public');

const ler = (...partes) => fs.readFileSync(path.join(...partes), 'utf8');

/** Evita que um `</script>` dentro de string feche a tag antes da hora. */
const seguroParaTagScript = (codigo) => codigo.replace(/<\/script/gi, '<\\/script');

function principal() {
  let html = ler(publico, 'index.html');
  const css = ler(publico, 'style.css');
  const app = ler(publico, 'script.js');
  const html2pdf = ler(publico, 'vendor', 'html2pdf.bundle.min.js');
  const backend = ler(__dirname, 'arquivo-unico', 'backend-local.js');
  const modo = ler(__dirname, 'arquivo-unico', 'modo-arquivo-unico.js');

  // ---------- CSS ----------
  const tagCss = /<link rel="stylesheet" href="style\.css[^"]*">/;
  if (!tagCss.test(html)) throw new Error('Não encontrei a tag do style.css no index.html.');
  html = html.replace(tagCss, () => `<style>\n${css}\n</style>`);

  // ---------- html2pdf ----------
  const tagHtml2pdf = /<script src="vendor\/html2pdf\.bundle\.min\.js"[^>]*><\/script>/;
  if (!tagHtml2pdf.test(html)) throw new Error('Não encontrei a tag do html2pdf no index.html.');
  html = html.replace(
    tagHtml2pdf,
    () => `<script>/* html2pdf.js — embutido */\n${seguroParaTagScript(html2pdf)}\n</script>`
  );

  // ---------- backend local + aplicação + ajustes ----------
  const tagApp = /<script src="script\.js[^"]*"[^>]*><\/script>/;
  if (!tagApp.test(html)) throw new Error('Não encontrei a tag do script.js no index.html.');

  html = html.replace(
    tagApp,
    () =>
      `<script>/* Backend local (localStorage) — responde /api/* */\n${seguroParaTagScript(backend)}\n</script>\n` +
      `<script>/* Aplicação */\n${seguroParaTagScript(app)}\n</script>\n` +
      `<script>/* Ajustes do modo arquivo único */\n${seguroParaTagScript(modo)}\n</script>`
  );

  // ---------- comentário de cabeçalho ----------
  const aviso = `<!--
  New Star Notebook 2.0.1 — versão de ARQUIVO ÚNICO
  Gerado automaticamente por scripts/gerar-arquivo-unico.js em ${new Date().toISOString()}

  Como usar: abra este arquivo no navegador (dois cliques). Não precisa de
  Node.js, servidor ou internet. Os dados ficam no localStorage deste navegador.

  Contas de demonstração:
    ana@teste.com    senha12345   (com dados de exemplo)
    bruno@teste.com  senha12345   (vazia)

  Para recomeçar do zero: abra o console do navegador e rode
    NewStarArquivoUnico.zerar()
-->
`;

  // ---------- garantia de armazenamento ----------
  // Alguns navegadores bloqueiam localStorage quando o arquivo é aberto por
  // file://. Nesse caso usamos um armazenamento em memória para o sistema
  // funcionar (com o aviso de que os dados não serão mantidos ao fechar).
  const shim = `
(function () {
  try {
    window.localStorage.setItem('__newstar_teste__', '1');
    window.localStorage.removeItem('__newstar_teste__');
    return;
  } catch (_) {
    // segue para o armazenamento em memória
  }

  var dados = {};

  var memoria = {
    getItem: function (chave) { return Object.prototype.hasOwnProperty.call(dados, chave) ? dados[chave] : null; },
    setItem: function (chave, valor) { dados[chave] = String(valor); },
    removeItem: function (chave) { delete dados[chave]; },
    clear: function () { dados = {}; },
    key: function (indice) { return Object.keys(dados)[indice] || null; },
    get length() { return Object.keys(dados).length; }
  };

  try {
    Object.defineProperty(window, 'localStorage', { value: memoria, configurable: true });
  } catch (_) {
    window.localStorage = memoria;
  }

  window.__newstarSemArmazenamento = true;
})();
`;

  html = html.replace(
    '<!DOCTYPE html>',
    `<!DOCTYPE html>\n${aviso}\n<script>${seguroParaTagScript(shim)}</script>`
  );

  const pastaSaida = path.join(raiz, 'dist');
  fs.mkdirSync(pastaSaida, { recursive: true });

  const destino = path.join(pastaSaida, 'new-star-notebook.html');
  fs.writeFileSync(destino, html, 'utf8');

  const tamanho = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
  console.log(`\n  Arquivo único gerado: ${destino}`);
  console.log(`  Tamanho: ${tamanho} MB`);
  console.log('  Abra com dois cliques no navegador.\n');
}

principal();
