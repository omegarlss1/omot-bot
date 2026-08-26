const { criarCallTemporaria, transferirLideranca, atualizarNomeCall } = require('../../features/calls/service');
const mensagens = require('../../features/calls/messages');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const client = newState.client;
    const channelEntrou = newState.channelId;
    const channelSaiu = oldState.channelId;

    if (channelEntrou && client.stores.gatilhos.has(channelEntrou)) {
      await criarCallTemporaria(newState, client);
      return;
    }

    const canalAtual = newState.channel || oldState.channel;
    if (!canalAtual || !client.stores.calls.has(canalAtual.id)) return;

    if (canalAtual.members.size === 0) {
      await client.stores.calls.remover(canalAtual.id);
      await canalAtual.delete().catch((error) => {
        console.error(`Erro ao excluir call vazia ${canalAtual.id}:`, {
          message: error?.message,
          code: error?.code,
          stack: error?.stack
        });
      });
      return;
    }

    const dadosCall = client.stores.calls.get(canalAtual.id);

    if (channelEntrou === canalAtual.id && dadosCall.bannedUserIds?.includes(newState.member.id)) {
      await newState.member.voice.disconnect().catch((error) => {
        console.error(`Erro ao remover membro banido da call ${canalAtual.id}:`, {
          message: error?.message,
          code: error?.code,
          stack: error?.stack
        });
      });
      return;
    }

    if (channelSaiu === canalAtual.id && oldState.member.id === dadosCall.donoId) {
      const novoDono = canalAtual.members.first();
      if (!novoDono) return;
      await transferirLideranca(canalAtual, oldState.member.id, novoDono, client);
      await canalAtual.send({ content: `${mensagens.liderancaTransferida} ${novoDono} assumiu a liderança.` });
    }

    await atualizarNomeCall(canalAtual, client);
  }
};
