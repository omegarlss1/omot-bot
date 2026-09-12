function escapeXml(value) {
  return String(value || '').replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]));
}

function proximaPotenciaDe2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function calcularBracketLayout(totalTimes) {
  const N = totalTimes;
  const nextPow2 = proximaPotenciaDe2(N);
  const numByes = nextPow2 - N;
  const r1Matches = Math.floor((N - numByes) / 2);
  const r2Matches = nextPow2 / 2;
  const rounds = Math.log2(nextPow2);
  
  const layout = [];
  const larguraPartida = 220;
  const alturaPartida = 58;
  const espacoEntreRounds = 80;
  const inicioX = 50;
  const alturaTotal = 600;
  const margemSuperior = 100;

  // R1: only matches between non-BYE teams
  if (r1Matches > 0) {
    const posicoes = [];
    for (let p = 0; p < r1Matches; p++) {
      const espaco = alturaTotal / (r1Matches + 1);
      const y = margemSuperior + espaco * (p + 1) - alturaPartida / 2;
      posicoes.push({ x: inicioX, y, largura: larguraPartida, altura: alturaPartida });
    }
    layout.push({ nome: 'R1', x: inicioX, partidas: posicoes });
  }

  // R2 and beyond
  for (let r = 1; r < rounds; r++) {
    const partidas = nextPow2 / (2 ** (r + 1));
    const x = inicioX + r * (larguraPartida + espacoEntreRounds);
    const posicoes = [];
    for (let p = 0; p < partidas; p++) {
      const espaco = alturaTotal / (partidas + 1);
      const y = margemSuperior + espaco * (p + 1) - alturaPartida / 2;
      posicoes.push({ x, y, largura: larguraPartida, altura: alturaPartida });
    }
    layout.push({
      nome: r === rounds - 1 ? 'FINAL' : `R${r + 1}`,
      x,
      partidas: posicoes
    });
  }
  return layout;
}

