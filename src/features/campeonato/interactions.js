const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const config = require('../../config');
const { embedCriarEvento, embedSelecionarRanks, embedEventoCriado, embedPainelInscricao, embedInscricaoConfirmada, embedResumoCorte, embedMenuFormato, embedPainelPartida, embedPlacarEnviado, embedDisputaOrganizador, embedBracket, embedClassificacao, embedCampeaoDefinido, embedPainelAdmin, embedCancelamentoConfirmado, embedReaberturaConfirmada, embedTimeDesclassificado, embedPlacarAjustado, toActionRows } = require('./embeds');
const { criarEvento, EventoError } = require('./service');
const { gerarDescricaoEvento } = require('./services/duracao');
const { inscreverCapitao, inscreverJogadorManual, fecharInscricoes, executarCorte, definirFormato, findCampeonatoPorCanalInscricao, findCampeonatoPorCanal, listarInscricoes, InscricaoError } = require('./services/inscricao');
const { validarInscricao, InscricaoError: ValidacaoInscricaoError } = require('./validators/inscricao');
const { CorteError } = require('./validators/corte');
const { gerarBracket, BracketError } = require('./services/bracket');
const { registrarCheckIn, registrarCheckInOrganizador, verificarAdversarioFaltou, registrarWO, CheckinError } = require('./services/checkin');
const { enviarPlacar, validarPlacar, parsePlacar, PlacarError } = require('./services/placar');
const { placarEhValido } = require('./validators/placar');
const { calcularClassificacao } = require('./services/classificacao');
const { finalizarCampeonato, obterClassificacaoFinal, FinalizacaoError } = require('./services/finalizacao');
const { cancelarCampeonato, reabrirCampeonato, excluirCampeonatos, desclassificarTime, ajustarPlacar, AdminError } = require('./services/admin');
const { notificarCampeao, anunciarNoCanal } = require('./services/notificacoes');
const Campeonato = require('../../db/models/campeonato');
const Partida = require('../../db/models/partida');
const Time = require('../../db/models/time');
const { buildPainelOrganizador } = require('../../bot/commands/painel-organizador');

const selecaoRanks = new Map();
const selecoesExclusao = new Map();
const wosPendentes = new Map();
const configPainel = new Map(); // FLUXO 2: estado do painel de configuração por usuário

async function publicarPainelInscricao(canal, campeonato) {
  if (!canal?.isTextBased?.()) throw new Error('Canal de inscrições inválido ou não é um canal de texto.');
  const painel = embedPainelInscricao(campeonato, 0);
  const mensagem = await canal.send({
    content: '⬇️ Use os botões abaixo para inscrever o time ou solicitar uma inscrição manual.',
    embeds: painel.embeds,
    components: toActionRows(painel.components)
  });
  const temBotao = mensagem.components?.some((linha) =>
    linha.components?.some((componente) => componente.customId === 'btn_camp_inscrever')
  );
  if (!temBotao) throw new Error('O Discord criou o painel sem o botão btn_camp_inscrever.');
  return mensagem;
}

function temPermissaoOrganizador(member) {
  if (!member) return false;
  if (member.permissions?.has?.('Administrator')) return true;
  const orgRoleId = config.campeonato.cargoOrganizacaoId;
  return member.roles?.cache?.has?.(orgRoleId) || false;
}

function parseDataBR(texto) {
  const match = String(texto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const data = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 23, 59, 59);
  return Number.isNaN(data.getTime()) ? null : data;
}

async function safeReply(interaction, options) {
  try {
    if (interaction.deferred && !interaction.replied) {
      return await interaction.editReply(options);
    }
    if (interaction.replied) {
      return await interaction.followUp(options);
    }
    return await interaction.reply(options);
  } catch {
    if (interaction.channel?.isTextBased?.()) {
      const content = typeof options === 'string' ? options : options?.content || 'Erro ao responder interação.';
      return await interaction.channel.send(content).catch(() => {});
    }
  }
}

async function onAbrirPainelCriacao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode criar eventos.', flags: 64 });
  }
  return interaction.showModal(buildConfigModal());
}

function buildConfigModal() {
  const modal = new ModalBuilder()
    .setCustomId('modal_config_campeonato_dados')
    .setTitle('Configurações do Campeonato — Dados');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('camp_nome')
        .setLabel('Nome do Campeonato (ex: Omega #42)')
        .setStyle(TextInputStyle.Short)
        .setMinLength(3)
        .setMaxLength(60)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('camp_data_inicio')
        .setLabel('Data de início (DD/MM/AAAA)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('01/12/2026')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('camp_data_limite')
        .setLabel('Data limite inscrições (DD/MM/AAAA)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('30/11/2026')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('camp_horario_inicio')
        .setLabel('Horário base (HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('19:00')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('camp_descricao')
        .setLabel('Descrição / Carta do organizador (opcional)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(4000)
        .setRequired(false)
    )
  );
  return modal;
}

async function onSubmitConfigDados(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Sem permissao.', flags: 64 });
  }
  const nome = interaction.fields.getTextInputValue('camp_nome');
  const dataInicioStr = interaction.fields.getTextInputValue('camp_data_inicio') || '';
  const dataInicio = parseDataBR(dataInicioStr);
  const dataLimite = parseDataBR(interaction.fields.getTextInputValue('camp_data_limite') || '');
  const horarioInicio = interaction.fields.getTextInputValue('camp_horario_inicio')?.trim() || '19:00';
  const descricao = interaction.fields.getTextInputValue('camp_descricao')?.trim() || '';

  if (!dataInicio) {
    return interaction.reply({ content: 'Data de início inválida. Use o formato DD/MM/AAAA.', flags: 64 });
  }
  if (!dataLimite || dataLimite > dataInicio) {
    return interaction.reply({ content: 'Data limite inválida. Ela deve ser igual ou anterior à data do evento.', flags: 64 });
  }

  const userId = interaction.user.id;
  configPainel.set(`camp:config:${userId}`, {
    nome,
    dataInicio,
    dataLimiteInscricoes: dataLimite,
    horarioInicio,
    descricao,
    modo: null,
    baseadoEmInscricoes: null,
    formato: null,
    participantes: []
  });

  return interaction.update(buildConfigPanel(userId));
}

function buildConfigPanel(userId) {
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) {
    return { content: 'Sessão expirada. Clique em Novo Campeonato de novo.', embeds: [], components: [] };
  }

  const sections = [
    { key: 'dados', label: 'Preencher dados', emoji: '📝', customId: 'btn_config_dados', disabled: false, done: true },
    { key: 'modo', label: 'Escolher modo', emoji: '⚔️', customId: 'btn_config_modo', disabled: false, done: !!cfg.modo },
    { key: 'entrada', label: 'Quem pode entrar', emoji: '👥', customId: 'btn_config_entrada', disabled: !cfg.modo, done: !!cfg.baseadoEmInscricoes },
    { key: 'formato', label: 'Formato', emoji: '📋', customId: 'btn_config_formato', disabled: !cfg.baseadoEmInscricoes || cfg.baseadoEmInscricoes === true, done: !!cfg.formato },
    { key: 'participantes', label: 'Participantes', emoji: '👤', customId: 'btn_config_participantes', disabled: !cfg.baseadoEmInscricoes || cfg.baseadoEmInscricoes === true, done: cfg.participantes?.length > 0 },
    { key: 'criar', label: 'Criar Campeonato', emoji: '✅', customId: 'btn_config_criar', disabled: !isConfigComplete(cfg), done: false }
  ];

  const embed = {
    title: '⚙️ Configurações do Campeonato',
    description: `**${cfg.nome}** — ${new Date(cfg.dataInicio).toLocaleDateString('pt-BR')} às ${cfg.horarioInicio}\nLimite inscrições: ${new Date(cfg.dataLimiteInscricoes).toLocaleDateString('pt-BR')}\n\n${cfg.descricao || '_Sem descrição_'}`,
    color: 0xFF6B00,
    fields: sections.map(s => ({
      name: `${s.done ? '✅' : '⏳'} ${s.emoji} ${s.label}`,
      value: getSectionPreview(cfg, s.key),
      inline: true
    }))
  };

  const buttons = sections.map(s => ({
    type: 2,
    style: s.key === 'criar' ? 3 : (s.done ? 1 : 2),
    label: s.label,
    emoji: { name: s.emoji },
    custom_id: s.customId,
    disabled: s.disabled || s.key === 'criar'
  }));

  buttons.push({ type: 2, style: 4, label: 'Cancelar', emoji: { name: '❌' }, custom_id: 'btn_config_cancelar' });

  return {
    embeds: [embed],
    components: [toActionRows([buttons.slice(0, 3)]), toActionRows([buttons.slice(3)])]
  };
}

function isConfigComplete(cfg) {
  if (!cfg.modo) return false;
  if (cfg.baseadoEmInscricoes === true) {
    return true;
  }
  if (cfg.baseadoEmInscricoes === false) {
    return !!cfg.formato && cfg.participantes.length >= 2;
  }
  return false;
}

function getSectionPreview(cfg, key) {
  switch (key) {
    case 'dados': return `${new Date(cfg.dataInicio).toLocaleDateString('pt-BR')} | ${cfg.horarioInicio}`;
    case 'modo': return cfg.modo ? getModoLabel(cfg.modo) : '—';
    case 'entrada': return cfg.baseadoEmInscricoes === true ? 'Inscrição aberta' : cfg.baseadoEmInscricoes === false ? 'Eu escolho' : '—';
    case 'formato': return cfg.formato || '—';
    case 'participantes': return `${cfg.participantes?.length || 0} participante(s)`;
    case 'criar': return isConfigComplete(cfg) ? 'Pronto para criar' : 'Complete as seções acima';
    default: return '—';
  }
}

function getModoLabel(modo) {
  const map = {
    '1v1': 'Duelos (x1)',
    '2v2': 'Duplas (x2)',
    '3v3': 'Triplas (x3)',
    '4v4': 'Quartetos (x4, duplas intercaladas)',
    '6v6': 'Sextetos (x6, duplas intercaladas)',
    '8v8': 'Octetos (x8, duplas intercaladas)'
  };
  return map[modo] || modo;
}

// Legacy - será removido
async function onBotaoCriarEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const modal = new ModalBuilder()
    .setCustomId('modal_criar_evento')
    .setTitle('Criar Evento de Campeonato');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_nome')
        .setLabel('Nome do Evento (ex: Omega #42)')
        .setStyle(TextInputStyle.Short)
        .setMinLength(3)
        .setMaxLength(60)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_data_inicio')
        .setLabel('Data de inicio (DD/MM/AAAA)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('01/12/2026')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_data_limite')
        .setLabel('Data limite das inscrições (DD/MM/AAAA)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('30/11/2026')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('evento_horario_inicio')
        .setLabel('Horario de inicio (HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('19:00')
        .setRequired(true)
    )
  );
  return interaction.showModal(modal);
}

