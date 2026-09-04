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

test('eventos: novos eventos da Fase 3 registrados', () => {
  comEnv({}, () => {
    const { EVENTOS } = require('../src/features/campeonato/events');
    assert.equal(EVENTOS.CAMPEAO_DEFINIDO, 'campeao.definido');
    assert.equal(EVENTOS.CAMPEONATO_CANCELADO, 'campeonato.cancelado');
    assert.equal(EVENTOS.CAMPEONATO_REABERTO, 'campeonato.reaberto');
    assert.equal(EVENTOS.TIME_DESCLASSIFICADO, 'time.desclassificado');
    assert.equal(EVENTOS.PLACAR_AJUSTADO, 'placar.ajustado');
    assert.equal(EVENTOS.STARTGG_SCORE_REPORTADO, 'startgg.score.reportado');
    assert.equal(EVENTOS.NOTIFICACAO_ENVIADA, 'notificacao.enviada');
  });
});

test('finalizacao.podio - ordenação', async (t) => {
  await t.test('_posicionarSemifinalistas ordena por pontos, vitorias, menos wo', () => {
    comEnv({}, () => {
      const { _posicionarSemifinalistas } = require('../src/features/campeonato/services/finalizacao');
      const perfis = [
        { _id: 'a', pontos: 3, vitorias: 1, woTomados: 0 },
        { _id: 'b', pontos: 6, vitorias: 2, woTomados: 0 },
        { _id: 'c', pontos: 6, vitorias: 2, woTomados: 1 }
      ];
      const r = _posicionarSemifinalistas(perfis);
      assert.equal(r[0]._id, 'b');
      assert.equal(r[1]._id, 'c');
      assert.equal(r[2]._id, 'a');
    });
  });

  await t.test('desclassificados sao ignorados na ordenação', () => {
    comEnv({}, () => {
      const { _posicionarSemifinalistas } = require('../src/features/campeonato/services/finalizacao');
      const perfis = [
        { _id: 'a', pontos: 99, vitorias: 9, woTomados: 0, desclassificado: true },
        { _id: 'b', pontos: 3, vitorias: 1, woTomados: 0 }
      ];
      const r = _posicionarSemifinalistas(perfis);
      assert.equal(r[0]._id, 'b');
    });
  });
});

test('admin.AjustarPlacarValidacao', async (t) => {
  await t.test('parsePlacar para ajuste deve validar formato', () => {
    comEnv({}, () => {
      const { parsePlacar } = require('../src/features/campeonato/validators/placar');
      assert.deepEqual(parsePlacar('3x2'), { golsA: 3, golsB: 2 });
      assert.equal(parsePlacar('abc'), null);
    });
  });
});

test('notificacoes.notificarCampeao - sem client', async (t) => {
  await t.test('retorna CLIENT_INDISPONIVEL quando nao ha client', async () => {
    comEnv({}, async () => {
      const { notificarCampeao, _setClient } = require('../src/features/campeonato/services/notificacoes');
      _setClient(null);
      const r = await notificarCampeao({
        campeonatoId: 'c1',
        vencedor: { capitaoId: 'u1', nome: 'Time A' },
        podio: [{ posicao: 1, nome: 'Time A' }, { posicao: 2, nome: 'Time B' }]
      });
      assert.equal(r.ok, false);
      assert.equal(r.motivo, 'CLIENT_INDISPONIVEL');
    });
  });

  await t.test('lança quando vencedor sem capitaoId', async () => {
    comEnv({}, async () => {
      const { notificarCampeao, NotificacaoError } = require('../src/features/campeonato/services/notificacoes');
      await assert.rejects(
        () => notificarCampeao({ campeonatoId: 'c1', vencedor: { nome: 'A' } }),
        (err) => err instanceof NotificacaoError && err.code === 'VENCEDOR_SEM_CAPITAO'
      );
    });
  });

  await t.test('com client mockado envia DM com sucesso', async () => {
    comEnv({}, async () => {
      const { notificarCampeao, _setClient } = require('../src/features/campeonato/services/notificacoes');
      let enviado = null;
      const fakeClient = {
        users: {
          fetch: async (id) => ({
            send: async (msg) => { enviado = { id, msg }; }
          })
        }
      };
      _setClient(fakeClient);
      const r = await notificarCampeao({
        campeonatoId: 'c1',
        vencedor: { capitaoId: 'u1', nome: 'Time A' },
        podio: [{ posicao: 1, nome: 'Time A' }, { posicao: 2, nome: 'Time B' }]
      });
      assert.equal(r.ok, true);
      assert.equal(enviado.id, 'u1');
      assert.match(enviado.msg.embeds[0].title, /campeão/i);
      assert.match(enviado.msg.embeds[0].description, /Time A/);
    });
  });
});

test('placar: integracao StartGG - retorna sem_set_id quando partida nao tem startggSetId', () => {
  comEnv({}, async () => {
    const { _tentarReportarStartGG, _setAdapter, _setModels } = require('../src/features/campeonato/services/placar');
    let chamadas = 0;
    _setAdapter({ reportScore: async () => { chamadas++; return { id: 'set1' }; } });
    _setModels({
      partida: { findById: async () => ({ startggSetId: null, campeonatoId: 'c1' }) },
      campeonato: { findById: async () => ({ startgg: { tournamentId: 't1' } }) }
    });
    const r = await _tentarReportarStartGG('p1', 'tA', '3x1');
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'SEM_SET_ID');
    assert.equal(chamadas, 0);
  });
});

test('placar: integracao StartGG - chama reportScore quando setId e tournamentId existem', () => {
  comEnv({}, async () => {
    const { _tentarReportarStartGG, _setAdapter, _setModels } = require('../src/features/campeonato/services/placar');
    let chamadas = 0;
    let ultima = null;
    _setAdapter({ reportScore: async (args) => { chamadas++; ultima = args; return { id: 'set-novo', state: 'completed' }; } });
    _setModels({
      partida: { findById: async () => ({ startggSetId: 'set-abc', campeonatoId: 'c1' }) },
      campeonato: { findById: async () => ({ startgg: { tournamentId: 't1' } }) }
    });
    const r = await _tentarReportarStartGG('p1', 'tA', '3x1');
    assert.equal(r.ok, true);
    assert.equal(chamadas, 1);
    assert.equal(ultima.setId, 'set-abc');
    assert.equal(ultima.winnerId, 'tA');
  });
});

test('embeds novos da Fase 3 existem', () => {
  comEnv({}, () => {
    const embeds = require('../src/features/campeonato/embeds');
    assert.equal(typeof embeds.embedCampeaoDefinido, 'function');
    assert.equal(typeof embeds.embedPainelAdmin, 'function');
    assert.equal(typeof embeds.embedCancelamentoConfirmado, 'function');
    assert.equal(typeof embeds.embedReaberturaConfirmada, 'function');
    assert.equal(typeof embeds.embedTimeDesclassificado, 'function');
    assert.equal(typeof embeds.embedPlacarAjustado, 'function');
  });
});
