const { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // 1. EXECUÇÃO DE COMANDOS SLASH (/call, /jogar, etc)
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) {
        try {
          await command.execute(interaction, client);
        } catch (err) {
          console.error(`Erro ao executar /${interaction.commandName}:`, err);
        }
      }
      return;
    }

    // 2. INTERAÇÕES DE BOTÕES
    if (interaction.isButton()) {
      
      // ==========================================
      // [SISTEMA /JOGAR]: BOTÃO "ENTRAR NO TIME"
      // ==========================================
      if (interaction.customId.startsWith('btn_join_team_')) {
        const [, , , criadorId, maxVagasStr] = interaction.customId.split('_');
        const embedOriginal = interaction.message.embeds[0];

        if (!embedOriginal) return;

        const embedNovo = EmbedBuilder.from(embedOriginal);
        let descricao = embedNovo.data.description;

        // Evita duplicar o mesmo jogador no time
        if (descricao.includes(`${interaction.member}`)) {
          return interaction.reply({ content: '❌ Você já está na lista deste time!', flags: 64 });
        }

        // Extrai quantidade atual de vagas restantes da descrição do Embed
        const matchVagas = descricao.match(/👥 \*\*Vagas Restantes:\*\* (\d+)/);
        let vagasAtuais = matchVagas ? parseInt(matchVagas[1]) : 0;

        if (vagasAtuais <= 0) {
          return interaction.reply({ content: '❌ O time já está cheio!', flags: 64 });
        }

        vagasAtuais -= 1;

        // Atualiza o texto da descrição com a nova vaga e insere o membro na lista
        descricao = descricao.replace(/👥 \*\*Vagas Restantes:\*\* \d+/, `👥 **Vagas Restantes:** ${vagasAtuais}`);
        descricao += `\n• ${interaction.member}`;
        embedNovo.setDescription(descricao);

        // Clona e atualiza os componentes
        const componentes = ActionRowBuilder.from(interaction.message.components[0]);

        // Se as vagas acabarem, desativa o botão de entrada
        if (vagasAtuais === 0) {
          componentes.components[0] = ButtonBuilder.from(componentes.components[0])
            .setDisabled(true)
            .setLabel('Time Cheio!');
        }

        await interaction.update({ embeds: [embedNovo], components: [componentes] });

        // Notifica o criador da chamada no privado
        const criador = await interaction.guild.members.fetch(criadorId).catch(() => null);
        if (criador) {
          const nomeJogo = embedOriginal.title ? embedOriginal.title.replace('🎮 Procura-se Time: ', '') : 'Jogo';
          criador.send(`🎉 **${interaction.member.displayName}** entrou no seu time para **${nomeJogo}**!`).catch(() => {});
        }
        return;
      }

      // ==========================================
      // [SISTEMA DE CALLS]: BOTÕES DO PAINEL
      // ==========================================
      const canal = interaction.channel;
      const membro = interaction.member;

      if (!client.callsTemporarias.has(canal.id)) return;
      const dadosCall = client.callsTemporarias.get(canal.id);

      if (dadosCall.donoId !== membro.id) {
        return interaction.reply({ content: '❌ Apenas o líder da call pode usar esses botões.', flags: 64 });
      }

      if (interaction.customId === 'btn_rename') {
        const modal = new ModalBuilder()
          .setCustomId('modal_rename_call')
          .setTitle('Definir Jogo / Nome');

        const inputNome = new TextInputBuilder()
          .setCustomId('nome_call_input')
          .setLabel('Qual o jogo ou nome da sala?')
          .setPlaceholder('Ex: Rocket League, Valorant, Roblox...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'btn_limit_modal') {
        const modal = new ModalBuilder()
          .setCustomId('modal_limit_call')
          .setTitle('Definir Limite de Vagas');

        const inputLimite = new TextInputBuilder()
          .setCustomId('limite_call_input')
          .setLabel('Quantidade de vagas (0 para sem limite):')
          .setPlaceholder('Ex: 2, 3, 5 ou 0')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputLimite));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'btn_lock') {
        await interaction.deferReply({ flags: 64 });
        const estaTrancado = !canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.Connect);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: estaTrancado ? null : false });
        return interaction.editReply({ content: estaTrancado ? '🔓 Call liberada! Agora qualquer um pode entrar.' : '🔒 Tranquei a call! Ninguém mais entra.' });
      }

      if (interaction.customId === 'btn_hide') {
        await interaction.deferReply({ flags: 64 });
        const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: estaVisivel ? false : null });
        return interaction.editReply({ content: estaVisivel ? '👁️ Call oculta! Ninguém de fora consegue ver a sala no servidor.' : '👁️ Call visível! Todo mundo consegue ver a sala agora.' });
      }

      if (interaction.customId === 'btn_transfer') {
        const membrosNaCall = canal.members.filter(m => m.id !== membro.id);

        if (membrosNaCall.size === 0) {
          return interaction.reply({ content: '❌ Não tem mais ninguém na call pra vc passar a liderança. Chame a galera primeiro!', flags: 64 });
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

        return interaction.reply({ content: 'Escolha quem vai ser o novo líder da sala:', components: [selectMenu], flags: 64 });
      }

      if (interaction.customId === 'btn_close_call') {
        await interaction.reply({ content: 'Fechando a call e desconectando a galera... flw!', flags: 64 });
        client.callsTemporarias.delete(canal.id);

        for (const [_, member] of canal.members) {
          await member.voice.disconnect().catch(() => {});
        }

        return canal.delete().catch(() => {});
      }
    }

    // 3. ENVIO DE FORMULÁRIOS (MODAIS DO SISTEMA DE CALLS)
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

      return interaction.editReply({ content: `pdp! Jogo alterado para **${novoJogo}**.` });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_limit_call') {
      await interaction.deferReply({ flags: 64 });
      const canal = interaction.channel;
      const valorInput = interaction.fields.getTextInputValue('limite_call_input').trim();
      const limite = parseInt(valorInput);

      if (isNaN(limite) || limite < 0 || limite > 99) {
        return interaction.editReply({ content: '❌ Manda um número válido de 0 a 99 aí.' });
      }

      await canal.setUserLimit(limite);
      return interaction.editReply({ 
        content: limite === 0 ? 'Sem limite de vagas agora, pode entrar todo mundo.' : `Ajustei o limite pra **${limite} ${limite === 1 ? 'vaga' : 'vagas'}**!` 
      });
    }

    // 4. MENU DE SELEÇÃO (TROCA DE LÍDER DA CALL)
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

      await interaction.editReply({ content: `Feito! Vc passou a liderança pra ${novoDono}.` });
      return canal.send({ content: `👑 ${antigoDono} passou a liderança da sala para ${novoDono}.` });
    }
  }
};





