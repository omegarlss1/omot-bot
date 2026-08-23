const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // 1. Execução de Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) {
        try {
          await command.execute(interaction, client);
        } catch (err) {
          console.error(`Erro ao executar ${interaction.commandName}:`, err);
        }
      }
    }

    // 2. Clique no Botão de Validação
    if (interaction.isButton() && interaction.customId === 'iniciar_validacao') {
      const modal = new ModalBuilder()
        .setCustomId('modal_epic_nick')
        .setTitle('Validação de Nick Epic Games');

      const inputNick = new TextInputBuilder()
        .setCustomId('epic_nick_input')
        .setLabel('Digite seu Nick exato da Epic Games:')
        .setPlaceholder('Ex: Ω_Jogador123 ou Jogador_Ω')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(inputNick));
      await interaction.showModal(modal);
    }

    // 3. Submissão do Modal
    if (interaction.isModalSubmit() && interaction.customId === 'modal_epic_nick') {
      const nickEpic = interaction.fields.getTextInputValue('epic_nick_input');
      const temSelo = nickEpic.includes('Ω') || nickEpic.toLowerCase().includes('omega') || nickEpic.toLowerCase().includes('ômega');

      if (temSelo) {
        const cargoOmega = interaction.guild.roles.cache.find(role => role.name === 'Ômega');
        if (cargoOmega) await interaction.member.roles.add(cargoOmega);

        try {
          await interaction.member.setNickname(`Ω | ${interaction.user.username}`);
        } catch (err) {
          // Ignora falhas por permissão (ex: Dono do servidor)
        }

        await interaction.reply({
          content: `🎉 **Validação Concluída!** Identificamos o selo no nick **${nickEpic}**.\nCargo **Ômega** concedido!`,
          flags: 64
        });
      } else {
        await interaction.reply({
          content: `❌ **Selo não encontrado!** O nick informado (\`${nickEpic}\`) não contém o símbolo **Ω**.\nAdicione o símbolo no nick da Epic e tente novamente.`,
          flags: 64
        });
      }
    }
  }
};
