const express = require('express');
const config = require('../config');
const { isDbReady } = require('../db/connect');

/**
 * Plano free do Render dorme após ~15 min sem tráfego HTTP.
 * O UptimeRobot deve pingar GET / (ou /health) para manter o Ômot acordado.
 * O Discord e o Express compartilham o mesmo processo: se o HTTP cair, o bot cai junto.
 */
function startHttpServer(getBotStatus) {
  const app = express();

  app.get('/', (req, res) => {
    res.send('Ômot ativo! 🚀');
  });

  app.get('/health', (req, res) => {
    const bot = getBotStatus ? getBotStatus() : {};
    const ok = isDbReady() && bot.ready === true;
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      mongo: isDbReady(),
      discord: Boolean(bot.ready),
      tag: bot.tag || null
    });
  });

  app.listen(config.port, () => {
    console.log(`HTTP (Render/UptimeRobot) na porta ${config.port}`);
  });

  return app;
}

module.exports = { startHttpServer };
