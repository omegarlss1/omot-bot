const Partida = require('../../../db/models/partida');
const Time = require('../../../db/models/time');
const Campeonato = require('../../../db/models/campeonato');
const { emitir, EVENTOS } = require('../events');
const { StartGGAdapter } = require('../adapters/StartGGAdapter');

class PlacarError extends Error {
  constructor(mensagem, code) {
    super(mensagem);
    this.name = 'PlacarError';
    this.code = code || 'PLACAR_ERROR';
  }
}

let _adapter = null;
function _getAdapter() {
  if (_adapter) return _adapter;
  _adapter = new StartGGAdapter();
  return _adapter;
}
function _setAdapter(adapter) { _adapter = adapter; }

const _partidaModel = {
  findById: (id) => Partida.findById(id)
};
const _campeonatoModel = {
  findById: (id) => Campeonato.findById(id)
};
function _setModels({ partida, campeonato } = {}) {
  if (partida) _partidaModel.findById = partida.findById;
  if (campeonato) _campeonatoModel.findById = campeonato.findById;
}

function parsePlacar(texto) {
  const match = String(texto || '').trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);
  if (!match) return null;
  return { golsA: Number(match[1]), golsB: Number(match[2]) };
}

async function enviarPlacar({ partidaId, timeId, userId, placar, prints = [], duelos = [] }) {
  const partida = await Partida.findById(partidaId);
  if (!partida) throw new PlacarError('Partida não encontrada.', 'PLACAR_PARTIDA_NAO_ENCONTRADA');
  if (partida.status !== 'AGUARDANDO_PLACAR' && partida.status !== 'AGUARDANDO_VALIDACAO') {
    throw new PlacarError('Partida não está aguardando placar.', 'PLACAR_STATUS_INCORRETO');
  }
  const time = await Time.findById(timeId);
  if (!time) throw new PlacarError('Time não encontrado.', 'PLACAR_TIME_NAO_ENCONTRADO');
  if (time.capitaoId !== userId) {
    throw new PlacarError('Apenas o capitão pode enviar placar.', 'PLACAR_NAO_CAPITAO');
  }
  const parsed = parsePlacar(placar);
  if (!parsed) {
    throw new PlacarError('Formato de placar inválido. Use "2x1", "3x0" etc.', 'PLACAR_FORMATO');
  }
  const ehTimeA = String(partida.timeA) === String(timeId);
  const ehTimeB = String(partida.timeB) === String(timeId);
  if (!ehTimeA && !ehTimeB) {
    throw new PlacarError('Seu time não está nesta partida.', 'PLACAR_TIME_INVALIDO');
  }
  const campo = ehTimeA ? 'placarEnviado.timeA' : 'placarEnviado.timeB';
  const atualizacao = {
    [campo]: {
      por: userId,
      placar,
      prints,
      duelosRegistrados: duelos,
      timestamp: new Date()
    },
    status: 'AGUARDANDO_VALIDACAO'
  };
  await Partida.updateOne({ _id: partidaId }, { $set: atualizacao });
  emitir(EVENTOS.PLACAR_ENVIADO, { partidaId, timeId, placar, lado: ehTimeA ? 'A' : 'B' });
  return { ok: true, lado: ehTimeA ? 'A' : 'B', placar };
}

