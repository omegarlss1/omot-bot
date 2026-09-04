function parsePlacar(texto) {
  const match = String(texto || '').trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);
  if (!match) return null;
  return { golsA: Number(match[1]), golsB: Number(match[2]) };
}

function placarEhValido(texto) {
  return parsePlacar(texto) !== null;
}

module.exports = { parsePlacar, placarEhValido };
