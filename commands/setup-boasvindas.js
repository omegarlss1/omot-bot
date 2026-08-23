const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-boasvindas')
    .setDescription('Envia o painel de boas-vindas para cadastro de membros')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🚀 BEM-VINDO À ÔMEGA!')
      .setDescription('Pra interagir no servidor e ser chamado pros times, cria sua ficha aqui rapidinho!\n\nClica no botão abaixo pra preencher seu perfil e escolher os cargos de jogos que quer ser mencionado.')
      .setColor('#FF6B00');

    const btn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_iniciar_ficha')
        .setLabel('Criar Ficha de Membro')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📋')
    );

    await interaction.channel.send({ embeds: [embed], components: [btn] });
    return interaction.reply({ content: 'Painel de boas-vindas enviado!', flags: 64 });
  }
};
