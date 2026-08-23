const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { salvarCall, removerCall } = require('../utils/database');
const { transferirDono, renomearCall } = require('../utils/calls');

const ID_SIDESWIPE = "1540804418792988673";

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const entrou = newState.channelId && !oldState.channelId;
    const saiu = oldState.channelId && !newState.channelId;
    const trocou = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

    if ((entrou || trocou) && client.canaisGatilho.has(newState.channelId)) {
      const gatilho = newState.guild.channels.cache.get(newState.channelId);
      const member = newState.member;
      const temPermCriar = member.permissions.has('ManageChannels');
      if (!temPermCriar) {
        const jaTemCall = [...client.callsTemporarias.values()].filter(c => c.dono === member.id).length;
        if (jaTemCall >= 1) {
          await newState.setChannel(null).catch(() => {});
          return;
        }
      }
      const ehSideSwipe = newState.channelId === ID_SIDESWIPE;
      const gameInicial = ehSideSwipe ? 'RL SideSwipe' : 'Aguardando jogo';

      try {
        const novaCall = await newState.guild.channels.create({
          name: `${gameInicial} | ${member.displayName}`,
          type: 2, parent: gatilho.parent,
          permissionOverwrites: [{ id: member.id, allow: ['ManageChannels', 'MoveMembers'] }]
        });
        await newState.setChannel(novaCall.id).catch(() => {});

        const dados = { dono: member.id, donoNome: member.displayName, game: gameInicial };
        client.callsTemporarias.set(novaCall.id, dados);
        salvarCall(novaCall.id, dados);

        const embed = new EmbedBuilder().setColor('#8B5CF6').setTitle('🎮 Painel da Call').setDescription(`<@${member.id}> use os botões abaixo pra configurar.`);

        const btnJogo = new ButtonBuilder().setCustomId(`setgame_${novaCall.id}`).setLabel('🎮 Definir Jogo').setStyle(ButtonStyle.Primary);
        const btnRenomear = new ButtonBuilder().setCustomId(`rename_${novaCall.id}`).setLabel('✏️ Renomear').setStyle(ButtonStyle.Secondary);
        const btnLimitar = new ButtonBuilder().setCustomId(`limit_${novaCall.id}`).setLabel('👥 Limitar').setStyle(ButtonStyle.Secondary);
        const btnKick = new ButtonBuilder().setCustomId(`kick_${novaCall.id}`).setLabel('❌ Kickar').setStyle(ButtonStyle.Danger);
        const btnTransferir = new ButtonBuilder().setCustomId(`transfer_${novaCall.id}`).setLabel('👑 Passar Dono').setStyle(ButtonStyle.Primary);
        const btnEncerrar = new ButtonBuilder().setCustomId(`delete_${novaCall.id}`).setLabel('🔴 Encerrar').setStyle(ButtonStyle.Danger);
        const btnTrancar = new ButtonBuilder().setCustomId(`lock_${novaCall.id}`).setLabel('🔒 Trancar').setStyle(ButtonStyle.Secondary);
        const btnDestrancar = new ButtonBuilder().setCustomId(`unlock_${novaCall.id}`).setLabel('🔓 Destrancar').setStyle(ButtonStyle.Secondary);
        const btnOcultar = new ButtonBuilder().setCustomId(`ghost_${novaCall.id}`).setLabel('👻 Ocultar').setStyle(ButtonStyle.Secondary);
        const btnReexibir = new ButtonBuilder().setCustomId(`unghost_${novaCall.id}`).setLabel('👁️ Reexibir').setStyle(ButtonStyle.Secondary);

        // Discord permite no máximo 5 botões por linha
        let rows = [];
        if (ehSideSwipe) {
          rows = [
            new ActionRowBuilder().addComponents(btnRenomear, btnLimitar, btnKick, btnTransferir, btnEncerrar),
            new ActionRowBuilder().addComponents(btnTrancar, btnDestrancar, btnOcultar, btnReexibir),
          ];
        } else {
          rows = [
            new ActionRowBuilder().addComponents(btnJogo),
            new ActionRowBuilder().addComponents(btnRenomear, btnLimitar, btnKick, btnTransferir, btnEncerrar),
            new ActionRowBuilder().addComponents(btnTrancar, btnDestrancar, btnOcultar, btnReexibir),
          ];
        }

        await novaCall.send({ embeds: [embed], components: rows }).catch(() => {});

      } catch (e) { console.error(e); }
    }

    const canalAfetadoId = saiu ? oldState.channelId : newState.channelId;
    if (client.callsTemporarias.has(canalAfetadoId)) {
      const canal = newState.guild.channels.cache.get(canalAfetadoId) || oldState.guild.channels.cache.get(canalAfetadoId);
      if (canal) {
        const dados = client.callsTemporarias.get(canalAfetadoId);
        await renomearCall(canal, dados);
      }
    }

    if ((saiu || trocou) && client.callsTemporarias.has(oldState.channelId)) {
      const canal = oldState.guild.channels.cache.get(oldState.channelId);
      if (canal) {
        const dados = client.callsTemporarias.get(oldState.channelId);
        // dono saiu sem passar a call pra ninguém -> escolhe automaticamente o próximo membro
        if (dados && oldState.member.id === dados.dono && canal.members.size > 0) {
          const novoDono = canal.members.first();
          if (novoDono) {
            await transferirDono(client, canal, dados, novoDono);
            await canal.send(`👑 <@${novoDono.id}> agora é o dono!`).catch(() => {});
          }
        }
        if (canal.members.size === 0) {
          try {
            await canal.delete();
            client.callsTemporarias.delete(oldState.channelId);
            removerCall(oldState.channelId);
          } catch (e) {}
        }
      }
    }
  }
};

