const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const Campeonato = require('../../db/models/campeonato');
const { publicarPainelInscricao } = require('../../features/campeonato/interactions');

function temPermissaoOrganizador(member) {
  return Boolean(member?.permissions?.has?.('Administrator') || member?.roles?.cache?.has?.(config.campeonato.cargoOrganizacaoId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('publicar-inscricoes')
    .setDescription('Publica novamente o painel de inscrição dos campeonatos abertos'),

  async execute(interaction) {
    if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Apenas @OrganizadorCamps ou administradores.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    const campeonatos = await Campeonato.find({ guildId: interaction.guildId, status: 'INSCRICOES_ABERTAS' });
    let publicados = 0;
    for (const campeonato of campeonatos) {
      const canal = await interaction.guild.channels.fetch(campeonato.canais?.inscricoes).catch(() => null);
      if (!canal) continue;
      await publicarPainelInscricao(canal, campeonato).then(() => publicados++).catch((error) => {
        console.error(`[publicar-inscricoes] ${campeonato._id}:`, error.message);
      });
    }
    return interaction.editReply({ content: `✅ Painel publicado em ${publicados} campeonato(s) aberto(s).` });
  }
};