const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const { embedCriarEvento, embedSelecionarRanks, embedEventoCriado, embedPainelInscricao, embedInscricaoConfirmada, embedResumoCorte, embedMenuFormato, embedPainelPartida, embedPlacarEnviado, embedDisputaOrganizador, embedBracket, embedClassificacao, embedCampeaoDefinido, embedPainelAdmin, embedCancelamentoConfirmado, embedReaberturaConfirmada, embedTimeDesclassificado, embedPlacarAjustado, toActionRows } = require('./embeds');
const { criarEvento, EventoError } = require('./service');
const { inscreverCapitao, fecharInscricoes, executarCorte, definirFormato, findCampeonatoPorCanalInscricao, listarInscricoes, InscricaoError } = require('./services/inscricao');
const { InscricaoError: ValidacaoInscricaoError } = require('./validators/inscricao');
const { CorteError } = require('./validators/corte');
const { gerarBracket, BracketError } = require('./services/bracket');
const { registrarCheckIn, verificarAdversarioFaltou, registrarWO, CheckinError } = require('./services/checkin');
const { enviarPlacar, validarPlacar, parsePlacar, PlacarError } = require('./services/placar');
const { placarEhValido } = require('./validators/placar');
const { calcularClassificacao } = require('./services/classificacao');
const { finalizarCampeonato, obterClassificacaoFinal, FinalizacaoError } = require('./services/finalizacao');
const { cancelarCampeonato, reabrirCampeonato, desclassificarTime, ajustarPlacar, AdminError } = require('./services/admin');
const { notificarCampeao, anunciarNoCanal } = require('./services/notificacoes');
const Campeonato = require('../../db/models/campeonato');
const Partida = require('../../db/models/partida');
const Time = require('../../db/models/time');

const selecaoRanks = new Map();

function temPermissaoOrganizador(member) {
  if (!member) return false;
  if (member.permissions?.has?.('Administrator')) return true;
  const orgRoleId = config.campeonato.cargoOrganizacaoId;
  return member.roles?.cache?.has?.(orgRoleId) || false;
}

function parseDataBR(texto) {
  const match = String(texto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const data = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0);
  return Number.isNaN(data.getTime()) ? null : data;
}

async function onAbrirPainelCriacao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode criar eventos.', flags: 64 });
  }
  return interaction.reply({
    ...embedCriarEvento({ guild: interaction.guild, organizador: interaction.member }),
    flags: 64
  });
}

async function onBotaoCriarEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const modal = new ModalBuilder()
    .setCustomId('modal_criar_evento')
    .setTitle('Criar Evento de Campeonato');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_nome')
        .setLabel('Nome do Evento (ex: Omega #42)')
        .setStyle(TextInputStyle.Short)
        .setMinLength(3)
        .setMaxLength(60)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_datas')
        .setLabel('Inicio e Fim (DD/MM/AAAA ate DD/MM/AAAA)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('01/12/2026 ate 15/12/2026')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_modo')
        .setLabel('Modo (ex: 3v3, ffa)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('3v3')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_tipo_dupla')
        .setLabel('Tipo Dupla (FIXA ou SORTEADA)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('SORTEADA')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_baseado_inscricoes')
        .setLabel('Baseado em Inscricoes? (SIM/NAO)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('SIM')
        .setRequired(true)
    )
  );
  return interaction.showModal(modal);
}

