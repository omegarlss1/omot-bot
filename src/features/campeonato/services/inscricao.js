const Time = require('../../../db/models/time');
const Campeonato = require('../../../db/models/campeonato');
const PerfilMembro = require('../../../db/models/perfilMembro');
const { validarInscricao, InscricaoError } = require('../validators/inscricao');
const { executarCorteCompleto } = require('../validators/corte');
const { emitir, EVENTOS } = require('../events');
const { criarCanaisTime } = require('../permissions');

async function findCampeonatoPorCanalInscricao(canalId) {
  const campeonato = await Campeonato.findOne({ 'canais.inscricoes': canalId });
  await fecharPorPrazo(campeonato);
  return campeonato;
}

async function fecharPorPrazo(campeonato) {
  if (campeonato?.status !== 'INSCRICOES_ABERTAS' || !campeonato.dataLimiteInscricoes || new Date() <= campeonato.dataLimiteInscricoes) return campeonato;
  campeonato.status = 'INSCRICOES_FECHADAS';
  await campeonato.save();
  emitir(EVENTOS.INSCRICOES_FECHADAS, { campeonatoId: campeonato._id, motivo: 'PRAZO_ENCERRADO' });
  return campeonato;
}

async function findCampeonatoPorCanal(canalId) {
  const campeonato = await Campeonato.findOne({
    $or: [
      { 'canais.inscricoes': canalId },
      { 'canais.partidas': canalId },
      { 'canais.prints': canalId },
      { 'canais.organizador': canalId },
      { 'canais.avisos': canalId }
    ]
  });
  return fecharPorPrazo(campeonato);
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

async function buscarNicks(guildId, termo = '') {
  const filtro = String(termo || '').trim();
  const regex = filtro ? new RegExp(filtro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /.*/;
  return PerfilMembro.find({ guildId, $or: [{ nick_principal: regex }, { nicks_secundarios: regex }] })
    .select('userId nick_principal nicks_secundarios')
    .limit(25)
    .lean();
}

async function adicionarJogadorAoTime({ guild, campeonato, time, capitaoId, member }) {
  if (!campeonato || !time || !member) throw new InscricaoError('Dados do jogador incompletos.', 'INSCRICAO_DADOS_INVALIDOS');
  if (time.capitaoId !== capitaoId) throw new InscricaoError('Apenas o capitão pode adicionar jogadores.', 'INSCRICAO_NAO_CAPITAO');
  if (time.jogadores.length >= campeonato.maxJogadoresPorTime) throw new InscricaoError('O time já está completo.', 'TIME_COMPLETO');
  if (await jogadorJaInscrito(campeonato._id, member.id)) throw new InscricaoError('Este jogador já está inscrito neste campeonato.', 'INSCRICAO_DUPLICADA');
  const perfil = await PerfilMembro.findOne({ guildId: guild.id, userId: member.id });
  const dados = validarInscricao({ member, perfil, ranksDisponiveis: [campeonato.rank] });
  time.jogadores.push({
    userId: member.id,
    rankSnapshot: dados.capitaoRankSnapshot,
    nickSnapshot: dados.capitaoNick,
    isSubstituto: false,
    isCapitao: false,
    partidasJogadas: 0
  });
  await time.save();
  return time;
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
  const totalTimes = await Time.countDocuments({ campeonatoId: campeonato._id });
  const nomeGerado = campeonato.tipoDupla === 'SORTEADA'
    ? `Time-${String(totalTimes + 1).padStart(2, '0')}`
    : (nomeTime?.trim() || `Time de ${perfil.nick_principal}`);
  const time = await Time.create({
    guildId: guild.id,
    campeonatoId: campeonato._id,
    capitaoId: member.id,
    jogadores: [capitao],
    nome: nomeGerado
  });
  if (campeonato.categoriaId && guild.channels?.create) {
    const canais = await criarCanaisTime(guild, campeonato.categoriaId, time.nome, [member.id], guild.members.me?.id || guild.client?.user?.id);
    time.canais = canais;
    await time.save();
  }

  emitir(EVENTOS.INSCRICAO_REALIZADA, {
    timeId: time._id,
    campeonatoId: campeonato._id,
    capitaoId: member.id,
    rank: dadosCapitao.rank
  });

  return { time, dadosCapitao };
}

async function inscreverJogadorManual({ guild, campeonato, nomeJogador, nick, telefone, rank, nomeTime }) {
  if (!campeonato) throw new InscricaoError('Campeonato não encontrado.', 'INSCRICAO_CAMP_NAO_ENCONTRADO');
  if (campeonato.status !== 'INSCRICOES_ABERTAS') {
    throw new InscricaoError('Inscrições não estão abertas.', 'INSCRICAO_FECHADAS');
  }

  const nome = String(nomeJogador || '').trim();
  const nickSnapshot = String(nick || nome).trim();
  const telefoneNormalizado = String(telefone || '').replace(/\D/g, '');
  const rankSnapshot = String(rank || campeonato.rank || '').trim().toLowerCase();
  if (!nome || nome.length > 80 || !nickSnapshot || nickSnapshot.length > 20 || !telefoneNormalizado) {
    throw new InscricaoError('Informe nome, nick (até 20 caracteres) e telefone válidos.', 'INSCRICAO_MANUAL_INVALIDA');
  }
  if (rankSnapshot !== String(campeonato.rank).toLowerCase()) {
    throw new InscricaoError('O rank informado não corresponde ao campeonato.', 'INSCRICAO_RANK_DIVERGENTE');
  }

  const userId = `MANUAL_WHATSAPP_${telefoneNormalizado}`;
  const totalTimes = await Time.countDocuments({ campeonatoId: campeonato._id });
  const nomeFinal = campeonato.tipoDupla === 'SORTEADA'
    ? `Time-${String(totalTimes + 1).padStart(2, '0')}`
    : (String(nomeTime || '').trim() || `Time de ${nickSnapshot}`);
  const jogador = {
    userId,
    rankSnapshot,
    nickSnapshot,
    nome,
    isSubstituto: false,
    isCapitao: true,
    partidasJogadas: 0,
    origem: 'WHATSAPP',
    telefone: telefoneNormalizado
  };
  const time = await Time.create({
    guildId: guild.id,
    campeonatoId: campeonato._id,
    capitaoId: userId,
    jogadores: [jogador],
    nome: nomeFinal
  });
  if (campeonato.categoriaId && guild.channels?.create) {
    const canais = await criarCanaisTime(guild, campeonato.categoriaId, time.nome, [], guild.members.me?.id || guild.client?.user?.id);
    time.canais = canais;
    await time.save();
  }

  emitir(EVENTOS.INSCRICAO_REALIZADA, {
    timeId: time._id,
    campeonatoId: campeonato._id,
    capitaoId: userId,
    rank: campeonato.rank,
    origem: 'manual'
  });

  return { time, jogador };
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
  findCampeonatoPorCanal,
  fecharPorPrazo,
  listarInscricoes,
  jogadorJaInscrito,
  buscarNicks,
  adicionarJogadorAoTime,
  inscreverCapitao,
  inscreverJogadorManual,
  fecharInscricoes,
  executarCorte,
  definirFormato
};
