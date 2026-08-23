const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { salvarGatilho } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Configura as calls temporárias do Ômot')
    .addChannelOption(o => o.setName('canal').setDescription('Qual canal é o gatilho?').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction, client) {
    const canal = interaction.options.getChannel('canal');
    
    // Adiciona o canal na memória do bot
    client.canaisGatilho.add(canal.id);

    // Salva direto no banco de dados MongoDB na nuvem
    await salvarGatilho(canal.id);

    const ehJogo = canal.name.toLowerCase().includes('jogo') || canal.name.toLowerCase().includes('divers');
    const tipo = ehJogo ? 'de JOGOS DIVERSOS' : 'PADRÃO';
    await interaction.reply({ content: `✅ Canal ${canal} salvo como ${tipo} e **gravado no banco de dados**! Agora mesmo se o bot reiniciar ele vai lembrar.`, ephemeral: true });
  }
};


