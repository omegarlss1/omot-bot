const { Events, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: Events.ClientReady, // corrige o aviso DeprecationWarning
  once: true,
  async execute(client) {
    console.log(`Ômot online como ${client.user.tag}!`);
    
    try {
      const commands = [];
      const commandsPath = path.join(__dirname, '..', 'commands');
      for (const file of fs.readdirSync(commandsPath).filter(f=>f.endsWith('.js'))) {
        const cmd = require(path.join(commandsPath, file));
        if (cmd.data) commands.push(cmd.data.toJSON());
      }

      const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

      // 1. APAGA global (pra sumir o duplicado)
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
      
      // 2. Registra SÓ na Omega (guild) - aparece na hora e só 1 vez
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
        { body: commands }
      );

      console.log(`Comandos /call registrados! (só 1 agora)`);
    } catch (e) {
      console.error('Erro ao registrar:', e);
    }
  }
};