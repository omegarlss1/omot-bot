const handleButtons = require('../handlers/buttonHandler');
const handleSelectMenus = require('../handlers/selectMenuHandler');
const handleModals = require('../handlers/modalHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) {
        try {
          await command.execute(interaction, client);
        } catch (err) {
          console.error(`Erro ao executar /${interaction.commandName}:`, err);
        }
      }
      return;
    }

    if (interaction.isButton()) return handleButtons(interaction, client);
    if (interaction.isStringSelectMenu()) return handleSelectMenus(interaction);
    if (interaction.isModalSubmit()) return handleModals(interaction);
  }
};