async function onSubmitCriarEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Sem permissao.', flags: 64 });
  }
  const nome = interaction.fields.getTextInputValue('evento_nome');
  const datas = interaction.fields.getTextInputValue('evento_datas') || '';
  const partes = datas.split(' até ').map((s) => s.trim());
  const dataInicio = parseDataBR(partes[0]);
  const dataFim = parseDataBR(partes[1]);
  const modo = interaction.fields.getTextInputValue('evento_modo')?.trim() || '3v3';
  const tipoDupla = interaction.fields.getTextInputValue('evento_tipo_dupla')?.trim() || 'SORTEADA';
  const baseadoEmInscricoesStr = interaction.fields.getTextInputValue('evento_baseado_inscricoes')?.trim() || 'SIM';
  const baseadoEmInscricoes = baseadoEmInscricoesStr === 'SIM';
  if (!dataInicio || !dataFim) {
    return interaction.reply({ content: 'Datas invalidas. Use o formato DD/MM/AAAA ate DD/MM/AAAA.', flags: 64 });
  }
  selecaoRanks.set(`camp:selecao:${interaction.user.id}`, { nome, dataInicio, dataFim, modo, tipoDupla, baseadoEmInscricoes, ranksSelecionados: [] });
  const sel = embedSelecionarRanks({ nome, dataInicio, dataFim, ranksSelecionados: [] });
  await interaction.reply({
    content: 'Evento **' + nome + '** preparado. Agora selecione os ranks:',
    embeds: sel.embeds,
    components: toActionRows(sel.components),
    flags: 64
  });
}

async function onToggleRank(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const rank = interaction.customId.replace('btn_camp_rank_toggle_', '');
  const selecao = selecaoRanks.get(`camp:selecao:${interaction.user.id}`);
  if (!selecao) {
    return interaction.update({ content: 'Sessao expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  const idx = selecao.ranksSelecionados.indexOf(rank);
  if (idx >= 0) selecao.ranksSelecionados.splice(idx, 1);
  else selecao.ranksSelecionados.push(rank);
  selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
  const ranksEmbed = embedSelecionarRanks({
    nome: selecao.nome,
    dataInicio: selecao.dataInicio,
    dataFim: selecao.dataFim,
    ranksSelecionados: selecao.ranksSelecionados
  });
  return interaction.update({
    embeds: ranksEmbed.embeds,
    components: toActionRows(ranksEmbed.components)
  });
}

async function onConfirmarRanks(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const selecao = selecaoRanks.get(`camp:selecao:${interaction.user.id}`);
  if (!selecao) {
    return interaction.update({ content: 'Sessao expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  if (selecao.ranksSelecionados.length === 0) {
    return interaction.update({ content: 'Selecione ao menos 1 rank antes de confirmar.', embeds: [], components: [] });
  }
  await interaction.update({ content: 'Criando categoria, canais e campeonatos...', embeds: [], components: [] });
  try {
    const resultado = await criarEvento(interaction.guild, {
      nome: selecao.nome,
      dataInicio: selecao.dataInicio,
      dataFim: selecao.dataFim,
      ranksSelecionados: selecao.ranksSelecionados,
      organizadorId: interaction.user.id,
      modo: selecao.modo,
      tipoDupla: selecao.tipoDupla,
      baseadoEmInscricoes: selecao.baseadoEmInscricoes
    });
    selecaoRanks.delete(`camp:selecao:${interaction.user.id}`);
    const eventosCriados = [];
    for (const camp of resultado.campeonatos) {
      const canal = await interaction.guild.channels.fetch(camp.canais.inscricoes).catch(() => null);
      if (canal && canal.isTextBased()) {
        const painel = embedPainelInscricao(camp, 0);
        await canal.send({ embeds: painel.embeds, components: toActionRows(painel.components) }).catch(() => {});
      }
      eventosCriados.push(camp);
    }
    return interaction.editReply(embedEventoCriado({
      evento: resultado.evento,
      categoria: resultado.categoria,
      campeonatos: eventosCriados
    }));
  } catch (error) {
    if (error instanceof EventoError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.criarEvento] erro:', error);
    return interaction.editReply({ content: 'Erro ao criar evento. Verifique permissoes do bot e tente novamente.' });
  }
}

async function onBotaoInscrever(interaction) {
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Este canal nao e de inscricao de campeonato.', flags: 64 });
  }
  if (campeonato.status !== 'INSCRICOES_ABERTAS') {
    return interaction.reply({ content: 'Inscricoes nao estao abertas.', flags: 64 });
  }
  const modal = new ModalBuilder()
    .setCustomId('modal_camp_inscricao')
    .setTitle('Inscricao - ' + String(campeonato.rank || '').toUpperCase());
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('inscricao_nome_time')
        .setLabel('Nome do Time (opcional)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(40)
        .setRequired(false)
    )
  );
  return interaction.showModal(modal);
}

async function onSubmitInscricao(interaction) {
  await interaction.deferReply({ flags: 64 });
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.editReply({ content: 'Campeonato nao encontrado neste canal.' });
  }
  const nomeTime = interaction.fields.getTextInputValue('inscricao_nome_time');
  try {
    const { time, dadosCapitao } = await inscreverCapitao({
      guild: interaction.guild,
      member: interaction.member,
      campeonato,
      nomeTime
    });
    return interaction.editReply(embedInscricaoConfirmada({ time, capitao: dadosCapitao }));
  } catch (error) {
    if (error instanceof InscricaoError || error instanceof ValidacaoInscricaoError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.inscricao] erro:', error);
    return interaction.editReply({ content: 'Erro ao processar inscricao.' });
  }
}

async function onBotaoFecharInscricoes(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode fechar inscricoes.', flags: 64 });
  }
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato nao encontrado.', flags: 64 });
  }
  const inscricoes = await listarInscricoes(campeonato._id);
  await fecharInscricoes(campeonato._id);
  return interaction.reply({
    content: 'Inscricoes fechadas. ' + inscricoes.length + ' time(s) inscrito(s).',
    flags: 64
  });
}

