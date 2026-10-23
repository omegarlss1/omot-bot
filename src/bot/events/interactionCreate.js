const mensagens = require('../../features/calls/messages');

async function responderErro(interaction) {
  const payload = { content: mensagens.erroGenerico, flags: 64 };
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(payload);
      return;
    }
    if (interaction.replied) {
      await interaction.followUp(payload);
      return;
    }
    await interaction.reply(payload);
  } catch {
    if (interaction.channel?.isTextBased?.()) {
      await interaction.channel.send(payload.content || 'Erro ao responder interação.').catch(() => {});
    }
  }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    const client = interaction.client;

    try {
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) await command.autocomplete(interaction);
        return;
      }
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      const handled = await client.features.dispatch(interaction);
      if (!handled && (
        interaction.isButton()
        || interaction.isStringSelectMenu()
        || interaction.isModalSubmit()
      )) {
        console.warn('[interactions] Nenhum handler registrado para a interação:', {
          customId: interaction.customId,
          userId: interaction.user?.id,
          guildId: interaction.guildId
        });
        const payload = {
          content: 'Esta opção expirou ou não está disponível. Reabra o painel e tente novamente.',
          flags: 64
        };
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply(payload);
        } else if (interaction.replied) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      }
    } catch (err) {
      const nome = interaction.commandName || interaction.customId || 'interação';
      console.error(`Erro ao processar ${nome}:`, {
        message: err?.message,
        code: err?.code,
        stack: err?.stack
      });
      await responderErro(interaction);
    } finally {
      interaction.liberarLockCall?.();
    }
  }
};
