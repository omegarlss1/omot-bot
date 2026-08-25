const { syncGuildGames } = require('../../features/games/catalog');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`🤖 Ômot online como ${client.user.tag}!`);

    await client.stores.gatilhos.load();
    await client.stores.calls.load(client);

    for (const [guildId] of client.guilds.cache) {
      await syncGuildGames(guildId);
    }

    try {
      const commandsArray = Array.from(client.commands.values()).map((cmd) => cmd.data.toJSON());
      await client.application.commands.set(commandsArray);
      console.log(`✅ Comandos globais sincronizados: ${commandsArray.map((c) => '/' + c.name).join(', ')}`);

      if (process.env.CLEAR_GUILD_COMMANDS === 'true') {
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
          const guild = await client.guilds.fetch(guildId);
          await guild.commands.set([]);
        }
        console.log('🧹 Comandos de guild limpos (CLEAR_GUILD_COMMANDS).');
      }
    } catch (error) {
      console.error('❌ Erro ao registrar comandos:', error);
    }
  }
};
