const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { salvarGatilho } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Define um canal de voz como gatilho')
    .addChannelOption(o => 
      o.setName('canal')
       .setDescription('Selecione o canal de voz')
       .addChannelTypes(ChannelType.GuildVoice)
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('tipo')
       .setDescription('Selecione o tipo de call')
       .setRequired(true)
       .addChoices(
         { name: 'RL SideSwipe', value: 'sideswipe' },
         { name: 'Jogos Diversos', value: 'diversos' }
       )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction, client) {
    const canal = interaction.options.getChannel('canal');
    const tipo = interaction.options.getString('tipo');

    if (!canal || !canal.id) {
      return interaction.reply({ content: '❌ Canal inválido.', flags: 64 });
    }

    client.canaisGatilho.add(canal.id);
    if (!client.gatilhosConfig) client.gatilhosConfig = new Map();
    client.gatilhosConfig.set(canal.id, tipo);

    await salvarGatilho(canal.id, tipo);

    const tipoNome = tipo === 'sideswipe' ? 'RL SideSwipe' : 'Jogos Diversos';
    await interaction.reply({ 
      content: `✅ Canal ${canal} configurado como gatilho para **${tipoNome}**!`, 
      flags: 64 
    });
  }
};