'use strict';

/* =========================================================================
   New Star Notebook — front-end
   -------------------------------------------------------------------------
   Organização:
     1. Utilidades (escape, datas, dinheiro, toast, diálogo, API)
     2. Estado e inicialização
     3. Autenticação (login / cadastro / saída)
     4. Carga de dados e renderização
     5. Navegação por abas
     6. Formulários de cadastro
     7. Ações nas tabelas
     8. Gerador de OS, documento e PDF
     9. Backup, nuvem e importação
   ========================================================================= */

/* ============================ 1. UTILIDADES ============================ */

const $ = (id) => document.getElementById(id);
const val = (id) => (($(id) && $(id).value) || '').trim();

/** Escapa texto para uso seguro em HTML (evita XSS armazenado). */
function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caractere) => {
    const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return mapa[caractere];
  });
}

/** Remove acentos e coloca em minúsculas para busca. */
function normalizarBusca(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hojeISO() {
  const agora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** "2026-10-21" -> "21/10/2026" (sem sofrer com fuso horário). */
function formatarData(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '—';
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return texto;
}

function formatarDataHora(valor) {
  if (!valor) return '—';
  const texto = String(valor).includes('T')
    ? String(valor)
    : `${String(valor).replace(' ', 'T')}Z`;
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return String(valor);
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Dias corridos desde uma data "YYYY-MM-DD" (comparação local, sem UTC). */
function diasDesde(valor) {
  const casamento = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!casamento) return 0;

  const entrada = new Date(Number(casamento[1]), Number(casamento[2]) - 1, Number(casamento[3]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return Math.floor((hoje - entrada) / 86400000);
}

/** "1.234,56" | "1234.56" | 1234.56 -> 123456 centavos */
function paraCentavos(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return Math.round(valor * 100);

  const limpo = String(valor ?? '').replace(/[^\d,.-]/g, '').trim();
  if (!limpo) return 0;

  let normalizado;

  if (limpo.includes(',')) {
    // Formato brasileiro: ponto é milhar, vírgula é decimal
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    // "1.600" ou "12.500" digitado como milhar
    normalizado = limpo.replace(/\./g, '');
  } else {
    normalizado = limpo;
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

function formatarBRL(centavos) {
  return (Number(centavos || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** "1 serviço" / "3 serviços" */
function quantidade(numero, singular, plural) {
  return `${numero} ${numero === 1 ? singular : plural}`;
}

function debounce(fn, atraso = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), atraso);
  };
}

function toast(mensagem, tipo = 'ok') {
  const elemento = document.createElement('div');
  elemento.className = `toast toast-${tipo}`;
  elemento.textContent = mensagem;
  $('toasts').append(elemento);

  setTimeout(() => elemento.classList.add('saindo'), 3400);
  setTimeout(() => elemento.remove(), 3900);
}

/** Diálogo de confirmação com Promise (substitui o confirm() do navegador). */
function confirmar(titulo, texto, rotulo = 'Confirmar') {
  return new Promise((resolver) => {
    const dialogo = $('dialogo-confirmar');
    $('dialogo-titulo').textContent = titulo;
    $('dialogo-texto').textContent = texto;
    $('dialogo-ok').textContent = rotulo;
    dialogo.returnValue = '';
    dialogo.showModal();

    dialogo.addEventListener(
      'close',
      () => resolver(dialogo.returnValue === 'confirmar'),
      { once: true }
    );
  });
}

async function comBotao(botao, textoOcupado, tarefa) {
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = textoOcupado;
  try {
    return await tarefa();
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

/* ================================ API ================================ */

const estado = {
  token: localStorage.getItem('newstar_token') || null,
  usuario: null,
  dados: {
    servicos: [],
    telefones: [],
    financeiro: [],
    pecas: [],
    notebooksLoja: [],
    osProntas: [],
  },
  totais: { devendo: 0, pago: 0, lancamentos: 0 },
  contagens: {},
  nuvem: { configurada: false, provedor: null, ultimoEnvio: null },
  auditoria: [],
  abaAtual: 'servicos',
  editandoNotebookId: null,
  editandoServicoId: null,
  editandoTelefoneId: null,
  editandoFinanceiroId: null,
  editandoPecaId: null,
  osEmEdicaoId: null,
};

async function api(metodo, caminho, corpo, { semAutenticacao = false } = {}) {
  const opcoes = { method: metodo, headers: {} };

  if (!semAutenticacao && estado.token) {
    opcoes.headers.Authorization = `Bearer ${estado.token}`;
  }

  if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }

  let resposta;
  try {
    resposta = await fetch(caminho, opcoes);
  } catch (_) {
    const erro = new Error('Sem conexão com o servidor. Verifique se ele está ligado.');
    erro.status = 0;
    throw erro;
  }

  let dados = null;
  try {
    dados = await resposta.json();
  } catch (_) {
    dados = null;
  }

  if (resposta.status === 401 && !semAutenticacao && estado.token) {
    encerrarSessaoLocal();
    const erro = new Error('Sua sessão expirou. Entre novamente.');
    erro.status = 401;
    throw erro;
  }

  if (!resposta.ok) {
    const erro = new Error((dados && dados.erro) || `Erro ${resposta.status}`);
    erro.status = resposta.status;
    throw erro;
  }

  return dados;
}

/* ======================== 2. ESTADO E INICIALIZAÇÃO ======================== */

function salvarSessao(resposta) {
  estado.token = resposta.token;
  estado.usuario = resposta.usuario;
  localStorage.setItem('newstar_token', resposta.token);
}

function encerrarSessaoLocal() {
  estado.token = null;
  estado.usuario = null;
  localStorage.removeItem('newstar_token');
  mostrarLogin();
}

function mostrarLogin() {
  $('tela-app').hidden = true;
  $('tela-auth').hidden = false;
  $('auth-msg').hidden = true;
  document.title = 'New Star Notebook — entrar';
}

function mostrarApp() {
  $('tela-auth').hidden = true;
  $('tela-app').hidden = false;
  document.title = 'New Star Notebook';
}

async function iniciar() {
  prepararDatas();

  if (!estado.token) {
    mostrarLogin();
    return;
  }

  try {
    await carregarDados();
    aplicarInterface();
    mostrarApp();
  } catch (erro) {
    if (erro.status !== 401) {
      toast(erro.message, 'erro');
    }
    mostrarLogin();
  }
}

function aplicarInterface() {
  const usuario = estado.usuario;

  $('usuario-nome').textContent = usuario.nome;
  $('usuario-empresa').textContent = usuario.empresa || usuario.email;

  $('conta-nome').textContent = usuario.nome;
  $('conta-empresa').textContent = usuario.empresa || '—';
  $('conta-email').textContent = usuario.email;
  $('conta-criada').textContent = formatarDataHora(usuario.criado_em);

  if (val('os-prestador-nome') === '' || val('os-prestador-nome') === 'New Star Notebook') {
    $('os-prestador-nome').value = usuario.empresa || 'New Star Notebook';
  }

  const abaDaUrl = location.hash.replace('#', '');
  if (abaDaUrl && $(abaDaUrl)) estado.abaAtual = abaDaUrl;

  renderizarTudo();
  configurarAvisoLegado();
  mostrarAba(estado.abaAtual, { atualizarHash: false });
}

function prepararDatas() {
  for (const id of ['srv-data', 'pec-data', 'os-data-entrada', 'oscl-data']) {
    if ($(id) && !$(id).value) $(id).value = hojeISO();
  }
}

/* ============================ AUTENTICAÇÃO ============================ */

function mostrarErroAuth(mensagem) {
  const elemento = $('auth-msg');
  elemento.textContent = mensagem;
  elemento.hidden = !mensagem;
}

function trocarAbaAuth(nome) {
  document.querySelectorAll('[data-auth-aba]').forEach((botao) => {
    const ativa = botao.dataset.authAba === nome;
    botao.classList.toggle('ativa', ativa);
    botao.setAttribute('aria-selected', String(ativa));
  });

  $('form-login').hidden = nome !== 'login';
  $('form-registro').hidden = nome !== 'registro';
  mostrarErroAuth('');
  document.title = nome === 'login' ? 'New Star Notebook — entrar' : 'New Star Notebook — criar conta';
}

async function aposAutenticar(resposta) {
  salvarSessao(resposta);
  await carregarDados();
  aplicarInterface();
  mostrarApp();
  toast(`Bem-vindo(a), ${resposta.usuario.nome.split(' ')[0]}!`);
}

async function entrarNoSistema(evento) {
  evento.preventDefault();
  mostrarErroAuth('');

  const email = val('login-email');
  const senha = $('login-senha').value;

  if (!email || !senha) {
    mostrarErroAuth('Preencha o e-mail e a senha.');
    return;
  }

  await comBotao($('btn-entrar'), 'Entrando…', async () => {
    try {
      const resposta = await api(
        'POST',
        '/api/auth/entrar',
        { email, senha },
        { semAutenticacao: true }
      );
      $('form-login').reset();
      await aposAutenticar(resposta);
    } catch (erro) {
      mostrarErroAuth(erro.message);
    }
  });
}

async function criarConta(evento) {
  evento.preventDefault();
  mostrarErroAuth('');

  const nome = val('reg-nome');
  const empresa = val('reg-empresa');
  const email = val('reg-email');
  const senha = $('reg-senha').value;
  const senha2 = $('reg-senha2').value;

  if (!nome || !email) {
    mostrarErroAuth('Preencha nome e e-mail.');
    return;
  }
  if (senha.length < 8) {
    mostrarErroAuth('A senha precisa ter pelo menos 8 caracteres.');
    return;
  }
  if (senha !== senha2) {
    mostrarErroAuth('As duas senhas não conferem.');
    return;
  }

  await comBotao($('btn-criar-conta'), 'Criando conta…', async () => {
    try {
      const resposta = await api(
        'POST',
        '/api/auth/registrar',
        { nome, empresa, email, senha },
        { semAutenticacao: true }
      );
      $('form-registro').reset();
      trocarAbaAuth('login');
      await aposAutenticar(resposta);
    } catch (erro) {
      mostrarErroAuth(erro.message);
    }
  });
}

async function sair() {
  try {
    if (estado.token) await api('POST', '/api/auth/sair');
  } catch (_) {
    // se falhar, encerra localmente de qualquer forma
  }
  encerrarSessaoLocal();
  toast('Você saiu da conta.');
}

/* ======================= 3. CARGA E RENDERIZAÇÃO ======================= */

async function carregarDados() {
  const dados = await api('GET', '/api/dados');

  estado.usuario = dados.usuario;
  estado.dados = {
    servicos: dados.servicos || [],
    telefones: dados.telefones || [],
    financeiro: dados.financeiro || [],
    pecas: dados.pecas || [],
    notebooksLoja: dados.notebooksLoja || [],
    osProntas: dados.osProntas || [],
  };
  estado.totais = dados.totais || { devendo: 0, pago: 0, lancamentos: 0 };
  estado.contagens = dados.contagens || {};
  estado.nuvem = dados.nuvem || { configurada: false };
  estado.auditoria = dados.auditoria || [];
}

function renderizarTudo() {
  renderizarServicos();
  renderizarTelefones();
  renderizarFinanceiro();
  renderizarPecas();
  renderizarOSProntas();
  renderizarNotebooks();
  renderizarAuditoria();
  renderizarBackupInfo();
  renderizarContadores();
}

function renderizarContadores() {
  const d = estado.dados;

  const emAndamento = d.servicos.filter((servico) => servico.status === 'Em andamento').length;

  $('contador-servicos').textContent = `${quantidade(
    d.servicos.length,
    'serviço',
    'serviços'
  )} · ${emAndamento} em andamento`;
  $('contador-telefones').textContent = quantidade(d.telefones.length, 'contato', 'contatos');
  $('contador-financeiro').textContent = quantidade(
    d.financeiro.length,
    'lançamento',
    'lançamentos'
  );
  $('contador-pecas').textContent = quantidade(d.pecas.length, 'peça', 'peças');
  $('contador-os').textContent = `${quantidade(d.osProntas.length, 'OS salva', 'OS salvas')}`;
  $('contador-notebooks').textContent = `${quantidade(
    d.notebooksLoja.length,
    'notebook',
    'notebooks'
  )} no estoque`;
}

function opcoesStatus(lista, atual) {
  return lista
    .map(
      (status) =>
        `<option value="${esc(status)}" ${status === atual ? 'selected' : ''}>${esc(status)}</option>`
    )
    .join('');
}

function classeStatusServico(servico) {
  const atrasado = servico.status === 'Em andamento' && diasDesde(servico.data) > 5;
  if (atrasado) return 'status-atrasado';
  if (servico.status === 'Pronto') return 'status-pronto';
  if (servico.status === 'Entregue') return 'status-entregue';
  return 'status-em-andamento';
}

function filtrar(lista, termo, campos) {
  const busca = normalizarBusca(termo);
  if (!busca) return lista;
  return lista.filter((item) =>
    normalizarBusca(campos.map((campo) => item[campo] ?? '').join(' ')).includes(busca)
  );
}

function renderizarServicos() {
  const tbody = $('tabela-servicos-body');
  if (!tbody) return;

  const lista = filtrar(estado.dados.servicos, val('busca-servicos'), [
    'nome',
    'num',
    'notebook',
    'descricao',
    'local',
    'status',
  ]);

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="vazio">${
      estado.dados.servicos.length ? 'Nenhum serviço encontrado para essa busca.' : 'Nenhum serviço cadastrado ainda.'
    }</td></tr>`;
    return;
  }

  tbody.innerHTML = lista
    .map((servico) => {
      const atrasado = servico.status === 'Em andamento' && diasDesde(servico.data) > 5;

      return `
        <tr>
          <td><strong>${esc(servico.nome)}</strong></td>
          <td>${esc(servico.num)}</td>
          <td>
            <select class="status-select ${classeStatusServico(servico)}"
                    data-acao="status" data-entidade="servicos" data-id="${servico.id}"
                    aria-label="Status de ${esc(servico.nome)}">
              ${opcoesStatus(['Em andamento', 'Pronto', 'Entregue'], servico.status)}
            </select>
            ${atrasado ? '<span class="status-extra" title="Mais de 5 dias em andamento">⚠</span>' : ''}
          </td>
          <td>${esc(servico.notebook)}</td>
          <td>${esc(servico.cfont || '—')}</td>
          <td>${esc(servico.cmaleta || '—')}</td>
          <td>${formatarData(servico.data)}</td>
          <td class="celula-desc">${esc(servico.descricao || '—')}</td>
          <td>${esc(servico.local || '—')}</td>
          <td>
            <div class="celula-acoes">
              <button type="button" class="btn-acao" data-acao="editar-servico" data-id="${servico.id}">Editar</button>
              <button type="button" class="btn-acao" data-acao="os-cliente" data-id="${servico.id}">OS</button>
              <button type="button" class="btn-acao perigo" data-acao="excluir" data-entidade="servicos" data-id="${servico.id}">Excluir</button>
            </div>
          </td>
        </tr>`;
    })
    .join('');
}

function renderizarTelefones() {
  const tbody = $('tabela-telefones-body');
  if (!tbody) return;

  const lista = filtrar(estado.dados.telefones, val('busca-telefones'), ['nome', 'tel1', 'tel2']);

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="vazio">${
      estado.dados.telefones.length ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado ainda.'
    }</td></tr>`;
    return;
  }

  tbody.innerHTML = lista
    .map(
      (contato) => `
      <tr>
        <td><strong>${esc(contato.nome)}</strong></td>
        <td>${esc(contato.tel1)}</td>
        <td>${esc(contato.tel2 || '—')}</td>
        <td>
          <div class="celula-acoes">
            <button type="button" class="btn-acao" data-acao="editar-telefone" data-id="${contato.id}">Editar</button>
            <button type="button" class="btn-acao perigo" data-acao="excluir" data-entidade="telefones" data-id="${contato.id}">Excluir</button>
          </div>
        </td>
      </tr>`
    )
    .join('');
}

function renderizarFinanceiro() {
  const tbody = $('tabela-financeiro-body');
  if (tbody) {
    const lista = filtrar(estado.dados.financeiro, val('busca-financeiro'), [
      'nome',
      'notebook',
      'referente',
      'status',
    ]);

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="vazio">${
        estado.dados.financeiro.length
          ? 'Nenhum lançamento encontrado.'
          : 'Nenhum lançamento cadastrado ainda.'
      }</td></tr>`;
    } else {
      tbody.innerHTML = lista
        .map(
          (item) => `
          <tr>
            <td><strong>${esc(item.nome)}</strong></td>
            <td>
              <select class="status-select ${item.status === 'PAGO' ? 'status-pago' : 'status-devedor'}"
                      data-acao="status" data-entidade="financeiro" data-id="${item.id}"
                      aria-label="Status do lançamento de ${esc(item.nome)}">
                ${opcoesStatus(['DEVENDO', 'PAGO'], item.status)}
              </select>
            </td>
            <td><strong>${formatarBRL(item.valor_centavos)}</strong></td>
            <td>${esc(item.notebook || '—')}</td>
            <td>${esc(item.referente || '—')}</td>
            <td>
              <div class="celula-acoes">
                <button type="button" class="btn-acao" data-acao="editar-financeiro" data-id="${item.id}">Editar</button>
                <button type="button" class="btn-acao perigo" data-acao="excluir" data-entidade="financeiro" data-id="${item.id}">Excluir</button>
              </div>
            </td>
          </tr>`
        )
        .join('');
    }
  }

  $('total-devendo').textContent = formatarBRL(estado.totais.devendo);
  $('total-pago').textContent = formatarBRL(estado.totais.pago);
}

function renderizarPecas() {
  const tbody = $('tabela-pecas-body');
  if (!tbody) return;

  const lista = filtrar(estado.dados.pecas, val('busca-pecas'), ['cliente', 'item', 'status']);

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="vazio">${
      estado.dados.pecas.length ? 'Nenhuma peça encontrada.' : 'Nenhuma peça cadastrada ainda.'
    }</td></tr>`;
    return;
  }

  tbody.innerHTML = lista
    .map(
      (peca) => `
      <tr>
        <td>${esc(peca.cliente)}</td>
        <td>${esc(peca.item)}</td>
        <td>${formatarData(peca.data)}</td>
        <td>
          <select class="status-select ${peca.status === 'Devolvido' ? 'status-devolvido' : 'status-devedor'}"
                  data-acao="status" data-entidade="pecas" data-id="${peca.id}"
                  aria-label="Status da peça ${esc(peca.item)}">
            ${opcoesStatus(['Não devolvido', 'Devolvido'], peca.status)}
          </select>
        </td>
        <td>
          <div class="celula-acoes">
            <button type="button" class="btn-acao" data-acao="editar-peca" data-id="${peca.id}">Editar</button>
            <button type="button" class="btn-acao perigo" data-acao="excluir" data-entidade="pecas" data-id="${peca.id}">Excluir</button>
          </div>
        </td>
      </tr>`
    )
    .join('');
}

function renderizarOSProntas() {
  const tbody = $('tabela-os-body');
  if (!tbody) return;

  const lista = filtrar(estado.dados.osProntas, val('busca-os'), [
    'cliente',
    'numero',
    'equipamento',
  ]);

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="vazio">${
      estado.dados.osProntas.length ? 'Nenhuma OS encontrada.' : 'Nenhuma OS salva ainda.'
    }</td></tr>`;
    return;
  }

  tbody.innerHTML = lista
    .map((os) => {
      const detalhes = os.detalhes || {};
      return `
        <tr>
          <td><strong>${esc(os.cliente)}</strong></td>
          <td>${esc(os.numero)}</td>
          <td>${esc(os.equipamento || '—')}</td>
          <td>${formatarData(os.data)}</td>
          <td class="celula-desc">${esc(detalhes.servicoExec || '—')}</td>
          <td class="celula-desc">${esc(detalhes.itens || '—')}</td>
          <td>
            <div class="celula-acoes">
              <button type="button" class="btn-acao" data-acao="ver-os" data-id="${os.id}">Ver</button>
              <button type="button" class="btn-acao" data-acao="pdf-os" data-id="${os.id}">PDF</button>
              <button type="button" class="btn-acao perigo" data-acao="excluir" data-entidade="os" data-id="${os.id}">Excluir</button>
            </div>
          </td>
        </tr>`;
    })
    .join('');
}

function armazenamentoNotebook(nb) {
  const partes = [];
  if (nb.nvme) partes.push(`NVME: ${nb.nvme}`);
  if (nb.ssd) partes.push(`SSD: ${nb.ssd}`);
  return partes.join(' / ') || '—';
}

function renderizarNotebooks() {
  const tbody = $('tabela-notebooks-body');
  const tbodyRelatorio = $('tabela-relatorio-estoque-body');

  const lista = filtrar(estado.dados.notebooksLoja, val('busca-notebooks'), [
    'notebook',
    'modelo',
    'processador',
    'memoria',
    'status',
  ]);

  if (tbody) {
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="vazio">${
        estado.dados.notebooksLoja.length
          ? 'Nenhum notebook encontrado.'
          : 'Nenhum notebook cadastrado ainda.'
      }</td></tr>`;
    } else {
      tbody.innerHTML = lista
        .map(
          (nb) => `
          <tr>
            <td><strong>${esc(nb.notebook)}</strong></td>
            <td>${esc(nb.modelo)}</td>
            <td>${esc(nb.processador || '—')}</td>
            <td>${esc(nb.memoria || '—')}</td>
            <td>${esc(armazenamentoNotebook(nb))}</td>
            <td>${esc(nb.preco || '—')}</td>
            <td>
              <select class="status-select status-${normalizarBusca(nb.status).replace(/\s+/g, '-')}"
                      data-acao="status" data-entidade="notebooks_loja" data-id="${nb.id}"
                      aria-label="Situação do notebook ${esc(nb.notebook)} ${esc(nb.modelo)}">
                ${opcoesStatus(['Disponível', 'Reservado', 'Vendido'], nb.status)}
              </select>
            </td>
            <td>
              <div class="celula-acoes">
                <button type="button" class="btn-acao" data-acao="editar-notebook" data-id="${nb.id}">Editar</button>
                <button type="button" class="btn-acao" data-acao="etiqueta" data-id="${nb.id}">Cartão</button>
                <button type="button" class="btn-acao perigo" data-acao="excluir" data-entidade="notebooks_loja" data-id="${nb.id}">Excluir</button>
              </div>
            </td>
          </tr>`
        )
        .join('');
    }
  }

  if (tbodyRelatorio) {
    tbodyRelatorio.innerHTML = estado.dados.notebooksLoja
      .map(
        (nb) => `
        <tr>
          <td><strong>${esc(nb.notebook)}</strong></td>
          <td>${esc(nb.modelo)}</td>
          <td>${esc(nb.processador || '—')}</td>
          <td>${esc(nb.memoria || '—')}</td>
          <td>${esc(nb.tela || '—')}</td>
          <td>${esc(armazenamentoNotebook(nb))}</td>
          <td>${esc(nb.preco || '—')}</td>
          <td>${esc(nb.status || '—')}</td>
        </tr>`
      )
      .join('');
  }
}

function renderizarAuditoria() {
  const lista = $('lista-auditoria');
  if (!lista) return;

  if (!estado.auditoria.length) {
    lista.innerHTML = '<li>Nenhuma ação registrada ainda.</li>';
    return;
  }

  lista.innerHTML = estado.auditoria
    .map(
      (item) => `
      <li>
        ${esc(item.descricao || item.entidade)}
        <time datetime="${esc(item.criado_em)}">${formatarDataHora(item.criado_em)}</time>
      </li>`
    )
    .join('');
}

function renderizarBackupInfo() {
  const nuvemInfo = estado.nuvem || {};

  $('nuvem-status').textContent = nuvemInfo.configurada
    ? `Nuvem configurada (${nuvemInfo.nome}). O envio guarda uma cópia do banco desta conta.`
    : nuvemInfo.instrucao ||
      'A nuvem não está configurada. Você ainda pode baixar o arquivo do banco.';

  $('nuvem-ultimo').textContent = nuvemInfo.ultimoEnvio
    ? `Último envio: ${formatarDataHora(nuvemInfo.ultimoEnvio)}`
    : 'Nenhum envio para a nuvem ainda.';

  $('btn-enviar-nuvem').disabled = !nuvemInfo.configurada;
  $('btn-restaurar-nuvem').disabled = !nuvemInfo.configurada;

  const total =
    estado.dados.servicos.length +
    estado.dados.telefones.length +
    estado.dados.financeiro.length +
    estado.dados.pecas.length +
    estado.dados.notebooksLoja.length +
    estado.dados.osProntas.length;

  $('info-registros').textContent = `${quantidade(total, 'registro', 'registros')} nesta conta — serviços, contatos, financeiro, peças, estoque e OS.`;
}

/* =========================== 4. NAVEGAÇÃO =========================== */

function mostrarAba(nome, { atualizarHash = true } = {}) {
  const alvo = $(nome);
  if (!alvo) nome = 'servicos';

  document.querySelectorAll('.aba-conteudo').forEach((secao) => {
    const ativa = secao.id === nome;
    secao.hidden = !ativa;
    secao.classList.toggle('ativa', ativa);
  });

  document.querySelectorAll('.aba').forEach((botao) => {
    const ativa = botao.dataset.aba === nome;
    botao.classList.toggle('ativa', ativa);
    if (ativa) botao.setAttribute('aria-current', 'page');
    else botao.removeAttribute('aria-current');
  });

  estado.abaAtual = nome;

  if (atualizarHash) {
    history.replaceState(null, '', `#${nome}`);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ========================== 5. FORMULÁRIOS ========================== */

function mensagemErro(erro) {
  toast(erro.message || 'Não foi possível salvar.', 'erro');
}

async function recarregarERenderizar() {
  await carregarDados();
  renderizarTudo();
  aplicarInterfaceUsuario();
}

function aplicarInterfaceUsuario() {
  if (!estado.usuario) return;
  $('usuario-nome').textContent = estado.usuario.nome;
  $('usuario-empresa').textContent = estado.usuario.empresa || estado.usuario.email;
}

async function salvarServico(evento) {
  evento.preventDefault();
  const formulario = $('form-servico');

  if (!formulario.reportValidity()) return;

  const editandoId = estado.editandoServicoId;
  const servico = {
    nome: val('srv-nome'),
    num: val('srv-num'),
    status: $('srv-status').value,
    notebook: val('srv-notebook'),
    cfont: $('srv-cfont').value,
    cmaleta: $('srv-cmaleta').value,
    descricao: val('srv-desc'),
    data: val('srv-data'),
    local: val('srv-local'),
  };

  try {
    await comBotao($('btn-salvar-servico'), 'Salvando…', async () => {
      if (editandoId) await api('PUT', `/api/servicos/${editandoId}`, servico);
      else await api('POST', '/api/servicos', servico);
    });

    cancelarEdicaoServico();
    toast(editandoId ? 'Serviço atualizado.' : 'Serviço cadastrado.');
    await recarregarERenderizar();
  } catch (erro) {
    mensagemErro(erro);
  }
}

async function salvarTelefone(evento) {
  evento.preventDefault();
  const formulario = $('form-telefone');
  if (!formulario.reportValidity()) return;

  const editandoId = estado.editandoTelefoneId;
  const contato = {
    nome: val('tel-nome'),
    tel1: val('tel-1'),
    tel2: val('tel-2'),
  };

  try {
    await comBotao($('btn-salvar-telefone'), 'Salvando…', async () => {
      if (editandoId) await api('PUT', `/api/telefones/${editandoId}`, contato);
      else await api('POST', '/api/telefones', contato);
    });

    cancelarEdicaoTelefone();
    toast(editandoId ? 'Contato atualizado.' : 'Contato cadastrado.');
    await recarregarERenderizar();
  } catch (erro) {
    mensagemErro(erro);
  }
}

async function salvarFinanceiro(evento) {
  evento.preventDefault();
  const formulario = $('form-financeiro');
  if (!formulario.reportValidity()) return;

  const valorCentavos = paraCentavos(val('fin-valor'));
  if (valorCentavos <= 0) {
    toast('Informe um valor maior que zero.', 'erro');
    return;
  }

  const editandoId = estado.editandoFinanceiroId;
  const lancamento = {
    nome: val('fin-nome'),
    status: $('fin-status').value,
    valor_centavos: valorCentavos,
    notebook: val('fin-notebook'),
    referente: val('fin-referente'),
  };

  try {
    await comBotao($('btn-salvar-financeiro'), 'Salvando…', async () => {
      if (editandoId) await api('PUT', `/api/financeiro/${editandoId}`, lancamento);
      else await api('POST', '/api/financeiro', lancamento);
    });

    cancelarEdicaoFinanceiro();
    toast(editandoId ? 'Lançamento atualizado.' : 'Lançamento cadastrado.');
    await recarregarERenderizar();
  } catch (erro) {
    mensagemErro(erro);
  }
}

async function salvarPeca(evento) {
  evento.preventDefault();
  const formulario = $('form-pecas');
  if (!formulario.reportValidity()) return;

  const editandoId = estado.editandoPecaId;
  const peca = {
    cliente: val('pec-cliente'),
    item: val('pec-item'),
    data: val('pec-data'),
    status: $('pec-status').value,
  };

  try {
    await comBotao($('btn-salvar-peca'), 'Salvando…', async () => {
      if (editandoId) await api('PUT', `/api/pecas/${editandoId}`, peca);
      else await api('POST', '/api/pecas', peca);
    });

    cancelarEdicaoPeca();
    toast(editandoId ? 'Peça atualizada.' : 'Peça cadastrada.');
    await recarregarERenderizar();
  } catch (erro) {
    mensagemErro(erro);
  }
}

async function salvarNotebook(evento) {
  evento.preventDefault();
  const formulario = $('form-notebook');
  if (!formulario.reportValidity()) return;

  const notebook = {
    notebook: val('nb-notebook'),
    modelo: val('nb-modelo'),
    processador: val('nb-processador'),
    memoria: val('nb-memoria'),
    tela: val('nb-tela'),
    bateria: val('nb-bateria'),
    nvme: val('nb-nvme'),
    ssd: val('nb-ssd'),
    video: val('nb-video'),
    preco: val('nb-preco'),
    status: $('nb-status').value,
  };

  const botao = $('btn-salvar-nb');
  const editando = Boolean(estado.editandoNotebookId);

  try {
    await comBotao(botao, 'Salvando…', async () => {
      if (editando) {
        await api('PUT', `/api/notebooks_loja/${estado.editandoNotebookId}`, notebook);
      } else {
        await api('POST', '/api/notebooks_loja', notebook);
      }
    });

    cancelarEdicaoNotebook();
    toast(editando ? 'Notebook atualizado.' : 'Notebook cadastrado.');
    await recarregarERenderizar();
  } catch (erro) {
    mensagemErro(erro);
  }
}

function editarNotebook(id) {
  const notebook = estado.dados.notebooksLoja.find((item) => item.id === id);
  if (!notebook) return;

  estado.editandoNotebookId = id;

  $('nb-notebook').value = notebook.notebook || '';
  $('nb-modelo').value = notebook.modelo || '';
  $('nb-processador').value = notebook.processador || '';
  $('nb-memoria').value = notebook.memoria || '';
  $('nb-tela').value = notebook.tela || '';
  $('nb-bateria').value = notebook.bateria || '';
  $('nb-nvme').value = notebook.nvme || '';
  $('nb-ssd').value = notebook.ssd || '';
  $('nb-video').value = notebook.video || '';
  $('nb-preco').value = notebook.preco || '';
  $('nb-status').value = notebook.status || 'Disponível';

  $('titulo-form-notebook').textContent = 'Editar notebook';
  $('btn-salvar-nb').textContent = 'Atualizar notebook';
  $('btn-cancelar-nb').hidden = false;

  $('form-notebook').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('nb-notebook').focus({ preventScroll: true });
}

function cancelarEdicaoNotebook() {
  estado.editandoNotebookId = null;
  $('form-notebook').reset();
  $('nb-status').value = 'Disponível';

  $('titulo-form-notebook').textContent = 'Cadastrar notebook';
  $('btn-salvar-nb').textContent = 'Salvar notebook';
  $('btn-cancelar-nb').hidden = true;
}

/* ======================= 6. AÇÕES NAS TABELAS ======================= */

async function excluirRegistro(entidade, id, rotulo) {
  const confirmou = await confirmar(
    'Excluir registro',
    `Deseja realmente excluir ${rotulo}? Essa ação não pode ser desfeita.`,
    'Excluir'
  );
  if (!confirmou) return;

  try {
    await api('DELETE', `/api/${entidade}/${id}`);
    toast('Registro excluído.');
    await recarregarERenderizar();
  } catch (erro) {
    mensagemErro(erro);
  }
}

async function alterarStatus(select) {
  const { entidade, id } = select.dataset;

  try {
    await api('PATCH', `/api/${entidade}/${id}/status`, { status: select.value });
    toast('Status atualizado.');
  } catch (erro) {
    mensagemErro(erro);
  }

  await recarregarERenderizar();
}

function textoRotuloRegistro(entidade, id) {
  const mapa = {
    servicos: () => {
      const item = estado.dados.servicos.find((registro) => registro.id === id);
      return item ? `o serviço da OS ${item.num} de ${item.nome}` : 'este serviço';
    },
    telefones: () => {
      const item = estado.dados.telefones.find((registro) => registro.id === id);
      return item ? `o contato de ${item.nome}` : 'este contato';
    },
    financeiro: () => {
      const item = estado.dados.financeiro.find((registro) => registro.id === id);
      return item ? `o lançamento de ${item.nome}` : 'este lançamento';
    },
    pecas: () => {
      const item = estado.dados.pecas.find((registro) => registro.id === id);
      return item ? `a peça "${item.item}"` : 'esta peça';
    },
    notebooks_loja: () => {
      const item = estado.dados.notebooksLoja.find((registro) => registro.id === id);
      return item ? `o notebook ${item.notebook} ${item.modelo}` : 'este notebook';
    },
    os: () => {
      const item = estado.dados.osProntas.find((registro) => registro.id === id);
      return item ? `a OS ${item.numero} de ${item.cliente}` : 'esta OS';
    },
  };

  return (mapa[entidade] || (() => 'este registro'))();
}

/* ================== 7. GERADOR DE OS / DOCUMENTO / PDF ================== */

function coletarOS() {
  return {
    numero: val('os-numero'),
    cliente: val('os-cliente-nome'),
    equipamento: val('os-equipamento'),
    data: val('os-data-entrada'),
    detalhes: {
      prestadorNome: val('os-prestador-nome'),
      prestadorDoc: val('os-prestador-doc'),
      prestadorTel: val('os-prestador-tel'),
      prestadorEmail: val('os-prestador-email'),
      clienteTel: val('os-cliente-tel'),
      clienteEnd: val('os-cliente-end'),
      dataPrevisao: val('os-data-previsao'),
      garantia: val('os-garantia'),
      problema: val('os-problema'),
      servicoExec: val('os-servico-exec'),
      itens: val('os-itens'),
      obs: val('os-obs'),
    },
  };
}

function preencherFormularioOS(os) {
  const d = os.detalhes || {};

  $('os-numero').value = os.numero || '';
  $('os-cliente-nome').value = os.cliente || '';
  $('os-equipamento').value = os.equipamento || '';
  $('os-data-entrada').value = os.data || '';

  $('os-prestador-nome').value = d.prestadorNome || estado.usuario?.empresa || 'New Star Notebook';
  $('os-prestador-doc').value = d.prestadorDoc || '';
  $('os-prestador-tel').value = d.prestadorTel || '';
  $('os-prestador-email').value = d.prestadorEmail || '';
  $('os-cliente-tel').value = d.clienteTel || '';
  $('os-cliente-end').value = d.clienteEnd || '';
  $('os-data-previsao').value = d.dataPrevisao || '';
  $('os-garantia').value = d.garantia || '30 dias';
  $('os-problema').value = d.problema || '';
  $('os-servico-exec').value = d.servicoExec || '';
  $('os-itens').value = d.itens || '';
  $('os-obs').value = d.obs || '';

  estado.osEmEdicaoId = os.id || null;
  $('status-os-editando').textContent = os.id ? `Editando a OS nº ${os.numero}` : '';
}

function limparFormularioOS() {
  $('form-gerador-os').reset();
  $('os-data-entrada').value = hojeISO();
  $('os-prestador-nome').value = estado.usuario?.empresa || 'New Star Notebook';
  $('os-garantia').value = '30 dias';
  estado.osEmEdicaoId = null;
  $('status-os-editando').textContent = '';
}

function campoDoc(rotulo, valor, { largo = false } = {}) {
  const conteudo = valor && String(valor).trim() ? esc(valor) : '—';
  return `<div class="doc-campo"${largo ? ' style="flex:1 1 100%"' : ''}>
    <span>${esc(rotulo)}</span><strong>${conteudo}</strong>
  </div>`;
}

function montarDocumentoOS(os) {
  const d = os.detalhes || {};
  const dataEntrada = formatarData(os.data);
  const previsao = d.dataPrevisao ? formatarData(d.dataPrevisao) : '—';

  return `
    <div class="doc">
      <div class="doc-cabecalho">
        <div class="doc-marca">
          ${esc(d.prestadorNome || 'NEW STAR NOTEBOOK')}
          <small>ASSISTÊNCIA TÉCNICA DE NOTEBOOKS</small>
        </div>
        <div class="doc-titulo">
          <h1>ORDEM DE SERVIÇO</h1>
          <div class="doc-numero">Nº <strong>${esc(os.numero)}</strong></div>
        </div>
      </div>

      <div class="doc-secao">
        <h2>Prestador</h2>
        <div class="doc-linha">
          ${campoDoc('Nome / empresa', d.prestadorNome)}
          ${campoDoc('CPF / CNPJ', d.prestadorDoc)}
          ${campoDoc('Telefone', d.prestadorTel)}
          ${campoDoc('E-mail', d.prestadorEmail)}
        </div>
      </div>

      <div class="doc-secao">
        <h2>Cliente</h2>
        <div class="doc-linha">
          ${campoDoc('Nome', os.cliente, { largo: true })}
          ${campoDoc('Telefone', d.clienteTel)}
          ${campoDoc('Endereço', d.clienteEnd, { largo: true })}
        </div>
      </div>

      <div class="doc-secao">
        <h2>Equipamento e serviço</h2>
        <div class="doc-linha">
          ${campoDoc('Equipamento', os.equipamento, { largo: true })}
          ${campoDoc('Data de entrada', dataEntrada)}
          ${campoDoc('Previsão de entrega', previsao)}
          ${campoDoc('Garantia', d.garantia || '—')}
        </div>
      </div>

      <div class="doc-secao">
        <h2>Problema relatado pelo cliente</h2>
        <div class="doc-texto">${esc(d.problema || '—')}</div>
      </div>

      <div class="doc-secao">
        <h2>Serviço executado / diagnóstico</h2>
        <div class="doc-texto">${esc(d.servicoExec || '—')}</div>
      </div>

      <div class="doc-secao">
        <h2>Itens, peças e valores</h2>
        <table class="doc-tabela">
          <thead><tr><th>Descrição do item / serviço e valor total</th></tr></thead>
          <tbody><tr><td>${esc(d.itens || '—')}</td></tr></tbody>
        </table>
      </div>

      <div class="doc-secao">
        <h2>Observações / condições de pagamento</h2>
        <div class="doc-texto">${esc(d.obs || '—')}</div>
      </div>

      <div class="doc-assinatura">
        <div>Assinatura do cliente</div>
        <div>${esc(d.prestadorNome || 'New Star Notebook')} — responsável técnico</div>
      </div>

      <div class="doc-rodape">
        Documento gerado pelo sistema New Star Notebook em ${formatarDataHora(new Date().toISOString())}.
        A garantia cobre apenas o serviço descrito acima e não cobre mau uso, quedas ou contato com líquidos.
      </div>
    </div>`;
}

function nomeArquivoOS(os) {
  const cliente = String(os.cliente || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `OS-${String(os.numero || 'sem-numero').replace(/[^a-zA-Z0-9-]/g, '')}-${cliente}.pdf`;
}

async function baixarPDFDocumento(nomeArquivo) {
  const elemento = $('documento-os');

  if (typeof window.html2pdf !== 'function') {
    toast('A biblioteca de PDF não carregou. Use a opção Imprimir.', 'erro');
    return;
  }

  document.body.classList.add('gerando-pdf');

  try {
    await window
      .html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: nomeArquivo,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(elemento)
      .save();

    toast('PDF gerado.');
  } catch (erro) {
    console.error(erro);
    toast('Não foi possível gerar o PDF. Use a opção Imprimir.', 'erro');
  } finally {
    document.body.classList.remove('gerando-pdf');
  }
}

function imprimir(classe) {
  document.body.classList.add(classe);

  const remover = () => document.body.classList.remove(classe);
  window.addEventListener('afterprint', remover, { once: true });

  // fallback para navegadores que não disparam afterprint
  setTimeout(remover, 60000);

  window.print();
}

async function salvarOSEBaixarPDF() {
  const formulario = $('form-gerador-os');
  if (!formulario.reportValidity()) {
    toast('Preencha os campos obrigatórios da OS.', 'erro');
    return;
  }

  const os = coletarOS();
  const botao = $('btn-salvar-os');

  await comBotao(botao, 'Salvando…', async () => {
    try {
      const resposta = await api('POST', '/api/os', os);
      estado.osEmEdicaoId = resposta.id;
      $('status-os-editando').textContent = `OS nº ${resposta.numero} salva`;

      $('documento-os').innerHTML = montarDocumentoOS(os);
      await baixarPDFDocumento(nomeArquivoOS(os));

      toast(resposta.atualizado ? 'OS atualizada e PDF gerado.' : 'OS salva e PDF gerado.');
      await recarregarERenderizar();
    } catch (erro) {
      mensagemErro(erro);
    }
  });
}

function imprimirOS() {
  const formulario = $('form-gerador-os');
  if (!formulario.reportValidity()) {
    toast('Preencha os campos obrigatórios da OS.', 'erro');
    return;
  }

  $('documento-os').innerHTML = montarDocumentoOS(coletarOS());
  imprimir('imprimindo-documento');
}

async function verOS(id) {
  const os = estado.dados.osProntas.find((item) => item.id === id);
  if (!os) return;

  preencherFormularioOS(os);
  mostrarAba('gerador-os');
  toast(`OS nº ${os.numero} carregada no formulário.`, 'info');
}

async function baixarPDFdaOSSalva(id) {
  const os = estado.dados.osProntas.find((item) => item.id === id);
  if (!os) return;

  $('documento-os').innerHTML = montarDocumentoOS(os);
  await baixarPDFDocumento(nomeArquivoOS(os));
}

function abrirOSCliente(id) {
  const servico = estado.dados.servicos.find((item) => item.id === id);
  if (!servico) return;

  const contato = estado.dados.telefones.find(
    (item) => normalizarBusca(item.nome) === normalizarBusca(servico.nome)
  );

  $('oscl-nome').value = servico.nome || '';
  $('oscl-num').value = servico.num || '';
  $('oscl-telefone').value = contato ? contato.tel1 || contato.tel2 || '' : '';
  $('oscl-status').value = servico.status || 'Em andamento';
  $('oscl-notebook').value = servico.notebook || '';
  $('oscl-cfont').value = servico.cfont || 'Não';
  $('oscl-cmaleta').value = servico.cmaleta || 'Não';
  $('oscl-desc').value = servico.descricao || '';
  $('oscl-data').value = servico.data || hojeISO();
  $('oscl-local').value = servico.local || '';

  mostrarAba('os-clientes-loja');
}

function montarDocumentoCliente() {
  const nome = val('oscl-nome');
  const numero = val('oscl-num');

  return `
    <div class="doc">
      <div class="doc-cabecalho">
        <div class="doc-marca">
          ${esc(estado.usuario?.empresa || 'NEW STAR NOTEBOOK')}
          <small>ASSISTÊNCIA TÉCNICA DE NOTEBOOKS</small>
        </div>
        <div class="doc-titulo">
          <h1>ORDEM DE SERVIÇO</h1>
          <div class="doc-numero">Nº <strong>${esc(numero || '—')}</strong></div>
        </div>
      </div>

      <div class="doc-secao">
        <h2>Cliente</h2>
        <div class="doc-linha">
          ${campoDoc('Nome', nome, { largo: true })}
          ${campoDoc('Telefone', val('oscl-telefone'))}
          ${campoDoc('Local / com quem', val('oscl-local'))}
        </div>
      </div>

      <div class="doc-secao">
        <h2>Equipamento</h2>
        <div class="doc-linha">
          ${campoDoc('Notebook / equipamento', val('oscl-notebook'), { largo: true })}
          ${campoDoc('Data de entrada', formatarData(val('oscl-data')))}
          ${campoDoc('Status', $('oscl-status').value)}
          ${campoDoc('C/ fonte', $('oscl-cfont').value)}
          ${campoDoc('C/ maleta', $('oscl-cmaleta').value)}
        </div>
      </div>

      <div class="doc-secao">
        <h2>Descrição / defeito relatado</h2>
        <div class="doc-texto">${esc(val('oscl-desc') || '—')}</div>
      </div>

      <div class="doc-assinatura">
        <div>Assinatura do cliente</div>
        <div>${esc(estado.usuario?.empresa || 'New Star Notebook')} — recebido</div>
      </div>

      <div class="doc-rodape">
        Documento gerado pelo sistema New Star Notebook em ${formatarDataHora(new Date().toISOString())}.
      </div>
    </div>`;
}

function imprimirOSCliente() {
  const formulario = $('form-os-cliente');
  if (!formulario.reportValidity()) {
    toast('Preencha os campos obrigatórios da OS do cliente.', 'erro');
    return;
  }

  $('documento-os').innerHTML = montarDocumentoCliente();
  imprimir('imprimindo-documento');
}

/* ========================= 8. ETIQUETA / ESTOQUE ========================= */

function imprimirEtiqueta(id) {
  const nb = estado.dados.notebooksLoja.find((item) => item.id === id);
  if (!nb) return;

  let armazenamento = '';
  if (nb.nvme && nb.ssd) armazenamento = `NVME/SSD ${nb.nvme} + ${nb.ssd}`;
  else if (nb.nvme) armazenamento = nb.nvme.toUpperCase().includes('NVME') ? nb.nvme : `NVME ${nb.nvme}`;
  else if (nb.ssd) armazenamento = nb.ssd.toUpperCase().includes('SSD') ? nb.ssd : `SSD ${nb.ssd}`;

  const svg = `
    <svg class="icon-laptop" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="25" y="8" width="150" height="85" rx="6" ry="6" fill="none" stroke="#000000" stroke-width="8"/>
      <rect x="35" y="16" width="130" height="68" fill="#ffffff"/>
      <path d="M 5 102 L 195 102 C 198 102 200 104 198 108 L 188 116 C 186 118 180 119 175 119 L 25 119 C 20 119 14 118 12 116 L 2 108 C 0 104 2 102 5 102 Z" fill="#000000"/>
      <path d="M 80 102 L 120 102 L 115 109 L 85 109 Z" fill="#ffffff"/>
    </svg>`;

  $('area-impressao-etiqueta').innerHTML = `
    <div class="etiqueta-card">
      ${svg}
      <div class="titulo-config">configurações</div>
      <div class="linha-item">${esc(nb.notebook)} ${esc(nb.modelo || '')}</div>
      ${nb.processador ? `<div class="linha-item">${esc(nb.processador)}</div>` : ''}
      ${
        nb.memoria
          ? `<div class="linha-item">${esc(
              nb.memoria.toUpperCase().includes('RAM') ? nb.memoria : `${nb.memoria} RAM`
            )}</div>`
          : ''
      }
      ${armazenamento ? `<div class="linha-item">${esc(armazenamento)}</div>` : ''}
      ${nb.tela ? `<div class="linha-item">TELA ${esc(nb.tela)}</div>` : ''}
      ${nb.bateria ? `<div class="linha-item">BATERIA ${esc(nb.bateria)}</div>` : ''}
      ${nb.video ? `<div class="linha-item">${esc(nb.video)}</div>` : ''}
      ${nb.preco ? `<div class="linha-preco">${esc(nb.preco)}</div>` : ''}
    </div>`;

  imprimir('imprimindo-etiqueta');
}

function imprimirRelatorioEstoque() {
  $('relatorio-data').textContent = `Gerado em ${formatarDataHora(new Date().toISOString())}`;
  renderizarNotebooks();
  imprimir('imprimindo-relatorio');
}

/* ===================== 9. BACKUP / NUVEM / IMPORTAÇÃO ===================== */

async function baixarArquivo(caminho, nomePadrao) {
  const resposta = await fetch(caminho, {
    headers: estado.token ? { Authorization: `Bearer ${estado.token}` } : {},
  });

  if (resposta.status === 401) {
    encerrarSessaoLocal();
    throw new Error('Sua sessão expirou. Entre novamente.');
  }

  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status}`;
    try {
      const dados = await resposta.json();
      if (dados && dados.erro) mensagem = dados.erro;
    } catch (_) {
      // sem corpo JSON
    }
    throw new Error(mensagem);
  }

  const disposicao = resposta.headers.get('Content-Disposition') || '';
  const casamento = disposicao.match(/filename="([^"]+)"/);

  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = casamento ? casamento[1] : nomePadrao;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function baixarBanco() {
  await comBotao($('btn-baixar-sqlite'), 'Preparando…', async () => {
    try {
      await baixarArquivo('/api/backup.sqlite', 'newstar-backup.sqlite');
      toast('Banco de dados baixado.');
    } catch (erro) {
      mensagemErro(erro);
    }
  });
}

async function baixarJson() {
  await comBotao($('btn-baixar-json'), 'Preparando…', async () => {
    try {
      await baixarArquivo('/api/backup.json', 'newstar-backup.json');
      toast('Backup em JSON baixado.');
    } catch (erro) {
      mensagemErro(erro);
    }
  });
}

async function enviarParaNuvem() {
  await comBotao($('btn-enviar-nuvem'), 'Enviando…', async () => {
    try {
      const resultado = await api('POST', '/api/backup/nuvem');
      toast(`Backup enviado para ${resultado.nuvem?.nome || 'a nuvem'}.`);
      await recarregarERenderizar();
    } catch (erro) {
      mensagemErro(erro);
    }
  });
}

async function restaurarDaNuvem() {
  const confirmou = await confirmar(
    'Restaurar da nuvem',
    'A restauração substitui todos os dados desta conta pelos dados do último backup enviado. Deseja continuar?',
    'Restaurar'
  );
  if (!confirmou) return;

  await comBotao($('btn-restaurar-nuvem'), 'Restaurando…', async () => {
    try {
      const resultado = await api('POST', '/api/backup/nuvem/restaurar');
      toast(`${quantidade(resultado.total, 'registro restaurado', 'registros restaurados')} da nuvem.`);
      await recarregarERenderizar();
    } catch (erro) {
      mensagemErro(erro);
    }
  });
}

function bufferParaBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const pedaco = 0x8000;
  let binario = '';

  for (let i = 0; i < bytes.length; i += pedaco) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + pedaco));
  }

  return btoa(binario);
}

async function restaurarArquivo() {
  const entrada = $('arquivo-restaurar');
  const arquivo = entrada.files && entrada.files[0];

  if (!arquivo) {
    toast('Escolha um arquivo .sqlite ou .json primeiro.', 'erro');
    return;
  }

  const confirmou = await confirmar(
    'Restaurar backup',
    `Restaurar "${arquivo.name}" vai substituir todos os dados desta conta. Deseja continuar?`,
    'Restaurar'
  );
  if (!confirmou) return;

  await comBotao($('btn-restaurar-arquivo'), 'Restaurando…', async () => {
    try {
      const corpo = { substituir: true };

      if (arquivo.name.toLowerCase().endsWith('.json')) {
        corpo.json = JSON.parse(await arquivo.text());
      } else {
        corpo.sqlite = bufferParaBase64(await arquivo.arrayBuffer());
      }

      const resultado = await api('POST', '/api/restaurar', corpo);
      toast(`${quantidade(resultado.total, 'registro restaurado', 'registros restaurados')}.`);
      entrada.value = '';
      await recarregarERenderizar();
    } catch (erro) {
      mensagemErro(erro);
    }
  });
}

function lerDadosLegados() {
  try {
    const bruto = localStorage.getItem('newStarData');
    if (!bruto) return null;

    const dados = JSON.parse(bruto);
    const listas = {
      servicos: Array.isArray(dados.servicos) ? dados.servicos.length : 0,
      telefones: Array.isArray(dados.telefones) ? dados.telefones.length : 0,
      financeiro: Array.isArray(dados.financeiro) ? dados.financeiro.length : 0,
      pecas: Array.isArray(dados.pecas) ? dados.pecas.length : 0,
      notebooksLoja: Array.isArray(dados.notebooksLoja) ? dados.notebooksLoja.length : 0,
      osProntas: Array.isArray(dados.osProntas) ? dados.osProntas.length : 0,
    };

    const total = Object.values(listas).reduce((soma, n) => soma + n, 0);
    if (!total) return null;

    return { dados, total, listas };
  } catch (_) {
    return null;
  }
}

function configurarAvisoLegado() {
  const legado = lerDadosLegados();
  const aviso = $('aviso-legado');
  const jaImportado = localStorage.getItem('newStarData_importado_em');

  if (!legado) {
    aviso.hidden = true;
    $('legado-info').textContent = 'Nenhum dado da versão antiga encontrado neste navegador.';
    return;
  }

  const resumo = [
    quantidade(legado.listas.servicos, 'serviço', 'serviços'),
    quantidade(legado.listas.telefones, 'contato', 'contatos'),
    quantidade(legado.listas.financeiro, 'lançamento', 'lançamentos'),
    quantidade(legado.listas.pecas, 'peça', 'peças'),
    quantidade(legado.listas.notebooksLoja, 'notebook', 'notebooks'),
    quantidade(legado.listas.osProntas, 'OS', 'OS'),
  ].join(', ');
  $('aviso-legado-texto').textContent = `Encontramos dados da versão antiga neste navegador: ${resumo}.`;
  aviso.hidden = false;

  $('legado-info').textContent = `Encontramos ${legado.total} registro(s) salvos neste navegador pela versão antiga (${resumo}). A importação não apaga o original.`;

  // Se já foi importado uma vez, não insiste com o banner (a aba Backup continua disponível)
  if (jaImportado) aviso.hidden = true;
}

async function importarLegado() {
  const legado = lerDadosLegados();
  if (!legado) {
    toast('Nenhum dado antigo encontrado neste navegador.', 'info');
    return;
  }

  const confirmou = await confirmar(
    'Importar dados antigos',
    `Serão importados ${legado.total} registro(s) para a sua conta. Os dados que já existem nesta conta são mantidos. Deseja continuar?`,
    'Importar'
  );
  if (!confirmou) return;

  try {
    const resultado = await api('POST', '/api/importar', {
      dados: legado.dados,
      substituir: false,
    });

    localStorage.setItem('newStarData_importado_em', new Date().toISOString());

    toast(`${resultado.total} registro(s) importados para a sua conta.`);
    await recarregarERenderizar();
    configurarAvisoLegado();
  } catch (erro) {
    mensagemErro(erro);
  }
}

/* ============================== EVENTOS ============================== */

function registrarEventos() {
  // ---- Login / cadastro ----
  document.querySelectorAll('[data-auth-aba]').forEach((botao) => {
    botao.addEventListener('click', () => trocarAbaAuth(botao.dataset.authAba));
  });

  $('form-login').addEventListener('submit', entrarNoSistema);
  $('form-registro').addEventListener('submit', criarConta);

  // ---- Sair ----
  $('btn-sair').addEventListener('click', sair);
  $('btn-sair-2').addEventListener('click', sair);

  // ---- Abas ----
  document.querySelectorAll('.aba').forEach((botao) => {
    botao.addEventListener('click', () => mostrarAba(botao.dataset.aba));
  });

  // ---- Formulários ----
  $('form-servico').addEventListener('submit', salvarServico);
  $('form-telefone').addEventListener('submit', salvarTelefone);
  $('form-financeiro').addEventListener('submit', salvarFinanceiro);
  $('form-pecas').addEventListener('submit', salvarPeca);
  $('form-notebook').addEventListener('submit', salvarNotebook);

  $('btn-cancelar-servico').addEventListener('click', cancelarEdicaoServico);
  $('btn-cancelar-telefone').addEventListener('click', cancelarEdicaoTelefone);
  $('btn-cancelar-financeiro').addEventListener('click', cancelarEdicaoFinanceiro);
  $('btn-cancelar-peca').addEventListener('click', cancelarEdicaoPeca);
  $('btn-cancelar-nb').addEventListener('click', cancelarEdicaoNotebook);

  // ---- Busca ----
  const rerenderizarBusca = debounce((tipo) => {
    if (tipo === 'servicos') renderizarServicos();
    if (tipo === 'telefones') renderizarTelefones();
    if (tipo === 'financeiro') renderizarFinanceiro();
    if (tipo === 'pecas') renderizarPecas();
    if (tipo === 'os') renderizarOSProntas();
    if (tipo === 'notebooks') renderizarNotebooks();
  }, 160);

  document.addEventListener('input', (evento) => {
    const alvo = evento.target.closest('[data-busca]');
    if (alvo) rerenderizarBusca(alvo.dataset.busca);
  });

  // ---- Ações das tabelas (delegação) ----
  document.addEventListener('click', async (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (!botao || botao.tagName === 'SELECT') return;

    const acao = botao.dataset.acao;
    const id = Number(botao.dataset.id);

    if (acao === 'excluir') {
      const entidade = botao.dataset.entidade;
      await excluirRegistro(entidade, id, textoRotuloRegistro(entidade, id));
      return;
    }

    if (acao === 'editar-servico') return editarServico(id);
    if (acao === 'editar-telefone') return editarTelefone(id);
    if (acao === 'editar-financeiro') return editarFinanceiro(id);
    if (acao === 'editar-peca') return editarPeca(id);
    if (acao === 'editar-notebook') return editarNotebook(id);
    if (acao === 'etiqueta') return imprimirEtiqueta(id);
    if (acao === 'ver-os') return verOS(id);
    if (acao === 'pdf-os') return baixarPDFdaOSSalva(id);
    if (acao === 'os-cliente') return abrirOSCliente(id);
  });

  // ---- Mudança de status ----
  document.addEventListener('change', async (evento) => {
    const select = evento.target.closest('select[data-acao="status"]');
    if (!select) return;
    await alterarStatus(select);
  });

  // ---- Gerador de OS ----
  $('btn-salvar-os').addEventListener('click', salvarOSEBaixarPDF);
  $('btn-imprimir-os').addEventListener('click', imprimirOS);
  $('btn-limpar-os').addEventListener('click', limparFormularioOS);
  $('btn-imprimir-os-cliente').addEventListener('click', imprimirOSCliente);
  $('btn-limpar-os-cliente').addEventListener('click', () => {
    $('form-os-cliente').reset();
    $('oscl-data').value = hojeISO();
  });

  // ---- Etiqueta / estoque ----
  $('btn-imprimir-estoque').addEventListener('click', imprimirRelatorioEstoque);

  // ---- Backup ----
  $('btn-baixar-sqlite').addEventListener('click', baixarBanco);
  $('btn-baixar-json').addEventListener('click', baixarJson);
  $('btn-enviar-nuvem').addEventListener('click', enviarParaNuvem);
  $('btn-restaurar-nuvem').addEventListener('click', restaurarDaNuvem);
  $('btn-restaurar-arquivo').addEventListener('click', restaurarArquivo);
  $('btn-importar-legado').addEventListener('click', importarLegado);
  $('btn-aviso-importar').addEventListener('click', importarLegado);
  $('btn-aviso-fechar').addEventListener('click', () => {
    $('aviso-legado').hidden = true;
  });

  // ---- Hash da URL ----
  window.addEventListener('hashchange', () => {
    const nome = location.hash.replace('#', '');
    if (nome) mostrarAba(nome, { atualizarHash: false });
  });
}

/* ---------- Edição de serviços, contatos, financeiro e peças ---------- */

function editarServico(id) {
  const servico = estado.dados.servicos.find((item) => item.id === id);
  if (!servico) return;

  estado.editandoServicoId = id;

  $('srv-nome').value = servico.nome || '';
  $('srv-num').value = servico.num || '';
  $('srv-status').value = servico.status || 'Em andamento';
  $('srv-notebook').value = servico.notebook || '';
  $('srv-cfont').value = servico.cfont || 'Não';
  $('srv-cmaleta').value = servico.cmaleta || 'Não';
  $('srv-desc').value = servico.descricao || '';
  $('srv-data').value = servico.data || hojeISO();
  $('srv-local').value = servico.local || '';

  $('titulo-form-servico').textContent = `Editar serviço (OS ${servico.num})`;
  $('btn-salvar-servico').textContent = 'Atualizar serviço';
  $('btn-cancelar-servico').hidden = false;

  $('form-servico').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('srv-nome').focus({ preventScroll: true });
}

function cancelarEdicaoServico() {
  estado.editandoServicoId = null;
  $('form-servico').reset();
  $('srv-data').value = hojeISO();
  $('titulo-form-servico').textContent = 'Cadastrar novo serviço';
  $('btn-salvar-servico').textContent = 'Salvar serviço';
  $('btn-cancelar-servico').hidden = true;
}

function editarTelefone(id) {
  const contato = estado.dados.telefones.find((item) => item.id === id);
  if (!contato) return;

  estado.editandoTelefoneId = id;

  $('tel-nome').value = contato.nome || '';
  $('tel-1').value = contato.tel1 || '';
  $('tel-2').value = contato.tel2 === '-' ? '' : contato.tel2 || '';

  $('titulo-form-telefone').textContent = 'Editar contato';
  $('btn-salvar-telefone').textContent = 'Atualizar contato';
  $('btn-cancelar-telefone').hidden = false;

  $('form-telefone').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('tel-nome').focus({ preventScroll: true });
}

function cancelarEdicaoTelefone() {
  estado.editandoTelefoneId = null;
  $('form-telefone').reset();
  $('titulo-form-telefone').textContent = 'Adicionar contato';
  $('btn-salvar-telefone').textContent = 'Salvar contato';
  $('btn-cancelar-telefone').hidden = true;
}

function editarFinanceiro(id) {
  const lancamento = estado.dados.financeiro.find((item) => item.id === id);
  if (!lancamento) return;

  estado.editandoFinanceiroId = id;

  $('fin-nome').value = lancamento.nome || '';
  $('fin-status').value = lancamento.status || 'DEVENDO';
  $('fin-valor').value = (Number(lancamento.valor_centavos || 0) / 100).toFixed(2).replace('.', ',');
  $('fin-notebook').value = lancamento.notebook || '';
  $('fin-referente').value = lancamento.referente || '';

  $('titulo-form-financeiro').textContent = 'Editar lançamento';
  $('btn-salvar-financeiro').textContent = 'Atualizar lançamento';
  $('btn-cancelar-financeiro').hidden = false;

  $('form-financeiro').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('fin-nome').focus({ preventScroll: true });
}

function cancelarEdicaoFinanceiro() {
  estado.editandoFinanceiroId = null;
  $('form-financeiro').reset();
  $('titulo-form-financeiro').textContent = 'Adicionar lançamento';
  $('btn-salvar-financeiro').textContent = 'Salvar lançamento';
  $('btn-cancelar-financeiro').hidden = true;
}

function editarPeca(id) {
  const peca = estado.dados.pecas.find((item) => item.id === id);
  if (!peca) return;

  estado.editandoPecaId = id;

  $('pec-cliente').value = peca.cliente || '';
  $('pec-item').value = peca.item || '';
  $('pec-data').value = peca.data || hojeISO();
  $('pec-status').value = peca.status || 'Não devolvido';

  $('titulo-form-peca').textContent = 'Editar peça / fonte';
  $('btn-salvar-peca').textContent = 'Atualizar peça';
  $('btn-cancelar-peca').hidden = false;

  $('form-pecas').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('pec-cliente').focus({ preventScroll: true });
}

function cancelarEdicaoPeca() {
  estado.editandoPecaId = null;
  $('form-pecas').reset();
  $('pec-data').value = hojeISO();
  $('titulo-form-peca').textContent = 'Adicionar peça / fonte';
  $('btn-salvar-peca').textContent = 'Salvar peça';
  $('btn-cancelar-peca').hidden = true;
}

registrarEventos();
iniciar();
