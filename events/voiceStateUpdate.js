const { ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const channelEntrou = newState.channelId;
    const channelSaiu = oldState.channelId;

    // 1. Criar call ao entrar no gatilho
    if (channelEntrou && client.canaisGatilho.has(channelEntrou)) {
      const guild = newState.guild;
      const member = newState.member;
      const parentCategory = newState.channel.parentId;

      const newChannel = await guild.channels.create({
        name: `🔊 | Call de ${member.displayName}`,
        type: ChannelType.GuildVoice,
        parent: parentCategory || null,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers]
          }
        ]
      });

      client.callsTemporarias.add(newChannel.id);
      await member.voice.setChannel(newChannel);
    }

    // 2. Destruir call ao ficar vazia
    if (channelSaiu && client.callsTemporarias.has(channelSaiu)) {
      const channel = oldState.guild.channels.cache.get(channelSaiu);
      if (channel && channel.members.size === 0) {
        client.callsTemporarias.delete(channel.id);
        await channel.delete().catch(() => {});
      }
    }
  }
};