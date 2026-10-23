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
    assert.equal(EVENTOS.TIME_ATUALIZADO, 'time.atualizado');
    assert.equal(EVENTOS.PLACAR_AJUSTADO, 'placar.ajustado');
    assert.equal(EVENTOS.STARTGG_SCORE_REPORTADO, 'startgg.score.reportado');
    assert.equal(EVENTOS.NOTIFICACAO_ENVIADA, 'notificacao.enviada');
  });
});

test('painel consolidado lista times, check-ins e placares com ações administrativas', () => {
  comEnv({}, () => {
    const { buildPainelOrganizadorCampeonato } = require('../src/features/campeonato/interactions');
    const campeonato = {
      _id: 'campeonato-id',
      nome: 'Copa Ômega',
      rank: 'ouro',
      status: 'INSCRICOES_ABERTAS',
      baseadoEmInscricoes: true,
      modalidade: null,
      limiteInscricoes: 8
    };
    const times = [
      { _id: 'time-a', nome: 'Time 1', capitaoId: 'player-1', jogadores: [{ userId: 'player-1', nickSnapshot: 'Player1' }] },
      { _id: 'time-b', nome: 'Time 2', capitaoId: 'player-4', jogadores: [{ userId: 'player-4', nickSnapshot: 'Player4' }] }
    ];
    const partidas = [{
      fase: 'R1',
      rodada: 1,
      status: 'AGUARDANDO_CHECKIN',
      timeA: 'time-a',
      timeB: 'time-b',
      checkIns: { timeA: { fez: true }, timeB: { fez: false } },
      placarEnviado: { timeA: null, timeB: null }
    }];

    const painel = buildPainelOrganizadorCampeonato({ campeonato, times, partidas });
    assert.equal(painel.embeds.length, 3);
    assert.match(painel.embeds[0].description, /Time 1/);
    assert.match(painel.embeds[0].description, /<@player-1>/);
    assert.match(painel.embeds[1].description, /Final/);
    assert.match(painel.embeds[1].description, /0 x 0/);
    assert.match(painel.embeds[1].description, /confirmado/);
    assert.match(painel.embeds[1].description, /<@player-4>/);
    const customIds = painel.components.flatMap((row) => row.toJSON().components.map((component) => component.custom_id));
    assert.ok(customIds.includes('btn_camp_broadcast'));
    assert.ok(customIds.includes('btn_camp_gerar_bracket'));
    assert.ok(customIds.includes('btn_camp_editar_config_campeonato-id'));
  });
});

test('painel de rank arquivado não oferece ações administrativas', () => {
  comEnv({}, () => {
    const { buildPainelOrganizadorCampeonato } = require('../src/features/campeonato/interactions');
    const painel = buildPainelOrganizadorCampeonato({
      campeonato: {
        _id: 'campeonato-id',
        nome: 'Copa Ômega',
        rank: 'ouro',
        status: 'INSCRICOES_ABERTAS',
        arquivado: true
      }
    });
    assert.match(painel.embeds[2].title, /Rank arquivado/);
    assert.equal(painel.components.length, 0);
  });
});

