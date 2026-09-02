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
  buildPerfilEmbed,
  buildNicksSecundariosView,
  obterNomeExibicao
} = require('./embeds');

const {
  compactarLinhasComponentes,
  buildAdminButtons,
  buildAdminStatModal,
  buildAddTituloModal,
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
    content = `${INSTRUCOES_RANKS}\n\n📋 **Painel da Ficha de Membro:**\nClique em qualquer etapa abaixo para preencher ou editar as informações do seu perfil:`;
  } else {
    componentes = buildFichaSelects(dadosSalvos);
    content = `${INSTRUCOES_RANKS}\n\nEscolha as opções fixas abaixo para liberar os formulários:`;
  }

  const payload = {
    content,
    embeds: [],
    components: compactarLinhasComponentes(componentes)
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
    if (valor !== '') {
      dadosExistentes[campo.id] = valor;
    }
  });

  const validacaoEtapa = await validarCamposEtapa(etapaAtual, dadosExistentes, interaction.user.id, PerfilMembro);

  if (!validacaoEtapa.ok) {
    const campoComErro = obterCampoComErro(validacaoEtapa);
    const userId = interaction.user.id;
    fichaEmAndamento.set(userId, { ...dadosExistentes });

    return responderFichaNoPainel(interaction, {
      content: validacaoEtapa.mensagem,
      embeds: [],
      components: [criarBotaoCorrecao(campoComErro)]
    });
  }

  fichaEmAndamento.set(interaction.user.id, dadosExistentes);

  const titulosEtapas = [
    '1. Nome / Nasc / Estado',
    '2. País / Bio / CLA / Nick',
    '3. CLAs / Modo / Controle',
    '4. TikTok / Instagram'
  ];
  const etapaNome = titulosEtapas[etapaAtual] || `Etapa ${etapaAtual + 1}`;

  return responderFichaNoPainel(interaction, {
    content: `✅ Dados salvos da etapa **${etapaNome}**!\nContinue navegando pelas outras etapas ou clique em **Finalizar e Salvar Perfil**:`,
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
      content: '❌ Faltam as opções fixas obrigatórias (Input, Rank X1, Rank X2 ou Pico). Configure-as abaixo:',
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
      content: `❌ O nick principal **${nickPrincipal}** já está em uso por outro membro. Altere-o na etapa 2:`,
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

  const nicksSecundarios = [...new Set((Array.isArray(dados.nicks_secundarios) ? dados.nicks_secundarios : [])
    .map((nick) => String(nick).trim())
    .filter((nick) => nick && nick.toLowerCase() !== nickPrincipal.toLowerCase()))];

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
    nick_principal: nickPrincipal.toLowerCase(),
    nicks_secundarios: nicksSecundarios,
    rankX1,
    rankX2,
    picoRank,
    modoFavorito: modoFavorito || perfilAtual?.modoFavorito || null,
    input,
    controleTipo: controleTipo || perfilAtual?.controleTipo || null,
    tiktok: tiktok || perfilAtual?.tiktok || null,
    instagram: instagram || perfilAtual?.instagram || null,
    nickJogo: nickPrincipal,
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
    content: '🎉 **Ficha de Membro Concluída e Salva com Sucesso!**\nAgora escolha abaixo os avisos que você quer receber quando chamarem pro time:',
    embeds: [],
    components: [selectCargos]
  });
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

  return responderFichaNoPainel(interaction, {
    content: `✅ Campo **${campo.label}** corrigido com sucesso!\nContinue preenchendo as etapas abaixo:`,
    embeds: [],
    components: compactarLinhasComponentes(buildFichaNavegacao(novo))
  });
}

