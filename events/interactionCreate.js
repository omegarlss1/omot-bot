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

    // MODAIS (renomear e limite)
    if (interaction.isModalSubmit()) {
      const [tipo, callId] = interaction.customId.split('_');
      const canal = interaction.guild.channels.cache.get(callId);
      if (!canal) return interaction.reply({ content: '❌ Call não existe', ephemeral: true });

      if (tipo === 'modal-rename') {
        const novoNome = interaction.fields.getTextInputValue('novoNome');
        await canal.setName(novoNome).catch(()=>{});
        return interaction.reply({ content: `✏️ Renomeado para **${novoNome}**!`, ephemeral: true });
      }
      if (tipo === 'modal-limit') {
        const limite = parseInt(interaction.fields.getTextInputValue('limite'));
        if (isNaN(limite) || limite < 0 || limite > 99) return interaction.reply({ content: '❌ Use 0 a 99 (0 = sem limite)', ephemeral: true });
        await canal.setUserLimit(limite).catch(()=>{});
        return interaction.reply({ content: `👥 Limite alterado para **${limite === 0? 'sem limite' : limite}**!`, ephemeral: true });
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
      return interaction.reply({ content: '❌ Só o dono!', ephemeral: true }).catch(()=>{});
    }

    try {
      if (acao === 'lock') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        return interaction.reply({ content: '🔒 Trancada!', ephemeral: true });
      }
      if (acao === 'unlock') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: null });
        return interaction.reply({ content: '🔓 Destrancada!', ephemeral: true });
      }
      if (acao === 'ghost') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        return interaction.reply({ content: '👻 Escondida!', ephemeral: true });
      }
      if (acao === 'unghost') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: null });
        return interaction.reply({ content: '👁️ Visível!', ephemeral: true });
      }
      if (acao === 'delete') {
        await interaction.reply({ content: '🗑️ Deletando...', ephemeral: true });
        await canal.delete().catch(()=>{});
        client.callsTemporarias.delete(callId);
        return;
      }
      if (acao === 'rename') {
        const modal = new ModalBuilder().setCustomId(`modal-rename_${callId}`).setTitle('Renomear Call');
        const input = new TextInputBuilder().setCustomId('novoNome').setLabel('Novo nome da call').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30).setValue(canal.name);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (acao === 'limit') {
        const modal = new ModalBuilder().setCustomId(`modal-limit_${callId}`).setTitle('Limite de membros');
        const input = new TextInputBuilder().setCustomId('limite').setLabel('Quantos? (0 = sem limite)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setValue(String(canal.userLimit || 0));
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (acao === 'kick') {
        if (canal.members.size <= 1) return interaction.reply({ content: '❌ Só você na call!', ephemeral: true });
        const options = canal.members.filter(m => m.id!== interaction.user.id).map(m => ({ label: m.displayName, value: m.id, description: `@${m.user.username}` })).slice(0, 25);
        const menu = new StringSelectMenuBuilder().setCustomId(`kick-select_${callId}`).setPlaceholder('Escolha quem kickar').addOptions(options);
        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({ content: '👇 Escolha:', components: [row], ephemeral: true });
      }
    } catch(e){ console.error(e); }
  }
};