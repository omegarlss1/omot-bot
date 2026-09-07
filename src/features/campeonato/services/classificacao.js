const Time = require('../../../db/models/time');
const Partida = require('../../../db/models/partida');
const Campeonato = require('../../../db/models/campeonato');
const { StartGGAdapter } = require('../adapters/StartGGAdapter');
const regulamento = require('../../../config/regulamento');
const { emitir, EVENTOS } = require('../events');
const TwoTeamsTiebreaker = require('../strategies/TwoTeamsTiebreaker');
const ThreePlusTeamsTiebreaker = require('../strategies/ThreePlusTeamsTiebreaker');

const partidaServiceMock = { listarPorCampeonato: async () => [] };

function getStrategies() {
  return {
    dois: new TwoTeamsTiebreaker({ partidaService: partidaServiceMock, regulamento }),
    tresMais: new ThreePlusTeamsTiebreaker({ partidaService: partidaServiceMock, regulamento })
  };
}

function pontuacaoVitoria() {
  return regulamento.get('pontuacao.vitoria') ?? 3;
}
function pontuacaoWO() {
  return regulamento.get('pontuacao.wo') ?? 0;
}

function construirPontuacaoBase(times, partidas) {
  const stats = new Map();
  for (const t of times) {
    stats.set(String(t._id), {
      timeId: String(t._id),
      nome: t.nome || `Time ${String(t._id).slice(-4)}`,
      pontos: 0,
      vitorias: 0,
      derrotas: 0,
      woTomados: 0,
      woDados: 0,
      gameWinPercent: t.gameWinPercent,
      buchholz: t.buchholz,
      penalidades: t.penalidades || 0,
      partidasAnuladasPorWO: [],
      partidasFinalizadas: 0
    });
  }
  for (const p of partidas) {
    if (p.status !== 'FINALIZADA' && p.status !== 'WO') continue;
    const aId = p.timeA ? String(p.timeA) : null;
    const bId = p.timeB ? String(p.timeB) : null;
    if (!aId || !bId) continue;
    if (!stats.has(aId) || !stats.has(bId)) continue;

    const sA = stats.get(aId);
    const sB = stats.get(bId);
    sA.partidasFinalizadas++;
    sB.partidasFinalizadas++;

    if (p.status === 'WO') {
      const vencedorId = p.vencedorId ? String(p.vencedorId) : null;
      if (vencedorId === aId) {
        sA.pontos += pontuacaoVitoria();
        sA.vitorias++;
        sB.woTomados++;
        sB.derrotas++;
      } else if (vencedorId === bId) {
        sB.pontos += pontuacaoVitoria();
        sB.vitorias++;
        sA.woTomados++;
        sA.derrotas++;
      }
      continue;
    }

    if (p.vencedorId) {
      const vencedor = String(p.vencedorId);
      if (vencedor === aId) {
        sA.pontos += pontuacaoVitoria();
        sA.vitorias++;
        sB.derrotas++;
      } else if (vencedor === bId) {
        sB.pontos += pontuacaoVitoria();
        sB.vitorias++;
        sA.derrotas++;
      }
    }
  }
  return Array.from(stats.values());
}

function detectarEmpates(ranking) {
  const grupos = [];
  const mapa = new Map();
  for (const item of ranking) {
    const chave = `${item.pontos}|${item.vitorias}`;
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(item);
  }
  for (const [, grupo] of mapa) {
    if (grupo.length >= 2) grupos.push(grupo);
  }
  return grupos;
}

