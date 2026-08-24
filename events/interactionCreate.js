const { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder } = require('discord.js');
const { PerfilMembro } = require('../utils/perfilDatabase');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // 1. COMANDOS SLASH
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

    // 2. BOTÕES
    if (interaction.isButton()) {

      // [BOAS-VINDAS]: INICIAR FICHA DE MEMBRO
      if (interaction.customId === 'btn_iniciar_ficha') {
        const modal = new ModalBuilder()
          .setCustomId('modal_ficha_etapa1')
          .setTitle('Ficha de Membro - Perfil');

        const inputNick = new TextInputBuilder()
          .setCustomId('nick_game_input')
          .setLabel('Seu Nick no Jogo:')
          .setPlaceholder('Ex: ÔmegaPlayer#1234')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const inputRank = new TextInputBuilder()
          .setCustomId('rank_side_input')
          .setLabel('Rank no RL SideSwipe:')
          .setPlaceholder('Ex: Bronze, Prata, Ouro, Platina, Diamante...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputNick),
          new ActionRowBuilder().addComponents(inputRank)
        );

        return interaction.showModal(modal);
      }
      
      // [/JOGAR]: ENTRAR NO TIME
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
        embedNovo.setDescription(descricao);

        const componentes = ActionRowBuilder.from(interaction.message.components[0]);

        if (vagasAtuais === 0) {
          componentes.components[0] = ButtonBuilder.from(componentes.components[0])
            .setDisabled(true)
            .setLabel('Time Cheio!');
        }

        await interaction.update({ embeds: [embedNovo], components: [componentes] });

        const criador = await interaction.guild.members.fetch(criadorId).catch(() => null);
        if (criador) {
          const nomeJogo = embedOriginal.title ? embedOriginal.title.replace('🎮 Procura-se Time: ', '') : 'Jogo';
          criador.send(`🎉 **${interaction.member.displayName}** entrou no seu time pra **${nomeJogo}**!`).catch(() => {});
        }
        return;
      }

      // [CALLS]: PAINEL
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
          .setTitle('Definir Jogo');

        const inputNome = new TextInputBuilder()
          .setCustomId('nome_call_input')
          .setLabel('Qual o jogo?')
          .setPlaceholder('Ex: Rocket League, Valorant, Roblox...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'btn_limit_modal') {
        const modal = new ModalBuilder()
          .setCustomId('modal_limit_call')
          .setTitle('Definir Vagas');

        const inputLimite = new TextInputBuilder()
          .setCustomId('limite_call_input')
          .setLabel('Quantidade de vagas (0 pra sem limite):')
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
        return interaction.editReply({ content: estaTrancado ? '🔓 Call liberada! Agora qualquer um pode entrar.' : '🔒 Call trancada! Ninguém entra.' });
      }

      if (interaction.customId === 'btn_hide') {
        await interaction.deferReply({ flags: 64 });
        const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
        await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: estaVisivel ? false : null });
        return interaction.editReply({ content: estaVisivel ? '👁️ Call oculta! Ninguém de fora consegue ver.' : '👁️ Call visível! Todo mundo vê agora.' });
      }

      if (interaction.customId === 'btn_transfer') {
        const membrosNaCall = canal.members.filter(m => m.id !== membro.id);

        if (membrosNaCall.size === 0) {
          return interaction.reply({ content: '❌ Chama mais alguém primeiro pra passar a liderança!', flags: 64 });
        }

        const menuOpcoes = membrosNaCall.map(m => ({
          label: m.displayName,
          value: m.id,
          description: `Passar a liderança pra ${m.user.username}`
        }));

        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_pass_dono')
            .setPlaceholder('Escolha o novo líder...')
            .addOptions(menuOpcoes)
        );

        return interaction.reply({ content: 'Escolha o novo líder:', components: [selectMenu], flags: 64 });
      }

      if (interaction.customId === 'btn_close_call') {
        await interaction.reply({ content: 'Fechando a call e desconectando todo mundo... flw!', flags: 64 });
        client.callsTemporarias.delete(canal.id);

        for (const [_, member] of canal.members) {
          await member.voice.disconnect().catch(() => {});
        }

        return canal.delete().catch(() => {});
      }
    }

    // 3. MODAIS
    if (interaction.isModalSubmit()) {

      // [BOAS-VINDAS]: SALVA PERFIL E CHAMA ETAPA 2 (CARGOS)
      if (interaction.customId === 'modal_ficha_etapa1') {
        await interaction.deferReply({ flags: 64 });

        const nick = interaction.fields.getTextInputValue('nick_game_input');
        const rank = interaction.fields.getTextInputValue('rank_side_input');

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
        const dadosCall = client.callsTemporarias.get(canal.id);

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
        const valorInput = interaction.fields.getTextInputValue('limite_call_input').trim();
        const limite = parseInt(valorInput);

        if (isNaN(limite) || limite < 0 || limite > 99) {
          return interaction.editReply({ content: '❌ Manda um número válido, de 0 a 99, aí.' });
        }

        await canal.setUserLimit(limite);
        return interaction.editReply({ 
          content: limite === 0 ? 'Sem limite de vagas agora.' : `Ajustei o limite pra **${limite} ${limite === 1 ? 'vaga' : 'vagas'}**!` 
        });
      }
    }

    // 4. SELECT MENUS
    if (interaction.isStringSelectMenu()) {

      // [BOAS-VINDAS]: ATRIBUI CARGOS E FINALIZA
      if (interaction.customId === 'select_cargos_jogos') {
        await interaction.deferReply({ flags: 64 });

        const cargosSelecionados = interaction.values;
        const membro = interaction.member;

        for (const roleId of cargosSelecionados) {
          if (roleId) {
            await membro.roles.add(roleId).catch(() => {});
          }
        }

        return interaction.editReply({ content: '🎉 Ficha concluída! Vc já tá pronto pra jogar com o time.' });
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

        const dadosCall = client.callsTemporarias.get(canal.id);
        if (dadosCall) {
          dadosCall.donoId = novoDono.id;
          dadosCall.donoNome = novoDono.displayName;
        }

        await interaction.editReply({ content: `Liderança passada pra ${novoDono}.` });
        return canal.send({ content: `👑 ${antigoDono} passou a liderança pra ${novoDono}.` });
      }
    }
  }
};









