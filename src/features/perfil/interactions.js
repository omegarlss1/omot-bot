const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const PerfilMembro = require('../../db/models/perfilMembro');
const PainelPrincipal = require('../../db/models/painelPrincipal');
const { getGames } = require('../games/catalog');
const { MAPA_INDICADORES, calcularCategorias } = require('../../data/mapa_indicadores');
const { getTitulosDoJogador, getPaginaTitulos, formatarTitulosParaTexto } = require('../../data/titulos');
const { obterMensagemFuncionalidade } = require('../hub/mensagem');

const CATEGORIAS_META = {
  inteligencia_leitura: { emoji: '🧠', label: 'Inteligência e leitura de jogo' },
  conhecimento_evolucao: { emoji: '📚', label: 'Conhecimento e evolução' },
  controle_mecanica: { emoji: '⚙', label: 'Controle e mecânica' },
  ataque: { emoji: '⚔', label: 'Ataque' },
  defesa: { emoji: '🛡', label: 'Defesa' },
  equipe: { emoji: '🤝', label: 'Jogo em equipe' },
  criatividade: { emoji: '🎨', label: 'Criatividade e personalidade' },
  regularidade: { emoji: '📈', label: 'Regularidade e desempenho' }
};

const fichaEmAndamento = new Map();
const painelFichaPorUsuario = new Map();

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
  const { ephemeral, flags, ...editPayload } = payload;

  if (mensagem) {
    if (interaction.isModalSubmit?.()) {
      if (!interaction.deferred && !interaction.replied) {
        try { await interaction.deferReply({ flags: 64 }); } catch (_) {}
      }
      await mensagem.edit(editPayload);
      try { await interaction.deleteReply(); } catch (_) {}
      return;
    }
    if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
      if (!interaction.deferred && !interaction.replied) {
        try { await interaction.deferUpdate(); } catch (_) {}
      }
      await mensagem.edit(editPayload);
      return;
    }
  }

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(() => null);
  }
  try {
    return interaction.update(payload).catch(() => interaction.reply(payload));
  } catch (_) {
    return interaction.reply(payload).catch(() => null);
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

const VALORES_INPUT_PERMITIDOS = ['Touch', 'Controle', 'Híbrido'];
const VALORES_PLATAFORMA_PERMITIDAS = ['Android', 'iOS'];
const VALORES_RANK_PERMITIDOS = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Champion', 'Grand Champion'];
const OBRIGATORIOS = ['input', 'rank_x1', 'rank_x2', 'pico_rank'];
const NICK_PATTERN = /^[^\p{C}\r\n]+$/u;

const FICHA_MODAL_STEPS = [
  [
    { id: 'nome_comum_input', label: 'Nome da comunidade / como quer ser conhecido', style: TextInputStyle.Short, required: true },
    { id: 'data_nascimento_input', label: 'Data de nascimento', style: TextInputStyle.Short, required: false, placeholder: 'DD/MM/AAAA' },
    { id: 'estado_input', label: 'Estado', style: TextInputStyle.Short, required: false }
  ],
  [
    { id: 'pais_input', label: 'País', style: TextInputStyle.Short, required: false },
    { id: 'bio_input', label: 'Bio (máx. 150)', style: TextInputStyle.Paragraph, required: false },
    { id: 'cla_atual_input', label: 'CLA atual', style: TextInputStyle.Short, required: false },
    { id: 'nick_principal_input', label: 'Nick principal', style: TextInputStyle.Short, required: true, placeholder: 'Ex: Omotzin' }
  ],
  [
    { id: 'clas_anteriores_input', label: 'CLAs anteriores (separadas por ,)', style: TextInputStyle.Short, required: false },
    { id: 'modo_favorito_input', label: 'Modo favorito', style: TextInputStyle.Short, required: false },
    { id: 'controle_tipo_input', label: 'Tipo de controle', style: TextInputStyle.Short, required: false, placeholder: 'Ex: Três dedos, Joystick, Gamepad Bluetooth, controle PS4/Xbox...' }
  ],
  [
    { id: 'tiktok_input', label: 'TikTok', style: TextInputStyle.Short, required: false },
    { id: 'instagram_input', label: 'Instagram', style: TextInputStyle.Short, required: false }
  ]
];

function normalizarOpcaoPermitida(valor, opcoesPermitidas) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  const encontrado = opcoesPermitidas.find((opcao) => opcao.toLowerCase() === texto.toLowerCase());
  return encontrado || null;
}

