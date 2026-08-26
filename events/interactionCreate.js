const { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) {
        try {
          await command.execute(interaction, client);
        } catch (err) {
          console.error(`Erro ao executar ${interaction.commandName}:`, err);
        }
      }
    }

    // 1. Processar Ações do Painel de Botoes
    if (interaction.isButton()) {
      const canal = interaction.channel;
      const membro = interaction.member;

      if (!client.callsTemporarias.has(canal.id)) return;

      const dadosCall = client.callsTemporarias.get(canal.id);

      // Validação: Apenas o dono atual pode mexer no painel
      if (dadosCall.donoId !== membro.id) {
        return interaction.reply({ 
          content: '❌ Apenas o dono atual desta call pode alterar as configurações!', 
          flags: 64 
        });
      }

      // Trancar / Destrancar
      if (interaction.customId === 'btn_lock') {
        const estaTrancado = !canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.Connect);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: estaTrancado ? null : false });
        return interaction.reply({ content: estaTrancado ? '🔓 A call foi **destrancada**!' : '🔒 A call foi **trancada**!', flags: 64 });
      }

      // Ocultar / Mostrar
      if (interaction.customId === 'btn_hide') {
        const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: estaVisivel ? false : null });
        return interaction.reply({ content: estaVisivel ? '👁️ A call agora está **oculta**!' : '👁️ A call agora está **visível**!', flags: 64 });
      }

      // Ciclo de Limite
      if (interaction.customId === 'btn_limit') {
        let novoLimite = 0;
        if (canal.userLimit === 0) novoLimite = 2;
        else if (canal.userLimit === 2) novoLimite = 3;
        else if (canal.userLimit === 3) novoLimite = 6;
        else novoLimite = 0;

        await canal.setUserLimit(novoLimite);
        return interaction.reply({ content: novoLimite === 0 ? '👥 Limite de membros **removido**!' : `👥 Limite ajustado para **${novoLimite} membros**!`, flags: 64 });
      }

      // Renomear / Jogo (Abre Modal)
      if (interaction.customId === 'btn_rename') {
        const modal = new ModalBuilder()
          .setCustomId('modal_rename_call')
          .setTitle('Renomear Call / Definir Jogo');

        const inputNome = new TextInputBuilder()
          .setCustomId('nome_call_input')
          .setLabel('Novo nome ou jogo da sala:')
          .setPlaceholder('Ex: 🎮 | Rocket League 3v3 ou 🎮 | Valorant')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
        return interaction.showModal(modal);
      }

      // Passar Dono Manualmente (Gera Menu Suspenso de Escolha)
      if (interaction.customId === 'btn_transfer') {
        const membrosNaCall = canal.members.filter(m => m.id !== membro.id);

        if (membrosNaCall.size === 0) {
          return interaction.reply({ content: '❌ Não há outros membros nesta call para transferir a posse!', flags: 64 });
        }

        const menuOpcoes = membrosNaCall.map(m => ({
          label: m.displayName,
          value: m.id,
          description: `Transferir a liderança para ${m.user.username}`
        }));

        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_pass_dono')
            .setPlaceholder('Selecione o novo dono da call...')
            .addOptions(menuOpcoes)
        );

        return interaction.reply({ content: '👑 Escolha o novo dono abaixo:', components: [selectMenu], flags: 64 });
      }
    }

    // 2. Processar Modal de Renomear
    if (interaction.isModalSubmit() && interaction.customId === 'modal_rename_call') {
      const novoNome = interaction.fields.getTextInputValue('nome_call_input');
      await interaction.channel.setName(novoNome);
      return interaction.reply({ content: `✏️ Nome da call alterado para: **${novoNome}**`, flags: 64 });
    }

    // 3. Processar Seleção de Transferência de Dono no Menu Suspenso
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_pass_dono') {
      const canal = interaction.channel;
      const novoDonoId = interaction.values[0];
      const antigoDono = interaction.member;
      const novoDono = canal.members.get(novoDonoId);

      if (!novoDono) return interaction.reply({ content: '❌ Membro não encontrado na call.', flags: 64 });

      // Atualiza Permissões
      await canal.permissionOverwrites.delete(antigoDono.id).catch(() => {});
      await canal.permissionOverwrites.edit(novoDono.id, {
        [PermissionFlagsBits.ManageChannels]: true,
        [PermissionFlagsBits.MoveMembers]: true,
        [PermissionFlagsBits.Connect]: true
      });

      // Atualiza Registro no Map
      client.callsTemporarias.set(canal.id, { donoId: novoDono.id });

      await interaction.reply({ content: `✅ Você transferiu a posse da call para ${novoDono}!`, flags: 64 });
      return canal.send({ content: `👑 **Nova Liderança:** ${antigoDono} transferiu a posse da call para ${novoDono}!` });
    }
  }
};