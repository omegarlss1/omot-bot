const Campeonato = require('../../../db/models/campeonato');
const Time = require('../../../db/models/time');
const Partida = require('../../../db/models/partida');
const { emitir, EVENTOS } = require('../events');

class AdminError extends Error {
  constructor(mensagem, code) {
    super(mensagem);
    this.name = 'AdminError';
    this.code = code || 'ADMIN_ERROR';
  }
}

async function cancelarCampeonato({ campeonatoId, motivo = null, executadoPor = null }) {
  const camp = await Campeonato.findById(campeonatoId);
  if (!camp) throw new AdminError('Campeonato não encontrado.', 'CAMP_NAO_ENCONTRADO');
  if (camp.status === 'CANCELADO') {
    throw new AdminError('Campeonato já cancelado.', 'CAMP_JA_CANCELADO');
  }
  if (camp.status === 'FINALIZADO') {
    throw new AdminError('Campeonato finalizado não pode ser cancelado.', 'CAMP_FINALIZADO');
  }
  await Campeonato.updateOne({ _id: campeonatoId }, { $set: { status: 'CANCELADO' } });
  await Partida.updateMany(
    { campeonatoId, status: { $nin: ['FINALIZADA', 'WO', 'CANCELADA'] } },
    { $set: { status: 'CANCELADA' } }
  );
  emitir(EVENTOS.CAMPEONATO_CANCELADO, { campeonatoId: String(campeonatoId), motivo, executadoPor });
  return { ok: true, status: 'CANCELADO' };
}

async function reabrirCampeonato({ campeonatoId, executadoPor = null }) {
  const camp = await Campeonato.findById(campeonatoId);
  if (!camp) throw new AdminError('Campeonato não encontrado.', 'CAMP_NAO_ENCONTRADO');
  if (camp.status !== 'CANCELADO') {
    throw new AdminError('Apenas campeonatos cancelados podem ser reabertos.', 'CAMP_NAO_CANCELADO');
  }
  await Campeonato.updateOne({ _id: campeonatoId }, { $set: { status: 'EM_ANDAMENTO' } });
  emitir(EVENTOS.CAMPEONATO_REABERTO, { campeonatoId: String(campeonatoId), executadoPor });
  return { ok: true, status: 'EM_ANDAMENTO' };
}

async function desclassificarTime({ timeId, motivo = null, executadoPor = null }) {
  const time = await Time.findById(timeId);
  if (!time) throw new AdminError('Time não encontrado.', 'TIME_NAO_ENCONTRADO');
  if (time.desclassificado) {
    throw new AdminError('Time já desclassificado.', 'TIME_JA_DESCLASSIFICADO');
  }
  await Time.updateOne(
    { _id: timeId },
    { $set: { desclassificado: true, posicaoFinal: 999 } }
  );
  const oponentes = await Partida.find({
    campeonatoId: time.campeonatoId,
    $or: [{ timeA: timeId }, { timeB: timeId }],
    status: { $nin: ['FINALIZADA', 'WO', 'CANCELADA'] }
  });
  for (const p of oponentes) {
    await Partida.updateOne(
      { _id: p._id },
      { $set: { status: 'WO', vencedorId: String(p.timeA) === String(timeId) ? p.timeB : p.timeA } }
    );
  }
  emitir(EVENTOS.TIME_DESCLASSIFICADO, {
    timeId: String(timeId),
    campeonatoId: String(time.campeonatoId),
    motivo,
    executadoPor
  });
  return { ok: true, partidasAnuladas: oponentes.length };
}

async function ajustarPlacar({ partidaId, novoPlacar, executadoPor = null, motivo = null }) {
  const partida = await Partida.findById(partidaId);
  if (!partida) throw new AdminError('Partida não encontrada.', 'PARTIDA_NAO_ENCONTRADA');
  const match = String(novoPlacar || '').trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);
  if (!match) throw new AdminError('Formato de placar inválido. Use "2x1".', 'PLACAR_FORMATO');
  const golsA = Number(match[1]);
  const golsB = Number(match[2]);
  const vencedorId = golsA > golsB ? partida.timeA : (golsB > golsA ? partida.timeB : null);
  if (!vencedorId) {
    throw new AdminError('Empate não é permitido em mata-mata. Escolha um vencedor.', 'PLACAR_EMPATE');
  }
  await Partida.updateOne(
    { _id: partidaId },
    {
      $set: {
        placarEnviado: {
          timeA: { placar: novoPlacar, por: executadoPor, timestamp: new Date(), ajustadoPorOrg: true },
          timeB: { placar: novoPlacar, por: executadoPor, timestamp: new Date(), ajustadoPorOrg: true }
        },
        status: 'FINALIZADA',
        vencedorId
      }
    }
  );
  await Time.updateOne(
    { _id: partida.timeA },
    { $inc: { vitorias: String(vencedorId) === String(partida.timeA) ? 1 : 0, derrotas: String(vencedorId) === String(partida.timeA) ? 0 : 1, gols: golsA, golsSofridos: golsB, pontos: String(vencedorId) === String(partida.timeA) ? 3 : 0 } }
  );
  await Time.updateOne(
    { _id: partida.timeB },
    { $inc: { vitorias: String(vencedorId) === String(partida.timeB) ? 1 : 0, derrotas: String(vencedorId) === String(partida.timeB) ? 0 : 1, gols: golsB, golsSofridos: golsA, pontos: String(vencedorId) === String(partida.timeB) ? 3 : 0 } }
  );
  emitir(EVENTOS.PLACAR_AJUSTADO, { partidaId: String(partidaId), novoPlacar, vencedorId, executadoPor, motivo });
  emitir(EVENTOS.PARTIDA_FINALIZADA, { partidaId: String(partidaId), vencedorId, porWO: false, ajustado: true });
  return { ok: true, novoPlacar, vencedorId };
}

module.exports = { cancelarCampeonato, reabrirCampeonato, desclassificarTime, ajustarPlacar, AdminError };