test('painel de criação empilha escolhas gerais e mostra opções condicionais na segunda etapa', () => {
  comEnv({}, () => {
    const { buildConfigPanel } = require('../src/features/campeonato/interactions');
    const configBase = {
      nome: 'Copa Ômega',
      dataInicio: new Date('2026-12-01T00:00:00'),
      dataLimiteInscricoes: new Date('2026-11-30T00:00:00'),
      horarioInicio: '19:00',
      descricao: '',
      ranksSelecionados: ['ouro'],
      simultaneo: true
    };
    const painelGeral = buildConfigPanel('organizador', {
      ...configBase,
      etapa: 'geral',
      modo: null,
      baseadoEmInscricoes: null
    });
    const linhasGerais = painelGeral.components.map((linha) => linha.toJSON().components);
    const idsGerais = linhasGerais.flat().map((componente) => componente.custom_id);
    assert.equal(linhasGerais.length, 5);
    assert.deepEqual(idsGerais.slice(0, 4), [
      'select_config_modo',
      'select_config_ranks',
      'select_config_simultaneo',
      'select_config_entrada'
    ]);
    const menuEntrada = linhasGerais.flat().find((componente) => componente.custom_id === 'select_config_entrada');
    assert.deepEqual(menuEntrada.options.map((opcao) => opcao.label), [
      'Jogadores ilimitados',
      'Definir limite de jogadores'
    ]);
    assert.ok(idsGerais.includes('btn_config_continuar'));

    const painelManual = buildConfigPanel('organizador', {
      ...configBase,
      etapa: 'avancado',
      modo: '2v2',
      tipoDupla: 'FIXA',
      baseadoEmInscricoes: false,
      formato: null,
      limiteInscricoes: 2
    });
    const linhasManuais = painelManual.components.map((linha) => linha.toJSON().components);
    const idsManuais = linhasManuais.flat().map((componente) => componente.custom_id);
    const menuFormato = linhasManuais.flat().find((componente) => componente.custom_id === 'select_config_formato');
    assert.ok(menuFormato);
    assert.ok(!menuFormato.options.some((opcao) => opcao.value === 'grupos-mata-mata'));
    assert.ok(idsManuais.includes('btn_config_limite'));
    assert.ok(!idsManuais.includes('btn_config_participantes'));
    assert.ok(!idsManuais.includes('select_config_entrada'));
    const botaoCriar = linhasManuais.flat().find((componente) => componente.custom_id === 'btn_config_criar');
    assert.equal(botaoCriar.disabled, true);

    const painelManualComFormato = buildConfigPanel('organizador', {
      ...configBase,
      etapa: 'avancado',
      modo: '2v2',
      tipoDupla: 'FIXA',
      baseadoEmInscricoes: false,
      formato: 'single',
      limiteInscricoes: 2
    });
    const botoesManualComFormato = painelManualComFormato.components
      .flatMap((linha) => linha.toJSON().components);
    assert.equal(
      botoesManualComFormato.find((componente) => componente.custom_id === 'btn_config_criar').disabled,
      false
    );

    const painelAberto = buildConfigPanel('organizador', {
      ...configBase,
      etapa: 'avancado',
      modo: '1v1',
      baseadoEmInscricoes: true
    });
    const idsAbertos = painelAberto.components
      .flatMap((linha) => linha.toJSON().components)
      .map((componente) => componente.custom_id);
    assert.ok(!idsAbertos.includes('btn_config_limite'));
    assert.ok(!idsAbertos.includes('select_config_tipo_dupla'));
    assert.ok(!idsAbertos.includes('select_config_formato'));
  });
});

test('formulário de inscrição respeita o limite de cinco campos e divide a lista em etapas', () => {
  comEnv({}, () => {
    const { construirModalInscricaoTime } = require('../src/features/campeonato/interactions');
    const campeonato = { _id: '0123456789abcdef01234567', maxJogadoresPorTime: 12 };
    const etapaInicial = construirModalInscricaoTime(campeonato, 0, 0).toJSON();
    const etapaSeguinte = construirModalInscricaoTime(campeonato, 1, 3).toJSON();
    const etapaFinal = construirModalInscricaoTime(campeonato, 2, 8).toJSON();
    const customIds = (modal) => modal.components.map((row) => row.components[0].custom_id);

    assert.equal(etapaInicial.components.length, 5);
    assert.deepEqual(customIds(etapaInicial), [
      'inscricao_time_nome',
      'inscricao_time_capitao',
      'inscricao_time_jogador_0',
      'inscricao_time_jogador_1',
      'inscricao_time_jogador_2'
    ]);
    assert.equal(etapaSeguinte.components.length, 5);
    assert.deepEqual(customIds(etapaFinal), [
      'inscricao_time_jogador_8',
      'inscricao_time_jogador_9',
      'inscricao_time_jogador_10'
    ]);
  });
});

