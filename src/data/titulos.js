const titulos = require('./titulos.json');

function extrairIconeTitulo(texto) {
  const t = String(texto || '').trim();
  const emojiInicio = t.match(/^([🥇🥈🥉🏅🏆✨🎯])/u);
  if (emojiInicio) return emojiInicio[1];

  const lower = t.toLowerCase();
  if (/vice/i.test(lower)) return '🥈';
  if (/mvp/i.test(lower)) return '🏅';
  if (/(?:^|\s)(?:1|1º|1o|primeiro)(?:$|\s|[ºoª-])/i.test(lower) || /1º|1o/i.test(lower)) return '🥇';
  if (/(?:^|\s)(?:2|2º|2o|segundo)(?:$|\s|[ºoª-])/i.test(lower) || /2º|2o/i.test(lower)) return '🥈';
  if (/(?:^|\s)(?:3|3º|3o|terceiro)(?:$|\s|[ºoª-])/i.test(lower) || /3º|3o/i.test(lower)) return '🥉';
  if (/campe(ao|ão)/i.test(lower)) return '🏆';

  return '🏆';
}

function getTitulosDoJogador(ids = []) {
  const lista = Array.isArray(ids) ? ids : [];
  if (!lista.length) return [];

  const catalogMap = new Map(titulos.map((t) => [t.id, t]));

  return lista.filter(Boolean).map((item) => {
    if (typeof item === 'object' && item.nome) return item;
    if (catalogMap.has(item)) return catalogMap.get(item);

    const icone = extrairIconeTitulo(item);
    return {
      id: String(item),
      nome: String(item),
      icone,
      raridade: 'Oficial',
      descricao: 'Título oficial conquistado em campeonato interno Ômega'
    };
  });
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

module.exports = {
  titulos,
  getTitulosDoJogador,
  getPaginaTitulos,
  formatarTitulosParaTexto,
  extrairIconeTitulo
};
