const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = async function handleSelectMenus(interaction) {
  // [PAINEL]: TIPO DE JOGO
  if (interaction.customId === 'select_tipo_jogo_chamada') {
    const tipoJogo = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(`modal_chamar_time_${tipoJogo}`)
      .setTitle(tipoJogo === 'sideswipe' ? 'Chamar time: RL SideSwipe' : 'Chamar time: Outros Jogos');

    if (tipoJogo === 'diversos') {
      const inputNomeJogo = new TextInputBuilder()
        .setCustomId('nome_jogo_input')
        .setLabel('Nome do Jogo:')
        .setPlaceholder('Ex: Valorant, Roblox, Minecraft...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const inputVagas = new TextInputBuilder()
        .setCustomId('vagas_input')
        .setLabel('Quantas vagas faltam?')
        .setPlaceholder('Ex: 5, 10, 20...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const inputNota = new TextInputBuilder()
        .setCustomId('nota_input')
        .setLabel('Recado / Observação (opcional):')
        .setPlaceholder('Ex: Falta 1 pra fechar a private...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputNomeJogo),
        new ActionRowBuilder().addComponents(inputVagas),
        new ActionRowBuilder().addComponents(inputNota)
      );
    } else {
      // RL SideSwipe
      const inputVagas = new TextInputBuilder()
        .setCustomId('vagas_input')
        .setLabel('Quantas vagas faltam?')
        .setPlaceholder('Ex: 1, 2, 3...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const inputNota = new TextInputBuilder()
        .setCustomId('nota_input')
        .setLabel('Recado / Observação (opcional):')
        .setPlaceholder('Ex: Casual, Duelo 2v2...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputVagas),
        new ActionRowBuilder().addComponents(inputNota)
      );
    }

    return interaction.showModal(modal);
  }

  // [BOAS-VINDAS / PAINEL]: ATRIBUI CARGOS
  if (interaction.customId === 'select_cargos_jogos') {
    await interaction.deferReply({ flags: 64 });
    for (const roleId of interaction.values) {
      if (roleId) await interaction.member.roles.add(roleId).catch(() => {});
    }
    return interaction.editReply({ content: '🎉 Ficha concluída! Vc já tá pronto pra jogar com a gente.' });
  }

  // [CALLS]: TROCA DE LÍDER
  if (interaction.customId === 'select_pass_dono') {
    await interaction.deferReply({ flags: 64 });
    const canal = interaction.channel;
    const novoDonoId = interaction.values[0];
    const antigoDono = interaction.member;
    const novoDono = canal.members.get(novoDonoId);

    if (!novoDono) return interaction.editReply({ content: '❌ Membro não encontrado na call.' });

    await canal.permissionOverwrites.delete(antigoDono.id).catch(() => {});
    await canal.permissionOverwrites.edit(novoDono.id, {
      [PermissionFlagsBits.ManageChannels]: true,
      [PermissionFlagsBits.MoveMembers]: true,
      [PermissionFlagsBits.Connect]: true
    });

    const dadosCall = interaction.client.callsTemporarias.get(canal.id);
    if (dadosCall) {
      dadosCall.donoId = novoDono.id;
      dadosCall.donoNome = novoDono.displayName;
    }

    await interaction.editReply({ content: `Liderança passada pra ${novoDono}.` });
    return canal.send({ content: `👑 ${antigoDono} passou a liderança pra ${novoDono}.` });
  }
};

