const Partida = require('../../../db/models/partida');
const Time = require('../../../db/models/time');
const Campeonato = require('../../../db/models/campeonato');
const { emitir, EVENTOS } = require('../events');
const { renderSingleBracketPng } = require('./canvasBracket');
const { StartGGAdapter } = require('../adapters/StartGGAdapter');

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

function embaralhar(array, semente = Math.random) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(semente() * (i + 1));
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
  const embaralhado = embaralhar(times, semente);
  const N = embaralhado.length;
  if (N < 2) return [];
  
  const nextPow2 = proximaPotenciaDe2(N);
  const numByes = nextPow2 - N;
  
  // Top seeds get BYEs (advance directly to R2)
  const timesComBye = embaralhado.slice(0, numByes);
  const timesSemBye = embaralhado.slice(numByes);
  
  // R1: only teams without BYE play
  const partidas = [];
  for (let i = 0; i < timesSemBye.length; i += 2) {
    partidas.push({ 
      rodada: 1, 
      fase: 'R1', 
      timeA: timesSemBye[i], 
      timeB: timesSemBye[i + 1],
      timeAHasBye: false,
      timeBHasBye: false
    });
  }
  
  // R2: BYE teams + winners from R1 (placeholder for now, will be filled after R1)
  // R2 has nextPow2/2 total slots, paired as nextPow2/4 matches
  const r2TotalSlots = nextPow2 / 2;
  const r2MatchCount = nextPow2 / 4;
  
  // Build R2 slots: BYE teams first, then R1 winners (null placeholders)
  const r2Slots = [...timesComBye];
  while (r2Slots.length < r2TotalSlots) r2Slots.push(null);
  
  for (let i = 0; i < r2MatchCount; i++) {
    const timeA = r2Slots[i];
    const timeB = r2Slots[r2MatchCount + i];
    partidas.push({ 
      rodada: 2, 
      fase: 'R2', 
      timeA, 
      timeB,
      timeAHasBye: !timeA,
      timeBHasBye: !timeB
    });
  }
  
  // Subsequent rounds (semifinals, final, etc.)
  let currentRound = 3;
  let matchesInPrevRound = r2MatchCount;
  while (matchesInPrevRound > 1) {
    const matchesThisRound = matchesInPrevRound / 2;
    for (let i = 0; i < matchesThisRound; i++) {
      partidas.push({ 
        rodada: currentRound, 
        fase: currentRound === Math.log2(nextPow2) ? 'FINAL' : `R${currentRound}`,
        timeA: null, // will be filled by previous round winner
        timeB: null,
        timeAHasBye: false,
        timeBHasBye: false
      });
    }
    matchesInPrevRound = matchesThisRound;
    currentRound++;
  }
  
  return partidas;
}

function gerarJanelaCheckIn(partida, estimatedStartAt = new Date()) {
  const inicioPartida = new Date(estimatedStartAt);
  const inicio = new Date(inicioPartida.getTime() - 5 * 60 * 1000);
  const fim = new Date(inicioPartida.getTime() + 5 * 60 * 1000);
  return { inicio, fim };
}

function ehModoDuplasMescladas(modo) {
  return ['4v4', '6v6', '8v8', '10v10', '12v12'].includes(modo);
}

