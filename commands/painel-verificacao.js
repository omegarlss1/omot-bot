const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-verificacao')
    .setDescription('Envia o painel de verificação do Selo Ômega no canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ Validação de Membro Ômega RLSS')
      .setDescription(
        'Para receber o cargo **Ômega** e liberar acesso aos canais VIP, campeonatos e vantagens exclusivas, você precisa estar usando o símbolo **Ω** no seu nick da Epic Games.\n\n' +
        '1️⃣ Adicione o símbolo **Ω** no seu nick da Epic Games.\n' +
        '2️⃣ Clique no botão abaixo e informe seu Nick exato.\n' +
        '3️⃣ Nosso bot fará a checagem e liberará seu cargo automaticamente!'
      )
      .setColor('#5865F2')
      .setFooter({ text: 'Sistema Autônomo Ômot • Ômega RLSS' });

    const botao = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('iniciar_validacao')
        .setLabel('Validar Meu Selo Ω')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⚡')
    );

    await interaction.channel.send({ embeds: [embed], components: [botao] });
    await interaction.reply({ content: '✅ Painel enviado com sucesso!', ephemeral: true });
  }
};