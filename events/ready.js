const { carregarGatilhos } = require('../utils/database');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`🤖 Ômot online como ${client.user.tag}!`);

    await carregarGatilhos(client);

    try {
      console.log('🧹 Limpando comandos antigos em todos os servidores...');

      // 1. Apaga todos os comandos específicos registrados nos servidores (Guilds)
      const guilds = await client.guilds.fetch();
      for (const [guildId] of guilds) {
        const guild = await client.guilds.fetch(guildId);
        await guild.commands.set([]); // Limpa cache do servidor
      }

      // 2. Registra APENAS os comandos atuais da pasta 'commands'
      const commandsArray = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
      await client.application.commands.set(commandsArray);

      console.log('✅ Faxina concluída! Apenas o comando /call oficial está ativo.');
    } catch (error) {
      console.error('❌ Erro ao limpar e registrar comandos:', error);
    }
  }
};


