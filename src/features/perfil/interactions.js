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
const { getGames } = require('../games/catalog');
const { MAPA_INDICADORES, calcularCategorias } = require('../../data/mapa_indicadores');
const { getTitulosDoJogador, getPaginaTitulos, formatarTitulosParaTexto } = require('../../data/titulos');

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

function normalizarDadosFicha(dados = {}) {
  const objetoNormalizado = {};

  for (const [chave, valor] of Object.entries(dados || {})) {
    if (valor === undefined || valor === null) continue;
    if (typeof valor === 'function') continue;
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

const VALORES_INPUT_PERMITIDOS = ['Touch', 'Controle', 'Híbrido'];
const VALORES_PLATAFORMA_PERMITIDAS = ['Android', 'iOS'];
const VALORES_RANK_PERMITIDOS = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Champion', 'Grand Champion'];
const OBRIGATORIOS = ['input', 'rank_x1', 'rank_x2', 'pico_rank'];

const FICHA_MODAL_STEPS = [
  [
    { id: 'nome_comum_input', label: 'Nome da comunidade / como quer ser conhecido', style: TextInputStyle.Short, required: true },
    { id: 'data_nascimento_input', label: 'Data de nascimento', style: TextInputStyle.Short, required: false, placeholder: 'DD/MM/AAAA' },
    { id: 'estado_input', label: 'Estado', style: TextInputStyle.Short, required: false }
  ],
  [
    { id: 'pais_input', label: 'País', style: TextInputStyle.Short, required: false },
    { id: 'bio_input', label: 'Bio (máx. 150)', style: TextInputStyle.Paragraph, required: false },
    { id: 'cla_atual_input', label: 'CLA atual', style: TextInputStyle.Short, required: false }
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
    return interaction.reply({ content: '❌ Esse jogador ainda não possui perfil completo.', flags: 64 });
  }

  const titulosLista = Array.isArray(perfil.titulosLista) ? perfil.titulosLista : [];
  const pagina = getPaginaTitulos(titulosLista, 1, 15);
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Títulos de ${obterNomeExibicao(perfil, member)}`)
    .setDescription(formatarTitulosParaTexto(titulosLista, pagina.paginaAtual, 15))
    .setColor('#FFD700');

  return interaction.reply({ embeds: [embed], components: [buildTitulosButtons(targetId, 1, pagina.totalPaginas)], ephemeral: true });
}

async function onPaginarTitulos(interaction) {
  const match = interaction.customId.match(/^btn_titulos_(prev|next)_(\d+)_(\d+)$/);
  if (!match) return;

  const [, tipo, targetId, paginaAtualStr] = match;
  const paginaAtual = Number(paginaAtualStr) || 1;
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });

  if (!perfil) {
    return interaction.reply({ content: '❌ Perfil não encontrado.', flags: 64 });
  }

  const titulosLista = Array.isArray(perfil.titulosLista) ? perfil.titulosLista : [];
  const paginaIndex = tipo === 'prev' ? paginaAtual - 1 : paginaAtual + 1;
  const pagina = getPaginaTitulos(titulosLista, paginaIndex, 15);
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Títulos de ${obterNomeExibicao(perfil, member)}`)
    .setDescription(formatarTitulosParaTexto(titulosLista, pagina.paginaAtual, 15))
    .setColor('#FFD700');

  await interaction.update({ embeds: [embed], components: [buildTitulosButtons(targetId, pagina.paginaAtual, pagina.totalPaginas)] });
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

function buildFichaSelects(dados = {}) {
  const rows = [];
  const selectInput = new StringSelectMenuBuilder()
    .setCustomId('select_ficha_input')
    .setPlaceholder(dados.input || 'Selecione o Input')
    .addOptions(VALORES_INPUT_PERMITIDOS.map((valor) => ({ label: valor, value: valor })));
  rows.push(new ActionRowBuilder().addComponents(selectInput));

  const selectRanks = new StringSelectMenuBuilder()
    .setCustomId('select_ficha_rank_x1')
    .setPlaceholder(dados.rank_x1 || 'Selecione o Rank X1')
    .addOptions(VALORES_RANK_PERMITIDOS.map((valor) => ({ label: valor, value: valor })));
  rows.push(new ActionRowBuilder().addComponents(selectRanks));

  const selectRanksX2 = new StringSelectMenuBuilder()
    .setCustomId('select_ficha_rank_x2')
    .setPlaceholder(dados.rank_x2 || 'Selecione o Rank X2')
    .addOptions(VALORES_RANK_PERMITIDOS.map((valor) => ({ label: valor, value: valor })));
  rows.push(new ActionRowBuilder().addComponents(selectRanksX2));

  const selectPico = new StringSelectMenuBuilder()
    .setCustomId('select_ficha_pico_rank')
    .setPlaceholder(dados.pico_rank || 'Selecione o Pico Rank')
    .addOptions(VALORES_RANK_PERMITIDOS.map((valor) => ({ label: valor, value: valor })));
  rows.push(new ActionRowBuilder().addComponents(selectPico));

  return rows;
}

async function onIniciarFicha(interaction) {
  if (!interaction || typeof interaction.reply !== 'function') {
    return;
  }

  resetarFichaEmAndamento(interaction.user.id);
  return interaction.reply({
    content: 'Antes de abrir a ficha, escolha as opções fixas abaixo para ficar tudo consistente:',
    components: buildFichaSelects(),
    ephemeral: true
  });
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

  console.log('[ficha-select]', {
    userId,
    customId: interaction.customId,
    chave,
    valor,
    dadosAtual: { ...novo },
    faltando
  });

  const ehUltimaEscolha = interaction.customId === 'select_ficha_pico_rank';
  if (!ehUltimaEscolha) {
    return interaction.update({
      content: faltando.length > 0
        ? `✅ Opção salva: **${valor}**. Falta(m) ${faltando.length} campo(s) para continuar.`
        : `✅ Opção salva: **${valor}**. Pronto para continuar.`,
      components: buildFichaSelects(novo),
      ephemeral: true
    });
  }

  if (!interaction || typeof interaction.showModal !== 'function') {
    return;
  }

  return interaction.showModal(buildFichaModalEtapa(0, novo));
}

async function onContinuarFicha(interaction) {
  const dados = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
  const faltando = OBRIGATORIOS.filter((campo) => !dados[campo]);
  const nomesCampos = { input: 'Input', rank_x1: 'Rank X1', rank_x2: 'Rank X2', pico_rank: 'Pico Rank' };

  if (faltando.length) {
    return interaction.reply({ content: `❌ Faltam opções obrigatórias: ${faltando.map((campo) => nomesCampos[campo]).join(', ')}.`, ephemeral: true });
  }

  return interaction.showModal(buildFichaModalEtapa(0));
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
        value: `Gols: **${Number(perfil?.gols || 0)}** | Assist: **${Number(perfil?.assist || 0)}** | Saves: **${Number(perfil?.saves || 0)}** | MVPs: **${Number(perfil?.mvps || 0)}** | Títulos: **${Number(perfil?.titulos || 0)}** | Edições: **${Number(perfil?.edicoes || 0)}**`,
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

async function onVerPerfil(interaction) {
  await interaction.deferReply({ flags: 64 });
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });

  if (!perfil) {
    return interaction.editReply({ content: '❌ Vc ainda não preencheu sua ficha! Clica em **Editar Ficha** pra cadastrar.' });
  }

  const embedPerfil = buildPerfilEmbed(perfil, interaction.member, { isPublic: false });
  const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(interaction.user.id) : [];
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 10
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${interaction.user.id}`).setLabel(`Ver todos os títulos (${titulosFisicos.length}+)`).setStyle(ButtonStyle.Primary))]
    : [];

  return interaction.editReply({ embeds: [embedPerfil], components: compactarLinhasComponentes([...adminButtons, ...componentsExtras]) });
}

async function onAbrirSelecionarPerfil(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: '❌ Essa ação só funciona em servidor.', flags: 64 });
  }

  const membros = [...interaction.guild.members.cache.values()]
    .filter((membro) => !membro.user.bot)
    .slice(0, 25);

  const select = new StringSelectMenuBuilder()
    .setCustomId('select_ver_perfil')
    .setPlaceholder('Escolha um membro para ver o perfil público')
    .addOptions(
      membros.map((membro) => ({
        label: membro.displayName || membro.user.username,
        value: membro.user.id,
        description: `Ver perfil de ${membro.user.username}`
      }))
    );

  const row = new ActionRowBuilder().addComponents(select);
  return interaction.reply({ content: '🔎 Selecione o membro no menu abaixo:', components: compactarLinhasComponentes([row]), flags: 64 });
}

async function onSelectVerPerfil(interaction) {
  const targetId = interaction.values[0];
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);

  if (!member) {
    return interaction.reply({ content: '❌ Não foi possível localizar esse membro no servidor.', flags: 64 });
  }

  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  if (!perfil) {
    return interaction.reply({ content: `❌ ${member.displayName} ainda não completou o perfil.`, flags: 64 });
  }

  const embedPerfil = buildPerfilEmbed(perfil, member, { isPublic: true });
  const adminButtons = hasPermissaoAdmin(interaction.member) ? buildAdminButtons(targetId) : [];
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 10
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${targetId}`).setLabel(`Ver todos os títulos (${titulosFisicos.length}+)`).setStyle(ButtonStyle.Primary))]
    : [];

  return interaction.reply({ embeds: [embedPerfil], components: compactarLinhasComponentes([...adminButtons, ...componentsExtras]) });
}

