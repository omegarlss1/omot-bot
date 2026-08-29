function matches(pattern, customId) {
  if (typeof pattern === 'function') return pattern(customId);
  if (pattern instanceof RegExp) return pattern.test(customId);
  if (pattern.endsWith('*')) return customId.startsWith(pattern.slice(0, -1));
  return customId === pattern;
}

class InteractionRegistry {
  constructor() {
    this.buttons = [];
    this.selects = [];
    this.modals = [];
  }

  button(pattern, execute) {
    this.buttons.push({ pattern, execute });
  }

  select(pattern, execute) {
    this.selects.push({ pattern, execute });
  }

  modal(pattern, execute) {
    this.modals.push({ pattern, execute });
  }

  async dispatch(interaction) {
    let list = [];
    if (interaction.isButton()) list = this.buttons;
    else if (interaction.isStringSelectMenu()) list = this.selects;
    else if (interaction.isModalSubmit()) list = this.modals;
    else return false;

    const handler = list.find((entry) => matches(entry.pattern, interaction.customId));
    if (!handler) return false;

    try {
      await handler.execute(interaction);
      return true;
    } catch (err) {
      const nome = interaction.customId || interaction.type || 'interação';
      console.error(`Erro ao executar handler de interação ${nome}:`, {
        type: interaction?.type,
        customId: interaction?.customId,
        userId: interaction?.user?.id,
        guildId: interaction?.guildId,
        message: err?.message,
        code: err?.code,
        stack: err?.stack
      });
      throw err;
    }
  }
}

module.exports = { InteractionRegistry };
