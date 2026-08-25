const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGame } = require('../../features/games/catalog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Define um canal de voz como gatilho')
    .addChannelOption((o) =>
      o.setName('canal').setDescription('Selecione o canal de voz').addChannelTypes(ChannelType.GuildVoice).setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('tipo').setDescription('Selecione o tipo de call').setRequired(true).addChoices(
        { name: 'RL SideSwipe', value: 'sideswipe' },
        { name: 'Jogos Diversos', value: 'diversos' }
      )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const canal = interaction.options.getChannel('canal');
    const tipo = interaction.options.getString('tipo');

    if (!canal || !canal.id) {
      return interaction.reply({ content: '❌ Canal inválido.', flags: 64 });
    }

    await interaction.client.stores.gatilhos.salvar(canal.id, tipo);

    const tipoNome = getGame(tipo)?.nome || tipo;
    await interaction.reply({
      content: `✅ Canal ${canal} configurado como gatilho para **${tipoNome}**!`,
      flags: 64
    });
  }
};
