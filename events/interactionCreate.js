const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) try { await cmd.execute(interaction, client); } catch(e){ console.error(e); await interaction.reply({content:'❌ Erro!', ephemeral:true}).catch(()=>{}); }
      return;
    }

    // BOTÕES DA CALL
    if (!interaction.isButton()) return;
    
    await interaction.deferUpdate().catch(()=>{});

    const [acao, callId] = interaction.customId.split('_');
    const canal = interaction.guild.channels.cache.get(callId);
    if (!canal) return interaction.followUp({ content: '❌ Call não existe mais.', ephemeral: true }).catch(()=>{});

    const dados = client.callsTemporarias.get(callId);
    if (!dados) return;

    // Só dono ou quem tem Gerenciar Canais pode mexer
    if (interaction.user.id !== dados.dono && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.followUp({ content: '❌ Só o dono pode usar!', ephemeral: true }).catch(()=>{});
    }

    try {
      if (acao === 'lock') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        await interaction.followUp({ content: '🔒 Call trancada!', ephemeral: true }).catch(()=>{});
      }
      if (acao === 'unlock') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: null });
        await interaction.followUp({ content: '🔓 Call destrancada!', ephemeral: true }).catch(()=>{});
      }
      if (acao === 'ghost') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        await interaction.followUp({ content: '👻 Call escondida!', ephemeral: true }).catch(()=>{});
      }
      if (acao === 'unghost') {
        await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: null });
        await interaction.followUp({ content: '👁️ Call visível!', ephemeral: true }).catch(()=>{});
      }
      if (acao === 'delete') {
        await canal.delete().catch(()=>{});
        client.callsTemporarias.delete(callId);
      }
      if (acao === 'limit') {
        await interaction.followUp({ content: 'Use: /call limite depois eu te mando', ephemeral: true }).catch(()=>{});
      }
      if (acao === 'rename') {
        await interaction.followUp({ content: 'Use: /call renomear nome: Novo Nome', ephemeral: true }).catch(()=>{});
      }
      if (acao === 'kick') {
        await interaction.followUp({ content: 'Clica com botão direito no user > Desconectar', ephemeral: true }).catch(()=>{});
      }
    } catch(e){ console.error(e); }
  }
};