function validarCamposEtapa(stepIndex, dadosEtapa) {
  const campos = FICHA_MODAL_STEPS[stepIndex] || [];

  for (const campo of campos) {
    if (campo.id !== 'data_nascimento_input') continue;

    const resultado = validarDataNascimento(dadosEtapa[campo.id]);
    if (!resultado.ok) {
      return { ok: false, campoId: campo.id, erro: resultado.error };
    }
  }

  return { ok: true };
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

  const validacaoEtapa = validarCamposEtapa(etapaAtual, dadosExistentes);
  console.log('[ficha-modal-validacao]', {
    etapaAtual,
    customId: interaction.customId,
    validacaoEtapa,
    dadosAtual: { ...dadosExistentes }
  });

  if (!validacaoEtapa.ok) {
    const dadosParaReabrir = { ...dadosExistentes };
    const modalReaberto = buildFichaModalEtapa(etapaAtual, dadosParaReabrir, {
      erro: validacaoEtapa.erro,
      campoErroId: validacaoEtapa.campoId
    });

    console.log('[ficha-modal-reopen-erro]', {
      customId: interaction.customId,
      etapaAtual,
      showModalType: typeof interaction.showModal,
      valoresPreenchidos: Object.keys(dadosParaReabrir).length
    });

    setImmediate(() => {
      const estadoAtual = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
      fichaEmAndamento.set(interaction.user.id, { ...estadoAtual, ...dadosParaReabrir, etapa: etapaAtual });
    });

    await interaction.showModal(modalReaberto);
    return;
  }

  if (etapaAtual < FICHA_MODAL_STEPS.length - 1) {
    const dadosAtual = { ...dadosExistentes };
    const modal = new ModalBuilder()
      .setCustomId(`modal_ficha_perfil_${etapaAtual + 2}`)
      .setTitle(`Ficha ${etapaAtual + 2}/4`);
    const camposEtapa2 = FICHA_MODAL_STEPS[1];
    const rowsEtapa2 = camposEtapa2.map((campo) => new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(campo.id)
          .setLabel(campo.label)
          .setStyle(campo.style)
          .setRequired(Boolean(campo.required))
          .setMaxLength(campo.id === 'bio_input' ? 150 : 4000)
      ));
    modal.addComponents(...rowsEtapa2);

    await interaction.showModal(modal);

    setImmediate(() => {
      const estadoAtual = normalizarDadosFicha(fichaEmAndamento.get(interaction.user.id));
      fichaEmAndamento.set(interaction.user.id, { ...estadoAtual, ...dadosAtual, etapa: etapaAtual + 1 });
    });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  const dados = fichaEmAndamento.get(interaction.user.id) || {};

  const nomeComum = sanitizeTextoLivre(dados.nome_comum_input || interaction.user.username, { maxLength: 60, allowEmpty: false }) || interaction.user.username;
  const nascimentoValido = validarDataNascimento(dados.data_nascimento_input);
  if (!nascimentoValido.ok) {
    return interaction.editReply({ content: nascimentoValido.error, flags: 64 });
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

  const rankX1 = normalizarOpcaoPermitida(dados.rank_x1 || dados['select_ficha_rank_x1'], VALORES_RANK_PERMITIDOS) || null;
  const rankX2 = normalizarOpcaoPermitida(dados.rank_x2 || dados['select_ficha_rank_x2'], VALORES_RANK_PERMITIDOS) || null;
  const picoRank = normalizarOpcaoPermitida(dados.pico_rank || dados['select_ficha_pico_rank'], VALORES_RANK_PERMITIDOS) || null;
  const input = normalizarOpcaoPermitida(dados.input || dados.select_ficha_input, VALORES_INPUT_PERMITIDOS) || null;
  const plataforma = normalizarOpcaoPermitida(dados.plataforma || dados.select_ficha_plataforma, VALORES_PLATAFORMA_PERMITIDAS) || 'Mobile';

  if (!input || !rankX1 || !rankX2 || !picoRank) {
    return interaction.editReply({ content: '❌ Faltou alguma opção fixa da ficha. Refaça a configuração inicial e tente novamente.', flags: 64 });
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

  try {
    await interaction.user.send({
      content: `✅ Sua ficha foi finalizada com sucesso! Seu perfil já está salvo no sistema da Ômega. ${interaction.member ? `Olá, ${interaction.member.displayName}!` : ''}`
    });
  } catch (error) {
    await interaction.followUp({
      content: '✅ Sua ficha foi finalizada com sucesso e salva no perfil. Se as DMs estiverem bloqueadas, você pode continuar normalmente pelo canal.',
      ephemeral: true
    }).catch(() => {});
  }

  return interaction.editReply({
    content: '✅ Perfil salvo! Agora escolha abaixo os avisos que vc quer receber quando chamarem pro time:',
    components: [selectCargos]
  });
}

async function onAbrirModalAdminEstatistica(interaction) {
  if (!hasPermissaoAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Apenas administradores ou membros de staff podem alterar essas estatísticas.', flags: 64 });
  }

  const [, campo, targetId] = interaction.customId.match(/^btn_admin_(gol|assist|save|chutes|mvp|pontuacao)_(.+)$/) || [];
  if (!campo || !targetId) {
    return interaction.reply({ content: '❌ Comando de administração inválido.', flags: 64 });
  }

  return interaction.showModal(buildAdminStatModal(campo, targetId));
}

async function onAdminIncrement(interaction) {
  if (!interaction || !interaction.isModalSubmit) return;

  if (!hasPermissaoAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Apenas administradores ou membros de staff podem alterar essas estatísticas.', flags: 64 });
  }

  const match = interaction.customId.match(/^modal_admin_stat_(gol|assist|save|chutes|mvp|pontuacao)_(.+)$/);
  if (!match) return;

  const [, campo, targetId] = match;
  const valorTexto = interaction.fields.getTextInputValue('admin_stat_valor').trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(valorTexto.replace(/\s/g, ''))) {
    return interaction.reply({ content: '❌ Digite apenas números no campo de valor, sem letras ou caracteres extras.', ephemeral: true });
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
  if (!fieldName) return interaction.reply({ content: '❌ Campo de stats inválido.', flags: 64 });

  const valor = Number(valorTexto.replace(',', '.'));
  if (!Number.isFinite(valor)) {
    return interaction.reply({ content: '❌ Valor numérico inválido.', ephemeral: true });
  }

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: targetId },
    { $inc: { [fieldName]: valor } },
    { upsert: true, new: true }
  );

  return interaction.reply({
    content: `✅ Estatística **${fieldName.toUpperCase()}** atualizada em **${valor}** para ${target ? target.displayName : 'o jogador'}!`,
    flags: 64
  });
}

