const Partida = require('../../../db/models/partida');
const Time = require('../../../db/models/time');
const { emitir, EVENTOS } = require('../events');

class CheckinError extends Error {
  constructor(mensagem, code) {
    super(mensagem);
    this.name = 'CheckinError';
    this.code = code || 'CHECKIN_ERROR';
  }
}

function dentroDaJanela(partida, agora = new Date()) {
  const inicio = new Date(partida.janelaCheckIn.inicio);
  const fim = new Date(partida.janelaCheckIn.fim);
  return agora >= inicio && agora <= fim;
}

async function registrarCheckIn(partidaId, timeId, userId) {
  const partida = await Partida.findById(partidaId);
  if (!partida) throw new CheckinError('Partida não encontrada.', 'CHECKIN_PARTIDA_NAO_ENCONTRADA');
  if (partida.status !== 'AGUARDANDO_CHECKIN') {
    throw new CheckinError('Partida não está aguardando check-in.', 'CHECKIN_STATUS_INCORRETO');
  }
  if (!dentroDaJanela(partida)) {
    throw new CheckinError('Fora da janela de check-in.', 'CHECKIN_FORA_JANELA');
  }
  const time = await Time.findById(timeId);
  if (!time) throw new CheckinError('Time não encontrado.', 'CHECKIN_TIME_NAO_ENCONTRADO');
  if (time.capitaoId !== userId) {
    throw new CheckinError('Apenas o capitão pode fazer check-in.', 'CHECKIN_NAO_CAPITAO');
  }
  const ehTimeA = String(partida.timeA) === String(timeId);
  const ehTimeB = String(partida.timeB) === String(timeId);
  if (!ehTimeA && !ehTimeB) {
    throw new CheckinError('Seu time não está nesta partida.', 'CHECKIN_TIME_INVALIDO');
  }
  const campo = ehTimeA ? 'checkIns.timeA' : 'checkIns.timeB';
  await Partida.updateOne(
    { _id: partidaId },
    { $set: { [campo]: { fez: true, timestamp: new Date(), porUserId: userId } } }
  );
  emitir(EVENTOS.CHECKIN_REALIZADO, { partidaId, timeId, lado: ehTimeA ? 'A' : 'B' });
  return { ok: true, lado: ehTimeA ? 'A' : 'B' };
}

async function verificarAdversarioFaltou(partidaId, timeReclamanteId, userId) {
  const partida = await Partida.findById(partidaId);
  if (!partida) throw new CheckinError('Partida não encontrada.', 'CHECKIN_PARTIDA_NAO_ENCONTRADA');
  const time = await Time.findById(timeReclamanteId);
  if (!time) throw new CheckinError('Time não encontrado.', 'CHECKIN_TIME_NAO_ENCONTRADO');
  if (time.capitaoId !== userId) {
    throw new CheckinError('Apenas o capitão pode declarar adversário ausente.', 'CHECKIN_NAO_CAPITAO');
  }
  const campo = String(partida.timeA) === String(timeReclamanteId) ? 'timeB' : 'timeA';
  const checkinAdversario = partida.checkIns?.[campo];
  if (checkinAdversario?.fez) {
    throw new CheckinError('O adversário já fez check-in.', 'CHECKIN_ADVERSARIO_PRESENTE');
  }
  return { partida, campoAdversario: campo };
}

async function registrarWO({ partidaId, timeVencedorId, motivo, declaranteId, juiz = false }) {
  const partida = await Partida.findById(partidaId);
  if (!partida) throw new CheckinError('Partida não encontrada.', 'CHECKIN_PARTIDA_NAO_ENCONTRADA');
  if (partida.status === 'FINALIZADA' || partida.status === 'WO') {
    throw new CheckinError('Partida já finalizada.', 'CHECKIN_JA_FINALIZADA');
  }
  const ehTimeA = String(partida.timeA) === String(timeVencedorId);
  const ehTimeB = String(partida.timeB) === String(timeVencedorId);
  if (!ehTimeA && !ehTimeB) {
    throw new CheckinError('Time vencedor não está nesta partida.', 'CHECKIN_TIME_INVALIDO');
  }
  const atualizacao = {
    status: 'WO',
    isWO: true,
    vencedorId: timeVencedorId,
    woDeclarado: { por: declaranteId, motivo, timestamp: new Date() }
  };
  await Partida.updateOne({ _id: partidaId }, { $set: atualizacao });
  await Time.updateOne(
    { _id: timeVencedorId },
    { $inc: { vitorias: 1, pontos: 3, woDados: 0, partidasAnuladasPorWO: [] } }
  );
  const perdedorId = ehTimeA ? partida.timeB : partida.timeA;
  await Time.updateOne(
    { _id: perdedorId },
    { $inc: { derrotas: 1, woTomados: 1 } }
  );
  emitir(EVENTOS.WO_REGISTRADO, { partidaId, vencedorId: timeVencedorId, motivo, juiz });
  emitir(EVENTOS.PARTIDA_FINALIZADA, { partidaId, vencedorId: timeVencedorId, porWO: true });
  return { ok: true };
}

module.exports = {
  registrarCheckIn,
  verificarAdversarioFaltou,
  registrarWO,
  dentroDaJanela,
  CheckinError
};
