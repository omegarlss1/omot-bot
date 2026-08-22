const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// AQUI VOCÊ MUDA TUDO SOZINHO SEM ME PEDIR
const CONFIG = {
  // Como a call vai se chamar
  nomeCall: "{jogo} | {dono}", // {jogo} vira o jogo, {dono} vira seu nome
  nomeCom1Amigo: "{jogo} | {dono} +1 Ômigo",
  nomeComVarios: "{jogo} | {dono} +{qtd} Ômigos",

  // Nomes dos botões
  botoes: {
    jogo: "🎮 Definir Jogo",
    renomear: "✏️ Renomear",
    limite: "👥 Limite",
    kick: "❌ Kickar",
    encerrar: "🔴 Encerrar Call", // muda aqui o nome do deletar
    trancar: "🔒 Trancar",
    destrancar: "🔓 Destrancar",
    esconder: "👻 Esconder",
    mostrar: "👁️ Mostrar"
  }
};

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client){
    //... resto do código continua igual, só que agora usa o CONFIG

    const entrou = newState.channelId &&!oldState.channelId;
    const saiu = oldState.channelId &&!newState.channelId;
    const trocou = oldState.channelId && newState.channelId && oldState.channelId!== newState.channelId;

    if((entrou || trocou) && client.canaisGatilho.has(newState.channelId)){
      const gatilho = newState.guild.channels.cache.get(newState.channelId);
      const member = newState.member;
      const ehJogo = gatilho.name.toLowerCase().includes('jogo');
      const gameInicial = ehJogo? 'Aguardando jogo' : 'Call da Ômega';
      try{
        const novaCall = await newState.guild.channels.create({
          name: CONFIG.nomeCall.replace("{jogo}", gameInicial).replace("{dono}", member.displayName),
          type: 2, parent: gatilho.parent,
          permissionOverwrites: [{ id: member.id, allow: ['ManageChannels','MoveMembers'] }]
        });
        await newState.setChannel(novaCall.id).catch(()=>{});
        client.callsTemporarias.set(novaCall.id, { dono: member.id, donoNome: member.displayName, game: gameInicial });

        const embed = new EmbedBuilder().setColor('#8B5CF6').setTitle('🎮 Painel da sua Call Ômega').setDescription(`Salve ${member}, sua call foi criada!`);
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`setgame_${novaCall.id}`).setLabel(CONFIG.botoes.jogo).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`rename_${novaCall.id}`).setLabel(CONFIG.botoes.renomear).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`limit_${novaCall.id}`).setLabel(CONFIG.botoes.limite).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`kick_${novaCall.id}`).setLabel(CONFIG.botoes.kick).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`delete_${novaCall.id}`).setLabel(CONFIG.botoes.encerrar).setStyle(ButtonStyle.Danger)
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`lock_${novaCall.id}`).setLabel(CONFIG.botoes.trancar).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`unlock_${novaCall.id}`).setLabel(CONFIG.botoes.destrancar).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`ghost_${novaCall.id}`).setLabel(CONFIG.botoes.esconder).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`unghost_${novaCall.id}`).setLabel(CONFIG.botoes.mostrar).setStyle(ButtonStyle.Secondary)
        );
        const canalTexto = gatilho.parent? newState.guild.channels.cache.find(c=>c.parentId===gatilho.parent.id && c.type===0) : null;
        if(canalTexto) canalTexto.send({ content: `<@${member.id}>`, embeds: [embed], components: [row1, row2] }).then(m=>setTimeout(()=>m.delete().catch(()=>{}), 60000)).catch(()=>{});
      }catch(e){ console.error(e); }
    }

    const canalAfetadoId = saiu? oldState.channelId : newState.channelId;
    if(client.callsTemporarias.has(canalAfetadoId)){
      const canal = newState.guild.channels.cache.get(canalAfetadoId) || oldState.guild.channels.cache.get(canalAfetadoId);
      if(canal){
        const dados = client.callsTemporarias.get(canalAfetadoId);
        const total = canal.members.size;
        let nomeFinal;
        if(total <= 1) nomeFinal = CONFIG.nomeCall.replace("{jogo}", dados.game).replace("{dono}", dados.donoNome);
        else if(total === 2) nomeFinal = CONFIG.nomeCom1Amigo.replace("{jogo}", dados.game).replace("{dono}", dados.donoNome);
        else nomeFinal = CONFIG.nomeComVarios.replace("{jogo}", dados.game).replace("{dono}", dados.donoNome).replace("{qtd}", total-1);
        if(canal.name!== nomeFinal) await canal.setName(nomeFinal).catch(()=>{});
      }
    }
    if((saiu || trocou) && client.callsTemporarias.has(oldState.channelId)){
      const canal = oldState.guild.channels.cache.get(oldState.channelId);
      if(canal && canal.members.size === 0){
        try{ await canal.delete(); client.callsTemporarias.delete(oldState.channelId); }catch(e){}
      }
    }
  }
};