const { INDICADORES, INDICADORES_POR_CATEGORIA, CATEGORIAS_INDICADORES } = require('./indicadores');

const MAPA_INDICADORES = Object.fromEntries(
  Object.entries(INDICADORES_POR_CATEGORIA).map(([categoria, indicadores]) => [
    categoria,
    indicadores.map((indicador) => indicador.key)
  ])
);

function calcularCategorias(indicadoresDetalhados = {}) {
  const resultado = {};

  for (const categoria of Object.keys(MAPA_INDICADORES)) {
    const grupo = CATEGORIAS_INDICADORES[categoria];
    const itens = INDICADORES[grupo] || [];
    const totalPossivel = itens.reduce((soma, item) => soma + item.peso, 0);
    const pesosMarcados = itens
      .filter((item) => indicadoresDetalhados[item.key] === true)
      .reduce((soma, item) => soma + item.peso, 0);

    resultado[categoria] = calcularNotaCategoria(pesosMarcados, totalPossivel);
  }

  return resultado;
}

// CÁLCULO ÚNICO VÁLIDO AGORA
function calcularNotaCategoria(pesosMarcados, totalPossivel) {
  return Math.round((pesosMarcados / totalPossivel) * 100);
}
// pesosMarcados = soma dos pesos onde valor === true
// totalPossivel = soma de todos os pesos da categoria

module.exports = { MAPA_INDICADORES, calcularCategorias, calcularNotaCategoria };
