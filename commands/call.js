const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Cria a call temporária da Omega')
    .addChannelOption(o => o.setName('origem').setDescription('Canal que dispara a criação').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .addStringOption(o => o.setName('nome').setDescription('Nome do canal temporário (ex: 🎧 Call do Fulano)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction, client) {
    await interaction.reply({ content: '✅ Configurado! Entra no canal que você escolheu pra testar.', ephemeral: true });
  }
};