async function validarPlacar({ partidaId, userId, timeId, aceito }) {
  const partida = await Partida.findById(partidaId);
  if (!partida) throw new PlacarError('Partida não encontrada.', 'PLACAR_PARTIDA_NAO_ENCONTRADA');
  if (partida.status !== 'AGUARDANDO_VALIDACAO') {
    throw new PlacarError('Partida não está aguardando validação.', 'PLACAR_STATUS_INCORRETO');
  }
  const time = await Time.findById(timeId);
  if (!time) throw new PlacarError('Time não encontrado.', 'PLACAR_TIME_NAO_ENCONTRADO');
  if (time.capitaoId !== userId) {
    throw new PlacarError('Apenas o capitão pode validar/contestar.', 'PLACAR_NAO_CAPITAO');
  }
  if (!aceito) {
    await Partida.updateOne(
      { _id: partidaId },
      {
        $set: {
          status: 'EM_DISPUTA_ORGANIZADOR',
          [`validacao.time${String(partida.timeA) === String(timeId) ? 'A' : 'B'}Validou`]: false
        }
      }
    );
    emitir(EVENTOS.PLACAR_CONTESTADO, { partidaId, timeId });
    return { ok: true, status: 'EM_DISPUTA_ORGANIZADOR' };
  }
  const campo = String(partida.timeA) === String(timeId) ? 'timeAValidou' : 'timeBValidou';
  const outroCampo = String(partida.timeA) === String(timeId) ? 'timeBValidou' : 'timeAValidou';
  const novoEstado = { [`validacao.${campo}`]: true };
  const placarA = partida.placarEnviado?.timeA?.placar;
  const placarB = partida.placarEnviado?.timeB?.placar;
  const placaresConvergem = placarA && placarB && placarA === placarB;
  if (placaresConvergem && partida.validacao?.[outroCampo]) {
    novoEstado.status = 'FINALIZADA';
    const parsed = parsePlacar(placarA);
    const vencedorId = parsed.golsA > parsed.golsB ? partida.timeA : partida.timeB;
    novoEstado.vencedorId = vencedorId;
  }
  await Partida.updateOne({ _id: partidaId }, { $set: novoEstado });
  if (novoEstado.status === 'FINALIZADA') {
    await aplicarPontuacao(partidaId, novoEstado.vencedorId, parsed?.golsA, parsed?.golsB);
    emitir(EVENTOS.PLACAR_VALIDADO, { partidaId, placar: placarA });
    emitir(EVENTOS.PARTIDA_FINALIZADA, { partidaId, vencedorId: novoEstado.vencedorId, porWO: false });
    await _tentarReportarStartGG(partidaId, novoEstado.vencedorId, placarA).catch(() => null);
  }
  return { ok: true, status: novoEstado.status || 'AGUARDANDO_VALIDACAO' };
}

async function aplicarPontuacao(partidaId, vencedorId, golsA, golsB) {
  const perdedorId = vencedorId ? (await Partida.findById(partidaId)).timeA : null;
  if (!vencedorId || !perdedorId) return;
  await Time.updateOne(
    { _id: vencedorId },
    { $inc: { vitorias: 1, pontos: 3, gols: golsA || 0, golsSofridos: golsB || 0 } }
  );
  await Time.updateOne(
    { _id: perdedorId },
    { $inc: { derrotas: 1, gols: golsB || 0, golsSofridos: golsA || 0 } }
  );
}

async function _tentarReportarStartGG(partidaId, vencedorId, placar) {
  const partida = await _partidaModel.findById(partidaId);
  if (!partida) return { ok: false, motivo: 'PARTIDA_NAO_ENCONTRADA' };
  if (!partida.startggSetId) return { ok: false, motivo: 'SEM_SET_ID' };
  const camp = await _campeonatoModel.findById(partida.campeonatoId);
  if (!camp || !camp.startgg?.tournamentId) return { ok: false, motivo: 'SEM_TOURNAMENT_ID' };
  try {
    const adapter = _getAdapter();
    const res = await adapter.reportScore({ setId: partida.startggSetId, winnerId: vencedorId, gameNum: 1 });
    emitir(EVENTOS.STARTGG_SCORE_REPORTADO, { partidaId: String(partidaId), setId: partida.startggSetId, res });
    return { ok: true, res };
  } catch (err) {
    return { ok: false, erro: err?.message };
  }
}

module.exports = { enviarPlacar, validarPlacar, parsePlacar, PlacarError, _setAdapter, _setModels, _tentarReportarStartGG };
