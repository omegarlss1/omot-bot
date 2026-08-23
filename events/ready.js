const { carregarGatilhos } = require('../utils/database');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`🤖 Ômot online como ${client.user.tag}!`);

    await carregarGatilhos(client);

    try {
      console.log('🔄 Sincronizando e sobrescrevendo comandos Slash na API...');
      
      const commandsArray = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
      
      // Sobrescreve TODOS os comandos globais sem deixar duplicados soltos
      await client.application.commands.set(commandsArray);

      console.log('✅ Comandos Slash limpos e atualizados com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao registrar comandos:', error);
    }
  }
};

