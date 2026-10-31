const Partida = require('../../../db/models/partida');
const Time = require('../../../db/models/time');
const Campeonato = require('../../../db/models/campeonato');
const { emitir, EVENTOS } = require('../events');
const { renderSingleBracketPng } = require('./canvasBracket');
const {
  normalizarFormato,
  minimoTimesFormato,
  validarQuantidadeTimes,
  gerarPlanoFormato,
  criarEliminatoriaSimples
} = require('./formatos');

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
  const timesComBye = embaralhado.slice(0, numByes);
  const timesSemBye = embaralhado.slice(numByes);
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
  const r2TotalSlots = nextPow2 / 2;
  const r2MatchCount = nextPow2 / 4;
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
  let currentRound = 3;
  let matchesInPrevRound = r2MatchCount;
  while (matchesInPrevRound > 1) {
    const matchesThisRound = matchesInPrevRound / 2;
    for (let i = 0; i < matchesThisRound; i++) {
      partidas.push({
        rodada: currentRound,
        fase: currentRound === Math.log2(nextPow2) ? 'FINAL' : `R${currentRound}`,
        timeA: null,
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
  return {
    inicio: new Date(inicioPartida.getTime() - 5 * 60 * 1000),
    fim: new Date(inicioPartida.getTime() + 5 * 60 * 1000)
  };
}

function ehModoDuplasMescladas(modo) {
  return ['4v4', '6v6', '8v8', '10v10', '12v12'].includes(modo);
}

function obterFormatoCampeonato(campeonato) {
  return normalizarFormato(campeonato.modalidade || campeonato.formato || 'single');
}

function validarTimesDoFormato(campeonato, times) {
  const formato = obterFormatoCampeonato(campeonato);
  if (!formato) throw new BracketError('Formato de campeonato desconhecido.', 'BRACKET_FORMAT_UNSUPPORTED');
  if (campeonato.baseadoEmInscricoes === false
    && (!Number.isSafeInteger(campeonato.limiteInscricoes)
      || campeonato.limiteInscricoes < minimoTimesFormato(formato))) {
    throw new BracketError(
      `🔴 Defina um limite de pelo menos ${minimoTimesFormato(formato)} times antes de gerar a chave.`,
      'BRACKET_LIMITE_INVALIDO'
    );
  }
  if (!validarQuantidadeTimes(formato, times.length)) {
    const minimo = minimoTimesFormato(formato);
    throw new BracketError(
      `🔴 O formato selecionado exige no mínimo ${minimo} times; há ${times.length} inscritos.`,
      'BRACKET_MIN_TIMES'
    );
  }
  if (campeonato.baseadoEmInscricoes === false
    && campeonato.limiteInscricoes
    && times.length > campeonato.limiteInscricoes) {
    throw new BracketError('O total de times excede o limite definido para as inscrições.', 'BRACKET_LIMITE_EXCEDIDO');
  }
  return formato;
}

async function resolverGuildId(campeonato) {
  if (campeonato.guildId) return campeonato.guildId;
  if (campeonato.eventoId) {
    const Evento = require('../../../db/models/evento');
    const evento = await Evento.findById(campeonato.eventoId).lean();
    if (evento?.guildId) return evento.guildId;
  }
  throw new BracketError('guildId não encontrado no campeonato nem no evento.', 'BRACKET_GUILD_MISSING');
}

function origemPersistida(origem, idsPartidas) {
  if (origem.tipo === 'time') return { tipo: 'time', timeId: origem.timeId };
  const partidaId = idsPartidas.get(origem.matchKey);
  if (!partidaId) throw new BracketError('Plano de avanço inválido: partida de origem ausente.', 'BRACKET_INVALID_ADVANCEMENT');
  return { tipo: origem.tipo, partidaId };
}

function montarDuelos(timeA, timeB) {
  const duplasA = gerarDuplas(timeA.jogadores || []);
  const duplasB = gerarDuplas(timeB.jogadores || []);
  const totalDuplas = Math.min(duplasA.length, duplasB.length);
  const duplasAPareadas = embaralhar(duplasA).slice(0, totalDuplas);
  const duplasBPareadas = embaralhar(duplasB).slice(0, totalDuplas);
  return duplasAPareadas.map((duplaA, indice) => ({
    duplaA,
    duplaB: duplasBPareadas[indice],
    placarA: null,
    placarB: null,
    vencedorLado: null,
    foiWO: false
  }));
}

async function criarDuelosPartida(modo, timeAId, timeBId, timesPorId = null) {
  if (!timeAId || !timeBId || !ehModoDuplasMescladas(modo)) return [];
  let timeA = timesPorId?.get(String(timeAId));
  let timeB = timesPorId?.get(String(timeBId));
  if (!timeA || !timeB) {
    [timeA, timeB] = await Promise.all([
      Time.findById(timeAId).lean(),
      Time.findById(timeBId).lean()
    ]);
  }
  if (!timeA || !timeB) throw new BracketError('Não foi possível carregar os times para montar as duplas.', 'BRACKET_TIMES_NAO_ENCONTRADOS');
  return montarDuelos(timeA, timeB);
}

async function persistirPlano({
  campeonato,
  guildId,
  nodes,
  formato,
  notificarCriacao = false,
  baseStartAt = null
}) {
  const idsPartidas = new Map();
  const partidasPorChave = new Map();
  const inicioBase = new Date(baseStartAt || campeonato.dataEvento || campeonato.startAt || Date.now());
  const intervaloMs = Number(campeonato.intervaloPartidasMin || 20) * 60 * 1000;
  let timesPorId = null;
  if (ehModoDuplasMescladas(campeonato.modo)) {
    const idsTimes = [...new Set(nodes.flatMap((node) =>
      [node.sourceA, node.sourceB]
        .filter((origem) => origem.tipo === 'time')
        .map((origem) => String(origem.timeId))
    ))];
    const times = await Time.find({ _id: { $in: idsTimes } }).lean();
    timesPorId = new Map(times.map((time) => [String(time._id), time]));
  }

  for (const node of nodes) {
    const estimatedStartAt = new Date(inicioBase.getTime() + Math.max(0, node.rodadaAgendada - 1) * intervaloMs);
    const sourceA = origemPersistida(node.sourceA, idsPartidas);
    const sourceB = origemPersistida(node.sourceB, idsPartidas);
    const partida = await Partida.create({
      guildId,
      campeonatoId: campeonato._id,
      fase: node.fase,
      rodada: node.rodada,
      timeA: sourceA.tipo === 'time' ? sourceA.timeId : null,
      timeB: sourceB.tipo === 'time' ? sourceB.timeId : null,
      estimatedStartAt,
      janelaCheckIn: gerarJanelaCheckIn(node, estimatedStartAt),
      status: 'AGUARDANDO_CHECKIN',
      duelos: await criarDuelosPartida(
        campeonato.modo,
        sourceA.tipo === 'time' ? sourceA.timeId : null,
        sourceB.tipo === 'time' ? sourceB.timeId : null,
        timesPorId
      ),
      bracketMeta: {
        formato,
        modo: campeonato.modo,
        grupo: node.grupo,
        canalFase: node.canalFase,
        matchKey: node.key,
        sourceA,
        sourceB,
        destinations: {}
      }
    });
    idsPartidas.set(node.key, partida._id);
    partidasPorChave.set(node.key, partida);
  }

  for (const node of nodes) {
    const destinoId = idsPartidas.get(node.key);
    for (const [slot, origem] of [['A', node.sourceA], ['B', node.sourceB]]) {
      if (origem.tipo !== 'vencedor' && origem.tipo !== 'perdedor') continue;
      const fonte = partidasPorChave.get(origem.matchKey);
      if (!fonte) throw new BracketError('Plano de avanço inválido: partida de origem ausente.', 'BRACKET_INVALID_ADVANCEMENT');
      fonte.bracketMeta.destinations[origem.tipo] = { partidaId: destinoId, slot };
    }
  }
  for (const partida of partidasPorChave.values()) {
    partida.markModified('bracketMeta');
    await partida.save();
  }
  for (const partida of partidasPorChave.values()) {
    emitir(EVENTOS.PARTIDA_CRIADA, { partidaId: partida._id, fase: partida.fase });
    if (notificarCriacao) emitir(EVENTOS.PARTIDA_ATUALIZADA, { partidaId: partida._id });
  }
  return [...partidasPorChave.values()];
}

async function gerarBracket(campeonatoId, { shuffle = true } = {}) {
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato) throw new BracketError('Campeonato não encontrado.', 'BRACKET_CAMP_NAO_ENCONTRADO');
  const guildId = await resolverGuildId(campeonato);
  const timesInscritos = await Time.find({ campeonatoId }).lean();
  const formato = validarTimesDoFormato(campeonato, timesInscritos);
  if (await Partida.findOne({ campeonatoId })) {
    throw new BracketError('Já existem partidas neste campeonato. Limpe as partidas antes de gerar outra chave.', 'BRACKET_JA_EXISTE');
  }
  const times = shuffle ? embaralhar(timesInscritos) : timesInscritos;
  const nodes = gerarPlanoFormato(formato, times);
  const partidas = await persistirPlano({ campeonato, guildId, nodes, formato });
  if (formato === 'grupos-mata-mata') {
    await Campeonato.updateOne(
      { _id: campeonatoId },
      { $set: { 'bracket.gruposAvancados': false, 'bracket.gruposAvancando': false } }
    );
  }
  const canvas = formato === 'single' && times.length <= 16
    ? await renderSingleBracketPng({
      times,
      incluirTerceiroLugar: campeonato.temTerceiroLugar !== false,
      baseadoEmInscricoes: campeonato.baseadoEmInscricoes !== false,
      limite: campeonato.limiteInscricoes || null,
      horarioInicio: campeonato.dataEvento || campeonato.horarioInicio || null,
      intervaloPartidasMin: campeonato.intervaloPartidasMin || 20
    })
    : null;
  return { totalPartidas: partidas.length, partidas, canvas, formato };
}

async function previewBracket(campeonatoId) {
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato) throw new BracketError('Campeonato não encontrado.', 'BRACKET_CAMP_NAO_ENCONTRADO');
  const times = await Time.find({ campeonatoId }).lean();
  const formato = validarTimesDoFormato(campeonato, times);
  const nodes = gerarPlanoFormato(formato, times);
  const inicioBase = new Date(campeonato.dataEvento || campeonato.startAt || Date.now());
  const intervaloMs = Number(campeonato.intervaloPartidasMin || 20) * 60 * 1000;
  const nomes = new Map(times.map((time) => [String(time._id), time.nome || 'Time sem nome']));
  const previewPartidas = nodes.slice(0, 12).map((node, index) => ({
    index: index + 1,
    rodada: node.rodada,
    fase: node.fase,
    timeA: node.sourceA.tipo === 'time' ? nomes.get(String(node.sourceA.timeId)) : 'A definir',
    timeB: node.sourceB.tipo === 'time' ? nomes.get(String(node.sourceB.timeId)) : 'A definir',
    estimatedStartAt: new Date(inicioBase.getTime() + Math.max(0, node.rodadaAgendada - 1) * intervaloMs)
  }));
  const totalPartidas = nodes.length + (formato === 'grupos-mata-mata' ? 7 : 0);
  const canvas = formato === 'single' && times.length <= 16
    ? await renderSingleBracketPng({
      times,
      incluirTerceiroLugar: campeonato.temTerceiroLugar !== false,
      baseadoEmInscricoes: campeonato.baseadoEmInscricoes !== false,
      limite: campeonato.limiteInscricoes || null,
      horarioInicio: campeonato.dataEvento || campeonato.horarioInicio || null,
      intervaloPartidasMin: campeonato.intervaloPartidasMin || 20
    })
    : null;
  return {
    totalPartidas,
    partidas: previewPartidas,
    partidasExibidas: previewPartidas.length,
    canvas,
    formato,
    modo: campeonato.modo,
    intervalo: campeonato.intervaloPartidasMin || 20
  };
}

function calcularClassificacaoGrupos(partidas) {
  const grupos = { A: new Map(), B: new Map(), C: new Map(), D: new Map() };
  const partidasPorGrupo = { A: [], B: [], C: [], D: [] };
  function resultadoPartida(partida) {
    const texto = String(partida.placarEnviado?.timeA?.placar || partida.placarEnviado?.timeB?.placar || '');
    const placar = texto.match(/^(\d+)\s*[xX]\s*(\d+)$/);
    if (partida.status === 'WO') {
      const golsA = String(partida.vencedorId) === String(partida.timeA) ? 1 : 0;
      return { golsA, golsB: 1 - golsA, vencedorId: partida.vencedorId };
    }
    if (!placar) {
      const vencedorId = partida.vencedorId || null;
      if (!vencedorId) return { golsA: 0, golsB: 0, vencedorId: null };
      const golsA = String(vencedorId) === String(partida.timeA) ? 1 : 0;
      return { golsA, golsB: 1 - golsA, vencedorId };
    }
    const golsA = Number(placar[1]);
    const golsB = Number(placar[2]);
    return {
      golsA,
      golsB,
      vencedorId: golsA === golsB ? null : golsA > golsB ? partida.timeA : partida.timeB
    };
  }
  function entrada(grupo, timeId) {
    const id = String(timeId);
    if (!grupos[grupo].has(id)) {
      grupos[grupo].set(id, {
        timeId,
        pontos: 0,
        golsFeitos: 0,
        golsSofridos: 0,
        vitorias: 0,
        woTomados: 0
      });
    }
    return grupos[grupo].get(id);
  }
  for (const partida of partidas) {
    const grupo = String(partida.fase).slice(-1);
    if (!partidasPorGrupo[grupo]) continue;
    partidasPorGrupo[grupo].push(partida);
    const a = entrada(grupo, partida.timeA);
    const b = entrada(grupo, partida.timeB);
    const { golsA, golsB, vencedorId } = resultadoPartida(partida);
    a.golsFeitos += golsA;
    a.golsSofridos += golsB;
    b.golsFeitos += golsB;
    b.golsSofridos += golsA;
    if (partida.status === 'WO') {
      if (String(vencedorId) === String(partida.timeA)) {
        a.pontos += 3;
        a.vitorias++;
        b.woTomados++;
      } else {
        b.pontos += 3;
        b.vitorias++;
        a.woTomados++;
      }
    } else if (golsA === golsB) {
      a.pontos++;
      b.pontos++;
    } else if (golsA > golsB) {
      a.pontos += 3;
      a.vitorias++;
    } else {
      b.pontos += 3;
      b.vitorias++;
    }
  }
  function desempateLocal(a, b) {
    return a.woTomados - b.woTomados
      || (b.golsFeitos - b.golsSofridos) - (a.golsFeitos - a.golsSofridos)
      || b.golsFeitos - a.golsFeitos
      || String(a.timeId).localeCompare(String(b.timeId));
  }
  function ordenarGrupo(tabela, jogos) {
    const ordenado = [...tabela.values()].sort((a, b) =>
      b.pontos - a.pontos || b.vitorias - a.vitorias
    );
    const resultado = [];
    for (let inicio = 0; inicio < ordenado.length;) {
      let fim = inicio + 1;
      while (fim < ordenado.length
        && ordenado[fim].pontos === ordenado[inicio].pontos
        && ordenado[fim].vitorias === ordenado[inicio].vitorias) fim++;
      const empatados = ordenado.slice(inicio, fim);
      if (empatados.length === 2) {
        const [a, b] = empatados;
        const confronto = jogos.find((partida) =>
          [String(partida.timeA), String(partida.timeB)].includes(String(a.timeId))
          && [String(partida.timeA), String(partida.timeB)].includes(String(b.timeId))
        );
        if (confronto) {
          const resultadoConfronto = resultadoPartida(confronto);
          if (String(resultadoConfronto.vencedorId) === String(b.timeId)) empatados.reverse();
          else if (String(resultadoConfronto.vencedorId) !== String(a.timeId)) empatados.sort(desempateLocal);
        } else {
          empatados.sort(desempateLocal);
        }
      } else if (empatados.length > 2) {
        const idsEmpatados = new Set(empatados.map((time) => String(time.timeId)));
        const miniTabela = new Map(empatados.map((time) => [String(time.timeId), { pontos: 0, vitorias: 0 }]));
        jogos.filter((partida) =>
          idsEmpatados.has(String(partida.timeA)) && idsEmpatados.has(String(partida.timeB))
        ).forEach((partida) => {
          const r = resultadoPartida(partida);
          const ladoA = miniTabela.get(String(partida.timeA));
          const ladoB = miniTabela.get(String(partida.timeB));
          if (partida.status === 'WO') {
            const vencedor = miniTabela.get(String(r.vencedorId));
            const perdedor = String(r.vencedorId) === String(partida.timeA) ? ladoB : ladoA;
            vencedor.pontos += 3;
            vencedor.vitorias++;
            perdedor.pontos += 0;
          } else if (r.golsA === r.golsB) {
            ladoA.pontos++;
            ladoB.pontos++;
          } else {
            const vencedor = r.golsA > r.golsB ? ladoA : ladoB;
            vencedor.pontos += 3;
            vencedor.vitorias++;
          }
        });
        empatados.sort((a, b) => {
          const miniA = miniTabela.get(String(a.timeId));
          const miniB = miniTabela.get(String(b.timeId));
          return miniB.pontos - miniA.pontos
            || miniB.vitorias - miniA.vitorias
            || desempateLocal(a, b);
        });
      } else {
        empatados.sort(desempateLocal);
      }
      resultado.push(...empatados);
      inicio = fim;
    }
    return resultado;
  }
  return Object.fromEntries(Object.entries(grupos).map(([nome, tabela]) => [
    nome,
    ordenarGrupo(tabela, partidasPorGrupo[nome])
  ]));
}

async function criarFinalReset(partida) {
  const jaExiste = await Partida.findOne({ campeonatoId: partida.campeonatoId, fase: 'GRAND_FINAL_RESET' });
  if (jaExiste) return jaExiste;
  const campeonato = await Campeonato.findById(partida.campeonatoId).lean();
  if (!campeonato) throw new BracketError('Campeonato não encontrado ao criar a final de reset.', 'BRACKET_CAMP_NAO_ENCONTRADO');
  const startAt = new Date(Date.now() + Number(campeonato.intervaloPartidasMin || 20) * 60 * 1000);
  const reset = await Partida.create({
    guildId: partida.guildId,
    campeonatoId: partida.campeonatoId,
    fase: 'GRAND_FINAL_RESET',
    rodada: partida.rodada + 1,
    timeA: partida.timeA,
    timeB: partida.timeB,
    estimatedStartAt: startAt,
    janelaCheckIn: gerarJanelaCheckIn(partida, startAt),
    status: 'AGUARDANDO_CHECKIN',
    duelos: await criarDuelosPartida(campeonato.modo, partida.timeA, partida.timeB),
    bracketMeta: {
      formato: 'double',
      modo: campeonato.modo,
      canalFase: 'final',
      sourceA: { tipo: 'time', timeId: partida.timeA },
      sourceB: { tipo: 'time', timeId: partida.timeB },
      destinations: {}
    }
  });
  emitir(EVENTOS.PARTIDA_CRIADA, { partidaId: reset._id, fase: reset.fase });
  emitir(EVENTOS.PARTIDA_ATUALIZADA, { partidaId: reset._id });
  return reset;
}

async function propagarResultadoPartida(partidaId) {
  const partida = await Partida.findById(partidaId);
  if (!partida || !['FINALIZADA', 'WO'].includes(partida.status) || !partida.vencedorId) return [];
  const perdedorId = String(partida.timeA) === String(partida.vencedorId) ? partida.timeB : partida.timeA;
  const atualizadas = [];

  for (const tipo of ['vencedor', 'perdedor']) {
    const destino = partida.bracketMeta?.destinations?.[tipo];
    const timeId = tipo === 'vencedor' ? partida.vencedorId : perdedorId;
    if (!destino || !timeId) continue;
    const proxima = await Partida.findById(destino.partidaId);
    if (!proxima) throw new BracketError('Partida de avanço não encontrada.', 'BRACKET_ADVANCEMENT_TARGET_MISSING');
    const campo = destino.slot === 'A' ? 'timeA' : 'timeB';
    if (proxima[campo] && String(proxima[campo]) !== String(timeId)
      && (proxima.status !== 'AGUARDANDO_CHECKIN'
        || proxima.checkIns?.timeA?.fez
        || proxima.checkIns?.timeB?.fez)) {
      throw new BracketError('Não é possível alterar o avanço: a próxima partida já começou.', 'BRACKET_ADVANCEMENT_CONFLICT');
    }
    if (!proxima[campo] || String(proxima[campo]) !== String(timeId)) {
      proxima[campo] = timeId;
      if (proxima.timeA && proxima.timeB && !proxima.duelos?.length) {
        proxima.duelos = await criarDuelosPartida(proxima.bracketMeta?.modo, proxima.timeA, proxima.timeB);
      }
      await proxima.save();
      atualizadas.push(proxima);
      emitir(EVENTOS.PARTIDA_ATUALIZADA, { partidaId: proxima._id });
    }
  }

  if (partida.fase === 'GRAND_FINAL' && String(partida.vencedorId) !== String(partida.timeA)) {
    const reset = await criarFinalReset(partida);
    atualizadas.push(reset);
  }

  if (partida.bracketMeta?.formato === 'grupos-mata-mata' && String(partida.fase).startsWith('GRUPO_')) {
    const partidasGrupos = await Partida.find({ campeonatoId: partida.campeonatoId, fase: /^GRUPO_/ }).lean();
    if (partidasGrupos.length && partidasGrupos.every((item) => ['FINALIZADA', 'WO'].includes(item.status))) {
      const claim = await Campeonato.updateOne(
        {
          _id: partida.campeonatoId,
          'bracket.gruposAvancados': { $ne: true },
          'bracket.gruposAvancando': { $ne: true }
        },
        { $set: { 'bracket.gruposAvancando': true } }
      );
      if (claim.modifiedCount) {
        try {
          const tabela = calcularClassificacaoGrupos(partidasGrupos);
          const classificados = [
            tabela.A[0], tabela.B[1], tabela.C[0], tabela.D[1],
            tabela.B[0], tabela.A[1], tabela.D[0], tabela.C[1]
          ]
            .map((time) => ({ _id: time.timeId }));
          const plano = criarEliminatoriaSimples(classificados, {
            fasePrefix: 'KNOCKOUT_',
            canalFase: 'mata-mata'
          });
          const campeonato = await Campeonato.findById(partida.campeonatoId).lean();
          if (!campeonato) throw new BracketError('Campeonato não encontrado ao criar a fase mata-mata.', 'BRACKET_CAMP_NAO_ENCONTRADO');
          const novasPartidas = await persistirPlano({
            campeonato,
            guildId: partida.guildId,
            nodes: plano,
            formato: 'grupos-mata-mata',
            notificarCriacao: true,
            baseStartAt: new Date(Date.now() + Number(campeonato?.intervaloPartidasMin || 20) * 60 * 1000)
          });
          atualizadas.push(...novasPartidas);
          await Campeonato.updateOne(
            { _id: partida.campeonatoId },
            { $set: { 'bracket.gruposAvancados': true, 'bracket.gruposAvancando': false } }
          );
        } catch (error) {
          await Campeonato.updateOne(
            { _id: partida.campeonatoId },
            { $set: { 'bracket.gruposAvancando': false } }
          );
          throw error;
        }
      }
    }
  }
  return atualizadas;
}

module.exports = {
  gerarBracket,
  parearChaves,
  proximaPotenciaDe2,
  BracketError,
  gerarDuplas,
  ehModoDuplasMescladas,
  previewBracket,
  obterFormatoCampeonato,
  validarTimesDoFormato,
  persistirPlano,
  propagarResultadoPartida,
  calcularClassificacaoGrupos
};
