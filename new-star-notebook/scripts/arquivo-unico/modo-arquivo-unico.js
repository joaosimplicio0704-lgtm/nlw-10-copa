/*
 * Ajustes de interface da versão de arquivo único.
 *
 * O sistema foi escrito para conversar com um servidor. Nesta versão quem
 * responde é o backend local (localStorage). Aqui só escondemos o que não faz
 * sentido sem servidor (backup .sqlite e nuvem) e explicamos onde os dados ficam.
 */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function painelDe(elemento) {
    return elemento ? elemento.closest('.painel') : null;
  }

  function esconder(elemento) {
    if (elemento) elemento.style.display = 'none';
  }

  function ajustar() {
    /* ---------- Backup: só .json ---------- */
    const btnSqlite = $('btn-baixar-sqlite');
    const btnJson = $('btn-baixar-json');

    esconder(btnSqlite);

    if (btnJson) {
      btnJson.textContent = 'Baixar backup (.json)';
      btnJson.classList.remove('btn-secundario');
      btnJson.classList.add('btn-primario');
    }

    const painelBackup = painelDe(btnJson);
    if (painelBackup) {
      const ajuda = painelBackup.querySelector('.texto-ajuda');
      if (ajuda) {
        ajuda.innerHTML =
          'O arquivo contém <strong>somente os dados desta conta</strong>, em <code>.json</code>. ' +
          'Nesta versão de arquivo único os dados ficam no navegador — guarde o backup fora do computador.';
      }
    }

    /* ---------- Restauração: aceita apenas .json ---------- */
    const entradaRestaurar = $('arquivo-restaurar');
    if (entradaRestaurar) entradaRestaurar.setAttribute('accept', '.json');

    const painelRestaurar = painelDe(entradaRestaurar);
    if (painelRestaurar) {
      const ajuda = painelRestaurar.querySelector('.texto-ajuda');
      if (ajuda) {
        ajuda.innerHTML =
          'Selecione um backup <code>.json</code>. A restauração <strong>substitui</strong> os dados atuais desta conta.';
      }
    }

    /* ---------- Nuvem: não existe sem servidor ---------- */
    esconder($('btn-enviar-nuvem'));
    esconder($('btn-restaurar-nuvem'));
    esconder($('nuvem-ultimo'));

    const statusNuvem = $('nuvem-status');
    if (statusNuvem) {
      statusNuvem.innerHTML =
        'O backup em nuvem (Supabase/WebDAV) precisa da <strong>versão com servidor</strong>. ' +
        'Nesta versão de arquivo único, use o backup <code>.json</code> ao lado.';
    }

    /* ---------- Aviso fixo no topo do sistema ---------- */
    const conteudo = document.querySelector('.conteudo');
    if (conteudo && !$('aviso-modo-unico')) {
      const aviso = document.createElement('div');
      aviso.id = 'aviso-modo-unico';
      aviso.className = 'aviso-legado no-print';

      const texto = document.createElement('span');
      texto.innerHTML =
        '<strong>Versão de arquivo único:</strong> os dados ficam neste navegador. ' +
        'Faça backup em <code>.json</code> na aba <strong>Backup e conta</strong>.';

      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'btn btn-fantasma btn-pequeno';
      botao.setAttribute('aria-label', 'Fechar aviso');
      botao.textContent = '×';
      botao.addEventListener('click', () => aviso.remove());

      aviso.append(texto, botao);
      conteudo.prepend(aviso);
    }

    /* ---------- Texto do rodapé do login ---------- */
    const rodape = document.querySelector('.auth-rodape');
    if (rodape) {
      rodape.textContent = 'New Star Notebook · v2.0.1 · arquivo único (dados neste navegador)';
    }

    const nota = document.querySelector('.auth-nota');
    if (nota) {
      nota.innerHTML =
        'Cada conta tem o seu próprio conjunto de dados.<br>' +
        'Nesta versão, tudo fica salvo neste navegador.';
    }

    /* ---------- aviso quando o navegador não deixa salvar ---------- */
    if (window.__newstarSemArmazenamento) {
      const painel = document.createElement('div');
      painel.className = 'aviso-legado no-print';
      painel.style.background = '#fee2e2';
      painel.style.borderColor = '#fca5a5';

      const span = document.createElement('span');
      span.innerHTML =
        '<strong>Atenção:</strong> este navegador não permitiu salvar dados neste arquivo. ' +
        'O sistema funciona, mas tudo some ao fechar a aba. Abra pelo Chrome, Edge ou Firefox.';

      painel.append(span);
      document.querySelector('.conteudo')?.prepend(painel);
    }

    document.title = 'New Star Notebook — arquivo único';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ajustar);
  } else {
    ajustar();
  }
})();