async function onBotaoCortar(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode cortar.', flags: 64 });
  }
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato nao encontrado.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const resultado = await executarCorte({
      campeonatoId: campeonato._id,
      tipoDupla: campeonato.tipoDupla || 'SORTEADA'
    });
    const resumo = embedResumoCorte(resultado);
    await interaction.editReply({
      embeds: resumo.embeds,
      components: toActionRows(resumo.components)
    });
    if (resultado.precisaEscolherFormato) {
      const menu = embedMenuFormato(campeonato._id, resultado.totalTimes, resultado.alternativas);
      await interaction.followUp({
        embeds: menu.embeds,
        components: toActionRows(menu.components),
        flags: 64
      });
    }
  } catch (error) {
    if (error instanceof CorteError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.corte] erro:', error);
    return interaction.editReply({ content: 'Erro ao processar corte.' });
  }
}

async function onEscolherFormato(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const match = interaction.customId.match(/^btn_camp_formato_([\w-]+)_([a-f0-9]{24})$/);
  if (!match) return;
  const [, formato, campeonatoId] = match;
  await definirFormato(campeonatoId, formato);
  return interaction.update({
    content: 'Formato definido como ' + formato + '.',
    embeds: [],
    components: []
  });
}

async function onBotaoGerarBracket(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode gerar bracket.', flags: 64 });
  }
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato nao encontrado.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const resultado = await gerarBracket(campeonato._id);
    return interaction.editReply({
      content: 'Bracket gerado! ' + resultado.totalPartidas + ' partidas na R1. Veja em <#' + campeonato.canais.partidas + '>.',
      embeds: [],
      components: []
    });
  } catch (error) {
    if (error instanceof BracketError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.gerarBracket] erro:', error);
    return interaction.editReply({ content: 'Erro ao gerar bracket.' });
  }
}