test('inscreverTimeCompleto associa os nicks informados às contas Discord validadas', async () => {
  await comEnv({}, async () => {
    const Time = require('../src/db/models/time');
    const PerfilMembro = require('../src/db/models/perfilMembro');
    const { inscreverTimeCompleto } = require('../src/features/campeonato/services/inscricao');
    const originais = {
      findOne: Time.findOne,
      countDocuments: Time.countDocuments,
      create: Time.create,
      perfilFindOne: PerfilMembro.findOne
    };
    let timeCriado;
    Time.findOne = () => ({ lean: async () => null });
    Time.countDocuments = async () => 0;
    Time.create = async (dados) => {
      timeCriado = { ...dados, _id: 'time-id' };
      return timeCriado;
    };
    PerfilMembro.findOne = async ({ userId }) => ({
      userId,
      rankX1: 'ouro',
      nick_principal: `Perfil-${userId}`
    });
    const integrante = (id) => ({
      id,
      roles: { cache: { has: (roleId) => roleId === '6' } }
    });

    try {
      const resultado = await inscreverTimeCompleto({
        guild: { id: 'guild-id' },
        campeonato: {
          _id: 'campeonato-id',
          rank: 'ouro',
          modo: '2v2',
          maxJogadoresPorTime: 2,
          status: 'INSCRICOES_ABERTAS',
          baseadoEmInscricoes: true
        },
        capitao: integrante('capitao'),
        nickCapitao: 'NickCapitao',
        nomeTime: 'Time Omega',
        jogadores: [{ member: integrante('jogador'), nick: 'NickJogador' }]
      });

      assert.equal(resultado.time.nome, 'Time Omega');
      assert.deepEqual(timeCriado.jogadores.map(({ userId, nickSnapshot, isCapitao }) => ({ userId, nickSnapshot, isCapitao })), [
        { userId: 'capitao', nickSnapshot: 'NickCapitao', isCapitao: true },
        { userId: 'jogador', nickSnapshot: 'NickJogador', isCapitao: false }
      ]);
    } finally {
      Time.findOne = originais.findOne;
      Time.countDocuments = originais.countDocuments;
      Time.create = originais.create;
      PerfilMembro.findOne = originais.perfilFindOne;
    }
  });
});

test('serviço e validação de inscrição exportam a mesma classe de erro', () => {
  comEnv({}, () => {
    const { InscricaoError: erroDoServico } = require('../src/features/campeonato/services/inscricao');
    const { InscricaoError: erroDaValidacao } = require('../src/features/campeonato/validators/inscricao');
    assert.equal(typeof erroDoServico, 'function');
    assert.equal(erroDoServico, erroDaValidacao);
  });
});

test('publicarPaineisCampeonato publica os painéis e registra suas mensagens', async () => {
  await comEnv({}, async () => {
    const { publicarPaineisCampeonato } = require('../src/features/campeonato/interactions');
    const canais = new Map();
    let proximaMensagemId = 1;
    let salvou = false;

    for (const nome of ['inscricoes', 'organizador', 'avisos']) {
      canais.set(`${nome}-id`, {
        id: `${nome}-id`,
        isTextBased: () => true,
        mensagens: [],
        async send(payload) {
          this.mensagens.push(payload);
          const id = `mensagem-${proximaMensagemId++}`;
          return {
            id,
            components: (payload.components || []).map((row) => ({
              components: row.components.map((component) => ({ customId: component.data.custom_id }))
            }))
          };
        }
      });
    }

    const guild = {
      channels: {
        fetch: async (id) => canais.get(id)
      }
    };
    const campeonato = {
      _id: 'campeonato-id',
      nome: 'Ômega #42 - OURO',
      rank: 'ouro',
      modo: '3v3',
      tipoDupla: 'SORTEADA',
      status: 'INSCRICOES_ABERTAS',
      baseadoEmInscricoes: true,
      canais: {
        inscricoes: 'inscricoes-id',
        organizador: 'organizador-id',
        avisos: 'avisos-id'
      },
      save: async () => { salvou = true; }
    };

    const resultado = await publicarPaineisCampeonato(guild, campeonato);

    assert.deepEqual(resultado, { inscricoes: true, organizador: true, avisos: true });
    assert.equal(canais.get('inscricoes-id').mensagens.length, 1);
    assert.ok(canais.get('inscricoes-id').mensagens[0].components[0].components
      .some((component) => component.data.custom_id === 'btn_camp_inscrever_time'));
    assert.equal(canais.get('organizador-id').mensagens.length, 1);
    assert.equal(canais.get('organizador-id').mensagens[0].embeds.length, 3);
    assert.ok(canais.get('organizador-id').mensagens[0].components
      .some((row) => row.components.some((component) => component.data.custom_id === 'btn_camp_broadcast')));
    assert.equal(canais.get('avisos-id').mensagens.length, 1);
    assert.ok(campeonato.painelOrganizador.fixaMessageId);
    assert.ok(campeonato.painelOrganizador.mensagens.gestao);
    assert.equal(salvou, true);
  });
});

