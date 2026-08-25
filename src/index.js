const config = require('./config');
const { connectDb } = require('./db/connect');
const { startHttpServer } = require('./http/server');
const { createBot } = require('./bot/client');

async function main() {
  let client = null;

  startHttpServer(() => ({
    ready: Boolean(client?.isReady()),
    tag: client?.user?.tag || null
  }));

  await connectDb();

  client = createBot();
  await client.login(config.token);
}

main().catch((err) => {
  console.error('Falha ao iniciar o Ômot:', err);
  process.exit(1);
});
