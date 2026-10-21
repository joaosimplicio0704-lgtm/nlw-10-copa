'use strict';

const { ENTIDADES, existeEntidade } = require('./entidades');

class ErroValidacao extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.name = 'ErroValidacao';
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
  valor_centavos: { tipo: 'inteiro', min: 0, max: 1_000_000_000_000 },
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

function rotulo(campo) {
  return ROTULOS[campo] || campo;
}

/** Converte "21/10/2026" ou "2026-10-21T..." em "2026-10-21". */
function normalizarData(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '';

  const brasileira = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brasileira) {
    const [, dia, mes, ano] = brasileira;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null; // sinaliza data inválida
}

function normalizarCampo(campo, valor) {
  const regra = REGRAS[campo] || { tipo: 'texto', max: 300 };

  if (regra.tipo === 'texto') {
    const texto = valor === null || valor === undefined ? '' : String(valor).trim();
    if (texto.length > regra.max) {
      throw new ErroValidacao(
        `O campo "${rotulo(campo)}" passou do limite de ${regra.max} caracteres.`
      );
    }
    return texto;
  }

  if (regra.tipo === 'data') {
    const data = normalizarData(valor);
    if (data === null) {
      throw new ErroValidacao(`A data do campo "${rotulo(campo)}" é inválida. Use DD/MM/AAAA.`);
    }
    return data;
  }

  if (regra.tipo === 'inteiro') {
    if (valor === null || valor === undefined || valor === '') return null;
    const numero = Math.round(Number(String(valor).replace(',', '.')));
    if (!Number.isFinite(numero)) {
      throw new ErroValidacao(`O campo "${rotulo(campo)}" precisa ser um número.`);
    }
    if (numero < regra.min || numero > regra.max) {
      throw new ErroValidacao(`O valor do campo "${rotulo(campo)}" está fora do permitido.`);
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
    if (json.length > regra.max) {
      throw new ErroValidacao('Os detalhes da OS são grandes demais.');
    }
    return json;
  }

  return valor;
}

/**
 * Valida e normaliza o corpo enviado para uma entidade.
 * `parcial = true` aceita apenas alguns campos (usado no PATCH).
 */
function normalizarEntidade(entidade, corpo, { parcial = false } = {}) {
  if (!existeEntidade(entidade)) throw new ErroValidacao('Entidade inválida.', 404);
  const config = ENTIDADES[entidade];

  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroValidacao('Corpo da requisição inválido.');
  }

  const dados = {};

  for (const campo of config.campos) {
    const presente = Object.prototype.hasOwnProperty.call(corpo, campo);

    if (!presente) {
      if (!parcial) {
        dados[campo] = campo === 'status' ? config.statusPadrao || null : null;
      }
      continue;
    }

    dados[campo] = normalizarCampo(campo, corpo[campo]);
  }

  if (!parcial) {
    for (const campo of config.obrigatorios || []) {
      const valor = dados[campo];
      if (valor === null || valor === undefined || String(valor).trim() === '') {
        throw new ErroValidacao(`O campo "${rotulo(campo)}" é obrigatório.`);
      }
    }

    if (config.status) {
      if (!dados.status) dados.status = config.statusPadrao;
      if (!config.status.includes(dados.status)) {
        throw new ErroValidacao(
          `Status inválido. Use: ${config.status.join(', ')}.`
        );
      }
    }
  }

  // No PATCH, se o status veio, precisa ser válido
  if (parcial && config.status && dados.status !== undefined && dados.status !== null) {
    if (!config.status.includes(dados.status)) {
      throw new ErroValidacao(`Status inválido. Use: ${config.status.join(', ')}.`);
    }
  }

  return dados;
}

function validarEmail(email) {
  const texto = String(email ?? '').trim().toLowerCase();
  if (texto.length > 180) throw new ErroValidacao('E-mail muito longo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto)) {
    throw new ErroValidacao('Informe um e-mail válido.');
  }
  return texto;
}

function validarSenha(senha, campo = 'Senha') {
  const texto = String(senha ?? '');
  if (texto.length < 8) throw new ErroValidacao(`${campo} precisa ter pelo menos 8 caracteres.`);
  if (texto.length > 200) throw new ErroValidacao(`${campo} é muito longa.`);
  return texto;
}

function validarNome(nome, campo = 'Nome') {
  const texto = String(nome ?? '').trim();
  if (texto.length < 2) throw new ErroValidacao(`Informe o ${campo.toLowerCase()}.`);
  if (texto.length > 120) throw new ErroValidacao(`${campo} muito longo.`);
  return texto;
}

function inteiroPositivo(valor, campo = 'id') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new ErroValidacao(`Identificador inválido (${campo}).`);
  }
  return numero;
}

module.exports = {
  ErroValidacao,
  normalizarEntidade,
  normalizarCampo,
  normalizarData,
  validarEmail,
  validarSenha,
  validarNome,
  inteiroPositivo,
};