test('publicarPaineisCampeonato continua publicando outros painéis se inscrição falhar', async () => {
  await comEnv({}, async () => {
    const { publicarPaineisCampeonato } = require('../src/features/campeonato/interactions');
    const ids = ['inscricoes-id', 'organizador-id', 'avisos-id'];
    const guild = {
      channels: {
        fetch: async (id) => ({
          id,
          isTextBased: () => true,
          async send() {
            if (id === 'inscricoes-id') throw new Error('Falha simulada');
            return { id: `mensagem-${id}`, components: [] };
          }
        })
      }
    };
    const campeonato = {
      _id: 'campeonato-id',
      nome: 'Ômega #42 - OURO',
      rank: 'ouro',
      modo: '3v3',
      status: 'INSCRICOES_ABERTAS',
      baseadoEmInscricoes: true,
      canais: {
        inscricoes: ids[0],
        organizador: ids[1],
        avisos: ids[2]
      },
      save: async () => {}
    };
    const logAnterior = console.error;
    console.error = () => {};
    try {
      const resultado = await publicarPaineisCampeonato(guild, campeonato);
      assert.deepEqual(resultado, { inscricoes: false, organizador: true, avisos: true });
      assert.equal(campeonato.painelInscricaoErro, true);
    } finally {
      console.error = logAnterior;
    }
  });
});

test('atualizarPainelOrganizadorCampeonato edita a mensagem persistida', async () => {
  await comEnv({}, async () => {
    const interactions = require('../src/features/campeonato/interactions');
    const Campeonato = require('../src/db/models/campeonato');
    const Time = require('../src/db/models/time');
    const Partida = require('../src/db/models/partida');
    const campeonato = {
      _id: 'campeonato-id',
      nome: 'Copa Ômega',
      rank: 'ouro',
      status: 'INSCRICOES_ABERTAS',
      baseadoEmInscricoes: true,
      canais: { organizador: 'organizador-id' },
      painelOrganizador: { fixaMessageId: 'painel-id' }
    };
    const time = { _id: 'time-id', nome: 'Time atualizado', jogadores: [] };
    const mensagem = {
      id: 'painel-id',
      async edit(payload) { this.payload = payload; }
    };
    const originais = {
      campeonatoFindById: Campeonato.findById,
      timeFind: Time.find,
      partidaFind: Partida.find
    };
    Campeonato.findById = () => ({ lean: async () => campeonato });
    Time.find = () => ({ lean: async () => [time] });
    Partida.find = () => ({
      sort() { return this; },
      lean: async () => []
    });
    interactions.setCampeonatoClient({
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          messages: { fetch: async () => mensagem }
        })
      }
    });

    try {
      const atualizado = await interactions.atualizarPainelOrganizadorCampeonato('campeonato-id');
      assert.equal(atualizado, true);
      assert.match(mensagem.payload.embeds[0].description, /Time atualizado/);
      assert.equal(mensagem.payload.embeds.length, 3);
    } finally {
      interactions.setCampeonatoClient(null);
      Campeonato.findById = originais.campeonatoFindById;
      Time.find = originais.timeFind;
      Partida.find = originais.partidaFind;
    }
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