async function onSubmitCriarEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Sem permissao.', flags: 64 });
  }
  const nome = interaction.fields.getTextInputValue('evento_nome');
  const dataInicioStr = interaction.fields.getTextInputValue('evento_data_inicio') || '';
  const dataInicio = parseDataBR(dataInicioStr);
  const dataLimite = parseDataBR(interaction.fields.getTextInputValue('evento_data_limite') || '');
  const horarioInicio = interaction.fields.getTextInputValue('evento_horario_inicio')?.trim() || '19:00';

  if (!dataInicio) {
    return interaction.reply({ content: 'Data invalida. Use o formato DD/MM/AAAA.', flags: 64 });
  }
  if (!dataLimite || dataLimite > dataInicio) {
    return interaction.reply({ content: 'Data limite inválida. Ela deve ser igual ou anterior à data do evento.', flags: 64 });
  }

  selecaoRanks.set(`camp:selecao:${interaction.user.id}`, { nome, dataInicio, dataFim: dataInicio, dataLimiteInscricoes: dataLimite, horarioInicio, modo: null, tipoDupla: null, baseadoEmInscricoes: null, limiteInscricoes: null, modalidade: null, ranksSelecionados: [] });
  const select = new StringSelectMenuBuilder()
    .setCustomId('modal_config_modo')
    .setPlaceholder('Configure o evento')
    .addOptions([
      { label: '1v1', value: '1v1', description: 'Individual' },
      { label: '2v2', value: '2v2', description: 'Duplas fixas' },
      { label: '3v3', value: '3v3', description: 'Padrão' },
      { label: '4v4', value: '4v4', description: 'Duplas mescladas' },
      { label: '6v6', value: '6v6', description: 'Duplas mescladas' },
      { label: '8v8', value: '8v8', description: 'Duplas mescladas' },
      { label: '10v10', value: '10v10', description: 'Duplas mescladas' },
      { label: '12v12', value: '12v12', description: 'Duplas mescladas' }
    ]);
  await interaction.update({
    content: 'Escolha o **modo de jogo**:',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function onToggleRank(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const rank = interaction.customId.replace('btn_camp_rank_toggle_', '');
  const selecao = selecaoRanks.get(`camp:selecao:${interaction.user.id}`);
  if (!selecao) {
    return interaction.update({ content: 'Sessao expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  const idx = selecao.ranksSelecionados.indexOf(rank);
  if (idx >= 0) selecao.ranksSelecionados.splice(idx, 1);
  else selecao.ranksSelecionados.push(rank);
  selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
  const ranksEmbed = embedSelecionarRanks({
    nome: selecao.nome,
    dataInicio: selecao.dataInicio,
    dataFim: selecao.dataFim,
    ranksSelecionados: selecao.ranksSelecionados
  });
  return interaction.update({
    embeds: ranksEmbed.embeds,
    components: toActionRows(ranksEmbed.components)
  });
}

async function onConfirmarRanks(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const selecao = selecaoRanks.get(`camp:selecao:${interaction.user.id}`);
  if (!selecao) {
    return interaction.update({ content: 'Sessao expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  if (selecao.ranksSelecionados.length === 0) {
    return interaction.update({ content: 'Selecione ao menos 1 rank antes de confirmar.', embeds: [], components: [] });
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId('modal_config_baseado')
    .setPlaceholder('Baseado em inscrições?')
    .addOptions([
      { label: 'SIM', value: 'SIM', description: 'Formar times por inscrição' },
      { label: 'NÃO', value: 'NAO', description: 'Times pré-definidos' }
    ]);
  await interaction.update({
    content: 'Evento com ' + selecao.ranksSelecionados.length + ' rank(s). Evento **baseado em inscrições**?',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function onModalSimultaneo(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const valor = interaction.values[0];
  const simultaneo = valor === 'SIM';
  const selecao = selecaoRanks.get(`camp:selecao:${interaction.user.id}`);
  if (!selecao) {
    return interaction.update({ content: 'Sessao expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  selecao.simultaneo = simultaneo;
  selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
  const preview3h = gerarDescricaoEvento({
    dataInicio: selecao.dataInicio,
    duracaoMin: 180,
    numTimes: 0,
    modo: selecao.modo || 'simples',
    simultaneo,
    horarioInicio: selecao.horarioInicio
  });
  const preview4h = gerarDescricaoEvento({
    dataInicio: selecao.dataInicio,
    duracaoMin: 240,
    numTimes: 0,
    modo: selecao.modo || 'simples',
    simultaneo,
    horarioInicio: selecao.horarioInicio
  });
  const select = new StringSelectMenuBuilder()
    .setCustomId('modal_duracao')
    .setPlaceholder('Escolha a duração do campeonato')
    .addOptions([
      { label: '3h (padrão)', value: '180', description: 'Previsão: ' + preview3h.horaInicio + ' às ' + preview3h.horaFim },
      { label: '4h', value: '240', description: 'Previsão: ' + preview4h.horaInicio + ' às ' + preview4h.horaFim }
    ]);
  await interaction.update({
    content: 'Escolha a duração do campeonato:',
    embeds: [{
      title: '⏱️ Prévia — 3h (padrão)',
      description: preview3h.descricao,
      color: 0xFF6B00
    }],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function onModalDuracao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const duracaoMin = Number(interaction.values[0]) || 180;
  const selecao = selecaoRanks.get(`camp:selecao:${interaction.user.id}`);
  if (!selecao) {
    return interaction.update({ content: 'Sessao expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  selecao.duracaoMin = duracaoMin;
  selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
  const preview = gerarDescricaoEvento({
    dataInicio: selecao.dataInicio,
    duracaoMin: duracaoMin,
    numTimes: 0,
    modo: selecao.modo || 'simples',
    simultaneo: selecao.simultaneo,
    horarioInicio: selecao.horarioInicio
  });
  const embed = {
    title: '📋 Confira os dados do evento',
    description: '**Nome:** ' + selecao.nome + '\n' +
      '**Data de início:** ' + new Date(selecao.dataInicio).toLocaleDateString('pt-BR') + '\n' +
      '**Modo:** ' + selecao.modo + '\n' +
      '**Tipo Dupla:** ' + selecao.tipoDupla + '\n' +
      '**Baseado em Inscrições:** ' + (selecao.baseadoEmInscricoes ? 'SIM' : 'NÃO') + '\n' +
      '**Ranks:** ' + selecao.ranksSelecionados.map((r) => r.toUpperCase()).join(', ') + '\n' +
      '**Formato:** ' + (selecao.simultaneo ? 'SIMULTÂNEO' : 'ESCALONADO') + '\n' +
      '**Duração:** ' + duracaoMin + ' min\n' +
      '**3º Lugar:** SIM (padrão)\n\n' +
      '**Previsão:** ' + preview.horaInicio + ' às ' + preview.horaFim + '\n' +
      preview.descricao,
    color: 0xFF6B00
  };
  const components = [[
    { type: 2, style: 3, label: '✅ Confirmar e Criar Evento', custom_id: 'btn_camp_confirmar_criacao', emoji: { name: '✅' } },
    { type: 2, style: 4, label: '❌ Cancelar', custom_id: 'btn_camp_cancelar_criacao', emoji: { name: '❌' } }
  ]];
  return interaction.update({
    content: 'Confira os dados do evento antes de criar:',
    embeds: [embed],
    components: toActionRows(components)
  });
}

async function onConfirmarCriacao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const selecao = selecaoRanks.get(`camp:selecao:${interaction.user.id}`);
  if (!selecao) {
    return interaction.update({ content: 'Sessao expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  const [horaInicio, minutoInicio] = (selecao.horarioInicio || '19:00').split(':').map(Number);
  const dataInicio = new Date(selecao.dataInicio);
  dataInicio.setHours(horaInicio, minutoInicio, 0, 0);
  const dataFim = new Date(dataInicio);
  dataFim.setMinutes(dataFim.getMinutes() + (selecao.duracaoMin || 180));
  await interaction.deferUpdate();
  await interaction.editReply({ content: 'Criando categoria, canais e campeonatos...', embeds: [], components: [] });
  try {
    const resultado = await criarEvento(interaction.guild, {
      nome: selecao.nome,
      dataInicio,
      dataFim,
      ranksSelecionados: selecao.ranksSelecionados,
      organizadorId: interaction.user.id,
      modo: selecao.modo,
      tipoDupla: selecao.tipoDupla,
      baseadoEmInscricoes: selecao.baseadoEmInscricoes,
      limiteInscricoes: selecao.limiteInscricoes,
      modalidade: selecao.modalidade,
      dataLimiteInscricoes: selecao.dataLimiteInscricoes,
      simultaneo: true,
      duracaoMin: 180,
      temTerceiroLugar: true,
      horarioInicio: selecao.horarioInicio
    });
    selecaoRanks.delete(`camp:selecao:${interaction.user.id}`);
    const eventosCriados = [];
    for (const camp of resultado.campeonatos) {
      const canal = await interaction.guild.channels.fetch(camp.canais.inscricoes).catch(() => null);
      if (canal && canal.isTextBased()) {
        try {
          await publicarPainelInscricao(canal, camp);
        } catch (error) {
          console.error(`[campeonato.criarEvento] erro ao publicar painel de inscrição no canal ${canal.id}:`, {
            message: error?.message,
            code: error?.code,
            stack: error?.stack
          });
          camp.painelInscricaoErro = true;
        }
      } else {
        camp.painelInscricaoErro = true;
      }
      const canalOrganizador = await interaction.guild.channels.fetch(camp.canais.organizador).catch(() => null);
      if (canalOrganizador?.isTextBased()) {
        const mensagemFixa = await canalOrganizador.send(buildPainelOrganizador());
        const mensagens = {};
        for (const [secao, titulo] of [
          ['inscritos', '📋 INSCRITOS E TIMES'],
          ['checkin', '✅ CHECK-IN'],
          ['partidas', '🎮 PARTIDAS AO VIVO']
        ]) {
          const mensagem = await canalOrganizador.send({
            embeds: [{ title: titulo, description: `Nenhum dado disponível ainda para **${camp.nome}**.`, color: 0x5865F2 }]
          });
          mensagens[secao] = mensagem.id;
        }
        const gestao = embedPainelAdmin({ campeonato: camp });
        const mensagemGestao = await canalOrganizador.send({
          embeds: gestao.embeds,
          components: toActionRows(gestao.components)
        });
        mensagens.gestao = mensagemGestao.id;
        camp.painelOrganizador = {
          fixaMessageId: mensagemFixa.id,
          dinamicaMessageId: mensagens.inscritos,
          mensagens
        };
        await camp.save();
      }
      const canalAvisos = await interaction.guild.channels.fetch(camp.canais.avisos).catch(() => null);
      if (canalAvisos?.isTextBased()) {
        await canalAvisos.send({
          embeds: [{
            title: `📣 Avisos — ${camp.nome}`,
            description: `Inscrições abertas para o campeonato **${camp.nome}**. Acompanhe este canal para comunicados oficiais.`,
            color: 0xFF6B00
          }]
        }).catch((error) => console.error(`[campeonato.criarEvento] erro ao publicar avisos no canal ${canalAvisos.id}:`, error.message));
      }
      eventosCriados.push(camp);
    }
    return interaction.editReply(embedEventoCriado({
      evento: resultado.evento,
      categoria: resultado.categoria,
      campeonatos: eventosCriados
    }));
  } catch (error) {
    if (error instanceof EventoError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.criarEvento] erro:', error);
    return interaction.editReply({ content: 'Erro ao criar evento. Verifique permissoes do bot e tente novamente.' });
  }
}

async function onCancelarCriacao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  selecaoRanks.delete(`camp:selecao:${interaction.user.id}`);
  return interaction.update({ content: 'Criacao cancelada.', embeds: [], components: [] });
}

async function onBotaoInscrever(interaction) {
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Este canal nao e de inscricao de campeonato.', flags: 64 });
  }
  if (campeonato.status !== 'INSCRICOES_ABERTAS') {
    return interaction.reply({ content: 'Inscricoes nao estao abertas.', flags: 64 });
  }
  if (campeonato.modo === '1v1') {
    await interaction.deferReply({ flags: 64 });
    try {
      const { time, dadosCapitao } = await inscreverCapitao({ guild: interaction.guild, member: interaction.member, campeonato });
      return interaction.editReply(embedInscricaoConfirmada({ time, capitao: dadosCapitao }));
    } catch (error) {
      if (error instanceof InscricaoError || error instanceof ValidacaoInscricaoError) return interaction.editReply({ content: error.message });
      throw error;
    }
  }
  const modal = new ModalBuilder()
    .setCustomId('modal_camp_inscricao')
    .setTitle('Inscricao - ' + String(campeonato.rank || '').toUpperCase());
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('inscricao_nome_time')
        .setLabel('Nome do Time (opcional)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(40)
        .setRequired(false)
    )
  );
  return interaction.showModal(modal);
}

async function onBotaoInscricaoManual(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode fazer inscrições manuais.', flags: 64 });
  }
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Este canal nao e de inscricao de campeonato.', flags: 64 });
  }
  if (campeonato.status !== 'INSCRICOES_ABERTAS') {
    return interaction.reply({ content: 'Inscricoes nao estao abertas.', flags: 64 });
  }
  const modal = new ModalBuilder()
    .setCustomId('modal_camp_inscricao_manual')
    .setTitle('Inscrição manual');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('inscricao_manual_jogador')
        .setLabel('Nome')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(80)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('inscricao_manual_nick').setLabel('Nick do jogador').setStyle(TextInputStyle.Short).setMaxLength(20).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('inscricao_manual_telefone').setLabel('Nº celular / WhatsApp').setStyle(TextInputStyle.Short).setMaxLength(20).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('inscricao_manual_time')
        .setLabel('Nome do time (opcional)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(40)
        .setRequired(false)
    )
  );
  return interaction.showModal(modal);
}

async function onBotaoSelecionarCapitao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode selecionar capitães.', flags: 64 });
  }
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato || campeonato.status !== 'INSCRICOES_ABERTAS') {
    return interaction.reply({ content: 'Inscrições não estão abertas neste canal.', flags: 64 });
  }
  const menu = new UserSelectMenuBuilder()
    .setCustomId('select_camp_capitao')
    .setPlaceholder('Selecione o capitão do time')
    .setMinValues(1)
    .setMaxValues(1);
  return interaction.reply({
    content: 'Selecione o membro que será o capitão deste time:',
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: 64
  });
}

async function onSelectCapitao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const capitaoId = interaction.values[0];
  const modal = new ModalBuilder().setCustomId(`modal_camp_capitao_${capitaoId}`).setTitle('Inscrição do time');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('capitao_nome_time').setLabel('Nome do time (opcional)').setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(false)
  ));
  return interaction.showModal(modal);
}

async function onSubmitCapitao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  const capitaoId = interaction.customId.replace('modal_camp_capitao_', '');
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  const member = await interaction.guild.members.fetch(capitaoId).catch(() => null);
  if (!campeonato || !member) return interaction.editReply({ content: 'Campeonato ou capitão não encontrado.' });
  try {
    const resultado = await inscreverCapitao({
      guild: interaction.guild,
      member,
      campeonato,
      nomeTime: interaction.fields.getTextInputValue('capitao_nome_time')
    });
    return interaction.editReply({ content: `✅ **${resultado.time.nome}** criado com <@${capitaoId}> como capitão.` });
  } catch (error) {
    if (error instanceof InscricaoError || error instanceof ValidacaoInscricaoError) return interaction.editReply({ content: error.message });
    console.error('[campeonato.selecionar_capitao] erro:', error);
    return interaction.editReply({ content: 'Erro ao inscrever o capitão.' });
  }
}

async function onSubmitInscricao(interaction) {
  await interaction.deferReply({ flags: 64 });
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.editReply({ content: 'Campeonato nao encontrado neste canal.' });
  }
  const nomeTime = interaction.fields.getTextInputValue('inscricao_nome_time');
  try {
    const { time, dadosCapitao } = await inscreverCapitao({
      guild: interaction.guild,
      member: interaction.member,
      campeonato,
      nomeTime
    });
    const resposta = embedInscricaoConfirmada({ time, capitao: dadosCapitao });
    const vagas = Math.max(0, Number(campeonato.maxJogadoresPorTime || 1) - 1);
    if (vagas > 0) {
      resposta.content = `Capitão confirmado. Adicione até ${vagas} jogador(es) usando **/adicionar-jogador** e o autocomplete de nick.`;
    }
    return interaction.editReply(resposta);
  } catch (error) {
    if (error instanceof InscricaoError || error instanceof ValidacaoInscricaoError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.inscricao] erro:', error);
    return interaction.editReply({ content: 'Erro ao processar inscricao.' });
  }
}

async function onSubmitInscricaoManual(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode fazer inscrições manuais.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) return interaction.editReply({ content: 'Campeonato nao encontrado neste canal.' });

  try {
    const resultado = await inscreverJogadorManual({
      guild: interaction.guild,
      campeonato,
      nomeJogador: interaction.fields.getTextInputValue('inscricao_manual_jogador'),
      nick: interaction.fields.getTextInputValue('inscricao_manual_nick'),
      telefone: interaction.fields.getTextInputValue('inscricao_manual_telefone'),
      nomeTime: interaction.fields.getTextInputValue('inscricao_manual_time')
    });
    return interaction.editReply({ content: `Inscrição manual confirmada para **${resultado.jogador.nickSnapshot}**.` });
  } catch (error) {
    if (InscricaoError && error instanceof InscricaoError) return safeReply(interaction, { content: error.message });
    console.error('[campeonato.inscricao_manual] erro:', error);
    return safeReply(interaction, { content: 'Erro ao processar inscricao manual.' });
  }
}

async function onSelectExcluirCampeonato(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const campeonatosSelecionados = interaction.values;
  const chave = `${interaction.user.id}:${Date.now()}`;
  selecoesExclusao.set(chave, campeonatosSelecionados);
  return interaction.update({
    content: `⚠️ ${campeonatosSelecionados.length} campeonato(s) selecionado(s). Esta ação é definitiva e remove canais, partidas e inscrições. Confirma?`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`btn_confirmar_exclusao_${chave}`).setLabel('Excluir definitivamente').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`btn_cancelar_exclusao_${chave}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
    )]
  });
}

async function onConfirmarExclusao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferUpdate();
  const chave = interaction.customId.replace('btn_confirmar_exclusao_', '');
  const campeonatoIds = selecoesExclusao.get(chave) || [];
  try {
    await excluirCampeonatos({ campeonatoIds, guild: interaction.guild, executadoPor: interaction.user.id });
    selecoesExclusao.delete(chave);
    return safeReply(interaction, { content: `✅ ${campeonatoIds.length} campeonato(s), partidas, times e canais excluídos.`, components: [] });
  } catch (error) {
    if (error instanceof AdminError) return safeReply(interaction, { content: error.message, components: [] });
    console.error('[excluir-campeonato] erro:', error);
    return safeReply(interaction, { content: 'Erro ao excluir o campeonato.', components: [] });
  }
}

async function onCancelarExclusao(interaction) {
  const chave = interaction.customId.replace('btn_cancelar_exclusao_', '');
  selecoesExclusao.delete(chave);
  return interaction.update({ content: 'Exclusão cancelada.', components: [] });
}

async function onSelectJogadoresTime(interaction) {
  await interaction.deferReply({ flags: 64 });
  const timeId = interaction.customId.replace('select_camp_jogadores_', '');
  const time = await Time.findById(timeId);
  if (!time) return interaction.editReply({ content: 'Time nao encontrado.' });
  if (time.capitaoId !== interaction.user.id) {
    return interaction.editReply({ content: 'Apenas o capitão pode selecionar os jogadores.' });
  }

  const campeonato = await Campeonato.findById(time.campeonatoId);
  if (!campeonato || campeonato.status !== 'INSCRICOES_ABERTAS') {
    return interaction.editReply({ content: 'As inscrições não estão abertas.' });
  }
  const capitaoAtual = time.jogadores.find((jogador) => jogador.userId === interaction.user.id) || time.jogadores[0];
  const jogadores = [{
    userId: interaction.user.id,
    rankSnapshot: capitaoAtual.rankSnapshot,
    nickSnapshot: capitaoAtual.nickSnapshot,
    isSubstituto: false,
    isCapitao: true,
    partidasJogadas: 0
  }];
  for (const userId of interaction.values) {
    if (userId === interaction.user.id) continue;
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    const perfil = await require('../../db/models/perfilMembro').findOne({ guildId: interaction.guild.id, userId });
    const dados = validarInscricao({ member, perfil, ranksDisponiveis: [campeonato.rank] });
    jogadores.push({
      userId,
      rankSnapshot: dados.capitaoRankSnapshot,
      nickSnapshot: dados.capitaoNick,
      isSubstituto: false,
      isCapitao: false,
      partidasJogadas: 0
    });
  }
  time.jogadores = jogadores;
  await time.save();
  for (const canalId of [time.canais?.texto, time.canais?.voz].filter(Boolean)) {
    const canal = await interaction.guild.channels.fetch(canalId).catch(() => null);
    for (const jogador of jogadores.filter((item) => !item.userId.startsWith('MANUAL_WHATSAPP_'))) {
      await canal?.permissionOverwrites.edit(jogador.userId, {
        ViewChannel: true,
        Connect: true,
        SendMessages: true,
        ReadMessageHistory: true
      }).catch(() => {});
    }
  }
  return interaction.editReply({ content: `✅ Time **${time.nome}** atualizado com ${jogadores.length} jogador(es).` });
}

async function onBotaoBroadcast(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  const modal = new ModalBuilder().setCustomId('modal_camp_broadcast').setTitle('Enviar broadcast');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('broadcast_mensagem').setLabel('Mensagem para os canais do campeonato').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)
  ));
  return interaction.showModal(modal);
}

async function onSelectCheckInOrganizador(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  const [partidaId, lado] = interaction.values[0].split(':');
  try {
    const resultado = await registrarCheckInOrganizador(partidaId, lado, interaction.user.id);
    return interaction.reply({ content: resultado.partidaIniciada ? '✅ Check-in registrado. Partida liberada para placar.' : '✅ Check-in manual registrado.', flags: 64 });
  } catch (error) {
    if (error instanceof CheckinError) return interaction.reply({ content: error.message, flags: 64 });
    throw error;
  }
}

async function onSubmitBroadcast(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  await interaction.deferReply({ flags: 64 });
  const campeonato = await findCampeonatoPorCanal(interaction.channelId);
  if (!campeonato) return interaction.editReply({ content: 'Campeonato nao encontrado neste canal.' });
  const mensagem = interaction.fields.getTextInputValue('broadcast_mensagem').trim();
  const destinos = [campeonato.canais.inscricoes, campeonato.canais.partidas, campeonato.canais.organizador, campeonato.canais.avisos].filter(Boolean);
  let enviados = 0;
  for (const channelId of destinos) {
    const canal = await interaction.client.channels.fetch(channelId).catch(() => null);
    if (canal?.isTextBased()) await canal.send({ content: `📣 **Broadcast da organização**\n${mensagem}` }).then(() => enviados++).catch(() => {});
  }
  return interaction.editReply({ content: `Broadcast enviado para ${enviados} canal(is).` });
}

async function onBotaoFecharInscricoes(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Apenas @OrganizadorCamps pode fechar inscricoes.', flags: 64 });
  }
  // Fix: use regex to extract campeonatoId properly
  const match = interaction.customId.match(/^btn_encerrar_inscricoes_([a-f0-9]{24})$/) || 
                interaction.customId.match(/^btn_camp_fechar_inscricoes_([a-f0-9]{24})$/);
  if (!match) {
    return safeReply(interaction, { content: 'ID do campeonato inválido.', flags: 64 });
  }
  const campeonatoId = match[1];
  const campeonato = await Campeonato.findById(campeonatoId);
  if (!campeonato) {
    console.error('[Encerrar] Campeonato não encontrado, ID:', campeonatoId);
    return safeReply(interaction, { content: `❌ Campeonato não encontrado.`, flags: 64 });
  }
  
  // Toggle: if already closed, reopen; else close
  const novoStatus = campeonato.status === 'INSCRICOES_FECHADAS' ? 'INSCRICOES_ABERTAS' : 'INSCRICOES_FECHADAS';
  await Campeonato.updateOne({ _id: campeonatoId }, { $set: { status: novoStatus } });
  
  const inscricoes = await listarInscricoes(campeonatoId);
  
  // Update organizer panel
  const canalOrgao = campeonato.canais?.organizador;
  if (canalOrgao) {
    try {
      const canal = await interaction.guild.channels.fetch(canalOrgao);
      if (canal) {
        const campAtualizado = await Campeonato.findById(campeonatoId).lean();
        const { atualizarPainelOrganizador } = require('./services/painel');
        await atualizarPainelOrganizador(canal, campAtualizado, 'gestao');
      }
    } catch (e) {
      console.warn('[Encerrar/Reabrir] falha ao atualizar painel:', e.message);
    }
  }
  
  const label = novoStatus === 'INSCRICOES_FECHADAS' ? 'encerradas' : 'reabertas';
  return safeReply(interaction, { 
    content: `Inscrições ${label}. ${inscricoes.length} time(s) inscrito(s).`, 
    flags: 64 
  });
}

async function onBotaoCortar(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode cortar.', flags: 64 });
  }
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato nao encontrado.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const resultado = await executarCorte({
      campeonatoId: campeonato._id,
      tipoDupla: campeonato.tipoDupla || 'SORTEADA'
    });
    const resumo = embedResumoCorte(resultado);
    await interaction.editReply({
      embeds: resumo.embeds,
      components: toActionRows(resumo.components)
    });
    if (resultado.precisaEscolherFormato) {
      const menu = embedMenuFormato(campeonato._id, resultado.totalTimes, resultado.alternativas);
      await interaction.followUp({
        embeds: menu.embeds,
        components: toActionRows(menu.components),
        flags: 64
      });
    }
  } catch (error) {
    if (error instanceof CorteError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.corte] erro:', error);
    return interaction.editReply({ content: 'Erro ao processar corte.' });
  }
}

async function onGerenciarParticipantes(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const match = interaction.customId.match(/^btn_gerenciar_participantes_([a-f0-9]{24})$/);
  if (!match) return safeReply(interaction, { content: 'ID inválido.', flags: 64 });
  const campeonatoId = match[1];
  
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato) {
    return safeReply(interaction, { content: 'Campeonato não encontrado.', flags: 64 });
  }
  
  const isSolo = campeonato.modo === '1v1';
  const participantes = await Time.find({ campeonatoId }).lean();
  
  if (!participantes.length) {
    return safeReply(interaction, { content: 'Nenhum participante cadastrado.', flags: 64 });
  }
  
  const linhas = participantes.map((p, i) => {
    const jogadores = (p.jogadores || []).map(j => {
      if (j.origem === 'WHATSAPP' || String(j.userId || '').startsWith('MANUAL_WHATSAPP_')) {
        return j.nickSnapshot || '—';
      }
      return `<@${j.userId}>`;
    }).join(', ') || 'Sem jogadores';
    const capitao = p.jogadores?.[0];
    const checkinStatus = capitao ? '⏳' : '—'; // TODO: real check-in status
    return `${i + 1}. ${checkinStatus} **${p.nome || 'Sem nome'}** (${isSolo ? 'Jogador' : 'Time'}) — ${jogadores}`;
  }).join('\n');
  
  const opcoes = participantes.slice(0, 25).map(p => ({
    label: p.nome || 'Sem nome',
    value: String(p._id),
    description: `${p.jogadores?.length || 0} jogador(es)`
  }));
  
  const select = new StringSelectMenuBuilder()
    .setCustomId('select_participante_acao_' + campeonatoId)
    .setPlaceholder('Selecione um participante para gerenciar')
    .addOptions(opcoes);
  
  const payload = {
    embeds: [{
      title: isSolo ? '👤 ABA - PARTICIPANTES (Duelos)' : '👥 ABA - PARTICIPANTES (Times)',
      description: linhas,
      color: 0x00FF00,
      footer: { text: `Total: ${participantes.length} ${isSolo ? 'jogador(es)' : 'time(s)'}` }
    }],
    components: [new ActionRowBuilder().addComponents(select)]
  };
  
  const canalOrgao = campeonato.canais?.organizador;
  if (canalOrgao) {
    try {
      const canal = await interaction.guild.channels.fetch(canalOrgao);
      if (canal) {
        const messageId = campeonato.painelOrganizador?.mensagens?.times || campeonato.painelOrganizador?.dinamicaMessageId;
        let mensagem = messageId ? await canal.messages.fetch(messageId).catch(() => null) : null;
        
        if (mensagem) {
          await mensagem.edit(payload);
          await Campeonato.updateOne({ _id: campeonatoId }, { $set: { 'painelOrganizador.mensagens.times': mensagem.id } });
        } else {
          mensagem = await canal.send(payload);
          await Campeonato.updateOne({ _id: campeonatoId }, { $set: { 'painelOrganizador.mensagens.times': mensagem.id } });
        }
      }
    } catch (e) {
      console.warn('[GerenciarParticipantes] falha ao atualizar painel:', e.message);
    }
  }
  
  return safeReply(interaction, { content: 'Painel de participantes atualizado no canal de organizador.', flags: 64 });
}

// Legacy alias
async function onGerenciarTimes(interaction) {
  return onGerenciarParticipantes(interaction);
}

async function onEscolherFormato(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const match = interaction.customId.match(/^btn_camp_formato_([\w-]+)_([a-f0-9]{24})$/);
  if (!match) return;
  const [, formato, campeonatoId] = match;
  await definirFormato(campeonatoId, formato);
  return interaction.update({
    content: 'Formato definido como ' + formato + '.',
    embeds: [],
    components: []
  });
}

async function onDefinirFormato(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const match = interaction.customId.match(/^btn_(?:camp_)?definir_formato_([a-f0-9]{24})$/);
  if (!match) return interaction.update({ content: 'ID inválido.', embeds: [], components: [] });
  const campeonatoId = match[1];
  
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato) {
    return interaction.update({ content: 'Campeonato não encontrado.', embeds: [], components: [] });
  }
  
  const times = await Time.find({ campeonatoId }).lean();
  const numTimes = times.length;
  
  // Build preview for each format
  const { calcularFasesSimultaneo, calcularFasesEscalonado } = require('./services/duracao');
  const modo = campeonato.modo || '3v3';
  const intervalo = campeonato.intervaloPartidasMin || 20;
  
  const formatos = [
    { value: 'single', label: 'Eliminatória Simples', emoji: '🏁' },
    { value: 'double', label: 'Eliminatória Dupla', emoji: '🔁' },
    { value: 'grupos-mata-mata', label: 'Grupos + Mata-mata', emoji: '👥' },
    { value: 'round-robin', label: 'Round Robin (Todos vs Todos)', emoji: '🔄' }
  ];
  
  const previewLines = formatos.map(f => {
    let desc = '';
    if (f.value === 'round-robin') {
      const partidas = numTimes * (numTimes - 1) / 2;
      const duracaoMin = Math.ceil(partidas * intervalo / 60 * 60); // rough estimate
      desc = `${partidas} partidas • ~${Math.ceil(partidas * intervalo / 60)}h (MD3 fixo)`;
    } else {
      // Elimination formats: MD3 normal, MD5 final/3rd
      const eliminatorias = Math.ceil(Math.log2(numTimes));
      const partidas = numTimes - 1;
      const md5Count = 2; // final + 3rd place
      const md3Count = Math.max(0, eliminatorias - 1);
      const totalJogos = md3Count * 3 + md5Count * 5;
      desc = `${partidas} partidas • ~${Math.ceil(totalJogos * intervalo / 60)}h (MD3 rodadas, MD5 final/3º)`;
    }
    return `${f.emoji} **${f.label}**: ${desc}`;
  });
  
  const select = new StringSelectMenuBuilder()
    .setCustomId('select_definir_formato_' + campeonatoId)
    .setPlaceholder('Escolha o formato — veja preview abaixo')
    .addOptions(formatos.map(f => ({
      label: f.label,
      value: f.value,
      description: previewLines.find(l => l.includes(f.label))?.split('• ')[1] || ''
    })));
  
  const embed = {
    title: '📋 Definir Formato do Campeonato',
    description: `**${campeonato.nome}** — ${numTimes} time(s) • Modo: ${modo} • Intervalo: ${intervalo}min\n\n**Preview de duração:**\n${previewLines.join('\n')}`,
    color: 0xFF6B00,
    footer: { text: 'MD3 nas rodadas normais • MD5 na Final e 3º lugar (exceto Round Robin)' }
  };
  
  return interaction.update({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function onDefinirFormatoSelect(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const match = interaction.customId.match(/^select_definir_formato_([a-f0-9]{24})$/);
  if (!match) return;
  const [, campeonatoId] = match;
  const formato = interaction.values[0];
  
  await definirFormato(campeonatoId, formato);
  
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato) {
    return interaction.update({ content: 'Campeonato não encontrado.', embeds: [], components: [] });
  }
  
  // Rebuild gestão buttons with updated state
  const rowFormato = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
     .setCustomId(`select_definir_formato_${campeonato._id}`)
     .setPlaceholder(`Formato atual: ${formato}`)
     .addOptions([
        { label: 'Eliminatória Simples', value: 'single', default: formato==='single' },
        { label: 'Eliminatória Dupla', value: 'double', default: formato==='double' },
        { label: 'Round Robin', value: 'round-robin', default: formato==='round-robin' },
        { label: 'Grupos + Mata-mata', value: 'grupos-mata-mata', default: formato==='grupos-mata-mata' }
      ])
  );
  
  // Check if bracket exists and no matches decided
  const partidas = await Partida.find({ campeonatoId, status: { $in: ['FINALIZADA', 'WO'] } }).lean();
  const bracketExiste = await Partida.findOne({ campeonatoId }).lean();
  const podeMudarFormato = !partidas.length && bracketExiste;
  
  const rowAcoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_camp_gerar_bracket_${campeonato._id}`)
      .setLabel('🎯 Gerar Bracket')
      .setStyle(ButtonStyle.Success)
      .setDisabled(campeonato.status !== 'INSCRICOES_FECHADAS' || !campeonato.modalidade),
    new ButtonBuilder()
      .setCustomId(`btn_encerrar_inscricoes_${campeonato._id}`)
      .setLabel(campeonato.status === 'INSCRICOES_FECHADAS' ? '🔓 Reabrir Inscrições' : '🔒 Encerrar Inscrições')
      .setStyle(campeonato.status === 'INSCRICOES_FECHADAS' ? ButtonStyle.Primary : ButtonStyle.Danger)
      .setDisabled(campeonato.baseadoEmInscricoes !== true),
    new ButtonBuilder()
      .setCustomId(`btn_gerenciar_participantes_${campeonato._id}`)
      .setLabel('👥 Gerenciar Participantes')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(campeonato.status === 'CANCELADO')
  );
  
  // Add warning if format change would require bracket regeneration
  let content = `✅ Formato definido: **${formato.toUpperCase()}** para **${campeonato.nome}**.`;
  if (bracketExiste && podeMudarFormato) {
    content += '\n⚠️ Formato alterado — gere o bracket novamente para aplicar.';
  } else if (partidas.length > 0) {
    content += '\n🔒 Partidas já decididas — formato travado até reset.';
  }
  
  return interaction.update({
    content,
    embeds: [],
    components: [rowFormato, rowAcoes]
  });
}

async function onBotaoGerarBracket(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode gerar bracket.', flags: 64 });
  }
  // Support both old and new customId patterns
  let match = interaction.customId.match(/^btn_camp_gerar_bracket_([a-f0-9]{24})$/);
  if (!match) match = interaction.customId.match(/^btn_gerar_bracket_([a-f0-9]{24})$/);
  if (!match) {
    const canalCamp = await findCampeonatoPorCanal(interaction.channelId);
    if (canalCamp) match = [null, canalCamp._id];
  }
  if (!match) {
    return interaction.reply({ content: 'Campeonato não encontrado.', flags: 64 });
  }
  const campeonatoId = match[1];

  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato não encontrado.', flags: 64 });
  }

  // Check if bracket already exists
  const existing = await Partida.findOne({ campeonatoId, fase: 'R1' }).lean();
  if (existing) {
    return interaction.reply({ 
      content: '⚠️ Bracket já existe para este campeonato. Use o painel de gestão para limpar antes de gerar novamente.', 
      flags: 64 
    });
  }

  // Generate preview
  await interaction.deferReply({ flags: 64 });
  try {
    const { previewBracket } = require('./services/bracket');
    const preview = await previewBracket(campeonatoId);

    // Build preview embed with match list
    const lines = preview.partidas.map(p => {
      const timeA = p.timeAHasBye ? `⏭️ **${p.timeA}** (BYE)` : `**${p.timeA}**`;
      const timeB = p.timeBHasBye ? `⏭️ **${p.timeB}** (BYE)` : `**${p.timeB}**`;
      const horario = `<t:${Math.floor(p.estimatedStartAt.getTime() / 1000)}:t>`;
      return `${p.index}. ${p.fase} — ${timeA} vs ${timeB} ${p.isByeMatch ? '(BYE vs BYE - cancelada)' : ''} — ${horario}`;
    }).join('\n');

    const embed = {
      title: `🎯 Preview do Bracket — ${campeonato.nome}`,
      description: `**Formato:** ${preview.formato} | **Modo:** ${preview.modo} | **Intervalo:** ${preview.intervalo}min\n**${preview.totalPartidas} partidas** na R1\n\n${lines}`,
      color: 0xFF6B00,
      image: { attachment: `bracket-${campeonato.rank}.png` },
      footer: { text: 'Confira os pareamentos e horários antes de confirmar.' }
    };

    const buttons = [
      { type: 2, style: 3, label: '✅ Confirmar e Postar no #partidas', emoji: { name: '✅' }, custom_id: `btn_confirmar_gerar_bracket_${campeonatoId}` },
      { type: 2, style: 4, label: '❌ Cancelar', emoji: { name: '❌' }, custom_id: `btn_cancelar_gerar_bracket_${campeonatoId}` }
    ];

    return interaction.editReply({
      embeds: [embed],
      files: [new AttachmentBuilder(preview.canvas, { name: `bracket-${campeonato.rank}.png` })],
      components: [toActionRows([buttons])]
    });
  } catch (error) {
    if (error instanceof BracketError) {
      return safeReply(interaction, { content: error.message });
    }
    console.error('[previewBracket] erro:', error);
    return safeReply(interaction, { content: 'Erro ao gerar preview do bracket.' });
  }
}

async function onConfirmarGerarBracket(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Sem permissao.', flags: 64 });
  }
  const match = interaction.customId.match(/^btn_confirmar_gerar_bracket_([a-f0-9]{24})$/);
  if (!match) return safeReply(interaction, { content: 'ID inválido.', flags: 64 });
  const campeonatoId = match[1];

  await interaction.deferUpdate();
  try {
    const resultado = await gerarBracket(campeonatoId);
    
    const campeonato = await Campeonato.findById(campeonatoId).lean();
    if (!campeonato) {
      return interaction.editReply({ content: 'Campeonato não encontrado.', embeds: [], components: [] });
    }

    // Post to #partidas channel
    if (campeonato.canais?.partidas && resultado.canvas) {
      try {
        const canalPartidas = await interaction.guild.channels.fetch(campeonato.canais.partidas);
        if (canalPartidas?.isTextBased?.()) {
          const base = new Date(campeonato.dataEvento || campeonato.startAt || Date.now());
          const intervalo = Number(campeonato.intervaloPartidasMin || 20);
          const horarioStr = `<t:${Math.floor(base.getTime() / 1000)}:F>`;
          const formatoStr = campeonato.modalidade || 'Single Elimination';
          
          await canalPartidas.send({
            content: `📣 **Bracket gerado!** ${campeonato.nome} - ${formatoStr} - ${resultado.totalPartidas} partidas\n` +
                     `R1 começa ${horarioStr} | Intervalo ${intervalo}min | Check-in [H-5min, H+5min]`,
            files: [new AttachmentBuilder(resultado.canvas, { name: `bracket-${campeonato.rank}.png` })]
          });
        }
      } catch (e) {
        console.warn('[gerarBracket] Falha ao postar no canal #partidas:', e.message);
      }
    }

    // Update organizer panel
    const canalOrgao = campeonato.canais?.organizador;
    if (canalOrgao) {
      try {
        const canal = await interaction.guild.channels.fetch(canalOrgao);
        if (canal) {
          const campAtualizado = await Campeonato.findById(campeonatoId).lean();
          const { atualizarPainelOrganizador } = require('./services/painel');
          await atualizarPainelOrganizador(canal, campAtualizado, 'gestao');
        }
      } catch (e) {
        console.warn('[gerarBracket] falha ao atualizar painel:', e.message);
      }
    }

    return interaction.editReply({
      content: `✅ Bracket gerado e postado em <#${campeonato.canais?.partidas}>! ${resultado.totalPartidas} partidas criadas.`,
      embeds: [],
      components: [],
      files: []
    });
  } catch (error) {
    if (error instanceof BracketError) {
      return interaction.editReply({ content: error.message, embeds: [], components: [] });
    }
    console.error('[confirmarGerarBracket] erro:', error);
    return interaction.editReply({ content: 'Erro ao gerar bracket.', embeds: [], components: [] });
  }
}

async function onCancelarGerarBracket(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Sem permissao.', flags: 64 });
  }
  return interaction.update({ content: 'Geração de bracket cancelada.', embeds: [], components: [] });
}

async function onBotaoCheckIn(interaction) {
  const partidaId = interaction.customId.replace('btn_camp_checkin_', '');
  const partida = await Partida.findById(partidaId);
  if (!partida) {
    return interaction.reply({ content: 'Partida nao encontrada.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const timeId = interaction.member.id;
    const todos = await Time.find({});
    const meuTime = todos.find((t) => t.capitaoId === interaction.user.id);
    if (!meuTime) {
      return interaction.editReply({ content: 'Voce nao e capitao de nenhum time nesta partida.', embeds: [], components: [] });
    }
    await registrarCheckIn(partidaId, meuTime._id, interaction.user.id);
    const partidaAtualizada = await Partida.findById(partidaId);
    const timeA = await Time.findById(partidaAtualizada.timeA);
    const timeB = await Time.findById(partidaAtualizada.timeB);
    const painel = embedPainelPartida({ partida: partidaAtualizada, timeA, timeB });
    return interaction.editReply({ embeds: painel.embeds, components: toActionRows(painel.components) });
  } catch (error) {
    if (error instanceof CheckinError) {
      return interaction.editReply({ content: error.message, embeds: [], components: [] });
    }
    console.error('[campeonato.checkin] erro:', error);
    return interaction.editReply({ content: 'Erro no check-in.', embeds: [], components: [] });
  }
}

async function onBotaoAdversarioFaltou(interaction) {
  const partidaId = interaction.customId.replace('btn_camp_adversario_faltou_', '');
  const partida = await Partida.findById(partidaId);
  const time = partida && await Time.findOne({ campeonatoId: partida.campeonatoId, capitaoId: interaction.user.id });
  if (!partida || !time || (String(partida.timeA) !== String(time._id) && String(partida.timeB) !== String(time._id))) {
    return interaction.reply({ content: 'Apenas o capitão de um time desta partida pode solicitar W.O.', flags: 64 });
  }
  const chave = `${interaction.user.id}:${partidaId}`;
  wosPendentes.set(chave, { partidaId, timeId: time._id });
  return interaction.reply({
    content: '⚠️ Confirme que o adversário não compareceu. O W.O. será registrado para o seu time.',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`btn_confirmar_wo_${partidaId}`).setLabel('Confirmar W.O.').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`btn_negar_wo_${partidaId}`).setLabel('Negar').setStyle(ButtonStyle.Secondary)
    )],
    flags: 64
  });
}