async function onBotaoCheckIn(interaction) {
  const partidaId = interaction.customId.replace('btn_camp_checkin_', '');
  const partida = await Partida.findById(partidaId);
  if (!partida) {
    return interaction.reply({ content: 'Partida nao encontrada.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const timeId = interaction.member.id;
    const todos = await Time.find({});
    const meuTime = todos.find((t) => t.capitaoId === interaction.user.id);
    if (!meuTime) {
      return interaction.editReply({ content: 'Voce nao e capitao de nenhum time nesta partida.', embeds: [], components: [] });
    }
    await registrarCheckIn(partidaId, meuTime._id, interaction.user.id);
    const partidaAtualizada = await Partida.findById(partidaId);
    const timeA = await Time.findById(partidaAtualizada.timeA);
    const timeB = await Time.findById(partidaAtualizada.timeB);
    const painel = embedPainelPartida({ partida: partidaAtualizada, timeA, timeB });
    return interaction.editReply({ embeds: painel.embeds, components: toActionRows(painel.components) });
  } catch (error) {
    if (error instanceof CheckinError) {
      return interaction.editReply({ content: error.message, embeds: [], components: [] });
    }
    console.error('[campeonato.checkin] erro:', error);
    return interaction.editReply({ content: 'Erro no check-in.', embeds: [], components: [] });
  }
}

async function onBotaoAdversarioFaltou(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode declarar WO.', flags: 64 });
  }
  const partidaId = interaction.customId.replace('btn_camp_adversario_faltou_', '');
  await interaction.deferReply({ flags: 64 });
  try {
    const partida = await Partida.findById(partidaId);
    if (!partida) return interaction.editReply({ content: 'Partida nao encontrada.' });
    const vencedorId = partida.timeA;
    await registrarWO({
      partidaId,
      timeVencedorId: vencedorId,
      motivo: 'Adversario nao compareceu (declarado por staff)',
      declaranteId: interaction.user.id,
      juiz: true
    });
    return interaction.editReply({ content: 'W.O. registrado a favor do Time A. Disputa encerrada.', embeds: [], components: [] });
  } catch (error) {
    console.error('[campeonato.wo] erro:', error);
    return interaction.editReply({ content: 'Erro ao registrar WO.' });
  }
}

async function onBotaoEnviarPlacar(interaction) {
  const partidaId = interaction.customId.replace('btn_camp_enviar_placar_', '');
  const modal = new ModalBuilder()
    .setCustomId('modal_camp_placar_' + partidaId)
    .setTitle('Enviar Placar');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('placar_texto')
        .setLabel('Placar (ex: 2x1)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('2x1')
        .setRequired(true)
    )
  );
  return interaction.showModal(modal);
}

