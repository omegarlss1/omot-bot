const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildPainelPrincipal, buildPlaceholderFuncionalidade } = require('../../features/hub/interactions');
const PainelPrincipal = require('../../db/models/painelPrincipal');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-painel-principal')
    .setDescription('Envia o Hub principal do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const canal = interaction.channel;
      const registro = await PainelPrincipal.findOne({ guildId: interaction.guildId }).catch(() => null);
      let hub = registro?.hubMessageId ? await canal.messages.fetch(registro.hubMessageId).catch(() => null) : null;
      let funcionalidade = registro?.funcMessageId ? await canal.messages.fetch(registro.funcMessageId).catch(() => null) : null;

      if (hub) await hub.edit(buildPainelPrincipal());
      else hub = await canal.send(buildPainelPrincipal());

      if (funcionalidade) await funcionalidade.edit(buildPlaceholderFuncionalidade());
      else funcionalidade = await canal.send(buildPlaceholderFuncionalidade());

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
      return interaction.editReply({ content: 'Painel Principal enviado!' });
    } catch (err) {
      console.error('ERRO /setup-painel-principal:', err);
      return interaction.editReply({ content: `❌ Erro: ${err.message}` });
    }
  }
};
