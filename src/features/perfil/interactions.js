const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const PerfilMembro = require('../../db/models/perfilMembro');
const PainelPrincipal = require('../../db/models/painelPrincipal');
const { getGames } = require('../games/catalog');
const { MAPA_INDICADORES, calcularCategorias } = require('../../data/mapa_indicadores');
const { getTitulosDoJogador, getPaginaTitulos, formatarTitulosParaTexto } = require('../../data/titulos');
const { obterMensagemFuncionalidade } = require('../hub/mensagem');

const {
  CATEGORIAS_META,
  VALORES_INPUT_PERMITIDOS,
  VALORES_RANK_PERMITIDOS,
  OBRIGATORIOS,
  NICK_PATTERN,
  FICHA_MODAL_STEPS
} = require('./constants');

const {
  normalizarOpcaoPermitida,
  validarDataNascimento,
  sanitizeTextoLivre,
  calcularIdade,
  hasPermissaoAdmin,
  obterCampoFicha,
  obterCampoComErro,
  validarCamposEtapa
} = require('./validation');

const {
  buildPerfilEmbed,
  buildNicksSecundariosView,
  obterNomeExibicao
} = require('./embeds');

const {
  compactarLinhasComponentes,
  buildAdminButtons,
  buildAdminStatModal,
  buildTitulosButtons,
  buildFichaModalEtapa,
  buildFichaSelects,
  criarBotaoCorrecao,
  criarModalCorrecao,
  criarBotaoContinuarFicha
} = require('./modals');

const fichaEmAndamento = new Map();
const painelFichaPorUsuario = new Map();
const lockVerPerfil = new Map();

function chavePainelFicha(interaction) {
  return `${interaction.guildId || interaction.guild?.id || 'dm'}:${interaction.user.id}`;
}

async function registrarPainelFicha(interaction) {
  if (!interaction.message?.id || !interaction.guildId) return false;
  const painel = await PainelPrincipal.findOne({ guildId: interaction.guildId }).lean().catch(() => null);
  if (!painel || painel.funcMessageId !== interaction.message.id) return false;
  painelFichaPorUsuario.set(chavePainelFicha(interaction), {
    channelId: interaction.channelId || interaction.channel?.id,
    messageId: interaction.message.id
  });
  return true;
}

async function registrarPainelFichaComMensagem(interaction, mensagem) {
  if (!mensagem?.id || !interaction.guildId) return false;
  const painel = await PainelPrincipal.findOne({ guildId: interaction.guildId }).lean().catch(() => null);
  if (!painel || painel.funcMessageId !== mensagem.id) return false;
  painelFichaPorUsuario.set(chavePainelFicha(interaction), {
    channelId: mensagem.channelId || mensagem.channel?.id,
    messageId: mensagem.id
  });
  return true;
}

async function obterMensagemPainelFicha(interaction) {
  const referencia = painelFichaPorUsuario.get(chavePainelFicha(interaction));
  if (referencia?.channelId && referencia?.messageId) {
    const canal = interaction.client.channels.cache.get(referencia.channelId)
      || await interaction.client.channels.fetch(referencia.channelId).catch(() => null);
    const msg = await canal?.messages.fetch(referencia.messageId).catch(() => null);
    if (msg) return msg;
  }
  return obterMensagemFuncionalidade(interaction).catch(() => null);
}

async function responderFichaNoPainel(interaction, payload) {
  const mensagem = await obterMensagemPainelFicha(interaction);
  const { ephemeral, flags, content, ...editPayload } = payload;

  const payloadLimpo = { ...editPayload };
  if (content === undefined && !flags) {
    payloadLimpo.content = '';
  } else if (content !== undefined) {
    payloadLimpo.content = content;
  }

  if (mensagem) {
    if (interaction.isModalSubmit?.()) {
      if (!interaction.deferred && !interaction.replied) {
        try { await interaction.deferReply({ flags: 64 }); } catch (_) {}
      }
      await mensagem.edit(payloadLimpo);
      try { await interaction.deleteReply(); } catch (_) {}
      return;
    }
    if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
      if (!interaction.deferred && !interaction.replied) {
        try { await interaction.deferUpdate(); } catch (_) {}
      }
      await mensagem.edit(payloadLimpo);
      return;
    }
  }

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payloadLimpo).catch(() => null);
  }
  try {
    return interaction.update(payloadLimpo).catch(() => interaction.reply(payloadLimpo));
  } catch (_) {
    return interaction.reply(payloadLimpo).catch(() => null);
  }
}