async function onSelectCargos(interaction) {
  await interaction.deferReply({ flags: 64 });
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
    return interaction.editReply({ content: '⚠️ O perfil foi salvo, mas não consegui atualizar todos os cargos. Verifique as permissões do bot.' });
  }

  return interaction.editReply({ content: '🎉 Ficha concluída! Vc já tá pronto pra jogar com a gente.' });
}

function register(registry) {
  registry.button('btn_iniciar_ficha', onIniciarFicha);
  registry.button('btn_continuar_ficha', onContinuarFicha);
  registry.button('btn_ver_perfil', onVerPerfil);
  registry.button('btn_abrir_select_ver_perfil', onAbrirSelecionarPerfil);
  registry.button(/^btn_ver_titulos_\d+$/, onVerTodosTitulos);
  registry.button(/^btn_titulos_(prev|next)_\d+_\d+$/, onPaginarTitulos);
  registry.button(/^btn_admin_(gol|assist|save|chutes|mvp|pontuacao)_[0-9]+$/, onAbrirModalAdminEstatistica);
  registry.modal(/^modal_admin_stat_(gol|assist|save|chutes|mvp|pontuacao)_[0-9]+$/, onAdminIncrement);
  registry.modal(/^modal_ficha_perfil_\d+$/, onModalFichaPerfil);
  registry.select('select_cargos_jogos', onSelectCargos);
  registry.select('select_ver_perfil', onSelectVerPerfil);
  registry.select('select_ficha_input', onSelectFichaOpcao);
  registry.select('select_ficha_rank_x1', onSelectFichaOpcao);
  registry.select('select_ficha_rank_x2', onSelectFichaOpcao);
  registry.select('select_ficha_pico_rank', onSelectFichaOpcao);
}

module.exports = { register, buildPerfilEmbed, calcularIdade, calcularCategorias, MAPA_INDICADORES };
