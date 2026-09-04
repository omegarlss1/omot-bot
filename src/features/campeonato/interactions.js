const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const config = require('../../config');
const { embedCriarEvento, embedSelecionarRanks, botoesSelecionarRanks, embedEventoCriado } = require('./embeds');
const { criarEvento, EventoError } = require('./service');

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
}

module.exports = { register, temPermissaoOrganizador, parseDataBR };
