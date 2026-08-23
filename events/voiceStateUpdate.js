const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const channelEntrou = newState.channelId;
    const channelSaiu = oldState.channelId;

    // 1. Criar Call Temporária
    if (channelEntrou && client.canaisGatilho.has(channelEntrou)) {
      const guild = newState.guild;
      const member = newState.member;
      const parentCategory = newState.channel.parentId;

      const newChannel = await guild.channels.create({
        name: `🔊 | Call de ${member.displayName}`,
        type: ChannelType.GuildVoice,
        parent: parentCategory || null,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect]
          }
        ]
      });

      // Registra a call e o dono atual
      client.callsTemporarias.set(newChannel.id, { donoId: member.id });
      await member.voice.setChannel(newChannel);

      // Envia o Painel Completo de Controle
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Painel de Controle da Call')
        .setDescription(`Dono da Call: ${member}\n\nUse os botões abaixo para gerenciar permissões, nome e jogo do seu canal.`)
        .setColor('#5865F2');

      const linha1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_lock').setLabel('Trancar / Destrancar').setStyle(ButtonStyle.Primary).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('btn_hide').setLabel('Ocultar / Mostrar').setStyle(ButtonStyle.Secondary).setEmoji('👁️'),
        new ButtonBuilder().setCustomId('btn_limit').setLabel('Ajustar Limite').setStyle(ButtonStyle.Success).setEmoji('👥')
      );

      const linha2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_rename').setLabel('Renomear / Jogo').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('btn_transfer').setLabel('Passar Dono').setStyle(ButtonStyle.Danger).setEmoji('👑')
      );

      await newChannel.send({ embeds: [embed], components: [linha1, linha2] });
    }

    // 2. Tratar Saída e Herança Automática de Dono
    if (channelSaiu && client.callsTemporarias.has(channelSaiu)) {
      const channel = oldState.guild.channels.cache.get(channelSaiu);
      
      if (channel) {
        // Se a call ficou vazia, deleta
        if (channel.members.size === 0) {
          client.callsTemporarias.delete(channel.id);
          await channel.delete().catch(() => {});
        } else {
          // Se quem saiu era o dono atual, passa a posse para o próximo membro
          const dadosCall = client.callsTemporarias.get(channel.id);
          if (dadosCall && dadosCall.donoId === oldState.member.id) {
            const novoDono = channel.members.first();
            
            // Remove permissões do dono antigo e concede ao novo
            await channel.permissionOverwrites.delete(oldState.member.id).catch(() => {});
            await channel.permissionOverwrites.edit(novoDono.id, {
              [PermissionFlagsBits.ManageChannels]: true,
              [PermissionFlagsBits.MoveMembers]: true,
              [PermissionFlagsBits.Connect]: true
            });

            // Atualiza registro no Map
            dadosCall.donoId = novoDono.id;

            await channel.send({
              content: `👑 **Transferência de Posse:** O criador saiu da sala. ${novoDono} agora é o **novo dono da call**!`
            });
          }
        }
      }
    }
  }
};