function normalizarDadosFicha(dados = {}) {
  const objetoNormalizado = {};

  for (const [chave, valor] of Object.entries(dados || {})) {
    if (valor === undefined || valor === null) continue;
    if (typeof valor === 'function') continue;
    if (Array.isArray(valor)) {
      objetoNormalizado[chave] = valor.filter((item) => typeof item === 'string');
      continue;
    }
    if (typeof valor === 'object') continue;
    objetoNormalizado[chave] = valor;
  }

  return objetoNormalizado;
}

function salvarDadosFichaUsuario(userId, novosDados = {}) {
  const dadosAtuais = normalizarDadosFicha(fichaEmAndamento.get(userId));
  const dadosAtualizados = { ...dadosAtuais, ...normalizarDadosFicha(novosDados) };
  fichaEmAndamento.set(userId, dadosAtualizados);
  return dadosAtualizados;
}

function resetarFichaEmAndamento(userId) {
  fichaEmAndamento.set(userId, {});
}

function prepararDadosFichaSalva(perfil) {
  if (!perfil) return {};

  const dataNascimento = perfil.dataNascimento && /^\d{4}-\d{2}-\d{2}$/.test(perfil.dataNascimento)
    ? `${perfil.dataNascimento.slice(8, 10)}/${perfil.dataNascimento.slice(5, 7)}/${perfil.dataNascimento.slice(0, 4)}`
    : perfil.dataNascimento;

  return normalizarDadosFicha({
    nome_comum_input: perfil.nomeComum,
    data_nascimento_input: dataNascimento,
    estado_input: perfil.estado,
    pais_input: perfil.pais,
    bio_input: perfil.bio,
    cla_atual_input: perfil.claAtual,
    nick_principal_input: perfil.nick_principal,
    clas_anteriores_input: Array.isArray(perfil.clasAnteriores) ? perfil.clasAnteriores.join(', ') : perfil.clasAnteriores,
    modo_favorito_input: perfil.modoFavorito,
    controle_tipo_input: perfil.controleTipo,
    tiktok_input: perfil.tiktok,
    instagram_input: perfil.instagram,
    input: perfil.input,
    rank_x1: perfil.rankX1,
    rank_x2: perfil.rankX2,
    pico_rank: perfil.picoRank,
    nicks_secundarios: perfil.nicks_secundarios
  });
}

function salvarMsgFuncionalidadeGenerica(interaction, mensagem) {
  if (!mensagem) return;
  painelFichaPorUsuario.set(chavePainelFicha(interaction), {
    channelId: mensagem.channelId || mensagem.channel?.id,
    messageId: mensagem.id
  });
}

async function onIniciarFicha(interaction, mensagemFuncionalidade = null) {
  if (!interaction || typeof interaction.reply !== 'function') {
    return;
  }

  const perfilSalvo = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id }).lean();
  const dadosSalvos = prepararDadosFichaSalva(perfilSalvo);
  fichaEmAndamento.set(interaction.user.id, dadosSalvos);
  const componentes = buildFichaSelects(dadosSalvos);
  const selecoesCompletas = OBRIGATORIOS.every((campo) => dadosSalvos[campo]);

  if (selecoesCompletas) {
    componentes.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_continuar_ficha')
        .setLabel('Continuar com os dados salvos')
        .setStyle(ButtonStyle.Success)
    ));
  }

  const payload = {
    content: perfilSalvo
      ? 'Encontramos sua ficha anterior. Revise os selects ou continue para editar os dados salvos:'
      : 'Antes de abrir a ficha, escolha as opções fixas abaixo para ficar tudo consistente:',
    components: componentes,
    ephemeral: false
  };

  if (mensagemFuncionalidade) {
    await registrarPainelFichaComMensagem(interaction, mensagemFuncionalidade);
    await mensagemFuncionalidade.edit(payload).catch(() => null);
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    return;
  }

  await registrarPainelFicha(interaction);
  return responderFichaNoPainel(interaction, payload);
}

async function onSelectFichaOpcao(interaction) {
  const mapa = {
    select_ficha_input: 'input',
    select_ficha_rank_x1: 'rank_x1',
    select_ficha_rank_x2: 'rank_x2',
    select_ficha_pico_rank: 'pico_rank'
  };

  const chave = mapa[interaction.customId];
  if (!chave) return;

  const valor = interaction.values[0];
  const userId = interaction.user.id;
  const prev = fichaEmAndamento.get(userId) || {};
  const novo = { ...prev, [chave]: valor };
  fichaEmAndamento.set(userId, novo);
  const faltando = OBRIGATORIOS.filter((campo) => !novo[campo]).length;

  const ehUltimaEscolha = interaction.customId === 'select_ficha_pico_rank';
  if (!ehUltimaEscolha) {
    return interaction.update({
      content: faltando.length > 0
        ? `✅ Opção salva: **${valor}**. Falta(m) ${faltando.length} campo(s) para continuar.`
        : `✅ Opção salva: **${valor}**. Pronto para continuar.`,
      components: buildFichaSelects(novo),
      ephemeral: false
    });
  }

  if (!interaction || typeof interaction.showModal !== 'function') {
    return;
  }

  return interaction.showModal(buildFichaModalEtapa(0, novo));
}

