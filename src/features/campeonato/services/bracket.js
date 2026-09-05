const Partida = require('../../../db/models/partida');
const Time = require('../../../db/models/time');
const { emitir, EVENTOS } = require('../events');

class BracketError extends Error {
  constructor(mensagem, code) {
    super(mensagem);
    this.name = 'BracketError';
    this.code = code || 'BRACKET_ERROR';
  }
}

function proximaPotenciaDe2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function embaralhar(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function combinacoes(arr, k) {
  const result = [];
  function combo(start, path) {
    if (path.length === k) {
      result.push([...path]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]);
      combo(i + 1, path);
      path.pop();
    }
  }
  combo(0, []);
  return result;
}

function gerarDuplas(jogadores) {
  const titulares = (jogadores || []).filter((j) => !j.isSubstituto).map((j) => j.userId);
  return combinacoes(titulares, 2);
}

function parearChaves(times, semente = Math.random) {
  const embaralhado = embaralhar(times);
  const total = proximaPotenciaDe2(embaralhado.length);
  const byes = total - embaralhado.length;
  const slots = [...embaralhado, ...Array(byes).fill(null)];
  const partidas = [];
  for (let i = 0; i < slots.length; i += 2) {
    partidas.push({ rodada: 1, fase: 'R1', timeA: slots[i], timeB: slots[i + 1] });
  }
  return partidas;
}

function gerarJanelaCheckIn(partida) {
  const agora = new Date();
  const minutosJanela = 30;
  const inicio = new Date(agora.getTime() + 1000);
  const fim = new Date(agora.getTime() + minutosJanela * 60 * 1000);
  return { inicio, fim };
}

function ehModoDuplasMescladas(modo) {
  return ['4v4', '6v6', '8v8', '10v10', '12v12'].includes(modo);
}

async function gerarBracket(campeonatoId, { shuffle = true } = {}) {
  const times = await Time.find({ campeonatoId }).lean();
  if (times.length < 2) {
    throw new BracketError('Mínimo de 2 times para gerar bracket.', 'BRACKET_MIN_TIMES');
  }

  const existing = await Partida.findOne({ campeonatoId, fase: 'R1' });
  if (existing) {
    throw new BracketError('Bracket R1 já existe. Limpe o campeonato antes de gerar novamente.', 'BRACKET_JA_EXISTE');
  }

  const chavesR1 = parearChaves(times, shuffle ? Math.random : () => 0.5);
  const partidas = [];
  for (const chave of chavesR1) {
    const janela = gerarJanelaCheckIn(chave);
    const timeA = chave.timeA?._id || null;
    const timeB = chave.timeB?._id || null;
    const timeADoc = chave.timeA || null;
    const timeBDoc = chave.timeB || null;
    let duelos = [];
    const modo = timeADoc?.modo || timeBDoc?.modo || null;
    if (timeADoc && timeBDoc && ehModoDuplasMescladas(modo)) {
      const duplasA = gerarDuplas(timeADoc.jogadores || []);
      const duplasB = gerarDuplas(timeBDoc.jogadores || []);
      const totalDuplas = Math.min(duplasA.length, duplasB.length);
      const duplasAPareadas = embaralhar(duplasA).slice(0, totalDuplas);
      const duplasBPareadas = embaralhar(duplasB).slice(0, totalDuplas);
      duelos = duplasAPareadas.map((duplaA, idx) => ({
        duplaA,
        duplaB: duplasBPareadas[idx],
        placarA: null,
        placarB: null,
        vencedorLado: null,
        foiWO: false
      }));
    }
    const p = await Partida.create({
      campeonatoId,
      fase: chave.fase,
      rodada: chave.rodada,
      timeA,
      timeB,
      janelaCheckIn: janela,
      status: 'AGUARDANDO_CHECKIN',
      duelos
    });
    partidas.push(p);
    emitir(EVENTOS.PARTIDA_CRIADA, { partidaId: p._id, fase: chave.fase, duelos: duelos.length });
  }

  return { totalPartidas: partidas.length, partidas };
}

module.exports = { gerarBracket, parearChaves, proximaPotenciaDe2, BracketError, gerarDuplas, ehModoDuplasMescladas };
