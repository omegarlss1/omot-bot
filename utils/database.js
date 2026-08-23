const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../database.json');

function load() {
  try {
    if (!fs.existsSync(file)) return { gatilhos: [], calls: {} };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // garante retrocompatibilidade se o arquivo antigo não tinha "calls"
    if (!data.calls) data.calls = {};
    return data;
  } catch {
    return { gatilhos: [], calls: {} };
  }
}

function save(data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Erro ao salvar database.json:', e);
  }
}

// --- Helpers específicos pra calls temporárias, pra não espalhar load/save por todo lado ---

function salvarCall(callId, dados) {
  const db = load();
  db.calls[callId] = dados;
  save(db);
}

function removerCall(callId) {
  const db = load();
  delete db.calls[callId];
  save(db);
}

module.exports = { load, save, salvarCall, removerCall };