async function onContinuarFicha(interaction) {
  const dados = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
  if (Number(dados.etapa) === 2) {
    return interaction.showModal(buildFichaModalEtapa(2, dados));
  }
  const faltando = OBRIGATORIOS.filter((campo) => !dados[campo]);
  const nomesCampos = { input: 'Input', rank_x1: 'Rank X1', rank_x2: 'Rank X2', pico_rank: 'Pico Rank' };

  if (faltando.length) {
    return responderFichaNoPainel(interaction, { content: `❌ Faltam opções obrigatórias: ${faltando.map((campo) => nomesCampos[campo]).join(', ')}.`, flags: 64 });
  }

  return interaction.showModal(buildFichaModalEtapa(0, dados));
}

async function onContinuarFichaEtapa(interaction) {
  const match = interaction.customId.match(/^btn_continuar_ficha_(\d+)$/);
  if (!match) return;

  const stepIndex = Number(match[1]) - 1;
  const dados = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
  return interaction.showModal(buildFichaModalEtapa(stepIndex, dados));
}

async function onAdicionarNickSec(interaction) {
  const input = new TextInputBuilder()
    .setCustomId('novo_nick_sec')
    .setLabel('Novo nick secundário')
    .setPlaceholder('Ex: Omotzin_alt')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);
  const modal = new ModalBuilder()
    .setCustomId('modal_add_nick_sec')
    .setTitle('Adicionar nick secundário')
    .addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

async function onModalAdicionarNickSec(interaction) {
  const userId = interaction.user.id;
  const prev = normalizarDadosFicha(fichaEmAndamento.get(userId));
  const novoNick = interaction.fields.getTextInputValue('novo_nick_sec').trim().toLowerCase();
  const secundarios = Array.isArray(prev.nicks_secundarios) ? [...prev.nicks_secundarios] : [];
  const principal = String(prev.nick_principal_input || prev.nick_principal || '').trim().toLowerCase();

  if (!novoNick || novoNick.length < 3 || novoNick.length > 20 || !NICK_PATTERN.test(novoNick)) {
    return responderFichaNoPainel(interaction, { content: 'Nick inválido. Use 3-20 caracteres sem quebras de linha ou caracteres de controle.', flags: 64 });
  }
  if (novoNick === principal || secundarios.includes(novoNick)) {
    return responderFichaNoPainel(interaction, { content: 'Esse nick já está em uso na sua ficha.', flags: 64 });
  }

  secundarios.push(novoNick);
  const novo = { ...prev, nicks_secundarios: secundarios };
  fichaEmAndamento.set(userId, novo);
  return responderFichaNoPainel(interaction, { ...buildNicksSecundariosView(novo), flags: 64 });
}

async function onRemoverNickSec(interaction) {
  const dados = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
  const secundarios = Array.isArray(dados.nicks_secundarios) ? dados.nicks_secundarios : [];
  const row = new ActionRowBuilder();
  secundarios.forEach((nick) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`remove_nick_sec_${nick}`)
        .setLabel(nick)
        .setStyle(ButtonStyle.Danger)
    );
  });
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('btn_voltar_nicks')
      .setLabel('Voltar')
      .setStyle(ButtonStyle.Secondary)
  );
  return responderFichaNoPainel(interaction, {
    content: secundarios.length > 0 ? 'Clique no nick que deseja remover:' : 'Nenhum nick secundário cadastrado.',
    embeds: [],
    components: [row]
  });
}

async function onSelecionarNickParaRemover(interaction) {
  const userId = interaction.user.id;
  const prev = normalizarDadosFicha(fichaEmAndamento.get(userId));
  const removido = interaction.customId.replace(/^remove_nick_sec_/, '');
  const secundarios = (Array.isArray(prev.nicks_secundarios) ? prev.nicks_secundarios : []).filter((nick) => nick !== removido);
  const novo = { ...prev, nicks_secundarios: secundarios };
  fichaEmAndamento.set(userId, novo);
  return responderFichaNoPainel(interaction, buildNicksSecundariosView(novo));
}

async function onVoltarNicks(interaction) {
  const userId = interaction.user.id;
  const dados = normalizarDadosFicha(fichaEmAndamento.get(userId));
  return responderFichaNoPainel(interaction, buildNicksSecundariosView(dados));
}

