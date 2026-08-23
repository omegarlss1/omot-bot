const { REST, Routes } = require('discord.js');
const { carregarGatilhos } = require('../utils/database');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`🤖 Ômot online como ${client.user.tag}!`);
    await carregarGatilhos(client);

    // Converte os comandos da coleção para JSON
    const commandsJSON = client.commands.map(cmd => cmd.data.toJSON());

    // Registro automático dos Slash Commands
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN || process.env.DISCORD_TOKEN);
    try {
      console.log('🔄 Registrando comandos Slash na API do Discord...');
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commandsJSON }
      );
      console.log('✅ Comandos Slash registrados com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao registrar comandos Slash:', error);
    }
  }
};
