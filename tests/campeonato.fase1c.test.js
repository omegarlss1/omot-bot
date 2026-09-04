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

test('corte.isPotenciaDe2', async (t) => {
  await t.test('1, 2, 4, 8, 16 são potências', () => {
    comEnv({}, () => {
      const { isPotenciaDe2 } = require('../src/features/campeonato/validators/corte');
      assert.equal(isPotenciaDe2(1), true);
      assert.equal(isPotenciaDe2(2), true);
      assert.equal(isPotenciaDe2(4), true);
      assert.equal(isPotenciaDe2(8), true);
      assert.equal(isPotenciaDe2(16), true);
    });
  });

  await t.test('3, 5, 6, 7, 9 NÃO são potências', () => {
    comEnv({}, () => {
      const { isPotenciaDe2 } = require('../src/features/campeonato/validators/corte');
      assert.equal(isPotenciaDe2(3), false);
      assert.equal(isPotenciaDe2(5), false);
      assert.equal(isPotenciaDe2(6), false);
      assert.equal(isPotenciaDe2(7), false);
      assert.equal(isPotenciaDe2(9), false);
    });
  });

  await t.test('0 e números inválidos retornam false', () => {
    comEnv({}, () => {
      const { isPotenciaDe2 } = require('../src/features/campeonato/validators/corte');
      assert.equal(isPotenciaDe2(0), false);
      assert.equal(isPotenciaDe2(-1), false);
      assert.equal(isPotenciaDe2(2.5), false);
    });
  });
});

test('corte.aplicarCorte', async (t) => {
  await t.test('1v1: ímpar remove 1, par mantém', () => {
    comEnv({}, () => {
      const { aplicarCorte } = require('../src/features/campeonato/validators/corte');
      assert.equal(aplicarCorte({ totalInscritos: 7, modo: '1v1' }).removidos, 1);
      assert.equal(aplicarCorte({ totalInscritos: 8, modo: '1v1' }).removidos, 0);
    });
  });

  await t.test('2v2: ímpar remove 1', () => {
    comEnv({}, () => {
      const { aplicarCorte } = require('../src/features/campeonato/validators/corte');
      assert.equal(aplicarCorte({ totalInscritos: 7, modo: '2v2' }).removidos, 1);
      assert.equal(aplicarCorte({ totalInscritos: 8, modo: '2v2' }).removidos, 0);
    });
  });

  await t.test('3v3: resto 1 remove 1, resto 2 remove 2', () => {
    comEnv({}, () => {
      const { aplicarCorte } = require('../src/features/campeonato/validators/corte');
      assert.equal(aplicarCorte({ totalInscritos: 10, modo: '3v3' }).removidos, 1);
      assert.equal(aplicarCorte({ totalInscritos: 11, modo: '3v3' }).removidos, 2);
      assert.equal(aplicarCorte({ totalInscritos: 12, modo: '3v3' }).removidos, 0);
    });
  });

  await t.test('FIXA não corta (apenas SORTEADA)', () => {
    comEnv({}, () => {
      const { aplicarCorte } = require('../src/features/campeonato/validators/corte');
      assert.equal(aplicarCorte({ totalInscritos: 7, modo: '3v3', tipoDupla: 'FIXA' }).removidos, 0);
    });
  });
});

test('corte.avaliarAposCorte', async (t) => {
  await t.test('totalTimes potência de 2 → single elimination', () => {
    comEnv({}, () => {
      const { avaliarAposCorte } = require('../src/features/campeonato/validators/corte');
      const r = avaliarAposCorte({ totalRestante: 12, modo: '3v3' });
      assert.equal(r.potenciaDe2, true);
      assert.equal(r.totalTimes, 4);
      assert.equal(r.menuFormatoNecessario, false);
    });
  });

  await t.test('totalTimes NÃO potência de 2 → menu necessário', () => {
    comEnv({}, () => {
      const { avaliarAposCorte } = require('../src/features/campeonato/validators/corte');
      const r = avaliarAposCorte({ totalRestante: 15, modo: '3v3' });
      assert.equal(r.potenciaDe2, false);
      assert.equal(r.totalTimes, 5);
      assert.equal(r.menuFormatoNecessario, true);
      assert.ok(Array.isArray(r.alternativas));
      assert.ok(r.alternativas.length > 0);
    });
  });
});

