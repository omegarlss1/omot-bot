const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { embedCriarEvento } = require('../../features/campeonato/embeds');
const config = require('../../config');

function temPermissaoOrganizador(member) {
  if (!member) return false;
  if (member.permissions?.has?.('Administrator')) return true;
  const orgRoleId = config.campeonato.cargoOrganizacaoId;
  return member.roles?.cache?.has?.(orgRoleId) || false;
}

function buildPayload(guild, organizador) {
  const e = embedCriarEvento({ guild, organizador });
  const components = (e.components || []).map((row) => {
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
  return { embeds: e.embeds, components };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel-campeonato')
    .setDescription('Posta o painel de criação de campeonato no canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((opt) => opt
      .setName('silencioso')
      .setDescription('Não envia confirmação efêmera (default: false)')
      .setRequired(false)
    ),

  async execute(interaction) {
    if (!temPermissaoOrganizador(interaction.member)) {
      return interaction.reply({
        content: '❌ Apenas `@OrganizadorCamps` ou administradores podem postar o painel de campeonato.',
        flags: 64
      });
    }
    await interaction.deferReply({ flags: 64 });
    try {
      const silencioso = interaction.options.getBoolean('silencioso') || false;
      const payload = buildPayload(interaction.guild, interaction.member);
      const mensagem = await interaction.channel.send(payload);
      if (silencioso) {
        return interaction.deleteReply().catch(() => {});
      }
      return interaction.editReply({
        content: `✅ Painel postado em ${interaction.channel} (mensagem \`${mensagem.id}\`).`
      });
    } catch (err) {
      console.error('ERRO /painel-campeonato:', err);
      return interaction.editReply({ content: `❌ Erro: ${err.message}`, flags: 64 });
    }
  }
};
