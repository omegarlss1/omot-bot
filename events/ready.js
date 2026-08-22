module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Ômot online como ${client.user.tag}!`);
    try {
      for (const [id, guild] of client.guilds.cache) {
        await guild.commands.set(client.commands.map(c => c.data));
      }
      console.log('Comandos /call registrados!');
    } catch(e) { console.error(e); }
  }
};