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

    // Interações de Botões
    if (interaction.isButton()) {
      const canal = interaction.channel;
      const membro = interaction.member;

      if (!client.callsTemporarias.has(canal.id)) return;
      const dadosCall = client.callsTemporarias.get(canal.id);

      if (dadosCall.donoId !== membro.id) {
        return interaction.reply({ content: '✋ Calma lá! Só o dono da sala pode mexer nesses botões.', flags: 64 });
      }

      // 1. DEFINIR JOGO / NOME (Modal)
      if (interaction.customId === 'btn_rename') {
        const modal = new ModalBuilder()
          .setCustomId('modal_rename_call')
          .setTitle('Definir Jogo / Nome');

        const inputNome = new TextInputBuilder()
          .setCustomId('nome_call_input')
          .setLabel('Qual o jogo ou nome da sala?')
          .setPlaceholder('Ex: Rocket League, Valorant, Fortnite...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
        return interaction.showModal(modal);
      }

      // 2. DEFINIR LIMITE (Modal com digitação livre)
      if (interaction.customId === 'btn_limit_modal') {
        const modal = new ModalBuilder()
          .setCustomId('modal_limit_call')
          .setTitle('Definir Limite de Vagas');

        const inputLimite = new TextInputBuilder()
          .setCustomId('limite_call_input')
          .setLabel('Número máximo de vagas (0 para sem limite):')
          .setPlaceholder('Ex: 2, 3, 5 ou 0 para ilimitado')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputLimite));
        return interaction.showModal(modal);
      }

      // 3. TRANCAR / DESTRANCAR
      if (interaction.customId === 'btn_lock') {
        await interaction.deferReply({ flags: 64 });
        const estaTrancado = !canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.Connect);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: estaTrancado ? null : false });
        return interaction.editReply({ content: estaTrancado ? '🔓 Sala liberada! Pode entrar todo mundo.' : '🔒 Tranquei a sala! Ninguém mais entra.' });
      }

      // 4. OCULTAR / MOSTRAR
      if (interaction.customId === 'btn_hide') {
        await interaction.deferReply({ flags: 64 });
        const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: estaVisivel ? false : null });
        return interaction.editReply({ content: estaVisivel ? '🙈 Sala escondida! Ninguém vê no servidor.' : '👁️ Sala visível de novo pra galera!' });
      }

      // 5. PASSAR DONO
      if (interaction.customId === 'btn_transfer') {
        const membrosNaCall = canal.members.filter(m => m.id !== membro.id);

        if (membrosNaCall.size === 0) {
          return interaction.reply({ content: '❌ Não tem ninguém aqui pra receber a coroa!', flags: 64 });
        }

        const menuOpcoes = membrosNaCall.map(m => ({
          label: m.displayName,
          value: m.id,
          description: `Passar a liderança para ${m.user.username}`
        }));

        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_pass_dono')
            .setPlaceholder('Escolha o novo líder...')
            .addOptions(menuOpcoes)
        );

        return interaction.reply({ content: '👑 Escolha pra quem vai passar a coroa:', components: [selectMenu], flags: 64 });
      }

      // 6. ENCERRAR CALL
      if (interaction.customId === 'btn_close_call') {
        await interaction.reply({ content: '💥 Fechando a firma! Desconectando todo mundo...', flags: 64 });
        client.callsTemporarias.delete(canal.id);

        for (const [_, member] of canal.members) {
          await member.voice.disconnect().catch(() => {});
        }

        return canal.delete().catch(() => {});
      }
    }

    // Processa Modal de Renomear
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

      return interaction.editReply({ content: `✏️ Boa! Jogo alterado para **${novoJogo}**.` });
    }

    // Processa Modal de Limite
    if (interaction.isModalSubmit() && interaction.customId === 'modal_limit_call') {
      await interaction.deferReply({ flags: 64 });
      const canal = interaction.channel;
      const valorInput = interaction.fields.getTextInputValue('limite_call_input').trim();
      const limite = parseInt(valorInput);

      if (isNaN(limite) || limite < 0) {
        return interaction.editReply({ content: '❌ Digita um número válido aí! (ex: 2, 3 ou 0).' });
      }

      await canal.setUserLimit(limite);
      return interaction.editReply({ 
        content: limite === 0 ? '👥 Limite removido! Cabe todo mundo.' : `👥 Vagas ajustadas para **${limite} ${limite === 1 ? 'membro' : 'membros'}**!` 
      });
    }

    // Processa Troca de Dono
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_pass_dono') {
      await interaction.deferReply({ flags: 64 });
      const canal = interaction.channel;
      const novoDonoId = interaction.values[0];
      const antigoDono = interaction.member;
      const novoDono = canal.members.get(novoDonoId);

      if (!novoDono) return interaction.editReply({ content: '❌ Não achei o membro na sala.' });

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

      await interaction.editReply({ content: `✅ Coroa repassada para ${novoDono}!` });
      return canal.send({ content: `👑 ${antigoDono} passou a liderança para ${novoDono}!` });
    }
  }
};


