const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-painel-usuario')
    .setDescription('Envia a Central Privada do Usuário')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('⚙️ CENTRAL DO JOGADOR')
      .setDescription(
        'Use os botões abaixo para acessar suas ações privadas ou iniciar uma nova busca de time!\n\n' +
          '🚀 **Chama Time**: Cria um aviso e abre vagas pra jogar.\n' +
          '✏️ **Editar Ficha**: Altera seu Nick e Rank.\n' +
          '👤 **Meu Perfil**: Veja seus dados cadastrados.'
      )
      .setColor('#7289DA');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_abrir_modal_jogar').setLabel('Chama Time').setStyle(ButtonStyle.Success).setEmoji('🚀'),
      new ButtonBuilder().setCustomId('btn_iniciar_ficha').setLabel('Editar Ficha').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
      new ButtonBuilder().setCustomId('btn_ver_perfil').setLabel('Meu Perfil').setStyle(ButtonStyle.Secondary).setEmoji('👤')
    );

    const rowPerfilPublico = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_abrir_select_ver_perfil').setLabel('Ver Perfil').setStyle(ButtonStyle.Secondary).setEmoji('🔎')
    );

    await interaction.channel.send({ embeds: [embed], components: [row, rowPerfilPublico] });
    return interaction.reply({ content: 'Central do Jogador enviada!', flags: 64 });
  }
};