async function onVerPerfil(interaction, mensagemFuncionalidade = null) {
  const editarMensagemDoHub = Boolean(mensagemFuncionalidade);
  const voltarAoHub = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary))];
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });

  if (mensagemFuncionalidade) {
    salvarMsgFuncionalidadeGenerica(interaction, mensagemFuncionalidade);
    if (!perfil) {
      await mensagemFuncionalidade.edit({
        content: '❌ Você ainda não preencheu sua ficha! Clique em **Editar minha ficha** para cadastrar seu perfil.',
        embeds: [],
        components: voltarAoHub
      }).catch(() => null);
    } else {
      const embedPerfil = buildPerfilEmbed(perfil, interaction.member, { isPublic: false });
      const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(interaction.user.id) : [];
      const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
      const componentsExtras = titulosFisicos.length > 8
        ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${interaction.user.id}`).setLabel(`Ver todos os títulos (${titulosFisicos.length})`).setStyle(ButtonStyle.Primary))]
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
      content: '❌ Você ainda não preencheu sua ficha! Clique em **Editar minha ficha** para cadastrar seu perfil.',
      embeds: [],
      components: voltarAoHub
    });
  }

  const embedPerfil = buildPerfilEmbed(perfil, interaction.member, { isPublic: false });
  const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(interaction.user.id) : [];
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 8
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${interaction.user.id}`).setLabel(`Ver todos os títulos (${titulosFisicos.length})`).setStyle(ButtonStyle.Primary))]
    : [];

  return responderFichaNoPainel(interaction, {
    content: '',
    embeds: [embedPerfil],
    components: compactarLinhasComponentes([...adminButtons, ...componentsExtras, ...voltarAoHub])
  });
}

