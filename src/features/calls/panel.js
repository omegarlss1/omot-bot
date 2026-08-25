const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

function montarPainelCall(member) {
  const embed = new EmbedBuilder()
    .setTitle('Painel de Controle da Call')
    .setDescription(`Opa, e aí, ${member}! Sala criada. Usa os botões aí embaixo pra configurar tudo do teu jeito.`)
    .setColor('#FF6B00');

  const linha1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_rename').setLabel('Definir Jogo / Nome').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('btn_limit_modal').setLabel('Definir Limite').setStyle(ButtonStyle.Success).setEmoji('👥')
  );

  const linha2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_lock').setLabel('Trancar / Destrancar').setStyle(ButtonStyle.Primary).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('btn_hide').setLabel('Ocultar / Mostrar').setStyle(ButtonStyle.Secondary).setEmoji('👁️')
  );

  const linha3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_transfer').setLabel('Passar Liderança').setStyle(ButtonStyle.Secondary).setEmoji('👑'),
    new ButtonBuilder().setCustomId('btn_close_call').setLabel('Encerrar Call').setStyle(ButtonStyle.Danger).setEmoji('✖️')
  );

  return { embeds: [embed], components: [linha1, linha2, linha3] };
}

module.exports = { montarPainelCall };
