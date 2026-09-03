const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
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
const { getTitulosDoJogador, getPaginaTitulos, formatarTitulosParaTexto, extrairIconeTitulo } = require('../../data/titulos');
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
  buildEmbedFicha,
  buildEmbedAvaliacao,
  buildEmbedStatsMedalhas,
  buildPerfilEmbed,
  buildNicksSecundariosView,
  buildNavegacaoNichosPerfil,
  obterNomeExibicao
} = require('./embeds');

const {
  compactarLinhasComponentes,
  buildAdminButtons,
  buildAdminStatModal,
  buildEscolhaTituloBotoes,
  buildEscolhaFormatoTorneio,
  buildModalSemifinais,
  buildModalFinais,
  buildModalTabelaColocacao,
  buildTitulosButtons,
  buildFichaModalEtapa,
  buildFichaSelects,
  buildFichaNavegacao,
  criarBotaoCorrecao,
  criarModalCorrecao,
  criarBotaoContinuarFicha
} = require('./modals');

const fichaEmAndamento = new Map();
const painelFichaPorUsuario = new Map();
// Estado temporário entre modal de semis e modal de finais
const tituloEmCadastro = new Map();

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
    if (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isUserSelectMenu?.()) {
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
  const obj = {};
  for (const [chave, valor] of Object.entries(dados || {})) {
    if (valor === undefined || valor === null) continue;
    if (typeof valor === 'function') continue;
    if (Array.isArray(valor)) { obj[chave] = valor.filter((item) => typeof item === 'string'); continue; }
    if (typeof valor === 'object') continue;
    obj[chave] = valor;
  }
  return obj;
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

// ─── Helper: renderizar aba de stats com botões admin ────────────────────────

async function renderizarAbaStats(interaction, targetId, perfil = null, member = null) {
  const perfilAlvo = perfil || await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  const membroAlvo = member || await interaction.guild.members.fetch(targetId).catch(() => null);

  if (!perfilAlvo) {
    return responderFichaNoPainel(interaction, {
      content: '❌ Perfil não encontrado.',
      embeds: [],
      components: compactarLinhasComponentes(buildNavegacaoNichosPerfil(targetId, 'stats'))
    });
  }

  const embed = buildEmbedStatsMedalhas(perfilAlvo, membroAlvo);
  const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(targetId) : [];
  const navButtons = buildNavegacaoNichosPerfil(targetId, 'stats');

  return responderFichaNoPainel(interaction, {
    content: '',
    embeds: [embed],
    components: compactarLinhasComponentes([...adminButtons, ...navButtons])
  });
}

// ─── INSTRUÇÃO INICIAL FICHA ─────────────────────────────────────────────────

const INSTRUCOES_RANKS = 'ℹ️ **Atenção aos Ranks (X1 e X2):**\nSelecione o rank que você normalmente conquista e mantém com frequência durante as seasons. Esse dado será utilizado pela staff para balanceamento e equilíbrio justo das equipes em campeonatos internos!';

async function onIniciarFicha(interaction, mensagemFuncionalidade = null) {
  if (!interaction || typeof interaction.reply !== 'function') return;

  const perfilSalvo = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id }).lean();
  const dadosSalvos = prepararDadosFichaSalva(perfilSalvo);
  fichaEmAndamento.set(interaction.user.id, dadosSalvos);

  const selecoesCompletas = OBRIGATORIOS.every((campo) => dadosSalvos[campo]);
  let componentes = [];
  let content = '';

  if (selecoesCompletas) {
    componentes = buildFichaNavegacao(dadosSalvos);
    content = `${INSTRUCOES_RANKS}\n\n📋 **Painel da Ficha de Membro:**\nClique em qualquer etapa abaixo para preencher ou editar:`;
  } else {
    componentes = buildFichaSelects(dadosSalvos);
    content = `${INSTRUCOES_RANKS}\n\nEscolha as opções fixas abaixo para liberar os formulários:`;
  }

  const payload = { content, embeds: [], components: compactarLinhasComponentes(componentes) };

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

  if (faltando > 0) {
    return responderFichaNoPainel(interaction, {
      content: `${INSTRUCOES_RANKS}\n\n✅ Opção salva: **${valor}**. Falta(m) ${faltando} opção(ões) obrigatória(s).`,
      embeds: [],
      components: compactarLinhasComponentes(buildFichaSelects(novo))
    });
  }

  return responderFichaNoPainel(interaction, {
    content: `${INSTRUCOES_RANKS}\n\n🎉 **Opções fixas configuradas!**\nClique nas etapas abaixo para preencher os dados da sua ficha:`,
    embeds: [],
    components: compactarLinhasComponentes(buildFichaNavegacao(novo))
  });
}

async function onAbrirEtapaFicha(interaction) {
  const match = interaction.customId.match(/^btn_etapa_(\d+)$/);
  if (!match) return;
  const stepIndex = Number(match[1]) - 1;
  const dados = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
  return interaction.showModal(buildFichaModalEtapa(stepIndex, dados));
}

