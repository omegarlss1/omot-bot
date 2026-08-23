const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// Função auxiliar para gerar o nome formatado
function gerarNomeCall(tipo, donoNome, jogo, totalMembros) {
  const amiguinhos = totalMembros - 1; // Desconta o dono
  let sufixoAmigos = '';

  if (amiguinhos === 1) {
    sufixoAmigos = ' +1 Ômigo';
  } else if (amiguinhos > 1) {
    sufixoAmigos = ` +${amiguinhos} Ômigos`;
  }

  if (tipo === 'sideswipe') {
    return `🎮 | RL SideSwipe | ${donoNome}${sufixoAmigos}`;
  } else {
    const nomeJogo = jogo || 'Jogos Diversos';
    return `🎮 | ${nomeJogo} | ${donoNome}${sufixoAmigos}`;
  }
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const channelEntrou = newState.channelId;
    const channelSaiu = oldState.channelId;

    // 1. Entrada em um canal Gatilho
    if (channelEntrou && client.canaisGatilho.has(channelEntrou)) {
      const guild = newState.guild;
      const member = newState.member;
      const parentCategory = newState.channel.parentId;
      const tipo = client.gatilhosConfig?.get(channelEntrou) || 'sideswipe';

      const nomeInicial = gerarNomeCall(tipo, member.displayName, null, 1);

      const newChannel = await guild.channels.create({
        name: nomeInicial,
        type: ChannelType.GuildVoice,
        parent: parentCategory || null,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect]
          }
        ]
      });

      // Registra a call temporária
      client.callsTemporarias.set(newChannel.id, { 
        donoId: member.id, 
        donoNome: member.displayName, 
        tipo: tipo,
        jogo: tipo === 'sideswipe' ? 'RL SideSwipe' : null
      });

      await member.voice.setChannel(newChannel);

      // Envia o Painel
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Painel de Controle da Call')
        .setDescription(`Dono da Call: ${member}\nTipo: **${tipo === 'sideswipe' ? 'RL SideSwipe' : 'Jogos Diversos'}**`)
        .setColor('#5865F2');

      const linha1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_lock').setLabel('Trancar / Destrancar').setStyle(ButtonStyle.Primary).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('btn_hide').setLabel('Ocultar / Mostrar').setStyle(ButtonStyle.Secondary).setEmoji('👁️'),
        new ButtonBuilder().setCustomId('btn_limit').setLabel('Ajustar Limite').setStyle(ButtonStyle.Success).setEmoji('👥')
      );

      const linha2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_rename').setLabel('Definir Jogo / Nome').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('btn_transfer').setLabel('Passar Dono').setStyle(ButtonStyle.Danger).setEmoji('👑')
      );

      await newChannel.send({ embeds: [embed], components: [linha1, linha2] });
    }

    // 2. Atualização Dinâmica de Nomes (Entradas e Saídas em Calls Temporárias)
    const canalAtual = newState.channel || oldState.channel;
    if (canalAtual && client.callsTemporarias.has(canalAtual.id)) {
      const dadosCall = client.callsTemporarias.get(canalAtual.id);
      
      // Se ficou vazia, exclui
      if (canalAtual.members.size === 0) {
        client.callsTemporarias.delete(canalAtual.id);
        await canalAtual.delete().catch(() => {});
        return;
      }

      // Se quem saiu era o dono, transfere a posse
      if (channelSaiu && oldState.member.id === dadosCall.donoId) {
        const novoDono = canalAtual.members.first();
        dadosCall.donoId = novoDono.id;
        dadosCall.donoNome = novoDono.displayName;

        await canalAtual.permissionOverwrites.delete(oldState.member.id).catch(() => {});
        await canalAtual.permissionOverwrites.edit(novoDono.id, {
          [PermissionFlagsBits.ManageChannels]: true,
          [PermissionFlagsBits.MoveMembers]: true,
          [PermissionFlagsBits.Connect]: true
        });

        await canalAtual.send({ content: `👑 ${novoDono} agora é o **novo dono da call**!` });
      }

      // Atualiza o nome da sala baseado no número de Ômigos atual
      const novoNome = gerarNomeCall(dadosCall.tipo, dadosCall.donoNome, dadosCall.jogo, canalAtual.members.size);
      if (canalAtual.name !== novoNome) {
        await canalAtual.setName(novoNome).catch(() => {});
      }
    }
  }
};