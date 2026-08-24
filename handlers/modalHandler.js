const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { PerfilMembro } = require('../utils/perfilDatabase');

const CANAL_PINGS_ID = '1541254928545218610';
const CARGO_SIDESWIPE_ID = '1541236990232764416';
const CARGO_DIVERSOS_ID = '1541237104754041002';

module.exports = async function handleModals(interaction) {
  // [PAINEL]: ENVIO DE TIME
  if (interaction.customId.startsWith('modal_chamar_time_')) {
    await interaction.deferReply({ flags: 64 });

    const tipoJogo = interaction.customId.replace('modal_chamar_time_', '');
    const ehSideSwipe = tipoJogo === 'sideswipe';

    const nomeJogo = ehSideSwipe ? 'RL SideSwipe' : interaction.fields.getTextInputValue('nome_jogo_input');
    const vagasStr = interaction.fields.getTextInputValue('vagas_input').trim();
    const nota = interaction.fields.getTextInputValue('nota_input');
    const vagas = parseInt(vagasStr);

    if (isNaN(vagas) || vagas < 1 || vagas > 10) {
      return interaction.editReply({ content: '❌ Manda um número de vagas válido entre 1 e 10!' });
    }

    const canalProcura = interaction.guild.channels.cache.get(CANAL_PINGS_ID);
    if (!canalProcura) return interaction.editReply({ content: '❌ Canal de chamadas não encontrado no servidor!' });

    const cargoId = ehSideSwipe ? CARGO_SIDESWIPE_ID : CARGO_DIVERSOS_ID;
    const mencaoCargo = `<@&${cargoId}>`;

    const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
    const nickRegistrado = perfil?.nickJogo || interaction.member.displayName;

    let descricao = `📢 **${interaction.member.displayName}** tá chamando pra jogar!\n\n`;
    descricao += `👤 **Líder:** ${interaction.member} (Nick: \`${nickRegistrado}\`)\n`;

    if (ehSideSwipe) descricao += `🏆 **Rank:** \`${perfil?.rankSideSwipe || 'Não informado'}\`\n`;
    if (nota) descricao += `📌 **Recado:** ${nota}\n`;

    descricao += `👥 **Vagas Restantes:** ${vagas}\n\n**Time:**\n• ${interaction.member}`;

    const embed = new EmbedBuilder()
      .setTitle(`🎮 Procura-se Players para: ${nomeJogo}`)
      .setDescription(descricao)
      .setColor('#FF6B00')
      .setFooter({ text: 'Clica nos botões abaixo pra entrar ou cancelar a busca!' })
      .setTimestamp();

    const rowBotoes = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`btn_join_team_${interaction.user.id}_${vagas}`).setLabel('Entrar no Time').setStyle(ButtonStyle.Success).setEmoji('🎮'),
      new ButtonBuilder().setCustomId(`btn_cancel_team_${interaction.user.id}`).setLabel('Cancelar Procura').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );

    await canalProcura.send({
      content: `${mencaoCargo} 🎮 ${interaction.member.displayName} chamou pro ${nomeJogo}!`,
      embeds: [embed],
      components: [rowBotoes]
    });

    return interaction.editReply({ content: `✅ Chamada de time postada no canal ${canalProcura}!` });
  }

  // [BOAS-VINDAS / PAINEL]: FICHA ETAPA 1
  if (interaction.customId === 'modal_ficha_etapa1') {
    await interaction.deferReply({ flags: 64 });
    const nick = interaction.fields.getTextInputValue('nick_game_input');
    const rank = interaction.fields.getTextInputValue('rank_side_input') || 'Não informado';

    await PerfilMembro.findOneAndUpdate(
      { guildId: interaction.guildId, userId: interaction.user.id },
      { nickJogo: nick, rankSideSwipe: rank },
      { upsert: true, new: true }
    );

    const selectCargos = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_cargos_jogos')
        .setPlaceholder('Escolha os jogos que quer ser notificado...')
        .setMinValues(0)
        .setMaxValues(2)
        .addOptions([
          { label: 'RL SideSwipe', value: '1541236990232764416', description: 'Avisos de chamadas do SideSwipe' },
          { label: 'Jogos Diversos', value: '1541237104754041002', description: 'Avisos de chamadas de outros jogos' }
        ])
    );

    return interaction.editReply({
      content: '✅ Perfil salvo! Agora escolha abaixo os avisos que vc quer receber quando chamarem pro time:',
      components: [selectCargos]
    });
  }

  // [CALLS]: RENOMEAR
  if (interaction.customId === 'modal_rename_call') {
    await interaction.deferReply({ flags: 64 });
    const canal = interaction.channel;
    const novoJogo = interaction.fields.getTextInputValue('nome_call_input');
    const dadosCall = interaction.client.callsTemporarias.get(canal.id);

    if (dadosCall) {
      dadosCall.jogo = novoJogo;
      const amiguinhos = canal.members.size - 1;
      let sufixoAmigos = amiguinhos === 1 ? ' +1 Ômigo' : amiguinhos > 1 ? ` +${amiguinhos} Ômigos` : '';
      const nomeFinal = `🎮 | ${novoJogo} | ${dadosCall.donoNome}${sufixoAmigos}`;
      await canal.setName(nomeFinal).catch(() => {});
    }

    return interaction.editReply({ content: `Jogo alterado para **${novoJogo}**.` });
  }

  // [CALLS]: LIMITE
  if (interaction.customId === 'modal_limit_call') {
    await interaction.deferReply({ flags: 64 });
    const canal = interaction.channel;
    const limite = parseInt(interaction.fields.getTextInputValue('limite_call_input').trim());

    if (isNaN(limite) || limite < 0 || limite > 99) {
      return interaction.editReply({ content: '❌ Manda um número válido, de 0 a 99, aí.' });
    }

    await canal.setUserLimit(limite);
    return interaction.editReply({ content: limite === 0 ? 'Sem limite de vagas agora.' : `Ajustei o limite pra **${limite} ${limite === 1 ? 'vaga' : 'vagas'}**!` });
  }
};
