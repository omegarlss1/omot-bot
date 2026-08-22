module.exports = {
  name: 'ready',
  once: true,
  async execute(client){
    console.log(`Ômot online como ${client.user.tag}!`);
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if(guild){
      await guild.commands.set([]).catch(()=>{});
      const cmds = [...client.commands.values()].map(c=>c.data.toJSON());
      await guild.commands.set(cmds);
      console.log(`Comandos /call registrados! (só 1 agora)`);
    }
  }
};