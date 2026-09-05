const test = require('node:test');
const assert = require('node:assert/strict');

const ENV_BASE = {
  TOKEN: 't', MONGODB_URI: 'm', CANAL_PINGS_ID: '1',
  CARGO_RLSIDESWIPE_ID: '1', CARGO_JOGOSDIVERSOS_ID: '2',
  CARGO_ORGANIZADORCAMPS_ID: '3',
  CARGO_BRONZE_ID: '4', CARGO_PRATA_ID: '5', CARGO_OURO_ID: '6',
  CARGO_PLATINA_ID: '7', CARGO_DIAMANTE_ID: '8', CARGO_CHAMPION_ID: '9',
  CARGO_GRAND_CHAMPION_ID: '10', CARGO_OMEGA_CHAMPION_ID: '11',
  STARTGG_TOKEN: 't'
};

function comEnv(extra = {}, fn) {
  const snapshot = { ...process.env };
  Object.entries({ ...ENV_BASE, ...extra }).forEach(([k, v]) => { process.env[k] = v; });
  try { return fn(); } finally {
    for (const k of Object.keys(process.env)) {
      if (!(k in snapshot)) delete process.env[k];
    }
    Object.assign(process.env, snapshot);
  }
}

test('placar.parsePlacar / placarEhValido', async (t) => {
  await t.test('aceita formatos 2x1, 3x0, 10x10', () => {
    comEnv({}, () => {
      const { parsePlacar } = require('../src/features/campeonato/validators/placar');
      assert.deepEqual(parsePlacar('2x1'), { golsA: 2, golsB: 1 });
      assert.deepEqual(parsePlacar('3X0'), { golsA: 3, golsB: 0 });
      assert.deepEqual(parsePlacar('10 x 10'), { golsA: 10, golsB: 10 });
    });
  });

  await t.test('rejeita formatos invalidos', () => {
    comEnv({}, () => {
      const { parsePlacar, placarEhValido } = require('../src/features/campeonato/validators/placar');
      assert.equal(parsePlacar('2-1'), null);
      assert.equal(parsePlacar('2'), null);
      assert.equal(parsePlacar('abc'), null);
      assert.equal(parsePlacar(''), null);
      assert.equal(placarEhValido('1x1'), true);
      assert.equal(placarEhValido('1-1'), false);
    });
  });
});

test('bracket.parearChaves', async (t) => {
  await t.test('4 times → 2 chaves, 8 times → 4 chaves', () => {
    comEnv({}, () => {
      const { parearChaves } = require('../src/features/campeonato/services/bracket');
      const t4 = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }];
      const c4 = parearChaves(t4, () => 0.5);
      assert.equal(c4.length, 2);
      assert.equal(c4[0].fase, 'R1');
      const t8 = Array.from({ length: 8 }, (_, i) => ({ _id: 't' + i }));
      const c8 = parearChaves(t8, () => 0.5);
      assert.equal(c8.length, 4);
    });
  });

  await t.test('3 times → 4 chaves (1 BYE)', () => {
    comEnv({}, () => {
      const { parearChaves } = require('../src/features/campeonato/services/bracket');
      const t3 = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }];
      const c = parearChaves(t3, () => 0.5);
      assert.equal(c.length, 2);
      const totalSlots = c.reduce((acc, p) => acc + (p.timeA ? 1 : 0) + (p.timeB ? 1 : 0), 0);
      assert.equal(totalSlots, 3);
    });
  });

  await t.test('5 times → 8 chaves (3 BYE)', () => {
    comEnv({}, () => {
      const { parearChaves, proximaPotenciaDe2 } = require('../src/features/campeonato/services/bracket');
      assert.equal(proximaPotenciaDe2(5), 8);
      const t5 = Array.from({ length: 5 }, (_, i) => ({ _id: 't' + i }));
      const c = parearChaves(t5, () => 0.5);
      assert.equal(c.length, 4);
    });
  });
});

