const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) return cmd.execute(interaction, client);
    }
    if (interaction.isButton()) {
      const canal = interaction.member?.voice?.channel;
      if (!canal ||!client.callsTemporarias.has(canal.id)) return interaction.reply({ content: '❌ Entre na sua call!', ephemeral: true });
      const dados = client.callsTemporarias.get(canal.id);
      if (dados.dono!== interaction.user.id) return interaction.reply({ content: '❌ Só o dono!', ephemeral: true });

      if (interaction.customId === 'lock') { await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: false }); return interaction.reply({ content: '🔒 Trancada!', ephemeral: true }); }
      if (interaction.customId === 'unlock') { await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: true }); return interaction.reply({ content: '🔓 Destrancada!', ephemeral: true }); }
      if (interaction.customId === 'ghost') { await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false }); return interaction.reply({ content: '👻 Escondida!', ephemeral: true }); }
      if (interaction.customId === 'unghost') { await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true }); return interaction.reply({ content: '👁️ Visível!', ephemeral: true }); }
      if (interaction.customId === 'delete') { await canal.delete(); return; }
      if (interaction.customId === 'limit') {
        const m = new ModalBuilder().setCustomId('modal_limit').setTitle('Limite');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limite').setLabel('Qtd (0=sem limite)').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }
      if (interaction.customId === 'rename') {
        const m = new ModalBuilder().setCustomId('modal_rename').setTitle('Renomear');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('novo_nome').setLabel('Novo nome').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }
    }
    if (interaction.isModalSubmit()) {
      const canal = interaction.member?.voice?.channel;
      if (!canal) return;
      if (interaction.customId === 'modal_limit') {
        const l = parseInt(interaction.fields.getTextInputValue('limite')); await canal.setUserLimit(isNaN(l)?0:l); return interaction.reply({ content: `Limite: ${l}`, ephemeral: true });
      }
      if (interaction.customId === 'modal_rename') {
        const n = interaction.fields.getTextInputValue('novo_nome'); await canal.setName(n); return interaction.reply({ content: `Renomeada: ${n}`, ephemeral: true });
      }
    }
  }
};