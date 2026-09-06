const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');
const { excluirCampeonato, AdminError } = require('../../features/campeonato/services/admin');

function temPermissaoOrganizador(member) {
  return Boolean(member?.permissions?.has?.('Administrator') || member?.roles?.cache?.has?.(config.campeonato.cargoOrganizacaoId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('excluir-campeonato')
    .setDescription('Exclui um campeonato, seus dados e seus canais')
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option.setName('campeonato_id').setDescription('ID do campeonato').setRequired(true))
    .addBooleanOption((option) => option.setName('confirmar').setDescription('Confirma a exclusão definitiva').setRequired(true)),

  async execute(interaction) {
    if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Apenas @OrganizadorCamps ou administradores.', flags: 64 });
    if (!interaction.options.getBoolean('confirmar')) return interaction.reply({ content: 'Exclusão não confirmada.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    try {
      await excluirCampeonato({ campeonatoId: interaction.options.getString('campeonato_id'), guild: interaction.guild, executadoPor: interaction.user.id });
      return interaction.editReply({ content: '✅ Campeonato, partidas, times e canais excluídos.' });
    } catch (error) {
      if (error instanceof AdminError) return interaction.editReply({ content: error.message });
      console.error('[excluir-campeonato] erro:', error);
      return interaction.editReply({ content: 'Erro ao excluir o campeonato.' });
    }
  }
};