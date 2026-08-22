const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Cria a call temporária da Omega')
    .addChannelOption(o => o.setName('origem').setDescription('Canal que dispara a criação (ex: ➕ Criar Call)').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .addStringOption(o => o.setName('nome').setDescription('Modelo do nome: {user} vira nome da pessoa').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction, client) {
    const origem = interaction.options.getChannel('origem');
    const modelo = interaction.options.getString('nome') || '🎧 Call do {user}';

    // Salva na memória do bot
    client.canaisGatilho.add(origem.id);
    // Salva o modelo junto
    if (!client.modelos) client.modelos = new Map();
    client.modelos.set(origem.id, modelo);

    await interaction.reply({ 
      content: `✅ Pronto! Agora quando alguém entrar em ${origem}, vou criar \`${modelo.replace('{user}', 'Fulano')}\` automaticamente.\n\nTesta entrando lá agora!`, 
      ephemeral: true 
    });
  }
};