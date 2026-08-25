const { InteractionRegistry } = require('../interactions/registry');
const calls = require('./calls/interactions');
const perfil = require('./perfil/interactions');
const lfg = require('./lfg/interactions');

function createFeatureRegistry() {
  const registry = new InteractionRegistry();
  perfil.register(registry);
  lfg.register(registry);
  calls.register(registry);
  return registry;
}

module.exports = { createFeatureRegistry };
