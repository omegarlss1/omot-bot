const regulamento = require('../../../config/regulamento');

class CorteError extends Error {
  constructor(mensagem, code) {
    super(mensagem);
    this.name = 'CorteError';
    this.code = code || 'CORTE_ERROR';
  }
}

function isPotenciaDe2(n) {
  if (!Number.isInteger(n) || n < 1) return false;
  return (n & (n - 1)) === 0;
}

function totalJogadoresPorModo(modo, totalInscritos) {
  const porTime = {
    '1v1': 1, '2v2': 2, '3v3': 3, '4v4': 4,
    '6v6': 6, '8v8': 8, '10v10': 10, '12v12': 12
  }[modo] || 3;
  if (porTime === 1) return totalInscritos;
  return Math.floor(totalInscritos / porTime);
}

function aplicarCorte({ totalInscritos, modo, tipoDupla = 'SORTEADA' }) {
  if (!Number.isInteger(totalInscritos) || totalInscritos < 0) {
    throw new CorteError('Total de inscritos inválido.', 'CORTE_TOTAL_INVALIDO');
  }
  if (tipoDupla !== 'SORTEADA') {
    return { removidos: 0, motivo: 'FIXA: corte apenas em SORTEADA, manter todos.' };
  }
  const jogadoresPorTime = {
    '1v1': 1, '2v2': 2, '3v3': 3, '4v4': 4,
    '6v6': 6, '8v8': 8, '10v10': 10, '12v12': 12
  }[modo] || 3;

  if (jogadoresPorTime === 1) {
    if (totalInscritos % 2 !== 0) {
      return { removidos: 1, motivo: 'Total ímpar em 1v1: remove o último inscrito.' };
    }
    return { removidos: 0, motivo: 'Total par em 1v1, sem corte.' };
  }

  if (totalInscritos % jogadoresPorTime === 0) {
    return { removidos: 0, motivo: 'Total divisível pelo tamanho do time.' };
  }
  if (jogadoresPorTime === 2) {
    return { removidos: 1, motivo: 'Total ímpar em 2v2: remove o último inscrito.' };
  }
  if (jogadoresPorTime === 3) {
    const resto = totalInscritos % 3;
    if (resto === 1) {
      return { removidos: 1, motivo: 'Total com resto 1 em 3v3: remove o último.' };
    }
    if (resto === 2) {
      return { removidos: 2, motivo: 'Total com resto 2 em 3v3: remove os 2 últimos.' };
    }
  }
  const resto = totalInscritos % jogadoresPorTime;
  return { removidos: resto, motivo: `Resto ${resto} na divisão por ${jogadoresPorTime}: remove os ${resto} últimos.` };
}

function avaliarAposCorte({ totalRestante, modo }) {
  const totalTimes = totalJogadoresPorModo(modo, totalRestante);
  if (isPotenciaDe2(totalTimes)) {
    return {
      potenciaDe2: true,
      totalTimes,
      formatoSugerido: 'single-elimination',
      menuFormatoNecessario: false
    };
  }
  const alternativas = regulamento.get('corte.formatosAlternativosQuandoNaoPotenciaDe2') || [
    'round-robin', 'grupos-mata-mata', 'double-elimination'
  ];
  return {
    potenciaDe2: false,
    totalTimes,
    formatoSugerido: null,
    menuFormatoNecessario: true,
    alternativas
  };
}

function executarCorteCompleto({ totalInscritos, modo, tipoDupla = 'SORTEADA' }) {
  const corte = aplicarCorte({ totalInscritos, modo, tipoDupla });
  const totalRestante = totalInscritos - corte.removidos;
  const avaliacao = avaliarAposCorte({ totalRestante, modo });
  return {
    removidos: corte.removidos,
    motivoCorte: corte.motivo,
    totalRestante,
    ...avaliacao
  };
}

module.exports = {
  CorteError,
  isPotenciaDe2,
  totalJogadoresPorModo,
  aplicarCorte,
  avaliarAposCorte,
  executarCorteCompleto
};
