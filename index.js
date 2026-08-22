module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`Ômot online como ${client.user.tag}!`);
    try {
      const guilds = client.guilds.cache.map(g => g.id);
      for (const guildId of guilds) {
        const guild = client.guilds.cache.get(guildId);
        await guild.commands.set(client.commands.map(c => c.data));
      }
      console.log('Comandos /call registrados!');
    } catch(e) { console.error(e); }
  }
};