async function onCorrigirFichaCampo(interaction) {
  const campoId = interaction.customId.replace(/^btn_corrigir_/, '');
  const dados = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
  const modal = criarModalCorrecao(campoId, dados);
  if (!modal) return;

  return interaction.showModal(modal);
}

async function onModalCorrecaoFicha(interaction) {
  const campoId = interaction.customId.replace(/^modal_ficha_correcao_/, '');
  const campo = obterCampoFicha(campoId);
  if (!campo) return;

  const userId = interaction.user.id;
  const prev = normalizarDadosFicha(fichaEmAndamento.get(userId));
  const novoValor = interaction.fields.getTextInputValue(campoId).trim();
  const novo = { ...prev, [campoId]: novoValor };
  fichaEmAndamento.set(userId, novo);

  const etapaAtual = Number(novo.etapa) || 0;
  const validacaoEtapa = await validarCamposEtapa(etapaAtual, novo, userId, PerfilMembro);

  if (!validacaoEtapa.ok) {
    return responderFichaNoPainel(interaction, {
      content: validacaoEtapa.mensagem,
      components: [criarBotaoCorrecao(obterCampoComErro(validacaoEtapa))]
    });
  }

  if (etapaAtual === 1) {
    fichaEmAndamento.set(userId, { ...novo, etapa: 2 });
    return responderFichaNoPainel(interaction, buildNicksSecundariosView(novo));
  }

  const proximaEtapa = etapaAtual + 1;
  if (proximaEtapa < FICHA_MODAL_STEPS.length) {
    const validacaoProximaEtapa = await validarCamposEtapa(proximaEtapa, novo, userId, PerfilMembro);
    if (!validacaoProximaEtapa.ok) {
      fichaEmAndamento.set(userId, { ...novo, etapa: proximaEtapa });
      return responderFichaNoPainel(interaction, {
        content: validacaoProximaEtapa.mensagem,
        components: [criarBotaoCorrecao(obterCampoComErro(validacaoProximaEtapa))]
      });
    }
  }

  fichaEmAndamento.set(userId, { ...novo, etapa: Math.min(proximaEtapa, FICHA_MODAL_STEPS.length - 1) });
  return responderFichaNoPainel(interaction, {
    content: `✅ Campo corrigido. Clique para continuar na etapa ${Math.min(proximaEtapa + 1, FICHA_MODAL_STEPS.length)}/4.`,
    components: [criarBotaoContinuarFicha(etapaAtual)]
  });
}

async function onVerPerfil(interaction, mensagemFuncionalidade = null) {
  const editarMensagemDoHub = Boolean(mensagemFuncionalidade);
  const voltarAoHub = editarMensagemDoHub
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary))]
    : [];
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });

  if (mensagemFuncionalidade) {
    salvarMsgFuncionalidadeGenerica(interaction, mensagemFuncionalidade);
    if (!perfil) {
      await mensagemFuncionalidade.edit({
        content: '❌ Vc ainda não preencheu sua ficha! Clica em **Editar Ficha** pra cadastrar.',
        embeds: [],
        components: voltarAoHub
      }).catch(() => null);
    } else {
      const embedPerfil = buildPerfilEmbed(perfil, interaction.member, { isPublic: false });
      const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(interaction.user.id) : [];
      const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
      const componentsExtras = titulosFisicos.length > 10
        ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${interaction.user.id}`).setLabel(`Ver todos os títulos (${titulosFisicos.length}+)`).setStyle(ButtonStyle.Primary))]
        : [];
      await mensagemFuncionalidade.edit({
        content: '',
        embeds: [embedPerfil],
        components: compactarLinhasComponentes([...adminButtons, ...componentsExtras, ...voltarAoHub])
      }).catch(() => null);
    }
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    return;
  }

  if (!perfil) {
    return responderFichaNoPainel(interaction, {
      content: '❌ Vc ainda não preencheu sua ficha! Clica em **Editar Ficha** pra cadastrar.',
      components: voltarAoHub
    });
  }
  const embedPerfil = buildPerfilEmbed(perfil, interaction.member, { isPublic: false });
  const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(interaction.user.id) : [];
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 10
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${interaction.user.id}`).setLabel(`Ver todos os títulos (${titulosFisicos.length}+)`).setStyle(ButtonStyle.Primary))]
    : [];
  return responderFichaNoPainel(interaction, {
    content: '',
    embeds: [embedPerfil],
    components: compactarLinhasComponentes([...adminButtons, ...componentsExtras, ...voltarAoHub])
  });
}

