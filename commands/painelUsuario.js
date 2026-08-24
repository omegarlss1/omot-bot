const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-painel-usuario')
    .setDescription('Envia a Central Privada do Usuário')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('⚙️ CENTRAL DO JOGADOR')
      .setDescription('Use o seu espaço privado no servidor! Todas as ações acionadas aqui são vistas **apenas por você**.\n\nClica nos botões para gerenciar seu perfil ou avisos:')
      .setColor('#7289DA');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_iniciar_ficha')
        .setLabel('Editar Ficha')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✏️'),
      new ButtonBuilder()
        .setCustomId('btn_ver_perfil')
        .setLabel('Meu Perfil')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👤')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: 'Central do Jogador enviada!', flags: 64 });
  }
};
