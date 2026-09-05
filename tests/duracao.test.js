const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularFasesSimultaneo, calcularFasesEscalonado, gerarDescricaoEvento } = require('../src/features/campeonato/services/duracao');

test('duracao.simultaneo', async (t) => {
  await t.test('16 times simples = 4 fases', () => {
    const r = calcularFasesSimultaneo({ numTimes: 16, modo: 'simples', duracaoMin: 180 });
    assert.equal(r.fases, 4);
    assert.equal(r.duracaoReal <= 180, true);
  });

  await t.test('64 times = 6 fases', () => {
    const r = calcularFasesSimultaneo({ numTimes: 64, modo: 'simples', duracaoMin: 180 });
    assert.equal(r.fases, 6);
  });

  await t.test('modo dupla dobra fases', () => {
    const r = calcularFasesSimultaneo({ numTimes: 16, modo: 'dupla', duracaoMin: 180 });
    assert.ok(r.fases > 4);
  });

  await t.test('modo tripla triplica fases', () => {
    const r = calcularFasesSimultaneo({ numTimes: 16, modo: 'tripla', duracaoMin: 180 });
    assert.ok(r.fases > 8);
  });
});

test('duracao.escalonado', async (t) => {
  await t.test('16 times = 15 partidas (3h = 3 dias)', () => {
    const r = calcularFasesEscalonado({ numTimes: 16, modo: 'simples', duracaoMin: 180 });
    assert.equal(r.partidas, 15);
    assert.equal(r.dias, 3);
  });

  await t.test('64 times simples = 63 partidas', () => {
    const r = calcularFasesEscalonado({ numTimes: 64, modo: 'simples', duracaoMin: 180 });
    assert.equal(r.partidas, 63);
    assert.ok(r.dias > 1);
  });
});

test('duracao.gerarDescricaoEvento', async (t) => {
  await t.test('SABADO 19:00 + 3h = termino 22:00', () => {
    const data = new Date(2026, 8, 12);
    const r = gerarDescricaoEvento({ dataInicio: data, duracaoMin: 180, numTimes: 16, modo: 'simples', simultaneo: true });
    assert.match(r.descricao, /SÁBADO/);
    assert.match(r.descricao, /19:00/);
    assert.match(r.descricao, /22:00/);
  });

  await t.test('DOMINGO 14:30 + 3h = termino 17:30', () => {
    const data = new Date('2026-09-13T00:00:00-03:00');
    const r = gerarDescricaoEvento({ dataInicio: data, duracaoMin: 180, numTimes: 8, modo: 'simples', simultaneo: true });
    assert.match(r.descricao, /DOMINGO/);
    assert.match(r.descricao, /14:30/);
    assert.match(r.descricao, /17:30/);
  });
});
