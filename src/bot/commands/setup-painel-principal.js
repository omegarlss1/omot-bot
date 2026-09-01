const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildPainelPrincipal, buildPlaceholderFuncionalidade } = require('../../features/hub/interactions');
const PainelPrincipal = require('../../db/models/painelPrincipal');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-painel-principal')
    .setDescription('Envia o Hub principal do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    try {
      const canal = interaction.channel;
      const registro = await PainelPrincipal.findOne({ guildId: interaction.guildId }).catch(() => null);

      if (registro?.hubMessageId) {
        await canal.messages.fetch(registro.hubMessageId).then((m) => m.delete().catch(() => {})).catch(() => {});
      }
      if (registro?.funcMessageId) {
        await canal.messages.fetch(registro.funcMessageId).then((m) => m.delete().catch(() => {})).catch(() => {});
      }

      const hub = await canal.send(buildPainelPrincipal());
      const funcionalidade = await canal.send(buildPlaceholderFuncionalidade());

      await PainelPrincipal.findOneAndUpdate(
        { guildId: interaction.guildId },
        {
          guildId: interaction.guildId,
          canalId: canal.id,
          hubMessageId: hub.id,
          hubChannelId: canal.id,
          funcMessageId: funcionalidade.id
        },
        { upsert: true, new: true }
      );

      await interaction.deleteReply().catch(() => {});
    } catch (err) {
      console.error('ERRO /setup-painel-principal:', err);
      await interaction.editReply({ content: `❌ Erro: ${err.message}`, flags: 64 }).catch(() => {});
    }
  }
};
