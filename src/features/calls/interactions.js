const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { gerarNomeCall } = require('./naming');
const { transferirLideranca, encerrarCall } = require('./service');

function exigirCallDoLider(interaction) {
  const client = interaction.client;
  const canal = interaction.channel;
  const dadosCall = client.stores.calls.get(canal.id);

  if (!dadosCall) {
    return { ok: false, reply: { content: '❌ Esse painel só funciona em calls temporárias do Ômot.', flags: 64 } };
  }

  if (dadosCall.donoId !== interaction.member.id) {
    return { ok: false, reply: { content: '❌ Apenas o líder da call pode usar esses botões.', flags: 64 } };
  }

  return { ok: true, canal, dadosCall, client };
}

async function onRename(interaction) {
  const check = exigirCallDoLider(interaction);
  if (!check.ok) return interaction.reply(check.reply);

  const modal = new ModalBuilder().setCustomId('modal_rename_call').setTitle('Definir Jogo');
  const inputNome = new TextInputBuilder().setCustomId('nome_call_input').setLabel('Qual o jogo?').setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
  return interaction.showModal(modal);
}

async function onLimitModal(interaction) {
  const check = exigirCallDoLider(interaction);
  if (!check.ok) return interaction.reply(check.reply);

  const modal = new ModalBuilder().setCustomId('modal_limit_call').setTitle('Definir Vagas');
  const inputLimite = new TextInputBuilder().setCustomId('limite_call_input').setLabel('Vagas (0 = sem limite):').setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(inputLimite));
  return interaction.showModal(modal);
}

async function onLock(interaction) {
  const check = exigirCallDoLider(interaction);
  if (!check.ok) return interaction.reply(check.reply);

  await interaction.deferReply({ flags: 64 });
  const { canal } = check;
  const estaTrancado = !canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.Connect);
  await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: estaTrancado ? null : false });
  return interaction.editReply({ content: estaTrancado ? '🔓 Call liberada!' : '🔒 Call trancada!' });
}

async function onHide(interaction) {
  const check = exigirCallDoLider(interaction);
  if (!check.ok) return interaction.reply(check.reply);

  await interaction.deferReply({ flags: 64 });
  const { canal } = check;
  const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
  await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: estaVisivel ? false : null });
  return interaction.editReply({ content: estaVisivel ? '👁️ Call oculta!' : '👁️ Call visível!' });
}

async function onTransfer(interaction) {
  const check = exigirCallDoLider(interaction);
  if (!check.ok) return interaction.reply(check.reply);

  const membrosNaCall = check.canal.members.filter((m) => m.id !== interaction.member.id);
  if (membrosNaCall.size === 0) {
    return interaction.reply({ content: '❌ Chama mais gente primeiro pra passar a liderança!', flags: 64 });
  }

  const menuOpcoes = membrosNaCall.map((m) => ({
    label: m.displayName,
    value: m.id,
    description: `Passar a liderança pra ${m.user.username}`
  }));

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('select_pass_dono').setPlaceholder('Escolha o novo líder...').addOptions(menuOpcoes)
  );

  return interaction.reply({ content: 'Escolha o novo líder:', components: [selectMenu], flags: 64 });
}

async function onClose(interaction) {
  const check = exigirCallDoLider(interaction);
  if (!check.ok) return interaction.reply(check.reply);

  await interaction.reply({ content: 'Fechando a call e desconectando todo mundo... flw!', flags: 64 });
  return encerrarCall(check.canal, check.client);
}

async function onModalRename(interaction) {
  await interaction.deferReply({ flags: 64 });
  const canal = interaction.channel;
  const novoJogo = interaction.fields.getTextInputValue('nome_call_input');
  const dadosCall = interaction.client.stores.calls.get(canal.id);

  if (dadosCall) {
    dadosCall.jogo = novoJogo;
    await interaction.client.stores.calls.atualizar(canal.id, { jogo: novoJogo });
    const nomeFinal = gerarNomeCall(dadosCall.tipo, dadosCall.donoNome, novoJogo, canal.members.size);
    await canal.setName(nomeFinal).catch(() => {});
  }

  return interaction.editReply({ content: `Jogo alterado para **${novoJogo}**.` });
}

async function onModalLimit(interaction) {
  await interaction.deferReply({ flags: 64 });
  const canal = interaction.channel;
  const limite = parseInt(interaction.fields.getTextInputValue('limite_call_input').trim(), 10);

  if (isNaN(limite) || limite < 0 || limite > 99) {
    return interaction.editReply({ content: '❌ Manda um número válido, de 0 a 99, aí.' });
  }

  await canal.setUserLimit(limite);
  return interaction.editReply({
    content: limite === 0 ? 'Sem limite de vagas agora.' : `Ajustei o limite pra **${limite} ${limite === 1 ? 'vaga' : 'vagas'}**!`
  });
}

async function onSelectPassDono(interaction) {
  await interaction.deferReply({ flags: 64 });
  const canal = interaction.channel;
  const novoDonoId = interaction.values[0];
  const antigoDono = interaction.member;
  const novoDono = canal.members.get(novoDonoId);

  if (!novoDono) return interaction.editReply({ content: '❌ Membro não encontrado na call.' });

  await transferirLideranca(canal, antigoDono.id, novoDono, interaction.client);
  await interaction.editReply({ content: `Liderança passada pra ${novoDono}.` });
  return canal.send({ content: `👑 ${antigoDono} passou a liderança pra ${novoDono}.` });
}

function register(registry) {
  registry.button('btn_rename', onRename);
  registry.button('btn_limit_modal', onLimitModal);
  registry.button('btn_lock', onLock);
  registry.button('btn_hide', onHide);
  registry.button('btn_transfer', onTransfer);
  registry.button('btn_close_call', onClose);
  registry.modal('modal_rename_call', onModalRename);
  registry.modal('modal_limit_call', onModalLimit);
  registry.select('select_pass_dono', onSelectPassDono);
}

module.exports = { register };
