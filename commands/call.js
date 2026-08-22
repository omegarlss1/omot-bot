const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { load, save } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
   .setName('call')
   .setDescription('Configura as calls temporárias da Omega')
   .addChannelOption(o=>o.setName('canal').setDescription('Qual canal é o gatilho?').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
   .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction, client){
    const canal = interaction.options.getChannel('canal');
    client.canaisGatilho.add(canal.id);

    // SALVA NO ARQUIVO
    const db = load();
    if(!db.gatilhos.includes(canal.id)){
      db.gatilhos.push(canal.id);
      save(db);
    }

    const ehJogo = canal.name.toLowerCase().includes('jogo') || canal.name.toLowerCase().includes('divers');
    const tipo = ehJogo? 'de JOGOS DIVERSOS' : 'PADRÃO';
    await interaction.reply({ content: `✅ Canal ${canal} salvo como ${tipo} e **gravado**! Agora mesmo se o bot reiniciar ele vai lembrar.`, ephemeral: true });
  }
};