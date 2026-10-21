/*
 * New Star Notebook — versão de arquivo único.
 *
 * Este bloco substitui o servidor: ele responde às mesmas rotas `/api/...`
 * que o `server.js` responde, mas guarda tudo no `localStorage` do navegador.
 *
 * Bom para: abrir com dois cliques, levar no pen drive, usar sem instalar nada.
 * Limitações (explícitas de propósito):
 *  - os dados ficam NESTE navegador (não sincronizam entre computadores);
 *  - o "login" separa as contas, mas não protege contra quem tem acesso ao
 *    computador e abre o console do navegador;
 *  - não existe backup em nuvem nem arquivo .sqlite de verdade.
 * Para uso com vários computadores e backup em nuvem, use a versão com servidor.
 */
(function () {
  'use strict';

  /* ============================ SHA-256 ============================ */
  /* Implementação pequena e sem dependências. Necessária porque
     `crypto.subtle` não existe em algumas situações (ex.: arquivo local
     aberto por file:// em certos navegadores). */

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function girar(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function sha256Hex(texto) {
    const bytes = new TextEncoder().encode(String(texto));
    const bits = bytes.length * 8;

    const comPadding = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
    comPadding.set(bytes);
    comPadding[bytes.length] = 0x80;

    const visao = new DataView(comPadding.buffer);
    visao.setUint32(comPadding.length - 4, bits >>> 0);
    visao.setUint32(comPadding.length - 8, Math.floor(bits / 0x100000000));

    const h = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const w = new Uint32Array(64);

    for (let bloco = 0; bloco < comPadding.length; bloco += 64) {
      for (let i = 0; i < 16; i++) w[i] = visao.getUint32(bloco + i * 4);

      for (let i = 16; i < 64; i++) {
        const s0 = girar(w[i - 15], 7) ^ girar(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = girar(w[i - 2], 17) ^ girar(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      let [a, b, c, d, e, f, g, hh] = h;

      for (let i = 0; i < 64; i++) {
        const S1 = girar(e, 6) ^ girar(e, 11) ^ girar(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = girar(a, 2) ^ girar(a, 13) ^ girar(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;

        hh = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }

      h[0] = (h[0] + a) >>> 0;
      h[1] = (h[1] + b) >>> 0;
      h[2] = (h[2] + c) >>> 0;
      h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0;
      h[5] = (h[5] + f) >>> 0;
      h[6] = (h[6] + g) >>> 0;
      h[7] = (h[7] + hh) >>> 0;
    }

    return h.map((n) => n.toString(16).padStart(8, '0')).join('');
  }

  /* ============================ utilidades ============================ */

  const CHAVE_STORE = 'newstar_arquivo_unico_v1';
  const DIAS_SESSAO = 30;
  const ITERACOES_HASH = 20000;

  function agoraSQL() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  function agoraISO() {
    return new Date().toISOString();
  }

  function dataArquivo() {
    return new Date().toISOString().slice(0, 10);
  }

  function nomeSeguro(texto) {
    return String(texto || 'conta')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'conta';
  }

  function bytesAleatorios(quantidade) {
    const bytes = new Uint8Array(quantidade);

    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < quantidade; i++) bytes[i] = Math.floor(Math.random() * 256);
    }

    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function hashSenha(senha, salt) {
    let atual = `${salt}:${senha}`;
    for (let i = 0; i < ITERACOES_HASH; i++) atual = sha256Hex(`${salt}|${i}|${atual}`);
    return atual;
  }

  /* ============================ armazenamento ============================ */

  let memoria = null; // usado quando o localStorage está bloqueado

  function lerArmazenado() {
    try {
      const bruto = window.localStorage.getItem(CHAVE_STORE);
      return bruto ? JSON.parse(bruto) : null;
    } catch (_) {
      return memoria ? JSON.parse(JSON.stringify(memoria)) : null;
    }
  }

  function gravar(estado) {
    memoria = JSON.parse(JSON.stringify(estado));

    try {
      window.localStorage.setItem(CHAVE_STORE, JSON.stringify(estado));
    } catch (_) {
      // modo memória: os dados duram enquanto a aba estiver aberta
    }
  }

  /* ============================ validação ============================ */

  class ErroValidacao extends Error {
    constructor(mensagem, status = 400) {
      super(mensagem);
      this.status = status;
    }
  }

  const ROTULOS = {
    nome: 'Nome',
    num: 'Nº da OS',
    status: 'Status',
    notebook: 'Notebook',
    cfont: 'C/ Fonte',
    cmaleta: 'C/ Maleta',
    descricao: 'Descrição',
    data: 'Data',
    local: 'Local',
    tel1: 'Telefone 1',
    tel2: 'Telefone 2',
    valor_centavos: 'Valor',
    referente: 'Referente',
    cliente: 'Cliente',
    item: 'Item',
    modelo: 'Modelo',
    processador: 'Processador',
    memoria: 'Memória',
    tela: 'Tela',
    bateria: 'Bateria',
    nvme: 'NVME',
    ssd: 'SSD',
    video: 'Vídeo',
    preco: 'Preço',
    numero: 'Número da OS',
    equipamento: 'Equipamento',
    detalhes: 'Detalhes',
  };

  const REGRAS = {
    nome: { tipo: 'texto', max: 120 },
    num: { tipo: 'texto', max: 40 },
    status: { tipo: 'texto', max: 40 },
    notebook: { tipo: 'texto', max: 160 },
    cfont: { tipo: 'texto', max: 10 },
    cmaleta: { tipo: 'texto', max: 10 },
    descricao: { tipo: 'texto', max: 2000 },
    data: { tipo: 'data' },
    local: { tipo: 'texto', max: 160 },
    tel1: { tipo: 'texto', max: 40 },
    tel2: { tipo: 'texto', max: 40 },
    valor_centavos: { tipo: 'inteiro', min: 0, max: 1000000000000 },
    referente: { tipo: 'texto', max: 200 },
    cliente: { tipo: 'texto', max: 160 },
    item: { tipo: 'texto', max: 300 },
    modelo: { tipo: 'texto', max: 120 },
    processador: { tipo: 'texto', max: 120 },
    memoria: { tipo: 'texto', max: 120 },
    tela: { tipo: 'texto', max: 120 },
    bateria: { tipo: 'texto', max: 120 },
    nvme: { tipo: 'texto', max: 120 },
    ssd: { tipo: 'texto', max: 120 },
    video: { tipo: 'texto', max: 120 },
    preco: { tipo: 'texto', max: 120 },
    numero: { tipo: 'texto', max: 40 },
    equipamento: { tipo: 'texto', max: 200 },
    detalhes: { tipo: 'objeto', max: 30000 },
  };

  function normalizarData(valor) {
    const texto = String(valor === null || valor === undefined ? '' : valor).trim();
    if (!texto) return '';

    const brasileira = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brasileira) {
      return `${brasileira[3]}-${brasileira[2].padStart(2, '0')}-${brasileira[1].padStart(2, '0')}`;
    }

    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    return null;
  }

  function normalizarCampo(campo, valor) {
    const regra = REGRAS[campo] || { tipo: 'texto', max: 300 };

    if (regra.tipo === 'texto') {
      const texto = valor === null || valor === undefined ? '' : String(valor).trim();
      if (texto.length > regra.max) {
        throw new ErroValidacao(`O campo "${ROTULOS[campo] || campo}" passou do limite de ${regra.max} caracteres.`);
      }
      return texto;
    }

    if (regra.tipo === 'data') {
      const data = normalizarData(valor);
      if (data === null) throw new ErroValidacao(`A data do campo "${ROTULOS[campo] || campo}" é inválida. Use DD/MM/AAAA.`);
      return data;
    }

    if (regra.tipo === 'inteiro') {
      if (valor === null || valor === undefined || valor === '') return null;
      const numero = Math.round(Number(String(valor).replace(',', '.')));
      if (!Number.isFinite(numero)) throw new ErroValidacao(`O campo "${ROTULOS[campo] || campo}" precisa ser um número.`);
      if (numero < regra.min || numero > regra.max) {
        throw new ErroValidacao(`O valor do campo "${ROTULOS[campo] || campo}" está fora do permitido.`);
      }
      return numero;
    }

    if (regra.tipo === 'objeto') {
      if (valor === null || valor === undefined || valor === '') return null;

      let objeto = valor;
      if (typeof valor === 'string') {
        try {
          objeto = JSON.parse(valor);
        } catch (_) {
          throw new ErroValidacao('Os detalhes da OS estão em formato inválido.');
        }
      }

      if (typeof objeto !== 'object' || Array.isArray(objeto)) {
        throw new ErroValidacao('Os detalhes da OS precisam ser um objeto.');
      }

      const json = JSON.stringify(objeto);
      if (json.length > regra.max) throw new ErroValidacao('Os detalhes da OS são grandes demais.');
      return json;
    }

    return valor;
  }

  /* ============================ entidades ============================ */

  const ENTIDADES = {
    servicos: {
      chave: 'servicos',
      rotulo: 'Ordens de Serviço',
      campos: ['nome', 'num', 'status', 'notebook', 'cfont', 'cmaleta', 'descricao', 'data', 'local'],
      obrigatorios: ['nome', 'num', 'notebook', 'data'],
      status: ['Em andamento', 'Pronto', 'Entregue'],
      statusPadrao: 'Em andamento',
      unico: 'num',
      mensagemUnico: 'Já existe um serviço com esse nº de OS nesta conta.',
      resumo: (r) => `OS ${r.num} — ${r.nome}`,
    },
    telefones: {
      chave: 'telefones',
      rotulo: 'Contatos',
      campos: ['nome', 'tel1', 'tel2'],
      obrigatorios: ['nome', 'tel1'],
      resumo: (r) => `Contato de ${r.nome}`,
    },
    financeiro: {
      chave: 'financeiro',
      rotulo: 'Financeiro',
      campos: ['nome', 'status', 'valor_centavos', 'notebook', 'referente'],
      obrigatorios: ['nome', 'valor_centavos'],
      status: ['DEVENDO', 'PAGO'],
      statusPadrao: 'DEVENDO',
      resumo: (r) => `Lançamento de ${r.nome}`,
    },
    pecas: {
      chave: 'pecas',
      rotulo: 'Peças e Fontes',
      campos: ['cliente', 'item', 'data', 'status'],
      obrigatorios: ['cliente', 'item', 'data'],
      status: ['Não devolvido', 'Devolvido'],
      statusPadrao: 'Não devolvido',
      resumo: (r) => `Peça "${r.item}" de ${r.cliente}`,
    },
    notebooks_loja: {
      chave: 'notebooksLoja',
      rotulo: 'Notebooks Loja',
      campos: ['notebook', 'modelo', 'processador', 'memoria', 'tela', 'bateria', 'nvme', 'ssd', 'video', 'preco', 'status'],
      obrigatorios: ['notebook', 'modelo'],
      status: ['Disponível', 'Reservado', 'Vendido'],
      statusPadrao: 'Disponível',
      resumo: (r) => `Notebook ${r.notebook} ${r.modelo}`,
    },
    os: {
      chave: 'osProntas',
      rotulo: 'OS Prontas',
      campos: ['numero', 'cliente', 'equipamento', 'data', 'detalhes'],
      obrigatorios: ['numero', 'cliente', 'equipamento', 'data'],
      upsertPor: 'numero',
      resumo: (r) => `OS ${r.numero} de ${r.cliente}`,
    },
  };

  function entidadeConfig(nome) {
    if (!Object.prototype.hasOwnProperty.call(ENTIDADES, nome)) {
      throw new ErroValidacao('Recurso não encontrado.', 404);
    }
    return ENTIDADES[nome];
  }

  function normalizarEntidade(config, corpo) {
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
      throw new ErroValidacao('Corpo da requisição inválido.');
    }

    const dados = {};

    for (const campo of config.campos) {
      const presente = Object.prototype.hasOwnProperty.call(corpo, campo);
      if (!presente) {
        dados[campo] = campo === 'status' ? config.statusPadrao || null : null;
        continue;
      }
      dados[campo] = normalizarCampo(campo, corpo[campo]);
    }

    for (const campo of config.obrigatorios || []) {
      const valor = dados[campo];
      if (valor === null || valor === undefined || String(valor).trim() === '') {
        throw new ErroValidacao(`O campo "${ROTULOS[campo] || campo}" é obrigatório.`);
      }
    }

    if (config.status) {
      if (!dados.status) dados.status = config.statusPadrao;
      if (!config.status.includes(dados.status)) {
        throw new ErroValidacao(`Status inválido. Use: ${config.status.join(', ')}.`);
      }
    }

    return dados;
  }

  function listasDoUsuario(estado, usuarioId) {
    const chave = String(usuarioId);
    if (!estado.dados[chave]) {
      estado.dados[chave] = {
        servicos: [],
        telefones: [],
        financeiro: [],
        pecas: [],
        notebooksLoja: [],
        osProntas: [],
      };
    }
    return estado.dados[chave];
  }

  function auditar(estado, usuarioId, entidade, acao, descricao, entidadeId) {
    const chave = String(usuarioId);
    if (!estado.auditoria[chave]) estado.auditoria[chave] = [];

    const lista = estado.auditoria[chave];
    lista.unshift({
      id: (lista[0] ? lista[0].id + 1 : 1),
      entidade,
      entidade_id: entidadeId === undefined ? null : entidadeId,
      acao,
      descricao,
      criado_em: agoraSQL(),
    });

    if (lista.length > 200) lista.length = 200;
  }

  function proximoId(lista) {
    return lista.reduce((maior, item) => Math.max(maior, Number(item.id) || 0), 0) + 1;
  }

  function usuarioPublico(usuario) {
    return {
      id: usuario.id,
      nome: usuario.nome,
      empresa: usuario.empresa || '',
      email: usuario.email,
      papel: usuario.papel || 'admin',
      criado_em: usuario.criado_em,
    };
  }

  /* ============================ sessões ============================ */

  function limparSessoes(estado) {
    const agora = new Date().toISOString();
    estado.sessoes = estado.sessoes.filter((sessao) => sessao.expira_em > agora);
  }

  function criarSessao(estado, usuarioId) {
    limparSessoes(estado);

    const token = bytesAleatorios(32);
    const expira = new Date(Date.now() + DIAS_SESSAO * 24 * 60 * 60 * 1000).toISOString();

    estado.sessoes.push({ token, usuario_id: usuarioId, expira_em: expira });
    return { token, expiraEm: expira };
  }

  function usuarioDaRequisicao(estado, cabecalhos) {
    const autorizacao = String(cabecalhos.Authorization || cabecalhos.authorization || '');
    const xSessao = String(cabecalhos['X-Sessao'] || cabecalhos['x-sessao'] || '');
    const token = xSessao || (autorizacao.startsWith('Bearer ') ? autorizacao.slice(7).trim() : '');

    if (!token) return null;

    limparSessoes(estado);
    const sessao = estado.sessoes.find((item) => item.token === token);
    if (!sessao) return null;

    return estado.usuarios.find((usuario) => usuario.id === sessao.usuario_id) || null;
  }

  /* ============================ estado inicial ============================ */

  const DEMO = {
    servicos: [
      { nome: 'Carlos Andrade', num: '1001', status: 'Em andamento', notebook: 'Dell Inspiron 15 3520', cfont: 'Sim', cmaleta: 'Não', descricao: 'Não liga. Cliente relata que parou após queda de energia.', data: '2026-10-14', local: 'Balcão' },
      { nome: 'Fernanda Lima', num: '1002', status: 'Pronto', notebook: 'Lenovo IdeaPad 3', cfont: 'Não', cmaleta: 'Sim', descricao: 'Tela trincada, troca aprovada.', data: '2026-10-15', local: 'WhatsApp' },
      { nome: 'Roberto Dias', num: '1003', status: 'Entregue', notebook: 'Acer Aspire 5', cfont: 'Sim', cmaleta: 'Não', descricao: 'Limpeza e troca de pasta térmica.', data: '2026-10-10', local: 'Balcão' },
    ],
    telefones: [
      { nome: 'Carlos Andrade', tel1: '(11) 98888-1010', tel2: '(11) 3333-1010' },
      { nome: 'Fernanda Lima', tel1: '(11) 97777-2020', tel2: null },
    ],
    financeiro: [
      { nome: 'Fernanda Lima', status: 'PAGO', valor_centavos: 45000, notebook: 'Lenovo IdeaPad 3', referente: 'Troca de tela' },
      { nome: 'Carlos Andrade', status: 'DEVENDO', valor_centavos: 32000, notebook: 'Dell Inspiron 15 3520', referente: 'Reparo na placa' },
    ],
    pecas: [
      { cliente: 'Carlos Andrade', item: 'Fonte 19,5V 3,34A', data: '2026-10-14', status: 'Não devolvido' },
      { cliente: 'Fernanda Lima', item: 'Tela 15,6" LED', data: '2026-10-15', status: 'Devolvido' },
    ],
    notebooksLoja: [
      { notebook: 'Dell', modelo: 'Inspiron 15 3520', processador: 'Intel Core i5-1135G7', memoria: '8 GB', tela: '15,6"', bateria: 'Boa', nvme: '256 GB', ssd: '', video: 'Intel Iris Xe', preco: 'R$ 2.300,00', status: 'Disponível' },
      { notebook: 'Lenovo', modelo: 'IdeaPad 3i', processador: 'Intel Core i3-1115G4', memoria: '8 GB', tela: '15,6"', bateria: 'Boa', nvme: '', ssd: '480 GB', video: 'Intel UHD', preco: 'R$ 1.850,00', status: 'Reservado' },
    ],
    osProntas: [
      {
        numero: 'OS-1001',
        cliente: 'Carlos Andrade',
        equipamento: 'Dell Inspiron 15 3520',
        data: '2026-10-14',
        detalhes: { defeito: 'Não liga', laudo: 'Placa em análise', valor: 'R$ 320,00' },
      },
    ],
  };

  function criarEstadoInicial() {
    const criadoEm = agoraSQL();

    const usuarios = [
      {
        id: 1,
        nome: 'Ana Silva',
        empresa: 'New Star Notebook',
        email: 'ana@teste.com',
        salt: bytesAleatorios(16),
        papel: 'admin',
        criado_em: criadoEm,
      },
      {
        id: 2,
        nome: 'Bruno Souza',
        empresa: 'Loja B',
        email: 'bruno@teste.com',
        salt: bytesAleatorios(16),
        papel: 'admin',
        criado_em: criadoEm,
      },
    ];

    for (const usuario of usuarios) {
      usuario.senha_hash = hashSenha('senha12345', usuario.salt);
    }

    const estado = {
      versao: 1,
      criado_em: agoraISO(),
      usuarios,
      sessoes: [],
      dados: {},
      auditoria: {},
      config: {},
    };

    const listaAna = listasDoUsuario(estado, 1);
    for (const [chave, itens] of Object.entries(DEMO)) {
      for (const item of itens) {
        const registro = { id: proximoId(listaAna[chave]), ...item, criado_em: criadoEm, atualizado_em: criadoEm };
        if (chave === 'osProntas' && registro.detalhes && typeof registro.detalhes === 'object') {
          registro.detalhes = JSON.stringify(registro.detalhes);
        }
        listaAna[chave].push(registro);
      }
    }

    listasDoUsuario(estado, 2);

    auditar(estado, 1, 'conta', 'conta', 'Conta de demonstração criada.', null);

    return estado;
  }

  /* ============================ respostas ============================ */

  /**
   * Resposta mínima compatível com o que o front usa:
   * status, ok, headers.get(), json(), text() e blob().
   *
   * Não usamos `new Response(...)` porque alguns navegadores antigos e
   * ambientes embutidos não têm essa classe — e aqui não precisamos dela.
   */
  function criarResposta(texto, status, cabecalhos) {
    const mapa = new Map();

    for (const [chave, valor] of Object.entries(cabecalhos || {})) {
      mapa.set(chave.toLowerCase(), valor);
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: '',
      headers: {
        get(nome) {
          return mapa.has(String(nome).toLowerCase()) ? mapa.get(String(nome).toLowerCase()) : null;
        },
      },
      text() {
        return Promise.resolve(texto);
      },
      json() {
        return Promise.resolve().then(() => JSON.parse(texto));
      },
      blob() {
        return Promise.resolve(
          new Blob([texto], { type: mapa.get('content-type') || 'text/plain' })
        );
      },
    };
  }

  function respostaJson(corpo, status, cabecalhos) {
    return criarResposta(
      JSON.stringify(corpo),
      status || 200,
      Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cabecalhos || {})
    );
  }

  function respostaErro(mensagem, status) {
    return respostaJson({ erro: mensagem }, status || 400);
  }

  function respostaArquivo(conteudo, tipo, nome) {
    return criarResposta(conteudo, 200, {
      'Content-Type': tipo,
      'Content-Disposition': `attachment; filename="${nome}"`,
    });
  }

  /* ============================ backup / restauração ============================ */

  function exportarJson(estado, usuario) {
    const listas = listasDoUsuario(estado, usuario.id);

    const copia = (itens) =>
      itens.map((item) => {
        const linha = Object.assign({}, item);
        if (linha.detalhes && typeof linha.detalhes === 'string') {
          try {
            linha.detalhes = JSON.parse(linha.detalhes);
          } catch (_) {
            linha.detalhes = {};
          }
        }
        return linha;
      });

    return {
      exportadoEm: agoraISO(),
      versao: 2,
      formato: 'new-star-notebook/arquivo-unico',
      usuario: { nome: usuario.nome, empresa: usuario.empresa || '', email: usuario.email },
      servicos: copia(listas.servicos),
      telefones: copia(listas.telefones),
      financeiro: copia(listas.financeiro),
      pecas: copia(listas.pecas),
      notebooksLoja: copia(listas.notebooksLoja),
      osProntas: copia(listas.osProntas),
    };
  }

  function textoCurto(valor, max) {
    if (valor === null || valor === undefined) return '';
    return String(valor).trim().slice(0, max || 300);
  }

  function statusValido(valor, lista, padrao) {
    const limpo = textoCurto(valor, 40);
    return lista.includes(limpo) ? limpo : padrao;
  }

  function paraCentavos(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number' && Number.isFinite(valor)) return Math.round(valor * 100);

    const limpo = String(valor).replace(/[^\d,.-]/g, '').trim();
    if (!limpo) return 0;

    const numero = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
    return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
  }

  function normalizarImportado(chave, linha) {
    if (!linha || typeof linha !== 'object') return null;

    if (chave === 'servicos') {
      const nome = textoCurto(linha.nome !== undefined ? linha.nome : linha.cliente, 120);
      const num = textoCurto(linha.num !== undefined ? linha.num : linha.numero, 40);
      if (!nome || !num) return null;
      return {
        nome,
        num,
        status: statusValido(linha.status, ['Em andamento', 'Pronto', 'Entregue'], 'Em andamento'),
        notebook: textoCurto(linha.notebook !== undefined ? linha.notebook : linha.equipamento, 160),
        cfont: textoCurto(linha.cfont, 10) || 'Não',
        cmaleta: textoCurto(linha.cmaleta, 10) || 'Não',
        descricao: textoCurto(linha.descricao !== undefined ? linha.descricao : linha.desc !== undefined ? linha.desc : linha.problema, 2000),
        data: normalizarData(linha.data !== undefined ? linha.data : linha.data_entrada) || '',
        local: textoCurto(linha.local, 160),
      };
    }

    if (chave === 'telefones') {
      const nome = textoCurto(linha.nome, 120);
      const tel1 = textoCurto(linha.tel1 !== undefined ? linha.tel1 : linha.telefone, 40);
      if (!nome || !tel1) return null;
      return { nome, tel1, tel2: textoCurto(linha.tel2, 40) || '-' };
    }

    if (chave === 'financeiro') {
      const nome = textoCurto(linha.nome !== undefined ? linha.nome : linha.cliente, 120);
      if (!nome) return null;

      const centavos =
        linha.valor_centavos !== undefined && linha.valor_centavos !== null
          ? Math.round(Number(linha.valor_centavos)) || 0
          : paraCentavos(linha.valor);

      return {
        nome,
        status: statusValido(linha.status, ['DEVENDO', 'PAGO'], 'DEVENDO'),
        valor_centavos: centavos,
        notebook: textoCurto(linha.notebook, 160),
        referente: textoCurto(linha.referente, 200),
      };
    }

    if (chave === 'pecas') {
      const cliente = textoCurto(linha.cliente, 160);
      const item = textoCurto(linha.item, 300);
      if (!cliente || !item) return null;
      return {
        cliente,
        item,
        data: normalizarData(linha.data !== undefined ? linha.data : linha.data_entrada) || '',
        status: statusValido(linha.status, ['Não devolvido', 'Devolvido'], 'Não devolvido'),
      };
    }

    if (chave === 'notebooksLoja') {
      const notebook = textoCurto(linha.notebook !== undefined ? linha.notebook : linha.marca, 160);
      const modelo = textoCurto(linha.modelo, 120);
      if (!notebook || !modelo) return null;
      return {
        notebook,
        modelo,
        processador: textoCurto(linha.processador, 120),
        memoria: textoCurto(linha.memoria, 120),
        tela: textoCurto(linha.tela, 120),
        bateria: textoCurto(linha.bateria, 120),
        nvme: textoCurto(linha.nvme, 120),
        ssd: textoCurto(linha.ssd, 120),
        video: textoCurto(linha.video, 120),
        preco: textoCurto(linha.preco, 120),
        status: statusValido(linha.status, ['Disponível', 'Reservado', 'Vendido'], 'Disponível'),
      };
    }

    if (chave === 'osProntas') {
      const numero = textoCurto(linha.numero !== undefined ? linha.numero : linha.num, 40);
      const cliente = textoCurto(linha.cliente, 120);
      const equipamento = textoCurto(linha.equipamento !== undefined ? linha.equipamento : linha.notebook, 200);
      if (!numero || !cliente || !equipamento) return null;

      let detalhes = linha.detalhes;

      if (detalhes && typeof detalhes === 'object') {
        detalhes = JSON.stringify(detalhes);
      } else if (typeof detalhes === 'string') {
        try {
          detalhes = JSON.stringify(JSON.parse(detalhes));
        } catch (_) {
          detalhes = null;
        }
      } else {
        detalhes = null;
      }

      return {
        numero,
        cliente,
        equipamento,
        data: normalizarData(linha.data) || '',
        detalhes,
      };
    }

    return null;
  }

  function conjuntoDoArquivo(objeto) {
    if (!objeto || typeof objeto !== 'object') throw new ErroValidacao('Arquivo JSON inválido.');
    const origem = objeto.dados && typeof objeto.dados === 'object' ? objeto.dados : objeto;

    const conjunto = {
      servicos: Array.isArray(origem.servicos) ? origem.servicos : [],
      telefones: Array.isArray(origem.telefones) ? origem.telefones : [],
      financeiro: Array.isArray(origem.financeiro) ? origem.financeiro : [],
      pecas: Array.isArray(origem.pecas) ? origem.pecas : [],
      notebooksLoja: Array.isArray(origem.notebooksLoja)
        ? origem.notebooksLoja
        : Array.isArray(origem.notebooks_loja)
        ? origem.notebooks_loja
        : [],
      osProntas: Array.isArray(origem.osProntas) ? origem.osProntas : Array.isArray(origem.os) ? origem.os : [],
    };

    const total = Object.values(conjunto).reduce((soma, lista) => soma + lista.length, 0);
    if (total === 0) throw new ErroValidacao('O arquivo não contém registros reconhecidos.');

    return conjunto;
  }

  function importarConjunto(estado, usuario, conjunto, substituir, origem) {
    const listas = listasDoUsuario(estado, usuario.id);
    const contagem = {};
    let total = 0;

    if (substituir) {
      for (const config of Object.values(ENTIDADES)) listas[config.chave] = [];
    }

    for (const [chave, itens] of Object.entries(conjunto)) {
      contagem[chave] = { importados: 0, ignorados: 0 };

      for (const bruto of itens) {
        const linha = normalizarImportado(chave, bruto);
        if (!linha) {
          contagem[chave].ignorados += 1;
          continue;
        }

        const lista = listas[chave];

        // OS prontas: mesmo número atualiza em vez de duplicar
        if (chave === 'osProntas') {
          const existente = lista.find((item) => item.numero === linha.numero);
          if (existente) {
            Object.assign(existente, linha, { atualizado_em: agoraSQL() });
            contagem[chave].importados += 1;
            total += 1;
            continue;
          }
        }

        // Serviços: número repetido é ignorado (não sobrescreve o existente)
        if (chave === 'servicos' && lista.some((item) => item.num === linha.num)) {
          contagem[chave].ignorados += 1;
          continue;
        }

        const registro = Object.assign({ id: proximoId(lista) }, linha, {
          criado_em: agoraSQL(),
          atualizado_em: agoraSQL(),
        });

        lista.push(registro);
        contagem[chave].importados += 1;
        total += 1;
      }
    }

    auditar(estado, usuario.id, 'conta', 'importar', `Importou ${total} registros (${origem}).`, null);

    return { contagem, total };
  }

  /* ============================ rotas ============================ */

  function dadosDaConta(estado, usuario) {
    const listas = listasDoUsuario(estado, usuario.id);

    const linhas = (itens) =>
      itens
        .slice()
        .sort((a, b) => b.id - a.id)
        .map((item) => {
          const copia = Object.assign({}, item);
          if (copia.detalhes && typeof copia.detalhes === 'string') {
            try {
              copia.detalhes = JSON.parse(copia.detalhes);
            } catch (_) {
              copia.detalhes = {};
            }
          }
          return copia;
        });

    const totais = listas.financeiro.reduce(
      (soma, item) => {
        if (item.status === 'DEVENDO') soma.devendo += Number(item.valor_centavos) || 0;
        if (item.status === 'PAGO') soma.pago += Number(item.valor_centavos) || 0;
        soma.lancamentos += 1;
        return soma;
      },
      { devendo: 0, pago: 0, lancamentos: 0 }
    );

    return {
      usuario: usuarioPublico(usuario),
      servicos: linhas(listas.servicos),
      telefones: linhas(listas.telefones),
      financeiro: linhas(listas.financeiro),
      pecas: linhas(listas.pecas),
      notebooksLoja: linhas(listas.notebooksLoja),
      osProntas: linhas(listas.osProntas),
      totais,
      contagens: {
        servicos: listas.servicos.length,
        servicosEmAndamento: listas.servicos.filter((item) => item.status === 'Em andamento').length,
        notebooks: listas.notebooksLoja.length,
        osProntas: listas.osProntas.length,
      },
      nuvem: {
        configurada: false,
        provedor: null,
        nome: null,
        instrucao:
          'A nuvem só existe na versão com servidor. Nesta versão de arquivo único, use o backup em .json.',
        ultimoEnvio: null,
      },
      auditoria: (estado.auditoria[String(usuario.id)] || []).slice(0, 30),
      versao: '2.0.1',
      modo: 'arquivo-unico',
    };
  }

  function registrar(estado, corpo) {
    const nome = textoCurto(corpo && corpo.nome, 120);
    const empresa = textoCurto(corpo && corpo.empresa, 120);
    const email = textoCurto(corpo && corpo.email, 180).toLowerCase();
    const senha = String((corpo && corpo.senha) || '');

    if (nome.length < 2) throw new ErroValidacao('Informe o nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ErroValidacao('Informe um e-mail válido.');
    if (senha.length < 8) throw new ErroValidacao('Senha precisa ter pelo menos 8 caracteres.');
    if (senha.length > 200) throw new ErroValidacao('Senha é muito longa.');

    if (estado.usuarios.some((usuario) => usuario.email === email)) {
      throw new ErroValidacao('Já existe uma conta com esse e-mail. Faça login.', 409);
    }

    const salt = bytesAleatorios(16);
    const usuario = {
      id: estado.usuarios.reduce((maior, item) => Math.max(maior, item.id), 0) + 1,
      nome,
      empresa,
      email,
      salt,
      senha_hash: hashSenha(senha, salt),
      papel: 'admin',
      criado_em: agoraSQL(),
    };

    estado.usuarios.push(usuario);
    listasDoUsuario(estado, usuario.id);
    auditar(estado, usuario.id, 'conta', 'conta', `Criou a conta (${email}).`, null);

    const sessao = criarSessao(estado, usuario.id);
    return respostaJson(
      { token: sessao.token, expiraEm: sessao.expiraEm, usuario: usuarioPublico(usuario) },
      201
    );
  }

  function entrar(estado, corpo) {
    const email = textoCurto(corpo && corpo.email, 180).toLowerCase();
    const senha = String((corpo && corpo.senha) || '');

    const usuario = estado.usuarios.find((item) => item.email === email);

    const senhaOk = usuario ? hashSenha(senha, usuario.salt) === usuario.senha_hash : false;

    if (!usuario || !senhaOk) throw new ErroValidacao('E-mail ou senha incorretos.', 401);

    const sessao = criarSessao(estado, usuario.id);
    auditar(estado, usuario.id, 'conta', 'conta', 'Entrou no sistema.', null);

    return respostaJson({ token: sessao.token, expiraEm: sessao.expiraEm, usuario: usuarioPublico(usuario) });
  }

  function exigirUsuario(estado, cabecalhos) {
    const usuario = usuarioDaRequisicao(estado, cabecalhos);
    if (!usuario) throw new ErroValidacao('Sessão expirada. Entre novamente.', 401);
    return usuario;
  }

  /* ---------------------------- requisição ---------------------------- */

  function tratar(metodo, caminho, corpo, cabecalhos) {
    const estado = lerArmazenado() || criarEstadoInicial();
    let resposta;

    try {
      resposta = rotear(estado, metodo, caminho, corpo, cabecalhos);
    } catch (erro) {
      if (erro instanceof ErroValidacao) {
        resposta = respostaErro(erro.message, erro.status);
      } else {
        console.error('[arquivo único]', erro);
        resposta = respostaErro('Erro interno nesta versão de arquivo único.', 500);
      }
    }

    // Toda requisição que mexeu no estado é persistida
    gravar(estado);
    return resposta;
  }

  function rotear(estado, metodo, caminho, corpo, cabecalhos) {
    // -------------------------- autenticação --------------------------
    if (caminho === '/api/auth/registrar' || caminho === '/api/registrar') {
      if (metodo !== 'POST') return respostaErro('Método não permitido.', 405);
      return registrar(estado, corpo);
    }

    if (caminho === '/api/auth/entrar' || caminho === '/api/login') {
      if (metodo !== 'POST') return respostaErro('Método não permitido.', 405);
      return entrar(estado, corpo);
    }

    // -------------------------- rotas protegidas --------------------------
    if (caminho === '/api/auth/sair') {
      const usuario = exigirUsuario(estado, cabecalhos);
      const token = String(cabecalhos.Authorization || cabecalhos['X-Sessao'] || '').replace('Bearer ', '').trim();

      estado.sessoes = estado.sessoes.filter(
        (sessao) => sessao.token !== token && sessao.usuario_id !== usuario.id
      );

      return respostaJson({ ok: true });
    }

    if (caminho === '/api/auth/eu') {
      return respostaJson({ usuario: usuarioPublico(exigirUsuario(estado, cabecalhos)) });
    }

    if (caminho === '/api/dados') {
      return respostaJson(dadosDaConta(estado, exigirUsuario(estado, cabecalhos)));
    }

    if (caminho === '/api/backup.json') {
      const usuario = exigirUsuario(estado, cabecalhos);
      const json = exportarJson(estado, usuario);
      return respostaArquivo(
        JSON.stringify(json, null, 2),
        'application/json; charset=utf-8',
        `newstar-${nomeSeguro(usuario.nome)}-${dataArquivo()}.json`
      );
    }

    if (caminho === '/api/backup.sqlite') {
      exigirUsuario(estado, cabecalhos);
      throw new ErroValidacao(
        'Nesta versão de arquivo único o backup é em .json. Use "Baixar backup (.json)".',
        400
      );
    }

    if (caminho === '/api/backup/nuvem' || caminho === '/api/backup/nuvem/restaurar') {
      exigirUsuario(estado, cabecalhos);
      throw new ErroValidacao(
        'Backup em nuvem precisa da versão com servidor (Node.js). Nesta versão, use o backup .json.',
        400
      );
    }

    if (caminho === '/api/restaurar') {
      const usuario = exigirUsuario(estado, cabecalhos);
      const dados = corpo || {};

      if (dados.sqlite) {
        throw new ErroValidacao(
          'Não é possível ler .sqlite nesta versão de arquivo único. Use o backup .json.',
          400
        );
      }

      if (!dados.json || typeof dados.json !== 'object') {
        throw new ErroValidacao('Envie um arquivo .json para restaurar.');
      }

      const conjunto = conjuntoDoArquivo(dados.json);
      const resultado = importarConjunto(estado, usuario, conjunto, Boolean(dados.substituir), 'arquivo .json');

      return respostaJson(Object.assign({ ok: true }, resultado));
    }

    if (caminho === '/api/importar') {
      const usuario = exigirUsuario(estado, cabecalhos);
      const dados = corpo || {};

      if (!dados.dados || typeof dados.dados !== 'object') {
        throw new ErroValidacao('Nenhum dado antigo foi enviado.');
      }

      const conjunto = conjuntoDoArquivo(dados.dados);
      const resultado = importarConjunto(
        estado,
        usuario,
        conjunto,
        Boolean(dados.substituir),
        'dados antigos do navegador'
      );

      return respostaJson(Object.assign({ ok: true }, resultado));
    }

    // -------------------------- CRUD genérico --------------------------
    const partes = caminho.replace(/^\/api\//, '').split('/').filter(Boolean);
    if (partes.length >= 1) {
      const nome = partes[0];
      const config = entidadeConfig(nome);
      const usuario = exigirUsuario(estado, cabecalhos);
      const listas = listasDoUsuario(estado, usuario.id);
      const lista = listas[config.chave];

      const id = partes[1] ? Number(partes[1]) : null;

      if (metodo === 'POST' && partes.length === 1) {
        const dados = normalizarEntidade(config, corpo);

        if (config.upsertPor) {
          const existente = lista.find((item) => item[config.upsertPor] === dados[config.upsertPor]);
          if (existente) {
            Object.assign(existente, dados, { atualizado_em: agoraSQL() });
            auditar(estado, usuario.id, config.rotulo, 'alterar', `Atualizou (OS já existente): ${config.resumo(dados)}`, existente.id);
            return respostaJson(Object.assign({}, existente, { atualizado: true }));
          }
        }

        if (config.unico && lista.some((item) => item[config.unico] === dados[config.unico])) {
          throw new ErroValidacao(config.mensagemUnico, 409);
        }

        const registro = Object.assign({ id: proximoId(lista) }, dados, {
          criado_em: agoraSQL(),
          atualizado_em: agoraSQL(),
        });

        lista.push(registro);
        auditar(estado, usuario.id, config.rotulo, 'criar', `Criou: ${config.resumo(dados)}`, registro.id);

        return respostaJson(Object.assign({}, registro, { atualizado: false }), 201);
      }

      if (metodo === 'PUT' && id) {
        const existente = lista.find((item) => item.id === id);
        if (!existente) throw new ErroValidacao('Registro não encontrado.', 404);

        const mesclado = {};
        for (const campo of config.campos) {
          mesclado[campo] = Object.prototype.hasOwnProperty.call(corpo || {}, campo)
            ? corpo[campo]
            : existente[campo];
        }

        const dados = normalizarEntidade(config, mesclado);

        if (config.unico && lista.some((item) => item.id !== id && item[config.unico] === dados[config.unico])) {
          throw new ErroValidacao(config.mensagemUnico, 409);
        }

        Object.assign(existente, dados, { atualizado_em: agoraSQL() });
        auditar(estado, usuario.id, config.rotulo, 'alterar', `Atualizou (edição): ${config.resumo(dados)}`, id);

        return respostaJson(existente);
      }

      if (metodo === 'PATCH' && id && partes[2] === 'status') {
        const existente = lista.find((item) => item.id === id);
        if (!existente) throw new ErroValidacao('Registro não encontrado.', 404);
        if (!config.status) throw new ErroValidacao('Este registro não tem status.', 400);

        const novo = textoCurto(corpo && corpo.status, 40);
        if (!config.status.includes(novo)) {
          throw new ErroValidacao(`Status inválido. Use: ${config.status.join(', ')}.`);
        }

        existente.status = novo;
        existente.atualizado_em = agoraSQL();
        auditar(estado, usuario.id, config.rotulo, 'alterar', `Alterou o status: ${config.resumo(existente)}`, id);

        return respostaJson(existente);
      }

      if (metodo === 'DELETE' && id) {
        const posicao = lista.findIndex((item) => item.id === id);
        if (posicao === -1) throw new ErroValidacao('Registro não encontrado.', 404);

        const removido = lista[posicao];
        lista.splice(posicao, 1);
        auditar(estado, usuario.id, config.rotulo, 'excluir', `Excluiu: ${config.resumo(removido)}`, id);

        return respostaJson({ ok: true });
      }
    }

    throw new ErroValidacao('Rota não encontrada.', 404);
  }

  /* ---------------------------- fetch substituto ---------------------------- */

  const fetchOriginal = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

  window.fetch = function (entrada, opcoes) {
    const url = typeof entrada === 'string' ? entrada : entrada && entrada.url ? entrada.url : '';
    const caminho = url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0];

    if (!caminho.startsWith('/api/')) {
      if (fetchOriginal) return fetchOriginal(entrada, opcoes);
      return Promise.reject(new Error('Sem conexão.'));
    }

    const metodo = String((opcoes && opcoes.method) || 'GET').toUpperCase();
    const cabecalhos = (opcoes && opcoes.headers) || {};

    let corpo = null;
    if (opcoes && typeof opcoes.body === 'string') {
      try {
        corpo = JSON.parse(opcoes.body);
      } catch (_) {
        corpo = null;
      }
    }

    return Promise.resolve().then(() => tratar(metodo, caminho, corpo, cabecalhos));
  };

  /* Exposto para depuração no console do navegador */
  window.NewStarArquivoUnico = {
    chave: CHAVE_STORE,
    exportar: () => {
      const usuario = usuarioDaRequisicao(lerArmazenado() || criarEstadoInicial(), {
        Authorization: (window.localStorage.getItem('newstar_token') || ''),
      });
      return usuario ? exportarJson(lerArmazenado(), usuario) : null;
    },
    zerar: () => {
      try {
        window.localStorage.removeItem(CHAVE_STORE);
        window.localStorage.removeItem('newstar_token');
        window.localStorage.removeItem('newstar_email');
      } catch (_) {
        // ignore
      }
      window.location.reload();
    },
  };
})();
