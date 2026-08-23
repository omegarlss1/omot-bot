const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

// Inicializa o cliente do bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();

// 1. CARREGAMENTO E REGISTRO AUTOMÁTICO DE COMANDOS SLASH
const commands = [];
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
    } else {
      console.log(`[AVISO] O comando em ${filePath} está faltando a propriedade "data" ou "execute".`);
    }
  }
}

// Envia a lista de comandos para a API do Discord
if (process.env.DISCORD_TOKEN && process.env.CLIENT_ID && process.env.GUILD_ID) {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  (async () => {
    try {
      console.log(`🔄 Registrando ${commands.length} comandos (/) na API do Discord...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`✅ ${commands.length} comandos registrados com sucesso no Discord!`);
    } catch (err) {
      console.error('❌ Erro no registro de comandos:', err);
    }
  })();
} else {
  console.log('⚠️ Faltam variáveis de ambiente (CLIENT_ID, GUILD_ID ou DISCORD_TOKEN) no Render.');
}

// 2. CARREGAMENTO AUTOMÁTICO DE EVENTOS
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}

// Login do Bot
client.login(process.env.DISCORD_TOKEN);