async function onModalFichaPerfil(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;
  const match = interaction.customId.match(/^modal_ficha_perfil_(\d+)$/);
  if (!match) return;

  const etapaAtual = Number(match[1]) - 1;
  const dadosExistentes = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));

  FICHA_MODAL_STEPS[etapaAtual].forEach((campo) => {
    const valor = interaction.fields.getTextInputValue(campo.id).trim();
    if (valor !== '') dadosExistentes[campo.id] = valor;
  });

  const validacaoEtapa = await validarCamposEtapa(etapaAtual, dadosExistentes, interaction.user.id, PerfilMembro);
  if (!validacaoEtapa.ok) {
    const campoComErro = obterCampoComErro(validacaoEtapa);
    fichaEmAndamento.set(interaction.user.id, { ...dadosExistentes });
    return responderFichaNoPainel(interaction, {
      content: validacaoEtapa.mensagem,
      embeds: [],
      components: [criarBotaoCorrecao(campoComErro)]
    });
  }

  fichaEmAndamento.set(interaction.user.id, dadosExistentes);
  const titulosEtapas = ['1. Nome / Nasc / Estado', '2. País / Bio / CLA / Nick', '3. CLAs / Modo / Controle', '4. TikTok / Instagram'];
  return responderFichaNoPainel(interaction, {
    content: `✅ Dados salvos da etapa **${titulosEtapas[etapaAtual] || `Etapa ${etapaAtual + 1}`}**!\nContinue ou clique em **Finalizar e Salvar Perfil**:`,
    embeds: [],
    components: compactarLinhasComponentes(buildFichaNavegacao(dadosExistentes))
  });
}

