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
      return;
    }

    if (interaction.isButton()) {
      const canal = interaction.channel;
      const membro = interaction.member;

      if (!client.callsTemporarias.has(canal.id)) return;
      const dadosCall = client.callsTemporarias.get(canal.id);

      if (dadosCall.donoId !== membro.id) {
        return interaction.reply({ content: '❌ Apenas o dono atual da call pode usar esse botão.', flags: 64 });
      }

      // Definir Jogo / Nome
      if (interaction.customId === 'btn_rename') {
        const modal = new ModalBuilder()
          .setCustomId('modal_rename_call')
          .setTitle('Definir Jogo / Nome');

        const inputNome = new TextInputBuilder()
          .setCustomId('nome_call_input')
          .setLabel('Digite o nome do jogo ou da sala:')
          .setPlaceholder('Ex: Valorant, Rocket League, Roblox...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
        return interaction.showModal(modal);
      }

      // Definir Limite
      if (interaction.customId === 'btn_limit_modal') {
        const modal = new ModalBuilder()
          .setCustomId('modal_limit_call')
          .setTitle('Definir Limite de Vagas');

        const inputLimite = new TextInputBuilder()
          .setCustomId('limite_call_input')
          .setLabel('Quantidade de vagas (0 para ilimitado, máx 99):')
          .setPlaceholder('Ex: 2, 3, 5 ou 0')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputLimite));
        return interaction.showModal(modal);
      }

      // Trancar / Destrancar
      if (interaction.customId === 'btn_lock') {
        await interaction.deferReply({ flags: 64 });
        const estaTrancado = !canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.Connect);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: estaTrancado ? null : false });
        return interaction.editReply({ content: estaTrancado ? '🔓 Call destrancada. Qualquer pessoa pode entrar.' : '🔒 Call trancada. Ninguém novo consegue entrar.' });
      }

      // Ocultar / Mostrar
      if (interaction.customId === 'btn_hide') {
        await interaction.deferReply({ flags: 64 });
        const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: estaVisivel ? false : null });
        return interaction.editReply({ content: estaVisivel ? '👁️ Call oculta! Ninguém de fora consegue ver a sala no servidor.' : '👁️ Call visível novamente para o servidor.' });
      }

      // Passar Dono
      if (interaction.customId === 'btn_transfer') {
        const membrosNaCall = canal.members.filter(m => m.id !== membro.id);

        if (membrosNaCall.size === 0) {
          return interaction.reply({ content: '❌ Não há outros membros na call para transferir a posse.', flags: 64 });
        }

        const menuOpcoes = membrosNaCall.map(m => ({
          label: m.displayName,
          value: m.id,
          description: `Transferir a posse para ${m.user.username}`
        }));

        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_pass_dono')
            .setPlaceholder('Selecione o novo dono...')
            .addOptions(menuOpcoes)
        );

        return interaction.reply({ content: 'Selecione quem será o novo dono da call:', components: [selectMenu], flags: 64 });
      }

      // Encerrar Call
      if (interaction.customId === 'btn_close_call') {
        await interaction.reply({ content: 'Encerrando a call e desconectando os membros...', flags: 64 });
        client.callsTemporarias.delete(canal.id);

        for (const [_, member] of canal.members) {
          await member.voice.disconnect().catch(() => {});
        }

        return canal.delete().catch(() => {});
      }
    }

    // Modal Renomear
    if (interaction.isModalSubmit() && interaction.customId === 'modal_rename_call') {
      await interaction.deferReply({ flags: 64 });
      const canal = interaction.channel;
      const novoJogo = interaction.fields.getTextInputValue('nome_call_input');
      const dadosCall = client.callsTemporarias.get(canal.id);

      if (dadosCall) {
        dadosCall.jogo = novoJogo;
        const amiguinhos = canal.members.size - 1;
        let sufixoAmigos = amiguinhos === 1 ? ' +1 Ômigo' : amiguinhos > 1 ? ` +${amiguinhos} Ômigos` : '';
        const nomeFinal = `🎮 | ${novoJogo} | ${dadosCall.donoNome}${sufixoAmigos}`;

        await canal.setName(nomeFinal).catch(() => {});
      }

      return interaction.editReply({ content: `✅ Jogo alterado para **${novoJogo}**.` });
    }

    // Modal Limite
    if (interaction.isModalSubmit() && interaction.customId === 'modal_limit_call') {
      await interaction.deferReply({ flags: 64 });
      const canal = interaction.channel;
      const valorInput = interaction.fields.getTextInputValue('limite_call_input').trim();
      const limite = parseInt(valorInput);

      if (isNaN(limite) || limite < 0 || limite > 99) {
        return interaction.editReply({ content: '❌ Digite um número válido entre 0 e 99.' });
      }

      await canal.setUserLimit(limite);
      return interaction.editReply({ 
        content: limite === 0 ? '👥 Limite de vagas removido.' : `👥 Limite ajustado para **${limite} ${limite === 1 ? 'vaga' : 'vagas'}**.` 
      });
    }

    // Menu Troca de Dono
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_pass_dono') {
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

      const dadosCall = client.callsTemporarias.get(canal.id);
      if (dadosCall) {
        dadosCall.donoId = novoDono.id;
        dadosCall.donoNome = novoDono.displayName;
      }

      await interaction.editReply({ content: `✅ Posse da call transferida para ${novoDono}.` });
      return canal.send({ content: `👑 ${antigoDono} transferiu a posse da call para ${novoDono}.` });
    }
  }
};



