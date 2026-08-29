const titulos = require('./titulos.json');

function getTitulosDoJogador(ids = []) {
  const lista = Array.isArray(ids) ? ids : [];
  const idsSet = new Set(lista.filter(Boolean));

  if (!idsSet.size) return [];

  return titulos.filter((titulo) => idsSet.has(titulo.id));
}

function getPaginaTitulos(ids = [], pagina = 1, porPagina = 15) {
  const todos = getTitulosDoJogador(ids);
  const totalPaginas = Math.max(1, Math.ceil(todos.length / porPagina));
  const paginaAtual = Math.min(Math.max(1, Number(pagina) || 1), totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  const fim = inicio + porPagina;

  return {
    paginaAtual,
    totalPaginas,
    itens: todos.slice(inicio, fim),
    total: todos.length
  };
}

function formatarTitulosParaTexto(ids = [], pagina = 1, porPagina = 15) {
  const { itens } = getPaginaTitulos(ids, pagina, porPagina);

  if (!itens.length) return 'Nenhum título para mostrar.';

  return itens.map((titulo) => `${titulo.icone} **${titulo.nome}** (${titulo.raridade})`).join('\n');
}

module.exports = { titulos, getTitulosDoJogador, getPaginaTitulos, formatarTitulosParaTexto };
