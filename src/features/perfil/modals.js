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

function buildFichaModalEtapa(stepIndex, valoresPreenchidos = {}, { erro = null, campoErroId = null } = {}) {
  const campos = FICHA_MODAL_STEPS[stepIndex] || [];
  const tituloBase = `Ficha ${stepIndex + 1}/${FICHA_MODAL_STEPS.length}`;

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
  const proximaEtapa = etapa + 1;
  const numeroProximaEtapa = proximaEtapa + 1;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_continuar_ficha_${numeroProximaEtapa}`)
      .setLabel(`Abrir ficha ${numeroProximaEtapa}/4`)
      .setStyle(ButtonStyle.Primary)
  );
}

module.exports = {
  compactarLinhasComponentes,
  buildAdminButtons,
  buildAdminStatModal,
  buildTitulosButtons,
  buildFichaModalEtapa,
  buildFichaSelects,
  criarBotaoCorrecao,
  criarModalCorrecao,
  criarBotaoContinuarFicha
};

