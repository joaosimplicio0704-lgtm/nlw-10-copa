'use strict';

/**
 * Configuração das entidades que o front pode ler e escrever.
 *
 * A API é genérica (`/api/:entidade`), mas só aceita o que está nesta lista.
 * Os nomes de tabela e de colunas usados no SQL vêm daqui — nunca do usuário.
 * Isso elimina a injeção por nome de tabela que existia na versão antiga
 * (`UPDATE ${req.params.tabela} ...`).
 */
const ENTIDADES = {
  servicos: {
    tabela: 'servicos',
    chave: 'servicos',
    rotulo: 'Ordens de Serviço',
    campos: ['nome', 'num', 'status', 'notebook', 'cfont', 'cmaleta', 'descricao', 'data', 'local'],
    obrigatorios: ['nome', 'num', 'notebook', 'data'],
    status: ['Em andamento', 'Pronto', 'Entregue'],
    statusPadrao: 'Em andamento',
    unico: { campo: 'num', mensagem: 'Já existe um serviço com esse nº de OS nesta conta.' },
    resumo: (r) => `OS ${r.num} — ${r.nome}`,
  },

  telefones: {
    tabela: 'telefones',
    chave: 'telefones',
    rotulo: 'Contatos',
    campos: ['nome', 'tel1', 'tel2'],
    obrigatorios: ['nome', 'tel1'],
    resumo: (r) => `Contato de ${r.nome}`,
  },

  financeiro: {
    tabela: 'financeiro',
    chave: 'financeiro',
    rotulo: 'Financeiro',
    campos: ['nome', 'status', 'valor_centavos', 'notebook', 'referente'],
    obrigatorios: ['nome', 'valor_centavos'],
    status: ['DEVENDO', 'PAGO'],
    statusPadrao: 'DEVENDO',
    resumo: (r) => `Lançamento de ${r.nome}`,
  },

  pecas: {
    tabela: 'pecas',
    chave: 'pecas',
    rotulo: 'Peças e Fontes',
    campos: ['cliente', 'item', 'data', 'status'],
    obrigatorios: ['cliente', 'item', 'data'],
    status: ['Não devolvido', 'Devolvido'],
    statusPadrao: 'Não devolvido',
    resumo: (r) => `Peça "${r.item}" de ${r.cliente}`,
  },

  notebooks_loja: {
    tabela: 'notebooks_loja',
    chave: 'notebooksLoja',
    rotulo: 'Notebooks Loja',
    campos: ['notebook', 'modelo', 'processador', 'memoria', 'tela', 'bateria', 'nvme', 'ssd', 'video', 'preco', 'status'],
    obrigatorios: ['notebook', 'modelo'],
    status: ['Disponível', 'Reservado', 'Vendido'],
    statusPadrao: 'Disponível',
    resumo: (r) => `Notebook ${r.notebook} ${r.modelo}`,
  },

  os: {
    tabela: 'os',
    chave: 'osProntas',
    rotulo: 'OS Prontas',
    campos: ['numero', 'cliente', 'equipamento', 'data', 'detalhes'],
    obrigatorios: ['numero', 'cliente', 'equipamento', 'data'],
    // `numero` é único por conta: se já existir, o POST atualiza a OS existente
    upsertPor: 'numero',
    resumo: (r) => `OS ${r.numero} de ${r.cliente}`,
  },
};

/** Verifica se a entidade existe de verdade (evita __proto__, constructor etc.). */
function existeEntidade(nome) {
  return Object.prototype.hasOwnProperty.call(ENTIDADES, nome);
}

const CHAVES_POR_TABELA = Object.fromEntries(
  Object.values(ENTIDADES).map((config) => [config.tabela, config.chave])
);

module.exports = { ENTIDADES, CHAVES_POR_TABELA, existeEntidade };
