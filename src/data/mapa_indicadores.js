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
    const notas = itens.map((item) => ({
      marcado: Boolean(indicadoresDetalhados[item.key]),
      peso: Number(item.peso) || 0
    }));

    if (!notas.length) {
      resultado[categoria] = 0;
      continue;
    }

    const totalPossivel = notas.reduce((soma, item) => soma + item.peso, 0);
    const somaPesosMarcados = notas
      .filter((item) => item.marcado)
      .reduce((soma, item) => soma + item.peso, 0);
    resultado[categoria] = totalPossivel ? Math.round((somaPesosMarcados / totalPossivel) * 100) : 0;
  }

  return resultado;
}

module.exports = { MAPA_INDICADORES, calcularCategorias }; 
