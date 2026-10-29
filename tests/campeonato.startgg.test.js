const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  TOKEN: 't',
  MONGODB_URI: 'm',
  CANAL_PINGS_ID: '1',
  CARGO_RLSIDESWIPE_ID: '1',
  CARGO_JOGOSDIVERSOS_ID: '2',
  CARGO_ORGANIZADORCAMPS_ID: '3',
  CARGO_BRONZE_ID: '4',
  CARGO_PRATA_ID: '5',
  CARGO_OURO_ID: '6',
  CARGO_PLATINA_ID: '7',
  CARGO_DIAMANTE_ID: '8',
  CARGO_CHAMPION_ID: '9',
  CARGO_GRAND_CHAMPION_ID: '10',
  CARGO_OMEGA_CHAMPION_ID: '11',
  STARTGG_TOKEN: 'startgg-test-token'
});

const Campeonato = require('../src/db/models/campeonato');
const Time = require('../src/db/models/time');
const Partida = require('../src/db/models/partida');
const { BracketError, gerarBracket, previewBracket } = require('../src/features/campeonato/services/bracket');
const {
  StartGGBracketError,
  configurarBracketStartGG,
  obterFasesGrupos
} = require('../src/features/campeonato/services/startggBracket');
const { extrairIdentificadorEvento } = require('../src/bot/commands/startgg-vincular');

function criarDadosStartGG(modalidade = 'double') {
  const times = Array.from({ length: 17 }, (_, index) => ({
    _id: `time-${index + 1}`,
    nome: `Time ${index + 1}`,
    jogadores: [],
    criadoEm: new Date(index)
  }));
  const entrants = times.map((time, index) => ({
    id: `entrant-${index + 1}`,
    name: time.nome,
    participants: []
  }));
  const campeonato = {
    _id: 'campeonato-id',
    nome: 'Campeonato de teste',
    modo: '2v2',
    modalidade,
    startgg: {
      eventId: 'event-id',
      url: 'https://start.gg/tournament/test/event/duplas',
      groupPhaseId: modalidade === 'grupos-mata-mata' ? 'groups-id' : null,
      bracketPhaseId: modalidade === 'grupos-mata-mata' ? 'bracket-id' : null
    }
  };
  return { times, entrants, campeonato };
}

function criarMocksStartGG({ modalidade = 'double' } = {}) {
  const { times, entrants, campeonato } = criarDadosStartGG(modalidade);
  const chamadas = { phase: null, seeds: null, faseAtualizada: null, escritosTimes: null, campeonatoSalvo: null };
  const evento = {
    id: 'event-id',
    name: 'Evento de teste',
    slug: 'tournament/test/event/duplas',
    tournament: { id: 'tournament-id' },
    phases: modalidade === 'grupos-mata-mata'
      ? [
        { id: 'groups-id', bracketType: 'ROUND_ROBIN', groupCount: 4 },
        { id: 'bracket-id', bracketType: 'SINGLE_ELIMINATION', groupCount: null }
      ]
      : []
  };
  const adapter = {
    getEventById: async () => evento,
    getEventEntrants: async () => entrants,
    upsertPhase: async (config) => {
      chamadas.phase = config;
      return { id: 'phase-id', name: config.name, bracketType: config.bracketType };
    },
    getPhaseSeeds: async (phaseId) => ({
      phase: { id: phaseId, event: { id: evento.id }, name: 'Fase de teste' },
      seeds: entrants.map((entrant, index) => ({
        id: `seed-${index + 1}`,
        seedNum: index + 1,
        entrant: { id: entrant.id }
      }))
    }),
    updatePhaseSeeding: async (phaseId, seedMapping) => {
      chamadas.faseAtualizada = phaseId;
      chamadas.seeds = seedMapping;
      return { id: phaseId };
    }
  };
  const timeModel = {
    find: () => ({ sort: () => ({ lean: async () => times }) }),
    bulkWrite: async (operacoes) => { chamadas.escritosTimes = operacoes; }
  };
  const campeonatoModel = {
    findById: () => ({ lean: async () => campeonato }),
    updateOne: async (filtro, atualizacao) => { chamadas.campeonatoSalvo = { filtro, atualizacao }; }
  };
  return { adapter, timeModel, campeonatoModel, chamadas, times, entrants, campeonato, evento };
}

