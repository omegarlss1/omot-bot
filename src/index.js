const config = require('./config');
const { connectDb } = require('./db/connect');
const { startHttpServer } = require('./http/server');
const { createBot } = require('./bot/client');

process.on('exit', (code) => {
  console.error('[PROCESS_EXIT]', {
    timestamp: new Date().toISOString(),
    code,
    message: 'Processo encerrado'
  });
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', {
    timestamp: new Date().toISOString(),
    message: err?.message,
    code: err?.code,
    stack: err?.stack
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', {
    timestamp: new Date().toISOString(),
    reason: reason instanceof Error ? {
      message: reason.message,
      code: reason.code,
      stack: reason.stack
    } : reason
  });
});

async function main() {
  let client = null;

  if (!config.token) throw new Error('TOKEN não definida.');

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
