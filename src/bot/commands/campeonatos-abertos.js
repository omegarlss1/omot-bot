const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');
const Campeonato = require('../../db/models/campeonato');

function temPermissaoOrganizador(member) {
  return Boolean(member?.permissions?.has?.('Administrator') || member?.roles?.cache?.has?.(config.campeonato.cargoOrganizacaoId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('campeonatos-abertos')
    .setDescription('Lista campeonatos com inscrições abertas')
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    if (!temPermissaoOrganizador(interaction.member)) {
      return interaction.reply({ content: 'Apenas @OrganizadorCamps ou administradores.', flags: 64 });
    }
    const campeonatos = await Campeonato.find({ status: 'INSCRICOES_ABERTAS', guildId: interaction.guildId }).sort({ criadoEm: -1 }).lean();
    const linhas = campeonatos.map((camp) =>
      `• **${camp.nome}** | ID: \`${camp._id}\` | Rank: **${camp.rank}** | Inscrições: <#${camp.canais?.inscricoes || '—'}> | Avisos: <#${camp.canais?.avisos || '—'}>`
    );
    return interaction.reply({
      content: linhas.length ? `🏆 **Campeonatos abertos (${linhas.length})**\n${linhas.join('\n')}` : 'Não há campeonatos com inscrições abertas.',
      flags: 64
    });
  }
};