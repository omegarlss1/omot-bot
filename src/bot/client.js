const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands, loadEvents } = require('./loaders');
const { CallsStore } = require('../features/calls/store');
const { GatilhosStore } = require('../features/calls/gatilhosStore');
const { createFeatureRegistry } = require('../features');

function createBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
  });

  client.on('error', (error) => {
    console.error('[CLIENT_ERROR]', {
      timestamp: new Date().toISOString(),
      message: error?.message,
      stack: error?.stack,
      code: error?.code
    });
  });

  client.on('shardError', (error, shardId) => {
    console.error('[SHARD_ERROR]', {
      timestamp: new Date().toISOString(),
      shardId,
      message: error?.message,
      stack: error?.stack,
      code: error?.code
    });
  });

  client.rest.on('rateLimited', (dadosRateLimit) => {
    console.log('REST rate limited:', dadosRateLimit);
  });

  client.commands = new Collection();
  client.stores = {
    calls: new CallsStore(),
    gatilhos: new GatilhosStore()
  };
  client.features = createFeatureRegistry();

  loadCommands(client);
  loadEvents(client);

  return client;
}

module.exports = { createBot };
