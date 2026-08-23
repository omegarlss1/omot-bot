const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // 1. Tratamento de Comandos Slash (/)
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
        } else {
          await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
        }
      }
      return;
    }

    // 2. Tratamento do Botão "Validar Meu Selo Ω"
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
      return;
    }

    // 3. Tratamento do Formulário (Modal Submit)
    if (interaction.isModalSubmit() && interaction.customId === 'modal_epic_nick') {
      const nickEpic = interaction.fields.getTextInputValue('epic_nick_input');
      const temSelo = nickEpic.includes('Ω') || nickEpic.toLowerCase().includes('omega') || nickEpic.toLowerCase().includes('ômega');

      if (temSelo) {
        const cargoOmega = interaction.guild.roles.cache.find(role => role.name === 'Ômega');

        if (cargoOmega) {
          await interaction.member.roles.add(cargoOmega);
        }

        try {
          await interaction.member.setNickname(`Ω | ${interaction.user.username}`);
        } catch (err) {
          // Ignora se for o dono do servidor
        }

        await interaction.reply({
          content: `🎉 **Validação Concluída!** Identificamos o selo no nick **${nickEpic}**.\nO cargo **Ômega** foi concedido e seus acessos foram liberados!`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `❌ **Selo não encontrado!** O nick informado (\`${nickEpic}\`) não contém o símbolo **Ω**.\n\nPor favor, adicione o símbolo no seu nick da Epic e tente novamente.`,
          ephemeral: true
        });
      }
    }
  },
};