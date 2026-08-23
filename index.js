const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Servidor HTTP mínimo só pra satisfazer o healthcheck do Render enquanto o serviço
// for do tipo "Web Service". Se migrar pra "Background Worker", pode remover isso.
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Ômot online'));
app.listen(process.env.PORT || 10000, () => console.log('Web server ativo (healthcheck do Render)'));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

client.commands = new Collection();
client.callsTemporarias = new Map(); // preenchido no evento ready, a partir do database.json
client.canaisGatilho = new Set();    // idem

for (const file of fs.readdirSync('./commands').filter(f => f.endsWith('.js'))) {
  const cmd = require(`./commands/${file}`);
  client.commands.set(cmd.data.name, cmd);
}

for (const file of fs.readdirSync('./events').filter(f => f.endsWith('.js'))) {
  const ev = require(`./events/${file}`);
  if (ev.once) client.once(ev.name, (...args) => ev.execute(...args, client));
  else client.on(ev.name, (...args) => ev.execute(...args, client));
}

client.login(process.env.TOKEN);
