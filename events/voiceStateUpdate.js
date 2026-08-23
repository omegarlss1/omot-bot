const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client){
    const entrou = newState.channelId &&!oldState.channelId;
    const saiu = oldState.channelId &&!newState.channelId;
    const trocou = oldState.channelId && newState.channelId && oldState.channelId!== newState.channelId;
    const ID_SIDESWIPE = "1540804418792988673";

    if((entrou || trocou) && client.canaisGatilho.has(newState.channelId)){
      const gatilho = newState.guild.channels.cache.get(newState.channelId);
      const member = newState.member;
      const temPermCriar = member.permissions.has('ManageChannels');
      if(!temPermCriar){
        const jaTemCall = [...client.callsTemporarias.values()].filter(c => c.dono === member.id).length;
        if(jaTemCall >= 1){
          await newState.setChannel(null).catch(()=>{});
          return;
        }
      }
      const ehSideSwipe = newState.channelId === ID_SIDESWIPE;
      const gameInicial = ehSideSwipe? 'RL SideSwipe' : 'Aguardando jogo';

      try{
        const novaCall = await newState.guild.channels.create({
          name: `${gameInicial} | ${member.displayName}`,
          type: 2, parent: gatilho.parent,
          permissionOverwrites: [{ id: member.id, allow: ['ManageChannels','MoveMembers'] }]
        });
        await newState.setChannel(novaCall.id).catch(()=>{});
        client.callsTemporarias.set(novaCall.id, { dono: member.id, donoNome: member.displayName, game: gameInicial });

        const embed = new EmbedBuilder().setColor('#8B5CF6').setTitle('🎮 Painel da Call').setDescription(`<@${member.id}> use os botões abaixo pra configurar.`);

        const btnJogo = new ButtonBuilder().setCustomId(`setgame_${novaCall.id}`).setLabel('🎮 Definir Jogo').setStyle(ButtonStyle.Primary);
        const btnRenomear = new ButtonBuilder().setCustomId(`rename_${novaCall.id}`).setLabel('✏️ Renomear').setStyle(ButtonStyle.Secondary);
        const btnLimitar = new ButtonBuilder().setCustomId(`limit_${novaCall.id}`).setLabel('👥 Limitar').setStyle(ButtonStyle.Secondary);
        const btnKick = new ButtonBuilder().setCustomId(`kick_${novaCall.id}`).setLabel('❌ Kickar').setStyle(ButtonStyle.Danger);
        const btnEncerrar = new ButtonBuilder().setCustomId(`delete_${novaCall.id}`).setLabel('🔴 Encerrar').setStyle(ButtonStyle.Danger);
        const btnTrancar = new ButtonBuilder().setCustomId(`lock_${novaCall.id}`).setLabel('🔒 Trancar').setStyle(ButtonStyle.Secondary);
        const btnDestrancar = new ButtonBuilder().setCustomId(`unlock_${novaCall.id}`).setLabel('🔓 Destrancar').setStyle(ButtonStyle.Secondary);
        const btnOcultar = new ButtonBuilder().setCustomId(`ghost_${novaCall.id}`).setLabel('👻 Ocultar').setStyle(ButtonStyle.Secondary);
        const btnReexibir = new ButtonBuilder().setCustomId(`unghost_${novaCall.id}`).setLabel('👁️ Reexibir').setStyle(ButtonStyle.Secondary);

        let rows = [];
        if(ehSideSwipe){
          // RL SideSwipe - 8 botões - Renomear sozinho na primeira linha
          rows = [
            new ActionRowBuilder().addComponents(btnRenomear),
            new ActionRowBuilder().addComponents(btnLimitar, btnKick),
            new ActionRowBuilder().addComponents(btnEncerrar, btnTrancar),
            new ActionRowBuilder().addComponents(btnDestrancar, btnOcultar),
            new ActionRowBuilder().addComponents(btnReexibir),
          ];
        } else {
          // Jogos Diversos - 9 botões - 2 por linha
          rows = [
            new ActionRowBuilder().addComponents(btnJogo, btnRenomear),
            new ActionRowBuilder().addComponents(btnLimitar, btnKick),
            new ActionRowBuilder().addComponents(btnEncerrar, btnTrancar),
            new ActionRowBuilder().addComponents(btnDestrancar, btnOcultar),
            new ActionRowBuilder().addComponents(btnReexibir),
          ];
        }

        await novaCall.send({ embeds: [embed], components: rows }).catch(()=>{});

      }catch(e){ console.error(e); }
    }

    const canalAfetadoId = saiu? oldState.channelId : newState.channelId;
    if(client.callsTemporarias.has(canalAfetadoId)){
      const canal = newState.guild.channels.cache.get(canalAfetadoId) || oldState.guild.channels.cache.get(canalAfetadoId);
      if(canal){
        const dados = client.callsTemporarias.get(canalAfetadoId);
        const total = canal.members.size;
        let nomeFinal;
        if(total <= 1) nomeFinal = `${dados.game} | ${dados.donoNome}`;
        else if(total === 2) nomeFinal = `${dados.game} | ${dados.donoNome} +1 Ômigo`;
        else nomeFinal = `${dados.game} | ${dados.donoNome} +${total-1} Ômigos`;
        if(canal.name!== nomeFinal) await canal.setName(nomeFinal).catch(()=>{});
      }
    }

    if((saiu || trocou) && client.callsTemporarias.has(oldState.channelId)){
      const canal = oldState.guild.channels.cache.get(oldState.channelId);
      if(canal){
        const dados = client.callsTemporarias.get(oldState.channelId);
        if(dados && oldState.member.id === dados.dono && canal.members.size > 0){
          const novoDono = canal.members.first();
          if(novoDono){
            client.callsTemporarias.set(canal.id, {...dados, dono: novoDono.id, donoNome: novoDono.displayName });
            await canal.permissionOverwrites.edit(novoDono.id, { ManageChannels: true, MoveMembers: true }).catch(()=>{});
            await canal.send(`👑 <@${novoDono.id}> agora é o dono!`).catch(()=>{});
          }
        }
        if(canal.members.size === 0){
          try{ await canal.delete(); client.callsTemporarias.delete(oldState.channelId); }catch(e){}
        }
      }
    }
  }
};