test('TwoTeamsTiebreaker - Regra 11.2', async (t) => {
  await t.test('2 times com mesmo pontos e vitorias → MD3', () => {
    comEnv({}, () => {
      const TwoTeamsTiebreaker = require('../src/features/campeonato/strategies/TwoTeamsTiebreaker');
      const regulamento = require('../src/config/regulamento');
      const strategy = new TwoTeamsTiebreaker({ partidaService: {}, regulamento });
      const grupo = [
        { timeId: 't1', pontos: 6, vitorias: 2, woTomados: 1, woDados: 1 },
        { timeId: 't2', pontos: 6, vitorias: 2, woTomados: 1, woDados: 1 }
      ];
      const r = strategy.resolver(grupo);
      assert.equal(r.precisaMD3, true);
    });
  });

  await t.test('2 times, vitorias desempatam → vencedor definido', () => {
    comEnv({}, () => {
      const TwoTeamsTiebreaker = require('../src/features/campeonato/strategies/TwoTeamsTiebreaker');
      const regulamento = require('../src/config/regulamento');
      const strategy = new TwoTeamsTiebreaker({ partidaService: {}, regulamento });
      const grupo = [
        { timeId: 't1', pontos: 6, vitorias: 3, woTomados: 0, woDados: 0 },
        { timeId: 't2', pontos: 6, vitorias: 2, woTomados: 0, woDados: 0 }
      ];
      const r = strategy.resolver(grupo);
      assert.equal(r.desempate, true);
      assert.equal(r.criterio, 'vitorias');
      assert.equal(r.vencedorId, 't1');
    });
  });

  await t.test('2 times, mesmo pontos+vitorias, quem tem MENOS WO vence', () => {
    comEnv({}, () => {
      const TwoTeamsTiebreaker = require('../src/features/campeonato/strategies/TwoTeamsTiebreaker');
      const regulamento = require('../src/config/regulamento');
      const strategy = new TwoTeamsTiebreaker({ partidaService: {}, regulamento });
      const grupo = [
        { timeId: 't1', pontos: 6, vitorias: 2, woTomados: 2, woDados: 0 },
        { timeId: 't2', pontos: 6, vitorias: 2, woTomados: 0, woDados: 1 }
      ];
      const r = strategy.resolver(grupo);
      assert.equal(r.desempate, true);
      assert.equal(r.criterio, 'menor-wo-e-penalidades');
      assert.equal(r.vencedorId, 't2');
    });
  });

  await t.test('1 time sozinho não aplica', () => {
    comEnv({}, () => {
      const TwoTeamsTiebreaker = require('../src/features/campeonato/strategies/TwoTeamsTiebreaker');
      const regulamento = require('../src/config/regulamento');
      const strategy = new TwoTeamsTiebreaker({ partidaService: {}, regulamento });
      assert.equal(strategy.podeAplicar([{ timeId: 't1' }]), false);
    });
  });
});

test('ThreePlusTeamsTiebreaker - Regra 11.3', async (t) => {
  await t.test('3 times com mesmos pontos → TRIANGULAR_MD1', () => {
    comEnv({}, () => {
      const ThreePlus = require('../src/features/campeonato/strategies/ThreePlusTeamsTiebreaker');
      const regulamento = require('../src/config/regulamento');
      const strategy = new ThreePlus({ partidaService: {}, regulamento });
      const grupo = [
        { timeId: 't1', pontos: 6, vitorias: 2, woTomados: 0, woDados: 0 },
        { timeId: 't2', pontos: 6, vitorias: 2, woTomados: 0, woDados: 0 },
        { timeId: 't3', pontos: 6, vitorias: 2, woTomados: 0, woDados: 0 }
      ];
      const r = strategy.resolver(grupo);
      assert.equal(r.precisaTriangular, true);
      assert.equal(r.tipo, 'MD1');
      assert.equal(r.times.length, 3);
    });
  });

  await t.test('3 times, 1 com pontos maiores → vencedor definido', () => {
    comEnv({}, () => {
      const ThreePlus = require('../src/features/campeonato/strategies/ThreePlusTeamsTiebreaker');
      const regulamento = require('../src/config/regulamento');
      const strategy = new ThreePlus({ partidaService: {}, regulamento });
      const grupo = [
        { timeId: 't1', pontos: 9, vitorias: 3, woTomados: 0, woDados: 0 },
        { timeId: 't2', pontos: 6, vitorias: 2, woTomados: 0, woDados: 0 },
        { timeId: 't3', pontos: 3, vitorias: 1, woTomados: 0, woDados: 0 }
      ];
      const r = strategy.resolver(grupo);
      assert.equal(r.desempate, true);
      assert.equal(r.criterio, 'mini-tabela');
    });
  });
});

