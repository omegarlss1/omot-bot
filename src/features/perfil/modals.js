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

// ─── Utilitário ───────────────────────────────────────────────────────────────

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

// ─── Botões Admin do Perfil ───────────────────────────────────────────────────

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

// ─── Modal de Stat Admin ──────────────────────────────────────────────────────

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
    .setLabel(`Quantidade a adicionar em ${labels[field] || 'estatística'}`)
    .setPlaceholder('Ex: 1, 3, 5')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(inputValor));
  return modal;
}

// ─── FLUXO DE CADASTRO DE TÍTULOS ────────────────────────────────────────────

// Etapa 1: Botões de Colocação e Tipo (Ômega vs Comunidade)
function buildEscolhaTituloBotoes(targetId) {
  const rowOmega = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_escolha_titulo_omega_1_${targetId}`)
      .setLabel('🥇 1º Lugar ÔMEGA')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_escolha_titulo_omega_2_${targetId}`)
      .setLabel('🥈 2º Lugar ÔMEGA')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`btn_escolha_titulo_omega_3_${targetId}`)
      .setLabel('🥉 3º Lugar ÔMEGA')
      .setStyle(ButtonStyle.Secondary)
  );

  const rowComunidade = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_escolha_titulo_comunidade_1_${targetId}`)
      .setLabel('🥇 1º Comunidade')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_escolha_titulo_comunidade_2_${targetId}`)
      .setLabel('🥈 2º Comunidade')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`btn_escolha_titulo_comunidade_3_${targetId}`)
      .setLabel('🥉 3º Comunidade')
      .setStyle(ButtonStyle.Secondary)
  );

  const rowVoltar = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_aba_perfil_stats_${targetId}`)
      .setLabel('← Voltar ao Perfil')
      .setStyle(ButtonStyle.Secondary)
  );

  return [rowOmega, rowComunidade, rowVoltar];
}

// Etapa 2: Botões de Formato (Eliminatórias vs Colocação)
function buildEscolhaFormatoTorneio(tipo, colocacao, targetId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_formato_elim_${tipo}_${colocacao}_${targetId}`)
      .setLabel('⚔️ Eliminatórias (Semifinais + Final)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`btn_formato_coloc_${tipo}_${colocacao}_${targetId}`)
      .setLabel('📊 Colocação Direta (1º ao 4º lugar)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_admin_add_titulo_${targetId}`)
      .setLabel('← Voltar')
      .setStyle(ButtonStyle.Secondary)
  );
  return [row];
}

// Etapa 3A - Modal 1: Semifinais (Eliminatórias)
function buildModalSemifinais(tipo, colocacao, targetId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_titulo_semis_${tipo}_${colocacao}_${targetId}`)
    .setTitle('Semifinais do Torneio (1 de 2)');

  const inputCampeonato = new TextInputBuilder()
    .setCustomId('semis_campeonato')
    .setLabel('Nome do Campeonato / Torneio:')
    .setPlaceholder('Ex: Copa Ômega 2v2, Torneio de Verão')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const inputEdicao = new TextInputBuilder()
    .setCustomId('semis_edicao')
    .setLabel('Edição / Temporada / Ano (opcional):')
    .setPlaceholder('Ex: S4, 2024, 3ª Edição')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const inputTime1 = new TextInputBuilder()
    .setCustomId('semis_time1')
    .setLabel('Time 1 — Nome + Jogadores:')
    .setPlaceholder('Ex: Los Bandidos — Nick1 + Nick2')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const inputTime2 = new TextInputBuilder()
    .setCustomId('semis_time2')
    .setLabel('Time 2 — Nome + Jogadores:')
    .setPlaceholder('Ex: Ômega FC — Nick3 + Nick4')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputCampeonato),
    new ActionRowBuilder().addComponents(inputEdicao),
    new ActionRowBuilder().addComponents(inputTime1),
    new ActionRowBuilder().addComponents(inputTime2)
  );

  return modal;
}

// Etapa 3A - Modal 2: Finais (Eliminatórias)
function buildModalFinais(tipo, colocacao, targetId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_titulo_finais_${tipo}_${colocacao}_${targetId}`)
    .setTitle('Final do Torneio (2 de 2)');

  const inputFinalista1 = new TextInputBuilder()
    .setCustomId('finais_time1')
    .setLabel('Finalista 1 — Nome + Jogadores:')
    .setPlaceholder('Ex: Los Bandidos — Nick1 + Nick2')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const inputFinalista2 = new TextInputBuilder()
    .setCustomId('finais_time2')
    .setLabel('Finalista 2 — Nome + Jogadores:')
    .setPlaceholder('Ex: Ômega FC — Nick3 + Nick4')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const inputModo = new TextInputBuilder()
    .setCustomId('finais_modo')
    .setLabel('Modo de Jogo (opcional):')
    .setPlaceholder('Ex: 2v2, 3v3, X1, 1v1')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputFinalista1),
    new ActionRowBuilder().addComponents(inputFinalista2),
    new ActionRowBuilder().addComponents(inputModo)
  );

  return modal;
}