function validarDataNascimento(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return { ok: true, value: null };
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(texto)) {
    return { ok: false, error: '❌ O campo de data de nascimento precisa seguir o formato DD/MM/AAAA.' };
  }

  const [dia, mes, ano] = texto.split('/').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    Number.isNaN(data.getTime()) ||
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return { ok: false, error: '❌ A data de nascimento informada é inválida.' };
  }

  return { ok: true, value: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` };
}

function sanitizeTextoLivre(valor, { maxLength = 120, allowEmpty = true } = {}) {
  const texto = String(valor ?? '').trim();
  if (!texto) return allowEmpty ? '' : null;
  const semMention = texto.replace(/@everyone|@here/gi, '');
  return semMention.slice(0, maxLength);
}

function hasPermissaoAdmin(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const nomes = (member.roles?.cache?.map((role) => role.name || '') || []).map((nome) => nome.toLowerCase());
  return nomes.some((nome) => /staff|admin|moderador|coordena(ca|ção)|diretoria/.test(nome));
}

function compactarLinhasComponentes(rows) {
  return (rows || [])
    .map((row) => {
      if (!row) return null;
      const componentes = Array.isArray(row.components) ? row.components : [];
      if (!componentes.length) return null;
      const linha = new ActionRowBuilder();
      componentes.forEach((componente) => linha.addComponents(componente));
      return linha;
    })
    .filter((row) => row && row.components && row.components.length > 0 && row.components.length <= 5);
}

function formatarBarra(valor) {
  const porcentagem = Math.max(0, Math.min(100, Number(valor) || 0));
  const preenchidos = Math.round(porcentagem / 10);
  const vazios = 10 - preenchidos;
  return `${'█'.repeat(preenchidos)}${'░'.repeat(vazios)}`;
}

function calcularIdade(dataNascimento) {
  if (!dataNascimento) return 0;

  const data = new Date(dataNascimento);
  if (Number.isNaN(data.getTime())) return 0;

  const hoje = new Date();
  let idade = hoje.getFullYear() - data.getFullYear();
  const mesAtual = hoje.getMonth();
  const diaAtual = hoje.getDate();
  const mesNascimento = data.getMonth();
  const diaNascimento = data.getDate();

  if (mesAtual < mesNascimento || (mesAtual === mesNascimento && diaAtual < diaNascimento)) {
    idade -= 1;
  }

  return idade > 0 ? idade : 0;
}

function normalizarValor(valor, fallback = 'Não informado') {
  if (valor === null || valor === undefined || valor === '') return fallback;
  return String(valor);
}

function sanitizeValue(value, fallback = 'Não informado') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function obterNomeExibicao(perfil, membro) {
  return perfil?.nomeComum || perfil?.nickJogo || membro?.displayName || membro?.user?.username || 'Jogador';
}

function criarLinhaCategoria(categoria, percentual) {
  const meta = CATEGORIAS_META[categoria] || { emoji: '📊', label: categoria };
  return `${meta.emoji} ${meta.label}: ${formatarBarra(percentual)} ${percentual}%`;
}

function buildAdminButtons(targetId) {
  if (!targetId) return [];

  const row1 = new ActionRowBuilder();
  row1.addComponents(
    new ButtonBuilder().setCustomId(`btn_admin_gol_${targetId}`).setLabel('+ Gol').setStyle(ButtonStyle.Success).setEmoji('⚽'),
    new ButtonBuilder().setCustomId(`btn_admin_assist_${targetId}`).setLabel('+ Assist').setStyle(ButtonStyle.Primary).setEmoji('🅰️'),
    new ButtonBuilder().setCustomId(`btn_admin_save_${targetId}`).setLabel('+ Save').setStyle(ButtonStyle.Secondary).setEmoji('🧤'),
    new ButtonBuilder().setCustomId(`btn_admin_chutes_${targetId}`).setLabel('+ Chutes').setStyle(ButtonStyle.Secondary).setEmoji('🥅'),
    new ButtonBuilder().setCustomId(`btn_admin_mvp_${targetId}`).setLabel('+ MVP').setStyle(ButtonStyle.Danger).setEmoji('🏅')
  );

  const row2 = new ActionRowBuilder();
  row2.addComponents(
    new ButtonBuilder().setCustomId(`btn_admin_pontuacao_${targetId}`).setLabel('+ Pontuação').setStyle(ButtonStyle.Primary).setEmoji('🎯')
  );

  return [row1, row2];
}

function buildAdminStatModal(field, targetId) {
  const labels = {
    gol: 'Gol',
    assist: 'Assist',
    save: 'Save',
    chutes: 'Chutes',
    mvp: 'MVP',
    pontuacao: 'Pontuação'
  };

  const modal = new ModalBuilder()
    .setCustomId(`modal_admin_stat_${field}_${targetId}`)
    .setTitle(`Adicionar ${labels[field] || 'estatística'}`);

  const inputValor = new TextInputBuilder()
    .setCustomId('admin_stat_valor')
    .setLabel(`Valor para adicionar em ${labels[field] || 'estatística'}`)
    .setPlaceholder('Ex: 1, 3, 5')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(inputValor));
  return modal;
}

function buildTitulosButtons(targetId, paginaAtual = 1, totalPaginas = 1) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_titulos_prev_${targetId}_${paginaAtual}`)
      .setLabel('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paginaAtual <= 1),
    new ButtonBuilder()
      .setCustomId(`btn_titulos_next_${targetId}_${paginaAtual}`)
      .setLabel('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paginaAtual >= totalPaginas)
  );
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

function buildFichaModalEtapa(stepIndex, valoresPreenchidos = {}, { erro = null, campoErroId = null } = {}) {
  const campos = FICHA_MODAL_STEPS[stepIndex] || [];
  const tituloBase = `Ficha ${stepIndex + 1}/${FICHA_MODAL_STEPS.length}`;
  console.log('[ficha-modal-title]', {
    stepIndex,
    titleLength: tituloBase.length,
    tituloBase,
    valoresPreenchidos: OBRIGATORIOS.filter((campo) => valoresPreenchidos?.[campo]).length
  });

  const modal = new ModalBuilder()
    .setCustomId(`modal_ficha_perfil_${stepIndex + 1}`)
    .setTitle(tituloBase);

  campos.forEach((campo) => {
    const input = new TextInputBuilder()
      .setCustomId(campo.id)
      .setLabel(campo.label)
      .setStyle(campo.style)
      .setRequired(Boolean(campo.required));

    const valorAtual = valoresPreenchidos?.[campo.id];
    const ehCampoErro = Boolean(campoErroId && campo.id === campoErroId);

    if (campo.placeholder) {
      input.setPlaceholder(campo.placeholder);
    }

    if (ehCampoErro && erro) {
      input.setPlaceholder('Formato inválido. Use DD/MM/AAAA.');
      input.setValue('');
    } else if (valorAtual !== undefined && valorAtual !== null && valorAtual !== '') {
      input.setValue(String(valorAtual));
    }

    if (campo.id === 'bio_input') {
      input.setMaxLength(150);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return modal;
}

function buildFichaButtons(dados = {}) {
  const rows = [];

  const inputSelecionado = dados.input || '';
  const inputRow = new ActionRowBuilder();
  VALORES_INPUT_PERMITIDOS.forEach((valor) => {
    inputRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`ficha_input_${valor}`)
        .setLabel(valor)
        .setStyle(inputSelecionado === valor ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  });
  rows.push(inputRow);

  const rankX1Selecionado = dados.rank_x1 || '';
  const rankX1Row = new ActionRowBuilder();
  VALORES_RANK_PERMITIDOS.forEach((valor) => {
    rankX1Row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ficha_rank_x1_${valor}`)
        .setLabel(valor)
        .setStyle(rankX1Selecionado === valor ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  });
  rows.push(rankX1Row);

  const rankX2Selecionado = dados.rank_x2 || '';
  const rankX2Row = new ActionRowBuilder();
  VALORES_RANK_PERMITIDOS.forEach((valor) => {
    rankX2Row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ficha_rank_x2_${valor}`)
        .setLabel(valor)
        .setStyle(rankX2Selecionado === valor ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  });
  rows.push(rankX2Row);

  const picoSelecionado = dados.pico_rank || '';
  const picoRow = new ActionRowBuilder();
  VALORES_RANK_PERMITIDOS.forEach((valor) => {
    picoRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`ficha_pico_rank_${valor}`)
        .setLabel(valor)
        .setStyle(picoSelecionado === valor ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  });
  rows.push(picoRow);

  return rows;
}

function buildNicksSecundariosView(dados = {}) {
  const principal = dados.nick_principal_input || dados.nick_principal || 'Não informado';
  const secundarios = Array.isArray(dados.nicks_secundarios) ? dados.nicks_secundarios : [];
  const resumo = secundarios.length
    ? secundarios.join(', ')
    : 'Nenhum nick secundário cadastrado.';
  const botoes = [
    new ButtonBuilder()
      .setCustomId('btn_add_nick_sec')
      .setLabel('+ Adicionar nick secundário')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_continuar_ficha')
      .setLabel('Continuar para etapa 3/4')
      .setStyle(ButtonStyle.Success)
  ];

  if (secundarios.length > 0) {
    botoes.splice(1, 0, new ButtonBuilder()
      .setCustomId('btn_remove_nick_sec')
      .setLabel('Remover')
      .setStyle(ButtonStyle.Danger));
  }

  return {
    embeds: [new EmbedBuilder()
      .setTitle('Nicks da ficha')
      .setDescription(`Nick principal: **${principal}**\nSecundários (${secundarios.length}): ${resumo}`)],
    components: [new ActionRowBuilder().addComponents(botoes)]
  };
}

async function onIniciarFicha(interaction, mensagemFuncionalidade = null) {
  if (!interaction || typeof interaction.reply !== 'function') {
    return;
  }

  const perfilSalvo = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id }).lean();
  const dadosSalvos = prepararDadosFichaSalva(perfilSalvo);
  fichaEmAndamento.set(interaction.user.id, dadosSalvos);
  const componentes = buildFichaButtons(dadosSalvos);
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
      ? 'Encontramos sua ficha anterior. Revise os botões ou continue para editar os dados salvos:'
      : 'Antes de abrir a ficha, escolha as opções fixas abaixo para ficar tudo consistente:',
    components: componentes,
    ephemeral: true
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

async function onSelecionarOpcaoFicha(interaction) {
  const match = interaction.customId.match(/^ficha_(input|rank_x1|rank_x2|pico_rank)_(.+)$/);
  if (!match) return;

  const [, chave, valorRaw] = match;
  const valor = valorRaw.replace(/_/g, ' ');
  const userId = interaction.user.id;
  const prev = fichaEmAndamento.get(userId) || {};
  const novo = { ...prev, [chave]: valor };
  fichaEmAndamento.set(userId, novo);
  const faltando = OBRIGATORIOS.filter((campo) => !novo[campo]).length;

  console.log('[ficha-botao]', {
    userId,
    customId: interaction.customId,
    chave,
    valor,
    dadosAtual: { ...novo },
    faltando
  });

  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferUpdate(); } catch (_) {}
  }
  return responderFichaNoPainel(interaction, {
    content: faltando.length > 0
      ? `✅ Opção salva: **${valor}**. Falta(m) ${faltando.length} campo(s) para continuar.`
      : `✅ Opção salva: **${valor}**. Pronto para continuar.`,
    components: buildFichaButtons(novo),
    ephemeral: true
  });
}

async function onContinuarFicha(interaction) {
  const dados = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
  if (Number(dados.etapa) === 2) {
    return interaction.showModal(buildFichaModalEtapa(2, dados));
  }
  const faltando = OBRIGATORIOS.filter((campo) => !dados[campo]);
  const nomesCampos = { input: 'Input', rank_x1: 'Rank X1', rank_x2: 'Rank X2', pico_rank: 'Pico Rank' };

  if (faltando.length) {
    return responderFichaNoPainel(interaction, { content: `❌ Faltam opções obrigatórias: ${faltando.map((campo) => nomesCampos[campo]).join(', ')}.`, ephemeral: true });
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
    return responderFichaNoPainel(interaction, { content: 'Nick inválido. Use 3-20 caracteres sem quebras de linha ou caracteres de controle.', ephemeral: true });
  }
  if (novoNick === principal || secundarios.includes(novoNick)) {
    return responderFichaNoPainel(interaction, { content: 'Esse nick já está em uso na sua ficha.', ephemeral: true });
  }

  secundarios.push(novoNick);
  const novo = { ...prev, nicks_secundarios: secundarios };
  fichaEmAndamento.set(userId, novo);
  return responderFichaNoPainel(interaction, { ...buildNicksSecundariosView(novo), ephemeral: true });
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

function buildPerfilEmbed(perfil, member, { isPublic = false } = {}) {
  const nomeExibicao = obterNomeExibicao(perfil, member);
  const idade = Number(perfil?.idade) || calcularIdade(perfil?.dataNascimento);
  const estado = perfil?.estado || 'Não informado';
  const pais = perfil?.pais || 'Não informado';
  const bio = perfil?.bio || 'Sem bio por enquanto.';

  const categorias = calcularCategorias(perfil?.indicadoresDetalhados || {});
  const categoriasAtuais = Object.entries(CATEGORIAS_META).reduce((acc, [key]) => {
    acc[key] = Number(perfil?.[key]) || categorias[key] || 0;
    return acc;
  }, {});

  const rankX1 = normalizarValor(perfil?.rankX1, 'Não informado');
  const rankX2 = normalizarValor(perfil?.rankX2, 'Não informado');
  const picoRank = normalizarValor(perfil?.picoRank, 'Não informado');
  const modoFavorito = normalizarValor(perfil?.modoFavorito, 'Não informado');
  const input = normalizarValor(perfil?.input, 'Não informado');
  const controleTipo = normalizarValor(perfil?.controleTipo, 'Não informado');
  const plataforma = normalizarValor(perfil?.plataforma, 'Não informado');
  const horarioJoga = normalizarValor(perfil?.horarioJoga, 'Não informado');

  const titulosLista = Array.isArray(perfil?.titulosLista) ? perfil.titulosLista : [];
  const titulosFisicos = getTitulosDoJogador(titulosLista);
  const titulosTexto = titulosFisicos.length > 10 ? `${titulosFisicos.slice(0, 10).map((titulo) => `${titulo.icone} ${titulo.nome}`).join(' | ')} ...` : titulosFisicos.map((titulo) => `${titulo.icone} ${titulo.nome}`).join(' | ');

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${nomeExibicao}`)
    .setDescription(`Bio: ${bio}`)
    .addFields(
      {
        name: '🏆 Competitivo',
        value: `Rank X1: **${rankX1}**\nRank X2: **${rankX2}**\nPico: **${picoRank}**\nModo Fav: **${modoFavorito}**`,
        inline: true
      },
      {
        name: '🎮 Setup',
        value: `Input: **${input}**\nControle: **${controleTipo}**\nPlataforma: **${plataforma}**\nHorário: **${horarioJoga}**`,
        inline: true
      },
      {
        name: '📊 8 categorias oficiais',
        value: Object.entries(CATEGORIAS_META)
          .map(([key, meta]) => `${meta.emoji} ${meta.label}: ${formatarBarra(categoriasAtuais[key] || 0)} ${categoriasAtuais[key] || 0}%`)
          .join('\n'),
        inline: false
      },
      {
        name: '📈 Stats ÔMEGA',
        value: `Gols: **${Number(perfil?.gols || 0)}** | Assist: **${Number(perfil?.assist || 0)}** | Saves: **${Number(perfil?.saves || 0)}** | Chutes: **${Number(perfil?.chutes || 0)}** | MVPs: **${Number(perfil?.mvps || 0)}** | Pontuação: **${Number(perfil?.pontuacao || 0)}** | Edições: **${Number(perfil?.edicoes || 0)}**`,
        inline: false
      },
      {
        name: '🏆 Títulos',
        value: titulosLista.length > 0 ? titulosTexto : 'Ainda não há títulos cadastrados.',
        inline: false
      }
    )
    .setFooter({ text: 'Baseado em 75 indicadores avaliados' })
    .setColor('#00C2FF');

  const nomeHeader = `${nomeExibicao} • ${idade} anos • ${estado} - ${pais}`;
  if (member) {
    embed.setAuthor({ name: nomeHeader, iconURL: member.user.displayAvatarURL({ dynamic: true }) });
  } else {
    embed.setAuthor({ name: nomeHeader });
  }

  return embed;
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
  const valorAntigo = prev[campoId];
  const novoValor = interaction.fields.getTextInputValue(campoId).trim();
  const novo = { ...prev, [campoId]: novoValor };
  fichaEmAndamento.set(userId, novo);

  console.log('[ficha-correcao]', { campo: campoId, valorAntigo, novoValor });

  const etapaAtual = Number(novo.etapa) || 0;
  const validacaoEtapa = await validarCamposEtapa(etapaAtual, novo, userId);
  console.log('[ficha-modal-validacao]', {
    etapaAtual,
    customId: interaction.customId,
    validacaoEtapa,
    dadosAtual: { ...novo }
  });

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
    const validacaoProximaEtapa = await validarCamposEtapa(proximaEtapa, novo, userId);
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

async function onCorrigirFichaCampo(interaction) {
  const nomeExibicao = obterNomeExibicao(perfil, member);
  const idade = Number(perfil?.idade) || calcularIdade(perfil?.dataNascimento);
  const estado = perfil?.estado || 'Não informado';
  const pais = perfil?.pais || 'Não informado';
  const bio = perfil?.bio || 'Sem bio por enquanto.';

  const categorias = calcularCategorias(perfil?.indicadoresDetalhados || {});
  const categoriasAtuais = Object.entries(CATEGORIAS_META).reduce((acc, [key]) => {
    acc[key] = Number(perfil?.[key]) || categorias[key] || 0;
    return acc;
  }, {});

  const rankX1 = normalizarValor(perfil?.rankX1, 'Não informado');
  const rankX2 = normalizarValor(perfil?.rankX2, 'Não informado');
  const picoRank = normalizarValor(perfil?.picoRank, 'Não informado');
  const modoFavorito = normalizarValor(perfil?.modoFavorito, 'Não informado');
  const input = normalizarValor(perfil?.input, 'Não informado');
  const controleTipo = normalizarValor(perfil?.controleTipo, 'Não informado');
  const plataforma = normalizarValor(perfil?.plataforma, 'Não informado');

  const titulosLista = Array.isArray(perfil?.titulosLista) ? perfil.titulosLista : [];
  const titulosFisicos = getTitulosDoJogador(titulosLista);
  const titulosTexto = titulosFisicos.length > 10 ? `${titulosFisicos.slice(0, 10).map((titulo) => `${titulo.icone} ${titulo.nome}`).join(' | ')} ...` : titulosFisicos.map((titulo) => `${titulo.icone} ${titulo.nome}`).join(' | ');

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${nomeExibicao}`)
    .setDescription(`Bio: ${bio}`)
    .addFields(
      {
        name: '🏆 Competitivo',
        value: `Rank X1: **${rankX1}**\nRank X2: **${rankX2}**\nPico: **${picoRank}**\nModo Fav: **${modoFavorito}**`,
        inline: true
      },
      {
        name: '🎮 Setup',
        value: `Input: **${input}**\nControle: **${controleTipo}**\nPlataforma: **${plataforma}**`,
        inline: true
      },
      {
        name: '📊 8 categorias oficiais',
        value: Object.entries(CATEGORIAS_META)
          .map(([key, meta]) => `${meta.emoji} ${meta.label}: ${formatarBarra(categoriasAtuais[key] || 0)} ${categoriasAtuais[key] || 0}%`)
          .join('\n'),
        inline: false
      },
      {
        name: '📈 Stats ÔMEGA',
        value: `Gols: **${Number(perfil?.gols || 0)}** | Assist: **${Number(perfil?.assist || 0)}** | Saves: **${Number(perfil?.saves || 0)}** | Chutes: **${Number(perfil?.chutes || 0)}** | MVPs: **${Number(perfil?.mvps || 0)}** | Pontuação: **${Number(perfil?.pontuacao || 0)}**`,
        inline: false
      },
      {
        name: '🏆 Títulos',
        value: titulosLista.length > 0 ? titulosTexto : 'Ainda não há títulos cadastrados.',
        inline: false
      }
    )
    .setFooter({ text: 'Baseado em 75 indicadores avaliados' })
    .setColor('#00C2FF');

  const nomeHeader = `${nomeExibicao} • ${idade} anos • ${estado} - ${pais}`;
  if (member) {
    embed.setAuthor({ name: nomeHeader, iconURL: member.user.displayAvatarURL({ dynamic: true }) });
  } else {
    embed.setAuthor({ name: nomeHeader });
  }

  return embed;
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

  const membros = await interaction.guild.members.fetch({ limit: 50 })
    .then((colecao) => [...colecao.values()].filter((m) => !m.user.bot).slice(0, 25))
    .catch(() => [...interaction.guild.members.cache.values()].filter((m) => !m.user.bot).slice(0, 25));

  const membrosRows = [];
  const membrosRow = new ActionRowBuilder();
  membros.forEach((membro) => {
    membrosRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_ver_perfil_${membro.user.id}`)
        .setLabel(membro.displayName || membro.user.username)
        .setStyle(ButtonStyle.Secondary)
    );
  });
  membrosRows.push(membrosRow);

  const editarFicha = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_iniciar_ficha').setLabel('Editar minha ficha').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary)
  );

  const payload = {
    content: `🔎 Clique em um membro abaixo para consultar o perfil ou edite sua própria ficha:`,
    embeds: [],
    components: compactarLinhasComponentes([...membrosRows, editarFicha])
  };

  if (mensagemFuncionalidade) {
    salvarMsgFuncionalidadeGenerica(interaction, mensagemFuncionalidade);
    await mensagemFuncionalidade.edit(payload).catch(() => null);
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    return;
  }

  return responderFichaNoPainel(interaction, payload);
}

function salvarMsgFuncionalidadeGenerica(interaction, mensagem) {
  if (!mensagem) return;
  painelFichaPorUsuario.set(chavePainelFicha(interaction), {
    channelId: mensagem.channelId || mensagem.channel?.id,
    messageId: mensagem.id
  });
}

async function onVerPerfilDeOutro(interaction) {
  const targetId = interaction.customId.replace(/^btn_ver_perfil_/, '');
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

  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferUpdate(); } catch (_) {}
  }
  return responderFichaNoPainel(interaction, {
    content: '',
    embeds: [embedPerfil],
    components: compactarLinhasComponentes([
      ...adminButtons,
      ...componentsExtras,
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary))
    ])
  });
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

async function validarCamposEtapa(stepIndex, dadosEtapa, userId = null) {
  const campos = FICHA_MODAL_STEPS[stepIndex] || [];

  for (const campo of campos) {
    if (campo.id === 'nick_principal_input') {
      const nick = String(dadosEtapa[campo.id] || '').trim().toLowerCase();
      if (!nick || nick.length < 3 || nick.length > 20 || !NICK_PATTERN.test(nick)) {
        return { ok: false, campo: campo.id, mensagem: 'Nick inválido. Use 3-20 caracteres sem quebras de linha ou caracteres de controle.' };
      }
      if (userId) {
        const existente = await PerfilMembro.findOne({ nick_principal: nick, userId: { $ne: userId } }).select('_id').lean();
        if (existente) {
          return { ok: false, campo: campo.id, mensagem: 'Esse nick principal já está em uso.' };
        }
      }
      continue;
    }

    if (campo.id !== 'data_nascimento_input') continue;

    const resultado = validarDataNascimento(dadosEtapa[campo.id]);
    if (!resultado.ok) {
      return { ok: false, campo: campo.id, mensagem: resultado.error };
    }
  }

  return { ok: true };
}

function obterCampoFicha(campoId) {
  return FICHA_MODAL_STEPS.flat().find((campo) => campo.id === campoId) || null;
}

function criarBotaoCorrecao(campoId, labelPrefixo = 'Corrigir') {
  const campo = obterCampoFicha(campoId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_corrigir_${campoId}`)
      .setLabel(`${labelPrefixo} ${campo?.label || campoId}`.slice(0, 80))
      .setStyle(ButtonStyle.Primary)
  );
}

function obterCampoComErro(validacao) {
  return validacao.campo || validacao.campoId;
}

function criarModalCorrecao(campoId, dados) {
  const campo = obterCampoFicha(campoId);
  if (!campo) return null;

  const input = new TextInputBuilder()
    .setCustomId(campo.id)
    .setLabel(campo.label)
    .setStyle(campo.style)
    .setRequired(Boolean(campo.required));

  if (campo.placeholder) input.setPlaceholder(campo.placeholder);
  const valorAtual = dados?.[campo.id];
  if (valorAtual !== undefined && valorAtual !== null && valorAtual !== '') {
    input.setValue(String(valorAtual));
  }

  return new ModalBuilder()
    .setCustomId(`modal_ficha_correcao_${campo.id}`)
    .setTitle(`Corrigir ${campo.label}`.slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function criarBotaoContinuarFicha(etapa) {
  const proximaEtapa = etapa + 1;
  const numeroProximaEtapa = proximaEtapa + 1;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_continuar_ficha_${numeroProximaEtapa}`)
      .setLabel(`Abrir ficha ${numeroProximaEtapa}/4`)
      .setStyle(ButtonStyle.Primary)
  );
}

async function onModalFichaPerfil(interaction) {
  console.log('[ficha-modal-submit]', {
    customId: interaction?.customId,
    interactionType: interaction?.type,
    timestamp: Date.now()
  });

  if (!interaction || !interaction.isModalSubmit) {
    console.log('[ficha-modal-submit-ignored]', {
      hasInteraction: !!interaction,
      isModalSubmit: interaction?.isModalSubmit,
      customId: interaction?.customId,
      type: interaction?.type
    });
    return;
  }

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

  const validacaoEtapa = await validarCamposEtapa(etapaAtual, dadosExistentes, interaction.user.id);
  console.log('[ficha-modal-validacao]', {
    etapaAtual,
    customId: interaction.customId,
    validacaoEtapa,
    dadosAtual: { ...dadosExistentes }
  });

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
    if (etapaAtual === 1) {
      return responderFichaNoPainel(interaction, buildNicksSecundariosView(fichaEmAndamento.get(userId)));
    }
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
  const nickPrincipal = String(dados.nick_principal_input || dados.nick_principal || '').trim().toLowerCase();
  const nicksSecundarios = [...new Set((Array.isArray(dados.nicks_secundarios) ? dados.nicks_secundarios : [])
    .map((nick) => String(nick).trim().toLowerCase())
    .filter((nick) => nick && nick !== nickPrincipal))];

  const rankX1 = normalizarOpcaoPermitida(dados.rank_x1 || dados['select_ficha_rank_x1'], VALORES_RANK_PERMITIDOS) || null;
  const rankX2 = normalizarOpcaoPermitida(dados.rank_x2 || dados['select_ficha_rank_x2'], VALORES_RANK_PERMITIDOS) || null;
  const picoRank = normalizarOpcaoPermitida(dados.pico_rank || dados['select_ficha_pico_rank'], VALORES_RANK_PERMITIDOS) || null;
  const input = normalizarOpcaoPermitida(dados.input || dados.select_ficha_input, VALORES_INPUT_PERMITIDOS) || null;
  const plataforma = normalizarOpcaoPermitida(dados.plataforma || dados.select_ficha_plataforma, VALORES_PLATAFORMA_PERMITIDAS) || 'Mobile';

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
    plataforma,
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

  interaction.user.send({
    content: `✅ Sua ficha foi finalizada com sucesso! Seu perfil já está salvo no sistema da Ômega. ${interaction.member ? `Olá, ${interaction.member.displayName}!` : ''}`
  }).catch(() => null);

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
  registry.button(/^btn_ver_perfil_\d+$/, onVerPerfilDeOutro);
  registry.button(/^ficha_input_.+$/, onSelecionarOpcaoFicha);
  registry.button(/^ficha_rank_x1_.+$/, onSelecionarOpcaoFicha);
  registry.button(/^ficha_rank_x2_.+$/, onSelecionarOpcaoFicha);
  registry.button(/^ficha_pico_rank_.+$/, onSelecionarOpcaoFicha);
  registry.modal(/^modal_admin_stat_(gol|assist|save|chutes|mvp|pontuacao)_[0-9]+$/, onAdminIncrement);
  registry.modal(/^modal_ficha_correcao_/, onModalCorrecaoFicha);
  registry.modal('modal_add_nick_sec', onModalAdicionarNickSec);
  registry.modal(/^modal_ficha_perfil_\d+$/, onModalFichaPerfil);
  registry.select('select_cargos_jogos', onSelectCargos);
  registry.select('select_remove_nick_sec', onSelecionarNickParaRemover);
}

module.exports = { register, buildPerfilEmbed, calcularIdade, calcularCategorias, MAPA_INDICADORES, onVerPerfil, onAbrirSelecionarPerfil, onVerPerfilDeOutro, onSelecionarOpcaoFicha, onVoltarNicks, onIniciarFicha };
