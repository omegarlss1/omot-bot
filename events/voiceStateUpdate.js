const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const JOGO_PADRAO = 'Rocket League SideSwipe';

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client){
    const member = newState.member; if(!member) return;

    // CRIA
    if(newState.channelId && oldState.channelId!== newState.channelId){
      const canal = newState.channel;
      const ehGatilho = canal.name.toLowerCase().includes('criar') || client.canaisGatilho.has(canal.id);
      if(ehGatilho){
        const ehGatilhoJogo = canal.name.toLowerCase().includes('jogo') || canal.name.toLowerCase().includes('game') || canal.name.toLowerCase().includes('divers');
        try{
          const temCall = [...client.callsTemporarias].find(([id,d])=>d.dono===member.id && newState.guild.channels.cache.get(id) &&!ehGatilhoJogo);
          if(temCall &&!ehGatilhoJogo &&!member.permissions.has(PermissionsBitField.Flags.ManageChannels)){
            const c = newState.guild.channels.cache.get(temCall[0]);
            if(c){ await member.voice.setChannel(c).catch(()=>{}); return; }
          }

          let nomeCall = ehGatilhoJogo? `${member.displayName} jogando...` : `${member.displayName} jogando ${JOGO_PADRAO}`;

          const novaCall = await newState.guild.channels.create({
            name: nomeCall,
            type: ChannelType.GuildVoice,
            parent: canal.parentId,
            permissionOverwrites: [
              { id: member.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
              { id: newState.guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.Speak] }
            ]
          });
          await member.voice.setChannel(novaCall);
          client.callsTemporarias.set(novaCall.id, { dono: member.id, tipo: ehGatilhoJogo? 'jogo' : 'padrao' });

          const embed = new EmbedBuilder().setTitle(novaCall.name).setDescription(ehGatilhoJogo? `Clique em **Definir Jogo** pra colocar o jogo!` : `Você é o dono!`).setColor(0x2b2d31);

          const rowJogo = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`setgame_${novaCall.id}`).setLabel('Definir Jogo').setEmoji('🎮').setStyle(ButtonStyle.Success)
          );
          const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lock_${novaCall.id}`).setLabel('Trancar').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`unlock_${novaCall.id}`).setLabel('Destrancar').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`ghost_${novaCall.id}`).setLabel('Esconder').setEmoji('👻').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`delete_${novaCall.id}`).setLabel('Deletar').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
          );
          const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`limit_${novaCall.id}`).setLabel('Limite').setEmoji('👥').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rename_${novaCall.id}`).setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`kick_${novaCall.id}`).setLabel('Kickar').setEmoji('❌').setStyle(ButtonStyle.Danger),
          );

          let components = ehGatilhoJogo? [rowJogo, row1, row2] : [row1, row2];
          try{ await novaCall.send({ embeds:[embed], components }); }catch(e){}
        }catch(e){ console.error(e); }
      }
    }

    // DELETA
    if(oldState.channelId && oldState.channelId!== newState.channelId){
      const canal = oldState.channel; if(!canal) return;
      const ehTemp = client.callsTemporarias.has(canal.id) || canal.name.includes('jogando');
      if(ehTemp && canal.members.size===0){
        try{ await canal.delete(); }catch(e){}
        client.callsTemporarias.delete(canal.id);
      } else if(ehTemp && canal.members.size>0){
        const dados = client.callsTemporarias.get(canal.id);
        if(dados && dados.dono===oldState.id){
          const novoDono = canal.members.first();
          if(novoDono){ dados.dono=novoDono.id; try{ await canal.permissionOverwrites.edit(novoDono.id,{ ManageChannels:true, MoveMembers:true }); }catch(e){} }
        }
      }
    }
  }
};