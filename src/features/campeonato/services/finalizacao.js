const Campeonato = require('../../../db/models/campeonato');
const Time = require('../../../db/models/time');
const Partida = require('../../../db/models/partida');
const { emitir, EVENTOS } = require('../events');
const { calcularClassificacao } = require('./classificacao');

class FinalizacaoError extends Error {
  constructor(mensagem, code) {
    super(mensagem);
    this.name = 'FinalizacaoError';
    this.code = code || 'FINALIZACAO_ERROR';
  }
}

function _partidasFinalizadas(campeonatoId) {
  return Partida.find({ campeonatoId, status: { $in: ['FINALIZADA', 'WO'] } }).lean();
}

function _posicionarSemifinalistas(perfis) {
  return perfis
    .filter((p) => !p.desclassificado)
    .sort((a, b) => b.pontos - a.pontos || b.vitorias - a.vitorias || a.woTomados - b.woTomados);
}

async function finalizarCampeonato({ campeonatoId, forcado = false, definirPosicoes = true }) {
  const camp = await Campeonato.findById(campeonatoId);
  if (!camp) throw new FinalizacaoError('Campeonato não encontrado.', 'CAMP_NAO_ENCONTRADO');
  if (camp.status === 'FINALIZADO' && !forcado) {
    throw new FinalizacaoError('Campeonato já finalizado.', 'CAMP_JA_FINALIZADO');
  }
  if (camp.status === 'CANCELADO' && !forcado) {
    throw new FinalizacaoError('Campeonato cancelado não pode ser finalizado.', 'CAMP_CANCELADO');
  }
  const times = await Time.find({ campeonatoId }).lean();
  if (times.length === 0) {
    throw new FinalizacaoError('Sem times para finalizar.', 'CAMP_SEM_TIMES');
  }
  const partidas = await _partidasFinalizadas(campeonatoId);
  const { classificacao } = await calcularClassificacao(times, partidas);
  if (classificacao.length === 0) {
    throw new FinalizacaoError('Nenhuma classificação pôde ser calculada.', 'CAMP_SEM_CLASSIFICACAO');
  }
  if (definirPosicoes) {
    const posicoes = _posicionarSemifinalistas(classificacao);
    for (let i = 0; i < posicoes.length; i++) {
      await Time.updateOne({ _id: posicoes[i]._id }, { $set: { posicaoFinal: i + 1 } });
    }
  }
  await Campeonato.updateOne({ _id: campeonatoId }, { $set: { status: 'FINALIZADO' } });
  const vencedor = classificacao[0];
  emitir(EVENTOS.CAMPEAO_DEFINIDO, {
    campeonatoId: String(campeonatoId),
    vencedorId: String(vencedor._id),
    vencedorNome: vencedor.nome,
    posicoes: classificacao.slice(0, 3).map((c, i) => ({
      posicao: i + 1,
      timeId: String(c._id),
      nome: c.nome
    }))
  });
  return {
    ok: true,
    campeonatoId: String(campeonatoId),
    vencedor: { id: String(vencedor._id), nome: vencedor.nome, pontos: vencedor.pontos },
    pódio: classificacao.slice(0, 3).map((c, i) => ({ posicao: i + 1, id: String(c._id), nome: c.nome }))
  };
}

async function obterClassificacaoFinal(campeonatoId) {
  const times = await Time.find({ campeonatoId }).lean();
  if (times.length === 0) return [];
  const partidas = await _partidasFinalizadas(campeonatoId);
  const { classificacao } = await calcularClassificacao(times, partidas);
  return classificacao.map((c, i) => ({ ...c, posicaoFinal: i + 1 }));
}

module.exports = { finalizarCampeonato, obterClassificacaoFinal, FinalizacaoError, _posicionarSemifinalistas, _partidasFinalizadas };
