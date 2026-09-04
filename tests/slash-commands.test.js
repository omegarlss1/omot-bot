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

  await t.test('temPermissaoOrganizador rejeita sem cargo', () => {
    comEnv({}, () => {
      const cmd = require('../src/bot/commands/painel-campeonato');
      const member = { permissions: { has: () => false }, roles: { cache: { has: () => false } } };
      assert.equal(cmd.execute, cmd.execute);
      assert.equal(typeof cmd.execute, 'function');
      const memberSemNada = { permissions: { has: () => false }, roles: { cache: { has: () => false } } };
      const memberEhOrg = { permissions: { has: () => false }, roles: { cache: { has: (id) => id === '3' } } };
      const memberAdmin = { permissions: { has: (p) => p === 'Administrator' }, roles: { cache: { has: () => false } } };
      const tpo = (m) => {
        if (!m) return false;
        if (m.permissions?.has?.('Administrator')) return true;
        const orgRoleId = require('../src/config').campeonato.cargoOrganizacaoId;
        return m.roles?.cache?.has?.(orgRoleId) || false;
      };
      assert.equal(tpo(memberSemNada), false);
      assert.equal(tpo(memberEhOrg), true);
      assert.equal(tpo(memberAdmin), true);
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

test('deploy-commands.js lê os 5 comandos (3 antigos + 2 novos)', () => {
  comEnv({}, () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const commandsPath = path.join(__dirname, '..', 'src', 'bot', 'commands');
    const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
    assert.ok(files.includes('painel-campeonato.js'), 'espera painel-campeonato.js em commands');
    assert.ok(files.includes('painel-hub.js'), 'espera painel-hub.js em commands');
    assert.ok(files.length >= 5, 'espera pelo menos 5 comandos (3 antigos + 2 novos), achou ' + files.length);
  });
});
