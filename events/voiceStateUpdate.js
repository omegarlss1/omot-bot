const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const JOGO_PADRAO = 'RL SideSwipe';

function formataNome(game, donoNome, totalMembros) {
  if (totalMembros <= 1) return `${game} | ${donoNome}`;
  if (totalMembros === 2) return `${game} | ${donoNome} +1 Ômigo`;
  return `${game} | ${donoNome} +${totalMembros - 1} Ômigos`;
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client){
    const member = newState.member; if(!member) return;

    // CRIAÇÃO
    if(newState.channelId && oldState.channelId !== newState.channelId){
      const canal = newState.channel;
      const ehGatilho = canal.name.toLowerCase().includes('criar') || client.canaisGatilho.has(canal.id);
      if(ehGatilho){
        const ehJogoDiverso = canal.name.toLowerCase().includes('jogo') || canal.name.toLowerCase().includes('divers');
        try{
          const novaGame = ehJogoDiverso ? 'Aguardando jogo' : JOGO_PADRAO;
          const nomeInicial = formataNome(novaGame, member.displayName, 1);
          
          const novaCall = await newState.guild.channels.create({
            name: nomeInicial,
            type: ChannelType.GuildVoice,
            parent: canal.parentId,
            permissionOverwrites: [
              { id: member.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
              { id: newState.guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.Speak] }
            ]
          });
          await member.voice.setChannel(novaCall);
          client.callsTemporarias.set(novaCall.id, { dono: member.id, donoNome: member.displayName, game: novaGame });

          const embed = new EmbedBuilder().setTitle(novaCall.name).setDescription(ehJogoDiverso ? `Bem-vindo, Ômigo! Clique em **Definir Jogo**` : `Sua call foi criada!`).setColor(0x2b2d31);
          const rowGame = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`setgame_${novaCall.id}`).setLabel('Definir Jogo').setEmoji('🎮').setStyle(ButtonStyle.Success));
          const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lock_${novaCall.id}`).setLabel('Trancar').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`unlock_${novaCall.id}`).setLabel('Destrancar').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`delete_${novaCall.id}`).setLabel('Deletar').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
          );
          const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`limit_${novaCall.id}`).setLabel('Limite').setEmoji('👥').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`kick_${novaCall.id}`).setLabel('Kickar').setEmoji('❌').setStyle(ButtonStyle.Danger),
          );
          const comps = ehJogoDiverso ? [rowGame, row1, row2] : [row1, row2];
          try{ await novaCall.send({ embeds:[embed], components: comps }); }catch(e){}
        }catch(e){ console.error(e); }
      }
    }

    // ATUALIZA CONTAGEM DE ÔMIGOS
    if(newState.channelId){
      const canal = newState.guild.channels.cache.get(newState.channelId);
      const dados = client.callsTemporarias.get(newState.channelId);
      if(canal && dados && canal.members.size > 0){
        const novoNome = formataNome(dados.game, dados.donoNome, canal.members.size);
        if(canal.name !== novoNome) await canal.setName(novoNome).catch(()=>{});
      }
    }

    // DELETA E ATUALIZA AO SAIR
    if(oldState.channelId && oldState.channelId !== newState.channelId){
      const canal = oldState.guild.channels.cache.get(oldState.channelId) || oldState.channel;
      if(!canal) return;
      const dados = client.callsTemporarias.get(canal.id);
      const ehTemp = dados || canal.name.includes('|') && (canal.name.includes('Ômigo') || canal.name.includes(JOGO_PADRAO));

      if(ehTemp && canal.members.size === 0){
        try{ await canal.delete(); }catch(e){}
        client.callsTemporarias.delete(canal.id);
      } else if (ehTemp && canal.members.size > 0 && dados){
        // Atualiza contagem
        const novoNome = formataNome(dados.game, dados.donoNome, canal.members.size);
        if(canal.name !== novoNome) await canal.setName(novoNome).catch(()=>{});

        // Passa dono se saiu
        if(dados.dono === oldState.id){
          const novoDono = canal.members.first();
          if(novoDono){
            dados.dono = novoDono.id;
            dados.donoNome = novoDono.displayName;
            const novoNomeDono = formataNome(dados.game, dados.donoNome, canal.members.size);
            await canal.setName(novoNomeDono).catch(()=>{});
            try{ await canal.permissionOverwrites.edit(novoDono.id,{ ManageChannels:true, MoveMembers:true }); }catch(e){}
          }
        }
      }
    }
  }
};