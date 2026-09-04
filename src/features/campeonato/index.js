const { instance: events, emitir, EVENTOS } = require('./events');
const { criarEvento, validarParametros, EventoError } = require('./service');
const { StartGGAdapter, RateLimiter } = require('./adapters/StartGGAdapter');
const permissions = require('./permissions');
const CampeonatoFactory = require('./factory/CampeonatoFactory');

module.exports = {
  events,
  emitir,
  EVENTOS,
  criarEvento,
  validarParametros,
  EventoError,
  StartGGAdapter,
  RateLimiter,
  permissions,
  CampeonatoFactory
};
