const { PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { salvarCall, removerCall } = require('../utils/database');
const { transferirDono } = require('../utils/calls');

async function pegarCanal(guild, callId) {
  return guild.channels.cache.get(callId) || await guild.channels.fetch(callId).catch(() => null);
}

// Responde com segurança independente de já ter dado defer/reply antes (evita "already replied")
async function responder(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content }).catch(() => {});
  }
  return interaction.reply({ content, ephemeral: true }).catch(() => {});
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // COMANDOS
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) try { await cmd.execute(interaction, client); } catch (e) { console.error(e); }
      return;
    }

    // MODAIS
    if (interaction.isModalSubmit()) {
      // defer IMEDIATO - antes de qualquer chamada lenta à API do Discord (setName/setUserLimit
      // podem demorar mais que os 3s que a interação dá, principalmente se o canal já foi
      // renomeado recentemente por outro lugar, batendo no rate limit do Discord)
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const [tipo, callId] = interaction.customId.split('_');
      try {
        const canal = await pegarCanal(interaction.guild, callId);
        if (!canal) return responder(interaction, '❌ Call não existe mais');

        if (tipo === 'modal-rename') {
          const novoNome = interaction.fields.getTextInputValue('novoNome');
          await canal.setName(novoNome).catch(() => {});
          const dados = client.callsTemporarias.get(callId);
          if (dados) {
            dados.game = novoNome.split('|')[0].trim();
            salvarCall(callId, dados);
          }
          return responder(interaction, `✏️ Renomeado para **${novoNome}**!`);
        }

        if (tipo === 'modal-limit') {
          const limite = parseInt(interaction.fields.getTextInputValue('limite'));
          if (isNaN(limite) || limite < 0 || limite > 99) return responder(interaction, '❌ Use 0 a 99 (0 = sem limite)');
          await canal.setUserLimit(limite).catch(() => {});
          return responder(interaction, `👥 Limite alterado para **${limite === 0 ? 'sem limite' : limite}**!`);
        }

        if (tipo === 'modal-setgame') {
          const gameNome = interaction.fields.getTextInputValue('gameNome');
          const dados = client.callsTemporarias.get(callId);
          const donoNome = dados?.donoNome || interaction.member.displayName;
          if (dados) {
            dados.game = gameNome;
            salvarCall(callId, dados);
          }
          const total = canal.members.size;
          let nomeFinal;
          if (total <= 1) nomeFinal = `${gameNome} | ${donoNome}`;
          else if (total === 2) nomeFinal = `${gameNome} | ${donoNome} +1 Ômigo`;
          else nomeFinal = `${gameNome} | ${donoNome} +${total - 1} Ômigos`;

          await canal.setName(nomeFinal).catch(() => {});
          return responder(interaction, `🎮 Call atualizada para **${nomeFinal}**!`);
        }
        return;
      } catch (e) {
        console.error(e);
        return responder(interaction, '❌ Deu erro, tenta de novo');
      }
    }

    // SELECT MENU - KICKAR / TRANSFERIR DONO
    if (interaction.isStringSelectMenu()) {
      await interaction.deferUpdate().catch(() => {});
      const [acao, callId] = interaction.customId.split('_');

      if (acao === 'kick-select') {
        const userId = interaction.values[0];
        const member = interaction.guild.members.cache.get(userId);
        if (member?.voice?.channelId === callId) {
          await member.voice.disconnect().catch(() => {});
          await interaction.followUp({ content: `❌ <@${userId}> kickado da call!`, ephemeral: true }).catch(() => {});
        }
        return;
      }

      if (acao === 'transfer-select') {
        const canal = await pegarCanal(interaction.guild, callId);
        const dados = client.callsTemporarias.get(callId);
        if (!canal || !dados) return interaction.followUp({ content: '❌ Call não existe mais.', ephemeral: true }).catch(() => {});

        if (interaction.user.id !== dados.dono) {
          return interaction.followUp({ content: '❌ Só o dono pode confirmar a transferência.', ephemeral: true }).catch(() => {});
        }

        const novoDonoId = interaction.values[0];
        const novoDono = canal.members.get(novoDonoId);
        if (!novoDono) return interaction.followUp({ content: '❌ Esse Ômigo não está mais na call.', ephemeral: true }).catch(() => {});

        await transferirDono(client, canal, dados, novoDono);
        await interaction.followUp({ content: `👑 Call passada pra <@${novoDonoId}>!`, ephemeral: true }).catch(() => {});
        await canal.send(`👑 <@${interaction.user.id}> passou a call pra <@${novoDonoId}>!`).catch(() => {});
        return;
      }
      return;
    }

    // BOTÕES
    if (!interaction.isButton()) return;

    const [acao, callId] = interaction.customId.split('_');
    const canal = await pegarCanal(interaction.guild, callId);
    if (!canal) return interaction.reply({ content: '❌ Call não existe mais.', ephemeral: true }).catch(() => {});

    const dados = client.callsTemporarias.get(callId);
    const ehDono = interaction.user.id === dados?.dono;
    const temPermissao = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
    if (!ehDono && !temPermissao) {
      return interaction.reply({ content: '❌ Só o dono da call pode usar!', ephemeral: true }).catch(() => {});
    }

    try {
      // Ações que abrem modal PRECISAM responder com showModal diretamente,
      // sem defer antes (senão o Discord rejeita: já foi "reconhecida" de outro jeito).
      if (acao === 'setgame') {
        const modal = new ModalBuilder().setCustomId(`modal-setgame_${callId}`).setTitle('Qual jogo vai jogar?');
        const input = new TextInputBuilder().setCustomId('gameNome').setLabel('Nome do jogo').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Valorant, Fortnite, Minecraft').setMaxLength(30).setValue(dados?.game === 'Aguardando jogo' ? '' : dados?.game || '');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (acao === 'rename') {
        const modal = new ModalBuilder().setCustomId(`modal-rename_${callId}`).setTitle('Renomear Call');
        const input = new TextInputBuilder().setCustomId('novoNome').setLabel('Novo nome da call').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(canal.name);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (acao === 'limit') {
        const modal = new ModalBuilder().setCustomId(`modal-limit_${callId}`).setTitle('Limite de Ômigos');
        const input = new TextInputBuilder().setCustomId('limite').setLabel('Quantos Ômigos? (0 = sem limite)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setValue(String(canal.userLimit || 0));
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (acao === 'kick') {
        if (canal.members.size <= 1) return interaction.reply({ content: '❌ Só você na call, Ômigo!', ephemeral: true });
        const options = canal.members.filter(m => m.id !== interaction.user.id).map(m => ({ label: m.displayName.substring(0, 25), value: m.id, description: `@${m.user.username}`.substring(0, 50) })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: '❌ Ninguém pra kickar', ephemeral: true });
        const menu = new StringSelectMenuBuilder().setCustomId(`kick-select_${callId}`).setPlaceholder('Escolha quem kickar').addOptions(options);
        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({ content: '👇 Escolha o Ômigo pra kickar:', components: [row], ephemeral: true });
      }
      if (acao === 'transfer') {
        if (canal.members.size <= 1) return interaction.reply({ content: '❌ Não tem ninguém pra passar a call, Ômigo!', ephemeral: true });
        const options = canal.members.filter(m => m.id !== interaction.user.id).map(m => ({ label: m.displayName.substring(0, 25), value: m.id, description: `@${m.user.username}`.substring(0, 50) })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: '❌ Ninguém pra passar a call', ephemeral: true });
        const menu = new StringSelectMenuBuilder().setCustomId(`transfer-select_${callId}`).setPlaceholder('Escolha o novo dono').addOptions(options);
        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({ content: '👑 Escolha quem vai ser o novo dono:', components: [row], ephemeral: true });
      }
      if (acao === 'delete') {
        // responde ANTES da chamada lenta (delete), então nunca estoura os 3s
        await interaction.reply({ content: '🗑️ Deletando call...', ephemeral: true });
        await canal.delete().catch(() => {});
        client.callsTemporarias.delete(callId);
        removerCall(callId);
        return;
      }

      // Ações que fazem uma chamada lenta à API (permissionOverwrites.edit) - defer antes
      if (['lock', 'unlock', 'ghost', 'unghost'].includes(acao)) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        if (acao === 'lock') {
          await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
          return responder(interaction, '🔒 Call trancada! Ninguém mais entra.');
        }
        if (acao === 'unlock') {
          await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: null });
          return responder(interaction, '🔓 Call destrancada!');
        }
        if (acao === 'ghost') {
          await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
          return responder(interaction, '👻 Call escondida!');
        }
        if (acao === 'unghost') {
          await canal.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: null });
          return responder(interaction, '👁️ Call visível novamente!');
        }
      }
    } catch (e) {
      console.error(e);
      if (interaction.deferred || interaction.replied) {
        await responder(interaction, '❌ Deu erro');
      } else {
        await interaction.reply({ content: '❌ Deu erro', ephemeral: true }).catch(() => {});
      }
    }
  }
};


