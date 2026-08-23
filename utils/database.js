const mongoose = require('mongoose');

const gatilhoSchema = new mongoose.Schema({
  canalId: { type: String, required: true, unique: true }
});

const Gatilho = mongoose.model('Gatilho', gatilhoSchema);

async function conectarBD() {
  if (mongoose.connection.readyState === 0) {
    console.log('🍃 Conectando ao MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000 // Falha rápido em caso de erro de IP
    });
    console.log('🍃 Banco de dados MongoDB conectado!');
  }
}

async function salvarGatilho(canalId) {
  await conectarBD();
  await Gatilho.updateOne({ canalId }, { canalId }, { upsert: true });
}

async function carregarGatilhos(client) {
  try {
    await conectarBD();
    const gatilhos = await Gatilho.find({});
    gatilhos.forEach(g => client.canaisGatilho.add(g.canalId));
    console.log(`✅ Gatilhos carregados do MongoDB: ${gatilhos.length}`);
  } catch (err) {
    console.error('❌ Erro ao carregar gatilhos do MongoDB:', err.message);
  }
}

module.exports = { salvarGatilho, carregarGatilhos };