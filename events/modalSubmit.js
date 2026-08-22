module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isModalSubmit()) return;
    const canal = interaction.member?.voice?.channel;
    if (!canal ||!client.callsTemporarias.has(canal.id)) return;

    if (interaction.customId === 'modal_limit') {
      const limite = parseInt(interaction.fields.getTextInputValue('limite'));
      await canal.setUserLimit(isNaN(limite)? 0 : limite);
      await interaction.reply({ content: `👥 Limite alterado para ${limite}!`, ephemeral: true });
    }
    if (interaction.customId === 'modal_rename') {
      const nome = interaction.fields.getTextInputValue('novo_nome');
      await canal.setName(nome);
      await interaction.reply({ content: `✏️ Call renomeada para ${nome}!`, ephemeral: true });
    }
  }
};