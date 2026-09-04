class TwoTeamsTiebreaker {
  constructor({ partidaService, regulamento }) {
    if (!partidaService) throw new Error('[TwoTeamsTiebreaker] partidaService obrigatório.');
    this.partidaService = partidaService;
    this.regulamento = regulamento || {};
  }

  podeAplicar(grupos) {
    return Array.isArray(grupos) && grupos.length === 2;
  }

  resolver(classificados) {
    if (!this.podeAplicar(classificados)) {
      return { desempate: false, motivo: 'não há 2 times empatados' };
    }
    const [a, b] = classificados;
    const criterios = this.regulamento?.empateDoisCriterios || [
      'vitorias',
      'confronto-direto',
      'menor-wo-e-penalidades'
    ];

    for (const criterio of criterios) {
      const r = this._aplicarCriterio(criterio, a, b, classificados);
      if (r?.desempatou) {
        return { desempate: true, criterio, vencedorId: r.vencedorId, persistidoEm: classificados };
      }
    }
    return {
      desempate: false,
      motivo: 'todos os critérios esgotados sem desempate',
      precisaMD3: true
    };
  }

  _aplicarCriterio(criterio, a, b, _todos) {
    if (criterio === 'vitorias') {
      if (a.vitorias > b.vitorias) return { desempatou: true, vencedorId: a.timeId };
      if (b.vitorias > a.vitorias) return { desempatou: true, vencedorId: b.timeId };
      return { desempatou: false };
    }
    if (criterio === 'confronto-direto') {
      return { desempatou: false };
    }
    if (criterio === 'menor-wo-e-penalidades') {
      const woA = (a.woTomados || 0) + (a.woDados || 0);
      const woB = (b.woTomados || 0) + (b.woDados || 0);
      if (woA < woB) return { desempatou: true, vencedorId: a.timeId };
      if (woB < woA) return { desempatou: true, vencedorId: b.timeId };
      return { desempatou: false };
    }
    return { desempatou: false };
  }
}

module.exports = TwoTeamsTiebreaker;
