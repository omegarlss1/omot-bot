const { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { PerfilMembro } = require('../utils/perfilDatabase');

const cooldownsChamarTime = new Map();
const TEMPO_COOLDOWN = 5 * 60 * 1000;
const CANAL_PINGS_ID = '1541254928545218610';

// IDs dos cargos de notificação
const CARGO_SIDESWIPE_ID = '1541236990232764416';
const CARGO_DIVERSOS_ID = '1541237104754041002';

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
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

    if (interaction.isButton()) {

      // [PAINEL]: CLICOU EM CHAMA TIME -> MOSTRA O MENU DE ESCOLHA DO JOGO
      if (interaction.customId === 'btn_abrir_modal_jogar') {
        const membroId = interaction.user.id;
        const agora = Date.now();

        if (cooldownsChamarTime.has(membroId)) {
          const expiracao = cooldownsChamarTime.get(membroId) + TEMPO_COOLDOWN;
          if (agora < expiracao) {
            const tempoRestante = Math.ceil((expiracao - agora) / 1000 / 60);
            return interaction.reply({
              content: `❌ Vc precisa esperar **${tempoRestante} min** pra chamar o time de novo.`,
              flags: 64
            });
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

        return interaction.reply({
          content: 'Selecione qual jogo vc vai jogar:',
          components: [selectJogos],
          flags: 64
        });
      }

      // [PAINEL PRIVADO]: CONSULTAR PERFIL DO USUÁRIO
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

      // [BOAS-VINDAS / PAINEL]: INICIAR FICHA DE MEMBRO
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
          .setLabel('Rank no RL SideSwipe (deixe em branco se não joga):')
          .setPlaceholder('Ex: Bronze, Prata, Ouro, Platina, Diamante...')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputNick),
          new ActionRowBuilder().addComponents(inputRank)
        );

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
          .setDescription(`❌ **A procura por time foi cancelada pelo líder ${interaction.member}.**`);

        const rowDesativada = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('disabled_cancel').setLabel('Procura Cancelada').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );

        return interaction.update({ embeds: [embedCancelada], components: [rowDesativada] });
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
          const nomeJogo = embedOriginal.title ? embedOriginal.title.replace('🎮 Procura-se Players para: ', '') : 'Jogo';
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

    // 3. SELECT MENUS
    if (interaction.isStringSelectMenu()) {

      // [PAINEL]: ESCOLHEU O TIPO DE JOGO -> ABRE MODAL ESPECÍFICO
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

          modal.addComponents(new ActionRowBuilder().addComponents(inputNomeJogo));
        }

        const inputVagas = new TextInputBuilder()
          .setCustomId('vagas_input')
          .setLabel('Quantas vagas faltam? (1 a 10):')
          .setPlaceholder('Ex: 2')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
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

        return interaction.showModal(modal);
      }

      // [BOAS-VINDAS / PAINEL]: ATRIBUI CARGOS E FINALIZA
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

    // 4. MODAIS
    if (interaction.isModalSubmit()) {

      // [PAINEL]: PROCESSAR ENVIO DO TIME (SIDESWIPE OU DIVERSOS)
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
        if (!canalProcura) {
          return interaction.editReply({ content: '❌ Canal de chamadas não encontrado no servidor!' });
        }

        const cargoId = ehSideSwipe ? CARGO_SIDESWIPE_ID : CARGO_DIVERSOS_ID;
        const mencaoCargo = `<@&${cargoId}>`;

        const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
        const nickRegistrado = perfil?.nickJogo || interaction.member.displayName;

        let descricao = `📢 **${interaction.member.displayName}** tá chamando pra jogar!\n\n`;
        descricao += `👤 **Líder:** ${interaction.member} (Nick: \`${nickRegistrado}\`)\n`;

        if (ehSideSwipe) {
          descricao += `🏆 **Rank:** \`${perfil?.rankSideSwipe || 'Não informado'}\`\n`;
        }

        if (nota) {
          descricao += `📌 **Recado:** ${nota}\n`;
        }

        descricao += `👥 **Vagas Restantes:** ${vagas}\n\n`;
        descricao += `**Time:**\n• ${interaction.member}`;

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

        cooldownsChamarTime.set(interaction.user.id, Date.now());

        await canalProcura.send({
          content: `${mencaoCargo} 🎮 ${interaction.member.displayName} chamou pro ${nomeJogo}!`,
          embeds: [embed],
          components: [rowBotoes]
        });

        return interaction.editReply({ content: `✅ Chamada de time postada no canal ${canalProcura}!` });
      }

      // [BOAS-VINDAS / PAINEL]: SALVA PERFIL E CHAMA ETAPA 2 (CARGOS)
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
  }
};












