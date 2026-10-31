const FORMATOS = ['single', 'double', 'round-robin', 'grupos-mata-mata'];

function normalizarFormato(formato) {
  const valor = String(formato || '').toLowerCase();
  const aliases = {
    'single-elimination': 'single',
    '1v1': 'single',
    x1: 'single',
    '1x1': 'single',
    single: 'single',
    'double-elimination': 'double',
    double: 'double',
    'round-robin': 'round-robin',
    'grupos-mata-mata': 'grupos-mata-mata'
  };
  return aliases[valor] || null;
}

function minimoTimesFormato(formato) {
  return normalizarFormato(formato) === 'grupos-mata-mata' ? 8 : 4;
}

function validarQuantidadeTimes(formato, quantidade) {
  const minimo = minimoTimesFormato(formato);
  return Number.isInteger(quantidade) && quantidade >= minimo;
}

function criarPartida(nodes, { fase, grupo = null, rodada, sourceA, sourceB, canalFase }) {
  const key = `match-${nodes.length + 1}`;
  const node = {
    key,
    fase,
    grupo,
    rodada,
    sourceA,
    sourceB,
    canalFase
  };
  nodes.push(node);
  return { tipo: 'vencedor', matchKey: key };
}

function criarEliminatoriaSimples(times, { nodes = [], fasePrefix = '', canalFase = 'mata-mata' } = {}) {
  if (times.length < 2) return nodes;
  let tamanho = 1;
  while (tamanho < times.length) tamanho *= 2;
  const partidasPrimeiraRodada = tamanho / 2;
  const byes = tamanho - times.length;
  const folhas = [];
  for (let indice = 0; indice < partidasPrimeiraRodada; indice++) {
    if (indice < byes) {
      folhas.push({ tipo: 'time', timeId: times[indice]._id }, null);
      continue;
    }
    const indiceTime = byes + (indice - byes) * 2;
    folhas.push(
      { tipo: 'time', timeId: times[indiceTime]._id },
      { tipo: 'time', timeId: times[indiceTime + 1]._id }
    );
  }

  const rodadasTotais = Math.log2(tamanho);
  function construir(arvore, rodada) {
    if (arvore.length === 1) return arvore[0];
    const meio = arvore.length / 2;
    const origemA = construir(arvore.slice(0, meio), rodada - 1);
    const origemB = construir(arvore.slice(meio), rodada - 1);
    if (!origemA) return origemB;
    if (!origemB) return origemA;
    const nomeFase = rodada === rodadasTotais ? `${fasePrefix}FINAL` : `${fasePrefix}R${rodada}`;
    return criarPartida(nodes, {
      fase: nomeFase,
      rodada,
      sourceA: origemA,
      sourceB: origemB,
      canalFase
    });
  }
  construir(folhas, rodadasTotais);
  return nodes;
}

function criarEliminatoriaDupla(times) {
  const nodes = [];
  criarEliminatoriaSimples(times, { nodes, fasePrefix: 'WINNERS_', canalFase: 'winners' });
  const upper = nodes.slice();
  const rodadasUpper = new Map();
  upper.forEach((node) => {
    if (!rodadasUpper.has(node.rodada)) rodadasUpper.set(node.rodada, []);
    rodadasUpper.get(node.rodada).push(node);
  });
  const rodadas = [...rodadasUpper.keys()].sort((a, b) => a - b);
  let lowerRound = 1;

  function parearFontes(fontes) {
    const avancam = [];
    for (let i = 0; i < fontes.length; i += 2) {
      const fonteA = fontes[i];
      const fonteB = fontes[i + 1];
      if (!fonteB) {
        avancam.push(fonteA);
        continue;
      }
      avancam.push(criarPartida(nodes, {
        fase: `LOSERS_R${lowerRound}`,
        rodada: lowerRound,
        sourceA: fonteA,
        sourceB: fonteB,
        canalFase: 'losers'
      }));
    }
    lowerRound++;
    return avancam;
  }

  let sobreviventes = parearFontes((rodadasUpper.get(rodadas[0]) || [])
    .map((node) => ({ tipo: 'perdedor', matchKey: node.key })));

  for (let index = 1; index < rodadas.length; index++) {
    if (index > 1) sobreviventes = parearFontes(sobreviventes);
    const perdedores = (rodadasUpper.get(rodadas[index]) || [])
      .map((node) => ({ tipo: 'perdedor', matchKey: node.key }));
    const combinados = [];
    const totalPareamentos = Math.min(sobreviventes.length, perdedores.length);
    for (let i = 0; i < totalPareamentos; i++) {
      combinados.push(criarPartida(nodes, {
        fase: `LOSERS_R${lowerRound}`,
        rodada: lowerRound,
        sourceA: sobreviventes[i],
        sourceB: perdedores[i],
        canalFase: 'losers'
      }));
    }
    combinados.push(...sobreviventes.slice(totalPareamentos), ...perdedores.slice(totalPareamentos));
    lowerRound++;
    sobreviventes = combinados;
  }

  const campeaoWinners = { tipo: 'vencedor', matchKey: upper[upper.length - 1].key };
  const campeaoLosers = sobreviventes[0];
  if (campeaoLosers) {
    criarPartida(nodes, {
      fase: 'GRAND_FINAL',
      rodada: lowerRound,
      sourceA: campeaoWinners,
      sourceB: campeaoLosers,
      canalFase: 'final'
    });
  }
  return nodes;
}

