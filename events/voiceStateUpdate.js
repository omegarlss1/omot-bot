const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

function gerarNomeCall(tipo, donoNome, jogo, totalMembros) {
  const amiguinhos = totalMembros - 1;
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

    // 1. Entrada em Canal Gatilho
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

      client.callsTemporarias.set(newChannel.id, { 
        donoId: member.id, 
        donoNome: member.displayName, 
        tipo: tipo,
        jogo: tipo === 'sideswipe' ? 'RL SideSwipe' : null
      });

      await member.voice.setChannel(newChannel);

      // Embed amigável do Mascote Ômot
      const embed = new EmbedBuilder()
        .setTitle('⚡ Fala tu! A sala é tua!')
        .setDescription(`E aí, ${member}! Já criei seu espaço. Usa os botões aí embaixo pra arrumar a sala do seu jeito!`)
        .setColor('#FF6B00');

      // Linha 1: Definir jogo/Nome + Definir limite
      const linha1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_rename').setLabel('Definir Jogo / Nome').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('btn_limit_modal').setLabel('Definir Limite').setStyle(ButtonStyle.Success).setEmoji('👥')
      );

      // Linha 2: Trancar/Destrancar + Ocultar/Mostrar
      const linha2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_lock').setLabel('Trancar / Destrancar').setStyle(ButtonStyle.Primary).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('btn_hide').setLabel('Ocultar / Mostrar').setStyle(ButtonStyle.Secondary).setEmoji('👁️')
      );

      // Linha 3: Passar Dono + Encerrar
      const linha3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_transfer').setLabel('Passar Dono').setStyle(ButtonStyle.Secondary).setEmoji('👑'),
        new ButtonBuilder().setCustomId('btn_close_call').setLabel('Encerrar Call').setStyle(ButtonStyle.Danger).setEmoji('✖️')
      );

      await newChannel.send({ embeds: [embed], components: [linha1, linha2, linha3] });
    }

    // 2. Atualização e Saída
    const canalAtual = newState.channel || oldState.channel;
    if (canalAtual && client.callsTemporarias.has(canalAtual.id)) {
      const dadosCall = client.callsTemporarias.get(canalAtual.id);
      
      if (canalAtual.members.size === 0) {
        client.callsTemporarias.delete(canalAtual.id);
        await canalAtual.delete().catch(() => {});
        return;
      }

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

        await canalAtual.send({ content: `👑 O criador vazou! A coroa agora é do(a) ${novoDono}!` });
      }

      const novoNome = gerarNomeCall(dadosCall.tipo, dadosCall.donoNome, dadosCall.jogo, canalAtual.members.size);
      if (canalAtual.name !== novoNome) {
        await canalAtual.setName(novoNome).catch(() => {});
      }
    }
  }
};

