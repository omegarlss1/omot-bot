const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const config = require('../../config');
const PerfilMembro = require('../../db/models/perfilMembro');
const { getGames, getGame } = require('../games/catalog');
const { CooldownStore } = require('./cooldown');

const cooldown = new CooldownStore(config.lfg.cooldownMs);
const chamadasEmAtualizacao = new Map();

async function comBloqueioDaChamada(messageId, action) {
  const anterior = chamadasEmAtualizacao.get(messageId) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(action);
  chamadasEmAtualizacao.set(messageId, atual);

  try {
    return await atual;
  } finally {
    if (chamadasEmAtualizacao.get(messageId) === atual) chamadasEmAtualizacao.delete(messageId);
  }
}

function agendarLimpeza(message) {
  setTimeout(() => {
    message.delete().catch(() => {});
  }, config.lfg.limpezaMensagemMs);
}

async function onAbrirModalJogar(interaction) {
  const restante = cooldown.restanteMinutos(interaction.user.id);
  if (restante > 0) {
    return interaction.reply({ content: `❌ Vc precisa esperar **${restante} min** pra chamar de novo.`, flags: 64 });
  }

  const games = await getGames(interaction.guildId);
  const selectJogos = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_tipo_jogo_chamada')
      .setPlaceholder('Escolha o jogo da chamada...')
      .addOptions(
        games.map((game) => ({
          label: game.nome,
          value: game.key,
          description: game.descricaoChamada,
          emoji: game.emoji
        }))
      )
  );

  return interaction.reply({ content: 'Selecione qual jogo vc vai jogar:', components: [selectJogos], flags: 64 });
}

async function onSelectTipoJogo(interaction) {
  const tipoJogo = interaction.values[0];
  const game = getGame(tipoJogo) || { nome: 'Outros Jogos', key: tipoJogo };
  const modal = new ModalBuilder()
    .setCustomId(`modal_chamar_time_${tipoJogo}`)
    .setTitle(`Chamar time: ${game.nome}`);

  const inputVagas = new TextInputBuilder()
    .setCustomId('vagas_input')
    .setLabel('Quantas vagas faltam?')
    .setPlaceholder(tipoJogo === 'sideswipe' ? 'Ex: 1, 2, 3...' : 'Ex: 5, 10, 20...')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const inputNota = new TextInputBuilder()
    .setCustomId('nota_input')
    .setLabel('Recado / Observação (opcional):')
    .setPlaceholder(tipoJogo === 'sideswipe' ? 'Ex: Casual, Duelo 2v2...' : 'Ex: Falta 1 pra fechar a private...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  if (tipoJogo === 'sideswipe') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(inputVagas),
      new ActionRowBuilder().addComponents(inputNota)
    );
  } else {
    const inputNomeJogo = new TextInputBuilder()
      .setCustomId('nome_jogo_input')
      .setLabel('Nome do Jogo:')
      .setPlaceholder('Ex: Valorant, Roblox, Minecraft...')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(inputNomeJogo),
      new ActionRowBuilder().addComponents(inputVagas),
      new ActionRowBuilder().addComponents(inputNota)
    );
  }

  return interaction.showModal(modal);
}

