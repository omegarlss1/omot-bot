const { ChannelType, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const member = newState.member;
    if (!member) return;

    // Se entrou em um canal
    if (newState.channelId && oldState.channelId !== newState.channelId) {
      const canalEntrou = newState.channel;
      
      // Verifica se é canal gatilho (nome contém "criar" ou foi configurado com /call)
      const ehGatilho = canalEntrou.name.toLowerCase().includes('criar') || 
                        (client.canaisGatilho && client.canaisGatilho.has(canalEntrou.id));

      if (ehGatilho) {
        try {
          // NOME QUE VOCÊ QUER: "Call de NOME"
          const nomeCall = `Call de ${member.displayName}`;

          const novaCall = await newState.guild.channels.create({
            name: nomeCall,
            type: ChannelType.GuildVoice,
            parent: canalEntrou.parentId,
            permissionOverwrites: [
              {
                id: member.id,
                allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers]
              }
            ]
          });

          await member.voice.setChannel(novaCall);
          client.callsTemporarias.set(novaCall.id, true);

        } catch (e) {
          console.error('Erro ao criar call:', e);
        }
      }
    }

    // Se saiu da call temporária e ficou vazia, apaga
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      const canalSaiu = oldState.channel;
      if (canalSaiu && client.callsTemporarias.has(canalSaiu.id)) {
        if (canalSaiu.members.size === 0) {
          try {
            await canalSaiu.delete();
            client.callsTemporarias.delete(canalSaiu.id);
          } catch(e) {}
        }
      }
    }
  }
};