test('corte.executarCorteCompleto', async (t) => {
  await t.test('cenário 12 jogadores 3v3 → 4 times, potência de 2', () => {
    comEnv({}, () => {
      const { executarCorteCompleto } = require('../src/features/campeonato/validators/corte');
      const r = executarCorteCompleto({ totalInscritos: 12, modo: '3v3' });
      assert.equal(r.removidos, 0);
      assert.equal(r.totalRestante, 12);
      assert.equal(r.totalTimes, 4);
      assert.equal(r.potenciaDe2, true);
    });
  });

  await t.test('cenário 7 jogadores 2v2 → remove 1, 3 times NÃO é potência', () => {
    comEnv({}, () => {
      const { executarCorteCompleto } = require('../src/features/campeonato/validators/corte');
      const r = executarCorteCompleto({ totalInscritos: 7, modo: '2v2' });
      assert.equal(r.removidos, 1);
      assert.equal(r.totalRestante, 6);
      assert.equal(r.totalTimes, 3);
      assert.equal(r.potenciaDe2, false);
      assert.equal(r.menuFormatoNecessario, true);
    });
  });

  await t.test('cenário 10 jogadores 3v3 → remove 1, 3 times NÃO é potência', () => {
    comEnv({}, () => {
      const { executarCorteCompleto } = require('../src/features/campeonato/validators/corte');
      const r = executarCorteCompleto({ totalInscritos: 10, modo: '3v3' });
      assert.equal(r.removidos, 1);
      assert.equal(r.totalRestante, 9);
      assert.equal(r.totalTimes, 3);
      assert.equal(r.potenciaDe2, false);
    });
  });

  await t.test('cenário 11 jogadores 3v3 → remove 2, 3 times NÃO é potência', () => {
    comEnv({}, () => {
      const { executarCorteCompleto } = require('../src/features/campeonato/validators/corte');
      const r = executarCorteCompleto({ totalInscritos: 11, modo: '3v3' });
      assert.equal(r.removidos, 2);
      assert.equal(r.totalRestante, 9);
      assert.equal(r.totalTimes, 3);
    });
  });
});

test('inscricao.temCargoRank / temAlgumCargoRank', async (t) => {
  await t.test('temCargoRank retorna true se membro tem o cargo', () => {
    comEnv({}, () => {
      const { temCargoRank } = require('../src/features/campeonato/validators/inscricao');
      const m = { roles: { cache: { has: (id) => id === '6' } } };
      assert.equal(temCargoRank(m, 'ouro'), true);
      assert.equal(temCargoRank(m, 'prata'), false);
    });
  });

  await t.test('temAlgumCargoRank retorna o primeiro rank compatível', () => {
    comEnv({}, () => {
      const { temAlgumCargoRank } = require('../src/features/campeonato/validators/inscricao');
      const m = { roles: { cache: { has: (id) => id === '6' || id === '7' } } };
      assert.equal(temAlgumCargoRank(m, ['bronze', 'ouro', 'platina']), 'ouro');
    });
  });

  await t.test('temAlgumCargoRank retorna null se nenhum match', () => {
    comEnv({}, () => {
      const { temAlgumCargoRank } = require('../src/features/campeonato/validators/inscricao');
      const m = { roles: { cache: { has: () => false } } };
      assert.equal(temAlgumCargoRank(m, ['bronze', 'ouro']), null);
    });
  });
});

test('inscricao.perfilValido', async (t) => {
  await t.test('rejeita perfil null', () => {
    comEnv({}, () => {
      const { perfilValido } = require('../src/features/campeonato/validators/inscricao');
      const r = perfilValido(null);
      assert.equal(r.ok, false);
    });
  });

  await t.test('rejeita perfil sem nick_principal', () => {
    comEnv({}, () => {
      const { perfilValido } = require('../src/features/campeonato/validators/inscricao');
      const r = perfilValido({ rankX1: 'Ouro' });
      assert.equal(r.ok, false);
      assert.match(r.motivo, /nick/);
    });
  });

  await t.test('rejeita perfil sem rankX1 nem rankX2', () => {
    comEnv({}, () => {
      const { perfilValido } = require('../src/features/campeonato/validators/inscricao');
      const r = perfilValido({ nick_principal: 'Omot' });
      assert.equal(r.ok, false);
      assert.match(r.motivo, /rank/);
    });
  });

  await t.test('aceita perfil completo', () => {
    comEnv({}, () => {
      const { perfilValido } = require('../src/features/campeonato/validators/inscricao');
      const r = perfilValido({ nick_principal: 'Omot', rankX1: 'Ouro' });
      assert.equal(r.ok, true);
    });
  });
});