async function onAbrirSelecionarPerfil(interaction, mensagemFuncionalidade = null) {
  if (!interaction.guild) {
    if (mensagemFuncionalidade) {
      await mensagemFuncionalidade.edit({ content: '❌ Essa ação só funciona em servidor.', embeds: [], components: [] }).catch(() => null);
      if (!interaction.deferred && !interaction.replied) {
        try { await interaction.deferUpdate(); } catch (_) {}
      }
      return;
    }
    return responderFichaNoPainel(interaction, { content: '❌ Essa ação só funciona em servidor.', embeds: [], components: [] });
  }

  const lockKey = `${interaction.guildId}:${interaction.user.id}`;
  const agora = Date.now();
  const ultimoClique = lockVerPerfil.get(lockKey) || 0;
  if (agora - ultimoClique < 800) {
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    return;
  }
  lockVerPerfil.set(lockKey, agora);

  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferUpdate(); } catch (_) {}
  }

  let membros = [...interaction.guild.members.cache.values()].filter((m) => !m.user.bot).slice(0, 25);
  if (membros.length === 0) {
    try {
      const fetched = await interaction.guild.members.fetch({ limit: 100 }).catch(() => null);
      if (fetched) {
        membros = [...fetched.values()].filter((m) => !m.user.bot).slice(0, 25);
      }
    } catch (_) {}
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('select_ver_perfil')
    .setPlaceholder('Escolha um membro para ver o perfil público')
    .addOptions(
      membros.map((membro) => ({
        label: membro.displayName || membro.user.username,
        value: membro.user.id,
        description: `Ver perfil de ${membro.user.username}`.slice(0, 100)
      }))
    );
  const row = new ActionRowBuilder().addComponents(select);
  const editarFicha = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_iniciar_ficha').setLabel('Editar minha ficha').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary)
  );
  const payload = {
    content: '🔎 Selecione um membro para consultar o perfil ou edite sua própria ficha:',
    embeds: [],
    components: compactarLinhasComponentes([row, editarFicha])
  };

  if (mensagemFuncionalidade) {
    salvarMsgFuncionalidadeGenerica(interaction, mensagemFuncionalidade);
    await mensagemFuncionalidade.edit(payload).catch(() => null);
    return;
  }

  return responderFichaNoPainel(interaction, payload);
}

async function onSelectVerPerfil(interaction) {
  const targetId = interaction.values[0];
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);

  if (!member) {
    return interaction.update({ content: '❌ Não foi possível localizar esse membro no servidor.', embeds: [], components: [] });
  }

  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  if (!perfil) {
    return interaction.update({ content: `❌ ${member.displayName} ainda não completou o perfil.`, embeds: [], components: [] });
  }

  const embedPerfil = buildPerfilEmbed(perfil, member, { isPublic: true });
  const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(targetId) : [];
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 10
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${targetId}`).setLabel(`Ver todos os títulos (${titulosFisicos.length}+)`).setStyle(ButtonStyle.Primary))]
    : [];

  return interaction.update({
    content: '',
    embeds: [embedPerfil],
    components: compactarLinhasComponentes([
      ...adminButtons,
      ...componentsExtras,
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary))
    ])
  });
}

async function onVerTodosTitulos(interaction) {
  const targetId = interaction.customId.replace(/^btn_ver_titulos_/, '');
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);

  if (!perfil) {
    return responderFichaNoPainel(interaction, { content: '❌ Esse jogador ainda não possui perfil completo.', embeds: [], components: [] });
  }

  const titulosLista = Array.isArray(perfil.titulosLista) ? perfil.titulosLista : [];
  const pagina = getPaginaTitulos(titulosLista, 1, 15);
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Títulos de ${obterNomeExibicao(perfil, member)}`)
    .setDescription(formatarTitulosParaTexto(titulosLista, pagina.paginaAtual, 15))
    .setColor('#FFD700');

  return responderFichaNoPainel(interaction, { content: '', embeds: [embed], components: [buildTitulosButtons(targetId, 1, pagina.totalPaginas)] });
}

