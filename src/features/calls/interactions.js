const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const { gerarNomeCall } = require('./naming');
const { transferirLideranca, encerrarCall, atualizarPainel } = require('./service');
const { adquirirLockCall } = require('./lock');
const { comTimeout } = require('./timeout');
const mensagens = require('./messages');

const TEMPO_ESPERA_CALL = 30000;

// ─── Helper: editar o painel (não cria nova mensagem) ────────────────────────

async function obterPainel(interaction) {
  const panelMessageId = interaction.client.stores.calls.getPanelMessageId(interaction.channelId);
  if (!panelMessageId) return null;
  return interaction.channel.messages.fetch(panelMessageId).catch(() => null);
}

async function responderNoPainel(interaction, { content, embeds, components, ephemeralError = null }) {
  const ack = async (cb) => {
    if (interaction.deferred || interaction.replied) return cb();
    try { await interaction.deferUpdate(); return cb(); } catch (_) { return cb(); }
  };
  const painel = await obterPainel(interaction);

  if (painel) {
    const payload = {};
    if (embeds) payload.embeds = embeds;
    if (components) payload.components = components;
    await ack(() => painel.edit(payload).catch(() => null));
    if (ephemeralError) {
      try { await interaction.followUp({ content: ephemeralError, flags: 64 }); } catch (_) {}
    }
    return;
  }

  // Fallback: sem painel conhecido, usa resposta efêmera
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content: content || '✅', embeds, components }).catch(() => null);
  }
  return interaction.update({ content: content || '✅', embeds, components }).catch(() => null);
}

async function confirmarNoPainel(interaction, status) {
  await interaction.deferUpdate();
  const painel = await obterPainel(interaction);
  if (!painel) return;
  const dadosCall = interaction.client.stores.calls.get(interaction.channelId);
  const membro = interaction.guild.members.cache.get(dadosCall?.donoId) || interaction.member;
  const { montarPainelCall } = require('./panel');
  await painel.edit(montarPainelCall(membro, status)).catch(() => null);
}

// ─── Lock & Guards ───────────────────────────────────────────────────────────

async function exigirCallDoLider(interaction) {
  const client = interaction.client;
  interaction.liberarLockCall = await comTimeout((estaAtivo) => adquirirLockCall(interaction.channelId, estaAtivo), TEMPO_ESPERA_CALL);
  const canal = await interaction.guild.channels.fetch(interaction.channelId).catch((error) => {
    if (error.code !== 10003) console.error('Erro ao buscar canal da call:', error);
    return null;
  });
  if (!canal) {
    return { ok: false, reply: { content: mensagens.canalInexistente, components: [] } };
  }
  const dadosCall = await comTimeout(() => client.stores.calls.buscar(canal.id));

  if (!dadosCall) {
    return { ok: false, reply: { content: mensagens.callNaoEncontrada, flags: 64 } };
  }

  if (dadosCall.donoId !== interaction.member.id) {
    return { ok: false, reply: { content: mensagens.semPermissao, flags: 64 } };
  }

  return { ok: true, canal, dadosCall, client };
}

async function onRename(interaction) {
  const modal = new ModalBuilder().setCustomId('modal_rename_call').setTitle('Renomear call');
  const inputNome = new TextInputBuilder().setCustomId('nome_call_input').setLabel('Novo nome da call').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true);
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
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }

  const { canal } = check;
  const estaTrancado = !canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.Connect);
  await comTimeout(() => canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: estaTrancado ? null : false }), TEMPO_ESPERA_CALL);
  return confirmarNoPainel(interaction, estaTrancado ? '🔒 Call trancada.' : '🔓 Call liberada.');
}

async function onHide(interaction) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }

  const { canal } = check;
  const estaVisivel = canal.permissionsFor(interaction.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
  const ocultar = estaVisivel;
  await Promise.all([
    comTimeout(() => canal.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: ocultar ? false : null }), TEMPO_ESPERA_CALL),
    comTimeout(() => interaction.client.stores.calls.atualizar(canal.id, { hidden: ocultar }))
  ]);
  try {
    await atualizarPainel(canal, interaction.client, ocultar ? '👁️ Call oculta.' : '👁️ Call visível.');
  } catch (error) {
    console.error(`Erro ao atualizar painel da call ${canal.id}:`, {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
  }
}

async function onTransfer(interaction) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }

  const membrosNaCall = obterMembrosAcao(check.canal, interaction.member.id);
  if (membrosNaCall.length === 0) {
    return confirmarNoPainel(interaction, mensagens.semMembrosParaTransferir);
  }
  return responderNoPainel(interaction, paginacaoMembros('transfer', 0, membrosNaCall, mensagens.selecioneLider));
}

