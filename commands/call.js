const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { salvarGatilho } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Define ou remove um canal de voz gatilho')
    .addChannelOption(o => 
      o.setName('canal')
       .setDescription('Selecione o canal de voz gatilho')
       .addChannelTypes(ChannelType.GuildVoice)
       .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction, client) {
    const canal = interaction.options.getChannel('canal');

    if (!canal || !canal.id) {
      return interaction.reply({ content: '❌ Canal de voz inválido.', flags: 64 });
    }

    client.canaisGatilho.add(canal.id);
    await salvarGatilho(canal.id);

    await interaction.reply({ 
      content: `✅ O canal ${canal} foi salvo como **Gatilho de Calls Temporárias**!`, 
      flags: 64 
    });
  }
};