const { iniciarAvaliacao } = require('../../features/avaliacao/interactions');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    const texto = message.content.trim();
    if (!/^!avaliar$/i.test(texto) && !/^\/avaliar$/i.test(texto)) return;

    await iniciarAvaliacao(message);
  }
};