test('inscricao.validarInscricao', async (t) => {
  await t.test('lança InscricaoError se sem cargo de rank', () => {
    comEnv({}, () => {
      const { validarInscricao, InscricaoError } = require('../src/features/campeonato/validators/inscricao');
      const member = { roles: { cache: { has: () => false } } };
      assert.throws(() => validarInscricao({
        member,
        perfil: { nick_principal: 'X', rankX1: 'Ouro' },
        ranksDisponiveis: ['ouro']
      }), (err) => err instanceof InscricaoError && err.code === 'INSCRICAO_SEM_CARGO');
    });
  });

  await t.test('lança erro se rankSnapshot diverge do cargo', () => {
    comEnv({}, () => {
      const { validarInscricao, InscricaoError } = require('../src/features/campeonato/validators/inscricao');
      const member = { roles: { cache: { has: (id) => id === '6' } } };
      assert.throws(() => validarInscricao({
        member,
        perfil: { nick_principal: 'X', rankX1: 'Prata' },
        ranksDisponiveis: ['ouro']
      }), (err) => err instanceof InscricaoError && err.code === 'INSCRICAO_RANK_DIVERGENTE');
    });
  });

  await t.test('retorna dados validados quando cargo + perfil + rank batem', () => {
    comEnv({}, () => {
      const { validarInscricao } = require('../src/features/campeonato/validators/inscricao');
      const member = { id: 'u1', roles: { cache: { has: (id) => id === '6' } } };
      const r = validarInscricao({
        member,
        perfil: { nick_principal: 'Omotzin', rankX1: 'Ouro' },
        ranksDisponiveis: ['ouro']
      });
      assert.equal(r.rank, 'ouro');
      assert.equal(r.capitaoUserId, 'u1');
      assert.equal(r.capitaoNick, 'Omotzin');
      assert.equal(r.capitaoRankSnapshot, 'Ouro');
    });
  });
});

test('handlers da Fase 1C registrados', async (t) => {
  await t.test('19 handlers: 16 botões + 3 modais', () => {
    comEnv({}, () => {
      const { InteractionRegistry } = require('../src/interactions/registry');
      const interactions = require('../src/features/campeonato/interactions');
      const r = new InteractionRegistry();
      interactions.register(r);
      assert.equal(r.buttons.length, 16);
      assert.equal(r.modals.length, 3);
    });
  });

  await t.test('regex btn_camp_formato_ aceita todos os formatos e ObjectId de 24 chars hex', () => {
    comEnv({}, () => {
      const { InteractionRegistry } = require('../src/interactions/registry');
      const interactions = require('../src/features/campeonato/interactions');
      const r = new InteractionRegistry();
      interactions.register(r);
      const oid = 'a1b2c3d4e5f6a7b8c9d0e1f2';
      const todosPatterns = r.buttons.flatMap((b) => {
        if (b.pattern instanceof RegExp) return [b.pattern];
        return [];
      });
      const formatoBtn = todosPatterns.find((p) => p.source.startsWith('^btn_camp_formato'));
      assert.ok(formatoBtn, 'regex btn_camp_formato_ não encontrado');
      assert.equal(formatoBtn.test('btn_camp_formato_round-robin_' + oid), true);
      assert.equal(formatoBtn.test('btn_camp_formato_double-elimination_' + oid), true);
      assert.equal(formatoBtn.test('btn_camp_formato_single-elimination_' + oid), true);
      assert.equal(formatoBtn.test('btn_camp_formato_round-robin_oidinvalido'), false);
    });
  });
});
