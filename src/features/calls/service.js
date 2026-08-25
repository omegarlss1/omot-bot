const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { gerarNomeCall } = require('./naming');
const { montarPainelCall } = require('./panel');

const PERMISSOES_LIDER = {
  [PermissionFlagsBits.ManageChannels]: true,
  [PermissionFlagsBits.MoveMembers]: true,
  [PermissionFlagsBits.Connect]: true
};

async function criarCallTemporaria(newState, client) {
  const guild = newState.guild;
  const member = newState.member;
  const parentCategory = newState.channel.parentId;
  const tipo = client.stores.gatilhos.tipo(newState.channelId);
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

  await client.stores.calls.criar(newChannel.id, guild.id, {
    donoId: member.id,
    donoNome: member.displayName,
    tipo,
    jogo: tipo === 'sideswipe' ? 'RL SideSwipe' : null
  });

  await member.voice.setChannel(newChannel);
  await newChannel.send(montarPainelCall(member));
}

async function transferirLideranca(canal, antigoDonoId, novoDono, client) {
  await canal.permissionOverwrites.delete(antigoDonoId).catch(() => {});
  await canal.permissionOverwrites.edit(novoDono.id, PERMISSOES_LIDER);
  await client.stores.calls.atualizar(canal.id, {
    donoId: novoDono.id,
    donoNome: novoDono.displayName
  });
}

async function encerrarCall(canal, client) {
  await client.stores.calls.remover(canal.id);
  for (const [, member] of canal.members) {
    await member.voice.disconnect().catch(() => {});
  }
  await canal.delete().catch(() => {});
}

async function atualizarNomeCall(canal, client) {
  const dadosCall = client.stores.calls.get(canal.id);
  if (!dadosCall) return;

  const novoNome = gerarNomeCall(dadosCall.tipo, dadosCall.donoNome, dadosCall.jogo, canal.members.size);
  if (canal.name !== novoNome) {
    await canal.setName(novoNome).catch(() => {});
  }
}

module.exports = {
  criarCallTemporaria,
  transferirLideranca,
  encerrarCall,
  atualizarNomeCall,
  PERMISSOES_LIDER
};
