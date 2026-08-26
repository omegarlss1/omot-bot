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

    const found = list.find((entry) => matches(entry.pattern, interaction.customId));
    if (!found) return false;

    await found.execute(interaction);
    return true;
  }
}

module.exports = { InteractionRegistry };
