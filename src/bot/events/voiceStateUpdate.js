const { criarCallTemporaria, transferirLideranca, atualizarNomeCall } = require('../../features/calls/service');
const { adquirirLockCall } = require('../../features/calls/lock');
const { comTimeout } = require('../../features/calls/timeout');
const mensagens = require('../../features/calls/messages');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    try {
      const client = newState.client;
      const channelEntrou = newState.channelId;
      const channelSaiu = oldState.channelId;

      if (channelEntrou && client.stores.gatilhos.has(channelEntrou)) {
        await criarCallTemporaria(newState, client);
        return;
      }

      const canalAtual = newState.channel || oldState.channel;
      if (!canalAtual || !client.stores.calls.has(canalAtual.id)) return;
      const canalExistente = await comTimeout(() => client.channels.fetch(canalAtual.id).catch(() => null));
      if (!canalExistente) return;

      const liberarLock = await comTimeout((estaAtivo) => adquirirLockCall(canalAtual.id, estaAtivo));
      try {
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
        await comTimeout((ativo) => transferirLideranca(canalAtual, oldState.member.id, novoDono, client, ativo));
        await comTimeout((ativo) => ativo() ? canalAtual.send({ content: `${mensagens.liderancaTransferida} ${novoDono} assumiu a liderança.` }) : undefined);
      }

      await comTimeout((ativo) => atualizarNomeCall(canalAtual, client, ativo));
      } finally {
        liberarLock();
      }
    } catch (error) {
      console.error(`Erro ao processar atualização de voz da call:`, {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
    }
  }
};
