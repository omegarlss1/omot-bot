const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client){
    const entrou = newState.channelId && !oldState.channelId;
    const saiu = oldState.channelId && !newState.channelId;
    const trocou = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

    // CRIOU CALL
    if((entrou || trocou) && client.canaisGatilho.has(newState.channelId)){
      const gatilho = newState.guild.channels.cache.get(newState.channelId);
      const member = newState.member;
      const ehJogo = gatilho.name.toLowerCase().includes('jogo') || gatilho.name.toLowerCase().includes('divers');
      const gameInicial = ehJogo ? 'Aguardando jogo' : 'Call da Ômega';

      try{
        const novaCall = await newState.guild.channels.create({
          name: `${gameInicial} | ${member.displayName}`,
          type: 2,
          parent: gatilho.parent,
          permissionOverwrites: [{ id: member.id, allow: ['ManageChannels','MoveMembers'] }]
        });
        await newState.setChannel(novaCall.id).catch(()=>{});
        client.callsTemporarias.set(novaCall.id, { dono: member.id, donoNome: member.displayName, game: gameInicial });

        const embed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setTitle('🎮 Painel da sua Call Ômega')
          .setDescription(`Salve ${member}, sua call foi criada!\nUse os botões abaixo pra configurar.`);

        // ================== AQUI VOCÊ MUDA OS NOMES SOZINHO ==================
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`setgame_${novaCall.id}`).setLabel('🎮 Definir Jogo').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`rename_${novaCall.id}`).setLabel('✏️ Renomear').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`limit_${novaCall.id}`).setLabel('👥 Limitar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`kick_${novaCall.id}`).setLabel('❌ Kickar').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`delete_${novaCall.id}`).setLabel('🔴 Encerrar').setStyle(ButtonStyle.Danger) // <--- MUDA AQUI
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`lock_${novaCall.id}`).setLabel('🔒 Trancar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`unlock_${novaCall.id}`).setLabel('🔓 Destrancar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`ghost_${novaCall.id}`).setLabel('👻 Esconder').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`unghost_${novaCall.id}`).setLabel('👁️ Mostrar').setStyle(ButtonStyle.Secondary)
        );
        // ====================================================================

        // Procura um canal de texto pra mandar o painel
        let canalTexto = null;
        if(gatilho.parent){
          canalTexto = newState.guild.channels.cache.find(c=>c.parentId===gatilho.parent.id && c.type===0);
        }
        if(!canalTexto){
          canalTexto = newState.guild.channels.cache.find(c=>c.type===0 && c.name.includes('geral') || c.name.includes('chat'));
        }
        if(!canalTexto){
          canalTexto = newState.guild.channels.cache.filter(c=>c.type===0).first();
        }

        if(canalTexto) {
          canalTexto.send({ content: `<@${member.id}>`, embeds: [embed], components: [row1, row2] }).then(m=>setTimeout(()=>m.delete().catch(()=>{}), 60000)).catch((e)=>console.log('Erro ao enviar painel:', e));
        }

      }catch(e){ console.error('Erro ao criar call:', e); }
    }

    // ATUALIZA NOME: JOGO | DONO + X ÔMIGOS
    const canalAfetadoId = saiu ? oldState.channelId : newState.channelId;
    if(client.callsTemporarias.has(canalAfetadoId)){
      const canal = newState.guild.channels.cache.get(canalAfetadoId) || oldState.guild.channels.cache.get(canalAfetadoId);
      if(canal){
        const dados = client.callsTemporarias.get(canalAfetadoId);
        const total = canal.members.size;
        // ================== AQUI VOCÊ MUDA O FORMATO DO NOME ==================
        let nomeFinal;
        if(total <= 1) nomeFinal = `${dados.game} | ${dados.donoNome}`;
        else if(total === 2) nomeFinal = `${dados.game} | ${dados.donoNome} +1 Ômigo`;
        else nomeFinal = `${dados.game} | ${dados.donoNome} +${total-1} Ômigos`;
        // ====================================================================
        if(canal.name !== nomeFinal) await canal.setName(nomeFinal).catch(()=>{});
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