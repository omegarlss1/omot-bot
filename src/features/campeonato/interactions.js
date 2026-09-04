const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const config = require('../../config');
const { embedCriarEvento, embedSelecionarRanks, botoesSelecionarRanks, embedEventoCriado, embedPainelInscricao, embedInscricaoConfirmada, embedResumoCorte, embedMenuFormato } = require('./embeds');
const { criarEvento, EventoError } = require('./service');
const { inscreverCapitao, fecharInscricoes, executarCorte, definirFormato, findCampeonatoPorCanalInscricao, listarInscricoes, InscricaoError } = require('./services/inscricao');
const { InscricaoError: ValidacaoInscricaoError } = require('./validators/inscricao');
const { CorteError } = require('./validators/corte');

const selecaoRanks = new Map();

function temPermissaoOrganizador(member) {
  if (!member) return false;
  if (member.permissions?.has?.('Administrator')) return true;
  const orgRoleId = config.campeonato.cargoOrganizacaoId;
  return member.roles?.cache?.has?.(orgRoleId) || false;
}

function chaveSelecao(userId) {
  return `camp:selecao:${userId}`;
}

function getSelecao(userId) {
  return selecaoRanks.get(chaveSelecao(userId));
}

function setSelecao(userId, dados) {
  selecaoRanks.set(chaveSelecao(userId), dados);
}

function clearSelecao(userId) {
  selecaoRanks.delete(chaveSelecao(userId));
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
    return interaction.reply({ content: '❌ Apenas `@OrganizadorCamps` pode criar eventos.', flags: 64 });
  }
  return interaction.reply({
    ...embedCriarEvento({ guild: interaction.guild, organizador: interaction.member }),
    flags: 64
  });
}

async function onBotaoCriarEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: '❌ Sem permissão.', embeds: [], components: [] });
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
        .setCustomId('evento_data_inicio')
        .setLabel('Data de inicio (DD/MM/AAAA)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('01/12/2026')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_data_fim')
        .setLabel('Data de fim (DD/MM/AAAA)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('15/12/2026')
        .setRequired(true)
    )
  );
  return interaction.showModal(modal);
}

async function onSubmitCriarEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  }
  const nome = interaction.fields.getTextInputValue('evento_nome');
  const dataInicio = parseDataBR(interaction.fields.getTextInputValue('evento_data_inicio'));
  const dataFim = parseDataBR(interaction.fields.getTextInputValue('evento_data_fim'));

  if (!dataInicio || !dataFim) {
    return interaction.reply({ content: '❌ Datas inválidas. Use o formato DD/MM/AAAA.', flags: 64 });
  }

  setSelecao(interaction.user.id, { nome, dataInicio, dataFim, ranksSelecionados: [] });

  await interaction.reply({
    content: `📝 Evento **${nome}** preparado. Agora selecione os ranks:`,
    ...embedSelecionarRanks({ nome, dataInicio, dataFim }),
    flags: 64
  });
}

