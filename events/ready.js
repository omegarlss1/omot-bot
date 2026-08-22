const { Routes, REST } = require('discord.js');
module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Ômot online como ${client.user.tag}!`);
    const commands = [];
    for (const cmd of client.commands.values()) commands.push(cmd.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Comandos /call registrados!');
  }
};
