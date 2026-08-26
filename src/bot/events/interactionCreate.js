const mensagens = require('../../features/calls/messages');

async function responderErro(interaction) {
  const payload = { content: mensagens.erroGenerico, flags: 64 };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
    return;
  }
  await interaction.reply(payload).catch(() => {});
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    const client = interaction.client;

    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      await client.features.dispatch(interaction);
    } catch (err) {
      const nome = interaction.commandName || interaction.customId || 'interação';
      console.error(`Erro ao processar ${nome}:`, err);
      await responderErro(interaction);
    }
  }
};
