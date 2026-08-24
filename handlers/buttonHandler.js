const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { PerfilMembro } = require('../utils/perfilDatabase');

const cooldownsChamarTime = new Map();
const TEMPO_COOLDOWN = 5 * 60 * 1000;
const TEMPO_LIMPEZA_MENSAGEM = 2 * 60 * 60 * 1000; // 3 minutos pra deletar a mensagem final

module.exports = async function handleButtons(interaction, client) {
  // [PAINEL]: CLICOU EM CHAMA TIME
  if (interaction.customId === 'btn_abrir_modal_jogar') {
    const membroId = interaction.user.id;
    const agora = Date.now();

    if (cooldownsChamarTime.has(membroId)) {
      const expiracao = cooldownsChamarTime.get(membroId) + TEMPO_COOLDOWN;
      if (agora < expiracao) {
        const tempoRestante = Math.ceil((expiracao - agora) / 1000 / 60);
        return interaction.reply({ content: `❌ Vc precisa esperar **${tempoRestante} min** pra chamar de novo.`, flags: 64 });
      }
    }

    const selectJogos = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_tipo_jogo_chamada')
        .setPlaceholder('Escolha o jogo da chamada...')
        .addOptions([
          { label: 'RL SideSwipe', value: 'sideswipe', description: 'Notifica a galera do SideSwipe', emoji: '🏎️' },
          { label: 'Outros Jogos', value: 'diversos', description: 'Notifica a galera de Jogos Diversos', emoji: '🎮' }
        ])
    );

    return interaction.reply({ content: 'Selecione qual jogo vc vai jogar:', components: [selectJogos], flags: 64 });
  }

  // [PAINEL PRIVADO]: CONSULTAR PERFIL
  if (interaction.customId === 'btn_ver_perfil') {
    await interaction.deferReply({ flags: 64 });
    const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });

    if (!perfil) {
      return interaction.editReply({ content: '❌ Vc ainda não preencheu sua ficha! Clica em **Editar Ficha** pra cadastrar.' });
    }

    const embedPerfil = new EmbedBuilder()
      .setTitle(`👤 Seu Perfil - ${interaction.user.username}`)
      .addFields(
        { name: '🎮 Nick no Jogo', value: `\`${perfil.nickJogo}\``, inline: true },
        { name: '🏆 Rank SideSwipe', value: `\`${perfil.rankSideSwipe || 'Não informado'}\``, inline: true }
      )
      .setColor('#00FF7F');

    return interaction.editReply({ embeds: [embedPerfil] });
  }

  // [BOAS-VINDAS / PAINEL]: FICHA
  if (interaction.customId === 'btn_iniciar_ficha') {
    const modal = new ModalBuilder().setCustomId('modal_ficha_etapa1').setTitle('Ficha de Membro - Perfil');
    const inputNick = new TextInputBuilder().setCustomId('nick_game_input').setLabel('Seu Nick no Jogo:').setStyle(TextInputStyle.Short).setRequired(true);
    const inputRank = new TextInputBuilder().setCustomId('rank_side_input').setLabel('Rank no RL SideSwipe:').setStyle(TextInputStyle.Short).setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(inputNick), new ActionRowBuilder().addComponents(inputRank));
    return interaction.showModal(modal);
  }

  // [CHAMADAS]: CANCELAR PROCURA
  if (interaction.customId.startsWith('btn_cancel_team_')) {
    const [, , , criadorId] = interaction.customId.split('_');
    if (interaction.user.id !== criadorId) {
      return interaction.reply({ content: '❌ Apenas quem criou a chamada pode cancelar a procura!', flags: 64 });
    }

    const embedOriginal = interaction.message.embeds[0];
    if (!embedOriginal) return;

    const embedCancelada = EmbedBuilder.from(embedOriginal)
      .setTitle(`${embedOriginal.title} [CANCELADO]`)
      .setColor('#7289DA')
      .setDescription(`${embedOriginal.description}\n\n❌ **Procura cancelada pelo líder ${interaction.member}.**\n*(Essa mensagem vai sumir em 3 min)*`);

    const rowDesativada = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('disabled_cancel').setLabel('Procura Cancelada').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );

    await interaction.update({ embeds: [embedCancelada], components: [rowDesativada] });

    // Apaga a mensagem após 3 minutos
    setTimeout(() => {
      interaction.message.delete().catch(() => {});
    }, TEMPO_LIMPEZA_MENSAGEM);

    return;
  }

  // [CHAMADAS]: ENTRAR NO TIME
  if (interaction.customId.startsWith('btn_join_team_')) {
    const [, , , criadorId] = interaction.customId.split('_');
    const embedOriginal = interaction.message.embeds[0];
    if (!embedOriginal) return;

    const embedNovo = EmbedBuilder.from(embedOriginal);
    let descricao = embedNovo.data.description;

    if (descricao.includes(`${interaction.member}`)) {
      return interaction.reply({ content: '❌ Vc já tá nesse time!', flags: 64 });
    }

    const matchVagas = descricao.match(/👥 \*\*Vagas Restantes:\*\* (\d+)/);
    let vagasAtuais = matchVagas ? parseInt(matchVagas[1]) : 0;

    if (vagasAtuais <= 0) {
      return interaction.reply({ content: '❌ O time já tá cheio!', flags: 64 });
    }

    vagasAtuais -= 1;
    descricao = descricao.replace(/👥 \*\*Vagas Restantes:\*\* \d+/, `👥 **Vagas Restantes:** ${vagasAtuais}`);
    descricao += `\n• ${interaction.member}`;

    const componentes = ActionRowBuilder.from(interaction.message.components[0]);

    if (vagasAtuais === 0) {
      embedNovo.setTitle(`${embedOriginal.title} [CHEIO]`);
      descricao += `\n\n🎉 **Time fechado!**\n*(Essa mensagem vai sumir em 3 min)*`;
      componentes.components[0] = ButtonBuilder.from(componentes.components[0]).setDisabled(true).setLabel('Time Cheio!');
      
      // Apaga a mensagem após 3 minutos quando o time encher
      setTimeout(() => {
        interaction.message.delete().catch(() => {});
      }, TEMPO_LIMPEZA_MENSAGEM);
    }

    embedNovo.setDescription(descricao);
    await interaction.update({ embeds: [embedNovo], components: [componentes] });

    const criador = await interaction.guild.members.fetch(criadorId).catch(() => null);
    if (criador) {
      const nomeJogo = embedOriginal.title ? embedOriginal.title.replace('🎮 Procura-se Players para: ', '') : 'Jogo';
      criador.send(`🎉 **${interaction.member.displayName}** entrou no seu time pra **${nomeJogo}**!`).catch(() => {});
    }
    return;
  }

  // [CALLS]: AÇÕES DA CALL
  const canal = interaction.channel;
  const membro = interaction.member;
  if (!client.callsTemporarias.has(canal.id)) return;
  const dadosCall = client.callsTemporarias.get(canal.id);

  if (dadosCall.donoId !== membro.id) {
    return interaction.reply({ content: '❌ Apenas o líder da call pode usar esses botões.', flags: 64 });
  }

  if (interaction.customId === 'btn_rename') {
    const modal = new ModalBuilder().setCustomId('modal_rename_call').setTitle('Definir Jogo');
    const inputNome = new TextInputBuilder().setCustomId('nome_call_input').setLabel('Qual o jogo?').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'btn_limit_modal') {
    const modal = new ModalBuilder().setCustomId('modal_limit_call').setTitle('Definir Vagas');
    const inputLimite = new TextInputBuilder().setCustomId('limite_call_input').setLabel('Vagas (0 = sem limite):').setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(inputLimite));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'btn_lock') {
    await interaction.deferReply({ flags: 64 });
    const estaTrancado = !canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.Connect);
    await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: estaTrancado ? null : false });
    return interaction.editReply({ content: estaTrancado ? '🔓 Call liberada!' : '🔒 Call trancada!' });
  }

  if (interaction.customId === 'btn_hide') {
    await interaction.deferReply({ flags: 64 });
    const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
    await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: estaVisivel ? false : null });
    return interaction.editReply({ content: estaVisivel ? '👁️ Call oculta!' : '👁️ Call visível!' });
  }

  if (interaction.customId === 'btn_transfer') {
    const membrosNaCall = canal.members.filter(m => m.id !== membro.id);
    if (membrosNaCall.size === 0) return interaction.reply({ content: '❌ Chama mais gente primeiro pra passar a liderança!', flags: 64 });

    const menuOpcoes = membrosNaCall.map(m => ({ label: m.displayName, value: m.id, description: `Passar a liderança pra ${m.user.username}` }));
    const selectMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_pass_dono').setPlaceholder('Escolha o novo líder...').addOptions(menuOpcoes));
    return interaction.reply({ content: 'Escolha o novo líder:', components: [selectMenu], flags: 64 });
  }

  if (interaction.customId === 'btn_close_call') {
    await interaction.reply({ content: 'Fechando a call e desconectando todo mundo... flw!', flags: 64 });
    client.callsTemporarias.delete(canal.id);
    for (const [_, member] of canal.members) await member.voice.disconnect().catch(() => {});
    return canal.delete().catch(() => {});
  }
};

