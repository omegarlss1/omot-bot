const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
   .setName('call')
   .setDescription('Configura as calls temporárias da Omega')
   .addChannelOption(o=>o.setName('canal').setDescription('Qual canal é o gatilho?').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
   .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction, client){
    const canal = interaction.options.getChannel('canal');
    client.canaisGatilho.add(canal.id);
    const ehJogo = canal.name.toLowerCase().includes('jogo') || canal.name.toLowerCase().includes('game') || canal.name.toLowerCase().includes('divers');
    const tipo = ehJogo? 'de JOGOS DIVERSOS (com definir jogo)' : 'PADRÃO (Rocket League SideSwipe)';
    await interaction.reply({ content: `✅ Canal ${canal} configurado como ${tipo}!\nAgora quando entrar nele vai criar: **"${interaction.member.displayName} jogando..."**`, ephemeral: true });
  }
};