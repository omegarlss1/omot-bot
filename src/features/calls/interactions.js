const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { gerarNomeCall } = require('./naming');
const { transferirLideranca, encerrarCall, atualizarPainel } = require('./service');
const mensagens = require('./messages');

async function exigirCallDoLider(interaction) {
  const client = interaction.client;
  const canal = interaction.channel;
  const dadosCall = await client.stores.calls.buscar(canal.id);

  if (!dadosCall) {
    return { ok: false, reply: { content: mensagens.callNaoEncontrada, flags: 64 } };
  }

  if (dadosCall.donoId !== interaction.member.id) {
    return { ok: false, reply: { content: mensagens.semPermissao, flags: 64 } };
  }

  return { ok: true, canal, dadosCall, client };
}

async function onRename(interaction) {
  const modal = new ModalBuilder().setCustomId('modal_rename_call').setTitle('Definir Jogo');
  const inputNome = new TextInputBuilder().setCustomId('nome_call_input').setLabel('Qual o jogo?').setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
  return interaction.showModal(modal);
}

async function onLimitModal(interaction) {
  const modal = new ModalBuilder().setCustomId('modal_limit_call').setTitle('Definir Vagas');
  const inputLimite = new TextInputBuilder().setCustomId('limite_call_input').setLabel('Vagas (0 = sem limite):').setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(inputLimite));
  return interaction.showModal(modal);
}

async function onLock(interaction) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);

  const { canal } = check;
  const estaTrancado = !canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.Connect);
  await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: estaTrancado ? null : false });
  return interaction.editReply({ content: estaTrancado ? mensagens.callLiberada : mensagens.callTrancada });
}

async function onHide(interaction) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);

  const { canal } = check;
  const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
  await canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: estaVisivel ? false : null });
  await interaction.client.stores.calls.atualizar(canal.id, { hidden: estaVisivel });
  await atualizarPainel(canal, interaction.client);
  return interaction.editReply({ content: estaVisivel ? mensagens.callOculta : mensagens.callVisivel });
}

async function onTransfer(interaction) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);

  const membrosNaCall = check.canal.members.filter((m) => m.id !== interaction.member.id);
  if (membrosNaCall.size === 0) {
    return interaction.editReply({ content: mensagens.semMembrosParaTransferir });
  }

  const menuOpcoes = membrosNaCall.map((m) => ({
    label: m.displayName,
    value: m.id,
    description: `Passar a liderança pra ${m.user.username}`
  }));

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('select_pass_dono').setPlaceholder('Escolha o novo líder...').addOptions(menuOpcoes)
  );

  return interaction.editReply({ content: mensagens.selecioneLider, components: [selectMenu] });
}

async function onClose(interaction) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);

  await interaction.editReply({ content: mensagens.callFechando });
  return encerrarCall(check.canal, check.client);
}

async function onModalRename(interaction) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);
  const canal = interaction.channel;
  const novoJogo = interaction.fields.getTextInputValue('nome_call_input');
  const dadosCall = check.dadosCall;

  if (dadosCall) {
    dadosCall.jogo = novoJogo;
    await interaction.client.stores.calls.atualizar(canal.id, { jogo: novoJogo });
    const nomeFinal = gerarNomeCall(dadosCall.tipo, dadosCall.donoNome, novoJogo, canal.members.size);
    await canal.setName(nomeFinal).catch(() => {});
  }

  return interaction.editReply({ content: mensagens.jogoAlterado(novoJogo) });
}

async function onModalLimit(interaction) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);
  const canal = interaction.channel;
  const limite = parseInt(interaction.fields.getTextInputValue('limite_call_input').trim(), 10);

  if (isNaN(limite) || limite < 0 || limite > 99) {
    return interaction.editReply({ content: mensagens.limiteInvalido });
  }

  await canal.setUserLimit(limite);
  return interaction.editReply({
    content: mensagens.limiteAtualizado(limite)
  });
}

async function onSelectPassDono(interaction) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);
  const canal = interaction.channel;
  const novoDonoId = interaction.values[0];
  const antigoDono = interaction.member;
  const novoDono = canal.members.get(novoDonoId);

  if (!novoDono) return interaction.editReply({ content: mensagens.membroNaoEncontradoLideranca });

  await transferirLideranca(canal, check.dadosCall.donoId, novoDono, interaction.client);
  await interaction.editReply({ content: mensagens.liderancaTransferida });
  return canal.send({ content: mensagens.liderancaPublica(antigoDono, novoDono) });
}

function menuMembro(customId) {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(mensagens.selecioneMembro)
  );
}

async function onMemberAction(interaction, action) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);
  return interaction.editReply({ content: mensagens.selecioneMembro, components: [menuMembro(`select_${action}_call`)] });
}

async function onSelectMemberAction(interaction, action) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);
  const memberId = interaction.values[0];
  const membro = interaction.channel.members.get(memberId);
  if (!membro || membro.id === check.dadosCall.donoId) {
    return interaction.editReply({ content: mensagens.membroNaoEncontrado });
  }

  if (action === 'ban' && check.dadosCall.bannedUserIds.includes(memberId)) {
    return interaction.editReply({ content: mensagens.jaBanido });
  }

  if (action === 'ban') {
    await interaction.client.stores.calls.atualizar(interaction.channel.id, {
      bannedUserIds: [...check.dadosCall.bannedUserIds, memberId]
    });
  }
  await membro.voice.disconnect().catch(() => {});
  return interaction.editReply({ content: action === 'ban' ? mensagens.banido : mensagens.removido });
}

async function onInvite(interaction) {
  await interaction.deferReply({ flags: 64 });
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) return interaction.editReply(check.reply);
  const convite = await interaction.channel.createInvite({ maxAge: 3600, maxUses: 0, unique: true }).catch(() => null);
  return interaction.editReply({ content: convite ? mensagens.conviteGerado(convite.url) : mensagens.conviteFalhou });
}

function register(registry) {
  registry.button('btn_rename', onRename);
  registry.button('btn_limit_modal', onLimitModal);
  registry.button('btn_lock', onLock);
  registry.button('btn_hide', onHide);
  registry.button('btn_transfer', onTransfer);
  registry.button('btn_close_call', onClose);
  registry.button('btn_kick', (interaction) => onMemberAction(interaction, 'kick'));
  registry.button('btn_ban', (interaction) => onMemberAction(interaction, 'ban'));
  registry.button('btn_invite', onInvite);
  registry.modal('modal_rename_call', onModalRename);
  registry.modal('modal_limit_call', onModalLimit);
  registry.select('select_pass_dono', onSelectPassDono);
  registry.select('select_kick_call', (interaction) => onSelectMemberAction(interaction, 'kick'));
  registry.select('select_ban_call', (interaction) => onSelectMemberAction(interaction, 'ban'));
}

module.exports = { register };