async function onModalChamarTime(interaction) {
  await interaction.deferReply({ flags: 64 });

  const tipoJogo = interaction.customId.replace('modal_chamar_time_', '');
  const games = await getGames(interaction.guildId);
  const game = getGame(tipoJogo, games);
  const ehSideSwipe = tipoJogo === 'sideswipe';

  const nomeJogo = ehSideSwipe ? (game?.nome || 'RL SideSwipe') : interaction.fields.getTextInputValue('nome_jogo_input');
  const vagasStr = interaction.fields.getTextInputValue('vagas_input').trim();
  const nota = interaction.fields.getTextInputValue('nota_input');
  const vagas = parseInt(vagasStr, 10);

  if (isNaN(vagas) || vagas < 1) {
    return interaction.editReply({ content: '❌ Manda um número válido de vagas!' });
  }

  const canalProcura = interaction.guild.channels.cache.get(config.discord.canalPingsId);
  if (!canalProcura) return interaction.editReply({ content: '❌ Canal de chamadas não encontrado no servidor!' });

  const cargoId = game?.roleId;
  const mencaoCargo = cargoId ? `<@&${cargoId}>` : '';

  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
  const nickRegistrado = perfil?.nickJogo || interaction.member.displayName;

  let descricao = `📢 **${interaction.member.displayName}** tá chamando pra jogar!\n\n`;
  descricao += `👤 **Líder:** ${interaction.member} (Nick: \`${nickRegistrado}\`)\n`;

  if (ehSideSwipe) {
    descricao += `🏆 **Rank:** \`${perfil?.rankSideSwipe || 'Não informado'}\`\n`;
  }

  if (nota) descricao += `📌 **Recado:** ${nota}\n`;

  descricao += `👥 **Vagas Restantes:** ${vagas}\n\n`;
  descricao += `**Time:**\n• ${interaction.member}`;

  const embed = new EmbedBuilder()
    .setTitle(`🎮 Procura-se Players para: ${nomeJogo}`)
    .setDescription(descricao)
    .setColor('#FF6B00')
    .setFooter({ text: 'Clica nos botões abaixo pra entrar ou cancelar a busca!' })
    .setTimestamp();

  const rowBotoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_join_team_${interaction.user.id}`).setLabel('Entrar no Time').setStyle(ButtonStyle.Success).setEmoji('🎮'),
    new ButtonBuilder().setCustomId(`btn_cancel_team_${interaction.user.id}`).setLabel('Cancelar Procura').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );

  await canalProcura.send({
    content: `${mencaoCargo} 🎮 ${interaction.member.displayName} chamou pro ${nomeJogo}!`.trim(),
    embeds: [embed],
    components: [rowBotoes]
  });

  cooldown.marcar(interaction.user.id);
  return interaction.editReply({ content: `✅ Chamada de time postada no canal ${canalProcura}!` });
}

async function onCancelarTime(interaction) {
  const criadorId = interaction.customId.replace('btn_cancel_team_', '');
  if (interaction.user.id !== criadorId) {
    return interaction.reply({ content: '❌ Apenas quem criou a chamada pode cancelar a procura!', flags: 64 });
  }

  const embedOriginal = interaction.message.embeds[0];
  if (!embedOriginal) return;

  const embedCancelada = EmbedBuilder.from(embedOriginal)
    .setTitle(`${embedOriginal.title} [CANCELADO]`)
    .setColor('#7289DA')
    .setDescription(`${embedOriginal.description}\n\n❌ **Procura cancelada pelo líder ${interaction.member}.**\n*(Essa mensagem vai sumir em 2 horas)*`);

  const rowDesativada = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('disabled_cancel').setLabel('Procura Cancelada').setStyle(ButtonStyle.Secondary).setDisabled(true)
  );

  await interaction.update({ embeds: [embedCancelada], components: [rowDesativada] });
  agendarLimpeza(interaction.message);
}

async function onEntrarTime(interaction) {
  return comBloqueioDaChamada(interaction.message.id, async () => {
    const criadorId = interaction.customId.replace('btn_join_team_', '');
    const mensagemAtual = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
    const embedOriginal = mensagemAtual?.embeds[0];
    if (!embedOriginal) return;

    const embedNovo = EmbedBuilder.from(embedOriginal);
    let descricao = embedNovo.data.description;

    if (descricao.includes(`${interaction.member}`)) {
      return interaction.reply({ content: '❌ Vc já tá nesse time!', flags: 64 });
    }

    const matchVagas = descricao.match(/👥 \*\*Vagas Restantes:\*\* (\d+)/);
    let vagasAtuais = matchVagas ? parseInt(matchVagas[1], 10) : 0;

    if (vagasAtuais <= 0) {
      return interaction.reply({ content: '❌ O time já tá cheio!', flags: 64 });
    }

    vagasAtuais -= 1;
    descricao = descricao.replace(/👥 \*\*Vagas Restantes:\*\* \d+/, `👥 **Vagas Restantes:** ${vagasAtuais}`);
    descricao += `\n• ${interaction.member}`;

    const componentes = ActionRowBuilder.from(mensagemAtual.components[0]);

    if (vagasAtuais === 0) {
      embedNovo.setTitle(`${embedOriginal.title} [CHEIO]`);
      descricao += `\n\n🎉 **Time fechado!**\n*(Essa mensagem vai sumir em 3 min)*`;
      componentes.components[0] = ButtonBuilder.from(componentes.components[0]).setDisabled(true).setLabel('Time Cheio!');
      agendarLimpeza(mensagemAtual);
    }

    embedNovo.setDescription(descricao);
    await interaction.update({ embeds: [embedNovo], components: [componentes] });

    const criador = await interaction.guild.members.fetch(criadorId).catch(() => null);
    if (criador) {
      const nomeJogo = embedOriginal.title ? embedOriginal.title.replace('🎮 Procura-se Players para: ', '') : 'Jogo';
      criador.send(`🎉 **${interaction.member.displayName}** entrou no seu time pra **${nomeJogo}**!`).catch(() => {});
    }
  });
}

function register(registry) {
  registry.button('btn_abrir_modal_jogar', onAbrirModalJogar);
  registry.button('btn_cancel_team_*', onCancelarTime);
  registry.button('btn_join_team_*', onEntrarTime);
  registry.select('select_tipo_jogo_chamada', onSelectTipoJogo);
  registry.modal('modal_chamar_time_*', onModalChamarTime);
}

module.exports = { register };
