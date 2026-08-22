const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client){
    const entrou = newState.channelId &&!oldState.channelId;
    const saiu = oldState.channelId &&!newState.channelId;
    const trocou = oldState.channelId && newState.channelId && oldState.channelId!== newState.channelId;

    // CRIOU CALL
    if((entrou || trocou) && client.canaisGatilho.has(newState.channelId)){
      const gatilho = newState.guild.channels.cache.get(newState.channelId);
      const member = newState.member;

      const ehSideSwipe = gatilho.name.toLowerCase().includes('sideswipe') || gatilho.name.toLowerCase().includes('rl ');
      const ehDiversos =!ehSideSwipe;

      const gameInicial = ehSideSwipe? 'RL SideSwipe' : 'Aguardando jogo';

      try{
        const novaCall = await newState.guild.channels.create({
          name: `${gameInicial} | ${member.displayName}`,
          type: 2,
          parent: gatilho.parent,
          permissionOverwrites: [{ id: member.id, allow: ['ManageChannels','MoveMembers'] }]
        });
        await newState.setChannel(novaCall.id).catch(()=>{});
        client.callsTemporarias.set(novaCall.id, { dono: member.id, donoNome: member.displayName, game: gameInicial, tipo: ehSideSwipe? 'sideswipe' : 'diversos' });

        const embed = new EmbedBuilder()
         .setColor('#8B5CF6')
         .setTitle('🎮 Painel da sua Call Ômega')
         .setDescription(`Salve ${member}, sua call **${gameInicial}** foi criada!\nUse os botões abaixo.`);

        // Botões com os nomes novos que você pediu
        const btnJogo = new ButtonBuilder().setCustomId(`setgame_${novaCall.id}`).setLabel('🎮 Definir Jogo').setStyle(ButtonStyle.Primary);
        const btnRenomear = new ButtonBuilder().setCustomId(`rename_${novaCall.id}`).setLabel('✏️ Renomear').setStyle(ButtonStyle.Secondary);
        const btnLimitar = new ButtonBuilder().setCustomId(`limit_${novaCall.id}`).setLabel('👥 Limitar').setStyle(ButtonStyle.Secondary);
        const btnKick = new ButtonBuilder().setCustomId(`kick_${novaCall.id}`).setLabel('❌ Kickar').setStyle(ButtonStyle.Danger);
        const btnEncerrar = new ButtonBuilder().setCustomId(`delete_${novaCall.id}`).setLabel('🔴 Encerrar').setStyle(ButtonStyle.Danger);

        const btnTrancar = new ButtonBuilder().setCustomId(`lock_${novaCall.id}`).setLabel('🔒 Trancar').setStyle(ButtonStyle.Secondary);
        const btnDestrancar = new ButtonBuilder().setCustomId(`unlock_${novaCall.id}`).setLabel('🔓 Destrancar').setStyle(ButtonStyle.Secondary);
        const btnOcultar = new ButtonBuilder().setCustomId(`ghost_${novaCall.id}`).setLabel('👻 Ocultar').setStyle(ButtonStyle.Secondary);
        const btnReexibir = new ButtonBuilder().setCustomId(`unghost_${novaCall.id}`).setLabel('👁️ Reexibir').setStyle(ButtonStyle.Secondary);

        let row1, row2;

        if(ehSideSwipe){
          // RL SideSwipe NÃO tem botão de Definir Jogo
          row1 = new ActionRowBuilder().addComponents(btnRenomear, btnLimitar, btnKick, btnEncerrar);
          row2 = new ActionRowBuilder().addComponents(btnTrancar, btnDestrancar, btnOcultar, btnReexibir);
        } else {
          // Jogos Diversos TEM botão de Definir Jogo
          row1 = new ActionRowBuilder().addComponents(btnJogo, btnRenomear, btnLimitar, btnKick, btnEncerrar);
          row2 = new ActionRowBuilder().addComponents(btnTrancar, btnDestrancar, btnOcultar, btnReexibir);
        }

        // ENVIA NO CHAT DA PRÓPRIA CALL CRIADA
        await novaCall.send({ content: `<@${member.id}>`, embeds: [embed], components: [row1, row2] }).catch(()=>{});

      }catch(e){ console.error('Erro ao criar call:', e); }
    }

    // ATUALIZA NOME: JOGO | DONO + X ÔMIGOS
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

    // DELETA QUANDO VAZIA
    if((saiu || trocou) && client.callsTemporarias.has(oldState.channelId)){
      const canal = oldState.guild.channels.cache.get(oldState.channelId);
      if(canal && canal.members.size === 0){
        try{ await canal.delete(); client.callsTemporarias.delete(oldState.channelId); }catch(e){}
      }
    }
  }
};