async function onClose(interaction) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }
  return encerrarCall(check.canal, check.client);
}

async function onModalRename(interaction) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }
  const canal = check.canal;
  const novoJogo = interaction.fields.getTextInputValue('nome_call_input').trim();
  const dadosCall = check.dadosCall;

  if (!novoJogo || novoJogo.length > 100) {
    return confirmarNoPainel(interaction, mensagens.nomeInvalido);
  }

  if (dadosCall) {
    const nomeFinal = gerarNomeCall(dadosCall.tipo, dadosCall.donoNome, novoJogo, canal.members.size);
    try {
      const botMember = canal.guild.members.me;
      if (!botMember || !canal.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)) {
        return confirmarNoPainel(interaction, mensagens.nomeSemPermissao);
      }
      await comTimeout(() => canal.setName(nomeFinal.slice(0, 100)));
    } catch (error) {
      console.error(`Erro ao renomear a call ${canal.id}:`, {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
      return confirmarNoPainel(interaction, error.code === 'CALL_TIMEOUT' ? mensagens.operacaoExpirada : mensagens.nomeFalhou);
    }
    dadosCall.jogo = novoJogo;
    try {
      await comTimeout(() => interaction.client.stores.calls.atualizar(canal.id, { jogo: novoJogo }));
    } catch (error) {
      console.error(`Erro ao persistir o nome da call ${canal.id}:`, {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
      return confirmarNoPainel(interaction, mensagens.operacaoExpirada);
    }
  }

  return confirmarNoPainel(interaction, `✏️ Nome atualizado: **${novoJogo}**.`);
}

async function onModalLimit(interaction) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }
  const canal = check.canal;
  const limite = parseInt(interaction.fields.getTextInputValue('limite_call_input').trim(), 10);

  if (isNaN(limite) || limite < 0 || limite > 99) {
    return confirmarNoPainel(interaction, mensagens.limiteInvalido);
  }

  await comTimeout(() => canal.setUserLimit(limite));
  return confirmarNoPainel(interaction, mensagens.limiteAtualizado(limite));
}

async function onSelectPassDono(interaction) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }
  const canal = check.canal;
  const novoDonoId = interaction.values[0];
  const antigoDono = interaction.member;
  const novoDono = canal.members.get(novoDonoId);

  if (!novoDono || novoDono.user.bot) {
    return confirmarNoPainel(interaction, mensagens.membroNaoEncontradoLideranca);
  }

  try {
    await comTimeout((ativo) => transferirLideranca(canal, check.dadosCall.donoId, novoDono, interaction.client, ativo));
  } catch (error) {
    console.error(`Erro no handler de transferência de liderança da call ${canal.id}:`, {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
    if (error.code === 10003) {
      await interaction.client.stores.calls.remover(canal.id).catch(() => {});
      return confirmarNoPainel(interaction, mensagens.canalInexistente);
    }
    throw error;
  }
  await confirmarNoPainel(interaction, `👑 Liderança transferida para ${novoDono}.`);
  return canal.send({ content: mensagens.liderancaPublica(antigoDono, novoDono) });
}

function obterMembrosAcao(canal, membroAtualId) {
  return [...canal.members.values()]
    .filter((membro) => membro.id !== membroAtualId && !membro.user.bot);
}

function paginacaoMembros(action, pagina, membros, texto) {
  const totalPaginas = Math.ceil(membros.length / 25);
  const inicio = pagina * 25;
  const paginaAtual = membros.slice(inicio, inicio + 25);
  const componentes = [menuMembro(`select_${action}_call_${pagina}`, paginaAtual, texto)];

  if (totalPaginas > 1) {
    const navegacao = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`call_page_${action}_${pagina - 1}`).setLabel(mensagens.paginaAnterior).setStyle(ButtonStyle.Secondary).setDisabled(pagina === 0),
      new ButtonBuilder().setCustomId(`call_page_${action}_${pagina + 1}`).setLabel(mensagens.proximaPagina).setStyle(ButtonStyle.Secondary).setDisabled(pagina === totalPaginas - 1)
    );
    componentes.push(navegacao);
  }

  return { content: `${texto} (${pagina + 1}/${totalPaginas})`, components: componentes };
}

