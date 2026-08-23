const { load, salvarCall, removerCall } = require('../utils/database');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`Ômot online como ${client.user.tag}!`);

    const db = load();
    client.canaisGatilho = new Set(db.gatilhos || []);
    client.callsTemporarias = new Map(Object.entries(db.calls || {}));
    console.log(`Gatilhos carregados: ${client.canaisGatilho.size}`);
    console.log(`Calls carregadas do banco: ${client.callsTemporarias.size}`);

    // Limpeza + reconciliação: confere se as calls salvas ainda existem de verdade
    for (const guild of client.guilds.cache.values()) {
      await guild.channels.fetch().catch(() => {});

      for (const canal of guild.channels.cache.values()) {
        const pareceCallTemp = canal.type === 2 && canal.name.includes('|');
        if (!pareceCallTemp) continue;

        if (canal.members.size === 0) {
          // call vazia sobrou de quando o bot caiu -> deleta e limpa do banco
          try {
            await canal.delete('Limpeza de call órfã');
            client.callsTemporarias.delete(canal.id);
            removerCall(canal.id);
            console.log(`Call órfã deletada: ${canal.name}`);
          } catch (e) {}
          continue;
        }

        // Se o banco não tem essa call (ex: canal criado/renomeado manualmente),
        // reconstrói o registro como fallback pelo nome do canal
        if (!client.callsTemporarias.has(canal.id)) {
          const partes = canal.name.split('|');
          const game = partes[0]?.trim() || 'Aguardando jogo';
          const donoNomeBruto = partes[1]?.replace(/\+\d+ Ômigos?/, '').trim() || '';
          const donoAtual = canal.members.first();
          if (donoAtual) {
            const dados = { dono: donoAtual.id, donoNome: donoAtual.displayName || donoNomeBruto, game };
            client.callsTemporarias.set(canal.id, dados);
            salvarCall(canal.id, dados);
          }
        }
      }

      // remove do banco calls que não existem mais no servidor
      for (const callId of [...client.callsTemporarias.keys()]) {
        if (!guild.channels.cache.has(callId)) {
          client.callsTemporarias.delete(callId);
          removerCall(callId);
        }
      }
    }

    console.log('Limpeza e reconciliação concluídas');
  }
};
