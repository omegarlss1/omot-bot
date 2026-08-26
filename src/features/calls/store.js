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

      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        ViewChannel: doc.hidden ? false : null
      }).catch(() => {});

      this.mem.set(doc.channelId, {
        donoId: doc.donoId,
        donoNome: doc.donoNome,
        tipo: doc.tipo,
        jogo: doc.jogo,
        hidden: doc.hidden,
        bannedUserIds: [...(doc.bannedUserIds || [])]
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
    this.mem.set(channelId, { hidden: false, bannedUserIds: [], ...dados });
  }

  async atualizar(channelId, patch) {
    const atual = this.mem.get(channelId);
    if (!atual) return null;
    await CallTemporaria.updateOne({ channelId }, { $set: patch });
    Object.assign(atual, patch);
    return atual;
  }

  async buscar(channelId) {
    const doc = await CallTemporaria.findOne({ channelId }).lean();
    if (!doc) return null;

    const dados = {
      donoId: doc.donoId,
      donoNome: doc.donoNome,
      tipo: doc.tipo,
      jogo: doc.jogo,
      hidden: doc.hidden,
      bannedUserIds: [...(doc.bannedUserIds || [])]
    };
    this.mem.set(channelId, dados);
    return dados;
  }

  async remover(channelId) {
    await CallTemporaria.deleteOne({ channelId });
    this.mem.delete(channelId);
  }
}

module.exports = { CallsStore };
