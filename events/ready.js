const { Events } = require('discord.js');
const mongoose = require('mongoose');
const { carregarCallsDoBanco } = require('../utils/calls');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`🤖 Logado como ${client.user.tag}!`);

    // 1. Conecta com o MongoDB primeiro
    if (process.env.MONGODB_URI) {
      try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado ao MongoDB com sucesso!');
      } catch (err) {
        console.error('❌ Erro de conexão com o MongoDB:', err);
      }
    } else {
      console.log('⚠️ MONGODB_URI não configurado nas variáveis de ambiente.');
    }

    // 2. Carrega as calls ativas do banco de dados (só roda se o MongoDB estiver conectado)
    try {
      if (mongoose.connection.readyState === 1) {
        await carregarCallsDoBanco(client);
      }
    } catch (error) {
      console.error('❌ Erro ao inicializar dados do banco:', error);
    }

    console.log(`🚀 Ômot totalmente pronto e operando como ${client.user.tag}!`);
  },
};