async function onToggleRank(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: '❌ Sem permissão.', embeds: [], components: [] });
  }
  const rank = interaction.customId.replace('btn_camp_rank_toggle_', '');
  const selecao = getSelecao(interaction.user.id);
  if (!selecao) {
    return interaction.update({ content: '❌ Sessão expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  const idx = selecao.ranksSelecionados.indexOf(rank);
  if (idx >= 0) {
    selecao.ranksSelecionados.splice(idx, 1);
  } else {
    selecao.ranksSelecionados.push(rank);
  }
  setSelecao(interaction.user.id, selecao);

  const embed = {
    embeds: [{
      title: '🎯 Selecione os Ranks do Evento',
      description: [
        `**${selecao.nome}**`,
        `📅 ${selecao.dataInicio.toLocaleDateString('pt-BR')} → ${selecao.dataFim.toLocaleDateString('pt-BR')}`,
        '',
        `**Ranks selecionados (${selecao.ranksSelecionados.length}):**`,
        selecao.ranksSelecionados.length ? selecao.ranksSelecionados.map((r) => `• ${r}`).join('\n') : '_nenhum ainda_'
      ].join('\n'),
      color: 0xFF6B00
    }],
    components: [botoesSelecionarRanks()]
  };
  return interaction.update(embed);
}

async function onConfirmarRanks(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: '❌ Sem permissão.', embeds: [], components: [] });
  }
  const selecao = getSelecao(interaction.user.id);
  if (!selecao) {
    return interaction.update({ content: '❌ Sessão expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  if (selecao.ranksSelecionados.length === 0) {
    return interaction.update({ content: '❌ Selecione ao menos 1 rank antes de confirmar.', embeds: [], components: [] });
  }

  await interaction.update({ content: '⏳ Criando categoria, canais e campeonatos no Discord...', embeds: [], components: [] });

  try {
    const resultado = await criarEvento(interaction.guild, {
      nome: selecao.nome,
      dataInicio: selecao.dataInicio,
      dataFim: selecao.dataFim,
      ranksSelecionados: selecao.ranksSelecionados,
      organizadorId: interaction.user.id
    });
    clearSelecao(interaction.user.id);
    return interaction.editReply(embedEventoCriado({
      evento: resultado.evento,
      categoria: resultado.categoria,
      campeonatos: resultado.campeonatos
    }));
  } catch (error) {
    if (error instanceof EventoError) {
      return interaction.editReply({ content: `❌ ${error.message}` });
    }
    console.error('[campeonato.criarEvento] erro:', error);
    return interaction.editReply({ content: '❌ Erro ao criar evento. Verifique permissões do bot e tente novamente.' });
  }
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
}

module.exports = { register, temPermissaoOrganizador, parseDataBR };

// ─── INSCRIÇÃO ────────────────────────────────────────────────────────────────

async function onBotaoInscrever(interaction) {
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: '❌ Este canal não é de inscrição de campeonato.', flags: 64 });
  }
  if (campeonato.status !== 'INSCRICOES_ABERTAS') {
    return interaction.reply({ content: '❌ Inscrições não estão abertas.', flags: 64 });
  }
  const modal = new ModalBuilder()
    .setCustomId('modal_camp_inscricao')
    .setTitle('Inscrição — ' + String(campeonato.rank || '').toUpperCase());
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
    return interaction.editReply({ content: '❌ Campeonato não encontrado neste canal.' });
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
      return interaction.editReply({ content: `❌ ${error.message}` });
    }
    console.error('[campeonato.inscricao] erro:', error);
    return interaction.editReply({ content: '❌ Erro ao processar inscrição.' });
  }
}

async function onBotaoFecharInscricoes(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: '❌ Apenas `@OrganizadorCamps` pode fechar inscrições.', flags: 64 });
  }
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: '❌ Campeonato não encontrado.', flags: 64 });
  }
  const inscricoes = await listarInscricoes(campeonato._id);
  await fecharInscricoes(campeonato._id);
  return interaction.reply({
    content: `🔒 Inscrições fechadas. **${inscricoes.length}** time(s) inscrito(s).`,
    flags: 64
  });
}

async function onBotaoCortar(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: '❌ Apenas `@OrganizadorCamps` pode cortar.', flags: 64 });
  }
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: '❌ Campeonato não encontrado.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const resultado = await executarCorte({
      campeonatoId: campeonato._id,
      tipoDupla: campeonato.tipoDupla || 'SORTEADA'
    });
    await interaction.editReply(embedResumoCorte(resultado));
    if (resultado.precisaEscolherFormato) {
      const menu = embedMenuFormato(campeonato._id, resultado.totalTimes, resultado.alternativas);
      await interaction.followUp({ ...menu, flags: 64 });
    }
  } catch (error) {
    if (error instanceof CorteError) {
      return interaction.editReply({ content: `❌ ${error.message}` });
    }
    console.error('[campeonato.corte] erro:', error);
    return interaction.editReply({ content: '❌ Erro ao processar corte.' });
  }
}

async function onEscolherFormato(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: '❌ Sem permissão.', embeds: [], components: [] });
  }
  const match = interaction.customId.match(/^btn_camp_formato_([\w-]+)_([a-f0-9]{24})$/);
  if (!match) return;
  const [, formato, campeonatoId] = match;
  await definirFormato(campeonatoId, formato);
  return interaction.update({
    content: `✅ Formato definido como **${formato}**.`,
    embeds: [],
    components: []
  });
}
