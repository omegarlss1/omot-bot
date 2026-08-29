const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { MAPA_INDICADORES, calcularCategorias } = require('../../data/mapa_indicadores');
const { CATEGORIAS_INDICADORES, INDICADORES_POR_CATEGORIA } = require('../../data/indicadores');
const AvaliacaoPerfil = require('../../db/models/avaliacaoPerfil');
const PerfilMembro = require('../../db/models/perfilMembro');

const avaliacoes = new Map();
const categoriaAtual = new Map();
const paginaAtual = new Map();
const progressoSalvo = new Map();
const INDICADORES_POR_PAGINA = 5;

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
  return Object.keys(respostas).length;
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
  return categoria.itens.every((item) => respostas[item.id] !== undefined);
}

function buildCategoriaComponents(categoriaIndex, respostas, pagina = 0) {
  const categoria = CATEGORIAS[categoriaIndex];
  const rows = [];
  const totalPaginas = Math.ceil(categoria.itens.length / INDICADORES_POR_PAGINA);
  const inicio = pagina * INDICADORES_POR_PAGINA;
  const itensPagina = categoria.itens.slice(inicio, inicio + INDICADORES_POR_PAGINA);

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

  // A página seguinte só é liberada após registrar (marcado ou não) os cinco
  // indicadores atuais. Isso preserva a resposta "não é minha característica".
  const paginaRespondida = itensPagina.every((item) => respostas[item.id] !== undefined);
  const avancarDisabled = !temTodosItensPreenchidos(categoria, respostas) || pagina < totalPaginas - 1;
  const rowAcao = new ActionRowBuilder().addComponents(
    ...(pagina > 0 ? [new ButtonBuilder().setCustomId('pagina_categoria_anterior').setLabel('← Página anterior').setStyle(ButtonStyle.Secondary)] : []),
    ...(pagina < totalPaginas - 1 ? [new ButtonBuilder()
      .setCustomId('pagina_categoria_proxima')
      .setLabel('Ver mais 5 →')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!paginaRespondida)] : []),
    new ButtonBuilder()
      .setCustomId('proxima_categoria')
      .setLabel(categoriaIndex === CATEGORIAS.length - 1 ? '✓ FINALIZAR AVALIAÇÃO' : 'PRÓXIMA CATEGORIA →')
      .setStyle(ButtonStyle.Success)
      .setDisabled(avancarDisabled),
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

async function responderMensagem(target, payload) {
  if (!target) return null;
  if (typeof target.update === 'function') return target.update(payload);
  if (typeof target.reply === 'function') return target.reply(payload);
  if (target.channel && typeof target.channel.send === 'function') return target.channel.send(payload);
  return null;
}

function buildCategoriaEmbedReal(categoriaIndex, userId, pagina = 0) {
  const categoria = CATEGORIAS[categoriaIndex];
  const respostas = getRespostas(userId);
  const totalAvaliados = totalItensAvaliados(userId);
  const totalPaginas = Math.ceil(categoria.itens.length / INDICADORES_POR_PAGINA);
  const inicio = pagina * INDICADORES_POR_PAGINA;

  const embed = new EmbedBuilder()
    .setTitle(`📊 Avaliação - ${categoria.icone} ${categoria.nome} (${categoriaIndex + 1}/${CATEGORIAS.length}) | Página ${pagina + 1}/${totalPaginas}`)
    .setDescription('Marque as características que fazem parte do perfil do jogador. A descrição explica cada indicador.')
    .setColor('#00C2FF');

  categoria.itens.slice(inicio, inicio + INDICADORES_POR_PAGINA).forEach((item) => {
    const valor = respostas[item.id];
    embed.addFields({
      name: `**${item.label}**`,
      value: `${item.descricao || 'Sem descrição.'}\nStatus: **${valor ? 'Marcado' : 'Não marcado'}**`,
      inline: false
    });
  });

  embed.setFooter({
    text: `Progresso: ${totalAvaliados} / 74 itens avaliados | Categoria ${categoriaIndex + 1} de ${CATEGORIAS.length}`
  });

  return embed;
}

async function renderizarCategoria(interaction, categoriaIndex) {
  const userId = interaction.user?.id || interaction.author?.id;
  const respostas = getRespostas(userId);
  const categoria = CATEGORIAS[categoriaIndex];
  const pagina = paginaAtual.get(userId) || 0;

  if (!categoria) {
    return responderMensagem(interaction, { content: '✅ Avaliação concluída!', ephemeral: true });
  }

  const components = buildCategoriaComponents(categoriaIndex, respostas, pagina);
  const embed = buildCategoriaEmbedReal(categoriaIndex, userId, pagina);

  return responderMensagem(interaction, { embeds: [embed], components, ephemeral: true });
}

async function salvarProgresso(userId, guildId) {
  const respostas = getRespostas(userId);
  const atual = getCategoriaAtual(userId);

  progressoSalvo.set(userId, {
    respostas: { ...respostas },
    categoriaAtual: atual,
    atualizadoEm: Date.now()
  });

  if (!guildId) return;

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

async function iniciarAvaliacao(interaction) {
  const userId = interaction.user?.id || interaction.author?.id;
  const guildId = interaction.guildId || interaction.guild?.id;

  if (!userId) return;

  if (!avaliacoes.has(userId)) {
    avaliacoes.set(userId, {});
  }

  if (!categoriaAtual.has(userId)) {
    categoriaAtual.set(userId, 0);
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
    return responderMensagem(interaction, {
      content: '🔄 Você já tem uma avaliação salva. Deseja continuar de onde parou?',
      components: [buildContinuarButton()],
      ephemeral: true
    });
  }

  const categoriaIndex = getCategoriaAtual(userId);
  await renderizarCategoria(interaction, categoriaIndex);
}

async function onIndicadoresBinariosSelecionados(interaction) {
  const match = interaction.customId.match(/^avaliar_binario_(\d+)_(\d+)$/);
  if (!match) return;

  const categoriaIndex = Number(match[1]);
  const pagina = Number(match[2]);
  const categoria = CATEGORIAS[categoriaIndex];
  const inicio = pagina * INDICADORES_POR_PAGINA;
  const itensPagina = categoria.itens.slice(inicio, inicio + INDICADORES_POR_PAGINA);
  const selecionados = new Set(interaction.values);
  const respostas = getRespostas(interaction.user.id);

  itensPagina.forEach((item) => {
    respostas[item.id] = selecionados.has(item.id);
  });

  categoriaAtual.set(interaction.user.id, categoriaIndex);
  await salvarProgresso(interaction.user.id, interaction.guildId || interaction.guild?.id);
  return renderizarCategoria(interaction, categoriaIndex);
}

async function onPaginaCategoria(interaction) {
  const userId = interaction.user.id;
  const categoria = CATEGORIAS[getCategoriaAtual(userId)];
  const pagina = paginaAtual.get(userId) || 0;
  const totalPaginas = Math.ceil(categoria.itens.length / INDICADORES_POR_PAGINA);
  const delta = interaction.customId === 'pagina_categoria_proxima' ? 1 : -1;
  paginaAtual.set(userId, Math.max(0, Math.min(totalPaginas - 1, pagina + delta)));
  return renderizarCategoria(interaction, getCategoriaAtual(userId));
}

async function onProximaCategoria(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId || interaction.guild?.id;
  const atual = getCategoriaAtual(userId);
  const categoria = CATEGORIAS[atual];
  const respostas = getRespostas(userId);

  if (!categoria || !temTodosItensPreenchidos(categoria, respostas)) {
    return interaction.reply({ content: '⚠️ Avalie todos os itens antes de avançar', ephemeral: true });
  }

  if (atual < CATEGORIAS.length - 1) {
    const proximo = atual + 1;
    categoriaAtual.set(userId, proximo);
    paginaAtual.set(userId, 0);
    await salvarProgresso(userId, guildId);
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

  const embed = new EmbedBuilder()
    .setTitle('🎮 Perfil do Jogador - Rocket League')
    .setDescription('Seu perfil foi gerado com sucesso!')
    .setColor('#FFD700');

  Object.entries(perfil).forEach(([categoriaKey, valor]) => {
    const nomeCategoria = NOME_CATEGORIAS[categoriaKey] || categoriaKey;
    embed.addFields({ name: `${ICONE_CATEGORIAS[categoriaKey] || '📊'} ${nomeCategoria}`, value: `${valor}%`, inline: true });
  });

  const top = Object.entries(respostas)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 5)
    .filter(([, marcado]) => marcado)
    .map(([itemId]) => `• ${formatarIndicador(itemId)}: Marcado`)
    .join('\n');

  embed.addFields({
    name: '🌟 Top 5 características',
    value: top || 'Sem respostas registradas.',
    inline: false
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

  return responderMensagem(interaction, { embeds: [embed], components: [], ephemeral: true });
}

async function onSalvarProgresso(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId || interaction.guild?.id;
  await salvarProgresso(userId, guildId);

  return responderMensagem(interaction, {
    content: '💾 Progresso salvo no Mongo. Pode continuar depois pelo botão abaixo.',
    components: [buildContinuarButton()],
    ephemeral: true
  });
}

async function onContinuarAvaliacao(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId || interaction.guild?.id;

  const registro = guildId ? await AvaliacaoPerfil.findOne({ guildId, userId }).lean().catch(() => null) : null;
  if (!registro || !registro.respostas || Object.keys(registro.respostas).length === 0) {
    return responderMensagem(interaction, {
      content: '❌ Não existe avaliação salva para continuar.',
      ephemeral: true
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
  onProximaCategoria,
  onSalvarProgresso
};