async function onSalvarConcluirFicha(interaction) {
  const dados = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
  const input = normalizarOpcaoPermitida(dados.input, VALORES_INPUT_PERMITIDOS);
  const rankX1 = normalizarOpcaoPermitida(dados.rank_x1, VALORES_RANK_PERMITIDOS);
  const rankX2 = normalizarOpcaoPermitida(dados.rank_x2, VALORES_RANK_PERMITIDOS);
  const picoRank = normalizarOpcaoPermitida(dados.pico_rank, VALORES_RANK_PERMITIDOS);
  const nickPrincipal = String(dados.nick_principal_input || dados.nick_principal || '').trim();

  if (!input || !rankX1 || !rankX2 || !picoRank) {
    return responderFichaNoPainel(interaction, {
      content: '❌ Faltam as opções fixas obrigatórias. Configure-as abaixo:',
      embeds: [],
      components: compactarLinhasComponentes(buildFichaSelects(dados))
    });
  }
  if (!nickPrincipal || nickPrincipal.length < 3 || nickPrincipal.length > 20 || !NICK_PATTERN.test(nickPrincipal)) {
    return responderFichaNoPainel(interaction, {
      content: '❌ O **Nick Principal** é obrigatório e precisa ter de 3 a 20 caracteres. Clique na etapa 2 para preenchê-lo:',
      embeds: [],
      components: compactarLinhasComponentes(buildFichaNavegacao(dados))
    });
  }

  const existente = await PerfilMembro.findOne({ nick_principal: nickPrincipal.toLowerCase(), userId: { $ne: interaction.user.id } }).select('_id').lean();
  if (existente) {
    return responderFichaNoPainel(interaction, {
      content: `❌ O nick principal **${nickPrincipal}** já está em uso por outro membro.`,
      embeds: [],
      components: compactarLinhasComponentes(buildFichaNavegacao(dados))
    });
  }

  const nomeComum = sanitizeTextoLivre(dados.nome_comum_input || interaction.user.username, { maxLength: 60, allowEmpty: false }) || interaction.user.username;
  const nascimentoValido = validarDataNascimento(dados.data_nascimento_input);
  const dataNascimento = nascimentoValido.ok ? nascimentoValido.value : null;
  const idade = calcularIdade(dataNascimento);
  const estado = sanitizeTextoLivre(dados.estado_input, { maxLength: 60 });
  const pais = sanitizeTextoLivre(dados.pais_input, { maxLength: 60 });
  const bio = sanitizeTextoLivre(dados.bio_input, { maxLength: 150 });
  const claAtual = sanitizeTextoLivre(dados.cla_atual_input, { maxLength: 60 });
  const clasAnteriores = sanitizeTextoLivre(dados.clas_anteriores_input, { maxLength: 200 });
  const modoFavorito = sanitizeTextoLivre(dados.modo_favorito_input, { maxLength: 60 });
  const controleTipo = sanitizeTextoLivre(dados.controle_tipo_input, { maxLength: 100 });
  const tiktok = sanitizeTextoLivre(dados.tiktok_input, { maxLength: 60 });
  const instagram = sanitizeTextoLivre(dados.instagram_input, { maxLength: 60 });
  const nicksSecundarios = [...new Set((Array.isArray(dados.nicks_secundarios) ? dados.nicks_secundarios : []).map((n) => String(n).trim()).filter((n) => n && n.toLowerCase() !== nickPrincipal.toLowerCase()))];
  const perfilAtual = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
  const indicadoresDetalhados = perfilAtual?.indicadoresDetalhados || {};
  const categoriasCalculadas = calcularCategorias(indicadoresDetalhados);
  const clasAnterioresArray = clasAnteriores ? clasAnteriores.split(',').map((item) => item.trim()).filter(Boolean) : perfilAtual?.clasAnteriores || [];

  const dadosPerfil = {
    guildId: interaction.guildId, userId: interaction.user.id, discordId: interaction.user.id,
    nomeComum, dataNascimento: dataNascimento || perfilAtual?.dataNascimento || null,
    dataEntradaOmega: perfilAtual?.dataEntradaOmega || null,
    idade: idade || perfilAtual?.idade || 0, estado: estado || perfilAtual?.estado || null,
    pais: pais || perfilAtual?.pais || null, bio: bio || perfilAtual?.bio || null,
    claAtual: claAtual || perfilAtual?.claAtual || null, clasAnteriores: clasAnterioresArray,
    nick_principal: nickPrincipal.toLowerCase(), nicks_secundarios: nicksSecundarios,
    rankX1, rankX2, picoRank, modoFavorito: modoFavorito || perfilAtual?.modoFavorito || null,
    input, controleTipo: controleTipo || perfilAtual?.controleTipo || null,
    tiktok: tiktok || perfilAtual?.tiktok || null, instagram: instagram || perfilAtual?.instagram || null,
    nickJogo: nickPrincipal, rankSideSwipe: perfilAtual?.rankSideSwipe || 'Unranked',
    indicadoresDetalhados,
    inteligenciaLeitura: categoriasCalculadas.inteligencia_leitura || perfilAtual?.inteligenciaLeitura || 0,
    conhecimentoEvolucao: categoriasCalculadas.conhecimento_evolucao || perfilAtual?.conhecimentoEvolucao || 0,
    controleMecanica: categoriasCalculadas.controle_mecanica || perfilAtual?.controleMecanica || 0,
    ataque: categoriasCalculadas.ataque || perfilAtual?.ataque || 0, defesa: categoriasCalculadas.defesa || perfilAtual?.defesa || 0,
    equipe: categoriasCalculadas.equipe || perfilAtual?.equipe || 0, criatividade: categoriasCalculadas.criatividade || perfilAtual?.criatividade || 0,
    regularidade: categoriasCalculadas.regularidade || perfilAtual?.regularidade || 0
  };

  await PerfilMembro.findOneAndUpdate({ guildId: interaction.guildId, userId: interaction.user.id }, { $set: dadosPerfil }, { upsert: true, new: true });
  fichaEmAndamento.delete(interaction.user.id);

  const games = await getGames(interaction.guildId);
  const selectCargos = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_cargos_jogos')
      .setPlaceholder('Escolha os jogos para notificações...')
      .setMinValues(0)
      .setMaxValues(Math.max(1, games.length))
      .addOptions(games.map((game) => ({ label: game.nome, value: game.roleId, description: game.descricaoCargo })))
  );

  return responderFichaNoPainel(interaction, {
    content: '🎉 **Ficha de Membro Concluída!**\nEscolha abaixo os avisos que quer receber quando chamarem pro time:',
    embeds: [],
    components: [selectCargos]
  });
}

async function onAdicionarNickSec(interaction) {
  const input = new TextInputBuilder()
    .setCustomId('novo_nick_sec').setLabel('Novo nick secundário').setPlaceholder('Ex: Omotzin_alt')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20);
  return interaction.showModal(new ModalBuilder().setCustomId('modal_add_nick_sec').setTitle('Adicionar nick secundário').addComponents(new ActionRowBuilder().addComponents(input)));
}

