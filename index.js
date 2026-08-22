client.callsTemporarias = new Map();
client.canaisGatilho = new Set();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
require('dotenv').config();
const express = require('express');
const app = express();
app.get('/', (req,res)=>res.send('Ômot online'));
app.listen(10000, ()=>console.log('Web server na porta 10000'));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

client.commands = new Collection();
client.callsTemporarias = new Map();
client.canaisGatilho = new Set();

// Carrega comandos
for(const file of fs.readdirSync('./commands').filter(f=>f.endsWith('.js'))){
  const cmd = require(`./commands/${file}`);
  client.commands.set(cmd.data.name, cmd);
}
// Carrega eventos
for(const file of fs.readdirSync('./events').filter(f=>f.endsWith('.js'))){
  const ev = require(`./events/${file}`);
  if(ev.once) client.once(ev.name, (...args)=>ev.execute(...args, client));
  else client.on(ev.name, (...args)=>ev.execute(...args, client));
}

client.login(process.env.TOKEN);