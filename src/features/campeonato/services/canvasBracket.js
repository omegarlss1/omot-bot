function escapeXml(value) {
  return String(value || '').replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]));
}

function proximaPotenciaDe2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function buildSvgString({ times = [], incluirTerceiroLugar = true, baseadoEmInscricoes = true, limite = null, horarioInicio = null } = {}) {
  const total = Math.max(2, Math.min(16, times.length));
  const largura = 1500;
  const altura = Math.max(720, total * 70);
  const rodadas = Math.max(1, Math.ceil(Math.log2(total)));
  const nomes = times.slice(0, 16).map((time) => {
    const primeiroJogador = (time.jogadores || [])[0] || {};
    const origem = primeiroJogador.origem;
    const ehManual = origem === 'WHATSAPP' || String(primeiroJogador.userId || '').startsWith('MANUAL_WHATSAPP_');
    if (ehManual) {
      return escapeXml(primeiroJogador.nickSnapshot || time.nome || 'TBD');
    }
    return escapeXml(time.nome || 'TBD');
  });

  if (!baseadoEmInscricoes && limite && total !== proximaPotenciaDe2(total)) {
    throw new Error(`Limite é ${limite} mas tem ${total} inscritos. Remova o excedente.`);
  }

  const slots = [...nomes];
  if (baseadoEmInscricoes) {
    while (slots.length < 2 ** rodadas) slots.push('BYE');
  }

  const linhas = [];
  const espacamento = altura / (slots.length + 1);
  const cores = ['#00c2ff', '#7c3aed', '#f59e0b', '#ef4444', '#22c55e'];

  linhas.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">`);
  linhas.push('<rect width="100%" height="100%" fill="#111827"/>');
  linhas.push('<text x="50" y="48" fill="#ffffff" font-family="Arial" font-size="28" font-weight="700">Ômega - Single Elimination</text>');

  const horarioBase = horarioInicio ? new Date(horarioInicio) : null;
  const indexPartida = { r1: 0 };

  for (let rodada = 0; rodada < rodadas; rodada++) {
    const jogos = Math.max(1, slots.length / (2 ** rodada));
    const x = 50 + rodada * 270;
    const deslocamento = altura / (jogos + 1);
    linhas.push(`<text x="${x}" y="88" fill="${cores[rodada % cores.length]}" font-family="Arial" font-size="20" font-weight="700">${rodada === 0 ? 'R1' : rodada === rodadas - 1 ? 'FINAL' : `R${rodada + 1}`}</text>`);
    for (let jogo = 0; jogo < jogos / 2; jogo++) {
      const y = (jogo * 2 + 1.25) * deslocamento;
      const idxA = jogo * 2;
      const idxB = jogo * 2 + 1;
      const nomeA = rodada === 0 ? (slots[idxA] || 'TBD') : 'TBD';
      const nomeB = rodada === 0 ? (slots[idxB] || 'TBD') : 'TBD';
      linhas.push(`<rect x="${x}" y="${y}" width="220" height="58" rx="6" fill="#1f2937" stroke="${cores[rodada % cores.length]}"/>`);
      linhas.push(`<text x="${x + 12}" y="${y + 24}" fill="#ffffff" font-family="Arial" font-size="16">${nomeA}</text>`);
      linhas.push(`<text x="${x + 12}" y="${y + 47}" fill="#d1d5db" font-family="Arial" font-size="16">${nomeB}</text>`);
      if (rodada === 0 && horarioBase) {
        const minutos = indexPartida.r1 * 30;
        const h = new Date(horarioBase.getTime() + minutos * 60 * 1000);
        const horarioStr = String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0');
        linhas.push(`<text x="${x}" y="${y + 68}" fill="#9ca3af" font-family="Arial" font-size="12">${horarioStr}</text>`);
        indexPartida.r1++;
      }
      if (rodada < rodadas - 1) {
        const proximoX = x + 220;
        linhas.push(`<path d="M ${proximoX} ${y + 29} H ${proximoX + 25} V ${y + deslocamento + 29} H ${proximoX + 50}" fill="none" stroke="#6b7280" stroke-width="2"/>`);
      }
    }
  }

  if (incluirTerceiroLugar) {
    linhas.push(`<rect x="${largura - 300}" y="${altura - 150}" width="240" height="70" rx="6" fill="#1f2937" stroke="${cores[4] || '#f59e0b'}"/>`);
    linhas.push(`<text x="${largura - 285}" y="${altura - 120}" fill="${cores[4] || '#f59e0b'}" font-family="Arial" font-size="17" font-weight="700">TERCEIRO LUGAR</text>`);
    linhas.push(`<text x="${largura - 285}" y="${altura - 95}" fill="#d1d5db" font-family="Arial" font-size="15">Perdedores das semifinais</text>`);
  }
  linhas.push('</svg>');
  return linhas.join('');
}

function renderSingleBracketCanvas({ times = [], incluirTerceiroLugar = true } = {}) {
  const svg = buildSvgString({ times, incluirTerceiroLugar });
  return Buffer.from(svg, 'utf8');
}

async function renderSingleBracketPng({ times = [], incluirTerceiroLugar = true } = {}) {
  const sharp = require('sharp');
  const svg = buildSvgString({ times, incluirTerceiroLugar });
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}

module.exports = { renderSingleBracketCanvas, renderSingleBracketPng, escapeXml };
