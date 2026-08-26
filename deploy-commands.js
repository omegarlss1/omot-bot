const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'bot', 'commands');

const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  throw new Error('Defina TOKEN (ou DISCORD_TOKEN), CLIENT_ID e GUILD_ID para registrar os comandos.');
}

// Lê todos os arquivos JS da pasta commands
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    } else {
      console.log(`[AVISO] O comando em ${filePath} está faltando a propriedade "data" ou "execute".`);
    }
  }
}

// Configura o cliente REST do Discord
const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`🔄 Registrando ${commands.length} comandos (/) na API do Discord...`);

    // Atualiza os comandos no servidor
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log(`✅ ${data.length} comandos (/) registrados com sucesso no Discord!`);
  } catch (error) {
    console.error('❌ Erro ao registrar os comandos:', error);
  }
})();