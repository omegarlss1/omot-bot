const { PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // COMANDOS
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) try { await cmd.execute(interaction, client); } catch(e){ console.error(e); }
      return;
    }

    // MODAIS
    if (interaction.isModalSubmit()) {
      const [tipo, callId] = interaction.customId.split('_');
      const canal = interaction.guild.channels.cache.get(callId);
      if (!canal) return interaction.reply({ content: '❌ Call não existe mais', ephemeral: true });

      if (tipo === 'modal-rename') {
        const novoNome = interaction.fields.getTextInputValue('novoNome');
        await canal.setName(novoNome).catch(()=>{});
        // atualiza memoria se renomeou na mão
        const dados = client.callsTemporarias.get(callId);
        if(dados) dados.game = novoNome.split('|')[0].trim();
        return interaction.reply({ content: `✏️ Renomeado para **${novoNome}**!`, ephemeral: true });
      }

      if (tipo === 'modal-limit') {
        const limite = parseInt(interaction.fields.getTextInputValue('limite'));
        if (isNaN(limite) || limite < 0 || limite > 99) return interaction.reply({ content: '❌ Use 0 a 99 (0 = sem limite)', ephemeral: true });
        await canal.setUserLimit(limite).catch(()=>{});
        return interaction.reply({ content: `👥 Limite alterado para **${limite === 0? 'sem limite' : limite}**!`, ephemeral: true });
      }

      if (tipo === 'modal-setgame') {
        const gameNome = interaction.fields.getTextInputValue('gameNome');
        const dados = client.callsTemporarias.get(callId);
        const donoNome = dados?.donoNome || interaction.member.displayName;
        if(dados) dados.game = gameNome;
        const total = canal.members.size;
        let nomeFinal;
        if (total <= 1) nomeFinal = `${gameNome} | ${donoNome}`;
        else if (total === 2) nomeFinal = `${gameNome} | ${donoNome} +1 Ômigo`;
        else nomeFinal = `${gameNome} | ${donoNome} +${total-1} Ômigos`;

        await canal.setName(nomeFinal).catch(()=>{});
        return interaction.reply({ content: `🎮 Call atualizada para **${nomeFinal}**!`, ephemeral: true });
      }
      return;
    }

    // SELECT MENU - KICKAR
    if (interaction.isStringSelectMenu()) {
      await interaction.deferUpdate().catch(()=>{});
      const [acao, callId] = interaction.customId.split('_');
      if (acao === 'kick-select') {
        const userId = interaction.values[0];
        const member = interaction.guild.members.cache.get(userId);
        if (member?.voice?.channelId === callId) {
          await member.voice.disconnect().catch(()=>{});
          await interaction.followUp({ content: `❌ <@${userId}> kickado da call!`, ephemeral: true }).catch(()=>{});
        }
      }
      return;
    }

    // BOTÕES
    if (!interaction.isButton()) return;

    const [acao, callId] = interaction.customId.split('_');
    const canal = interaction.guild.channels.cache.get(callId);
    if (!canal) return interaction.reply({ content: '❌ Call não existe mais.', ephemeral: true }).catch(()=>{});

    const dados = client.callsTemporarias.get(callId);
    if (interaction.user.id!== dados?.dono &&!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({ content: '❌ Só o dono da call pode usar!', ephemeral: true }).catch(()=>{});
    }

    try {
      if (acao === 'setgame') {
        const modal = new ModalBuilder().setCustomId(`modal-setgame_${callId}`).setTitle('Qual jogo vai jogar?');
        const input = new TextInputBuilder().setCustomId('gameNome').setLabel('Nome do jogo').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Valorant, Fortnite, Minecraft').setMaxLength(30).setValue(dados?.game === 'Aguardando jogo'? '' : dados?.game || '');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (acao === 'lock') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        return interaction.reply({ content: '🔒 Call trancada! Ninguém mais entra.', ephemeral: true });
      }
      if (acao === 'unlock') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: null });
        return interaction.reply({ content: '🔓 Call destrancada!', ephemeral: true });
      }
      if (acao === 'ghost') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        return interaction.reply({ content: '👻 Call escondida!', ephemeral: true });
      }
      if (acao === 'unghost') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: null });
        return interaction.reply({ content: '👁️ Call visível novamente!', ephemeral: true });
      }
      if (acao === 'delete') {
        await interaction.reply({ content: '🗑️ Deletando call...', ephemeral: true });
        await canal.delete().catch(()=>{});
        client.callsTemporarias.delete(callId);
        return;
      }
      if (acao === 'rename') {
        const modal = new ModalBuilder().setCustomId(`modal-rename_${callId}`).setTitle('Renomear Call');
        const input = new TextInputBuilder().setCustomId('novoNome').setLabel('Novo nome da call').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(canal.name);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (acao === 'limit') {
        const modal = new ModalBuilder().setCustomId(`modal-limit_${callId}`).setTitle('Limite de Ômigos');
        const input = new TextInputBuilder().setCustomId('limite').setLabel('Quantos Ômigos? (0 = sem limite)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setValue(String(canal.userLimit || 0));
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (acao === 'kick') {
        if (canal.members.size <= 1) return interaction.reply({ content: '❌ Só você na call, Ômigo!', ephemeral: true });
        const options = canal.members.filter(m => m.id!== interaction.user.id).map(m => ({ label: m.displayName.substring(0,25), value: m.id, description: `@${m.user.username}`.substring(0,50) })).slice(0, 25);
        if(options.length === 0) return interaction.reply({ content: '❌ Ninguém pra kickar', ephemeral: true });
        const menu = new StringSelectMenuBuilder().setCustomId(`kick-select_${callId}`).setPlaceholder('Escolha quem kickar').addOptions(options);
        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({ content: '👇 Escolha o Ômigo pra kickar:', components: [row], ephemeral: true });
      }
    } catch(e){ console.error(e); await interaction.reply({ content: '❌ Deu erro', ephemeral: true }).catch(()=>{}); }
  }
};