async function onConfirmarWO(interaction) {
  const partidaId = interaction.customId.replace('btn_confirmar_wo_', '');
  const chave = `${interaction.user.id}:${partidaId}`;
  const pendente = wosPendentes.get(chave);
  if (!pendente) return interaction.reply({ content: 'Solicitação de W.O. expirada.', flags: 64 });
  try {
    await registrarWO({ partidaId, timeVencedorId: pendente.timeId, motivo: 'Adversário não compareceu', declaranteId: interaction.user.id, juiz: false });
    wosPendentes.delete(chave);
    return interaction.update({ content: '✅ W.O. registrado para o seu time.', components: [] });
  } catch (error) {
    if (error instanceof CheckinError) return interaction.update({ content: error.message, components: [] });
    throw error;
  }
}

async function onNegarWO(interaction) {
  const partidaId = interaction.customId.replace('btn_negar_wo_', '');
  wosPendentes.delete(`${interaction.user.id}:${partidaId}`);
  return interaction.update({ content: 'Solicitação de W.O. cancelada.', components: [] });
}

async function onBotaoEnviarPlacar(interaction) {
  const partidaId = interaction.customId.replace('btn_camp_enviar_placar_', '');
  const partida = await Partida.findById(partidaId);
  if (!partida) {
    return interaction.reply({ content: 'Partida nao encontrada.', flags: 64 });
  }
  const meuTime = await Time.findOne({ capitaoId: interaction.user.id });
  if (!meuTime) return interaction.reply({ content: 'Voce nao e capitao de nenhum time.', flags: 64 });
  const ehTimeA = String(partida.timeA) === String(meuTime._id);
  const ehTimeB = String(partida.timeB) === String(meuTime._id);
  if (!ehTimeA && !ehTimeB) {
    return interaction.reply({ content: 'Seu time nao esta nesta partida.', flags: 64 });
  }
  const duelos = partida.duelos || [];
  if (duelos.length > 0) {
    const opcoes = duelos.map((d, idx) => {
      const idsA = (d.duplaA || []).join(', ');
      const idsB = (d.duplaB || []).join(', ');
      return {
        label: 'Dupla ' + (idx + 1),
        value: String(idx),
        description: 'A: ' + idsA + ' | B: ' + idsB
      };
    });
    const select = new StringSelectMenuBuilder()
      .setCustomId('modal_camp_placar_dupla_' + partidaId)
      .setPlaceholder('Selecione a dupla para enviar placar')
      .addOptions(opcoes);
    return interaction.update({
      content: 'Selecione qual dupla voce quer enviar placar:',
      embeds: [],
      components: [new ActionRowBuilder().addComponents(select)]
    });
  }
  const modal = new ModalBuilder()
    .setCustomId('modal_camp_placar_' + partidaId)
    .setTitle('Enviar Placar');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('placar_texto')
        .setLabel('Placar (ex: 2x1)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('2x1')
        .setRequired(true)
    )
  );
  return interaction.showModal(modal);
}

