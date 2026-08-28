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
  if (!member) {
    console.error(`Member ausente ao tentar criar call temporária, channelId: ${newState.channelId}, userId: ${newState.id}`);
    return;
  }
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

  try {
    await client.stores.calls.criar(newChannel.id, guild.id, {
      donoId: member.id,
      donoNome: member.displayName,
      tipo,
      jogo: tipo === 'sideswipe' ? 'RL SideSwipe' : null
    });

    await member.voice.setChannel(newChannel);
    await newChannel.send(montarPainelCall(member));
  } catch (error) {
    await client.stores.calls.remover(newChannel.id).catch(() => {});
    await newChannel.delete().catch(() => {});
    throw error;
  }
}

async function transferirLideranca(canal, antigoDonoId, novoDono, client, estaAtivo = () => true) {
  try {
    if (!estaAtivo()) return;
    await canal.permissionOverwrites.delete(antigoDonoId).catch((error) => {
      console.error(`Erro ao remover permissões do antigo líder ${canal.id}:`, {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
    });
    if (!estaAtivo()) return;
    await canal.permissionOverwrites.edit(novoDono.id, PERMISSOES_LIDER);
    if (!estaAtivo()) return;
    await client.stores.calls.atualizar(canal.id, {
      donoId: novoDono.id,
      donoNome: novoDono.displayName
    });
    if (!estaAtivo()) return;
    await atualizarPainel(canal, client);
  } catch (error) {
    console.error(`Erro ao transferir liderança da call ${canal.id}:`, {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
    throw error;
  }
}

async function atualizarPainel(canal, client) {
  const mensagens = await canal.messages.fetch({ limit: 50 }).catch(() => null);
  const mensagem = mensagens?.find((item) => item.author.id === client.user.id
    && item.embeds[0]?.title === 'Painel de Controle da Call');
  if (!mensagem) return;

  const dadosCall = client.stores.calls.get(canal.id);
  const membro = canal.guild.members.cache.get(dadosCall?.donoId) || canal.guild.members.me;
  if (membro) await mensagem.edit(montarPainelCall(membro)).catch(() => {});
}

async function encerrarCall(canal, client) {
  const mensagens = await canal.messages.fetch({ limit: 50 }).catch(() => null);
  if (mensagens) {
    await Promise.all(mensagens
      .filter((mensagem) => mensagem.author.id === client.user.id && mensagem.components.length > 0)
      .map((mensagem) => mensagem.edit({ components: [] }).catch(() => {})));
  }
  await client.stores.calls.remover(canal.id);
  for (const [, member] of canal.members) {
    await member.voice.disconnect().catch(() => {});
  }
  await canal.delete().catch(() => {});
}

async function atualizarNomeCall(canal, client, estaAtivo = () => true) {
  const dadosCall = client.stores.calls.get(canal.id);
  if (!dadosCall) return;

  const novoNome = gerarNomeCall(dadosCall.tipo, dadosCall.donoNome, dadosCall.jogo, canal.members.size);
  if (canal.name !== novoNome && estaAtivo()) {
    try {
      await canal.setName(novoNome);
    } catch (error) {
      console.error(`Erro ao atualizar automaticamente o nome da call ${canal.id}:`, {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
    }
  }
}

module.exports = {
  criarCallTemporaria,
  transferirLideranca,
  encerrarCall,
  atualizarNomeCall,
  atualizarPainel,
  PERMISSOES_LIDER
};