async function onAbrirSelecionarPerfil(interaction, mensagemFuncionalidade = null) {
  if (!interaction.guild) {
    const payload = { content: '❌ Essa ação só funciona em servidor.', embeds: [], components: [] };
    if (mensagemFuncionalidade) {
      await mensagemFuncionalidade.edit(payload).catch(() => null);
      return;
    }
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
    content: '🔍 **Consulta de Perfis Ômega:**\nSelecione qualquer membro no menu abaixo (você pode digitar o nome no campo de busca do Discord) ou pesquise pelo nick registrado:',
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
      content: '❌ Não foi possível localizar esse membro no servidor.',
      embeds: [],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_abrir_select_ver_perfil').setLabel('← Voltar à busca').setStyle(ButtonStyle.Secondary))]
    });
  }

  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  if (!perfil) {
    return responderFichaNoPainel(interaction, {
      content: `❌ **${member.displayName}** ainda não completou a ficha de perfil no servidor.`,
      embeds: [],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_abrir_select_ver_perfil').setLabel('← Buscar outro membro').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('Voltar ao painel').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const embedPerfil = buildPerfilEmbed(perfil, member, { isPublic: true });
  const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(targetId) : [];
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 8
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${targetId}`).setLabel(`Ver todos os títulos (${titulosFisicos.length})`).setStyle(ButtonStyle.Primary))]
    : [];

  return responderFichaNoPainel(interaction, {
    content: '',
    embeds: [embedPerfil],
    components: compactarLinhasComponentes([
      ...adminButtons,
      ...componentsExtras,
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_abrir_select_ver_perfil').setLabel('← Buscar outro membro').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('Voltar ao painel').setStyle(ButtonStyle.Secondary)
      )
    ])
  });
}

async function onAbrirBuscaNickModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_buscar_perfil_nick')
    .setTitle('Buscar Perfil por Nick');

  const inputNick = new TextInputBuilder()
    .setCustomId('termo_busca_nick')
    .setLabel('Digite o nick ou nome do jogador:')
    .setPlaceholder('Ex: Omotzin, Flavio, etc.')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(inputNick));
  return interaction.showModal(modal);
}

async function onModalBuscarPerfilNick(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;

  const termo = interaction.fields.getTextInputValue('termo_busca_nick').trim();
  if (!termo) {
    return responderFichaNoPainel(interaction, { content: '❌ Digite um termo para busca.', embeds: [], components: [] });
  }

  const termoRegex = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const perfil = await PerfilMembro.findOne({
    guildId: interaction.guildId,
    $or: [
      { nick_principal: termoRegex },
      { nomeComum: termoRegex },
      { nicks_secundarios: termoRegex },
      { nickJogo: termoRegex }
    ]
  });

  if (!perfil) {
    return responderFichaNoPainel(interaction, {
      content: `❌ Nenhum perfil encontrado para o termo **"${termo}"**.`,
      embeds: [],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_abrir_busca_nick').setLabel('Tentar novamente').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_abrir_select_ver_perfil').setLabel('← Voltar à lista').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const member = await interaction.guild.members.fetch(perfil.userId).catch(() => null);
  const embedPerfil = buildPerfilEmbed(perfil, member, { isPublic: true });
  const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(perfil.userId) : [];
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 8
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${perfil.userId}`).setLabel(`Ver todos os títulos (${titulosFisicos.length})`).setStyle(ButtonStyle.Primary))]
    : [];

  return responderFichaNoPainel(interaction, {
    content: `🔍 Resultado encontrado para **"${termo}"**:`,
    embeds: [embedPerfil],
    components: compactarLinhasComponentes([
      ...adminButtons,
      ...componentsExtras,
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_abrir_select_ver_perfil').setLabel('← Buscar outro membro').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('Voltar ao painel').setStyle(ButtonStyle.Secondary)
      )
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
    .setTitle(`🏆 Títulos Oficiais • ${obterNomeExibicao(perfil, member)}`)
    .setDescription(formatarTitulosParaTexto(titulosLista, pagina.paginaAtual, 15))
    .setColor('#FFD700');

  return responderFichaNoPainel(interaction, {
    content: '',
    embeds: [embed],
    components: [
      buildTitulosButtons(targetId, 1, pagina.totalPaginas),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary))
    ]
  });
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
    .setTitle(`🏆 Títulos Oficiais • ${obterNomeExibicao(perfil, member)}`)
    .setDescription(formatarTitulosParaTexto(titulosLista, pagina.paginaAtual, 15))
    .setColor('#FFD700');

  return responderFichaNoPainel(interaction, {
    content: '',
    embeds: [embed],
    components: [
      buildTitulosButtons(targetId, pagina.paginaAtual, pagina.totalPaginas),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary))
    ]
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

  const perfilAtualizado = await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: targetId },
    { $inc: { [fieldName]: valor } },
    { upsert: true, new: true }
  );

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  const embedPerfil = buildPerfilEmbed(perfilAtualizado, target, { isPublic: false });
  const adminButtons = buildAdminButtons(targetId);
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfilAtualizado.titulosLista) ? perfilAtualizado.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 8
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${targetId}`).setLabel(`Ver todos os títulos (${titulosFisicos.length})`).setStyle(ButtonStyle.Primary))]
    : [];
  const voltarAoHub = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Concluir / Voltar ao painel').setStyle(ButtonStyle.Secondary))];

  return responderFichaNoPainel(interaction, {
    content: `✅ Estatística **${fieldName.toUpperCase()}** alterada em **+${valor}** para **${target ? target.displayName : 'o jogador'}**!`,
    embeds: [embedPerfil],
    components: compactarLinhasComponentes([...adminButtons, ...componentsExtras, ...voltarAoHub])
  });
}

async function onAbrirModalAdminTitulo(interaction) {
  if (!hasPermissaoAdmin(interaction.member)) {
    return responderFichaNoPainel(interaction, { content: '❌ Apenas administradores ou membros de staff podem cadastrar títulos.', embeds: [], components: [] });
  }

  const targetId = interaction.customId.replace(/^btn_admin_add_titulo_/, '');
  return interaction.showModal(buildAddTituloModal(targetId));
}

async function onAdminAddTitulo(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;

  if (!hasPermissaoAdmin(interaction.member)) {
    return responderFichaNoPainel(interaction, { content: '❌ Apenas administradores ou membros de staff podem cadastrar títulos.', embeds: [], components: [] });
  }

  const targetId = interaction.customId.replace(/^modal_admin_add_titulo_/, '');
  const colocacao = interaction.fields.getTextInputValue('titulo_colocacao_input').trim();
  const campeonato = interaction.fields.getTextInputValue('titulo_campeonato_input').trim();
  const edicao = interaction.fields.getTextInputValue('titulo_edicao_input')?.trim() || '';
  const detalhe = interaction.fields.getTextInputValue('titulo_detalhe_input')?.trim() || '';

  const icone = extrairIconeTitulo(colocacao);
  let tituloFormatado = `${icone} ${colocacao} - ${campeonato}`;
  if (edicao) tituloFormatado += ` (${edicao})`;
  if (detalhe) tituloFormatado += ` [${detalhe}]`;

  const perfilAtualizado = await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: targetId },
    {
      $push: { titulosLista: tituloFormatado },
      $inc: { titulos: 1 }
    },
    { upsert: true, new: true }
  );

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  const embedPerfil = buildPerfilEmbed(perfilAtualizado, target, { isPublic: false });
  const adminButtons = buildAdminButtons(targetId);
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfilAtualizado.titulosLista) ? perfilAtualizado.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 8
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${targetId}`).setLabel(`Ver todos os títulos (${titulosFisicos.length})`).setStyle(ButtonStyle.Primary))]
    : [];
  const voltarAoHub = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Concluir / Voltar ao painel').setStyle(ButtonStyle.Secondary))];

  return responderFichaNoPainel(interaction, {
    content: `🏆 Título oficial **"${tituloFormatado}"** cadastrado com sucesso para **${target ? target.displayName : 'o jogador'}**!`,
    embeds: [embedPerfil],
    components: compactarLinhasComponentes([...adminButtons, ...componentsExtras, ...voltarAoHub])
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
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('Ir ao painel').setStyle(ButtonStyle.Primary))]
    });
  }

  return responderFichaNoPainel(interaction, {
    content: '🎉 **Ficha de Membro concluída com sucesso!**\nVocê já está pronto para jogar com a galera da Ômega.',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('Ir ao painel principal').setStyle(ButtonStyle.Success))]
  });
}