function criarRoundRobin(times, { grupo = null, fase = 'ROUND_ROBIN', canalFase = 'round-robin', nodes = [] } = {}) {
  const participantes = [...times];
  if (participantes.length % 2 !== 0) participantes.push(null);
  const totalRodadas = participantes.length - 1;
  const metade = participantes.length / 2;
  let rodadaTimes = participantes;

  for (let rodada = 1; rodada <= totalRodadas; rodada++) {
    for (let i = 0; i < metade; i++) {
      const timeA = rodadaTimes[i];
      const timeB = rodadaTimes[rodadaTimes.length - 1 - i];
      if (!timeA || !timeB) continue;
      criarPartida(nodes, {
        fase: grupo ? `GRUPO_${grupo}` : fase,
        grupo,
        rodada,
        sourceA: { tipo: 'time', timeId: timeA._id },
        sourceB: { tipo: 'time', timeId: timeB._id },
        canalFase
      });
    }
    rodadaTimes = [
      rodadaTimes[0],
      rodadaTimes[rodadaTimes.length - 1],
      ...rodadaTimes.slice(1, -1)
    ];
  }
  return nodes;
}

function criarFaseDeGrupos(times) {
  const grupos = [[], [], [], []];
  times.forEach((time, index) => grupos[index % grupos.length].push(time));
  const nodes = [];
  grupos.forEach((grupo, index) => {
    criarRoundRobin(grupo, {
      grupo: String.fromCharCode(65 + index),
      canalFase: 'groups',
      nodes
    });
  });
  return nodes;
}

function gerarPlanoFormato(formato, times) {
  const normalizado = normalizarFormato(formato);
  if (!normalizado) throw new Error(`Formato de campeonato desconhecido: ${formato}`);
  if (!validarQuantidadeTimes(normalizado, times.length)) {
    throw new Error(`O formato ${normalizado} exige no mínimo ${minimoTimesFormato(normalizado)} times.`);
  }
  const nodes = normalizado === 'single'
    ? criarEliminatoriaSimples(times)
    : normalizado === 'double'
      ? criarEliminatoriaDupla(times)
      : normalizado === 'round-robin'
        ? criarRoundRobin(times)
        : criarFaseDeGrupos(times);
  const rodadasAgendadas = new Map();
  for (const node of nodes) {
    const rodadasDeOrigem = [node.sourceA, node.sourceB]
      .filter((origem) => origem.tipo === 'vencedor' || origem.tipo === 'perdedor')
      .map((origem) => rodadasAgendadas.get(origem.matchKey) || 0);
    const proximaRodadaPorAvanco = rodadasDeOrigem.length
      ? Math.max(...rodadasDeOrigem) + 1
      : 1;
    node.rodadaAgendada = Math.max(Number(node.rodada) || 1, proximaRodadaPorAvanco);
    rodadasAgendadas.set(node.key, node.rodadaAgendada);
  }
  return nodes;
}

module.exports = {
  FORMATOS,
  normalizarFormato,
  minimoTimesFormato,
  validarQuantidadeTimes,
  criarEliminatoriaSimples,
  criarEliminatoriaDupla,
  criarRoundRobin,
  criarFaseDeGrupos,
  gerarPlanoFormato
};