async function onSubmitEnviarPlacar(interaction) {
  const partidaId = interaction.customId.replace('modal_camp_placar_', '');
  const placar = interaction.fields.getTextInputValue('placar_texto');
  if (!placarEhValido(placar)) {
    return interaction.reply({ content: 'Formato de placar invalido. Use "2x1", "3x0" etc.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const meuTime = await Time.findOne({ capitaoId: interaction.user.id });
    if (!meuTime) return interaction.editReply({ content: 'Voce nao e capitao de nenhum time.' });
    const resultado = await enviarPlacar({
      partidaId,
      timeId: meuTime._id,
      userId: interaction.user.id,
      placar
    });
    const partida = await Partida.findById(partidaId);
    const placarEmbed = embedPlacarEnviado({ partida, lado: resultado.lado, placar: resultado.placar });
    return interaction.editReply({ embeds: placarEmbed.embeds, components: toActionRows(placarEmbed.components) });
  } catch (error) {
    if (error instanceof PlacarError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.placar] erro:', error);
    return interaction.editReply({ content: 'Erro ao enviar placar.' });
  }
}

async function onBotaoValidarPlacar(interaction) {
  const partidaId = interaction.customId.replace('btn_camp_validar_placar_', '');
  await interaction.deferReply({ flags: 64 });
  try {
    const meuTime = await Time.findOne({ capitaoId: interaction.user.id });
    if (!meuTime) return interaction.editReply({ content: 'Voce nao e capitao.' });
    const r = await validarPlacar({ partidaId, userId: interaction.user.id, timeId: meuTime._id, aceito: true });
    return interaction.editReply({ content: 'Validacao registrada. Status: ' + r.status, embeds: [], components: [] });
  } catch (error) {
    if (error instanceof PlacarError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.validar] erro:', error);
    return interaction.editReply({ content: 'Erro ao validar.' });
  }
}

async function onBotaoContestarPlacar(interaction) {
  const partidaId = interaction.customId.replace('btn_camp_contestar_placar_', '');
  await interaction.deferReply({ flags: 64 });
  try {
    const meuTime = await Time.findOne({ capitaoId: interaction.user.id });
    if (!meuTime) return interaction.editReply({ content: 'Voce nao e capitao.' });
    const r = await validarPlacar({ partidaId, userId: interaction.user.id, timeId: meuTime._id, aceito: false });
    const partida = await Partida.findById(partidaId);
    return interaction.editReply(embedDisputaOrganizador({
      partida,
      placarA: partida.placarEnviado?.timeA?.placar,
      placarB: partida.placarEnviado?.timeB?.placar
    }));
  } catch (error) {
    if (error instanceof PlacarError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.contestar] erro:', error);
    return interaction.editReply({ content: 'Erro ao contestar.' });
  }
}

async function onBotaoVerClassificacao(interaction) {
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato nao encontrado.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  const r = await calcularClassificacao(campeonato._id);
  return interaction.editReply(embedClassificacao(r));
}

async function onBotaoVerBracket(interaction) {
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato nao encontrado.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  const partidas = await Partida.find({ campeonatoId: campeonato._id, rodada: 1 }).lean();
  const timesIds = partidas.flatMap((p) => [p.timeA, p.timeB]).filter(Boolean);
  const times = await Time.find({ _id: { $in: timesIds } }).lean();
  const timesMap = new Map(times.map((t) => [String(t._id), t]));
  const ordenados = partidas.map((p) => timesMap.get(String(p.timeA))).filter(Boolean);
  return interaction.editReply(embedBracket(ordenados));
}

async function onBotaoFinalizar(interaction) {
  const cid = interaction.customId.replace('btn_camp_finalizar_', '');
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const camp = await Campeonato.findById(cid);
    if (!camp) return interaction.editReply({ content: 'Campeonato nao encontrado.' });
    const r = await finalizarCampeonato({ campeonatoId: cid });
    await notificarCampeao({
      campeonatoId: cid,
      vencedor: { capitaoId: r.vencedor.id, nome: r.vencedor.nome },
      podio: r.podio
    }).catch(() => null);
    if (camp.canals?.geral) {
      await anunciarNoCanal({
        channelId: camp.canals.geral,
        payload: embedCampeaoDefinido({ vencedor: r.vencedor, podio: r.podio })
      }).catch(() => null);
    }
    return interaction.editReply(embedCampeaoDefinido({ vencedor: r.vencedor, podio: r.podio }));
  } catch (error) {
    if (error instanceof FinalizacaoError) return interaction.editReply({ content: error.message });
    console.error('[campeonato.finalizar] erro:', error);
    return interaction.editReply({ content: 'Erro ao finalizar.' });
  }
}

async function onBotaoCancelar(interaction) {
  const cid = interaction.customId.replace('btn_camp_cancelar_', '');
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    await cancelarCampeonato({ campeonatoId: cid, executadoPor: interaction.user.id });
    return interaction.editReply(embedCancelamentoConfirmado({ motivo: 'Cancelado por organizador.' }));
  } catch (error) {
    if (error instanceof AdminError) return interaction.editReply({ content: error.message });
    console.error('[campeonato.cancelar] erro:', error);
    return interaction.editReply({ content: 'Erro ao cancelar.' });
  }
}

async function onBotaoReabrir(interaction) {
  const cid = interaction.customId.replace('btn_camp_reabrir_', '');
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    await reabrirCampeonato({ campeonatoId: cid, executadoPor: interaction.user.id });
    return interaction.editReply(embedReaberturaConfirmada());
  } catch (error) {
    if (error instanceof AdminError) return interaction.editReply({ content: error.message });
    return interaction.editReply({ content: 'Erro ao reabrir.' });
  }
}

async function onSubmitDesclassificar(interaction) {
  const tid = interaction.customId.replace('modal_camp_desclassificar_', '');
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  const motivo = interaction.fields.getTextInputValue('motivo') || null;
  try {
    const r = await desclassificarTime({ timeId: tid, motivo, executadoPor: interaction.user.id });
    const time = await Time.findById(tid).lean();
    return interaction.editReply(embedTimeDesclassificado({ time, partidasAnuladas: r.partidasAnuladas }));
  } catch (error) {
    if (error instanceof AdminError) return interaction.editReply({ content: error.message });
    return interaction.editReply({ content: 'Erro ao desclassificar.' });
  }
}