async function onPaginarTitulos(interaction) {
  const match = interaction.customId.match(/^btn_titulos_(prev|next)_(\d+)_(\d+)$/);
  if (!match) return;

  const [, tipo, targetId, paginaAtualStr] = match;
  const paginaAtual = Number(paginaAtualStr) || 1;
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });

  if (!perfil) {
    return responderFichaNoPainel(interaction, { content: '❌ Perfil não encontrado.', embeds: [], components: [] });
  }

  const titulosLista = Array.isArray(perfil.titulosLista) ? perfil.titulosLista : [];
  const paginaIndex = tipo === 'prev' ? paginaAtual - 1 : paginaAtual + 1;
  const pagina = getPaginaTitulos(titulosLista, paginaIndex, 15);
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Títulos de ${obterNomeExibicao(perfil, member)}`)
    .setDescription(formatarTitulosParaTexto(titulosLista, pagina.paginaAtual, 15))
    .setColor('#FFD700');

  return responderFichaNoPainel(interaction, { content: '', embeds: [embed], components: [buildTitulosButtons(targetId, pagina.paginaAtual, pagina.totalPaginas)] });
}

async function onModalFichaPerfil(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;

  const match = interaction.customId.match(/^modal_ficha_perfil_(\d+)$/);
  if (!match) return;

  const etapaAtual = Number(match[1]) - 1;
  const dadosExistentes = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));

  FICHA_MODAL_STEPS[etapaAtual].forEach((campo) => {
    const valor = interaction.fields.getTextInputValue(campo.id).trim();
    if (valor !== '') {
      dadosExistentes[campo.id] = valor;
    }
  });

  const validacaoEtapa = await validarCamposEtapa(etapaAtual, dadosExistentes, interaction.user.id, PerfilMembro);

  if (!validacaoEtapa.ok) {
    const campoComErro = obterCampoComErro(validacaoEtapa);
    const userId = interaction.user.id;
    fichaEmAndamento.set(userId, { ...normalizarDadosFicha(fichaEmAndamento.get(userId)), ...dadosExistentes, etapa: etapaAtual });

    return responderFichaNoPainel(interaction, {
      content: validacaoEtapa.mensagem,
      components: [criarBotaoCorrecao(campoComErro)]
    });
  }

  if (etapaAtual < FICHA_MODAL_STEPS.length - 1) {
    const dadosAtual = { ...dadosExistentes };
    const userId = interaction.user.id;
    const etapaSeguinte = etapaAtual + 1;
    fichaEmAndamento.set(userId, { ...normalizarDadosFicha(fichaEmAndamento.get(userId)), ...dadosAtual, etapa: etapaSeguinte });
    const proximaEtapa = etapaAtual + 2;

    return responderFichaNoPainel(interaction, {
      content: `✅ Etapa ${etapaAtual + 1}/4 salva. Clique para continuar na etapa ${proximaEtapa}/4.`,
      components: [criarBotaoContinuarFicha(etapaAtual)]
    });
  }

  const dados = fichaEmAndamento.get(interaction.user.id) || {};

  const nomeComum = sanitizeTextoLivre(dados.nome_comum_input || interaction.user.username, { maxLength: 60, allowEmpty: false }) || interaction.user.username;
  const nascimentoValido = validarDataNascimento(dados.data_nascimento_input);
  if (!nascimentoValido.ok) {
    return responderFichaNoPainel(interaction, { content: nascimentoValido.error, embeds: [], components: [] });
  }
  const dataNascimento = nascimentoValido.value;
  const estado = sanitizeTextoLivre(dados.estado_input, { maxLength: 60 });
  const pais = sanitizeTextoLivre(dados.pais_input, { maxLength: 60 });
  const bio = sanitizeTextoLivre(dados.bio_input, { maxLength: 150 });
  const claAtual = sanitizeTextoLivre(dados.cla_atual_input, { maxLength: 60 });
  const clasAnteriores = sanitizeTextoLivre(dados.clas_anteriores_input, { maxLength: 200 });
  const modoFavorito = sanitizeTextoLivre(dados.modo_favorito_input, { maxLength: 60 });
  const controleTipo = sanitizeTextoLivre(dados.controle_tipo_input, { maxLength: 100 });
  const tiktok = sanitizeTextoLivre(dados.tiktok_input, { maxLength: 60 });
  const instagram = sanitizeTextoLivre(dados.instagram_input, { maxLength: 60 });
  const nickPrincipal = String(dados.nick_principal_input || dados.nick_principal || '').trim();
  const nicksSecundarios = [...new Set((Array.isArray(dados.nicks_secundarios) ? dados.nicks_secundarios : [])
    .map((nick) => String(nick).trim())
    .filter((nick) => nick && nick !== nickPrincipal))];

  const rankX1 = normalizarOpcaoPermitida(dados.rank_x1 || dados['select_ficha_rank_x1'], VALORES_RANK_PERMITIDOS) || null;
  const rankX2 = normalizarOpcaoPermitida(dados.rank_x2 || dados['select_ficha_rank_x2'], VALORES_RANK_PERMITIDOS) || null;
  const picoRank = normalizarOpcaoPermitida(dados.pico_rank || dados['select_ficha_pico_rank'], VALORES_RANK_PERMITIDOS) || null;
  const input = normalizarOpcaoPermitida(dados.input || dados.select_ficha_input, VALORES_INPUT_PERMITIDOS) || null;

  if (!input || !rankX1 || !rankX2 || !picoRank) {
    return responderFichaNoPainel(interaction, { content: '❌ Faltou alguma opção fixa da ficha. Refaça a configuração inicial e tente novamente.', embeds: [], components: [] });
  }

  const idade = calcularIdade(dataNascimento);

  const perfilAtual = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
  const indicadoresDetalhados = perfilAtual?.indicadoresDetalhados || {};
  const categoriasCalculadas = calcularCategorias(indicadoresDetalhados);
  const clasAnterioresArray = clasAnteriores ? clasAnteriores.split(',').map((item) => item.trim()).filter(Boolean) : perfilAtual?.clasAnteriores || [];

  const dadosPerfil = {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    discordId: interaction.user.id,
    nomeComum,
    dataNascimento: dataNascimento || perfilAtual?.dataNascimento || null,
    dataEntradaOmega: perfilAtual?.dataEntradaOmega || null,
    idade: idade || perfilAtual?.idade || 0,
    estado: estado || perfilAtual?.estado || null,
    pais: pais || perfilAtual?.pais || null,
    bio: bio || perfilAtual?.bio || null,
    claAtual: claAtual || perfilAtual?.claAtual || null,
    clasAnteriores: clasAnterioresArray,
    nick_principal: nickPrincipal,
    nicks_secundarios: nicksSecundarios,
    rankX1: rankX1 || perfilAtual?.rankX1 || null,
    rankX2: rankX2 || perfilAtual?.rankX2 || null,
    picoRank: picoRank || perfilAtual?.picoRank || null,
    modoFavorito: modoFavorito || perfilAtual?.modoFavorito || null,
    input,
    controleTipo: controleTipo || perfilAtual?.controleTipo || null,
    tiktok: tiktok || perfilAtual?.tiktok || null,
    instagram: instagram || perfilAtual?.instagram || null,
    nickJogo: perfilAtual?.nickJogo || interaction.member.displayName || null,
    rankSideSwipe: perfilAtual?.rankSideSwipe || 'Unranked',
    indicadoresDetalhados,
    inteligenciaLeitura: categoriasCalculadas.inteligencia_leitura || perfilAtual?.inteligenciaLeitura || 0,
    conhecimentoEvolucao: categoriasCalculadas.conhecimento_evolucao || perfilAtual?.conhecimentoEvolucao || 0,
    controleMecanica: categoriasCalculadas.controle_mecanica || perfilAtual?.controleMecanica || 0,
    ataque: categoriasCalculadas.ataque || perfilAtual?.ataque || 0,
    defesa: categoriasCalculadas.defesa || perfilAtual?.defesa || 0,
    equipe: categoriasCalculadas.equipe || perfilAtual?.equipe || 0,
    criatividade: categoriasCalculadas.criatividade || perfilAtual?.criatividade || 0,
    regularidade: categoriasCalculadas.regularidade || perfilAtual?.regularidade || 0
  };

  await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: interaction.user.id },
    { $set: dadosPerfil },
    { upsert: true, new: true }
  );

  fichaEmAndamento.delete(interaction.user.id);

  const games = await getGames(interaction.guildId);
  const selectCargos = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_cargos_jogos')
      .setPlaceholder('Escolha os jogos que quer ser notificado...')
      .setMinValues(0)
      .setMaxValues(Math.max(1, games.length))
      .addOptions(
        games.map((game) => ({
          label: game.nome,
          value: game.roleId,
          description: game.descricaoCargo
        }))
      )
  );

  return responderFichaNoPainel(interaction, {
    content: '✅ Perfil salvo! Agora escolha abaixo os avisos que vc quer receber quando chamarem pro time:',
    components: [selectCargos]
  });
}

async function onAbrirModalAdminEstatistica(interaction) {
  if (!hasPermissaoAdmin(interaction.member)) {
    return responderFichaNoPainel(interaction, { content: '❌ Apenas administradores ou membros de staff podem alterar essas estatísticas.', embeds: [], components: [] });
  }

  const [, campo, targetId] = interaction.customId.match(/^btn_admin_(gol|assist|save|chutes|mvp|pontuacao)_(.+)$/) || [];
  if (!campo || !targetId) {
    return responderFichaNoPainel(interaction, { content: '❌ Comando de administração inválido.', embeds: [], components: [] });
  }

  return interaction.showModal(buildAdminStatModal(campo, targetId));
}

async function onAdminIncrement(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;

  if (!hasPermissaoAdmin(interaction.member)) {
    return responderFichaNoPainel(interaction, { content: '❌ Apenas administradores ou membros de staff podem alterar essas estatísticas.', embeds: [], components: [] });
  }

  const match = interaction.customId.match(/^modal_admin_stat_(gol|assist|save|chutes|mvp|pontuacao)_(.+)$/);
  if (!match) return;

  const [, campo, targetId] = match;
  const valorTexto = interaction.fields.getTextInputValue('admin_stat_valor').trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(valorTexto.replace(/\s/g, ''))) {
    return responderFichaNoPainel(interaction, { content: '❌ Digite apenas números no campo de valor, sem letras ou caracteres extras.', embeds: [], components: [] });
  }

  const camposMap = {
    gol: 'gols',
    assist: 'assist',
    save: 'saves',
    chutes: 'chutes',
    mvp: 'mvps',
    pontuacao: 'pontuacao'
  };

  const fieldName = camposMap[campo];
  if (!fieldName) return responderFichaNoPainel(interaction, { content: '❌ Campo de stats inválido.', embeds: [], components: [] });

  const valor = Number(valorTexto.replace(',', '.'));
  if (!Number.isFinite(valor)) {
    return responderFichaNoPainel(interaction, { content: '❌ Valor numérico inválido.', embeds: [], components: [] });
  }

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: targetId },
    { $inc: { [fieldName]: valor } },
    { upsert: true, new: true }
  );

  return responderFichaNoPainel(interaction, {
    content: `✅ Estatística **${fieldName.toUpperCase()}** atualizada em **${valor}** para ${target ? target.displayName : 'o jogador'}!`,
    embeds: [],
    components: []
  });
}

async function onSelectCargos(interaction) {
  const games = await getGames(interaction.guildId);
  const roleIds = games.map((game) => game.roleId).filter(Boolean);
  const selecionados = new Set(interaction.values);
  const adicionar = roleIds.filter((roleId) => selecionados.has(roleId));
  const remover = roleIds.filter((roleId) => !selecionados.has(roleId));
  const resultados = await Promise.allSettled([
    adicionar.length ? interaction.member.roles.add(adicionar) : Promise.resolve(),
    remover.length ? interaction.member.roles.remove(remover) : Promise.resolve()
  ]);

  if (resultados.some((resultado) => resultado.status === 'rejected')) {
    return responderFichaNoPainel(interaction, {
      content: '⚠️ O perfil foi salvo, mas não consegui atualizar todos os cargos. Verifique as permissões do bot.',
      embeds: [],
      components: []
    });
  }

  return responderFichaNoPainel(interaction, {
    content: '🎉 Ficha concluída! Vc já tá pronto pra jogar com a gente.',
    embeds: [],
    components: []
  });
}

function register(registry) {
  registry.button('btn_iniciar_ficha', onIniciarFicha);
  registry.button('btn_continuar_ficha', onContinuarFicha);
  registry.button(/^btn_continuar_ficha_\d+$/, onContinuarFichaEtapa);
  registry.button('btn_add_nick_sec', onAdicionarNickSec);
  registry.button('btn_remove_nick_sec', onRemoverNickSec);
  registry.button(/^remove_nick_sec_/, onSelecionarNickParaRemover);
  registry.button('btn_voltar_nicks', onVoltarNicks);
  registry.button(/^btn_corrigir_/, onCorrigirFichaCampo);
  registry.button('btn_ver_perfil', onVerPerfil);
  registry.button('btn_abrir_select_ver_perfil', onAbrirSelecionarPerfil);
  registry.button(/^btn_ver_titulos_\d+$/, onVerTodosTitulos);
  registry.button(/^btn_titulos_(prev|next)_\d+_\d+$/, onPaginarTitulos);
  registry.button(/^btn_admin_(gol|assist|save|chutes|mvp|pontuacao)_[0-9]+$/, onAbrirModalAdminEstatistica);
  registry.modal(/^modal_admin_stat_(gol|assist|save|chutes|mvp|pontuacao)_[0-9]+$/, onAdminIncrement);
  registry.modal(/^modal_ficha_correcao_/, onModalCorrecaoFicha);
  registry.modal('modal_add_nick_sec', onModalAdicionarNickSec);
  registry.modal(/^modal_ficha_perfil_\d+$/, onModalFichaPerfil);
  registry.select('select_cargos_jogos', onSelectCargos);
  registry.select('select_ver_perfil', onSelectVerPerfil);
  registry.select('select_ficha_input', onSelectFichaOpcao);
  registry.select('select_ficha_rank_x1', onSelectFichaOpcao);
  registry.select('select_ficha_rank_x2', onSelectFichaOpcao);
  registry.select('select_ficha_pico_rank', onSelectFichaOpcao);
  registry.select('select_remove_nick_sec', onSelecionarNickParaRemover);
}

module.exports = {
  register,
  buildPerfilEmbed,
  calcularIdade,
  calcularCategorias,
  MAPA_INDICADORES,
  onVerPerfil,
  onAbrirSelecionarPerfil,
  onSelectVerPerfil,
  onSelectFichaOpcao,
  onVoltarNicks,
  onIniciarFicha
};