// Etapa 3B - Modal Único: Colocação Direta
function buildModalTabelaColocacao(tipo, colocacao, targetId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_titulo_tabela_${tipo}_${colocacao}_${targetId}`)
    .setTitle('Classificação do Torneio');

  const inputCampeonato = new TextInputBuilder()
    .setCustomId('tabela_campeonato')
    .setLabel('Campeonato / Edição / Ano:')
    .setPlaceholder('Ex: Copa Ômega S4 — 2024')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const inputPrimeiro = new TextInputBuilder()
    .setCustomId('tabela_primeiro')
    .setLabel('🥇 1º Lugar — Time + Jogadores:')
    .setPlaceholder('Ex: Los Bandidos — Nick1 + Nick2')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const inputSegundo = new TextInputBuilder()
    .setCustomId('tabela_segundo')
    .setLabel('🥈 2º Lugar — Time + Jogadores:')
    .setPlaceholder('Ex: Ômega FC — Nick3 + Nick4')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const inputTerceiro = new TextInputBuilder()
    .setCustomId('tabela_terceiro')
    .setLabel('🥉 3º Lugar — Time + Jogadores:')
    .setPlaceholder('Ex: Phoenix — Nick5 + Nick6')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const inputQuarto = new TextInputBuilder()
    .setCustomId('tabela_quarto')
    .setLabel('4º Lugar — Time + Jogadores (opcional):')
    .setPlaceholder('Ex: Rebels — Nick7 + Nick8')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputCampeonato),
    new ActionRowBuilder().addComponents(inputPrimeiro),
    new ActionRowBuilder().addComponents(inputSegundo),
    new ActionRowBuilder().addComponents(inputTerceiro),
    new ActionRowBuilder().addComponents(inputQuarto)
  );

  return modal;
}

// ─── Paginação de Títulos ─────────────────────────────────────────────────────

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

// ─── Ficha Modal e Navegação ──────────────────────────────────────────────────

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

    if (campo.placeholder) input.setPlaceholder(campo.placeholder);

    if (ehCampoErro && erro) {
      input.setPlaceholder('Formato inválido. Use DD/MM/AAAA.');
      input.setValue('');
    } else if (valorAtual !== undefined && valorAtual !== null && valorAtual !== '') {
      input.setValue(String(valorAtual));
    }

    if (campo.id === 'bio_input') input.setMaxLength(150);

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

  const selectRanksX1 = new StringSelectMenuBuilder()
    .setCustomId('select_ficha_rank_x1')
    .setPlaceholder(dados.rank_x1 ? `Rank X1: ${dados.rank_x1}` : '2. Selecione seu Rank Habitual de X1')
    .addOptions(VALORES_RANK_PERMITIDOS.map((valor) => ({ label: valor, value: valor })));
  rows.push(new ActionRowBuilder().addComponents(selectRanksX1));

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
};
