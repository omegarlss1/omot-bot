const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { MAPA_INDICADORES, calcularCategorias, calcularNotaCategoria } = require('../../data/mapa_indicadores');
const { CATEGORIAS_INDICADORES, INDICADORES_POR_CATEGORIA } = require('../../data/indicadores');
const AvaliacaoPerfil = require('../../db/models/avaliacaoPerfil');
const PerfilMembro = require('../../db/models/perfilMembro');
const { obterMensagemFuncionalidade } = require('../hub/mensagem');

const avaliacoes = new Map();
const categoriaAtual = new Map();
const paginaAtual = new Map();
const progressoSalvo = new Map();
const msgFuncionalidadePorUsuario = new Map();

function chaveUsuario(interaction) {
  return `${interaction.guildId || interaction.guild?.id || 'dm'}:${interaction.user.id}`;
}

function salvarMsgFuncionalidade(interaction, mensagem) {
  if (!mensagem) return;
  msgFuncionalidadePorUsuario.set(chaveUsuario(interaction), {
    channelId: mensagem.channelId || mensagem.channel?.id,
    messageId: mensagem.id
  });
}

async function obterMsgFuncionalidadeSalva(interaction) {
  const ref = msgFuncionalidadePorUsuario.get(chaveUsuario(interaction));
  if (ref?.channelId && ref?.messageId) {
    const canal = interaction.client.channels.cache.get(ref.channelId)
      || await interaction.client.channels.fetch(ref.channelId).catch(() => null);
    if (canal) {
      const msg = await canal.messages.fetch(ref.messageId).catch(() => null);
      if (msg) return msg;
    }
  }
  return obterMensagemFuncionalidade(interaction).catch(() => null);
}

const ICONE_CATEGORIAS = {
  inteligencia_leitura: '🧠',
  conhecimento_evolucao: '📚',
  controle_mecanica: '⚙️',
  ataque: '⚔️',
  defesa: '🛡️',
  equipe: '🤝',
  criatividade: '🎨',
  regularidade: '📈'
};

const NOME_CATEGORIAS = {
  inteligencia_leitura: 'Inteligência e leitura de jogo',
  conhecimento_evolucao: 'Conhecimento e evolução',
  controle_mecanica: 'Controle e mecânica',
  ataque: 'Ataque',
  defesa: 'Defesa',
  equipe: 'Jogo em equipe',
  criatividade: 'Criatividade e personalidade',
  regularidade: 'Regularidade e desempenho'
};

const CATEGORIAS = Object.entries(MAPA_INDICADORES).map(([key, itens]) => ({
  key,
  nome: NOME_CATEGORIAS[key],
  icone: ICONE_CATEGORIAS[key],
  itens: itens.map((itemId) => {
    const indicador = (INDICADORES_POR_CATEGORIA[key] || []).find((item) => item.key === itemId);
    return {
    id: itemId,
    label: indicador?.nome || formatarIndicador(itemId),
    descricao: indicador?.descricao || '',
    peso: indicador?.peso || 1
    };
  })
}));

