const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../database.json');

function load() {
  try {
    if (!fs.existsSync(file)) return { gatilhos: [] };
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return { gatilhos: [] }; }
}

function save(data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch(e){ console.error(e); }
}

module.exports = { load, save };