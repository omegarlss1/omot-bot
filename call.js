const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { salvarGatilho } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Configura as calls temporárias do Ômot')
    .addChannelOption(o => o.setName('canal').setDescription('Qual canal é o gatilho?').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction, client) {
    const canal = interaction.options.getChannel('canal');
    client.canaisGatilho.add(canal.id);
    await salvarGatilho(canal.id);

    await interaction.reply({ content: `✅ Canal ${canal} salvo no MongoDB como gatilho!`, flags: 64 });
  }
};