async function onModalAdicionarNickSec(interaction) {
  const userId = interaction.user.id;
  const prev = normalizarDadosFicha(fichaEmAndamento.get(userId));
  const novoNick = interaction.fields.getTextInputValue('novo_nick_sec').trim().toLowerCase();
  const secundarios = Array.isArray(prev.nicks_secundarios) ? [...prev.nicks_secundarios] : [];
  const principal = String(prev.nick_principal_input || prev.nick_principal || '').trim().toLowerCase();
  if (!novoNick || novoNick.length < 3 || novoNick.length > 20 || !NICK_PATTERN.test(novoNick)) {
    return responderFichaNoPainel(interaction, { content: 'Nick inválido. Use 3-20 caracteres.', flags: 64 });
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
  secundarios.forEach((nick) => row.addComponents(new ButtonBuilder().setCustomId(`remove_nick_sec_${nick}`).setLabel(nick).setStyle(ButtonStyle.Danger)));
  row.addComponents(new ButtonBuilder().setCustomId('btn_voltar_nicks').setLabel('Voltar').setStyle(ButtonStyle.Secondary));
  return responderFichaNoPainel(interaction, {
    content: secundarios.length > 0 ? 'Clique no nick que deseja remover:' : 'Nenhum nick cadastrado.',
    embeds: [], components: [row]
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
  return responderFichaNoPainel(interaction, buildNicksSecundariosView(normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id))));
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
  return responderFichaNoPainel(interaction, {
    content: `✅ Campo **${campo.label}** corrigido!\nContinue preenchendo as etapas abaixo:`,
    embeds: [],
    components: compactarLinhasComponentes(buildFichaNavegacao(novo))
  });
}

// ─── VISUALIZAÇÃO DE PERFIL (ABAS) ───────────────────────────────────────────

async function onVerPerfil(interaction, mensagemFuncionalidade = null) {
  const userId = interaction.user.id;
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId });
  const voltarAoHub = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary))];

  if (mensagemFuncionalidade) {
    salvarMsgFuncionalidadeGenerica(interaction, mensagemFuncionalidade);
    if (!perfil) {
      await mensagemFuncionalidade.edit({ content: '❌ Você ainda não preencheu sua ficha!', embeds: [], components: voltarAoHub }).catch(() => null);
    } else {
      const embed = buildEmbedFicha(perfil, interaction.member);
      const navButtons = buildNavegacaoNichosPerfil(userId, 'ficha');
      await mensagemFuncionalidade.edit({ content: '', embeds: [embed], components: compactarLinhasComponentes(navButtons) }).catch(() => null);
    }
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    return;
  }

  if (!perfil) {
    return responderFichaNoPainel(interaction, { content: '❌ Você ainda não preencheu sua ficha!', embeds: [], components: voltarAoHub });
  }

  const embed = buildEmbedFicha(perfil, interaction.member);
  const navButtons = buildNavegacaoNichosPerfil(userId, 'ficha');
  return responderFichaNoPainel(interaction, { content: '', embeds: [embed], components: compactarLinhasComponentes(navButtons) });
}

// Navegação entre abas: Ficha
async function onAbaFicha(interaction) {
  const targetId = interaction.customId.replace(/^btn_aba_perfil_ficha_/, '');
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!perfil) return responderFichaNoPainel(interaction, { content: '❌ Perfil não encontrado.', embeds: [], components: [] });
  const embed = buildEmbedFicha(perfil, member);
  const nav = buildNavegacaoNichosPerfil(targetId, 'ficha');
  return responderFichaNoPainel(interaction, { content: '', embeds: [embed], components: compactarLinhasComponentes(nav) });
}

// Navegação entre abas: Avaliação
async function onAbaAvaliacao(interaction) {
  const targetId = interaction.customId.replace(/^btn_aba_perfil_avaliacao_/, '');
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!perfil) return responderFichaNoPainel(interaction, { content: '❌ Perfil não encontrado.', embeds: [], components: [] });
  const embed = buildEmbedAvaliacao(perfil, member);
  const nav = buildNavegacaoNichosPerfil(targetId, 'avaliacao');
  return responderFichaNoPainel(interaction, { content: '', embeds: [embed], components: compactarLinhasComponentes(nav) });
}

// Navegação entre abas: Stats & Medalhas
async function onAbaStats(interaction) {
  const targetId = interaction.customId.replace(/^btn_aba_perfil_stats_/, '');
  return renderizarAbaStats(interaction, targetId);
}

// ─── SELEÇÃO DE PERFIL (BUSCA) ────────────────────────────────────────────────

async function onAbrirSelecionarPerfil(interaction, mensagemFuncionalidade = null) {
  if (!interaction.guild) {
    const payload = { content: '❌ Essa ação só funciona em servidor.', embeds: [], components: [] };
    if (mensagemFuncionalidade) { await mensagemFuncionalidade.edit(payload).catch(() => null); return; }
    return responderFichaNoPainel(interaction, payload);
  }

  const selectUser = new UserSelectMenuBuilder()
    .setCustomId('select_user_perfil')
    .setPlaceholder('🔍 Pesquise ou selecione qualquer membro do servidor...')
    .setMaxValues(1);

  const rowSelect = new ActionRowBuilder().addComponents(selectUser);
  const rowAcoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_abrir_busca_nick').setLabel('Buscar por Nick / Nome').setStyle(ButtonStyle.Primary).setEmoji('🔎'),
    new ButtonBuilder().setCustomId('btn_iniciar_ficha').setLabel('Editar minha ficha').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary)
  );

  const payload = {
    content: '🔍 **Consulta de Perfis Ômega:**\nSelecione um membro ou busque pelo nick registrado:',
    embeds: [],
    components: compactarLinhasComponentes([rowSelect, rowAcoes])
  };

  if (mensagemFuncionalidade) {
    salvarMsgFuncionalidadeGenerica(interaction, mensagemFuncionalidade);
    await mensagemFuncionalidade.edit(payload).catch(() => null);
    return;
  }

  return responderFichaNoPainel(interaction, payload);
}

