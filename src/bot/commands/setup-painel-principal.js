const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildPainelPrincipal } = require('../../features/hub/interactions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-painel-principal')
    .setDescription('Envia o Hub principal do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.channel.send(buildPainelPrincipal());
      return interaction.editReply({ content: 'Painel Principal enviado!' });
    } catch (err) {
      console.error('ERRO /setup-painel-principal:', err);
      return interaction.editReply({ content: `❌ Erro: ${err.message}` });
    }
  }
};
