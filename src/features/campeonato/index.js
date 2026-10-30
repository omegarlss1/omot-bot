const { instance: events, emitir, EVENTOS } = require('./events');
const { criarEvento, validarParametros, EventoError } = require('./service');
const permissions = require('./permissions');
const CampeonatoFactory = require('./factory/CampeonatoFactory');

module.exports = {
  events,
  emitir,
  EVENTOS,
  criarEvento,
  validarParametros,
  EventoError,
  permissions,
  CampeonatoFactory
};