async function onSelectUserPerfil(interaction) {
  const targetId = interaction.values[0];
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!member) {
    return responderFichaNoPainel(interaction, {
      content: '❌ Não foi possível localizar esse membro.',
      embeds: [],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_abrir_select_ver_perfil').setLabel('← Voltar à busca').setStyle(ButtonStyle.Secondary))]
    });
  }

  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  if (!perfil) {
    return responderFichaNoPainel(interaction, {
      content: `❌ **${member.displayName}** ainda não completou a ficha.`,
      embeds: [],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_abrir_select_ver_perfil').setLabel('← Buscar outro membro').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('Voltar ao painel').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const embed = buildEmbedFicha(perfil, member);
  const nav = buildNavegacaoNichosPerfil(targetId, 'ficha');
  return responderFichaNoPainel(interaction, { content: '', embeds: [embed], components: compactarLinhasComponentes(nav) });
}

async function onAbrirBuscaNickModal(interaction) {
  const modal = new ModalBuilder().setCustomId('modal_buscar_perfil_nick').setTitle('Buscar Perfil por Nick');
  const inputNick = new TextInputBuilder().setCustomId('termo_busca_nick').setLabel('Digite o nick ou nome do jogador:').setPlaceholder('Ex: Omotzin, Flavio').setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(inputNick));
  return interaction.showModal(modal);
}

async function onModalBuscarPerfilNick(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;
  const termo = interaction.fields.getTextInputValue('termo_busca_nick').trim();
  if (!termo) return responderFichaNoPainel(interaction, { content: '❌ Digite um termo para busca.', embeds: [], components: [] });
  const termoRegex = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const perfil = await PerfilMembro.findOne({
    guildId: interaction.guildId,
    $or: [{ nick_principal: termoRegex }, { nomeComum: termoRegex }, { nicks_secundarios: termoRegex }, { nickJogo: termoRegex }]
  });

  if (!perfil) {
    return responderFichaNoPainel(interaction, {
      content: `❌ Nenhum perfil encontrado para **"${termo}"**.`,
      embeds: [],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_abrir_busca_nick').setLabel('Tentar novamente').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_abrir_select_ver_perfil').setLabel('← Voltar à lista').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const member = await interaction.guild.members.fetch(perfil.userId).catch(() => null);
  const embed = buildEmbedFicha(perfil, member);
  const nav = buildNavegacaoNichosPerfil(perfil.userId, 'ficha');
  return responderFichaNoPainel(interaction, { content: `🔍 Resultado para **"${termo}"**:`, embeds: [embed], components: compactarLinhasComponentes(nav) });
}

// ─── ADMIN: STATS ─────────────────────────────────────────────────────────────

async function onAbrirModalAdminEstatistica(interaction) {
  if (!hasPermissaoAdmin(interaction.member)) {
    return responderFichaNoPainel(interaction, { content: '❌ Apenas administradores ou membros de staff podem alterar essas estatísticas.', embeds: [], components: [] });
  }
  const [, prefixo, campo, targetId] = interaction.customId.match(/^btn_admin_(add|minus)_(gol|assist|save|chutes|mvp|pontuacao)_(.+)$/) || [];
  if (!prefixo || !campo || !targetId) return;
  return interaction.showModal(buildAdminStatModal(prefixo, campo, targetId));
}

async function onAdminIncrement(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;
  if (!hasPermissaoAdmin(interaction.member)) {
    return responderFichaNoPainel(interaction, { content: '❌ Apenas administradores ou membros de staff podem alterar essas estatísticas.', embeds: [], components: [] });
  }

  const match = interaction.customId.match(/^modal_admin_stat_(add|minus)_(gol|assist|save|chutes|mvp|pontuacao)_(.+)$/);
  if (!match) return;
  const [, prefixo, campo, targetId] = match;
  const valorTexto = interaction.fields.getTextInputValue('admin_stat_valor').trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(valorTexto.replace(/\s/g, ''))) {
    return responderFichaNoPainel(interaction, { content: '❌ Digite apenas números no campo de valor.', embeds: [], components: [] });
  }

  const camposMap = { gol: 'gols', assist: 'assist', save: 'saves', chutes: 'chutes', mvp: 'mvps', pontuacao: 'pontuacao' };
  const fieldName = camposMap[campo];
  if (!fieldName) return;
  const valorAbs = Number(valorTexto.replace(',', '.'));
  if (!Number.isFinite(valorAbs)) return;
  const valor = prefixo === 'minus' ? -Math.abs(valorAbs) : Math.abs(valorAbs);

  const perfilAtualizado = await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: targetId },
    { $inc: { [fieldName]: valor } },
    { upsert: true, new: true }
  );

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  return renderizarAbaStats(interaction, targetId, perfilAtualizado, target);
}

// ─── ADMIN: CADASTRO DE TÍTULOS (FLUXO POR ETAPAS) ──────────────────────────

