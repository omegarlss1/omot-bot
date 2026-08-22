const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const member = newState.member;
    if (!member) return;

    // ENTROU NO GATILHO -> CRIA CALL
    if (newState.channelId && oldState.channelId!== newState.channelId) {
      const canal = newState.channel;
      const ehGatilho = canal.name.toLowerCase().includes('criar') || client.canaisGatilho?.has(canal.id);
      if (ehGatilho) {
        try {
// Só bloqueia usuário comum. ADM / Gerente pode criar várias
const temCall = [...client.callsTemporarias].find(([id, d]) => d.dono === member.id && newState.guild.channels.cache.get(id));
if (temCall &&!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
  const c = newState.guild.channels.cache.get(temCall[0]);
  if (c) { await member.voice.setChannel(c).catch(()=>{}); return; }
}
// Se é você (ADM) e sua call antiga tem gente, passa a coroa e deixa criar outra
if (temCall) {
  const [oldId, oldDados] = temCall;
  const oldCanal = newState.guild.channels.cache.get(oldId);
  if (oldCanal && oldCanal.members.size > 1) {
    const novoDono = oldCanal.members.filter(m => m.id!== member.id).first();
    if (novoDono) {
      oldDados.dono = novoDono.id;
      await oldCanal.permissionOverwrites.edit(novoDono.id, { ManageChannels: true, MoveMembers: true }).catch(()=>{});
      await oldCanal.send(`👑 <@${novoDono.id}> agora é dono, o <@${member.id}> foi criar outra call!`).catch(()=>{});
    }
  }
}

          const novaCall = await newState.guild.channels.create({
            name: `🎧 Call do ${member.displayName}`,
            type: ChannelType.GuildVoice,
            parent: canal.parentId,
            permissionOverwrites: [
              { id: member.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers] },
              { id: newState.guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] }
            ]
          });

          await member.voice.setChannel(novaCall);
          client.callsTemporarias.set(novaCall.id, { dono: member.id });

          const embed = new EmbedBuilder()
          .setTitle(`🎧 Call de ${member.displayName}`)
          .setDescription(`Você é o dono! Use os botões abaixo.`)
          .setColor(0x2b2d31);

          const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lock_${novaCall.id}`).setLabel('Trancar').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`unlock_${novaCall.id}`).setLabel('Destrancar').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`ghost_${novaCall.id}`).setLabel('Esconder').setEmoji('👻').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`unghost_${novaCall.id}`).setLabel('Mostrar').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
          );
          const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`limit_${novaCall.id}`).setLabel('Limite').setEmoji('👥').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rename_${novaCall.id}`).setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`kick_${novaCall.id}`).setLabel('Kickar').setEmoji('❌').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`delete_${novaCall.id}`).setLabel('Deletar').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
          );

          try { await novaCall.send({ embeds: [embed], components: [row1, row2] }); } catch(e){}

        } catch(e) { console.error('Erro criar call:', e); }
      }
    }

    // SAIU -> APAGA SE VAZIA OU PASSA DONO
    if (oldState.channelId && oldState.channelId!== newState.channelId) {
      const canal = oldState.channel;
      if (!canal ||!client.callsTemporarias.has(canal.id)) return;

      if (canal.members.size === 0) {
        try { await canal.delete(); } catch(e){}
        client.callsTemporarias.delete(canal.id);
      } else {
        // CLAIM
        const dados = client.callsTemporarias.get(canal.id);
        if (dados.dono === oldState.id) { // oldState.id = id do user que saiu
          const novoDono = canal.members.first();
          if (novoDono) {
            dados.dono = novoDono.id;
            try { await canal.permissionOverwrites.edit(novoDono.id, { ManageChannels: true, MoveMembers: true }); } catch(e){}
            try { await canal.send(`👑 <@${novoDono.id}> agora é o dono da call!`); } catch(e){}
          }
        }
      }
    }
  }
};