function register(registry) {
  registry.button('btn_iniciar_ficha', onIniciarFicha);
  registry.button(/^btn_etapa_\d+$/, onAbrirEtapaFicha);
  registry.button('btn_nicks_sec_nav', (interaction) => {
    const dados = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
    return responderFichaNoPainel(interaction, buildNicksSecundariosView(dados));
  });
  registry.button('btn_salvar_concluir_ficha', onSalvarConcluirFicha);
  registry.button('btn_add_nick_sec', onAdicionarNickSec);
  registry.button('btn_remove_nick_sec', onRemoverNickSec);
  registry.button(/^remove_nick_sec_/, onSelecionarNickParaRemover);
  registry.button('btn_voltar_nicks', onVoltarNicks);
  registry.button(/^btn_corrigir_/, onCorrigirFichaCampo);
  registry.button('btn_ver_perfil', onVerPerfil);
  registry.button('btn_abrir_select_ver_perfil', onAbrirSelecionarPerfil);
  registry.button('btn_abrir_busca_nick', onAbrirBuscaNickModal);
  registry.button(/^btn_ver_titulos_\d+$/, onVerTodosTitulos);
  registry.button(/^btn_titulos_(prev|next)_\d+_\d+$/, onPaginarTitulos);
  registry.button(/^btn_admin_(gol|assist|save|chutes|mvp|pontuacao)_[0-9]+$/, onAbrirModalAdminEstatistica);
  registry.button(/^btn_admin_add_titulo_[0-9]+$/, onAbrirModalAdminTitulo);
  registry.modal(/^modal_admin_stat_(gol|assist|save|chutes|mvp|pontuacao)_[0-9]+$/, onAdminIncrement);
  registry.modal(/^modal_admin_add_titulo_[0-9]+$/, onAdminAddTitulo);
  registry.modal('modal_buscar_perfil_nick', onModalBuscarPerfilNick);
  registry.modal(/^modal_ficha_correcao_/, onModalCorrecaoFicha);
  registry.modal('modal_add_nick_sec', onModalAdicionarNickSec);
  registry.modal(/^modal_ficha_perfil_\d+$/, onModalFichaPerfil);
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
