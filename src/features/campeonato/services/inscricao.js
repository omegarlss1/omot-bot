const Time = require('../../../db/models/time');
const Campeonato = require('../../../db/models/campeonato');
const PerfilMembro = require('../../../db/models/perfilMembro');
const { validarInscricao, InscricaoError } = require('../validators/inscricao');
const { executarCorteCompleto } = require('../validators/corte');
const { emitir, EVENTOS } = require('../events');

async function findCampeonatoPorCanalInscricao(canalId) {
  return Campeonato.findOne({ 'canais.inscricoes': canalId });
}

async function listarInscricoes(campeonatoId) {
  return Time.find({ campeonatoId }).sort({ criadoEm: 1 });
}

async function jogadorJaInscrito(campeonatoId, userId) {
  const time = await Time.findOne({
    campeonatoId,
    $or: [
      { capitaoId: userId },
      { 'jogadores.userId': userId }
    ]
  }).lean();
  return Boolean(time);
}

async function obterCapitaoInfo(member, perfil) {
  return {
    userId: member.id,
    rankSnapshot: perfil.rankX1 || perfil.rankX2 || perfil.picoRank,
    nickSnapshot: perfil.nick_principal,
    isSubstituto: false,
    isCapitao: true,
    partidasJogadas: 0
  };
}

async function inscreverCapitao({ guild, member, campeonato, nomeTime }) {
  if (!campeonato) throw new InscricaoError('Campeonato não encontrado.', 'INSCRICAO_CAMP_NAO_ENCONTRADO');
  if (campeonato.status !== 'INSCRICOES_ABERTAS') {
    throw new InscricaoError('Inscrições não estão abertas.', 'INSCRICAO_FECHADAS');
  }
  if (await jogadorJaInscrito(campeonato._id, member.id)) {
    throw new InscricaoError('Você já está inscrito neste campeonato.', 'INSCRICAO_DUPLICADA');
  }
  const perfil = await PerfilMembro.findOne({ guildId: guild.id, userId: member.id });
  const dadosCapitao = validarInscricao({
    member,
    perfil,
    ranksDisponiveis: campeonato.rank ? [campeonato.rank] : (campeonato.ranksSelecionados || [])
  });

  const capitao = await obterCapitaoInfo(member, perfil);
  const time = await Time.create({
    guildId: guild.id,
    campeonatoId: campeonato._id,
    capitaoId: member.id,
    jogadores: [capitao],
    nome: nomeTime?.trim() || `Time de ${perfil.nick_principal}`
  });

  emitir(EVENTOS.INSCRICAO_REALIZADA, {
    timeId: time._id,
    campeonatoId: campeonato._id,
    capitaoId: member.id,
    rank: dadosCapitao.rank
  });

  return { time, dadosCapitao };
}

async function fecharInscricoes(campeonatoId) {
  const camp = await Campeonato.findByIdAndUpdate(
    campeonatoId,
    { $set: { status: 'INSCRICOES_FECHADAS' } },
    { new: true }
  );
  if (camp) emitir(EVENTOS.INSCRICOES_FECHADAS, { campeonatoId });
  return camp;
}

async function executarCorte({ campeonatoId, tipoDupla = 'SORTEADA' }) {
  const camp = await Campeonato.findById(campeonatoId);
  if (!camp) throw new Error('Campeonato não encontrado para corte.');
  const inscricoes = await listarInscricoes(campeonatoId);
  const totalJogadores = inscricoes.reduce((acc, t) => acc + (t.jogadores?.length || 0), 0);

  const resultado = executarCorteCompleto({
    totalInscritos: totalJogadores,
    modo: camp.modo,
    tipoDupla
  });

  if (resultado.removidos > 0) {
    const todosJogadoresOrdenados = inscricoes
      .flatMap((t) => (t.jogadores || []).map((j) => ({ ...j.toObject(), timeId: t._id })))
      .sort((a, b) => new Date(a.inscritoEm || 0) - new Date(b.inscritoEm || 0));
    const paraRemover = todosJogadoresOrdenados.slice(-resultado.removidos).map((j) => j.userId);
    for (const time of inscricoes) {
      const novoJogadores = time.jogadores.filter((j) => !paraRemover.includes(j.userId));
      if (novoJogadores.length === 0) {
        await Time.deleteOne({ _id: time._id });
      } else if (novoJogadores.length !== time.jogadores.length) {
        time.jogadores = novoJogadores;
        if (!novoJogadores.some((j) => j.userId === time.capitaoId) && novoJogadores.length > 0) {
          time.capitaoId = novoJogadores[0].userId;
          novoJogadores[0].isCapitao = true;
        }
        await time.save();
      }
    }
    emitir(EVENTOS.CORTE_REALIZADO, {
      campeonatoId,
      removidos: paraRemover,
      motivo: resultado.motivoCorte
    });
  }

  return {
    ...resultado,
    totalJogadoresAntes: totalJogadores,
    totalJogadoresDepois: totalJogadores - resultado.removidos,
    precisaEscolherFormato: resultado.menuFormatoNecessario
  };
}

async function definirFormato(campeonatoId, formato) {
  const camp = await Campeonato.findByIdAndUpdate(
    campeonatoId,
    { $set: { formato } },
    { new: true }
  );
  if (camp) emitir(EVENTOS.FORMATO_ESCOLHIDO, { campeonatoId, formato });
  return camp;
}

module.exports = {
  findCampeonatoPorCanalInscricao,
  listarInscricoes,
  jogadorJaInscrito,
  inscreverCapitao,
  fecharInscricoes,
  executarCorte,
  definirFormato
};
