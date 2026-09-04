const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, 'regulamento.json');
let cache = null;

function carregar() {
  if (cache) return cache;
  const raw = fs.readFileSync(ARQUIVO, 'utf8');
  cache = JSON.parse(raw);
  return cache;
}

function invalidar() {
  cache = null;
}

function get(caminho) {
  const r = carregar();
  return caminho.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), r);
}

module.exports = { carregar, invalidar, get, ARQUIVO };
