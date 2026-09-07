const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('../../config');
const Campeonato = require('../../db/models/campeonato');
const Evento = require('../../db/models/evento');

function temPermissaoOrganizador(member) {
  return Boolean(member?.permissions?.has?.('Administrator') || member?.roles?.cache?.has?.(config.campeonato.cargoOrganizacaoId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('excluir-campeonato')
    .setDescription('Seleciona um campeonato criado por você para excluir')
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Apenas @OrganizadorCamps ou administradores.', flags: 64 });
    const eventos = await Evento.find({ guildId: interaction.guildId, organizadorId: interaction.user.id }).select('_id nome').lean();
    const campeonatos = await Campeonato.find({ eventoId: { $in: eventos.map((evento) => evento._id) } }).sort({ criadoEm: -1 }).lean();
    if (!campeonatos.length) return interaction.reply({ content: 'Você não possui campeonatos criados para excluir.', flags: 64 });

    const eventosMap = new Map(eventos.map((evento) => [String(evento._id), evento]));
    const menu = new StringSelectMenuBuilder()
      .setCustomId('select_excluir_campeonato')
      .setPlaceholder('Selecione o campeonato que deseja excluir')
      .setMinValues(1)
      .setMaxValues(Math.min(campeonatos.length, 25))
      .addOptions(campeonatos.slice(0, 25).map((campeonato) => ({
        label: String(campeonato.nome).slice(0, 100),
        value: String(campeonato._id),
        description: `${eventosMap.get(String(campeonato.eventoId))?.nome || 'Evento'} - ${campeonato.status}`.slice(0, 100)
      })));
    return interaction.reply({
      content: '⚠️ Selecione um ou mais campeonatos criados por você. A exclusão será definitiva.',
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: 64
    });
  }
};