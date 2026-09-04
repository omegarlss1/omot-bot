class ThreePlusTeamsTiebreaker {
  constructor({ partidaService, regulamento, campeonatoService }) {
    if (!partidaService) throw new Error('[ThreePlusTeamsTiebreaker] partidaService obrigatório.');
    this.partidaService = partidaService;
    this.regulamento = regulamento || {};
    this.campeonatoService = campeonatoService;
  }

  podeAplicar(grupos) {
    return Array.isArray(grupos) && grupos.length >= 3;
  }

  resolver(classificados) {
    if (!this.podeAplicar(classificados)) {
      return { desempate: false, motivo: 'não há 3+ times empatados' };
    }
    const mini = this._calcularMiniTabela(classificados);

    const ordenado = [...mini.classificacao].sort((x, y) => {
      if (y.pontuacaoMiniTabela !== x.pontuacaoMiniTabela) {
        return y.pontuacaoMiniTabela - x.pontuacaoMiniTabela;
      }
      return y.vitoriasMiniTabela - x.vitoriasMiniTabela;
    });

    const topPontos = ordenado[0]?.pontuacaoMiniTabela || 0;
    const topVitorias = ordenado[0]?.vitoriasMiniTabela || 0;
    const empatadosNoTopo = ordenado.filter(
      (t) => t.pontuacaoMiniTabela === topPontos && t.vitoriasMiniTabela === topVitorias
    );

    if (empatadosNoTopo.length === 1) {
      return {
        desempate: true,
        criterio: 'mini-tabela',
        vencedorId: empatadosNoTopo[0].timeId,
        ordenados: ordenado.map((t) => t.timeId)
      };
    }
    if (empatadosNoTopo.length === 2) {
      return {
        desempate: false,
        motivo: '2 times no topo após mini-tabela',
        precisaMD3: true,
        times: empatadosNoTopo.map((t) => t.timeId)
      };
    }
    return {
      desempate: false,
      motivo: '3+ times no topo após mini-tabela',
      precisaTriangular: true,
      tipo: 'MD1',
      times: empatadosNoTopo.map((t) => t.timeId)
    };
  }

  _calcularMiniTabela(grupos) {
    const stats = grupos.map((g) => ({
      timeId: g.timeId,
      pontuacaoMiniTabela: g.pontos || 0,
      vitoriasMiniTabela: g.vitorias || 0
    }));
    return { classificacao: stats };
  }
}

module.exports = ThreePlusTeamsTiebreaker;