test('classificacao.construirPontuacaoBase (puro)', async (t) => {
  await t.test('3 times com diferentes pontos, vitorias, wo', () => {
    comEnv({}, () => {
      const { construirPontuacaoBase } = require('../src/features/campeonato/services/classificacao');
      const times = [
        { _id: 't1', nome: 'A' },
        { _id: 't2', nome: 'B' },
        { _id: 't3', nome: 'C' }
      ];
      const partidas = [
        { status: 'FINALIZADA', timeA: 't1', timeB: 't2', vencedorId: 't1' },
        { status: 'FINALIZADA', timeA: 't2', timeB: 't3', vencedorId: 't3' },
        { status: 'WO', timeA: 't1', timeB: 't3', vencedorId: 't1' }
      ];
      const r = construirPontuacaoBase(times, partidas);
      const t1 = r.find((x) => x.timeId === 't1');
      const t2 = r.find((x) => x.timeId === 't2');
      const t3 = r.find((x) => x.timeId === 't3');
      assert.equal(t1.pontos, 6);
      assert.equal(t1.vitorias, 2);
      assert.equal(t2.pontos, 0);
      assert.equal(t2.derrotas, 2);
      assert.equal(t3.pontos, 3);
      assert.equal(t3.vitorias, 1);
      assert.equal(t3.woTomados, 1);
    });
  });

  await t.test('partidas nao finalizadas sao ignoradas', () => {
    comEnv({}, () => {
      const { construirPontuacaoBase } = require('../src/features/campeonato/services/classificacao');
      const times = [{ _id: 't1' }, { _id: 't2' }];
      const partidas = [
        { status: 'AGUARDANDO_PLACAR', timeA: 't1', timeB: 't2' },
        { status: 'FINALIZADA', timeA: 't1', timeB: 't2', vencedorId: 't1' }
      ];
      const r = construirPontuacaoBase(times, partidas);
      const t1 = r.find((x) => x.timeId === 't1');
      assert.equal(t1.pontos, 3);
      assert.equal(t1.vitorias, 1);
    });
  });
});

test('classificacao.detectarEmpates', async (t) => {
  await t.test('detecta grupos de 2 e 3+ com mesmos pontos/vitorias', () => {
    comEnv({}, () => {
      const { detectarEmpates } = require('../src/features/campeonato/services/classificacao');
      const ranking = [
        { timeId: 't1', pontos: 9, vitorias: 3 },
        { timeId: 't2', pontos: 6, vitorias: 2 },
        { timeId: 't3', pontos: 6, vitorias: 2 },
        { timeId: 't4', pontos: 3, vitorias: 1 }
      ];
      const grupos = detectarEmpates(ranking);
      assert.equal(grupos.length, 1);
      assert.equal(grupos[0].length, 2);
      assert.equal(grupos[0][0].timeId, 't2');
    });
  });

  await t.test('sem empates retorna array vazio', () => {
    comEnv({}, () => {
      const { detectarEmpates } = require('../src/features/campeonato/services/classificacao');
      const ranking = [
        { timeId: 't1', pontos: 9, vitorias: 3 },
        { timeId: 't2', pontos: 6, vitorias: 2 }
      ];
      assert.deepEqual(detectarEmpates(ranking), []);
    });
  });
});

test('handlers da Fase 2 registrados', async (t) => {
  await t.test('29 handlers: 21 botões + 4 selects + 4 modais', () => {
    comEnv({}, () => {
      const { InteractionRegistry } = require('../src/interactions/registry');
      const interactions = require('../src/features/campeonato/interactions');
      const r = new InteractionRegistry();
      interactions.register(r);
      assert.equal(r.buttons.length, 21);
      assert.equal(r.selects.length, 4);
      assert.equal(r.modals.length, 4);
    });
  });
});

test('StartGGAdapter: métodos de torneio não fazem request sem chamada', async (t) => {
  await t.test('instancia e tem métodos', () => {
    comEnv({}, () => {
      const { StartGGAdapter } = require('../src/features/campeonato/adapters/StartGGAdapter');
      const a = new StartGGAdapter();
      assert.equal(typeof a.createTournament, 'function');
      assert.equal(typeof a.addParticipantsBulk, 'function');
      assert.equal(typeof a.reportScore, 'function');
      assert.equal(typeof a.ping, 'function');
    });
  });
});
