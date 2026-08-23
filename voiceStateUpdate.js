const { ChannelType } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const channelEntrou = newState.channelId;
    const channelSaiu = oldState.channelId;

    // Entrada em Canal Gatilho -> Cria Call Temporária
    if (channelEntrou && client.canaisGatilho.has(channelEntrou)) {
      const guild = newState.guild;
      const member = newState.member;
      const parentCategory = newState.channel.parentId;

      const newChannel = await guild.channels.create({
        name: `🔊 | Call de ${member.displayName}`,
        type: ChannelType.GuildVoice,
        parent: parentCategory || null,
        permissionOverwrites: newState.channel.permissionOverwrites.cache.map(p => ({
          id: p.id,
          allow: p.allow.bitfield,
          deny: p.deny.bitfield
        }))
      });

      client.callsTemporarias.add(newChannel.id);
      await member.voice.setChannel(newChannel);
    }

    // Saída de Canal Temporário -> Destrói se estiver vazio
    if (channelSaiu && client.callsTemporarias.has(channelSaiu)) {
      const channel = oldState.guild.channels.cache.get(channelSaiu);
      if (channel && channel.members.size === 0) {
        client.callsTemporarias.delete(channel.id);
        await channel.delete().catch(() => {});
      }
    }
  }
};