// Etapa 1: Abrir escolha de colocação/tipo
async function onAbrirEscolhaTitulo(interaction) {
  if (!hasPermissaoAdmin(interaction.member)) {
    return responderFichaNoPainel(interaction, { content: '❌ Apenas administradores ou membros de staff podem cadastrar títulos.', embeds: [], components: [] });
  }
  const targetId = interaction.customId.replace(/^btn_admin_add_titulo_/, '');
  return responderFichaNoPainel(interaction, {
    content: '🏆 **Cadastrar Título de Campeonato**\nEscolha a colocação e a categoria do título conquistado:',
    embeds: [],
    components: compactarLinhasComponentes(buildEscolhaTituloBotoes(targetId))
  });
}

// Etapa 2: Após escolha de colocação/tipo → escolher formato de campeonato
async function onEscolherColocacaoTitulo(interaction) {
  if (!hasPermissaoAdmin(interaction.member)) {
    return responderFichaNoPainel(interaction, { content: '❌ Sem permissão.', embeds: [], components: [] });
  }
  const match = interaction.customId.match(/^btn_escolha_titulo_(omega|comunidade)_([123])_(.+)$/);
  if (!match) return;
  const [, tipo, colocacaoStr, targetId] = match;
  const colocacao = Number(colocacaoStr);
  const icones = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const labelTipo = tipo === 'omega' ? 'ÔMEGA Oficial' : 'Comunidade';

  return responderFichaNoPainel(interaction, {
    content: `${icones[colocacao]} **${colocacao}º Lugar — ${labelTipo}**\nAgora escolha o formato do campeonato:`,
    embeds: [],
    components: compactarLinhasComponentes(buildEscolhaFormatoTorneio(tipo, colocacao, targetId))
  });
}

// Etapa 3A: Formato Eliminatórias → abrir Modal Semifinais
async function onFormatoEliminatoria(interaction) {
  if (!hasPermissaoAdmin(interaction.member)) return;
  const match = interaction.customId.match(/^btn_formato_elim_(omega|comunidade)_([123])_(.+)$/);
  if (!match) return;
  const [, tipo, colocacaoStr, targetId] = match;
  return interaction.showModal(buildModalSemifinais(tipo, colocacaoStr, targetId));
}

// Etapa 3B: Formato Colocação → abrir Modal Tabela
async function onFormatoColocacao(interaction) {
  if (!hasPermissaoAdmin(interaction.member)) return;
  const match = interaction.customId.match(/^btn_formato_coloc_(omega|comunidade)_([123])_(.+)$/);
  if (!match) return;
  const [, tipo, colocacaoStr, targetId] = match;
  return interaction.showModal(buildModalTabelaColocacao(tipo, colocacaoStr, targetId));
}

