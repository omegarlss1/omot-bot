const express = require('express');
const config = require('../config');
const { isDbReady } = require('../db/connect');
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

function startHttpServer(getBotStatus, getClient) {
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

  app.get('/register-commands', async (req, res) => {
    const secret = req.query.secret;
    if (!secret || secret !== process.env.RENDER_REGISTER_SECRET) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
      const token = config.token;
      const client = getClient ? getClient() : null;
      const clientId = client?.user?.id || process.env.CLIENT_ID;
      const guildId = process.env.GUILD_ID;
      if (!token || !clientId || !guildId) {
        return res.status(500).json({ error: 'Faltam TOKEN, CLIENT_ID ou GUILD_ID' });
      }
      const commandsPath = path.join(__dirname, '..', 'bot', 'commands');
      const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
      const commands = [];
      for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command && 'execute' in command) {
          commands.push(command.data.toJSON());
        }
      }
      const rest = new REST().setToken(token);
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      res.json({ ok: true, registrados: data.length, comandos: data.map((c) => c.name) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(config.port, () => {
    console.log(`HTTP (Render/UptimeRobot) na porta ${config.port}`);
  });

  return app;
}

module.exports = { startHttpServer };