function menuMembro(customId, membros, texto) {
  const opcoes = membros.map((membro) => ({
    label: membro.displayName.slice(0, 100),
    value: membro.id,
    description: membro.user.username.slice(0, 100)
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(texto).addOptions(opcoes)
  );
}

async function onMemberAction(interaction, action) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }
  const membrosNaCall = obterMembrosAcao(check.canal, interaction.member.id);
  if (membrosNaCall.length === 0) return confirmarNoPainel(interaction, mensagens.semAlvos);
  return responderNoPainel(interaction, paginacaoMembros(action, 0, membrosNaCall, mensagens.selecioneMembro));
}

async function onCallPage(interaction) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }
  const [, , action, paginaTexto] = interaction.customId.split('_');
  const pagina = Number(paginaTexto);
  const membros = obterMembrosAcao(check.canal, interaction.member.id);
  const totalPaginas = Math.ceil(membros.length / 25);
  if (!Number.isInteger(pagina) || pagina < 0 || pagina >= totalPaginas) {
    return confirmarNoPainel(interaction, mensagens.paginaIndisponivel);
  }
  const texto = action === 'transfer' ? mensagens.selecioneLider : mensagens.selecioneMembro;
  return responderNoPainel(interaction, paginacaoMembros(action, pagina, membros, texto));
}

async function onSelectMemberAction(interaction, action) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }
  const memberId = interaction.values[0];
  const membro = check.canal.members.get(memberId);
  if (!membro || membro.user.bot || membro.id === check.dadosCall.donoId) {
    return confirmarNoPainel(interaction, mensagens.membroNaoEncontrado);
  }

  if (action === 'ban' && check.dadosCall.bannedUserIds.includes(memberId)) {
    return confirmarNoPainel(interaction, mensagens.jaBanido);
  }

  if (action === 'ban') {
    await comTimeout(() => interaction.client.stores.calls.atualizar(check.canal.id, {
      bannedUserIds: [...check.dadosCall.bannedUserIds, memberId]
    }));
  }
  await comTimeout(() => membro.voice.disconnect());
  return confirmarNoPainel(interaction, action === 'ban' ? mensagens.banido : mensagens.removido);
}

async function onInvite(interaction) {
  await interaction.deferUpdate();
  const check = await exigirCallDoLider(interaction);
  if (!check.ok) {
    return responderNoPainel(interaction, { ephemeralError: check.reply.content || check.reply });
  }
  const convite = await comTimeout(() => check.canal.createInvite({ maxAge: 3600, maxUses: 0, unique: true }).catch((error) => {
    if (error.code === 10003) return null;
    throw error;
  }));
  if (!convite) {
    return confirmarNoPainel(interaction, mensagens.conviteFalhou);
  }
  // Convite vai ephemeral para o líder (não polui a call com URL visível)
  try {
    await interaction.followUp({ content: mensagens.conviteGerado(convite.url), flags: 64 });
  } catch (_) {}
  return interaction.client.stores.calls.get(check.canal.id) && confirmarNoPainel(interaction, '🔗 Convite gerado e enviado no seu privado.');
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
  registry.button((customId) => /^call_page_(transfer|kick|ban)_\d+$/.test(customId), onCallPage);
  registry.modal('modal_rename_call', onModalRename);
  registry.modal('modal_limit_call', onModalLimit);
  registry.select('select_pass_dono', onSelectPassDono);
  registry.select(/^select_transfer_call_\d+$/, onSelectPassDono);
  registry.select(/^select_kick_call_\d+$/, (interaction) => onSelectMemberAction(interaction, 'kick'));
  registry.select(/^select_ban_call_\d+$/, (interaction) => onSelectMemberAction(interaction, 'ban'));
}

module.exports = { register };