async function onSelectDueloPlacar(interaction) {
  const match = interaction.customId.match(/^modal_camp_placar_dupla_([a-f0-9]{24})$/);
  if (!match) return;
  const partidaId = match[1];
  const dueloIndex = Number(interaction.values[0]);
  const modal = new ModalBuilder()
    .setCustomId('modal_camp_placar_dupla_submit_' + partidaId + '_' + dueloIndex)
    .setTitle('Enviar Placar - Dupla ' + (dueloIndex + 1));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('placar_texto')
        .setLabel('Placar (ex: 2x1)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('2x1')
        .setRequired(true)
    )
  );
  return interaction.showModal(modal);
}

async function onSubmitEnviarPlacar(interaction) {
  const match = interaction.customId.match(/^modal_camp_placar_(?:dupla_submit_)?([a-f0-9]{24})(?:_(\d+))?$/);
  if (!match) return;
  const partidaId = match[1];
  const dueloIndex = match[2] ? Number(match[2]) : null;
  const placar = interaction.fields.getTextInputValue('placar_texto');
  if (!placarEhValido(placar)) {
    return interaction.reply({ content: 'Formato de placar invalido. Use "2x1", "3x0" etc.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const meuTime = await Time.findOne({ capitaoId: interaction.user.id });
    if (!meuTime) return interaction.editReply({ content: 'Voce nao e capitao de nenhum time.' });
    const resultado = await enviarPlacar({
      partidaId,
      timeId: meuTime._id,
      userId: interaction.user.id,
      placar,
      dueloIndex
    });
    const partida = await Partida.findById(partidaId);
    const placarEmbed = embedPlacarEnviado({ partida, lado: resultado.lado, placar: resultado.placar, dueloIndex: resultado.dueloIndex });
    return interaction.editReply({ embeds: placarEmbed.embeds, components: toActionRows(placarEmbed.components) });
  } catch (error) {
    if (error instanceof PlacarError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.placar] erro:', error);
    return interaction.editReply({ content: 'Erro ao enviar placar.' });
  }
}

async function onBotaoValidarPlacar(interaction) {
  const partidaId = interaction.customId.replace('btn_camp_validar_placar_', '');
  await interaction.deferReply({ flags: 64 });
  try {
    const meuTime = await Time.findOne({ capitaoId: interaction.user.id });
    if (!meuTime) return interaction.editReply({ content: 'Voce nao e capitao.' });
    const r = await validarPlacar({ partidaId, userId: interaction.user.id, timeId: meuTime._id, aceito: true });
    return interaction.editReply({ content: 'Validacao registrada. Status: ' + r.status, embeds: [], components: [] });
  } catch (error) {
    if (error instanceof PlacarError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.validar] erro:', error);
    return interaction.editReply({ content: 'Erro ao validar.' });
  }
}

async function onBotaoContestarPlacar(interaction) {
  const partidaId = interaction.customId.replace('btn_camp_contestar_placar_', '');
  await interaction.deferReply({ flags: 64 });
  try {
    const meuTime = await Time.findOne({ capitaoId: interaction.user.id });
    if (!meuTime) return interaction.editReply({ content: 'Voce nao e capitao.' });
    const r = await validarPlacar({ partidaId, userId: interaction.user.id, timeId: meuTime._id, aceito: false });
    const partida = await Partida.findById(partidaId);
    return interaction.editReply(embedDisputaOrganizador({
      partida,
      placarA: partida.placarEnviado?.timeA?.placar,
      placarB: partida.placarEnviado?.timeB?.placar
    }));
  } catch (error) {
    if (error instanceof PlacarError) {
      return interaction.editReply({ content: error.message });
    }
    console.error('[campeonato.contestar] erro:', error);
    return interaction.editReply({ content: 'Erro ao contestar.' });
  }
}

async function onBotaoVerClassificacao(interaction) {
  const campeonato = await findCampeonatoPorCanal(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato nao encontrado.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  const r = await calcularClassificacao(campeonato._id);
  return interaction.editReply(embedClassificacao(r));
}

async function onBotaoVerBracket(interaction) {
  const campeonato = await findCampeonatoPorCanal(interaction.channelId);
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato nao encontrado.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  const partidas = await Partida.find({ campeonatoId: campeonato._id, rodada: 1 }).lean();
  const timesIds = partidas.flatMap((p) => [p.timeA, p.timeB]).filter(Boolean);
  const times = await Time.find({ _id: { $in: timesIds } }).lean();
  const timesMap = new Map(times.map((t) => [String(t._id), t]));
  const ordenados = partidas.map((p) => timesMap.get(String(p.timeA))).filter(Boolean);
  return interaction.editReply(embedBracket(ordenados));
}

async function onBotaoFinalizar(interaction) {
  const match = interaction.customId.match(/^btn_camp_finalizar_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID inválido.', flags: 64 });
  const cid = match[1];
  
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  
  await interaction.deferReply({ flags: 64 });
  try {
    const camp = await Campeonato.findById(cid);
    if (!camp) return interaction.editReply({ content: 'Campeonato não encontrado.' });
    const r = await finalizarCampeonato({ campeonatoId: cid });
    await notificarCampeao({
      campeonatoId: cid,
      vencedor: { capitaoId: r.vencedor.id, nome: r.vencedor.nome },
      podio: r.podio
    }).catch(() => null);
    if (camp.canals?.geral) {
      await anunciarNoCanal({
        channelId: camp.canals.geral,
        payload: embedCampeaoDefinido({ vencedor: r.vencedor, podio: r.podio })
      }).catch(() => null);
    }
    return interaction.editReply(embedCampeaoDefinido({ vencedor: r.vencedor, podio: r.podio }));
  } catch (error) {
    if (error instanceof FinalizacaoError) return interaction.editReply({ content: error.message });
    console.error('[campeonato.finalizar] erro:', error);
    return interaction.editReply({ content: 'Erro ao finalizar.' });
  }
}

async function onBotaoCancelar(interaction) {
  const match = interaction.customId.match(/^btn_camp_cancelar_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID inválido.', flags: 64 });
  const cid = match[1];
  
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  
  // Show modal to get reason
  const modal = new ModalBuilder()
    .setCustomId('modal_cancelar_campeonato_' + cid)
    .setTitle('Cancelar Campeonato');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('motivo_cancelamento')
        .setLabel('Motivo do cancelamento (opcional)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(false)
    )
  );
  return interaction.showModal(modal);
}

async function onSubmitCancelarCampeonato(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Sem permissao.', flags: 64 });
  }
  const match = interaction.customId.match(/^modal_cancelar_campeonato_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID inválido.', flags: 64 });
  const cid = match[1];
  const motivo = interaction.fields.getTextInputValue('motivo_cancelamento')?.trim() || 'Cancelado por organizador.';
  
  await interaction.deferReply({ flags: 64 });
  try {
    await cancelarCampeonato({ campeonatoId: cid, executadoPor: interaction.user.id });
    return interaction.editReply(embedCancelamentoConfirmado({ motivo }));
  } catch (error) {
    if (error instanceof AdminError) return interaction.editReply({ content: error.message });
    console.error('[campeonato.cancelar] erro:', error);
    return interaction.editReply({ content: 'Erro ao cancelar.' });
  }
}

async function onBotaoReabrir(interaction) {
  const match = interaction.customId.match(/^btn_camp_reabrir_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID inválido.', flags: 64 });
  const cid = match[1];
  
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  
  await interaction.deferReply({ flags: 64 });
  try {
    await reabrirCampeonato({ campeonatoId: cid, executadoPor: interaction.user.id });
    return interaction.editReply(embedReaberturaConfirmada());
  } catch (error) {
    if (error instanceof AdminError) return interaction.editReply({ content: error.message });
    console.error('[campeonato.reabrir] erro:', error);
    return interaction.editReply({ content: 'Erro ao reabrir.' });
  }
}

async function onSubmitDesclassificar(interaction) {
  const tid = interaction.customId.replace('modal_camp_desclassificar_', '');
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  const motivo = interaction.fields.getTextInputValue('motivo') || null;
  try {
    const r = await desclassificarTime({ timeId: tid, motivo, executadoPor: interaction.user.id });
    const time = await Time.findById(tid).lean();
    return interaction.editReply(embedTimeDesclassificado({ time, partidasAnuladas: r.partidasAnuladas }));
  } catch (error) {
    if (error instanceof AdminError) return interaction.editReply({ content: error.message });
    return interaction.editReply({ content: 'Erro ao desclassificar.' });
  }
}

async function onCancelarCriarEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  selecaoRanks.delete(`camp:selecao:${interaction.user.id}`);
  return interaction.update({ content: 'Criacao cancelada.', embeds: [], components: [] });
}

async function atualizarPainelOrganizador(interaction, campeonato, secao, payload) {
  await interaction.deferUpdate();
  let messageId = campeonato.painelOrganizador?.mensagens?.[secao]
    || campeonato.painelOrganizador?.dinamicaMessageId;
  let mensagem = messageId
    ? await interaction.channel.messages.fetch(messageId).catch(() => null)
    : null;

  if (!mensagem) {
    mensagem = await interaction.channel.send(payload);
    await Campeonato.updateOne(
      { _id: campeonato._id },
      { $set: {
        [`painelOrganizador.mensagens.${secao}`]: mensagem.id,
        'painelOrganizador.dinamicaMessageId': mensagem.id
      } }
    );
    return mensagem;
  }

  return mensagem.edit(payload);
}

async function onPainelOrganizadorTab(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const tab = interaction.values[0];
  const campeonato = await Campeonato.findOne({
    $or: [
      { 'canais.inscricoes': interaction.channelId },
      { 'canais.partidas': interaction.channelId },
      { 'canais.prints': interaction.channelId },
      { 'canais.organizador': interaction.channelId },
      { 'canais.avisos': interaction.channelId }
    ]
  }).lean();
  if (!campeonato) {
    return interaction.update({ content: 'Canal não pertence a nenhum campeonato.', embeds: [], components: [] });
  }
  switch (tab) {
    case 'inscritos': {
      const inscritos = await listarInscricoes(campeonato._id);
      const isSingle = ['single', '1v1', 'x1', '1x1'].includes(String(campeonato.modalidade || 'single').toLowerCase());
      const isFixa = campeonato.tipoDupla === 'FIXA';
      const totalInscritos = inscritos.length;
      const limite = campeonato.limiteInscricoes;
      const lotado = campeonato.status === 'INSCRICOES_FECHADAS' && campeonato.limiteInscricoes && totalInscritos >= campeonato.limiteInscricoes;
      const footerText = lotado ? '🔒 LOTADO' : (limite ? `Inscritos: ${totalInscritos}/${limite}` : `Total: ${totalInscritos} time(s)`);

      const formatarTelefone = (tel) => {
        if (!tel) return '—';
        const digits = String(tel).replace(/\D/g, '');
        if (digits.length <= 2) return digits;
        if (digits.length <= 7) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
        return `${digits.slice(0, 2)} ${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
      };

      const mencionar = (j) => {
        if (j.origem === 'WHATSAPP' || String(j.userId || '').startsWith('MANUAL_WHATSAPP_')) {
          return j.nickSnapshot || '—';
        }
        return `<@${j.userId}>`;
      };

      const linhas = inscritos.map((t, i) => {
        const jogadores = t.jogadores || [];
        const totalJogs = jogadores.length;

        if (isSingle && totalJogs === 1) {
          const j = jogadores[0];
          return `${i + 1}. Nick: ${j.nickSnapshot || '—'} | Nome: ${j.nome || '—'} | WhatsApp: ${formatarTelefone(j.telefone)}`;
        }

        if (isFixa) {
          const jogadoresStr = jogadores.map(mencionar).join(' / ') || 'Sem jogadores';
          const sufixo = totalJogs <= 1 ? '' : ` (${totalJogs} jogadores)`;
          return `${i + 1}. **${t.nome || 'Sem nome'}**${sufixo}: ${jogadoresStr}`;
        }

        const capitao = jogadores[0];
        const capitaoStr = capitao ? mencionar(capitao) : 'Sem capitão';
        const tel = capitao ? formatarTelefone(capitao.telefone) : '—';
        return `${i + 1}. **${t.nome || 'Sem nome'}** | Nick: ${capitao?.nickSnapshot || '—'} | Nome: ${capitao?.nome || '—'} | WhatsApp: ${tel}`;
      }).join('\n') || 'Nenhum inscrito.';
      return atualizarPainelOrganizador(interaction, campeonato, 'inscritos', {
        embeds: [{
          title: '📋 ABA 1 - INSCRITOS',
          description: linhas,
          color: 0x00C2FF,
          footer: { text: footerText }
        }],
        components: []
      });
    }
    case 'times': {
      const times = await Time.find({ campeonatoId: campeonato._id }).lean();
      const linhas = times.map((t, i) => {
        const jogadores = (t.jogadores || []).map(j => {
          if (j.origem === 'WHATSAPP' || String(j.userId || '').startsWith('MANUAL_WHATSAPP_')) {
            return j.nickSnapshot || '—';
          }
          return `<@${j.userId}>`;
        }).join(', ') || 'Sem jogadores';
        return `${i + 1}. **${t.nome || 'Sem nome'}** — ${jogadores}`;
      }).join('\n') || 'Nenhum time definido.';
      
      // Select menu for team actions
      const opcoesTimes = times.slice(0, 25).map(t => ({
        label: t.nome || 'Sem nome',
        value: String(t._id),
        description: `${t.jogadores?.length || 0} jogador(es)`
      }));
      
      const components = [];
      if (opcoesTimes.length > 0) {
        components.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('select_camp_time_acao_' + campeonato._id)
              .setPlaceholder('Selecione um time para gerenciar')
              .addOptions(opcoesTimes)
          )
        );
      }
      
      return atualizarPainelOrganizador(interaction, campeonato, 'times', {
        embeds: [{
          title: '👥 ABA 2 - TIMES DEFINIDOS',
          description: linhas,
          color: 0x00FF00,
          footer: { text: `Total: ${times.length} time(s)` }
        }],
        components: components
      });
    }
    case 'partidas': {
      const partidas = await Partida.find({
        campeonatoId: campeonato._id,
        status: { $nin: ['FINALIZADA', 'CANCELADA', 'WO'] }
      }).lean();
      const timesIds = partidas.flatMap((p) => [p.timeA, p.timeB]).filter(Boolean);
      const times = await Time.find({ _id: { $in: timesIds } }).lean();
      const timesMap = new Map(times.map((t) => [String(t._id), t.nome]));
      const linhas = partidas.map((p, i) => {
        const nomeA = timesMap.get(String(p.timeA)) || 'TBD';
        const nomeB = timesMap.get(String(p.timeB)) || 'TBD';
        return `${i + 1}. **R${p.rodada || 1}** ${p.fase || ''} — **${nomeA}** vs **${nomeB}** — Status: ${p.status}`;
      }).join('\n') || 'Nenhuma partida em andamento.';
      return atualizarPainelOrganizador(interaction, campeonato, 'partidas', {
        embeds: [{
          title: '🎮 ABA 3 - PARTIDAS AO VIVO',
          description: linhas,
          color: 0xFFA500,
          footer: { text: `Total: ${partidas.length} partida(s)` }
        }],
        components: []
      });
    }
    case 'checkin': {
      const partidas = await Partida.find({
        campeonatoId: campeonato._id,
        status: { $nin: ['FINALIZADA', 'CANCELADA', 'WO'] }
      }).lean();
      const timesIds = partidas.flatMap((p) => [p.timeA, p.timeB]).filter(Boolean);
      const times = await Time.find({ _id: { $in: timesIds } }).lean();
      const timesMap = new Map(times.map((t) => [String(t._id), t.nome || 'Sem nome']));
      const opcoesCheckin = partidas.flatMap((p) => [
        !p.checkIns?.timeA?.fez ? { label: `${timesMap.get(String(p.timeA)) || 'TBD'} - confirmar`, value: `${p._id}:A` } : null,
        !p.checkIns?.timeB?.fez ? { label: `${timesMap.get(String(p.timeB)) || 'TBD'} - confirmar`, value: `${p._id}:B` } : null
      ]).filter(Boolean).slice(0, 25);
      const linhas = partidas.map((p, i) => {
        const checkA = p.checkIns?.timeA?.fez ? '✅' : '⏳';
        const checkB = p.checkIns?.timeB?.fez ? '✅' : '⏳';
        const status = p.status === 'AGUARDANDO_PLACAR' ? 'EM ANDAMENTO' : p.status;
        return `${i + 1}. **${timesMap.get(String(p.timeA)) || 'TBD'}** ${checkA} vs **${timesMap.get(String(p.timeB)) || 'TBD'}** ${checkB} — ${status}`;
      }).join('\n') || 'Nenhuma partida aguardando check-in.';
      return atualizarPainelOrganizador(interaction, campeonato, 'checkin', {
        embeds: [{
          title: '✅ ABA 3 - CHECK-IN',
          description: linhas,
          color: 0x00C2FF,
          footer: { text: 'Quando os dois times confirmam, a partida fica EM ANDAMENTO.' }
        }],
        components: opcoesCheckin.length
          ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_camp_checkin_manual').setPlaceholder('Registrar check-in manual').addOptions(opcoesCheckin))]
          : []
      });
    }
    case 'gestao': {
      const adminEmbed = embedPainelAdmin(campeonato);
      const components = campeonato.status === 'CANCELADO'
        ? [[
            { type: 2, style: 1, label: '♻️ Reabrir', custom_id: 'btn_camp_reabrir_' + campeonato._id, emoji: { name: '♻️' } }
          ]]
        : adminEmbed.components;
      return atualizarPainelOrganizador(interaction, campeonato, 'gestao', {
        embeds: adminEmbed.embeds,
        components: toActionRows(components)
      });
    }
    default:
      return atualizarPainelOrganizador(interaction, campeonato, 'gestao', { embeds: [{ title: '❓ Aba desconhecida', color: 0xFF0000 }], components: [] });
  }
}

async function onConfigSelect(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const customId = interaction.customId;
  const valor = interaction.values[0];
  const selecao = selecaoRanks.get(`camp:selecao:${interaction.user.id}`);
  if (!selecao) {
    return interaction.update({ content: 'Sessao expirou. Clique em Criar Evento de novo.', embeds: [], components: [] });
  }
  if (customId === 'modal_config_modo') {
    selecao.modo = valor;
    selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
    if (selecao.modo === '1v1') {
      selecao.tipoDupla = null;
      selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
      const ranksEmbed = embedSelecionarRanks({
        nome: selecao.nome,
        dataInicio: selecao.dataInicio,
        dataFim: selecao.dataFim,
        ranksSelecionados: selecao.ranksSelecionados
      });
      return interaction.update({
        content: 'Modo 1v1 selecionado. Selecione os **ranks** do campeonato:',
        embeds: ranksEmbed.embeds,
        components: toActionRows(ranksEmbed.components)
      });
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId('modal_config_tipo_dupla')
      .setPlaceholder('Tipo de dupla')
      .addOptions([
        { label: 'SORTEADA', value: 'SORTEADA', description: 'Duplas serão sorteadas' },
        { label: 'FIXA', value: 'FIXA', description: 'Duplas fixas' }
      ]);
    return interaction.update({
      content: 'Escolha o **tipo de dupla**:',
      embeds: [],
      components: [new ActionRowBuilder().addComponents(select)]
    });
  }
  if (customId === 'modal_config_tipo_dupla') {
    selecao.tipoDupla = valor;
    selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
    const ranksEmbed = embedSelecionarRanks({
      nome: selecao.nome,
      dataInicio: selecao.dataInicio,
      dataFim: selecao.dataFim,
      ranksSelecionados: selecao.ranksSelecionados
    });
    return interaction.update({
      content: 'Selecione os **ranks** do campeonato:',
      embeds: ranksEmbed.embeds,
      components: toActionRows(ranksEmbed.components)
    });
  }
  if (customId === 'modal_config_baseado') {
    selecao.baseadoEmInscricoes = valor === 'SIM';
    selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
    if (selecao.baseadoEmInscricoes) {
      const [horaInicio, minutoInicio] = (selecao.horarioInicio || '19:00').split(':').map(Number);
      const inicioDate = new Date(selecao.dataInicio);
      const terminoDate = new Date(inicioDate);
      terminoDate.setHours(horaInicio + 3, minutoInicio, 0, 0);
      const duracaoMin = selecao.duracaoMin || 180;
      const preview = gerarDescricaoEvento({
        dataInicio: selecao.dataInicio,
        duracaoMin,
        numTimes: 0,
        modo: selecao.modo || 'simples',
        simultaneo: true,
        horarioInicio: selecao.horarioInicio
      });
      const embed = {
        title: '📋 Confira os dados do evento',
        description: '**Nome:** ' + selecao.nome + '\n' +
          '**Data de início:** ' + new Date(selecao.dataInicio).toLocaleDateString('pt-BR') + '\n' +
          '**Horário:** ' + (selecao.horarioInicio || '19:00') + ' às ' + String(terminoDate.getHours()).padStart(2, '0') + ':' + String(terminoDate.getMinutes()).padStart(2, '0') + '\n' +
          '**Modo:** ' + selecao.modo + '\n' +
          '**Tipo Dupla:** ' + (selecao.tipoDupla || '—') + '\n' +
          '**Baseado em Inscrições:** SIM\n' +
          '**Ranks:** ' + (selecao.ranksSelecionados.length ? selecao.ranksSelecionados.map((r) => r.toUpperCase()).join(', ') : '—') + '\n' +
          '**3º Lugar:** SIM (padrão)\n\n' +
          '**Previsão:** ' + preview.horaInicio + ' às ' + preview.horaFim + '\n' +
          preview.descricao,
        color: 0xFF6B00
      };
      const components = [[
        { type: 2, style: 3, label: '✅ Confirmar e Criar Evento', custom_id: 'btn_camp_confirmar_criacao', emoji: { name: '✅' } },
        { type: 2, style: 4, label: '❌ Cancelar', custom_id: 'btn_camp_cancelar_criacao', emoji: { name: '❌' } }
      ]];
      return interaction.update({
        content: 'Confira os dados do evento antes de criar:',
        embeds: [embed],
        components: toActionRows(components)
      });
    }
    const modalidade = new StringSelectMenuBuilder()
      .setCustomId('modal_config_modalidade')
      .setPlaceholder('Escolha a modalidade do campeonato')
      .addOptions([
        { label: 'Single', value: 'single', description: 'Eliminatória simples' },
        { label: 'Double', value: 'double', description: 'Eliminatória dupla' },
        { label: 'Round Robin', value: 'round-robin', description: 'Todos contra todos' },
        { label: 'Grupos + Mata-mata', value: 'grupos-mata-mata', description: 'Fase de grupos e eliminatória' }
      ]);
    return interaction.update({
      content: 'Escolha a modalidade do campeonato:',
      embeds: [],
      components: [new ActionRowBuilder().addComponents(modalidade)]
    });
  }
  if (customId === 'modal_config_modalidade') {
    selecao.modalidade = valor;
    selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
    const modal = new ModalBuilder().setCustomId('modal_config_limite').setTitle('Limite de participantes');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('limite_inscricoes')
         .setLabel('Limite (4, 8, 16, 32, 64 ou 128)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ));
    return interaction.showModal(modal);
  }
  return interaction.update({ content: 'Opção inválida.', embeds: [], components: [] });
}

async function onSubmitLimite(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  const selecao = selecaoRanks.get(`camp:selecao:${interaction.user.id}`);
  if (!selecao) return interaction.reply({ content: 'Sessao expirou. Clique em Criar Evento de novo.', flags: 64 });
  const limite = Number(interaction.fields.getTextInputValue('limite_inscricoes').trim());
  const ehPotencia2 = Number.isInteger(limite) && limite > 0 && (limite & (limite - 1)) === 0;
  if (!ehPotencia2 || limite < 4) {
    return interaction.reply({ content: 'Limite inválido. Escolha 4, 8, 16, 32, 64 ou 128.', flags: 64 });
  }
  selecao.limiteInscricoes = limite;
  selecaoRanks.set(`camp:selecao:${interaction.user.id}`, selecao);
  const fim = new Date(selecao.dataInicio);
  fim.setHours(fim.getHours() + 3);
  return interaction.update({
    content: `Confira: **${selecao.nome}** | ${selecao.modo} | ${selecao.modalidade} | limite ${limite} | ranks ${selecao.ranksSelecionados.join(', ')}`,
    components: toActionRows([[
      { type: 2, style: 3, label: '✅ Confirmar e Criar Evento', custom_id: 'btn_camp_confirmar_criacao' },
      { type: 2, style: 4, label: '❌ Cancelar', custom_id: 'btn_camp_cancelar_criacao' }
    ]])
  });
}

async function onSelectTimeAcao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const campeonatoId = interaction.customId.replace('select_camp_time_acao_', '');
  const timeId = interaction.values[0];
  const time = await Time.findById(timeId).lean();
  if (!time) {
    return interaction.update({ content: 'Time nao encontrado.', embeds: [], components: [] });
  }
  const jogadores = time.jogadores || [];
  const opcoesJogadores = jogadores.map(j => ({
    label: j.nickSnapshot || j.nome || 'Sem nome',
    value: String(j.userId),
    description: j.origem === 'WHATSAPP' ? 'WhatsApp' : 'Discord'
  }));
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_camp_excluir_time_' + campeonatoId)
        .setLabel('🗑️ Excluir Time')
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_camp_jogador_excluir_' + campeonatoId)
        .setPlaceholder('Selecione jogador para excluir')
        .addOptions(opcoesJogadores)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_camp_excluir_jogador_' + campeonatoId)
        .setLabel('👤 Excluir Jogador')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_camp_jogador_capitao_' + campeonatoId)
        .setPlaceholder('Selecione novo capitão')
        .addOptions(opcoesJogadores)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_camp_trocar_capitao_' + campeonatoId)
        .setLabel('👑 Trocar Capitão')
        .setStyle(ButtonStyle.Primary)
    )
  ];
  return interaction.update({
    content: `Gerenciando time: **${time.nome || 'Sem nome'}**`,
    embeds: [],
    components: components
  });
}

async function onExcluirTime(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Sem permissao.', flags: 64 });
  }
  const campeonatoId = interaction.customId.replace('btn_camp_excluir_time_', '');
  const time = await Time.findOneAndDelete({ campeonatoId });
  if (!time) {
    return safeReply(interaction, { content: 'Time nao encontrado.', flags: 64 });
  }
  console.log('[Time] excluido', time._id, 'campeonatoId', campeonatoId);
  // Atualizar painel
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  const { atualizarPainelOrganizador } = require('./services/painel');
  const canalOrgao = campeonato?.canais?.organizador;
  if (canalOrgao) {
    try {
      const canal = await interaction.guild.channels.fetch(canalOrgao);
      if (canal) await atualizarPainelOrganizador(canal, campeonato, 'times');
    } catch (e) {}
  }
  return safeReply(interaction, { content: `Time **${time.nome || 'Sem nome'}** excluido.`, flags: 64 });
}

async function onConfigDados(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  return interaction.showModal(buildConfigModal());
}

async function onConfigModo(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) {
    return interaction.update({ content: 'Sessão expirada.', embeds: [], components: [] });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('select_config_modo')
    .setPlaceholder('Escolha o modo de jogo')
    .addOptions([
      { label: 'Duelos (x1)', value: '1v1', description: 'Individual' },
      { label: 'Duplas (x2)', value: '2v2', description: 'Duplas fixas' },
      { label: 'Triplas (x3)', value: '3v3', description: 'Padrão' },
      { label: 'Quartetos (x4, duplas intercaladas)', value: '4v4', description: '4 jogadores, duplas intercaladas' },
      { label: 'Sextetos (x6, duplas intercaladas)', value: '6v6', description: '6 jogadores, duplas intercaladas' },
      { label: 'Octetos (x8, duplas intercaladas)', value: '8v8', description: '8 jogadores, duplas intercaladas' }
    ]);

  return interaction.update({
    content: 'Escolha o **modo de jogo**:',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function onSelectConfigModo(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) {
    return interaction.update({ content: 'Sessão expirada.', embeds: [], components: [] });
  }
  cfg.modo = interaction.values[0];
  configPainel.set(`camp:config:${userId}`, cfg);
  return interaction.update(buildConfigPanel(userId));
}

async function onConfigEntrada(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg || !cfg.modo) {
    return interaction.update({ content: 'Escolha o modo primeiro.', embeds: [], components: [] });
  }

  const buttons = [
    { type: 2, style: 3, label: 'Inscrição aberta', emoji: { name: '📝' }, custom_id: 'btn_config_entrada_aberta' },
    { type: 2, style: 2, label: 'Eu escolho os participantes', emoji: { name: '🔧' }, custom_id: 'btn_config_entrada_manual' },
    { type: 2, style: 4, label: 'Voltar', emoji: { name: '⬅️' }, custom_id: 'btn_config_entrada_voltar' }
  ];

  return interaction.update({
    content: 'Como os participantes entram?',
    embeds: [],
    components: [toActionRows([buttons])]
  });
}

async function onConfigEntradaEscolha(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) {
    return interaction.update({ content: 'Sessão expirada.', embeds: [], components: [] });
  }
  
  const customId = interaction.customId;
  if (customId === 'btn_config_entrada_aberta') {
    cfg.baseadoEmInscricoes = true;
    cfg.formato = null;
    cfg.participantes = [];
  } else if (customId === 'btn_config_entrada_manual') {
    cfg.baseadoEmInscricoes = false;
  } else if (customId === 'btn_config_entrada_voltar') {
    return interaction.update(buildConfigPanel(userId));
  }
  configPainel.set(`camp:config:${userId}`, cfg);
  return interaction.update(buildConfigPanel(userId));
}

async function onConfigFormato(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg || cfg.baseadoEmInscricoes !== false) {
    return interaction.update({ content: 'Disponível apenas quando "Eu escolho os participantes".', embeds: [], components: [] });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('select_config_formato')
    .setPlaceholder('Escolha o formato do campeonato')
    .addOptions([
      { label: 'Eliminatória Simples', value: 'single', description: 'Chave única, perde uma vez e sai' },
      { label: 'Eliminatória Dupla', value: 'double', description: 'Duas chances, loser bracket' },
      { label: 'Grupos + Mata-mata', value: 'grupos-mata-mata', description: 'Fase de grupos e eliminatória' },
      { label: 'Round Robin (Todos contra todos)', value: 'round-robin', description: 'Todos jogam contra todos' }
    ]);

  return interaction.update({
    content: 'Escolha o **formato**:',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function onSelectConfigFormato(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) {
    return interaction.update({ content: 'Sessão expirada.', embeds: [], components: [] });
  }
  cfg.formato = interaction.values[0];
  configPainel.set(`camp:config:${userId}`, cfg);
  return interaction.update(buildConfigPanel(userId));
}

async function onConfigParticipantes(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg || cfg.baseadoEmInscricoes !== false) {
    return interaction.update({ content: 'Disponível apenas quando "Eu escolho os participantes".', embeds: [], components: [] });
  }

  // Show current participants + add button
  const lines = cfg.participantes.map((p, i) => 
    `${i + 1}. ${p.nome || '—'} (${p.tipo === 'time' ? 'Time' : 'Jogador'})`
  ).join('\n') || '_Nenhum participante_';

  const buttons = [
    { type: 2, style: 3, label: 'Adicionar Participante', emoji: { name: '➕' }, custom_id: 'btn_config_participante_add' },
    { type: 2, style: 4, label: 'Voltar', emoji: { name: '⬅️' }, custom_id: 'btn_config_participantes_voltar' }
  ];

  return interaction.update({
    content: `**Participantes (${cfg.participantes.length})**\n${lines}`,
    embeds: [],
    components: [toActionRows([buttons])]
  });
}

async function onConfigParticipanteAdd(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg || !cfg.modo) {
    return interaction.update({ content: 'Configuração incompleta.', embeds: [], components: [] });
  }

  const isSolo = cfg.modo === '1v1';
  const modal = new ModalBuilder()
    .setCustomId('modal_config_participante')
    .setTitle(isSolo ? 'Adicionar Jogador' : 'Adicionar Time');
  
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('part_nome')
        .setLabel(isSolo ? 'Nick do Jogador' : 'Nome do Time')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
    )
  );

  // Note: UserSelect can't be in modal. We'll use a follow-up select.
  interaction.client._pendingParticipante = { isSolo, cfg };
  return interaction.showModal(modal);
}

async function onSubmitConfigParticipante(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Sem permissao.', flags: 64 });
  }
  const userId = interaction.user.id;
  const pending = interaction.client._pendingParticipante;
  if (!pending || !pending.cfg) {
    return interaction.reply({ content: 'Erro: sessão perdida. Tente novamente.', flags: 64 });
  }
  
  const nome = interaction.fields.getTextInputValue('part_nome').trim();
  const isSolo = pending.isSolo;
  pending.cfg.participantes.push({ 
    nome, 
    tipo: isSolo ? 'jogador' : 'time',
    // Will add capitão/jogadores via follow-up select
  });
  configPainel.set(`camp:config:${userId}`, pending.cfg);
  delete interaction.client._pendingParticipante;
  
  return interaction.update(buildConfigPanel(userId));
}

async function onConfigCriar(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg || !isConfigComplete(cfg)) {
    return interaction.update({ content: 'Configuração incompleta.', embeds: [], components: [] });
  }

  // Create the campeonato using existing service
  await interaction.deferUpdate();
  
  try {
    const { criarEvento } = require('./service');
    const guild = interaction.guild;
    
    const evento = await criarEvento(guild, {
      nome: cfg.nome,
      ranksSelecionados: ['ouro'], // TODO: use selected ranks from existing system
      dataInicio: cfg.dataInicio,
      dataFim: cfg.dataInicio,
      dataLimiteInscricoes: cfg.dataLimiteInscricoes,
      organizadorId: interaction.user.id,
      modo: cfg.modo,
      tipoDupla: cfg.modo.startsWith('4v') || cfg.modo.startsWith('6v') || cfg.modo.startsWith('8v') ? 'MESCLADA' : 'FIXA',
      baseadoEmInscricoes: cfg.baseadoEmInscricoes,
      limiteInscricoes: cfg.limiteInscricoes,
      modalidade: cfg.formato,
      temTerceiroLugar: true,
      intervaloPartidasMin: 20
    });

    configPainel.delete(`camp:config:${userId}`);

    const canalOrgao = evento.campeonatos[0]?.canais?.organizador;
    return interaction.editReply({
      content: `✅ Campeonato **${cfg.nome}** criado!\nPainel de controle: <#${canalOrgao}>`,
      embeds: [],
      components: []
    });
  } catch (e) {
    console.error('[ConfigCriar] erro:', e);
    return interaction.editReply({ content: 'Erro ao criar campeonato: ' + e.message, embeds: [], components: [] });
  }
}

async function onConfigCancelar(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  configPainel.delete(`camp:config:${interaction.user.id}`);
  return interaction.update({ content: 'Criação cancelada.', embeds: [], components: [] });
}

async function onSelectJogadorExcluir(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  // Store selected player for next button
  interaction.client._selectedJogadorExcluir = interaction.values[0];
  return interaction.update({ content: 'Jogador selecionado. Clique em Excluir Jogador para confirmar.', embeds: [], components: [] });
}

async function onExcluirJogador(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Sem permissao.', flags: 64 });
  }
  const campeonatoId = interaction.customId.replace('btn_camp_excluir_jogador_', '');
  const jogadorId = interaction.client._selectedJogadorExcluir;
  if (!jogadorId) {
    return safeReply(interaction, { content: 'Nenhum jogador selecionado.', flags: 64 });
  }
  const time = await Time.findOneAndUpdate(
    { campeonatoId, 'jogadores.userId': jogadorId },
    { $pull: { jogadores: { userId: jogadorId } } },
    { new: true }
  );
  if (!time) {
    return safeReply(interaction, { content: 'Jogador nao encontrado no time.', flags: 64 });
  }
  // If 1x1 and no players left, delete the team
  const modo = (await Campeonato.findById(campeonatoId).lean())?.modo || '1v1';
  if (['1v1', '2v2'].includes(modo) && time.jogadores.length === 0) {
    await Time.findByIdAndDelete(time._id);
    console.log('[Time] excluido por ficar vazio apos remover jogador', time._id);
  }
  console.log('[Jogador] excluido', jogadorId, 'do time', time._id);
  return safeReply(interaction, { content: 'Jogador excluido do time.', flags: 64 });
}

async function onSelectJogadorCapitao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  interaction.client._selectedJogadorCapitao = interaction.values[0];
  return interaction.update({ content: 'Novo capitão selecionado. Clique em Trocar Capitão para confirmar.', embeds: [], components: [] });
}

async function onTrocarCapitao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Sem permissao.', flags: 64 });
  }
  const campeonatoId = interaction.customId.replace('btn_camp_trocar_capitao_', '');
  const novoCapitaoId = interaction.client._selectedJogadorCapitao;
  if (!novoCapitaoId) {
    return safeReply(interaction, { content: 'Nenhum jogador selecionado.', flags: 64 });
  }
  const time = await Time.findOneAndUpdate(
    { campeonatoId },
    { $set: { capitaoId: novoCapitaoId } },
    { new: true }
  );
  if (!time) {
    return safeReply(interaction, { content: 'Time nao encontrado.', flags: 64 });
  }
  console.log('[Capitao] trocado para', novoCapitaoId, 'no time', time._id);
  return safeReply(interaction, { content: 'Capitão trocado com sucesso.', flags: 64 });
}

