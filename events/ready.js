const { carregarGatilhos, carregarCalls, salvarCall, removerCall } = require('../utils/database');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`Ômot online como ${client.user.tag}!`);

    const gatilhosArray = await carregarGatilhos();
    client.canaisGatilho = new Set(gatilhosArray);
    client.callsTemporarias = await carregarCalls();

    console.log(`Gatilhos carregados: ${client.canaisGatilho.size}`);
    console.log(`Calls carregadas do banco: ${client.callsTemporarias.size}`);

    for (const guild of client.guilds.cache.values()) {
      await guild.channels.fetch().catch(() => {});

      for (const canal of guild.channels.cache.values()) {
        const pareceCallTemp = canal.type === 2 && canal.name.includes('|');
        if (!pareceCallTemp) continue;

        if (canal.members.size === 0) {
          try {
            await canal.delete('Limpeza de call órfã');
            client.callsTemporarias.delete(canal.id);
            await removerCall(canal.id);
            console.log(`Call órfã deletada: ${canal.name}`);
          } catch (e) {}
          continue;
        }

        if (!client.callsTemporarias.has(canal.id)) {
          const partes = canal.name.split('|');
          const game = partes[0]?.trim() || 'Aguardando jogo';
          const donoNomeBruto = partes[1]?.replace(/\+\d+ Ômigos?/, '').trim() || '';
          const donoAtual = canal.members.first();
          if (donoAtual) {
            const dados = { dono: donoAtual.id, donoNome: donoAtual.displayName || donoNomeBruto, game };
            client.callsTemporarias.set(canal.id, dados);
            await salvarCall(canal.id, dados);
          }
        }
      }

      for (const callId of [...client.callsTemporarias.keys()]) {
        if (!guild.channels.cache.has(callId)) {
          client.callsTemporarias.delete(callId);
          await removerCall(callId);
        }
      }
    }

    console.log('Limpeza e reconciliação concluídas');
  }
};

