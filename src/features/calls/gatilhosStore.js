const Gatilho = require('../../db/models/gatilho');

class GatilhosStore {
  constructor() {
    this.canais = new Set();
    this.configPorCanal = new Map();
  }

  async load() {
    await Gatilho.deleteMany({ $or: [{ canalId: null }, { canalId: { $exists: false } }] });
    const gatilhos = await Gatilho.find({});

    this.canais.clear();
    this.configPorCanal.clear();

    for (const gatilho of gatilhos) {
      if (!gatilho.canalId) continue;
      this.canais.add(gatilho.canalId);
      this.configPorCanal.set(gatilho.canalId, gatilho.tipo || 'sideswipe');
    }

    console.log(`✅ Gatilhos carregados: ${this.canais.size}`);
  }

  has(canalId) {
    return this.canais.has(canalId);
  }

  tipo(canalId) {
    return this.configPorCanal.get(canalId) || 'sideswipe';
  }

  async salvar(canalId, tipo) {
    if (!canalId) throw new Error('ID do canal é obrigatório.');
    await Gatilho.updateOne({ canalId }, { canalId, tipo }, { upsert: true });
    this.canais.add(canalId);
    this.configPorCanal.set(canalId, tipo);
  }
}

module.exports = { GatilhosStore };