async function calcularClassificacao(campeonatoId) {
  const times = await Time.find({ campeonatoId }).lean();
  if (times.length === 0) {
    return { classificacao: [], desempatesPendentes: [] };
  }
  const partidas = await Partida.find({ campeonatoId }).lean();
  const pontuacao = construirPontuacaoBase(times, partidas);
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  let startggMetrics = new Map();
  if (campeonato?.startgg?.tournamentId && times.some((time) => time.startggEntrantId)) {
    try {
      startggMetrics = await new StartGGAdapter().fetchStandingsMetrics(campeonato.startgg.tournamentId);
      for (const item of pontuacao) {
        const time = times.find((candidate) => String(candidate._id) === item.timeId);
        const metric = time?.startggEntrantId && startggMetrics.get(String(time.startggEntrantId));
        if (metric) Object.assign(item, metric);
      }
    } catch (error) {
      console.warn(`[classificacao] Start.gg indisponível, usando fallback local: ${error.message}`);
    }
  }

  const ordenado = [...pontuacao].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
    if ((b.gameWinPercent ?? -1) !== (a.gameWinPercent ?? -1)) return (b.gameWinPercent ?? -1) - (a.gameWinPercent ?? -1);
    if (a.woTomados + a.penalidades !== b.woTomados + b.penalidades) return (a.woTomados + a.penalidades) - (b.woTomados + b.penalidades);
    if ((b.buchholz ?? -1) !== (a.buchholz ?? -1)) return (b.buchholz ?? -1) - (a.buchholz ?? -1);
    return a.nome.localeCompare(b.nome);
  });

  const strategies = getStrategies();
  const desempatesPendentes = [];
  const grupos = detectarEmpates(ordenado);

  for (const grupo of grupos.filter((item) => item.length === 2)) {
    const ids = new Set(grupo.map((item) => item.timeId));
    const confronto = partidas.find((partida) => {
      if (partida.status !== 'FINALIZADA' || !partida.vencedorId) return false;
      return ids.has(String(partida.timeA)) && ids.has(String(partida.timeB));
    });
    if (confronto) {
      const vencedorId = String(confronto.vencedorId);
      const vencedor = grupo.find((item) => item.timeId === vencedorId);
      const perdedor = grupo.find((item) => item.timeId !== vencedorId);
      if (vencedor && perdedor) {
        const inicio = ordenado.findIndex((item) => item.timeId === vencedor.timeId);
        const fim = ordenado.findIndex((item) => item.timeId === perdedor.timeId);
        if (inicio > fim) [ordenado[inicio], ordenado[fim]] = [ordenado[fim], ordenado[inicio]];
      }
    }
  }

  for (const grupo of grupos) {
    if (strategies.tresMais.podeAplicar(grupo)) {
      const r = strategies.tresMais.resolver(grupo);
      if (r.precisaTriangular) {
        desempatesPendentes.push({ tipo: 'TRIANGULAR_MD1', times: r.times });
        emitir(EVENTOS.DESEMPATE_NECESSARIO, { tipo: 'TRIANGULAR_MD1', times: r.times, campeonatoId });
      } else if (r.precisaMD3) {
        desempatesPendentes.push({ tipo: 'MD3', times: r.times });
        emitir(EVENTOS.DESEMPATE_NECESSARIO, { tipo: 'MD3', times: r.times, campeonatoId });
      } else if (r.desempate) {
        reordenar(ordenado, r);
      }
    } else if (strategies.dois.podeAplicar(grupo)) {
      const r = strategies.dois.resolver(grupo);
      if (r.precisaMD3) {
        desempatesPendentes.push({ tipo: 'MD3', precisaMD3: true, times: grupo.map((g) => g.timeId) });
        emitir(EVENTOS.DESEMPATE_NECESSARIO, { tipo: 'MD3', times: grupo.map((g) => g.timeId), campeonatoId });
      } else if (r.desempate) {
        reordenar(ordenado, r);
      }
    }
  }

  const classificacao = ordenado.map((item, idx) => ({ ...item, posicao: idx + 1 }));
  emitir(EVENTOS.CLASSIFICACAO_CALCULADA, { campeonatoId, total: classificacao.length });
  return { classificacao, desempatesPendentes };
}

function reordenar(ordenado, resultado) {
  if (!resultado?.vencedorId) return;
  const vencedorIdx = ordenado.findIndex((t) => t.timeId === resultado.vencedorId);
  if (vencedorIdx <= 0) return;
  const vencedor = ordenado[vencedorIdx];
  ordenado.splice(vencedorIdx, 1);
  const grupo = ordenado.filter((t) =>
    t.pontos === vencedor.pontos && t.vitorias === vencedor.vitorias
  );
  if (grupo.length === 0) {
    ordenado.unshift(vencedor);
  } else {
    const idx = ordenado.findIndex((t) => t.timeId === grupo[0].timeId);
    ordenado.splice(idx, 0, vencedor);
  }
}

module.exports = { calcularClassificacao, construirPontuacaoBase, detectarEmpates };
