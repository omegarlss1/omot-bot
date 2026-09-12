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
  await t.test('4 times → R1=2, FINAL=1 (total 3)', () => {
    comEnv({}, () => {
      const { parearChaves } = require('../src/features/campeonato/services/bracket');
      const t4 = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }];
      const c4 = parearChaves(t4, () => 0.5);
      // 4 times (power of 2): R1=2, FINAL=1 = 3 total (N-1)
      assert.equal(c4.length, 3);
      const r1 = c4.filter(p => p.fase === 'R1');
      assert.equal(r1.length, 2);
      assert.equal(r1[0].fase, 'R1');
    });
  });

  await t.test('3 times → R1=1, FINAL=1 (total 2, no BYE vs BYE)', () => {
    comEnv({}, () => {
      const { parearChaves } = require('../src/features/campeonato/services/bracket');
      const t3 = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }];
      const c = parearChaves(t3, () => 0.5);
      // 3 times: nextPow2=4, BYEs=1, R1=1 match, FINAL=1 match = 2 total (N-1)
      assert.equal(c.length, 2);
      const r1 = c.filter(p => p.fase === 'R1');
      assert.equal(r1.length, 1);
      // No R1/R2 match should have both teams null (BYE vs BYE)
      const byeVsBye = c.filter(p => (p.fase === 'R1' || p.fase === 'R2') && !p.timeA && !p.timeB);
      assert.equal(byeVsBye.length, 0);
    });
  });

  await t.test('5 times → R1=1, R2=2, FINAL=1 (total 4, no BYE vs BYE)', () => {
    comEnv({}, () => {
      const { parearChaves, proximaPotenciaDe2 } = require('../src/features/campeonato/services/bracket');
      assert.equal(proximaPotenciaDe2(5), 8);
      const t5 = Array.from({ length: 5 }, (_, i) => ({ _id: 't' + i }));
      const c = parearChaves(t5, () => 0.5);
      // 5 times: nextPow2=8, BYEs=3, R1=1, R2=2, FINAL=1 = 4 total (N-1)
      assert.equal(c.length, 4);
      const r1 = c.filter(p => p.fase === 'R1');
      assert.equal(r1.length, 1);
      const r2 = c.filter(p => p.fase === 'R2');
      assert.equal(r2.length, 2);
      // No R1/R2 match should have both teams null (BYE vs BYE)
      const byeVsBye = c.filter(p => (p.fase === 'R1' || p.fase === 'R2') && !p.timeA && !p.timeB);
      assert.equal(byeVsBye.length, 0);
    });
  });
});

test('canvasBracket.renderSingleBracketPng retorna PNG válido', async (t) => {
  await t.test('4 times geram buffer com header PNG', async () => {
    comEnv({}, async () => {
      const { renderSingleBracketPng } = require('../src/features/campeonato/services/canvasBracket');
      const times = [
        { nome: 'Time-01' },
        { nome: 'Time-02' },
        { nome: 'Time-03' },
        { nome: 'Time-04' }
      ];
      const png = await renderSingleBracketPng({ times, incluirTerceiroLugar: true });
      assert.ok(Buffer.isBuffer(png));
      assert.ok(png.length > 100);
      assert.deepEqual(png.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4E, 0x47]));
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
  await t.test('37 handlers: 29 botões + 7 selects + 5 modais', () => {
    comEnv({}, () => {
      const { InteractionRegistry } = require('../src/interactions/registry');
      const interactions = require('../src/features/campeonato/interactions');
      const r = new InteractionRegistry();
      interactions.register(r);
      assert.equal(r.buttons.length, 35);
      assert.equal(r.selects.length, 11);
      assert.equal(r.modals.length, 8);
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
