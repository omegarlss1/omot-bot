const { Gatilho, Call } = require('../models/Database');

async function carregarGatilhos() {
  try {
    const docs = await Gatilho.find();
    return docs.map(d => d.channelId);
  } catch (e) {
    console.error('Erro ao carregar gatilhos:', e);
    return [];
  }
}

async function salvarGatilho(channelId) {
  try {
    await Gatilho.updateOne({ channelId }, { channelId }, { upsert: true });
  } catch (e) {
    console.error('Erro ao salvar gatilho:', e);
  }
}

async function carregarCalls() {
  try {
    const docs = await Call.find();
    const map = new Map();
    docs.forEach(doc => map.set(doc.callId, { dono: doc.dono, donoNome: doc.donoNome, game: doc.game }));
    return map;
  } catch (e) {
    console.error('Erro ao carregar calls:', e);
    return new Map();
  }
}

async function salvarCall(callId, dados) {
  try {
    await Call.updateOne({ callId }, { ...dados, callId }, { upsert: true });
  } catch (e) {
    console.error('Erro ao salvar call:', e);
  }
}

async function removerCall(callId) {
  try {
    await Call.deleteOne({ callId });
  } catch (e) {
    console.error('Erro ao remover call:', e);
  }
}

module.exports = { carregarGatilhos, salvarGatilho, carregarCalls, salvarCall, removerCall };