// Etapa 3A submit: Semis preenchidas → mostrar botão para abrir modal de Finais
async function onSubmitSemifinais(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;
  if (!hasPermissaoAdmin(interaction.member)) return;

  const match = interaction.customId.match(/^modal_titulo_semis_(omega|comunidade)_([123])_(.+)$/);
  if (!match) return;
  const [, tipo, colocacaoStr, targetId] = match;

  const campeonato = interaction.fields.getTextInputValue('semis_campeonato').trim();
  const edicao = interaction.fields.getTextInputValue('semis_edicao').trim() || null;
  const time1Raw = interaction.fields.getTextInputValue('semis_time1').trim() || null;
  const time2Raw = interaction.fields.getTextInputValue('semis_time2').trim() || null;

  // Parseia "Nome do Time — Nick1 + Nick2" separando nome de jogadores pelo "—" ou por ":"
  function parsearTime(texto) {
    if (!texto) return { nome: null, jogadores: null };
    const sep = texto.includes('—') ? '—' : (texto.includes(':') ? ':' : null);
    if (sep) {
      const [nome, ...resto] = texto.split(sep);
      return { nome: nome.trim(), jogadores: resto.join(sep).trim() };
    }
    return { nome: null, jogadores: texto.trim() };
  }

  const t1 = parsearTime(time1Raw);
  const t2 = parsearTime(time2Raw);

  const estadoParcial = {
    tipo, colocacao: Number(colocacaoStr), campeonato, edicao,
    semifinais: { time1Nome: t1.nome, time1Jogadores: t1.jogadores, time2Nome: t2.nome, time2Jogadores: t2.jogadores }
  };
  tituloEmCadastro.set(`${interaction.user.id}:${targetId}`, estadoParcial);

  // Mostrar botão para prosseguir com o Modal de Finais
  const rowProximo = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_abrir_finais_${tipo}_${colocacaoStr}_${targetId}`)
      .setLabel('Preencher a Final →')
      .setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
    new ButtonBuilder()
      .setCustomId(`btn_admin_add_titulo_${targetId}`)
      .setLabel('← Recomeçar')
      .setStyle(ButtonStyle.Secondary)
  );

  const resumoSemis = [
    `📋 **Campeonato:** ${campeonato}${edicao ? ` (${edicao})` : ''}`,
    `🔹 **Semifinalistas:**`,
    time1Raw ? `  • Time 1: ${time1Raw}` : null,
    time2Raw ? `  • Time 2: ${time2Raw}` : null
  ].filter(Boolean).join('\n');

  return responderFichaNoPainel(interaction, {
    content: `✅ **Semifinais registradas!**\n\n${resumoSemis}\n\nAgora preencha os dados da **Final** para concluir o cadastro:`,
    embeds: [],
    components: compactarLinhasComponentes([rowProximo])
  });
}

// Botão: abrir modal de finais (após semis)
async function onAbrirModalFinais(interaction) {
  if (!hasPermissaoAdmin(interaction.member)) return;
  const match = interaction.customId.match(/^btn_abrir_finais_(omega|comunidade)_([123])_(.+)$/);
  if (!match) return;
  const [, tipo, colocacaoStr, targetId] = match;
  return interaction.showModal(buildModalFinais(tipo, colocacaoStr, targetId));
}

// Etapa Final submit: Salvar título completo (eliminatórias)
async function onSubmitFinais(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;
  if (!hasPermissaoAdmin(interaction.member)) return;

  const match = interaction.customId.match(/^modal_titulo_finais_(omega|comunidade)_([123])_(.+)$/);
  if (!match) return;
  const [, tipo, colocacaoStr, targetId] = match;

  const estadoParcial = tituloEmCadastro.get(`${interaction.user.id}:${targetId}`);
  if (!estadoParcial) {
    return responderFichaNoPainel(interaction, { content: '❌ Sessão de cadastro expirou. Comece novamente.', embeds: [], components: [] });
  }

  const finais1Raw = interaction.fields.getTextInputValue('finais_time1').trim() || null;
  const finais2Raw = interaction.fields.getTextInputValue('finais_time2').trim() || null;
  const modo = interaction.fields.getTextInputValue('finais_modo').trim() || null;

  function parsearTime(texto) {
    if (!texto) return { nome: null, jogadores: null };
    const sep = texto.includes('—') ? '—' : (texto.includes(':') ? ':' : null);
    if (sep) {
      const [nome, ...resto] = texto.split(sep);
      return { nome: nome.trim(), jogadores: resto.join(sep).trim() };
    }
    return { nome: null, jogadores: texto.trim() };
  }

  const f1 = parsearTime(finais1Raw);
  const f2 = parsearTime(finais2Raw);

  const tituloCompleto = {
    tipo: estadoParcial.tipo,
    colocacao: estadoParcial.colocacao,
    formato: 'eliminatoria',
    campeonato: estadoParcial.campeonato,
    edicao: estadoParcial.edicao || null,
    semifinais: estadoParcial.semifinais || null,
    finais: { time1Nome: f1.nome, time1Jogadores: f1.jogadores, time2Nome: f2.nome, time2Jogadores: f2.jogadores, modo },
    colocacoesTabela: null,
    cadastradoEm: new Date()
  };

  const icone = { 1: '🥇', 2: '🥈', 3: '🥉' }[tituloCompleto.colocacao] || '🏆';
  const tituloString = `${icone} ${tituloCompleto.colocacao}º - ${tituloCompleto.campeonato}${tituloCompleto.edicao ? ` (${tituloCompleto.edicao})` : ''}`;

  const perfilAtualizado = await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: targetId },
    { $push: { titulosDetalhados: tituloCompleto, titulosLista: tituloString }, $inc: { titulos: 1 } },
    { upsert: true, new: true }
  );

  tituloEmCadastro.delete(`${interaction.user.id}:${targetId}`);

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  await renderizarAbaStats(interaction, targetId, perfilAtualizado, target);
}

// Submit: Formato Colocação Direta
async function onSubmitTabelaColocacao(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;
  if (!hasPermissaoAdmin(interaction.member)) return;

  const match = interaction.customId.match(/^modal_titulo_tabela_(omega|comunidade)_([123])_(.+)$/);
  if (!match) return;
  const [, tipo, colocacaoStr, targetId] = match;

  const campeonatoRaw = interaction.fields.getTextInputValue('tabela_campeonato').trim();
  const primeiro = interaction.fields.getTextInputValue('tabela_primeiro').trim() || null;
  const segundo = interaction.fields.getTextInputValue('tabela_segundo').trim() || null;
  const terceiro = interaction.fields.getTextInputValue('tabela_terceiro').trim() || null;
  const quarto = interaction.fields.getTextInputValue('tabela_quarto').trim() || null;

  // Campeonato pode ter edição separada por "--" ou "—"
  let campeonato = campeonatoRaw;
  let edicao = null;
  const sepIdx = campeonatoRaw.search(/\s*[—\-]{1,2}\s*/);
  if (sepIdx > 0) {
    campeonato = campeonatoRaw.slice(0, sepIdx).trim();
    edicao = campeonatoRaw.slice(sepIdx).replace(/^[\s—\-]+/, '').trim() || null;
  }

  const colocacao = Number(colocacaoStr);
  const icone = { 1: '🥇', 2: '🥈', 3: '🥉' }[colocacao] || '🏆';
  const tituloString = `${icone} ${colocacao}º - ${campeonato}${edicao ? ` (${edicao})` : ''}`;

  const tituloCompleto = {
    tipo,
    colocacao,
    formato: 'colocacao',
    campeonato,
    edicao,
    semifinais: null,
    finais: null,
    colocacoesTabela: { primeiro, segundo, terceiro, quarto },
    cadastradoEm: new Date()
  };

  const perfilAtualizado = await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: targetId },
    { $push: { titulosDetalhados: tituloCompleto, titulosLista: tituloString }, $inc: { titulos: 1 } },
    { upsert: true, new: true }
  );

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  await renderizarAbaStats(interaction, targetId, perfilAtualizado, target);
}

// ─── CARGOS DE JOGOS ─────────────────────────────────────────────────────────

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

  if (resultados.some((r) => r.status === 'rejected')) {
    return responderFichaNoPainel(interaction, {
      content: '⚠️ Perfil salvo, mas não consegui atualizar todos os cargos. Verifique as permissões do bot.',
      embeds: [],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('Ir ao painel').setStyle(ButtonStyle.Primary))]
    });
  }

  return responderFichaNoPainel(interaction, {
    content: '🎉 **Ficha de Membro concluída com sucesso!**\nVocê já está pronto para jogar com a galera da Ômega.',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('Ir ao painel principal').setStyle(ButtonStyle.Success))]
  });
}

// ─── REGISTRO DE HANDLERS ─────────────────────────────────────────────────────

function register(registry) {
  // Ficha
  registry.button('btn_iniciar_ficha', onIniciarFicha);
  registry.button(/^btn_etapa_\d+$/, onAbrirEtapaFicha);
  registry.button('btn_nicks_sec_nav', (interaction) => responderFichaNoPainel(interaction, buildNicksSecundariosView(normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id)))));
  registry.button('btn_salvar_concluir_ficha', onSalvarConcluirFicha);
  registry.button('btn_add_nick_sec', onAdicionarNickSec);
  registry.button('btn_remove_nick_sec', onRemoverNickSec);
  registry.button(/^remove_nick_sec_/, onSelecionarNickParaRemover);
  registry.button('btn_voltar_nicks', onVoltarNicks);
  registry.button(/^btn_corrigir_/, onCorrigirFichaCampo);

  // Visualização de perfil por abas
  registry.button('btn_ver_perfil', onVerPerfil);
  registry.button(/^btn_aba_perfil_ficha_/, onAbaFicha);
  registry.button(/^btn_aba_perfil_avaliacao_/, onAbaAvaliacao);
  registry.button(/^btn_aba_perfil_stats_/, onAbaStats);

  // Busca de membros
  registry.button('btn_abrir_select_ver_perfil', onAbrirSelecionarPerfil);
  registry.button('btn_abrir_busca_nick', onAbrirBuscaNickModal);

  // Admin: stats
  registry.button(/^btn_admin_(add|minus)_(gol|assist|save|chutes|mvp|pontuacao)_[0-9]+$/, onAbrirModalAdminEstatistica);

  // Admin: fluxo de títulos
  registry.button(/^btn_admin_add_titulo_[0-9]+$/, onAbrirEscolhaTitulo);
  registry.button(/^btn_escolha_titulo_(omega|comunidade)_[123]_[0-9]+$/, onEscolherColocacaoTitulo);
  registry.button(/^btn_formato_elim_(omega|comunidade)_[123]_[0-9]+$/, onFormatoEliminatoria);
  registry.button(/^btn_formato_coloc_(omega|comunidade)_[123]_[0-9]+$/, onFormatoColocacao);
  registry.button(/^btn_abrir_finais_(omega|comunidade)_[123]_[0-9]+$/, onAbrirModalFinais);

  // Modals
  registry.modal(/^modal_admin_stat_(add|minus)_(gol|assist|save|chutes|mvp|pontuacao)_[0-9]+$/, onAdminIncrement);
  registry.modal(/^modal_titulo_semis_(omega|comunidade)_[123]_[0-9]+$/, onSubmitSemifinais);
  registry.modal(/^modal_titulo_finais_(omega|comunidade)_[123]_[0-9]+$/, onSubmitFinais);
  registry.modal(/^modal_titulo_tabela_(omega|comunidade)_[123]_[0-9]+$/, onSubmitTabelaColocacao);
  registry.modal('modal_buscar_perfil_nick', onModalBuscarPerfilNick);
  registry.modal(/^modal_ficha_correcao_/, onModalCorrecaoFicha);
  registry.modal('modal_add_nick_sec', onModalAdicionarNickSec);
  registry.modal(/^modal_ficha_perfil_\d+$/, onModalFichaPerfil);

  // Selects
  registry.select('select_cargos_jogos', onSelectCargos);
  registry.select('select_ver_perfil', onSelectUserPerfil);
  registry.select('select_user_perfil', onSelectUserPerfil);
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
  onSelectVerPerfil: onSelectUserPerfil,
  onSelectFichaOpcao,
  onVoltarNicks,
  onIniciarFicha
};
