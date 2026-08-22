const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) return cmd.execute(interaction, client);
    }

    // BOTÕES DA CALL
    if (interaction.isButton()) {
      const canal = interaction.member?.voice?.channel;
      if (!canal || !client.callsTemporarias.has(canal.id)) return interaction.reply({ content: '❌ Entra na sua call primeiro!', ephemeral: true });
      const dados = client.callsTemporarias.get(canal.id);
      if (dados.dono !== interaction.user.id) return interaction.reply({ content: '❌ Só o dono da call!', ephemeral: true });

      if (interaction.customId === 'lock') { await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: false }); return interaction.reply({ content: '🔒 Call trancada!', ephemeral: true }); }
      if (interaction.customId === 'unlock') { await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: true }); return interaction.reply({ content: '🔓 Destrancada!', ephemeral: true }); }
      if (interaction.customId === 'ghost') { await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false }); return interaction.reply({ content: '👻 Escondida!', ephemeral: true }); }
      if (interaction.customId === 'unghost') { await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true }); return interaction.reply({ content: '👁️ Visível!', ephemeral: true }); }
      if (interaction.customId === 'delete') { await canal.delete(); return; }
      
      if (interaction.customId === 'limit') {
        const m = new ModalBuilder().setCustomId('modal_limit').setTitle('Limite da Call');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limite').setLabel('Qtd (0 = sem limite)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 3')));
        return interaction.showModal(m);
      }
      if (interaction.customId === 'rename') {
        const m = new ModalBuilder().setCustomId('modal_rename').setTitle('Renomear Call');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('novo_nome').setLabel('Novo nome').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }
      if (interaction.customId === 'kick') {
        const membros = canal.members.filter(m => m.id !== interaction.user.id);
        if (membros.size === 0) return interaction.reply({ content: '❌ Ninguém pra kickar!', ephemeral: true });

        const select = new StringSelectMenuBuilder().setCustomId('select_kick').setPlaceholder('Quem você quer kickar?');
        membros.forEach(m => {
          select.addOptions(new StringSelectMenuOptionBuilder().setLabel(m.displayName).setValue(m.id).setDescription(`Kickar ${m.displayName}`));
        });
        const row = new ActionRowBuilder().addComponents(select);
        return interaction.reply({ content: '❌ Escolha quem kickar:', components: [row], ephemeral: true });
      }
    }

    // SELECT DO KICK
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_kick') {
        const canal = interaction.member?.voice?.channel;
        const userId = interaction.values[0];
        const alvo = canal.members.get(userId);
        if (!alvo) return interaction.reply({ content: '❌ Saiu da call!', ephemeral: true });
        try {
          await alvo.voice.disconnect();
          // Bloqueia ele de voltar por 1 min
          await canal.permissionOverwrites.edit(userId, { Connect: false });
          setTimeout(() => { canal.permissionOverwrites.delete(userId).catch(()=>{}); }, 60000);
          return interaction.update({ content: `✅ ${alvo.displayName} kickado! Bloqueado por 1 min.`, components: [] });
        } catch(e) {
          return interaction.update({ content: '❌ Não consegui kickar!', components: [] });
        }
      }
    }

    // MODAIS
    if (interaction.isModalSubmit()) {
      const canal = interaction.member?.voice?.channel;
      if (!canal) return;
      if (interaction.customId === 'modal_limit') {
        const l = parseInt(interaction.fields.getTextInputValue('limite')); 
        await canal.setUserLimit(isNaN(l)?0:l); 
        return interaction.reply({ content: `👥 Limite alterado para ${l === 0 ? '♾️ Sem limite' : l}!`, ephemeral: true });
      }
      if (interaction.customId === 'modal_rename') {
        const n = interaction.fields.getTextInputValue('novo_nome'); 
        await canal.setName(n); 
        return interaction.reply({ content: `✏️ Renomeada para ${n}!`, ephemeral: true });
      }
    }
  }
};