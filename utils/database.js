const mongoose = require('mongoose');

const gatilhoSchema = new mongoose.Schema({
  canalId: { type: String, required: true, unique: true }
});

const Gatilho = mongoose.model('Gatilho', gatilhoSchema);

async function conectarBD() {
  if (mongoose.connection.readyState === 0) {
    console.log('🍃 Conectando ao MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('🍃 Banco de dados MongoDB conectado!');
  }
}

async function salvarGatilho(canalId) {
  if (!canalId) throw new Error('ID do canal não informado.');
  await conectarBD();
  // Busca por { canalId } e atualiza com { canalId }
  await Gatilho.updateOne({ canalId }, { canalId }, { upsert: true });
}

async function carregarGatilhos(client) {
  try {
    await conectarBD();
    // Limpa registros nulos antes de carregar
    await Gatilho.deleteMany({ canalId: null });
    
    const gatilhos = await Gatilho.find({});
    gatilhos.forEach(g => {
      if (g.canalId) client.canaisGatilho.add(g.canalId);
    });
    console.log(`✅ Gatilhos carregados do MongoDB: ${client.canaisGatilho.size}`);
  } catch (err) {
    console.error('❌ Erro ao carregar gatilhos do MongoDB:', err.message);
  }
}

module.exports = { salvarGatilho, carregarGatilhos };