async function gerarBracket(campeonatoId, { shuffle = true } = {}) {
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato) throw new BracketError('Campeonato não encontrado.', 'BRACKET_CAMP_NAO_ENCONTRADO');
  let guildId = campeonato.guildId;
  if (!guildId && campeonato.eventoId) {
    const Evento = require('../../../db/models/evento');
    const evento = await Evento.findById(campeonato.eventoId).lean();
    guildId = evento?.guildId;
  }
  if (!guildId) throw new BracketError('guildId não encontrado no campeonato nem no evento.', 'BRACKET_GUILD_MISSING');
  const times = await Time.find({ campeonatoId }).lean();
  if (times.length < 2) {
    throw new BracketError('Mínimo de 2 times para gerar bracket.', 'BRACKET_MIN_TIMES');
  }

  const existing = await Partida.findOne({ campeonatoId, fase: 'R1' });
  if (existing) {
    throw new BracketError('Bracket R1 já existe. Limpe o campeonato antes de gerar novamente.', 'BRACKET_JA_EXISTE');
  }

  const isSingle = ['single', '1v1', 'x1', '1x1'].includes(String(campeonato.modalidade || 'single').toLowerCase());
  const isCanvas = times.length <= 16 && isSingle;
  if (isCanvas) {
    console.log(`[Bracket] Usando Canvas para ${times.length} times ${campeonato.modalidade}`);
  } else {
    console.log(`[Bracket] Usando Start.gg para ${times.length} times ${campeonato.modalidade}`);
    if (!campeonato.startgg?.tournamentId) {
      try {
        const adapter = new StartGGAdapter();
        const inicioStartGG = new Date(campeonato.dataEvento || campeonato.startAt || Date.now());
        const torneio = await adapter.createTournament({
          name: campeonato.nome,
          slug: String(campeonato.nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          startAt: Math.floor(inicioStartGG.getTime() / 1000),
          timezone: 'America/Sao_Paulo',
          includeThirdPlace: campeonato.temTerceiroLugar !== false
        });
        if (!torneio?.id) throw new Error('Start.gg não retornou o ID do torneio.');
        const participantes = times.flatMap((time) => (time.jogadores || []).map((jogador) => ({ gamerTag: jogador.nickSnapshot })));
        await adapter.addParticipantsBulk(torneio.id, participantes);
        await Campeonato.updateOne({ _id: campeonatoId }, { $set: {
          'startgg.tournamentId': String(torneio.id),
          'startgg.url': torneio.slug ? `https://start.gg/${torneio.slug}` : null,
          startAt: inicioStartGG
        } });
      } catch (error) {
        console.warn(`[Bracket] Start.gg indisponível, chave gerada localmente: ${error.message}`);
      }
    }
  }

  const todasChaves = parearChaves(times, shuffle ? Math.random : () => 0.5);
  const inicioBase = new Date(campeonato.dataEvento || campeonato.startAt || Date.now());
  const intervaloMs = Number(campeonato.intervaloPartidasMin || 20) * 60 * 1000;
  const partidas = [];
  
  for (const chave of todasChaves) {
    const estimatedStartAt = new Date(inicioBase.getTime() + Math.max(0, chave.rodada - 1) * intervaloMs);
    const janela = gerarJanelaCheckIn(chave, estimatedStartAt);
    
    const timeA = chave.timeA?._id || null;
    const timeB = chave.timeB?._id || null;
    const timeADoc = chave.timeA || null;
    const timeBDoc = chave.timeB || null;
    
    // BYE teams skip check-in entirely
    const isByeMatch = !timeA && !timeB;
    const isPartialBye = (!timeA || !timeB) && (timeA || timeB);
    
    let status = 'AGUARDANDO_CHECKIN';
    if (isByeMatch) {
      status = 'CANCELADA'; // BYE vs BYE shouldn't exist, but safety
    } else if (isPartialBye) {
      status = 'AGUARDANDO_CHECKIN'; // One team has BYE, other needs check-in? Actually BYE team auto-advances
    }
    
    // For R1, all matches have both teams (no BYE in R1)
    // For R2+, some teams are BYE (auto-advance)
    let duelos = [];
    const modo = campeonato.modo;
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
      guildId,
      eventoId: campeonato.eventoId,
      campeonatoId,
      fase: chave.fase,
      rodada: chave.rodada,
      timeA: timeA?._id || null,
      timeB: timeB?._id || null,
      timeAId: timeA?._id || null,
      timeBId: timeB?._id || null,
      estimatedStartAt,
      janelaCheckIn: janela,
      status: status === 'CANCELADA' ? 'CANCELADA' : 'AGUARDANDO_CHECKIN',
      duelos
    });
    partidas.push(p);
    emitir(EVENTOS.PARTIDA_CRIADA, { partidaId: p._id, fase: chave.fase, duelos: duelos.length });
  }

  return {
    totalPartidas: partidas.length,
    partidas,
    canvas: isCanvas ? await renderSingleBracketPng({
      times,
      incluirTerceiroLugar: campeonato.temTerceiroLugar !== false,
      baseadoEmInscricoes: campeonato.baseadoEmInscricoes !== false,
      limite: campeonato.limiteInscricoes || null,
      horarioInicio: campeonato.dataEvento || campeonato.horarioInicio || null,
      intervaloPartidasMin: campeonato.intervaloPartidasMin || 20
    }) : null
  };
}

module.exports = { gerarBracket, parearChaves, proximaPotenciaDe2, BracketError, gerarDuplas, ehModoDuplasMescladas };
