const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const {
  FICHA_MODAL_STEPS,
  OBRIGATORIOS,
  VALORES_INPUT_PERMITIDOS,
  VALORES_RANK_PERMITIDOS
} = require('./constants');
const { obterCampoFicha } = require('./validation');

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
    new ButtonBuilder().setCustomId(`btn_admin_pontuacao_${targetId}`).setLabel('+ Pontos').setStyle(ButtonStyle.Primary).setEmoji('🎯'),
    new ButtonBuilder().setCustomId(`btn_admin_add_titulo_${targetId}`).setLabel('+ Título').setStyle(ButtonStyle.Success).setEmoji('🏆')
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

function buildAddTituloModal(targetId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_admin_add_titulo_${targetId}`)
    .setTitle('Cadastrar Título em Campeonato');

  const inputColocacao = new TextInputBuilder()
    .setCustomId('titulo_colocacao_input')
    .setLabel('Colocação / Posição no Torneio:')
    .setPlaceholder('Ex: 1º Lugar, Campeão, Vice-campeão, MVP, Artilheiro')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const inputCampeonato = new TextInputBuilder()
    .setCustomId('titulo_campeonato_input')
    .setLabel('Nome do Campeonato / Torneio:')
    .setPlaceholder('Ex: Copa Ômega 2v2, Torneio de Verão, Private X1')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const inputEdicao = new TextInputBuilder()
    .setCustomId('titulo_edicao_input')
    .setLabel('Temporada / Edição / Ano (opcional):')
    .setPlaceholder('Ex: S4, Edição 2, 2024')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const inputDetalhe = new TextInputBuilder()
    .setCustomId('titulo_detalhe_input')
    .setLabel('Modo / Detalhe extra (opcional):')
    .setPlaceholder('Ex: 2v2, 3v3, X1, Série A')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputColocacao),
    new ActionRowBuilder().addComponents(inputCampeonato),
    new ActionRowBuilder().addComponents(inputEdicao),
    new ActionRowBuilder().addComponents(inputDetalhe)
  );

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

function buildFichaModalEtapa(stepIndex, valoresPreenchidos = {}, { erro = null, campoErroId = null } = {}) {
  const campos = FICHA_MODAL_STEPS[stepIndex] || [];
  const titulosEtapas = [
    '1. Nome / Nascimento / Estado',
    '2. País / Bio / CLA / Nick',
    '3. CLAs / Modo / Controle',
    '4. TikTok / Instagram'
  ];
  const tituloBase = titulosEtapas[stepIndex] || `Ficha ${stepIndex + 1}/${FICHA_MODAL_STEPS.length}`;

  const modal = new ModalBuilder()
    .setCustomId(`modal_ficha_perfil_${stepIndex + 1}`)
    .setTitle(tituloBase.slice(0, 45));

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
    .setPlaceholder(dados.input ? `Input: ${dados.input}` : '1. Selecione seu Input (Touch, Controle, Híbrido)')
    .addOptions(VALORES_INPUT_PERMITIDOS.map((valor) => ({ label: valor, value: valor })));
  rows.push(new ActionRowBuilder().addComponents(selectInput));

  const selectRanks = new StringSelectMenuBuilder()
    .setCustomId('select_ficha_rank_x1')
    .setPlaceholder(dados.rank_x1 ? `Rank X1: ${dados.rank_x1}` : '2. Selecione seu Rank Habitual de X1')
    .addOptions(VALORES_RANK_PERMITIDOS.map((valor) => ({ label: valor, value: valor })));
  rows.push(new ActionRowBuilder().addComponents(selectRanks));

  const selectRanksX2 = new StringSelectMenuBuilder()
    .setCustomId('select_ficha_rank_x2')
    .setPlaceholder(dados.rank_x2 ? `Rank X2: ${dados.rank_x2}` : '3. Selecione seu Rank Habitual de X2')
    .addOptions(VALORES_RANK_PERMITIDOS.map((valor) => ({ label: valor, value: valor })));
  rows.push(new ActionRowBuilder().addComponents(selectRanksX2));

  const selectPico = new StringSelectMenuBuilder()
    .setCustomId('select_ficha_pico_rank')
    .setPlaceholder(dados.pico_rank ? `Pico Histórico: ${dados.pico_rank}` : '4. Selecione seu Pico Máximo de Rank')
    .addOptions(VALORES_RANK_PERMITIDOS.map((valor) => ({ label: valor, value: valor })));
  rows.push(new ActionRowBuilder().addComponents(selectPico));

  return rows;
}

function buildFichaNavegacao(dados = {}) {
  const temEtapa1 = Boolean(dados.nome_comum_input);
  const temEtapa2 = Boolean(dados.nick_principal_input || dados.nick_principal);
  const temEtapa3 = Boolean(dados.modo_favorito_input || dados.controle_tipo_input);
  const temEtapa4 = Boolean(dados.tiktok_input || dados.instagram_input);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_etapa_1')
      .setLabel('1. Nome / Nasc / Estado')
      .setEmoji(temEtapa1 ? '✅' : '✏️')
      .setStyle(temEtapa1 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_etapa_2')
      .setLabel('2. País / Bio / CLA / Nick')
      .setEmoji(temEtapa2 ? '✅' : '✏️')
      .setStyle(temEtapa2 ? ButtonStyle.Success : ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_etapa_3')
      .setLabel('3. CLAs / Modo / Controle')
      .setEmoji(temEtapa3 ? '✅' : '✏️')
      .setStyle(temEtapa3 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_etapa_4')
      .setLabel('4. TikTok / Instagram')
      .setEmoji(temEtapa4 ? '✅' : '✏️')
      .setStyle(temEtapa4 ? ButtonStyle.Success : ButtonStyle.Primary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_nicks_sec_nav')
      .setLabel('Nicks Secundários')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_salvar_concluir_ficha')
      .setLabel('Finalizar e Salvar Perfil')
      .setEmoji('💾')
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2, row3];
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
  const titulosEtapas = [
    '1. Nome / Nasc / Estado',
    '2. País / Bio / CLA / Nick',
    '3. CLAs / Modo / Controle',
    '4. TikTok / Instagram'
  ];
  const proximaEtapa = etapa + 1;
  const label = titulosEtapas[proximaEtapa] || `Abrir etapa ${proximaEtapa + 1}/4`;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_etapa_${proximaEtapa + 1}`)
      .setLabel(label.slice(0, 80))
      .setStyle(ButtonStyle.Primary)
  );
}

module.exports = {
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
};