function buildSvgString({ times = [], incluirTerceiroLugar = true, baseadoEmInscricoes = true, limite = null, horarioInicio = null, intervaloPartidasMin = 20 } = {}) {
  const total = Math.max(2, Math.min(16, times.length));
  const isPotencia2 = total > 0 && (total & (total - 1)) === 0;
  const nextPow2 = isPotencia2 ? total : proximaPotenciaDe2(total);
  const numByes = nextPow2 - total;
  const r2MatchCount = nextPow2 / 2;

  const nomes = times.slice(0, 16).map((time) => {
    const primeiroJogador = (time.jogadores && time.jogadores[0]) || {};
    const origem = primeiroJogador.origem;
    const ehManual = origem === 'WHATSAPP' || String(primeiroJogador.userId || '').startsWith('MANUAL_WHATSAPP_');
    if (ehManual) {
      return escapeXml(primeiroJogador.nickSnapshot || time.nome || 'TBD');
    }
    return escapeXml(time.nome || 'TBD');
  });

  if (!baseadoEmInscricoes && limite && !isPotencia2) {
    throw new Error(`Limite é ${limite} mas tem ${total} inscritos. Remova o excedente.`);
  }

  // Shuffle for display (same seed as bracket for consistency)
  const shuffled = [...nomes].sort(() => Math.random() - 0.5);
  
  // BYE teams (top seeds) advance directly to R2
  const timesComBye = shuffled.slice(0, numByes);
  const timesSemBye = shuffled.slice(numByes);
  
  // R1 slots: only non-BYE teams
  const r1Slots = [...timesSemBye];
  while (r1Slots.length < (total - numByes)) r1Slots.push('TBD');
  
  // R2 slots: BYE teams + R1 winners (TBD)
  const r2Slots = [...timesComBye];
  while (r2Slots.length < r2MatchCount) r2Slots.push('TBD');

  const layout = calcularBracketLayout(total);
  const linhas = [];
  const cores = ['#00c2ff', '#7c3aed', '#f59e0b', '#ef4444', '#22c55e'];
  const larguraSvg = layout[layout.length - 1].x + 300;
  const alturaSvg = 720;

  linhas.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${larguraSvg}" height="${alturaSvg}" viewBox="0 0 ${larguraSvg} ${alturaSvg}">`);
  linhas.push('<rect width="100%" height="100%" fill="#111827"/>');
  linhas.push('<text x="50" y="48" fill="#ffffff" font-family="Arial" font-size="28" font-weight="700">Ômega - Single Elimination</text>');

  const horarioBase = horarioInicio ? new Date(horarioInicio) : null;
  let indexPartidaR1 = 0;

  for (let r = 0; r < layout.length; r++) {
    const round = layout[r];
    const cor = cores[r % cores.length];
    linhas.push(`<text x="${round.x}" y="88" fill="${cor}" font-family="Arial" font-size="20" font-weight="700">${round.nome}</text>`);

    for (let p = 0; p < round.partidas.length; p++) {
      const pos = round.partidas[p];
      
      let nomeA, nomeB;
      if (r === 0) {
        // R1: from r1Slots
        const idxA = p * 2;
        const idxB = p * 2 + 1;
        nomeA = r1Slots[idxA] || 'TBD';
        nomeB = r1Slots[idxB] || 'TBD';
      } else if (r === 1) {
        // R2: from r2Slots
        const idxA = p;
        const idxB = p + r2MatchCount;
        if (idxA < r2Slots.length) {
          nomeA = r2Slots[idxA] || 'TBD';
        } else {
          nomeA = 'Vencedor R1 ' + (p * 2 + 1);
        }
        if (idxB < r2Slots.length) {
          nomeB = r2Slots[idxB] || 'TBD';
        } else {
          nomeB = 'Vencedor R1 ' + (p * 2 + 2);
        }
      } else {
        // Later rounds
        nomeA = 'Vencedor ' + layout[r - 1].nome + ' ' + (p * 2 + 1);
        nomeB = 'Vencedor ' + layout[r - 1].nome + ' ' + (p * 2 + 2);
      }

      linhas.push(`<rect x="${pos.x}" y="${pos.y}" width="${pos.largura}" height="${pos.altura}" rx="6" fill="#1f2937" stroke="${cor}"/>`);
      linhas.push(`<text x="${pos.x + 12}" y="${pos.y + 24}" fill="#ffffff" font-family="Arial" font-size="16">${nomeA}</text>`);
      linhas.push(`<text x="${pos.x + 12}" y="${pos.y + 47}" fill="#d1d5db" font-family="Arial" font-size="16">${nomeB}</text>`);

      if (r === 0 && horarioBase) {
        const minutos = indexPartidaR1 * intervaloPartidasMin;
        const h = new Date(horarioBase.getTime() + minutos * 60 * 1000);
        const horarioStr = String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0');
        linhas.push(`<text x="${pos.x}" y="${pos.y + 68}" fill="#9ca3af" font-family="Arial" font-size="12">${horarioStr}</text>`);
        indexPartidaR1++;
      }

      if (r < layout.length - 1) {
        const proximoRound = layout[r + 1];
        const posProxima = proximoRound.partidas[Math.floor(p / 2)];
        const midX = pos.x + pos.largura + 30;
        const y1 = pos.y + pos.altura / 2;
        const y2 = posProxima.y + posProxima.altura / 2;
        const xFinal = posProxima.x;
        linhas.push(`<path d="M ${pos.x + pos.largura} ${y1} H ${midX} V ${y2} H ${xFinal}" fill="none" stroke="#6b7280" stroke-width="2"/>`);
      }
    }
  }

  if (incluirTerceiroLugar && total >= 4) {
    const finalPos = layout[layout.length - 1].partidas[0];
    const terceiroY = finalPos.y + 140;
    linhas.push(`<rect x="${larguraSvg - 300}" y="${terceiroY}" width="240" height="70" rx="6" fill="#1f2937" stroke="${cores[4] || '#f59e0b'}"/>`);
    linhas.push(`<text x="${larguraSvg - 285}" y="${terceiroY + 28}" fill="${cores[4] || '#f59e0b'}" font-family="Arial" font-size="17" font-weight="700">TERCEIRO LUGAR</text>`);
    linhas.push(`<text x="${larguraSvg - 285}" y="${terceiroY + 53}" fill="#d1d5db" font-family="Arial" font-size="15">Perdedores das semifinais</text>`);
  }
  linhas.push('</svg>');
  return linhas.join('');
}

function renderSingleBracketCanvas({ times = [], incluirTerceiroLugar = true } = {}) {
  const svg = buildSvgString({ times, incluirTerceiroLugar });
  return Buffer.from(svg, 'utf8');
}

async function renderSingleBracketPng({ times = [], incluirTerceiroLugar = true, baseadoEmInscricoes = true, limite = null, horarioInicio = null, intervaloPartidasMin = 20 } = {}) {
  const sharp = require('sharp');
  const svg = buildSvgString({ times, incluirTerceiroLugar, baseadoEmInscricoes, limite, horarioInicio, intervaloPartidasMin });
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}

module.exports = { renderSingleBracketCanvas, renderSingleBracketPng, escapeXml };
