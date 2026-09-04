const test = require('node:test');
const assert = require('node:assert/strict');

const { requireEnv, optionalEnv, mascarar, redacaoSegura, ConfigError } = require('../src/config/secrets');
const regulamento = require('../src/config/regulamento');
const { instance: events, emitir, EVENTOS } = require('../src/features/campeonato/events');

const RANK_KEYS = ['bronze', 'prata', 'ouro', 'platina', 'diamante', 'champion', 'grand_champion', 'omega_champion'];
const ENV_BASE = () => ({
  TOKEN: 'test', MONGODB_URI: 'mongodb://x', CANAL_PINGS_ID: '1',
  CARGO_RLSIDESWIPE_ID: '1', CARGO_JOGOSDIVERSOS_ID: '2',
  CARGO_ORGANIZADORCAMPS_ID: '3',
  ...Object.fromEntries(RANK_KEYS.map((k, i) => [`CARGO_${k.toUpperCase()}_ID`, String(10 + i)])),
  STARTGG_TOKEN: 'tok'
});

function comEnv(extra = {}) {
  const snapshot = { ...process.env };
  Object.entries({ ...ENV_BASE(), ...extra }).forEach(([k, v]) => { process.env[k] = v; });
  return () => {
    for (const k of Object.keys(process.env)) {
      if (!(k in snapshot)) delete process.env[k];
    }
    Object.assign(process.env, snapshot);
  };
}

test('config.ranks e cargosRanks', async (t) => {
  await t.test('inclui 8 ranks: bronze, prata, ouro, platina, diamante, champion, grand_champion, omega_champion', () => {
    const restore = comEnv();
    try {
      const config = require('../src/config');
      assert.deepEqual(config.ranks.map((r) => r.key), RANK_KEYS);
      assert.deepEqual(Object.keys(config.campeonato.cargosRanks), RANK_KEYS);
      assert.equal(config.campeonato.cargoOrganizacaoId, '3');
    } finally { restore(); }
  });
});

test('secrets.requireEnv', async (t) => {
  await t.test('retorna valor quando setado', () => {
    process.env.TEST_SECRET_X = 'abc123';
    assert.equal(requireEnv('TEST_SECRET_X'), 'abc123');
    delete process.env.TEST_SECRET_X;
  });

  await t.test('lança ConfigError quando ausente', () => {
    delete process.env.TEST_SECRET_Y;
    assert.throws(() => requireEnv('TEST_SECRET_Y'), (err) => {
      return err instanceof ConfigError && err.code === 'CONFIG_MISSING_VAR' && err.message.includes('TEST_SECRET_Y');
    });
  });

  await t.test('lança ConfigError quando vazia', () => {
    process.env.TEST_SECRET_Z = '';
    assert.throws(() => requireEnv('TEST_SECRET_Z'), ConfigError);
    delete process.env.TEST_SECRET_Z;
  });
});

test('secrets.optionalEnv', async (t) => {
  await t.test('retorna fallback quando ausente', () => {
    delete process.env.TEST_OP_A;
    assert.equal(optionalEnv('TEST_OP_A', 'fb'), 'fb');
  });
  await t.test('retorna valor quando setado', () => {
    process.env.TEST_OP_B = 'valor';
    assert.equal(optionalEnv('TEST_OP_B', 'fb'), 'valor');
    delete process.env.TEST_OP_B;
  });
});

test('secrets.mascarar', async (t) => {
  await t.test('mascara tokens curtos', () => {
    assert.equal(mascarar('abc'), '***');
  });
  await t.test('mascera tokens longos mostrando início e fim', () => {
    assert.equal(mascarar('sk-1234567890abcdef'), 'sk-1…cdef');
  });
  await t.test('retorna vazio para valor ausente', () => {
    assert.equal(mascarar(''), '');
    assert.equal(mascarar(null), '');
  });
});

test('secrets.redacaoSegura', async (t) => {
  await t.test('substitui segredos em strings', () => {
    process.env.STARTGG_TOKEN = 'minha-chave-secreta-1234';
    const out = redacaoSegura('Authorization: Bearer minha-chave-secreta-1234 fim');
    assert.equal(out[0], 'Authorization: Bearer <STARTGG_TOKEN> fim');
    delete process.env.STARTGG_TOKEN;
  });

  await t.test('não substitui quando a var não está setada', () => {
    delete process.env.STARTGG_TOKEN;
    const out = redacaoSegura('texto sem segredo');
    assert.equal(out[0], 'texto sem segredo');
  });
});

test('regulamento.carregar', async (t) => {
  await t.test('carrega e cacheia', () => {
    regulamento.invalidar();
    const r = regulamento.carregar();
    assert.equal(r.pontuacao.vitoria, 3);
    assert.equal(r.checkin.janelaMin, 30);
    assert.equal(r.corte.incluirDisputa3Lugar, true);
  });

  await t.test('get retorna valor por caminho', () => {
    assert.equal(regulamento.get('pontuacao.vitoria'), 3);
    assert.equal(regulamento.get('checkin.janelaMin'), 30);
  });

  await t.test('get retorna undefined para caminho inválido', () => {
    assert.equal(regulamento.get('nao.existe.aqui'), undefined);
  });
});

test('campeonato.events', async (t) => {
  await t.test('emite e escuta eventos', () => {
    let recebido = null;
    const listener = (payload) => { recebido = payload; };
    events.on(EVENTOS.EVENTO_CRIADO, listener);
    emitir(EVENTOS.EVENTO_CRIADO, { id: 'evt1' });
    assert.deepEqual(recebido, { id: 'evt1' });
    events.off(EVENTOS.EVENTO_CRIADO, listener);
  });

  await t.test('lança erro em evento desconhecido', () => {
    assert.throws(() => emitir('EVENTO_FAKE', {}), /Evento desconhecido/);
  });
});
