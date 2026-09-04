const { InteractionRegistry } = require('../interactions/registry');
const calls = require('./calls/interactions');
const perfil = require('./perfil/interactions');
const lfg = require('./lfg/interactions');
const avaliacao = require('./avaliacao/interactions');
const hub = require('./hub/interactions');
const campeonato = require('./campeonato/interactions');

function createFeatureRegistry() {
  const registry = new InteractionRegistry();
  perfil.register(registry);
  lfg.register(registry);
  calls.register(registry);
  avaliacao.register(registry);
  hub.register(registry);
  campeonato.register(registry);
  return registry;
}

module.exports = { createFeatureRegistry };
