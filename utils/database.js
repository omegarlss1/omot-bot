const mongoose = require('mongoose');

const gatilhoSchema = new mongoose.Schema({
  canalId: { type: String, required: true, unique: true },
  tipo: { type: String, enum: ['sideswipe', 'diversos'], default: 'sideswipe' }
});

const Gatilho = mongoose.model('Gatilho', gatilhoSchema);

async function conectarBD() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  }
}

async function salvarGatilho(canalId, tipo) {
  if (!canalId) throw new Error('ID do canal é obrigatório.');
  await conectarBD();
  // Força remoção de índices legados problemáticos
  await Gatilho.collection.dropIndexes().catch(() => {});
  await Gatilho.updateOne({ canalId }, { canalId, tipo }, { upsert: true });
}

async function carregarGatilhos(client) {
  try {
    await conectarBD();
    // Limpa documentos corrompidos antigos
    await Gatilho.deleteMany({ $or: [{ canalId: null }, { canalId: { $exists: false } }] });
    
    const gatilhos = await Gatilho.find({});
    client.gatilhosConfig = new Map(); // Guarda canalId -> tipo
    
    gatilhos.forEach(g => {
      if (g.canalId) {
        client.canaisGatilho.add(g.canalId);
        client.gatilhosConfig.set(g.canalId, g.tipo || 'sideswipe');
      }
    });
    console.log(`✅ Gatilhos carregados: ${client.canaisGatilho.size}`);
  } catch (err) {
    console.error('❌ Erro ao carregar gatilhos:', err.message);
  }
}

module.exports = { salvarGatilho, carregarGatilhos };