const { InteractionRegistry } = require('../interactions/registry');
const calls = require('./calls/interactions');
const perfil = require('./perfil/interactions');
const lfg = require('./lfg/interactions');
const avaliacao = require('./avaliacao/interactions');

function createFeatureRegistry() {
  const registry = new InteractionRegistry();
  perfil.register(registry);
  lfg.register(registry);
  calls.register(registry);
  avaliacao.register(registry);
  return registry;
}

module.exports = { createFeatureRegistry };
