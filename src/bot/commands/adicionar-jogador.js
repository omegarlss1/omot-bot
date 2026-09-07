const { SlashCommandBuilder } = require('discord.js');
const Campeonato = require('../../db/models/campeonato');
const Time = require('../../db/models/time');
const config = require('../../config');
const { buscarNicks, adicionarJogadorAoTime, findCampeonatoPorCanalInscricao, InscricaoError } = require('../../features/campeonato/services/inscricao');

function temPermissaoOrganizador(member) {
  return Boolean(member?.permissions?.has?.('Administrator') || member?.roles?.cache?.has?.(config.campeonato.cargoOrganizacaoId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adicionar-jogador')
    .setDescription('Adiciona um jogador pesquisado por nick ao seu time')
    .addStringOption((option) => option
      .setName('jogador')
      .setDescription('Nick do jogador')
      .setRequired(true)
      .setAutocomplete(true)),

  async autocomplete(interaction) {
    const termo = interaction.options.getString('jogador') || '';
    const perfis = await buscarNicks(interaction.guildId, termo);
    return interaction.respond(perfis.map((perfil) => ({
      name: String(perfil.nick_principal).slice(0, 100),
      value: String(perfil.userId)
    })));
  },

  async execute(interaction) {
    const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
    if (!campeonato) return interaction.reply({ content: 'Use este comando no canal de inscrições.', flags: 64 });
    const time = await Time.findOne({ campeonatoId: campeonato._id, capitaoId: interaction.user.id });
    if (!time) return interaction.reply({ content: 'Você ainda não possui um time neste campeonato.', flags: 64 });
    const userId = interaction.options.getString('jogador');
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.reply({ content: 'Esse jogador não está no servidor. Use o cadastro manual para WhatsApp.', flags: 64 });
    try {
      const atualizado = await adicionarJogadorAoTime({ guild: interaction.guild, campeonato, time, capitaoId: interaction.user.id, member });
      return interaction.reply({ content: `✅ ${member} adicionado ao time **${atualizado.nome}**.`, flags: 64 });
    } catch (error) {
      if (error instanceof InscricaoError) return interaction.reply({ content: error.message, flags: 64 });
      throw error;
    }
  }
};
