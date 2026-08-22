const { load } = require('../utils/database');
module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client){
    console.log(`Ômot online como ${client.user.tag}!`);
    
    // Carrega gatilhos salvos
    const db = load();
    client.canaisGatilho = new Set(db.gatilhos || []);
    console.log(`Gatilhos carregados: ${[...client.canaisGatilho].length}`);

    // Limpeza de calls órfãs que ficaram presas
    for (const guild of client.guilds.cache.values()){
      await guild.channels.fetch().catch(()=>{});
      for (const canal of guild.channels.cache.values()){
        if(canal.type === 2 && (canal.name.includes('|') || canal.name.includes('jogando') || canal.name.includes('Ômigo'))){
          if(canal.members.size === 0){
            try{ await canal.delete('Limpeza de call órfã'); console.log(`Call órfã deletada: ${canal.name}`); }catch(e){}
          } else {
            // Recupera calls que já existiam
            const ehTemp = canal.name.includes('|');
            if(ehTemp){
              const partes = canal.name.split('|');
              const game = partes[0].trim();
              const donoNome = partes[1].replace(/\+\d+ Ômigos?/, '').replace('+1 Ômigo','').trim();
              const dono = canal.members.first();
              if(dono){
                client.callsTemporarias.set(canal.id, { dono: dono.id, donoNome: dono.displayName || donoNome, game });
              }
            }
          }
        }
      }
    }
    console.log('Limpeza concluída');
  }
};