function formatarIndicador(itemId) {
  return itemId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letra) => letra.toUpperCase())
    .replace(/(Kickoff|Mvp|X1|X2)/gi, (valor) => valor.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function getRespostas(userId) {
  if (!avaliacoes.has(userId)) {
    avaliacoes.set(userId, {});
  }
  return avaliacoes.get(userId);
}

function getCategoriaAtual(userId) {
  if (!categoriaAtual.has(userId)) {
    categoriaAtual.set(userId, 0);
  }
  return categoriaAtual.get(userId);
}

function totalItensAvaliados(userId) {
  const respostas = getRespostas(userId);
  return Object.keys(respostas).filter((chave) => typeof respostas[chave] === 'boolean').length;
}

function separarIndicadoresPorCategoria(respostas) {
  return Object.fromEntries(Object.entries(CATEGORIAS_INDICADORES).map(([categoria, grupo]) => [
    grupo,
    Object.fromEntries((MAPA_INDICADORES[categoria] || [])
      .filter((indicador) => respostas[indicador] !== undefined)
      .map((indicador) => [indicador, Number(respostas[indicador])]))
  ]));
}

function temTodosItensPreenchidos(categoria, respostas) {
  return categoria.itens.every((item) => typeof respostas[item.id] === 'boolean');
}

function getItensPorPagina(categoria) {
  return categoria.itens.length;
}

function registrarItensNaoAvaliados(itens, respostas) {
  itens.forEach((item) => {
    if (typeof respostas[item.id] !== 'boolean') respostas[item.id] = false;
  });
}

function buildCategoriaComponents(categoriaIndex, respostas, pagina = 0) {
  const categoria = CATEGORIAS[categoriaIndex];
  const rows = [];
  const itensPorPagina = getItensPorPagina(categoria);
  const totalPaginas = Math.ceil(categoria.itens.length / itensPorPagina);
  const inicio = pagina * itensPorPagina;
  const itensPagina = categoria.itens.slice(inicio, inicio + itensPorPagina);

  const menuIndicadores = new StringSelectMenuBuilder()
    .setCustomId(`avaliar_binario_${categoriaIndex}_${pagina}`)
    .setPlaceholder('Marque os indicadores aplicáveis')
    .setMinValues(0)
    .setMaxValues(itensPagina.length)
    .addOptions(itensPagina.map((item) => ({
      label: item.label.slice(0, 100),
      value: item.id,
      description: item.descricao.slice(0, 100),
      default: Boolean(respostas[item.id])
    })));
  rows.push(new ActionRowBuilder().addComponents(menuIndicadores));

  const estaNaUltimaPagina = pagina === totalPaginas - 1;
  const rowAcao = new ActionRowBuilder().addComponents(
    ...(categoriaIndex > 0 ? [new ButtonBuilder().setCustomId('voltar_categoria').setLabel('← Voltar').setStyle(ButtonStyle.Secondary)] : []),
    ...(pagina > 0 ? [new ButtonBuilder().setCustomId('pagina_categoria_anterior').setLabel('← Página anterior').setStyle(ButtonStyle.Secondary)] : []),
    ...(pagina < totalPaginas - 1 ? [new ButtonBuilder()
      .setCustomId('pagina_categoria_proxima')
      .setLabel('Ver mais 5 →')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false)] : []),
    new ButtonBuilder()
      .setCustomId('proxima_categoria')
      .setLabel(categoriaIndex === CATEGORIAS.length - 1 ? '✓ FINALIZAR AVALIAÇÃO' : 'PRÓXIMA CATEGORIA →')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!estaNaUltimaPagina),
    new ButtonBuilder()
      .setCustomId('salvar_progresso')
      .setLabel('Salvar progresso')
      .setStyle(ButtonStyle.Secondary)
  );

  rows.push(rowAcao);
  return rows;
}

function buildContinuarButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_continuar_avaliacao')
      .setLabel('Continuar avaliação')
      .setStyle(ButtonStyle.Primary)
  );
}

