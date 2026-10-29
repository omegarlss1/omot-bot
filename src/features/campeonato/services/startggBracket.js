const Campeonato = require('../../../db/models/campeonato');
const Time = require('../../../db/models/time');
const { StartGGAdapter } = require('../adapters/StartGGAdapter');

const TIPO_FASE_POR_FORMATO = {
  single: 'SINGLE_ELIMINATION',
  'single-elimination': 'SINGLE_ELIMINATION',
  double: 'DOUBLE_ELIMINATION',
  'double-elimination': 'DOUBLE_ELIMINATION',
  'round-robin': 'ROUND_ROBIN'
};

class StartGGBracketError extends Error {
  constructor(message, code = 'STARTGG_BRACKET_ERROR') {
    super(message);
    this.name = 'StartGGBracketError';
    this.code = code;
  }
}

function normalizarNome(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function obterNomeTime(time, modo) {
  if (modo === '1v1') return time.jogadores?.[0]?.nickSnapshot || time.nome;
  return time.nome || time.jogadores?.[0]?.nickSnapshot;
}

function obterNomeEntrant(entrant, modo) {
  if (modo === '1v1') return entrant.participants?.[0]?.gamerTag || entrant.name;
  return entrant.name || entrant.participants?.[0]?.gamerTag;
}

function mapearEntrants(times, entrants, modo) {
  const porNome = new Map();
  for (const entrant of entrants) {
    const nome = normalizarNome(obterNomeEntrant(entrant, modo));
    if (!nome) continue;
    if (porNome.has(nome)) {
      throw new StartGGBracketError(
        `Há equipes com nomes duplicados no evento Start.gg: "${obterNomeEntrant(entrant, modo)}".`,
        'STARTGG_ENTRANT_DUPLICADO'
      );
    }
    porNome.set(nome, entrant);
  }

  const usados = new Set();
  const mapeados = times.map((time) => {
    const nome = normalizarNome(obterNomeTime(time, modo));
    const entrant = nome ? porNome.get(nome) : null;
    if (!entrant || usados.has(String(entrant.id))) {
      throw new StartGGBracketError(
        `Não foi possível vincular o time "${obterNomeTime(time, modo) || 'sem nome'}" a uma inscrição do evento. ` +
        'Os nomes dos times no Discord e no Start.gg devem corresponder.',
        'STARTGG_ENTRANT_NAO_VINCULADO'
      );
    }
    usados.add(String(entrant.id));
    return { time, entrant };
  });

  if (usados.size !== entrants.length) {
    const extras = entrants
      .filter((entrant) => !usados.has(String(entrant.id)))
      .map((entrant) => obterNomeEntrant(entrant, modo))
      .filter(Boolean);
    throw new StartGGBracketError(
      `O evento Start.gg possui inscrições que não correspondem aos times do Discord: ${extras.slice(0, 5).join(', ')}.`,
      'STARTGG_ENTRANT_EXCEDENTE'
    );
  }
  return mapeados;
}

function resolverFormato(campeonato) {
  const formato = String(campeonato.modalidade || campeonato.formato || '').toLowerCase();
  if (formato === 'grupos-mata-mata') return formato;
  if (!TIPO_FASE_POR_FORMATO[formato]) {
    throw new StartGGBracketError(
      'O formato do campeonato não está definido ou não é suportado pela integração Start.gg.',
      'STARTGG_FORMATO_INVALIDO'
    );
  }
  return formato;
}

function obterFasesGrupos(evento, campeonato) {
  const faseGrupos = (evento.phases || []).find((fase) =>
    String(fase.id) === String(campeonato.startgg?.groupPhaseId)
  );
  const faseEliminatoria = (evento.phases || []).find((fase) =>
    String(fase.id) === String(campeonato.startgg?.bracketPhaseId)
  );
  if (!faseGrupos || !faseEliminatoria) {
    throw new StartGGBracketError(
      'No Start.gg, crie e configure manualmente a fase de grupos com 4 grupos e a fase eliminatória, depois vincule ambas ao campeonato.',
      'STARTGG_FASES_GRUPOS_AUSENTES'
    );
  }
  if (faseGrupos.bracketType !== 'ROUND_ROBIN' || Number(faseGrupos.groupCount) !== 4) {
    throw new StartGGBracketError(
      'A fase de grupos vinculada precisa ser Round Robin com exatamente 4 grupos.',
      'STARTGG_FASE_GRUPOS_INVALIDA'
    );
  }
  if (!['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION'].includes(faseEliminatoria.bracketType)) {
    throw new StartGGBracketError(
      'A fase mata-mata vinculada precisa ser Eliminatória simples ou dupla.',
      'STARTGG_FASE_ELIMINATORIA_INVALIDA'
    );
  }
  return { faseGrupos, faseEliminatoria };
}

async function configurarBracketStartGG(campeonatoId, {
  adapter = new StartGGAdapter(),
  campeonatoModel = Campeonato,
  timeModel = Time
} = {}) {
  const campeonato = await campeonatoModel.findById(campeonatoId).lean();
  if (!campeonato) throw new StartGGBracketError('Campeonato não encontrado.', 'CAMPEONATO_NAO_ENCONTRADO');
  if (!campeonato.startgg?.eventId) {
    throw new StartGGBracketError(
      'Vincule primeiro um evento Start.gg usando /startgg-vincular no canal do organizador.',
      'STARTGG_EVENTO_NAO_VINCULADO'
    );
  }

  const times = await timeModel.find({ campeonatoId }).sort({ criadoEm: 1, _id: 1 }).lean();
  if (times.length < 4) {
    throw new StartGGBracketError('Mínimo de 4 times para gerar bracket.', 'STARTGG_MIN_TIMES');
  }
  if (times.length <= 16) {
    throw new StartGGBracketError('A integração Start.gg é usada somente acima de 16 times.', 'STARTGG_LIMITE_TIMES');
  }

  const formato = resolverFormato(campeonato);
  const evento = await adapter.getEventById(campeonato.startgg.eventId);
  if (!evento?.id) {
    throw new StartGGBracketError('O eventId vinculado não existe ou não está acessível pelo token Start.gg.', 'STARTGG_EVENTO_INVALIDO');
  }
  const entrants = await adapter.getEventEntrants(evento.id);
  if (entrants.length !== times.length) {
    throw new StartGGBracketError(
      `O evento Start.gg tem ${entrants.length} inscrições, mas o Discord tem ${times.length} times. ` +
      'Ajuste as inscrições no Start.gg antes de gerar o bracket.',
      'STARTGG_TOTAL_ENTRANTS_DIVERGENTE'
    );
  }

  const mapeados = mapearEntrants(times, entrants, campeonato.modo);
  let phaseId;
  if (formato === 'grupos-mata-mata') {
    const { faseGrupos } = obterFasesGrupos(evento, campeonato);
    phaseId = String(faseGrupos.id);
  } else {
    const phase = await adapter.upsertPhase({
      eventId: evento.id,
      phaseId: campeonato.startgg.phaseId || null,
      name: `${campeonato.nome} - ${formato}`,
      bracketType: TIPO_FASE_POR_FORMATO[formato]
    });
    if (!phase?.id) {
      throw new StartGGBracketError('Start.gg não retornou o ID da fase criada.', 'STARTGG_FASE_NAO_CRIADA');
    }
    phaseId = String(phase.id);
  }

  const { phase, seeds } = await adapter.getPhaseSeeds(phaseId);
  if (String(phase?.event?.id) !== String(evento.id)) {
    throw new StartGGBracketError('A fase vinculada não pertence ao evento do campeonato.', 'STARTGG_FASE_EVENTO_DIVERGENTE');
  }
  if (seeds.length !== entrants.length) {
    throw new StartGGBracketError(
      `A fase Start.gg tem ${seeds.length} seeds para ${entrants.length} inscrições. ` +
      'Confirme no Start.gg que todos os participantes estão adicionados à fase.',
      'STARTGG_SEEDS_DIVERGENTES'
    );
  }

  const seedsPorEntrant = new Map(seeds.map((seed) => [String(seed.entrant?.id), seed]));
  const seedMapping = mapeados.map(({ entrant }, index) => {
    const seed = seedsPorEntrant.get(String(entrant.id));
    if (!seed?.id) {
      throw new StartGGBracketError(
        `A inscrição Start.gg "${obterNomeEntrant(entrant, campeonato.modo)}" não tem seed na fase ${phaseId}.`,
        'STARTGG_SEED_NAO_ENCONTRADA'
      );
    }
    return { seedId: String(seed.id), seedNum: String(index + 1) };
  });
  const atualizacao = await adapter.updatePhaseSeeding(phaseId, seedMapping);
  if (!atualizacao?.id) {
    throw new StartGGBracketError('Start.gg não confirmou a atualização do seeding.', 'STARTGG_SEED_NAO_ATUALIZADO');
  }

  const url = evento.slug
    ? `https://start.gg/${evento.slug}`
    : campeonato.startgg.url || `https://start.gg/event/${evento.id}`;
  await timeModel.bulkWrite(mapeados.map(({ time, entrant }) => ({
    updateOne: {
      filter: { _id: time._id, campeonatoId },
      update: { $set: { startggEntrantId: String(entrant.id) } }
    }
  })));
  await campeonatoModel.updateOne(
    { _id: campeonatoId },
    { $set: {
      'startgg.eventId': String(evento.id),
      'startgg.tournamentId': evento.tournament?.id ? String(evento.tournament.id) : campeonato.startgg.tournamentId,
      'startgg.url': url,
      'startgg.phaseId': phaseId
    } }
  );

  return { campeonato, evento, phaseId, phaseName: phase?.name || formato, entrantCount: entrants.length, url };
}

module.exports = {
  StartGGBracketError,
  configurarBracketStartGG,
  mapearEntrants,
  normalizarNome,
  obterFasesGrupos,
  resolverFormato
};
