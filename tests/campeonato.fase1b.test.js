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

test('CampeonatoFactory.maxJogadoresPorModo', async (t) => {
  await t.test('1v1 = 1, 3v3 = 3, 6v6 = 6, 12v12 = 12', () => {
    comEnv({}, () => {
      const { maxJogadoresPorModo } = require('../src/features/campeonato/factory/CampeonatoFactory');
      assert.equal(maxJogadoresPorModo('1v1'), 1);
      assert.equal(maxJogadoresPorModo('2v2'), 2);
      assert.equal(maxJogadoresPorModo('3v3'), 3);
      assert.equal(maxJogadoresPorModo('4v4'), 4);
      assert.equal(maxJogadoresPorModo('6v6'), 6);
      assert.equal(maxJogadoresPorModo('8v8'), 8);
      assert.equal(maxJogadoresPorModo('10v10'), 10);
      assert.equal(maxJogadoresPorModo('12v12'), 12);
    });
  });
});

test('CampeonatoFactory.sufixoDoEvento', async (t) => {
  await t.test('extrai número do nome', () => {
    comEnv({}, () => {
      const { sufixoDoEvento } = require('../src/features/campeonato/factory/CampeonatoFactory');
      assert.equal(sufixoDoEvento({ nome: 'Omega #42' }), '42');
      assert.equal(sufixoDoEvento({ nome: 'Evento 7' }), '7');
      assert.equal(sufixoDoEvento({ nome: 'Sem numero' }), '00');
    });
  });
});

test('interactions.parseDataBR', async (t) => {
  await t.test('aceita DD/MM/AAAA', () => {
    comEnv({}, () => {
      const { parseDataBR } = require('../src/features/campeonato/interactions');
      const d = parseDataBR('25/12/2026');
      assert.ok(d instanceof Date);
      assert.equal(d.getFullYear(), 2026);
      assert.equal(d.getMonth(), 11);
      assert.equal(d.getDate(), 25);
    });
  });

  await t.test('rejeita formatos inválidos', () => {
    comEnv({}, () => {
      const { parseDataBR } = require('../src/features/campeonato/interactions');
      assert.equal(parseDataBR('2026-12-25'), null);
      assert.equal(parseDataBR('25-12-2026'), null);
      assert.equal(parseDataBR('ontem'), null);
      assert.equal(parseDataBR(''), null);
    });
  });
});

test('interactions.temPermissaoOrganizador', async (t) => {
  await t.test('true para Administrator', () => {
    comEnv({}, () => {
      const { temPermissaoOrganizador } = require('../src/features/campeonato/interactions');
      const m = { permissions: { has: (p) => p === 'Administrator' }, roles: { cache: { has: () => false } } };
      assert.equal(temPermissaoOrganizador(m), true);
    });
  });

  await t.test('true para cargo OrganizadorCamps', () => {
    comEnv({}, () => {
      const { temPermissaoOrganizador } = require('../src/features/campeonato/interactions');
      const m = { permissions: { has: () => false }, roles: { cache: { has: (id) => id === '3' } } };
      assert.equal(temPermissaoOrganizador(m), true);
    });
  });

  await t.test('false para membro sem permissão', () => {
    comEnv({}, () => {
      const { temPermissaoOrganizador } = require('../src/features/campeonato/interactions');
      const m = { permissions: { has: () => false }, roles: { cache: { has: () => false } } };
      assert.equal(temPermissaoOrganizador(m), false);
    });
  });
});

test('permissions.permRank e permOrgao', async (t) => {
  await t.test('permRank retorna id correto do cargo', () => {
    comEnv({}, () => {
      const permissions = require('../src/features/campeonato/permissions');
      const ouro = permissions.permRank('ouro');
      assert.equal(ouro.id, '6');
      const champion = permissions.permRank('champion');
      assert.equal(champion.id, '9');
    });
  });

  await t.test('permRank lança erro para rank inexistente', () => {
    comEnv({}, () => {
      const permissions = require('../src/features/campeonato/permissions');
      assert.throws(() => permissions.permRank('inexistente'), /não configurado/);
    });
  });

  await t.test('permOrgao retorna id do OrganizadorCamps', () => {
    comEnv({}, () => {
      const permissions = require('../src/features/campeonato/permissions');
      const org = permissions.permOrgao();
      assert.equal(org.id, '3');
      assert.ok(Array.isArray(org.allow));
      assert.ok(org.allow.length > 0);
    });
  });
});

test('service.validarParametros', async (t) => {
  await t.test('lança erro se ranksSelecionados vazio', () => {
    comEnv({}, () => {
      const { validarParametros } = require('../src/features/campeonato/service');
      assert.throws(() => validarParametros({
        guildId: 'g', nome: 'Teste', ranksSelecionados: [],
        dataInicio: new Date(), dataFim: new Date(Date.now() + 1000), organizadorId: 'u'
      }), /ao menos 1 rank/);
    });
  });

  await t.test('lança erro se rank inválido', () => {
    comEnv({}, () => {
      const { validarParametros } = require('../src/features/campeonato/service');
      assert.throws(() => validarParametros({
        guildId: 'g', nome: 'Teste', ranksSelecionados: ['inexistente'],
        dataInicio: new Date(), dataFim: new Date(Date.now() + 1000), organizadorId: 'u'
      }), /Ranks inválidos/);
    });
  });

  await t.test('lança erro se data fim <= data início', () => {
    comEnv({}, () => {
      const { validarParametros } = require('../src/features/campeonato/service');
      const inicio = new Date('2026-12-25');
      const fim = new Date('2026-12-20');
      assert.throws(() => validarParametros({
        guildId: 'g', nome: 'Teste', ranksSelecionados: ['ouro'],
        dataInicio: inicio, dataFim: fim, organizadorId: 'u'
      }), /maior que data in\u00edcio/);
    });
  });

  await t.test('lança erro se ranks duplicados', () => {
    comEnv({}, () => {
      const { validarParametros } = require('../src/features/campeonato/service');
      assert.throws(() => validarParametros({
        guildId: 'g', nome: 'Teste', ranksSelecionados: ['ouro', 'ouro'],
        dataInicio: new Date('2026-12-01'), dataFim: new Date('2026-12-25'), organizadorId: 'u'
      }), /duplicados/);
    });
  });

  await t.test('retorna dados normalizados para input válido', () => {
    comEnv({}, () => {
      const { validarParametros } = require('../src/features/campeonato/service');
      const resultado = validarParametros({
        guildId: 'g', nome: '  Omega #42  ', ranksSelecionados: ['ouro', 'platina'],
        dataInicio: '2026-12-01', dataFim: '2026-12-25', organizadorId: 'u'
      });
      assert.equal(resultado.nome, 'Omega #42');
      assert.ok(resultado.dataInicio instanceof Date);
      assert.ok(resultado.dataFim instanceof Date);
    });
  });
});

test('handlers do módulo campeonato registrados', async (t) => {
  await t.test('5 handlers: 4 botões + 1 modal', () => {
    comEnv({}, () => {
      const { InteractionRegistry } = require('../src/interactions/registry');
      const interactions = require('../src/features/campeonato/interactions');
      const r = new InteractionRegistry();
      interactions.register(r);
      assert.equal(r.buttons.length, 4);
      assert.equal(r.modals.length, 1);
    });
  });
});