async function responderAvaliacao(interaction, payload) {
  const { ephemeral, flags, content, ...editPayload } = payload;

  const payloadLimpo = { ...editPayload };
  if (content === undefined && !flags) {
    payloadLimpo.content = '';
  } else if (content !== undefined) {
    payloadLimpo.content = content;
  }

  const msgFunc = await obterMsgFuncionalidadeSalva(interaction).catch(() => null);

  if (msgFunc) {
    if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
      if (!interaction.deferred && !interaction.replied) {
        try {
          await interaction.deferUpdate();
        } catch (_) {}
      }
      await msgFunc.edit(payloadLimpo);
      return;
    }
    if (interaction.isModalSubmit?.()) {
      if (!interaction.deferred && !interaction.replied) {
        try {
          await interaction.deferReply({ flags: 64 });
        } catch (_) {}
      }
      await msgFunc.edit(payloadLimpo);
      try { await interaction.deleteReply(); } catch (_) {}
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

function buildCategoriaEmbedReal(categoriaIndex, userId, pagina = 0) {
  const categoria = CATEGORIAS[categoriaIndex];
  const totalAvaliados = totalItensAvaliados(userId);

  const embed = new EmbedBuilder()
    .setTitle(`${categoria.icone} ${categoria.nome}`)
    .setColor('#00C2FF');

  embed.setFooter({
    text: `Progresso: ${totalAvaliados} / 75 itens avaliados | Categoria ${categoriaIndex + 1} de ${CATEGORIAS.length}`
  });

  return embed;
}

async function renderizarCategoria(interaction, categoriaIndex, userIdInformado = null) {
  const userId = userIdInformado || interaction.user?.id || interaction.author?.id;
  const respostas = getRespostas(userId);
  const categoria = CATEGORIAS[categoriaIndex];
  const pagina = paginaAtual.get(userId) || 0;

  if (!categoria) {
    return responderAvaliacao(interaction, { content: '✅ Avaliação concluída!', embeds: [], components: [] });
  }

  const components = buildCategoriaComponents(categoriaIndex, respostas, pagina);
  const embed = buildCategoriaEmbedReal(categoriaIndex, userId, pagina);

  return responderAvaliacao(interaction, { content: '', embeds: [embed], components });
}

async function salvarProgresso(userId, guildId, salvarNoMongo = false) {
  const respostas = getRespostas(userId);
  const atual = getCategoriaAtual(userId);

  progressoSalvo.set(userId, {
    respostas: { ...respostas },
    categoriaAtual: atual,
    atualizadoEm: Date.now()
  });

  if (!salvarNoMongo || !guildId) return;

  await AvaliacaoPerfil.findOneAndUpdate(
    { guildId, userId },
    {
      guildId,
      userId,
      categoriaAtual: atual,
      respostas: { ...respostas },
      status: 'em_andamento',
      ultimaAtualizacao: new Date()
    },
    { upsert: true, new: true }
  );
}

async function iniciarAvaliacao(interaction, mensagemFuncionalidade = null) {
  const userId = interaction.user?.id || interaction.author?.id;
  const guildId = interaction.guildId || interaction.guild?.id;

  if (!userId) return;

  if (!avaliacoes.has(userId)) {
    avaliacoes.set(userId, {});
  }

  if (!categoriaAtual.has(userId)) {
    categoriaAtual.set(userId, 0);
  }

  if (mensagemFuncionalidade) {
    salvarMsgFuncionalidade(interaction, mensagemFuncionalidade);
  }

  const registro = guildId ? await AvaliacaoPerfil.findOne({ guildId, userId }).lean().catch(() => null) : null;
  const temProgressoSalvo = !!(registro && registro.status === 'em_andamento' && registro.respostas && Object.keys(registro.respostas).length > 0);

  if (registro && Object.keys(getRespostas(userId)).length === 0) {
    Object.assign(getRespostas(userId), registro.respostas || {});
    categoriaAtual.set(userId, Number(registro.categoriaAtual) || 0);
  }

  if (progressoSalvo.has(userId) && Object.keys(getRespostas(userId)).length === 0) {
    const salvo = progressoSalvo.get(userId);
    Object.assign(getRespostas(userId), salvo.respostas || {});
    categoriaAtual.set(userId, salvo.categoriaAtual ?? 0);
  }

  if (temProgressoSalvo && Object.keys(getRespostas(userId)).length > 0) {
    const payload = {
      content: '🔄 Você já tem uma avaliação salva. Deseja continuar de onde parou?',
      embeds: [],
      components: [buildContinuarButton()]
    };
    if (mensagemFuncionalidade) {
      await mensagemFuncionalidade.edit(payload);
      if (!interaction.deferred && !interaction.replied) {
        try { await interaction.deferUpdate(); } catch (_) {}
      }
      return;
    }
    return responderAvaliacao(interaction, payload);
  }

  const categoriaIndex = getCategoriaAtual(userId);
  if (mensagemFuncionalidade) {
    const respostas = getRespostas(userId);
    const pagina = paginaAtual.get(userId) || 0;
    const components = buildCategoriaComponents(categoriaIndex, respostas, pagina);
    await mensagemFuncionalidade.edit({ content: '', embeds: [], components });
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    return;
  }
  await renderizarCategoria(interaction, categoriaIndex, userId);
}

async function onIndicadoresBinariosSelecionados(interaction) {
  const match = interaction.customId.match(/^avaliar_binario_(\d+)_(\d+)$/);
  if (!match) return;

  const categoriaIndex = Number(match[1]);
  const pagina = Number(match[2]);
  const categoria = CATEGORIAS[categoriaIndex];
  const itensPorPagina = getItensPorPagina(categoria);
  const inicio = pagina * itensPorPagina;
  const itensPagina = categoria.itens.slice(inicio, inicio + itensPorPagina);
  const selecionados = new Set(interaction.values);
  const respostas = getRespostas(interaction.user.id);

  itensPagina.forEach((item) => {
    respostas[item.id] = selecionados.has(item.id);
  });

  categoriaAtual.set(interaction.user.id, categoriaIndex);
  await salvarProgresso(interaction.user.id, interaction.guildId || interaction.guild?.id);
  return renderizarCategoria(interaction, categoriaIndex);
}

async function onVoltarCategoria(interaction) {
  const userId = interaction.user.id;
  const atual = getCategoriaAtual(userId);
  if (atual <= 0) {
    return responderAvaliacao(interaction, { content: '⚠️ Já está na primeira categoria.', embeds: [], components: [] });
  }
  const anterior = atual - 1;
  categoriaAtual.set(userId, anterior);
  paginaAtual.set(userId, 0);
  await salvarProgresso(userId, interaction.guildId || interaction.guild?.id, true);
  return renderizarCategoria(interaction, anterior);
}

async function onPaginaCategoria(interaction) {
  const userId = interaction.user.id;
  const categoria = CATEGORIAS[getCategoriaAtual(userId)];
  const pagina = paginaAtual.get(userId) || 0;
  const itensPorPagina = getItensPorPagina(categoria);
  const totalPaginas = Math.ceil(categoria.itens.length / itensPorPagina);
  const delta = interaction.customId === 'pagina_categoria_proxima' ? 1 : -1;

  if (delta > 0) {
    const inicio = pagina * itensPorPagina;
    registrarItensNaoAvaliados(categoria.itens.slice(inicio, inicio + itensPorPagina), getRespostas(userId));
    await salvarProgresso(userId, interaction.guildId || interaction.guild?.id);
  }

  paginaAtual.set(userId, Math.max(0, Math.min(totalPaginas - 1, pagina + delta)));
  return renderizarCategoria(interaction, getCategoriaAtual(userId));
}

async function onProximaCategoria(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId || interaction.guild?.id;
  const atual = getCategoriaAtual(userId);
  const categoria = CATEGORIAS[atual];
  const respostas = getRespostas(userId);
  const pagina = paginaAtual.get(userId) || 0;
  const totalPaginas = categoria ? Math.ceil(categoria.itens.length / getItensPorPagina(categoria)) : 0;

  if (!categoria || pagina !== totalPaginas - 1) {
    return responderAvaliacao(interaction, { content: '⚠️ Use “Ver mais 5” para chegar à última página da categoria.', embeds: [], components: [] });
  }

  registrarItensNaoAvaliados(categoria.itens, respostas);
  if (atual < CATEGORIAS.length - 1) {
    const proximo = atual + 1;
    categoriaAtual.set(userId, proximo);
    paginaAtual.set(userId, 0);
    await salvarProgresso(userId, guildId, true);
    await renderizarCategoria(interaction, proximo);
    return;
  }

  await finalizarAvaliacao(interaction);
}

async function finalizarAvaliacao(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId || interaction.guild?.id;
  const respostas = getRespostas(userId);
  const perfil = calcularCategorias(respostas);
  const todosIndicadores = Object.values(INDICADORES_POR_CATEGORIA).flat();
  const totalPossivel = todosIndicadores.reduce((soma, indicador) => soma + indicador.peso, 0);
  const pesosMarcados = todosIndicadores
    .filter((indicador) => respostas[indicador.key] === true)
    .reduce((soma, indicador) => soma + indicador.peso, 0);
  const notaTotal = calcularNotaCategoria(pesosMarcados, totalPossivel);

  const embed = new EmbedBuilder()
    .setTitle('🎮 Perfil do Jogador - Rocket League')
    .setDescription(`Seu perfil foi gerado com sucesso!\n\n🏆 **Nota total: ${notaTotal}%**`)
    .setColor('#FFD700');

  Object.entries(perfil).forEach(([categoriaKey, valor]) => {
    const nomeCategoria = NOME_CATEGORIAS[categoriaKey] || categoriaKey;
    embed.addFields({ name: `${ICONE_CATEGORIAS[categoriaKey] || '📊'} ${nomeCategoria}`, value: `${valor}%`, inline: true });
  });

  const camposPerfil = {
    guildId,
    userId,
    discordId: userId,
    indicadoresDetalhados: { ...respostas },
    indicadores: separarIndicadoresPorCategoria(respostas),
    inteligenciaLeitura: perfil.inteligencia_leitura ?? 0,
    conhecimentoEvolucao: perfil.conhecimento_evolucao ?? 0,
    controleMecanica: perfil.controle_mecanica ?? 0,
    ataque: perfil.ataque ?? 0,
    defesa: perfil.defesa ?? 0,
    equipe: perfil.equipe ?? 0,
    criatividade: perfil.criatividade ?? 0,
    regularidade: perfil.regularidade ?? 0
  };

  await PerfilMembro.findOneAndUpdate(
    { guildId, userId },
    { $set: camposPerfil },
    { upsert: true, new: true }
  ).catch(() => {});

  await AvaliacaoPerfil.findOneAndUpdate(
    { guildId, userId },
    {
      guildId,
      userId,
      categoriaAtual: 0,
      respostas: { ...respostas },
      status: 'finalizado',
      ultimaAtualizacao: new Date()
    },
    { upsert: true, new: true }
  ).catch(() => {});

  avaliacoes.delete(userId);
  categoriaAtual.delete(userId);
  paginaAtual.delete(userId);

  return responderAvaliacao(interaction, { embeds: [embed], components: [] });
}

async function onSalvarProgresso(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId || interaction.guild?.id;
  await salvarProgresso(userId, guildId, true);

  return responderAvaliacao(interaction, {
    content: '💾 Progresso salvo no Mongo. Pode continuar depois pelo botão abaixo.',
    components: [buildContinuarButton()]
  });
}

async function onContinuarAvaliacao(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId || interaction.guild?.id;

  const registro = guildId ? await AvaliacaoPerfil.findOne({ guildId, userId }).lean().catch(() => null) : null;
  if (!registro || !registro.respostas || Object.keys(registro.respostas).length === 0) {
    return responderAvaliacao(interaction, {
      content: '❌ Não existe avaliação salva para continuar.',
      flags: 64
    });
  }

  Object.keys(getRespostas(userId)).forEach((chave) => delete getRespostas(userId)[chave]);
  Object.assign(getRespostas(userId), registro.respostas || {});
  categoriaAtual.set(userId, Number(registro.categoriaAtual) || 0);
  paginaAtual.set(userId, 0);

  return renderizarCategoria(interaction, getCategoriaAtual(userId));
}

async function onAbrirAvaliacao(interaction) {
  return iniciarAvaliacao(interaction);
}

function register(registry) {
  registry.select(/^avaliar_binario_\d+_\d+$/, onIndicadoresBinariosSelecionados);
  registry.button('voltar_categoria', onVoltarCategoria);
  registry.button('proxima_categoria', onProximaCategoria);
  registry.button('pagina_categoria_anterior', onPaginaCategoria);
  registry.button('pagina_categoria_proxima', onPaginaCategoria);
  registry.button('salvar_progresso', onSalvarProgresso);
  registry.button('btn_continuar_avaliacao', onContinuarAvaliacao);
  registry.button('btn_abrir_avaliacao', onAbrirAvaliacao);
  registry.button('finalizar_avaliacao', finalizarAvaliacao);
}

module.exports = {
  register,
  avaliacoes,
  categoriaAtual,
  progressoSalvo,
  CATEGORIAS,
  iniciarAvaliacao,
  renderizarCategoria,
  finalizarAvaliacao,
  onIndicadoresBinariosSelecionados,
  onPaginaCategoria,
  onProximaCategoria,
  onSalvarProgresso
};
