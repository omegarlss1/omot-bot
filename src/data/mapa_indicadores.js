const { INDICADORES_POR_CATEGORIA } = require('./indicadores');

const MAPA_INDICADORES = Object.fromEntries(
  Object.entries(INDICADORES_POR_CATEGORIA).map(([categoria, indicadores]) => [
    categoria,
    indicadores.map((indicador) => indicador.id)
  ])
);

function calcularCategorias(indicadoresDetalhados = {}) {
  const resultado = {};

  for (const [categoria, nomes] of Object.entries(MAPA_INDICADORES)) {
    const notas = nomes
      .map((chave) => Number(indicadoresDetalhados[chave] ?? 0))
      .filter((valor) => Number.isFinite(valor));

    if (!notas.length) {
      resultado[categoria] = 0;
      continue;
    }

    const media = notas.reduce((soma, valor) => soma + valor, 0) / notas.length;
    resultado[categoria] = Math.round((media / 10) * 100);
  }

  return resultado;
}

module.exports = { MAPA_INDICADORES, calcularCategorias }; 
