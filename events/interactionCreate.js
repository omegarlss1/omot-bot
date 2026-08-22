module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (e) {
      console.error(e);
      if (!interaction.replied) {
        await interaction.reply({ content: '❌ Erro: ' + e.message, ephemeral: true }).catch(()=>{});
      }
    }
  }
};
