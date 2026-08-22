const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const member = newState.member;
    if (!member) return;

    // ENTROU
    if (newState.channelId && oldState.channelId!== newState.channelId) {
      const canal = newState.channel;
      const ehGatilho = canal.name.toLowerCase().includes('criar') || client.canaisGatilho?.has(canal.id);
      if (ehGatilho) {
        try {
          const novaCall = await newState.guild.channels.create({
            name: `Call de ${member.displayName}`,
            type: ChannelType.GuildVoice,
            parent: canal.parentId,
            permissionOverwrites: [
              { id: member.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.ManageRoles] },
              { id: newState.guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] }
            ]
          });
          await member.voice.setChannel(novaCall);
          client.callsTemporarias.set(novaCall.id, { dono: member.id, interfaceMsg: null });

          const embed = new EmbedBuilder()
           .setTitle(`🎧 Call de ${member.displayName}`)
           .setDescription(`Bem-vindo à sua call temporária!\nUse os botões abaixo para configurar.`)
           .setColor(0x2b2d31);

          const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lock').setLabel('Trancar').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('unlock').setLabel('Destrancar').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('ghost').setLabel('Esconder').setEmoji('👻').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('unghost').setLabel('Mostrar').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
          );
          const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('limit').setLabel('Limite').setEmoji('👥').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('rename').setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('kick').setLabel('Kickar').setEmoji('❌').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('delete').setLabel('Deletar').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
          );

          // Envia painel no chat da call (se tiver text chat) ou salva pra depois
          try {
            // Tenta mandar no canal de texto padrão ou no próprio canal de voz como mensagem
            const msg = await novaCall.send({ embeds: [embed], components: [row1, row2] });
            client.callsTemporarias.get(novaCall.id).interfaceMsg = msg.id;
          } catch(e) {}

        } catch(e) { console.error(e); }
      }
    }

    // SAIU - APAGAR SE VAZIA
    if (oldState.channelId && oldState.channelId!== newState.channelId) {
      const canal = oldState.channel;
      if (canal && client.callsTemporarias.has(canal.id) && canal.members.size === 0) {
        try { await canal.delete(); client.callsTemporarias.delete(canal.id); } catch(e) {}
      }
      // CLAIM - se dono saiu e ainda tem gente
      if (canal && client.callsTemporarias.has(canal.id) && canal.members.size > 0) {
        const dados = client.callsTemporarias.get(canal.id);
        if (dados.dono === oldState.id) {
          const novoDono = canal.members.first();
          if (novoDono) {
            dados.dono = novoDono.id;
            try { await canal.permissionOverwrites.edit(novoDono.id, { ManageChannels: true, MoveMembers: true }); } catch(e) {}
            try { await canal.send(`👑 <@${novoDono.id}> agora é o dono da call!`); } catch(e) {}
          }
        }
      }
    }
  }
};
