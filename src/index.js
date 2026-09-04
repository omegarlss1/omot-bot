const config = require('./config');
const { connectDb } = require('./db/connect');
const { startHttpServer } = require('./http/server');
const { createBot } = require('./bot/client');
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

async function registrarComandos(client) {
  if (!process.env.CLIIENT_ID || !process.env.GUILD_ID || !process.env.TOKKEN) return;
  const commandsPath = path.join(__dirname, 'src', 'bot', 'commands');
  if (!fs.existsSync(commandsPath)) return;
  const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
  const commands = [];
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    }
  }
  try {
    const rest = new REST().setToken(process.env.TOKKEN);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log(`[startup] ${commands.length} slash commands registrados/atualizados.`);
  } catch (err) {
    console.error('[startup] Erro ao registrar comandos:', err.message);
  }
}

async function main() {
  let client = null;

  if (!config.token) throw new Error('TOKEN não definida.');

  startHttpServer(() => ({
    ready: Boolean(client?.isReady()),
    tag: client?.user?.tag || null
  }), () => client);

  await connectDb();

  client = createBot();
  await client.login(config.token);

  client.once('ready', () => registrarComandos(client));
}

main().catch((err) => {
  console.error('Falha ao iniciar o Ômot:', err);
  process.exit(1);
});