test('Start.gg: aceita identificador numérico, slug e URL do evento', () => {
  assert.deepEqual(extrairIdentificadorEvento('12345'), { tipo: 'id', valor: '12345' });
  assert.deepEqual(extrairIdentificadorEvento('tournament/test/event/duplas'), {
    tipo: 'slug',
    valor: 'tournament/test/event/duplas'
  });
  assert.deepEqual(extrairIdentificadorEvento('https://start.gg/tournament/test/event/duplas'), {
    tipo: 'slug',
    valor: 'tournament/test/event/duplas'
  });
  assert.throws(() => extrairIdentificadorEvento('https://example.com/event'), /URL do Start.gg/);
});

test('Start.gg: configura fase para campeonato com mais de 16 times e sincroniza seeds', async () => {
  const mocks = criarMocksStartGG();
  const resultado = await configurarBracketStartGG('campeonato-id', mocks);

  assert.equal(resultado.entrantCount, 17);
  assert.equal(resultado.phaseId, 'phase-id');
  assert.equal(mocks.chamadas.phase.bracketType, 'DOUBLE_ELIMINATION');
  assert.equal(mocks.chamadas.faseAtualizada, 'phase-id');
  assert.equal(mocks.chamadas.seeds.length, 17);
  assert.equal(mocks.chamadas.seeds[0].seedNum, '1');
  assert.equal(mocks.chamadas.escritosTimes.length, 17);
  assert.equal(mocks.chamadas.campeonatoSalvo.atualizacao.$set['startgg.phaseId'], 'phase-id');
});

test('Start.gg: usa fase de grupos vinculada e valida sua configuração', async () => {
  const mocks = criarMocksStartGG({ modalidade: 'grupos-mata-mata' });
  const resultado = await configurarBracketStartGG('campeonato-id', mocks);

  assert.equal(resultado.phaseId, 'groups-id');
  assert.equal(mocks.chamadas.phase, null);
  assert.equal(mocks.chamadas.campeonatoSalvo.atualizacao.$set['startgg.phaseId'], 'groups-id');
  assert.throws(
    () => obterFasesGrupos({ phases: [{ id: 'groups-id', bracketType: 'ROUND_ROBIN', groupCount: 3 }] }, mocks.campeonato),
    (error) => error instanceof StartGGBracketError && error.code === 'STARTGG_FASES_GRUPOS_AUSENTES'
  );
});

test('Start.gg: rejeita 16 times ou menos sem consultar a API', async () => {
  const mocks = criarMocksStartGG();
  mocks.timeModel.find = () => ({
    sort: () => ({ lean: async () => mocks.times.slice(0, 16) })
  });
  let consultouEvento = false;
  mocks.adapter.getEventById = async () => {
    consultouEvento = true;
    return mocks.evento;
  };

  await assert.rejects(
    () => configurarBracketStartGG('campeonato-id', mocks),
    (error) => error instanceof StartGGBracketError && error.code === 'STARTGG_LIMITE_TIMES'
  );
  assert.equal(consultouEvento, false);
});

test('Discord: rejeita mais de 16 times e formatos locais ainda não suportados', async () => {
  const originais = {
    campeonatoFindById: Campeonato.findById,
    timeFind: Time.find,
    partidaFindOne: Partida.findOne
  };
  try {
    Campeonato.findById = () => ({ lean: async () => ({ guildId: 'guild-id', modalidade: 'single' }) });
    Time.find = () => ({ lean: async () => Array.from({ length: 17 }, (_, index) => ({ _id: `time-${index}` })) });

    await assert.rejects(
      () => gerarBracket('campeonato-id'),
      (error) => error instanceof BracketError && error.code === 'BRACKET_STARTGG_REQUIRED'
    );
    await assert.rejects(
      () => previewBracket('campeonato-id'),
      (error) => error instanceof BracketError && error.code === 'BRACKET_STARTGG_REQUIRED'
    );

    Campeonato.findById = () => ({ lean: async () => ({ guildId: 'guild-id', modalidade: 'double' }) });
    Time.find = () => ({ lean: async () => Array.from({ length: 4 }, (_, index) => ({ _id: `time-${index}` })) });
    Partida.findOne = async () => null;
    await assert.rejects(
      () => gerarBracket('campeonato-id'),
      (error) => error instanceof BracketError && error.code === 'BRACKET_FORMAT_UNSUPPORTED'
    );
    await assert.rejects(
      () => previewBracket('campeonato-id'),
      (error) => error instanceof BracketError && error.code === 'BRACKET_FORMAT_UNSUPPORTED'
    );
  } finally {
    Campeonato.findById = originais.campeonatoFindById;
    Time.find = originais.timeFind;
    Partida.findOne = originais.partidaFindOne;
  }
});
