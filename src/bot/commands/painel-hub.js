const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel-hub')
    .setDescription('Posta o hub principal (Ficha / Buscar Jogador) no canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((opt) => opt
      .setName('silencioso')
      .setDescription('Não envia confirmação efêmera (default: false)')
      .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    try {
      const silencioso = interaction.options.getBoolean('silencioso') || false;
      const payload = {
        embeds: [{
          title: '🎮 Painel Principal — Ômega RLSS',
          description: 'Use os botões abaixo para acessar as funcionalidades.',
          color: 0x5865F2
        }],
        components: [[
          { type: 2, style: 1, label: '📋 Minha Ficha', custom_id: 'btn_iniciar_ficha', emoji: { name: '📋' } },
          { type: 2, style: 2, label: '🔎 Buscar Jogador', custom_id: 'btn_abrir_busca_nick', emoji: { name: '🔎' } }
        ]]
      };
      const components = payload.components.map((row) => {
        const actionRow = new ActionRowBuilder();
        for (const btn of row) {
          actionRow.addComponents(
            new ButtonBuilder()
              .setCustomId(btn.custom_id)
              .setLabel(btn.label)
              .setStyle(ButtonStyle.Primary)
              .setEmoji(btn.emoji?.name || '')
          );
        }
        return actionRow;
      });
      const mensagem = await interaction.channel.send({ embeds: payload.embeds, components });
      if (silencioso) {
        return interaction.deleteReply().catch(() => {});
      }
      return interaction.editReply({
        content: `✅ Hub postado em ${interaction.channel} (mensagem \`${mensagem.id}\`).`
      });
    } catch (err) {
      console.error('ERRO /painel-hub:', err);
      return interaction.editReply({ content: `❌ Erro: ${err.message}`, flags: 64 });
    }
  }
};