async function onPainelOrganizadorTab(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const tab = interaction.values[0];
  let embed;
  switch (tab) {
    case 'inscritos':
      embed = {
        title: '📋 ABA 1 - INSCRITOS',
        description: 'Lista de inscritos por rank.\n\nEm desenvolvimento...',
        color: 0x00C2FF
      };
      break;
    case 'times':
      embed = {
        title: '👥 ABA 2 - TIMES DEFINIDOS',
        description: 'Times formados (FIXA).\n\nEm desenvolvimento...',
        color: 0x00FF00
      };
      break;
    case 'partidas':
      embed = {
        title: '🎮 ABA 3 - PARTIDAS AO VIVO',
        description: 'Partidas em andamento.\n\nEm desenvolvimento...',
        color: 0xFFA500
      };
      break;
    case 'gestao':
      embed = {
        title: '🛠️ ABA 4 - GESTÃO EXTRA',
        description: 'W.O., broadcast, classificação.\n\nEm desenvolvimento...',
        color: 0xFF6B00
      };
      break;
    default:
      embed = { title: '❓ Aba desconhecida', color: 0xFF0000 };
  }
  return interaction.update({ embeds: [embed], components: [] });
}

function register(registry) {
  registry.button('btn_campeonato_criar', onAbrirPainelCriacao);
  registry.button('btn_campeonato_criar_evento', onBotaoCriarEvento);
  registry.button(/^btn_camp_rank_toggle_(bronze|prata|ouro|platina|diamante|champion|grand_champion|omega_champion)$/, onToggleRank);
  registry.button('btn_camp_rank_confirmar', onConfirmarRanks);
  registry.modal('modal_criar_evento', onSubmitCriarEvento);
  registry.button('btn_camp_inscrever', onBotaoInscrever);
  registry.modal('modal_camp_inscricao', onSubmitInscricao);
  registry.button('btn_camp_fechar_inscricoes', onBotaoFecharInscricoes);
  registry.button('btn_camp_cortar', onBotaoCortar);
  registry.button(/^btn_camp_formato_(round-robin|grupos-mata-mata|double-elimination|single-elimination)_[a-f0-9]{24}$/, onEscolherFormato);
  registry.button('btn_camp_gerar_bracket', onBotaoGerarBracket);
  registry.button(/^btn_camp_checkin_[a-f0-9]{24}$/, onBotaoCheckIn);
  registry.button(/^btn_camp_adversario_faltou_[a-f0-9]{24}$/, onBotaoAdversarioFaltou);
  registry.button(/^btn_camp_enviar_placar_[a-f0-9]{24}$/, onBotaoEnviarPlacar);
  registry.modal(/^modal_camp_placar_[a-f0-9]{24}$/, onSubmitEnviarPlacar);
  registry.button(/^btn_camp_validar_placar_[a-f0-9]{24}$/, onBotaoValidarPlacar);
  registry.button(/^btn_camp_contestar_placar_[a-f0-9]{24}$/, onBotaoContestarPlacar);
  registry.button('btn_camp_ver_classificacao', onBotaoVerClassificacao);
  registry.button('btn_camp_ver_bracket', onBotaoVerBracket);
  registry.button(/^btn_camp_finalizar_[a-f0-9]{24}$/, onBotaoFinalizar);
  registry.button(/^btn_camp_cancelar_[a-f0-9]{24}$/, onBotaoCancelar);
  registry.button(/^btn_camp_reabrir_[a-f0-9]{24}$/, onBotaoReabrir);
  registry.modal(/^modal_camp_desclassificar_[a-f0-9]{24}$/, onSubmitDesclassificar);
  registry.select('painel_org_tab', onPainelOrganizadorTab);
}

module.exports = { register, temPermissaoOrganizador, parseDataBR };