function register(registry) {
  registry.button('btn_campeonato_criar', onAbrirPainelCriacao);
  registry.button('btn_novo_campeonato', onAbrirPainelCriacao);
  // FLUXO 2 - Config panel
  registry.modal('modal_config_campeonato_dados', onSubmitConfigDados);
  registry.button('btn_config_dados', onConfigDados);
  registry.button('btn_config_modo', onConfigModo);
  registry.select('select_config_modo', onSelectConfigModo);
  registry.button('btn_config_entrada', onConfigEntrada);
  registry.button('btn_config_entrada_aberta', onConfigEntradaEscolha);
  registry.button('btn_config_entrada_manual', onConfigEntradaEscolha);
  registry.button('btn_config_entrada_voltar', onConfigEntradaEscolha);
  registry.button('btn_config_formato', onConfigFormato);
  registry.select('select_config_formato', onSelectConfigFormato);
  registry.button('btn_config_participantes', onConfigParticipantes);
  registry.button('btn_config_participante_add', onConfigParticipanteAdd);
  registry.modal('modal_config_participante', onSubmitConfigParticipante);
  registry.button('btn_config_participantes_voltar', onConfigParticipantes);
  registry.button('btn_config_criar', onConfigCriar);
  registry.button('btn_config_cancelar', onConfigCancelar);
  registry.button(/^btn_camp_rank_toggle_(bronze|prata|ouro|platina|diamante|champion|grand_champion|omega_champion)$/, onToggleRank);
  registry.button('btn_camp_rank_confirmar', onConfirmarRanks);
  registry.modal('modal_criar_evento', onSubmitCriarEvento);
  registry.button('btn_camp_inscrever', onBotaoInscrever);
  registry.button('btn_camp_inscricao_manual', onBotaoInscricaoManual);
  registry.button('btn_camp_selecionar_capitao', onBotaoSelecionarCapitao);
  registry.modal('modal_camp_inscricao', onSubmitInscricao);
  registry.modal('modal_camp_inscricao_manual', onSubmitInscricaoManual);
  registry.select('select_excluir_campeonato', onSelectExcluirCampeonato);
  registry.button(/^btn_confirmar_exclusao_\d+:\d+$/, onConfirmarExclusao);
  registry.button(/^btn_cancelar_exclusao_\d+:\d+$/, onCancelarExclusao);
  registry.modal(/^modal_camp_capitao_[0-9]+$/, onSubmitCapitao);
  registry.select('select_camp_capitao', onSelectCapitao);
  registry.select('select_camp_checkin_manual', onSelectCheckInOrganizador);
  // FLUXO 3 - Gestão (new patterns)
  registry.button(/^btn_encerrar_inscricoes_[a-f0-9]{24}$/, onBotaoFecharInscricoes);
  registry.button(/^btn_camp_fechar_inscricoes_[a-f0-9]{24}$/, onBotaoFecharInscricoes); // legacy
  registry.button(/^btn_gerenciar_participantes_[a-f0-9]{24}$/, onGerenciarTimes);
  registry.button(/^btn_camp_gerenciar_times_[a-f0-9]{24}$/, onGerenciarTimes); // legacy
  registry.button('btn_camp_cortar', onBotaoCortar);
  registry.button(/^btn_camp_formato_(round-robin|grupos-mata-mata|double-elimination|single-elimination)_[a-f0-9]{24}$/, onEscolherFormato);
  registry.button(/^btn_camp_definir_formato_[a-f0-9]{24}$/, onDefinirFormato);
  registry.select(/^modal_camp_definir_formato_select_[a-f0-9]{24}$/, onDefinirFormatoSelect);
  registry.button(/^btn_definir_formato_[a-f0-9]{24}$/, onDefinirFormato);
  registry.select(/^select_definir_formato_[a-f0-9]{24}$/, onDefinirFormatoSelect);
  registry.button('btn_camp_gerar_bracket', onBotaoGerarBracket);
  registry.button(/^btn_camp_gerar_bracket_[a-f0-9]{24}$/, onBotaoGerarBracket);
  registry.button(/^btn_gerar_bracket_[a-f0-9]{24}$/, onBotaoGerarBracket);
  registry.button(/^btn_confirmar_gerar_bracket_[a-f0-9]{24}$/, onConfirmarGerarBracket);
  registry.button(/^btn_cancelar_gerar_bracket_[a-f0-9]{24}$/, onCancelarGerarBracket);
  registry.button(/^btn_camp_checkin_[a-f0-9]{24}$/, onBotaoCheckIn);
  registry.button(/^btn_camp_adversario_faltou_[a-f0-9]{24}$/, onBotaoAdversarioFaltou);
  registry.button(/^btn_confirmar_wo_[a-f0-9]{24}$/, onConfirmarWO);
  registry.button(/^btn_negar_wo_[a-f0-9]{24}$/, onNegarWO);
  registry.button(/^btn_camp_enviar_placar_[a-f0-9]{24}$/, onBotaoEnviarPlacar);
  registry.select(/^modal_camp_placar_dupla_[a-f0-9]{24}$/, onSelectDueloPlacar);
  registry.modal(/^modal_camp_placar_(?:dupla_submit_)?[a-f0-9]{24}(?:_\d+)?$/, onSubmitEnviarPlacar);
  registry.button(/^btn_camp_validar_placar_[a-f0-9]{24}$/, onBotaoValidarPlacar);
  registry.button(/^btn_camp_contestar_placar_[a-f0-9]{24}$/, onBotaoContestarPlacar);
  registry.button('btn_camp_ver_classificacao', onBotaoVerClassificacao);
  registry.button('btn_camp_ver_bracket', onBotaoVerBracket);
  registry.button('btn_camp_broadcast', onBotaoBroadcast);
  registry.modal('modal_camp_broadcast', onSubmitBroadcast);
  registry.button(/^btn_camp_finalizar_[a-f0-9]{24}$/, onBotaoFinalizar);
  registry.button(/^btn_camp_cancelar_[a-f0-9]{24}$/, onBotaoCancelar);
  registry.modal(/^modal_cancelar_campeonato_[a-f0-9]{24}$/, onSubmitCancelarCampeonato);
  registry.button(/^btn_camp_reabrir_[a-f0-9]{24}$/, onBotaoReabrir);
  registry.button(/^btn_camp_reabrir_[a-f0-9]{24}$/, onBotaoReabrir);
  registry.modal(/^modal_camp_desclassificar_[a-f0-9]{24}$/, onSubmitDesclassificar);
  registry.select(/^modal_config_(modo|tipo_dupla|baseado)$/, onConfigSelect);
  registry.select('modal_config_modalidade', onConfigSelect);
  registry.modal('modal_config_limite', onSubmitLimite);
  registry.button('btn_camp_confirmar_criacao', onConfirmarCriacao);
  registry.button('btn_camp_cancelar_criacao', onCancelarCriacao);
  registry.select('painel_org_tab', onPainelOrganizadorTab);
  registry.select(/^select_camp_time_acao_[a-f0-9]{24}$/, onSelectTimeAcao);
  registry.button(/^btn_camp_excluir_time_[a-f0-9]{24}$/, onExcluirTime);
  registry.button(/^btn_camp_excluir_jogador_[a-f0-9]{24}$/, onExcluirJogador);
  registry.button(/^btn_camp_trocar_capitao_[a-f0-9]{24}$/, onTrocarCapitao);
  registry.select(/^select_camp_jogador_excluir_[a-f0-9]{24}$/, onSelectJogadorExcluir);
  registry.select(/^select_camp_jogador_capitao_[a-f0-9]{24}$/, onSelectJogadorCapitao);
}

module.exports = { register, temPermissaoOrganizador, parseDataBR, publicarPainelInscricao };
