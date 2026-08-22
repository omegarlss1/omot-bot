const { PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // COMANDOS SLASH
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction, client);
      return;
    }

    // BOTÕES
    if (!interaction.isButton()) return;
    const canal = interaction.member?.voice?.channel;
    if (!canal ||!client.callsTemporarias.has(canal.id)) {
      return interaction.reply({ content: '❌ Você precisa estar na sua call temporária!', ephemeral: true });
    }
    const dados = client.callsTemporarias.get(canal.id);
    if (dados.dono!== interaction.user.id && interaction.customId!== 'claim') {
      return interaction.reply({ content: '❌ Só o dono da call pode usar!', ephemeral: true });
    }

    if (interaction.customId === 'lock') {
      await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
      await interaction.reply({ content: '🔒 Call trancada!', ephemeral: true });
    }
    if (interaction.customId === 'unlock') {
      await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
      await interaction.reply({ content: '🔓 Call destrancada!', ephemeral: true });
    }
    if (interaction.customId === 'ghost') {
      await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      await interaction.reply({ content: '👻 Call escondida!', ephemeral: true });
    }
    if (interaction.customId === 'unghost') {
      await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
      await interaction.reply({ content: '👁️ Call visível!', ephemeral: true });
    }
    if (interaction.customId === 'delete') {
      await interaction.reply({ content: '🗑️ Deletando...' });
      await canal.delete();
    }
    if (interaction.customId === 'limit') {
      const modal = new ModalBuilder().setCustomId('modal_limit').setTitle('Limite da Call');
      const input = new TextInputBuilder().setCustomId('limite').setLabel('Quantos usuários? (0 = sem limite)').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'rename') {
      const modal = new ModalBuilder().setCustomId('modal_rename').setTitle('Renomear Call');
      const input = new TextInputBuilder().setCustomId('novo_nome').setLabel('Novo nome da call').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    }
  }
};