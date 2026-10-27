const test = require('node:test');
const assert = require('node:assert/strict');

const ENV_BASE = {
  TOKEN: 't', MONGODB_URI: 'm', CANAL_PINGS_ID: '1',
  CARGO_RLSIDESWIPE_ID: '1', CARGO_JOGOSDIVERSOS_ID: '2',
  CARGO_ORGANIZADORCAMPS_ID: '3',
  CARGO_BRONZE_ID: '4', CARGO_PRATA_ID: '5', CARGO_OURO_ID: '6',
  CARGO_PLATINA_ID: '7', CARGO_DIAMANTE_ID: '8', CARGO_CHAMPION_ID: '9',
  CARGO_GRAND_CHAMPION_ID: '10', CARGO_OMEGA_CHAMPION_ID: '11',
  STARTGG_TOKEN: 't', CLIENT_ID: 'c', GUILD_ID: 'g'
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

test('slash /debug-config', async (t) => {
  await t.test('data.toJSON() tem name, description e default_member_permissions', () => {
    comEnv({}, () => {
      const cmd = require('../src/bot/commands/debug-config');
      const json = cmd.data.toJSON();
      assert.equal(json.name, 'debug-config');
      assert.match(json.description, /env/);
      assert.equal(json.default_member_permissions, String(1n << 3n));
    });
  });

  await t.test('execute é uma função', () => {
    comEnv({}, () => {
      const cmd = require('../src/bot/commands/debug-config');
      assert.equal(typeof cmd.execute, 'function');
    });
  });

  await t.test('buildDebugMessage marca faltando quando env está incompleta', () => {
    comEnv({ CANAL_PINGS_ID: '' }, () => {
      const cmd = require('../src/bot/commands/debug-config');
      const msg = cmd.buildDebugMessage();
      assert.match(msg, /CANAL_PINGS_ID/);
      assert.match(msg, /faltando/);
    });
  });

  await t.test('buildDebugMessage mostra tudo ok quando env está completa', () => {
    comEnv({}, () => {
      const cmd = require('../src/bot/commands/debug-config');
      const msg = cmd.buildDebugMessage();
      assert.match(msg, /Todas as env vars obrigatórias estão setadas/);
    });
  });
});

test('slash /startgg-diagnostico', async (t) => {
  await t.test('é restrito a administradores', () => {
    comEnv({}, () => {
      const cmd = require('../src/bot/commands/startgg-diagnostico');
      const json = cmd.data.toJSON();
      assert.equal(json.name, 'startgg-diagnostico');
      assert.equal(json.default_member_permissions, String(1n << 3n));
    });
  });

  await t.test('não consulta a API para quem não é administrador', async () => {
    comEnv({}, async () => {
      const cmd = require('../src/bot/commands/startgg-diagnostico');
      let respondeu = false;
      await cmd.execute({
        member: { permissions: { has: () => false } },
        reply: async (payload) => {
          respondeu = true;
          assert.match(payload.content, /Apenas administradores/);
        }
      });
      assert.equal(respondeu, true);
    });
  });

  await t.test('consulta e formata somente os dados do schema', async () => {
    comEnv({}, async () => {
      const { consultarSchema } = require('../src/bot/commands/startgg-diagnostico');
      const queriesRecebidas = [];
      const diagnostico = await consultarSchema({
        request: async ({ query }) => {
          queriesRecebidas.push(query);
          if (queriesRecebidas.length === 1) {
            return {
              mutation: {
                fields: [
                  { name: 'createTournament', args: [{ name: 'tournament', type: { kind: 'INPUT_OBJECT', name: 'RealTournamentInput' } }] },
                  { name: 'reportScore', args: [{ name: 'setId', type: { kind: 'SCALAR', name: 'ID' } }] },
                  { name: 'upsertPhase', args: [{ name: 'phase', type: { kind: 'INPUT_OBJECT', name: 'RealPhaseInput' } }] }
                ]
              }
            };
          }
          if (queriesRecebidas.length === 2) {
            return {
              tipo0: {
                name: 'RealTournamentInput',
                kind: 'INPUT_OBJECT',
                inputFields: [{ name: 'name', type: { kind: 'SCALAR', name: 'String' } }]
              },
              tipo1: {
                name: 'RealPhaseInput',
                kind: 'INPUT_OBJECT',
                inputFields: [{ name: 'bracketType', type: { kind: 'ENUM', name: 'ActualBracketKind' } }]
              }
            };
          }
          return {
            tipo0: {
              name: 'ActualBracketKind',
              kind: 'ENUM',
              enumValues: [{ name: 'DOUBLE_ELIMINATION' }]
            }
          };
        }
      });

      assert.match(queriesRecebidas[0], /__type\(name: "Mutation"\)/);
      assert.doesNotMatch(queriesRecebidas[0], /TournamentCreateInput/);
      assert.match(queriesRecebidas[1], /__type\(name: "RealTournamentInput"\)/);
      assert.match(queriesRecebidas[1], /__type\(name: "RealPhaseInput"\)/);
      assert.match(queriesRecebidas[2], /__type\(name: "ActualBracketKind"\)/);
      assert.match(diagnostico, /createTournament\(tournament: RealTournamentInput\)/);
      assert.match(diagnostico, /upsertPhase/);
      assert.doesNotMatch(diagnostico, /reportScore/);
      assert.match(diagnostico, /RealTournamentInput: name: String/);
      assert.match(diagnostico, /DOUBLE_ELIMINATION/);
      assert.doesNotMatch(diagnostico, /STARTGG_TOKEN|Bearer|Authorization/);
    });
  });
});

test('slash /painel-campeonato', async (t) => {
  await t.test('data.toJSON() tem name, description, default_member_permissions e opcao silencioso', () => {
    comEnv({}, () => {
      const cmd = require('../src/bot/commands/painel-campeonato');
      const json = cmd.data.toJSON();
      assert.equal(json.name, 'painel-campeonato');
      assert.match(json.description, /painel/);
      assert.equal(json.default_member_permissions, String(1n << 3n));
      assert.equal(json.options.length, 1);
      assert.equal(json.options[0].name, 'silencioso');
      assert.equal(json.options[0].type, 5);
    });
  });

  await t.test('execute é uma função', () => {
    comEnv({}, () => {
      const cmd = require('../src/bot/commands/painel-campeonato');
      assert.equal(typeof cmd.execute, 'function');
    });
  });
});

test('slash /painel-hub', async (t) => {
  await t.test('data.toJSON() tem name, description, default_member_permissions e opcao silencioso', () => {
    comEnv({}, () => {
      const cmd = require('../src/bot/commands/painel-hub');
      const json = cmd.data.toJSON();
      assert.equal(json.name, 'painel-hub');
      assert.match(json.description, /hub/);
      assert.equal(json.default_member_permissions, String(1n << 3n));
      assert.equal(json.options.length, 1);
      assert.equal(json.options[0].name, 'silencioso');
    });
  });

  await t.test('execute é uma função', () => {
    comEnv({}, () => {
      const cmd = require('../src/bot/commands/painel-hub');
      assert.equal(typeof cmd.execute, 'function');
    });
  });
});

test('deploy-commands.js lê os 6 comandos (3 antigos + 3 novos)', () => {
  comEnv({}, () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const commandsPath = path.join(__dirname, '..', 'src', 'bot', 'commands');
    const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
    assert.ok(files.includes('painel-campeonato.js'), 'espera painel-campeonato.js em commands');
    assert.ok(files.includes('painel-hub.js'), 'espera painel-hub.js em commands');
    assert.ok(files.includes('debug-config.js'), 'espera debug-config.js em commands');
    assert.ok(files.includes('startgg-diagnostico.js'), 'espera startgg-diagnostico.js em commands');
    assert.ok(files.length >= 6, 'espera pelo menos 6 comandos (3 antigos + 3 novos), achou ' + files.length);
  });
});
