const CallTemporaria = require('../../db/models/callTemporaria');

class CallsStore {
  constructor() {
    this.mem = new Map();
  }

  snapshot(channelId) {
    const dados = this.mem.get(channelId);
    return dados ? { ...dados } : null;
  }

  has(channelId) {
    return this.mem.has(channelId);
  }

  get(channelId) {
    return this.mem.get(channelId);
  }

  async load(client) {
    const docs = await CallTemporaria.find({});
    this.mem.clear();

    for (const doc of docs) {
      const channel = await client.channels.fetch(doc.channelId).catch(() => null);
      if (!channel) {
        await CallTemporaria.deleteOne({ channelId: doc.channelId });
        continue;
      }

      if (channel.members.size === 0) {
        await channel.delete().catch(() => {});
        await CallTemporaria.deleteOne({ channelId: doc.channelId });
        continue;
      }

      this.mem.set(doc.channelId, {
        donoId: doc.donoId,
        donoNome: doc.donoNome,
        tipo: doc.tipo,
        jogo: doc.jogo
      });
    }

    console.log(`✅ Calls temporárias restauradas: ${this.mem.size}`);
  }

  async criar(channelId, guildId, dados) {
    await CallTemporaria.updateOne(
      { channelId },
      { channelId, guildId, ...dados },
      { upsert: true }
    );
    this.mem.set(channelId, { ...dados });
  }

  async atualizar(channelId, patch) {
    const atual = this.mem.get(channelId);
    if (!atual) return null;
    await CallTemporaria.updateOne({ channelId }, { $set: patch });
    Object.assign(atual, patch);
    return atual;
  }

  async remover(channelId) {
    await CallTemporaria.deleteOne({ channelId });
    this.mem.delete(channelId);
  }
}

module.exports = { CallsStore };
