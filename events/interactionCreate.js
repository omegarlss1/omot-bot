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

    // Processa Botões
    if (interaction.isButton()) {
      const canal = interaction.channel;
      const membro = interaction.member;

      if (!client.callsTemporarias.has(canal.id)) return;
      const dadosCall = client.callsTemporarias.get(canal.id);

      if (dadosCall.donoId !== membro.id) {
        return interaction.reply({ content: '❌ Apenas o dono atual desta call pode alterar as configurações!', flags: 64 });
      }

      // TRANCAR / DESTRANCAR
      if (interaction.customId === 'btn_lock') {
        await interaction.deferReply({ flags: 64 });
        const estaTrancado = !canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.Connect);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: estaTrancado ? null : false });
        return interaction.editReply({ content: estaTrancado ? '🔓 A call foi **destrancada**!' : '🔒 A call foi **trancada**!' });
      }

      // OCULTAR / MOSTRAR
      if (interaction.customId === 'btn_hide') {
        await interaction.deferReply({ flags: 64 });
        const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: estaVisivel ? false : null });
        return interaction.editReply({ content: estaVisivel ? '👁️ A call agora está **oculta**!' : '👁️ A call agora está **visível**!' });
      }

      // MENU DE SELEÇÃO DE LIMITE
      if (interaction.customId === 'btn_limit_menu') {
        const opcoesLimite = [
          { label: 'Sem limite', value: '0', description: 'Permite entrada ilimitada de membros' },
          ...Array.from({ length: 10 }, (_, i) => ({
            label: `${i + 1} ${i === 0 ? 'Vaga' : 'Vagas'}`,
            value: `${i + 1}`,
            description: `Limita a call para no máximo ${i + 1} membros`
          }))
        ];

        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_limit_value')
            .setPlaceholder('Escolha a quantidade de vagas...')
            .addOptions(opcoesLimite)
        );

        return interaction.reply({ content: '👥 Selecione a quantidade de vagas desejada:', components: [selectMenu], flags: 64 });
      }

      // RENOMEAR
      if (interaction.customId === 'btn_rename') {
        const modal = new ModalBuilder()
          .setCustomId('modal_rename_call')
          .setTitle('Definir Jogo / Nome');

        const inputNome = new TextInputBuilder()
          .setCustomId('nome_call_input')
          .setLabel('Nome do jogo ou da sala:')
          .setPlaceholder('Ex: Valorant, Rocket League, Roblox...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
        return interaction.showModal(modal);
      }

      // PASSAR DONO
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

      // ENCERRAR CALL
      if (interaction.customId === 'btn_close_call') {
        await interaction.reply({ content: '💥 Encerrando a call e desconectando membros...', flags: 64 });
        client.callsTemporarias.delete(canal.id);

        // Desconecta todo mundo antes de apagar
        for (const [_, member] of canal.members) {
          await member.voice.disconnect().catch(() => {});
        }

        return canal.delete().catch(() => {});
      }
    }

    // Processa Aplicação de Limite no Select Menu
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_limit_value') {
      await interaction.deferReply({ flags: 64 });
      const canal = interaction.channel;
      const limite = parseInt(interaction.values[0]);

      await canal.setUserLimit(limite);
      return interaction.editReply({ 
        content: limite === 0 ? '👥 Limite de vagas **removido**!' : `👥 Limite ajustado para **${limite} ${limite === 1 ? 'membro' : 'membros'}**!` 
      });
    }

    // Processa Modal Renomear
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

      return interaction.editReply({ content: `✏️ Jogo/Nome atualizado para: **${novoJogo}**` });
    }

    // Processa Troca de Dono
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

      await interaction.editReply({ content: `✅ Você transferiu a posse da call para ${novoDono}!` });
      return canal.send({ content: `👑 **Nova Liderança:** ${antigoDono} transferiu a posse da call para ${novoDono}!` });
    }
  }
};

