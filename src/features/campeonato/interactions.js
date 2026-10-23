const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const config = require('../../config');
const { embedCriarEvento, embedSelecionarRanks, embedEventoCriado, embedPainelInscricao, embedInscricaoConfirmada, embedResumoCorte, embedMenuFormato, embedPainelPartida, embedPlacarEnviado, embedDisputaOrganizador, embedBracket, embedClassificacao, embedCampeaoDefinido, embedPainelAdmin, embedCancelamentoConfirmado, embedReaberturaConfirmada, embedTimeDesclassificado, embedPlacarAjustado, toActionRows, montarComponentes } = require('./embeds');
const { criarEvento, EventoError } = require('./service');
const { gerarDescricaoEvento } = require('./services/duracao');
const { inscreverCapitao, inscreverTimeCompleto, inscreverJogadorManual, fecharInscricoes, executarCorte, definirFormato, findCampeonatoPorCanalInscricao, findCampeonatoPorCanal, listarInscricoes, InscricaoError } = require('./services/inscricao');
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
const Evento = require('../../db/models/evento');
const Partida = require('../../db/models/partida');
const Time = require('../../db/models/time');
const CampeonatoFactory = require('./factory/CampeonatoFactory');
const { criarCanaisRank, recriarCanaisInscricoesPartidas, permOrgao, permBot, permRank, PERMISSOES_LEITURA } = require('./permissions');
const { instance: eventosCampeonato, EVENTOS } = require('./events');

const selecaoRanks = new Map();
const selecoesExclusao = new Map();
const selecoesJogadoresTime = new Map();
const inscricoesTimePendentes = new Map();
const wosPendentes = new Map();
const configPainel = new Map(); // FLUXO 2: estado do painel de configuração por usuário
let clientPainelOrganizador = null;
let listenersPainelOrganizadorRegistrados = false;
const atualizacoesPainelPendentes = new Map();
const edicoesRanksPendentes = new Map();

function limitarTextoPainel(linhas, limite) {
  const texto = linhas.join('\n') || 'Nenhum dado disponível.';
  if (texto.length <= limite) return texto;
  const marcador = '\n… conteúdo truncado; consulte os canais do campeonato.';
  return `${texto.slice(0, limite - marcador.length)}${marcador}`;
}

function rotuloJogadorPainel(jogador) {
  if (!jogador) return 'Jogador não definido';
  if (jogador.origem === 'WHATSAPP' || String(jogador.userId || '').startsWith('MANUAL_WHATSAPP_')) {
    return String(jogador.nickSnapshot || jogador.nome || 'Jogador sem nick').replace(/[*_`~|]/g, '\\$&');
  }
  return jogador.userId ? `<@${jogador.userId}>` : String(jogador.nickSnapshot || 'Jogador sem nick');
}

function rotuloFasePainel(partida, campeonato, totalTimes) {
  const fase = String(partida.fase || '');
  if (fase === 'FINAL' || fase.toLowerCase() === 'final') return 'Final';
  const rodada = Number(partida.rodada) || Number(fase.match(/\d+/)?.[0]) || 1;
  if ([campeonato.modalidade, campeonato.formato].some((formato) => String(formato || '').toLowerCase().includes('round-robin'))) {
    return `Rodada ${rodada}`;
  }
  const totalRodadas = Math.ceil(Math.log2(Math.max(2, totalTimes)));
  const timesNaFase = 2 ** Math.max(1, totalRodadas - rodada + 1);
  const nomes = { 2: 'Final', 4: 'Semifinal', 8: 'Quartas de Final', 16: 'Oitavas de Final' };
  return nomes[timesNaFase] || `Rodada ${rodada}`;
}

function buildPainelOrganizadorCampeonato({ campeonato, times = [], partidas = [] }) {
  const timesPorId = new Map(times.map((time) => [String(time._id), time]));
  const linhasInscritos = [];
  times.forEach((time, index) => {
    linhasInscritos.push(`**Time ${index + 1} — ${time.nome || 'Sem nome'}**`);
    const jogadores = time.jogadores || [];
    if (jogadores.length) jogadores.forEach((jogador) => linhasInscritos.push(`• ${rotuloJogadorPainel(jogador)}`));
    else linhasInscritos.push('• Sem jogadores');
  });
  if (campeonato.limiteInscricoes) {
    linhasInscritos.push(`\n**Total:** ${times.length}/${campeonato.limiteInscricoes} times`);
  } else {
    linhasInscritos.push(`\n**Total:** ${times.length} time(s)`);
  }

  const linhasPartidas = partidas.map((partida) => {
    const timeA = timesPorId.get(String(partida.timeA || partida.timeAId || ''));
    const timeB = timesPorId.get(String(partida.timeB || partida.timeBId || ''));
    const checkin = (lado, time) => {
      if (partida.checkIns?.[lado]?.fez) return '✅ confirmado';
      if (!time) return '⏳ aguardando time';
      const capitao = (time.jogadores || []).find((jogador) => jogador.userId === time.capitaoId)
        || (time.jogadores || []).find((jogador) => jogador.isCapitao);
      return `⏳ aguardando ${rotuloJogadorPainel(capitao)}`;
    };
    const placarA = partida.placarEnviado?.timeA?.placar;
    const placarB = partida.placarEnviado?.timeB?.placar;
    let placar = placarA || placarB || '0 x 0';
    if (placarA && placarB && placarA !== placarB) placar = `${placarA} (A) / ${placarB} (B)`;
    const fase = rotuloFasePainel(partida, campeonato, times.length);
    const status = String(partida.status || 'AGUARDANDO_CHECKIN').replace(/_/g, ' ').toLowerCase();
    return `**${fase}** — ${timeA?.nome || 'A definir'} ${placar} ${timeB?.nome || 'A definir'}\nTime A: ${checkin('timeA', timeA)} | Time B: ${checkin('timeB', timeB)} · ${status}`;
  });

  const admin = campeonato.arquivado
    ? {
      embeds: [{
        title: '📦 Rank arquivado',
        description: 'As inscrições e partidas deste rank foram removidas dos canais. Os dados históricos foram preservados.',
        color: 0x808080
      }],
      components: []
    }
    : embedPainelAdmin({ campeonato });
  return {
    embeds: [
      {
        title: `👥 Inscritos — ${campeonato.nome}`,
        description: limitarTextoPainel(linhasInscritos, 2300),
        color: 0x00C2FF
      },
      {
        title: `🎮 Partidas — ${campeonato.nome}`,
        description: limitarTextoPainel(linhasPartidas, 2300),
        color: 0x5865F2
      },
      ...admin.embeds
    ],
    components: toActionRows(admin.components)
  };
}

async function atualizarPainelOrganizadorCampeonato(campeonatoId) {
  if (!clientPainelOrganizador) throw new Error('Cliente do Discord não configurado para atualizar o painel do organizador.');
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato?.canais?.organizador || !campeonato.painelOrganizador?.fixaMessageId) return false;

  const canal = await clientPainelOrganizador.channels.fetch(campeonato.canais.organizador);
  if (!canal?.isTextBased?.()) throw new Error(`Canal do organizador inválido para o campeonato ${campeonatoId}.`);
  const [times, partidas] = await Promise.all([
    Time.find({ campeonatoId: campeonato._id }).lean(),
    Partida.find({ campeonatoId: campeonato._id }).sort({ rodada: 1, criadoEm: 1 }).lean()
  ]);
  const payload = buildPainelOrganizadorCampeonato({ campeonato, times, partidas });
  let mensagem = await canal.messages.fetch(campeonato.painelOrganizador.fixaMessageId).catch((error) => {
    if (error?.code === 10008) return null;
    throw error;
  });

  if (!mensagem) {
    mensagem = await canal.send(payload);
    await Campeonato.updateOne({ _id: campeonato._id }, {
      $set: {
        'painelOrganizador.fixaMessageId': mensagem.id,
        'painelOrganizador.dinamicaMessageId': mensagem.id,
        'painelOrganizador.mensagens.inscritos': mensagem.id,
        'painelOrganizador.mensagens.checkin': mensagem.id,
        'painelOrganizador.mensagens.partidas': mensagem.id,
        'painelOrganizador.mensagens.gestao': mensagem.id
      }
    });
    return true;
  }

  await mensagem.edit(payload);
  return true;
}

function solicitarAtualizacaoPainelOrganizador(campeonatoId) {
  if (!campeonatoId || !clientPainelOrganizador) return;
  const id = String(campeonatoId);
  const timerAnterior = atualizacoesPainelPendentes.get(id);
  if (timerAnterior) clearTimeout(timerAnterior);
  const timer = setTimeout(() => {
    atualizacoesPainelPendentes.delete(id);
    atualizarPainelOrganizadorCampeonato(id).catch((error) => {
      console.error(`[campeonato.painel] erro ao atualizar painel ${id}:`, error);
    });
  }, 250);
  timer.unref?.();
  atualizacoesPainelPendentes.set(id, timer);
}

function setCampeonatoClient(client) {
  clientPainelOrganizador = client;
  if (listenersPainelOrganizadorRegistrados) return;
  const eventosQueAtualizamPainel = [
    EVENTOS.INSCRICAO_REALIZADA, EVENTOS.INSCRICOES_FECHADAS, EVENTOS.CORTE_REALIZADO,
    EVENTOS.FORMATO_ESCOLHIDO, EVENTOS.PARTIDA_CRIADA, EVENTOS.CHECKIN_REALIZADO,
    EVENTOS.PLACAR_ENVIADO, EVENTOS.PLACAR_VALIDADO, EVENTOS.PLACAR_CONTESTADO,
    EVENTOS.PLACAR_DEFINIDO_ORG, EVENTOS.WO_REGISTRADO, EVENTOS.PARTIDA_FINALIZADA,
    EVENTOS.CAMPEONATO_CANCELADO, EVENTOS.CAMPEONATO_REABERTO, EVENTOS.TIME_DESCLASSIFICADO,
    EVENTOS.PLACAR_AJUSTADO, EVENTOS.TIME_ATUALIZADO, EVENTOS.CAMPEAO_DEFINIDO
  ];
  eventosQueAtualizamPainel.forEach((nomeEvento) => {
    eventosCampeonato.on(nomeEvento, async (payload = {}) => {
      try {
        let campeonatoId = payload.campeonatoId;
        if (!campeonatoId && payload.partidaId) {
          const partida = await Partida.findById(payload.partidaId).select('campeonatoId').lean();
          campeonatoId = partida?.campeonatoId;
        }
        if (!campeonatoId && payload.timeId) {
          const time = await Time.findById(payload.timeId).select('campeonatoId').lean();
          campeonatoId = time?.campeonatoId;
        }
        solicitarAtualizacaoPainelOrganizador(campeonatoId);
      } catch (error) {
        console.error(`[campeonato.painel] falha ao localizar painel após ${nomeEvento}:`, error);
      }
    });
  });
  listenersPainelOrganizadorRegistrados = true;
}

async function publicarPainelInscricao(canal, campeonato) {
  if (!canal?.isTextBased?.()) throw new Error('Canal de inscrições inválido ou não é um canal de texto.');
  const painel = embedPainelInscricao(campeonato, 0);
  const mensagem = await canal.send({
    content: '⬇️ Use os botões abaixo para inscrever o time ou solicitar uma inscrição manual.',
    embeds: painel.embeds,
    components: toActionRows(painel.components)
  });
  const idsEsperados = Number(campeonato.maxJogadoresPorTime) <= 1
    ? ['btn_camp_inscrever_se']
    : ['btn_camp_inscrever_time'];
  const temBotao = mensagem.components?.some((linha) =>
    linha.components?.some((componente) => idsEsperados.includes(componente.customId))
  );
  if (!temBotao) throw new Error(`O Discord criou o painel sem o botão de inscrição esperado (${idsEsperados.join(', ')}).`);
  return mensagem;
}

async function publicarPaineisCampeonato(guild, campeonato) {
  const resultado = { inscricoes: false, organizador: false, avisos: false };
  const buscarCanal = async (chave) => {
    try {
      const canal = await guild.channels.fetch(campeonato.canais?.[chave]);
      if (canal?.isTextBased?.()) return canal;
      throw new Error(`Canal ${chave} ausente ou não é um canal de texto.`);
    } catch (error) {
      console.error(`[campeonato.criar] não foi possível obter o canal ${chave} do campeonato ${campeonato._id}:`, error);
      return null;
    }
  };

  const canalInscricoes = await buscarCanal('inscricoes');
  if (canalInscricoes) {
    try {
      await publicarPainelInscricao(canalInscricoes, campeonato);
      resultado.inscricoes = true;
    } catch (error) {
      campeonato.painelInscricaoErro = true;
      console.error(`[campeonato.criar] erro ao publicar painel de inscrição no canal ${canalInscricoes.id}:`, error);
    }
  } else {
    campeonato.painelInscricaoErro = true;
  }

  const canalOrganizador = await buscarCanal('organizador');
  if (canalOrganizador) {
    try {
      const mensagem = await canalOrganizador.send(buildPainelOrganizadorCampeonato({ campeonato }));
      const mensagemId = mensagem.id;
      campeonato.painelOrganizador = {
        fixaMessageId: mensagemId,
        dinamicaMessageId: mensagemId,
        mensagens: {
          inscritos: mensagemId,
          checkin: mensagemId,
          partidas: mensagemId,
          gestao: mensagemId
        }
      };
      await campeonato.save();
      resultado.organizador = true;
    } catch (error) {
      console.error(`[campeonato.criar] erro ao publicar painel do organizador no canal ${canalOrganizador.id}:`, error);
    }
  }

  const canalAvisos = await buscarCanal('avisos');
  if (canalAvisos) {
    try {
      await canalAvisos.send({
        embeds: [{
          title: `📣 Avisos — ${campeonato.nome}`,
          description: `Inscrições abertas para o campeonato **${campeonato.nome}**. Acompanhe este canal para comunicados oficiais.`,
          color: 0xFF6B00
        }]
      });
      resultado.avisos = true;
    } catch (error) {
      console.error(`[campeonato.criar] erro ao publicar avisos no canal ${canalAvisos.id}:`, error);
    }
  }

  return resultado;
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
  const dia = Number(dd);
  const mes = Number(mm);
  const ano = Number(yyyy);
  const data = new Date(ano, mes - 1, dia, 23, 59, 59);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  return data;
}

function construirPeriodoEvento(dataInicio, horarioInicio, duracaoMin = 180) {
  const horario = String(horarioInicio || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!horario) throw new Error('Horário inválido. Use o formato HH:MM.');

  const inicio = new Date(dataInicio);
  if (Number.isNaN(inicio.getTime())) throw new Error('Data de início inválida.');
  inicio.setHours(Number(horario[1]), Number(horario[2]), 0, 0);

  const fim = new Date(inicio.getTime() + duracaoMin * 60 * 1000);
  return { dataInicio: inicio, dataFim: fim };
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
    return interaction.reply({ content: 'Data de início inválida. Use uma data real no formato DD/MM/AAAA.', flags: 64 });
  }
  if (!dataLimite || dataLimite > dataInicio) {
    return interaction.reply({ content: 'Data limite inválida. Use uma data real no formato DD/MM/AAAA, igual ou anterior à data do evento.', flags: 64 });
  }
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(horarioInicio)) {
    return interaction.reply({ content: 'Horário inválido. Use o formato HH:MM, entre 00:00 e 23:59.', flags: 64 });
  }

  const userId = interaction.user.id;
  const chave = `camp:config:${userId}`;
  const cfgAnterior = configPainel.get(chave) || {};
  configPainel.set(chave, {
    ...cfgAnterior,
    nome,
    dataInicio,
    dataLimiteInscricoes: dataLimite,
    horarioInicio,
    descricao,
    simultaneo: cfgAnterior.simultaneo ?? true,
    modo: cfgAnterior.modo || null,
    ranksSelecionados: cfgAnterior.ranksSelecionados || [],
    baseadoEmInscricoes: cfgAnterior.baseadoEmInscricoes ?? null,
    formato: cfgAnterior.formato || null,
    participantes: cfgAnterior.participantes || []
  });

  return interaction.reply({
    ...buildConfigPanel(userId),
    flags: 64
  });
}

function buildConfigPanel(userId) {
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) {
    return { content: 'Sessão expirada. Clique em Novo Campeonato de novo.', embeds: [], components: [] };
  }

  const sections = [
    { key: 'dados', label: 'Preencher dados', emoji: '📝', customId: 'btn_config_dados', disabled: false, done: true },
    { key: 'simultaneo', label: 'Simultaneidade', emoji: '⏱️', customId: 'btn_config_simultaneo', disabled: false, done: cfg.simultaneo !== undefined },
    { key: 'modo', label: 'Escolher modo', emoji: '⚔️', customId: 'btn_config_modo', disabled: false, done: !!cfg.modo },
    { key: 'tipoDupla', label: 'Fixa ou sorteada', emoji: '👥', customId: 'btn_config_tipo_dupla', disabled: !modoPermiteTipoDupla(cfg.modo), done: !modoPermiteTipoDupla(cfg.modo) || !!cfg.tipoDupla },
    { key: 'ranks', label: 'Ranks', emoji: '🎯', customId: 'btn_config_ranks', disabled: !cfg.modo, done: cfg.ranksSelecionados?.length > 0 },
    { key: 'entrada', label: 'Modo de Entrada', emoji: '👥', customId: 'btn_config_entrada', disabled: !cfg.modo || !cfg.ranksSelecionados?.length, done: cfg.baseadoEmInscricoes === true || cfg.baseadoEmInscricoes === false },
    { key: 'formato', label: 'Formato', emoji: '📋', customId: 'btn_config_formato', disabled: cfg.baseadoEmInscricoes !== false, done: !!cfg.formato },
    { key: 'participantes', label: 'Participantes', emoji: '👤', customId: 'btn_config_participantes', disabled: cfg.baseadoEmInscricoes !== false, done: cfg.participantes?.length > 0 },
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
    disabled: s.disabled
  }));

  buttons.push({ type: 2, style: 4, label: 'Cancelar', emoji: { name: '❌' }, custom_id: 'btn_config_cancelar' });

  return {
    embeds: [embed],
    components: montarComponentes(buttons.slice(0, 5), buttons.slice(5))
  };
}

function isConfigComplete(cfg) {
  if (!cfg.modo) return false;
  if (modoPermiteTipoDupla(cfg.modo) && !['FIXA', 'SORTEADA'].includes(cfg.tipoDupla)) return false;
  if (!cfg.ranksSelecionados?.length) return false;
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
    case 'simultaneo': return cfg.simultaneo === false ? 'Escalonadas' : 'Simultâneas';
    case 'modo': return cfg.modo ? getModoLabel(cfg.modo) : '—';
    case 'tipoDupla': return modoPermiteTipoDupla(cfg.modo) ? (cfg.tipoDupla || 'Escolha fixa ou sorteada') : 'Não se aplica';
    case 'ranks': return cfg.ranksSelecionados?.length ? cfg.ranksSelecionados.map((r) => (config.ranks.find((cr) => cr.key === r)?.label || r)).join(', ') : '—';
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

function modoPermiteTipoDupla(modo) {
  return Number.parseInt(String(modo || ''), 10) > 1;
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
      simultaneo: selecao.simultaneo !== false,
      duracaoMin: selecao.duracaoMin || 180,
      temTerceiroLugar: true,
      horarioInicio: selecao.horarioInicio
    });
    selecaoRanks.delete(`camp:selecao:${interaction.user.id}`);
    const eventosCriados = [];
    for (const camp of resultado.campeonatos) {
      await publicarPaineisCampeonato(interaction.guild, camp);
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
  if (Number(campeonato.maxJogadoresPorTime) <= 1) return registrarInscricaoIndividual(interaction, campeonato);

  return abrirFormularioInscricaoTime(interaction, campeonato);
}

async function registrarInscricaoIndividual(interaction, campeonato) {
  await interaction.deferReply({ flags: 64 });
  try {
    const { time, dadosCapitao } = await inscreverCapitao({ guild: interaction.guild, member: interaction.member, campeonato });
    return interaction.editReply(embedInscricaoConfirmada({ time, capitao: dadosCapitao }));
  } catch (error) {
    if (error instanceof InscricaoError || error instanceof ValidacaoInscricaoError) return interaction.editReply({ content: error.message });
    throw error;
  }
}

async function onBotaoInscreverSe(interaction) {
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) return interaction.reply({ content: 'Este canal nao e de inscricao de campeonato.', flags: 64 });
  if (Number(campeonato.maxJogadoresPorTime) > 1) {
    return interaction.reply({ content: 'A inscrição individual está disponível apenas no modo duelos (1v1).', flags: 64 });
  }
  if (campeonato.status !== 'INSCRICOES_ABERTAS') {
    return interaction.reply({ content: 'Inscricoes nao estao abertas.', flags: 64 });
  }
  return registrarInscricaoIndividual(interaction, campeonato);
}

function chaveInscricaoTime(interaction, campeonatoId) {
  return `${interaction.guildId}:${interaction.channelId}:${interaction.user.id}:${campeonatoId}`;
}

function construirModalInscricaoTime(campeonato, etapa, indiceJogador) {
  const totalCompanheiros = Math.max(0, Number(campeonato.maxJogadoresPorTime || 1) - 1);
  const camposBase = etapa === 0 ? 2 : 0;
  const limiteNicks = 5 - camposBase;
  const quantidadeNicks = Math.min(limiteNicks, totalCompanheiros - indiceJogador);
  const modal = new ModalBuilder()
    .setCustomId(`modal_camp_inscricao_time_${campeonato._id}_${etapa}`)
    .setTitle(`Inscrever time — etapa ${etapa + 1}`);

  if (etapa === 0) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('inscricao_time_nome')
          .setLabel('Nome do time')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(40)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('inscricao_time_capitao')
          .setLabel('Nick do capitão')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(20)
          .setRequired(true)
      )
    );
  }
  for (let indice = indiceJogador; indice < indiceJogador + quantidadeNicks; indice++) {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(`inscricao_time_jogador_${indice}`)
        .setLabel(`Nick do jogador ${indice + 1}`)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(20)
        .setRequired(true)
    ));
  }
  return modal;
}

async function abrirFormularioInscricaoTime(interaction, campeonato) {
  if (Number(campeonato.maxJogadoresPorTime) <= 1) {
    return interaction.reply({ content: 'No modo duelos, use o botão **Inscrever-se**.', flags: 64 });
  }
  if (campeonato.status !== 'INSCRICOES_ABERTAS') {
    return interaction.reply({ content: 'Inscricoes nao estao abertas.', flags: 64 });
  }
  return interaction.showModal(construirModalInscricaoTime(campeonato, 0, 0));
}

async function onBotaoInscreverTime(interaction) {
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato) return interaction.reply({ content: 'Este canal nao e de inscricao de campeonato.', flags: 64 });
  return abrirFormularioInscricaoTime(interaction, campeonato);
}

async function estadoInscricaoTime(interaction, campeonatoId) {
  const key = chaveInscricaoTime(interaction, campeonatoId);
  const state = inscricoesTimePendentes.get(key);
  if (state && Date.now() - state.atualizadoEm > 30 * 60 * 1000) {
    inscricoesTimePendentes.delete(key);
    return null;
  }
  return state || null;
}

async function onContinuarInscricaoTime(interaction) {
  const match = interaction.customId.match(/^btn_camp_inscricao_time_continuar_([a-f0-9]{24})_(\d+)$/);
  if (!match) return interaction.reply({ content: 'Etapa inválida. Inicie a inscrição novamente.', flags: 64 });
  const [, campeonatoId, etapaTexto] = match;
  const etapa = Number(etapaTexto);
  const state = await estadoInscricaoTime(interaction, campeonatoId);
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!state || !campeonato || state.etapa !== etapa || campeonato.status !== 'INSCRICOES_ABERTAS') {
    inscricoesTimePendentes.delete(chaveInscricaoTime(interaction, campeonatoId));
    return interaction.reply({ content: 'A inscrição expirou ou foi encerrada. Inicie novamente pelo canal de inscrições.', flags: 64 });
  }
  state.atualizadoEm = Date.now();
  inscricoesTimePendentes.set(chaveInscricaoTime(interaction, campeonatoId), state);
  return interaction.showModal(construirModalInscricaoTime(campeonato, etapa, state.proximoIndiceNick));
}

function payloadSelecionarJogadorTime(state, campeonato) {
  const indice = state.jogadoresSelecionados.length;
  const nick = state.nicksJogadores[indice];
  const menu = new UserSelectMenuBuilder()
    .setCustomId(`select_camp_inscricao_time_jogador_${state.campeonatoId}`)
    .setPlaceholder(`Selecione a conta do jogador ${indice + 1}`)
    .setMinValues(1)
    .setMaxValues(1);
  return {
    content: `Inscrição de **${state.nomeTime}** — selecione a conta Discord correspondente ao nick **${nick}** (${indice + 1}/${campeonato.maxJogadoresPorTime - 1}).`,
    components: [new ActionRowBuilder().addComponents(menu)]
  };
}

async function onSubmitInscricaoTime(interaction) {
  const match = interaction.customId.match(/^modal_camp_inscricao_time_([a-f0-9]{24})_(\d+)$/);
  if (!match) return;
  const [, campeonatoId, etapaTexto] = match;
  const etapa = Number(etapaTexto);
  const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
  if (!campeonato || String(campeonato._id) !== campeonatoId) {
    return interaction.reply({ content: 'Campeonato nao encontrado neste canal.', flags: 64 });
  }
  if (campeonato.status !== 'INSCRICOES_ABERTAS') {
    return interaction.reply({ content: 'Inscricoes nao estao abertas.', flags: 64 });
  }

  const key = chaveInscricaoTime(interaction, campeonatoId);
  let state = await estadoInscricaoTime(interaction, campeonatoId);
  if (etapa === 0) {
    state = {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      campeonatoId,
      nomeTime: interaction.fields.getTextInputValue('inscricao_time_nome').trim(),
      nickCapitao: interaction.fields.getTextInputValue('inscricao_time_capitao').trim(),
      nicksJogadores: [],
      jogadoresSelecionados: [],
      proximoIndiceNick: 0,
      etapa: 0,
      atualizadoEm: Date.now()
    };
  } else if (!state || state.etapa !== etapa) {
    return interaction.reply({ content: 'A etapa anterior expirou. Inicie a inscrição novamente.', flags: 64 });
  }

  const totalCompanheiros = Math.max(0, Number(campeonato.maxJogadoresPorTime || 1) - 1);
  const quantidadeCampos = Math.min(etapa === 0 ? 3 : 5, totalCompanheiros - state.proximoIndiceNick);
  const inicio = state.proximoIndiceNick;
  for (let deslocamento = 0; deslocamento < quantidadeCampos; deslocamento++) {
    state.nicksJogadores[inicio + deslocamento] =
      interaction.fields.getTextInputValue(`inscricao_time_jogador_${inicio + deslocamento}`).trim();
  }
  state.proximoIndiceNick += quantidadeCampos;
  state.etapa = etapa + 1;
  state.atualizadoEm = Date.now();
  inscricoesTimePendentes.set(key, state);

  if (state.proximoIndiceNick < totalCompanheiros) {
    return interaction.reply({
      content: `Etapa ${etapa + 1} concluída. Continue para informar os próximos nicks.`,
      components: toActionRows([[
        { type: 2, style: 3, label: 'Continuar cadastrando', custom_id: `btn_camp_inscricao_time_continuar_${campeonatoId}_${state.etapa}` },
        { type: 2, style: 4, label: 'Cancelar', custom_id: `btn_camp_inscricao_time_cancelar_${campeonatoId}` }
      ]]),
      flags: 64
    });
  }

  return interaction.reply({ ...payloadSelecionarJogadorTime(state, campeonato), flags: 64 });
}

async function onSelecionarJogadorInscricaoTime(interaction) {
  const match = interaction.customId.match(/^select_camp_inscricao_time_jogador_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'Inscrição inválida. Inicie novamente pelo canal de inscrições.', flags: 64 });
  const campeonatoId = match[1];
  const key = chaveInscricaoTime(interaction, campeonatoId);
  const state = inscricoesTimePendentes.get(key);
  if (!state || Date.now() - state.atualizadoEm > 30 * 60 * 1000) {
    if (key) inscricoesTimePendentes.delete(key);
    return interaction.reply({ content: 'A inscrição expirou. Inicie novamente no canal de inscrições.', flags: 64 });
  }
  const userId = interaction.values[0];
  if (userId === interaction.user.id || state.jogadoresSelecionados.some((jogador) => jogador.userId === userId)) {
    return interaction.reply({ content: 'O capitão e cada jogador precisam ser contas Discord diferentes.', flags: 64 });
  }
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) return interaction.reply({ content: 'Não foi possível localizar esse membro no servidor. Selecione novamente.', flags: 64 });
  const indice = state.jogadoresSelecionados.length;
  state.jogadoresSelecionados.push({ member, nick: state.nicksJogadores[indice] });
  state.atualizadoEm = Date.now();

  if (state.jogadoresSelecionados.length < state.nicksJogadores.length) {
    inscricoesTimePendentes.set(key, state);
    return interaction.update(payloadSelecionarJogadorTime(state, {
      maxJogadoresPorTime: state.nicksJogadores.length + 1
    }));
  }

  await interaction.deferUpdate();
  try {
    const campeonato = await findCampeonatoPorCanalInscricao(interaction.channelId);
    if (!campeonato || String(campeonato._id) !== state.campeonatoId) {
      throw new InscricaoError('Campeonato nao encontrado neste canal.', 'INSCRICAO_CAMP_NAO_ENCONTRADO');
    }
    const capitao = await interaction.guild.members.fetch(state.userId);
    const resultado = await inscreverTimeCompleto({
      guild: interaction.guild,
      campeonato,
      capitao,
      nickCapitao: state.nickCapitao,
      nomeTime: state.nomeTime,
      jogadores: state.jogadoresSelecionados
    });
    inscricoesTimePendentes.delete(key);
    return interaction.editReply({
      content: `✅ **${resultado.time.nome}** inscrito com ${resultado.time.jogadores.length} jogador(es).`,
      components: []
    });
  } catch (error) {
    inscricoesTimePendentes.delete(key);
    if (error instanceof InscricaoError || error instanceof ValidacaoInscricaoError) {
      return interaction.editReply({ content: error.message, components: [] });
    }
    console.error('[campeonato.inscricao.time] erro:', error);
    return interaction.editReply({ content: 'Erro ao processar inscrição do time.', components: [] });
  }
}

async function onCancelarInscricaoTime(interaction) {
  const campeonatoId = interaction.customId.replace('btn_camp_inscricao_time_cancelar_', '');
  inscricoesTimePendentes.delete(chaveInscricaoTime(interaction, campeonatoId));
  return interaction.update({ content: 'Inscrição cancelada.', components: [] });
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
  solicitarAtualizacaoPainelOrganizador(campeonato._id);
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
  const canalAvisosId = campeonato.canais?.avisos;
  if (!canalAvisosId) {
    return interaction.editReply({ content: 'Este campeonato não tem canal de avisos configurado.' });
  }
  try {
    const canalAvisos = await interaction.client.channels.fetch(canalAvisosId);
    if (!canalAvisos?.isTextBased?.()) {
      return interaction.editReply({ content: 'O canal de avisos não está disponível para envio.' });
    }
    await canalAvisos.send({ content: `📣 **Broadcast da organização — ${campeonato.rank.toUpperCase()}**\n${mensagem}` });
    return interaction.editReply({ content: `Broadcast enviado somente para <#${canalAvisosId}>.` });
  } catch (error) {
    console.error(`[campeonato.broadcast] falha ao enviar no canal de avisos ${canalAvisosId}:`, error);
    return interaction.editReply({ content: 'Não foi possível enviar o broadcast no canal de avisos deste rank.' });
  }
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
  solicitarAtualizacaoPainelOrganizador(campeonatoId);
  
  const inscricoes = await listarInscricoes(campeonatoId);
  
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
  const match = interaction.customId.match(/^btn_(?:camp_)?gerenciar_(?:participantes|times)_([a-f0-9]{24})$/);
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
    .setCustomId('select_camp_time_acao_' + campeonatoId)
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
  
  return safeReply(interaction, {
    content: 'Painel de participantes exibido apenas para você.',
    embeds: payload.embeds,
    components: payload.components,
    flags: 64
  });
}

// Legacy alias
async function onGerenciarTimes(interaction) {
  return onGerenciarParticipantes(interaction);
}

function montarPainelEdicaoEvento(evento, campeonatos) {
  const ranks = evento.ranksSelecionados || [];
  const principal = campeonatos[0];
  const selectRanks = new StringSelectMenuBuilder()
    .setCustomId(`select_camp_editar_ranks_${evento._id}`)
    .setPlaceholder('Ranks ativos no evento')
    .setMinValues(1)
    .setMaxValues(config.ranks.length)
    .addOptions(config.ranks.map((rank) => ({
      label: rank.label,
      value: rank.key,
      default: ranks.includes(rank.key)
    })));
  const selectEntrada = new StringSelectMenuBuilder()
    .setCustomId(`select_camp_editar_entrada_${evento._id}`)
    .setPlaceholder('Modo de entrada')
    .addOptions([
      { label: 'Inscrição aberta', value: 'true', default: principal.baseadoEmInscricoes === true },
      { label: 'Participantes definidos pela organização', value: 'false', default: principal.baseadoEmInscricoes === false }
    ]);
  const selectDupla = new StringSelectMenuBuilder()
    .setCustomId(`select_camp_editar_dupla_${evento._id}`)
    .setPlaceholder('Tipo de dupla')
    .addOptions([
      { label: 'Fixa', value: 'FIXA', default: principal.tipoDupla === 'FIXA' },
      { label: 'Sorteada', value: 'SORTEADA', default: principal.tipoDupla !== 'FIXA' }
    ]);
  const formatos = [
    { value: 'single-elimination', label: 'Eliminatória simples' },
    { value: 'double-elimination', label: 'Eliminatória dupla' },
    { value: 'round-robin', label: 'Round robin' },
    { value: 'grupos-mata-mata', label: 'Grupos + mata-mata' }
  ];
  const selectFormato = new StringSelectMenuBuilder()
    .setCustomId(`select_camp_editar_formato_${evento._id}`)
    .setPlaceholder('Formato das partidas')
    .addOptions(formatos.map((formato) => ({
      ...formato,
      default: principal.formato === formato.value
    })));
  const botoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_camp_editar_dados_${evento._id}`)
      .setLabel('Editar nome e datas')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`btn_camp_editar_avancado_${evento._id}`)
      .setLabel('Editar limite de times')
      .setStyle(ButtonStyle.Secondary)
  );
  return {
    content: `**Edição do evento:** ${evento.nome}\nO modo de jogo não pode ser alterado. Alterações são bloqueadas após a geração de partidas.`,
    components: [
      botoes,
      new ActionRowBuilder().addComponents(selectRanks),
      new ActionRowBuilder().addComponents(selectEntrada),
      new ActionRowBuilder().addComponents(selectDupla),
      new ActionRowBuilder().addComponents(selectFormato)
    ]
  };
}

async function obterEventoEditavel(campeonatoId) {
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato) throw new Error('Campeonato não encontrado.');
  if (campeonato.arquivado) throw new Error('Este rank está arquivado e não pode ser editado.');
  return obterEventoEditavelPorEvento(campeonato.eventoId);
}

async function obterEventoEditavelPorEvento(eventoId) {
  const evento = await Evento.findById(eventoId).lean();
  if (!evento) throw new Error('Evento não encontrado.');
  const campeonatos = await Campeonato.find({
    eventoId: evento._id,
    rank: { $in: evento.ranksSelecionados },
    arquivado: { $ne: true }
  }).sort({ criadoEm: 1 }).lean();
  const ids = campeonatos.map((item) => item._id);
  if (ids.length && await Partida.exists({ campeonatoId: { $in: ids } })) {
    throw new Error('As configurações não podem ser alteradas depois que as partidas forem geradas.');
  }
  if (!campeonatos.length) throw new Error('Nenhum campeonato ativo foi encontrado para este evento.');
  return { evento, campeonatos };
}

async function onAbrirEdicaoCampeonato(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas organizadores podem editar o campeonato.', flags: 64 });
  }
  const match = interaction.customId.match(/^btn_camp_editar_config_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID do campeonato inválido.', flags: 64 });
  try {
    const { evento, campeonatos } = await obterEventoEditavel(match[1]);
    return interaction.reply({ ...montarPainelEdicaoEvento(evento, campeonatos), flags: 64 });
  } catch (error) {
    return interaction.reply({ content: error.message, flags: 64 });
  }
}

function criarModalDadosEvento(evento) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_camp_editar_dados_${evento._id}`)
    .setTitle('Editar dados do evento');
  const campos = [
    ['edit_evento_nome', 'Nome do evento', evento.nome, true],
    ['edit_evento_inicio', 'Data de início (DD/MM/AAAA)', new Date(evento.dataInicio).toLocaleDateString('pt-BR'), true],
    ['edit_evento_fim', 'Data de término (DD/MM/AAAA)', new Date(evento.dataFim).toLocaleDateString('pt-BR'), true],
    ['edit_evento_limite', 'Data limite de inscrição (DD/MM/AAAA)', evento.dataLimiteInscricoes ? new Date(evento.dataLimiteInscricoes).toLocaleDateString('pt-BR') : '', false]
  ];
  for (const [id, label, value, required] of campos) {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(required);
    if (value) input.setValue(String(value).slice(0, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function criarModalConfiguracoesEvento(evento, campeonatos) {
  const principal = campeonatos[0];
  const modal = new ModalBuilder()
    .setCustomId(`modal_camp_editar_avancado_${evento._id}`)
    .setTitle('Editar limite de times');
  const input = new TextInputBuilder()
    .setCustomId('edit_limite_times')
    .setLabel('Limite de times (vazio = sem limite)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  if (principal.limiteInscricoes != null) input.setValue(String(principal.limiteInscricoes));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function onAbrirModalEdicao(interaction, tipo) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Sem permissão.', flags: 64 });
  const match = interaction.customId.match(/^btn_camp_editar_(?:dados|avancado)_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID do evento inválido.', flags: 64 });
  try {
    const { evento, campeonatos } = await obterEventoEditavelPorEvento(match[1]);
    return interaction.showModal(tipo === 'dados'
      ? criarModalDadosEvento(evento)
      : criarModalConfiguracoesEvento(evento, campeonatos));
  } catch (error) {
    return interaction.reply({ content: error.message, flags: 64 });
  }
}

function textoCampo(interaction, id) {
  return interaction.fields.getTextInputValue(id).trim();
}

async function onSubmitDadosEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Sem permissão.', flags: 64 });
  const match = interaction.customId.match(/^modal_camp_editar_dados_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID do evento inválido.', flags: 64 });
  try {
    const { evento, campeonatos } = await obterEventoEditavelPorEvento(match[1]);
    const nome = textoCampo(interaction, 'edit_evento_nome');
    const dataInicio = parseDataBR(textoCampo(interaction, 'edit_evento_inicio'));
    const dataFim = parseDataBR(textoCampo(interaction, 'edit_evento_fim'));
    const textoLimite = textoCampo(interaction, 'edit_evento_limite');
    const dataLimite = textoLimite ? parseDataBR(textoLimite) : null;
    if (nome.length < 3) throw new Error('O nome do evento precisa ter pelo menos 3 caracteres.');
    if (!dataInicio || !dataFim || dataFim <= dataInicio) throw new Error('Informe datas válidas; o término deve ser posterior ao início.');
    if (textoLimite && !dataLimite) throw new Error('A data limite de inscrição é inválida.');
    if (dataLimite && dataLimite > dataInicio) throw new Error('A data limite de inscrição deve ser igual ou anterior ao início.');
    const totalTimes = await Time.countDocuments({ campeonatoId: { $in: campeonatos.map((item) => item._id) } });
    const horarioInicio = String(evento.descricao || '').match(/às\s*(\d{2}:\d{2})/)?.[1];
    const descricao = gerarDescricaoEvento({
      dataInicio,
      duracaoMin: evento.duracaoMin,
      numTimes: totalTimes,
      modo: campeonatos[0].modo,
      simultaneo: evento.simultaneo,
      horarioInicio
    }).descricao;
    const eventoAtualizado = await Evento.findByIdAndUpdate(evento._id, {
      $set: { nome, dataInicio, dataFim, dataLimiteInscricoes: dataLimite, descricao }
    }, { new: true, runValidators: true }).lean();
    const rankConfigs = new Map(config.ranks.map((rank) => [rank.key, rank]));
    await Campeonato.updateMany(
      { _id: { $in: campeonatos.map((item) => item._id) } },
      { $set: {
        dataEvento: dataInicio,
        startAt: dataInicio,
        dataLimiteInscricoes: dataLimite
      } }
    );
    for (const campeonato of campeonatos) {
      const rank = rankConfigs.get(campeonato.rank);
      if (rank) {
        await Campeonato.updateOne({ _id: campeonato._id }, {
          $set: { nome: `${nome} - ${rank.label.toUpperCase()}` }
        });
        for (const [chave, titulo] of Object.entries({
          avisos: 'Avisos oficiais',
          inscricoes: 'Inscrições',
          partidas: 'Partidas',
          prints: 'Prints',
          organizador: 'Painel do organizador'
        })) {
          const canalId = campeonato.canais?.[chave];
          if (!canalId) continue;
          const canal = await interaction.guild.channels.fetch(canalId);
          if (canal?.isTextBased?.() && canal.setTopic) {
            await canal.setTopic(`${titulo} do campeonato ${rank.label} - ${nome}`);
          }
        }
        solicitarAtualizacaoPainelOrganizador(campeonato._id);
      }
    }
    const categoria = evento.categoriaId ? await interaction.guild.channels.fetch(evento.categoriaId) : null;
    if (categoria?.setName) await categoria.setName(`🏆 ${nome.toUpperCase()}`);
    return interaction.reply({ content: `Dados do evento **${eventoAtualizado.nome}** atualizados.`, flags: 64 });
  } catch (error) {
    return interaction.reply({ content: error.message, flags: 64 });
  }
}

async function onSubmitConfiguracoesEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Sem permissão.', flags: 64 });
  const match = interaction.customId.match(/^modal_camp_editar_avancado_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID do evento inválido.', flags: 64 });
  try {
    const { campeonatos } = await obterEventoEditavelPorEvento(match[1]);
    const textoLimite = textoCampo(interaction, 'edit_limite_times');
    const limite = textoLimite ? Number(textoLimite) : null;
    if (textoLimite && (!Number.isInteger(limite) || limite < 2)) throw new Error('O limite de times deve ser um número inteiro igual ou maior que 2.');
    if (limite !== null) {
      const inscritos = await Promise.all(campeonatos.map((camp) => Time.countDocuments({ campeonatoId: camp._id })));
      if (inscritos.some((total) => total > limite)) throw new Error('O limite não pode ser menor que a quantidade de times já inscritos.');
    }
    await Campeonato.updateMany(
      { _id: { $in: campeonatos.map((item) => item._id) } },
      { $set: { limiteInscricoes: limite } }
    );
    return interaction.reply({ content: 'Limite de times atualizado para os ranks ativos do evento.', flags: 64 });
  } catch (error) {
    return interaction.reply({ content: error.message, flags: 64 });
  }
}

async function onSelecionarConfiguracaoEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Sem permissão.', flags: 64 });
  const match = interaction.customId.match(/^select_camp_editar_(entrada|dupla|formato)_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'Seleção inválida.', flags: 64 });
  try {
    const { campeonatos } = await obterEventoEditavelPorEvento(match[2]);
    const [campo, valor] = match[1] === 'formato'
      ? ['formato', interaction.values[0]]
      : [match[1] === 'entrada' ? 'baseadoEmInscricoes' : 'tipoDupla',
        match[1] === 'entrada' ? interaction.values[0] === 'true' : interaction.values[0]];
    const atualizacao = { [campo]: valor };
    if (campo === 'formato') {
      atualizacao.modalidade = {
        'single-elimination': 'single',
        'double-elimination': 'double',
        'round-robin': 'round-robin',
        'grupos-mata-mata': 'grupos-mata-mata'
      }[valor];
    }
    await Campeonato.updateMany({ _id: { $in: campeonatos.map((item) => item._id) } }, { $set: atualizacao });
    const { evento, campeonatos: campeonatosAtualizados } = await obterEventoEditavelPorEvento(match[2]);
    return interaction.update(montarPainelEdicaoEvento(evento, campeonatosAtualizados));
  } catch (error) {
    return interaction.reply({ content: error.message, flags: 64 });
  }
}

async function aplicarSelecaoRanksEvento(interaction, eventoId, ranks, aviso) {
  const evento = await Evento.findById(eventoId);
  if (!evento) throw new Error('Evento não encontrado.');
  const ranksAnteriores = evento.ranksSelecionados || [];
  if (!Array.isArray(ranks) || !ranks.length || ranks.some((rank) => !config.ranks.some((item) => item.key === rank))) {
    throw new Error('Selecione pelo menos um rank válido.');
  }
  const removidos = ranksAnteriores.filter((rank) => !ranks.includes(rank));
  const adicionados = ranks.filter((rank) => !ranksAnteriores.includes(rank));
  if ((removidos.length || adicionados.length) && !String(aviso || '').trim()) {
    throw new Error('O aviso obrigatório para a alteração de ranks não foi informado.');
  }
  const campeonatosAtivos = await Campeonato.find({
    eventoId,
    rank: { $in: ranksAnteriores },
    arquivado: { $ne: true }
  });
  const modelo = campeonatosAtivos[0];
  const sufixoNumero = CampeonatoFactory.sufixoDoEvento(evento);
  const botUserId = interaction.guild.members.me?.id || interaction.client.user?.id;
  if (!botUserId) throw new Error('Não foi possível identificar o usuário do bot.');

  for (const rank of adicionados) {
    let campeonato = await Campeonato.findOne({ eventoId, rank });
    if (campeonato) {
      const canais = await recriarCanaisInscricoesPartidas(
        interaction.guild,
        evento.categoriaId,
        rank,
        { nome: evento.nome, sufixoNumero },
        botUserId
      );
      campeonato.canais.inscricoes = canais.inscricoes.id;
      campeonato.canais.partidas = canais.partidas.id;
      campeonato.arquivado = false;
      await campeonato.save();
      await publicarPainelInscricao(canais.inscricoes, campeonato);
      solicitarAtualizacaoPainelOrganizador(campeonato._id);
    } else {
      if (!modelo) throw new Error('Não foi possível determinar o modo original deste evento.');
      campeonato = await CampeonatoFactory.criar({
        eventoId,
        guildId: evento.guildId,
        rank,
        sufixoNumero,
        modo: modelo.modo,
        tipoDupla: modelo.tipoDupla,
        baseadoEmInscricoes: modelo.baseadoEmInscricoes,
        limiteInscricoes: modelo.limiteInscricoes,
        formato: modelo.formato,
        modalidade: modelo.modalidade,
        temTerceiroLugar: evento.temTerceiroLugar,
        dataEvento: evento.dataInicio,
        dataLimiteInscricoes: evento.dataLimiteInscricoes,
        intervaloPartidasMin: modelo.intervaloPartidasMin
      });
      const categoria = await interaction.guild.channels.fetch(evento.categoriaId);
      if (!categoria) throw new Error('Categoria do evento não encontrada no servidor.');
      campeonato.canais = Object.fromEntries(Object.entries(
        await criarCanaisRank(interaction.guild, categoria, rank, { nome: evento.nome, sufixoNumero }, botUserId)
      ).map(([chave, canal]) => [chave, canal.id]));
      await campeonato.save();
      const publicado = await publicarPaineisCampeonato(interaction.guild, campeonato);
      if (!publicado.inscricoes || !publicado.organizador) {
        throw new Error(`O rank ${rank} foi criado, mas não foi possível publicar todos os painéis.`);
      }
    }
    if (aviso) {
      const campeonatoAtualizado = await Campeonato.findOne({ eventoId, rank });
      const canalAvisos = campeonatoAtualizado?.canais?.avisos
        ? await interaction.guild.channels.fetch(campeonatoAtualizado.canais.avisos)
        : null;
      if (!canalAvisos?.isTextBased?.()) throw new Error(`Canal de avisos não encontrado para o rank ${rank}.`);
      await canalAvisos.send({
        content: `⚠️ **Atualização de ranks do evento ${evento.nome}**\n${String(aviso).trim()}`
      });
    }
  }

  for (const rank of removidos) {
    const campeonato = await Campeonato.findOne({ eventoId, rank });
    if (!campeonato) continue;
    const canalAvisos = campeonato.canais?.avisos
      ? await interaction.guild.channels.fetch(campeonato.canais.avisos)
      : null;
    if (!canalAvisos?.isTextBased?.()) throw new Error(`Canal de avisos não encontrado para o rank ${rank}.`);
    await canalAvisos.send({
      content: `⚠️ **Atualização de ranks do evento ${evento.nome}**\n${String(aviso).trim()}`
    });
    for (const chave of ['inscricoes', 'partidas']) {
      const canalId = campeonato.canais?.[chave];
      if (!canalId) continue;
      try {
        const canal = await interaction.guild.channels.fetch(canalId);
        if (canal) await canal.delete(`Rank ${rank} removido da seleção do evento ${evento.nome}`);
      } catch (error) {
        if (error?.code !== 10003) throw error;
      }
    }
    campeonato.canais.inscricoes = null;
    campeonato.canais.partidas = null;
    campeonato.arquivado = true;
    await campeonato.save();
    solicitarAtualizacaoPainelOrganizador(campeonato._id);
  }

  evento.ranksSelecionados = ranks;
  await evento.save();

  const canalGeralId = campeonatosAtivos[0]?.canais?.geral;
  if (canalGeralId) {
    const canalGeral = await interaction.guild.channels.fetch(canalGeralId);
    if (canalGeral?.permissionOverwrites?.set) {
      await canalGeral.permissionOverwrites.set([
        { id: interaction.guild.roles.everyone.id, deny: PERMISSOES_LEITURA },
        permOrgao(),
        permBot(botUserId),
        ...ranks.map(permRank)
      ], `Ranks atualizados no evento ${evento.nome}`);
    }
  }
}

async function onSelecionarRanksEvento(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Sem permissão.', flags: 64 });
  const match = interaction.customId.match(/^select_camp_editar_ranks_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID do evento inválido.', flags: 64 });
  try {
    const { evento } = await obterEventoEditavelPorEvento(match[1]);
    const ranks = interaction.values;
    const alteracao = evento.ranksSelecionados.length !== ranks.length
      || evento.ranksSelecionados.some((rank) => !ranks.includes(rank));
    if (alteracao) {
      edicoesRanksPendentes.set(`${interaction.user.id}:${evento._id}`, ranks);
      const modal = new ModalBuilder()
        .setCustomId(`modal_camp_aviso_ranks_${evento._id}`)
        .setTitle('Aviso obrigatório aos ranks removidos');
      const input = new TextInputBuilder()
        .setCustomId('aviso_ranks')
        .setLabel('Explique a mudança e a exclusão')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(10)
        .setMaxLength(1000)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }
    await interaction.deferUpdate();
    await aplicarSelecaoRanksEvento(interaction, evento._id, ranks, null);
    return interaction.editReply({ content: 'Ranks do evento atualizados. Os registros dos ranks removidos foram preservados.', components: [] });
  } catch (error) {
    if (!interaction.deferred && !interaction.replied) return interaction.reply({ content: error.message, flags: 64 });
    return interaction.editReply({ content: error.message, components: [] });
  }
}

async function onSubmitAvisoRanks(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) return interaction.reply({ content: 'Sem permissão.', flags: 64 });
  const match = interaction.customId.match(/^modal_camp_aviso_ranks_([a-f0-9]{24})$/);
  if (!match) return interaction.reply({ content: 'ID do evento inválido.', flags: 64 });
  const key = `${interaction.user.id}:${match[1]}`;
  const ranks = edicoesRanksPendentes.get(key);
  edicoesRanksPendentes.delete(key);
  if (!ranks) return interaction.reply({ content: 'A seleção de ranks expirou. Abra a edição novamente.', flags: 64 });
  try {
    const aviso = textoCampo(interaction, 'aviso_ranks');
    if (aviso.length < 10) throw new Error('O aviso precisa ter pelo menos 10 caracteres.');
    const campeonato = await Campeonato.findOne({ eventoId: match[1], arquivado: { $ne: true } }).lean();
    if (!campeonato) throw new Error('Nenhum campeonato ativo foi encontrado para este evento.');
    await obterEventoEditavel(campeonato._id);
    await aplicarSelecaoRanksEvento(interaction, match[1], ranks, aviso);
    return interaction.reply({ content: 'Ranks atualizados. O aviso foi enviado aos canais de avisos; os canais de inscrição e partidas dos ranks removidos foram excluídos e os dados históricos foram preservados.', flags: 64 });
  } catch (error) {
    console.error('[campeonato.edicao] falha ao atualizar ranks:', error);
    return interaction.reply({ content: `Não foi possível concluir a edição dos ranks: ${error.message}`, flags: 64 });
  }
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
        .setCustomId(`btn_camp_excluir_time_${campeonatoId}_${timeId}`)
        .setLabel('🗑️ Excluir Time')
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`select_camp_jogador_excluir_${campeonatoId}_${timeId}`)
        .setPlaceholder('Selecione jogador para excluir')
        .addOptions(opcoesJogadores)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_camp_excluir_jogador_${campeonatoId}_${timeId}`)
        .setLabel('👤 Excluir Jogador')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`select_camp_jogador_capitao_${campeonatoId}_${timeId}`)
        .setPlaceholder('Selecione novo capitão')
        .addOptions(opcoesJogadores)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_camp_trocar_capitao_${campeonatoId}_${timeId}`)
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
  const match = interaction.customId.match(/^btn_camp_excluir_time_([a-f0-9]{24})_([a-f0-9]{24})$/);
  if (!match) return safeReply(interaction, { content: 'Selecione um time para excluir novamente.', flags: 64 });
  const [, campeonatoId, timeId] = match;
  const time = await Time.findOneAndDelete({ _id: timeId, campeonatoId });
  if (!time) {
    return safeReply(interaction, { content: 'Time nao encontrado.', flags: 64 });
  }
  console.log('[Time] excluido', time._id, 'campeonatoId', campeonatoId);
  solicitarAtualizacaoPainelOrganizador(campeonatoId);
  return safeReply(interaction, { content: `Time **${time.nome || 'Sem nome'}** excluido.`, flags: 64 });
}

async function onConfigDados(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  return interaction.showModal(buildConfigModal());
}

async function onConfigSimultaneo(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) return interaction.update({ content: 'Sessão expirada.', embeds: [], components: [] });
  cfg.simultaneo = cfg.simultaneo === false;
  configPainel.set(`camp:config:${userId}`, cfg);
  return interaction.update(buildConfigPanel(userId));
}

function diagInicio(nome, interaction) {
  const t0 = Date.now();
  console.log(`[Diag Campeonato] entrou em ${nome}`, { customId: interaction.customId, userId: interaction.user?.id });
  return t0;
}

async function diagUpdate(nome, t0, interaction, payload) {
  try {
    const resultado = await interaction.update(payload);
    console.log(`[Diag Campeonato] ${nome} concluído em ${Date.now() - t0}ms`);
    return resultado;
  } catch (err) {
    console.error(`[Diag Campeonato] ${nome} falhou após ${Date.now() - t0}ms:`, { message: err?.message, code: err?.code });
    throw err;
  }
}

async function onConfigModo(interaction) {
  const t0 = diagInicio('onConfigModo', interaction);
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

  return diagUpdate('onConfigModo', t0, interaction, {
    content: 'Escolha o **modo de jogo**:',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function onSelectConfigModo(interaction) {
  const t0 = diagInicio('onSelectConfigModo', interaction);
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) {
    return interaction.update({ content: 'Sessão expirada.', embeds: [], components: [] });
  }
  cfg.modo = interaction.values[0];
  if (!modoPermiteTipoDupla(cfg.modo) || !['FIXA', 'SORTEADA'].includes(cfg.tipoDupla)) {
    cfg.tipoDupla = null;
  }
  cfg.formato = null;
  cfg.participantes = [];
  configPainel.set(`camp:config:${userId}`, cfg);
  return diagUpdate('onSelectConfigModo', t0, interaction, buildConfigPanel(userId));
}

async function onConfigTipoDupla(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) return interaction.update({ content: 'Sessão expirada.', embeds: [], components: [] });
  if (!modoPermiteTipoDupla(cfg.modo)) {
    return interaction.update({ content: 'Fixa ou sorteada só se aplica a modos de equipe.', ...buildConfigPanel(userId) });
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId('select_config_tipo_dupla')
    .setPlaceholder('Escolha como os times serão formados')
    .addOptions([
      { label: 'Fixa', value: 'FIXA', description: 'Os jogadores mantêm suas equipes', default: cfg.tipoDupla === 'FIXA' },
      { label: 'Sorteada', value: 'SORTEADA', description: 'O sistema organiza os jogadores', default: cfg.tipoDupla === 'SORTEADA' }
    ]);
  return interaction.update({
    content: 'Escolha o tipo de equipe antes de criar:',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function onSelectConfigTipoDupla(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Sem permissao.', flags: 64 });
  }
  const cfg = configPainel.get(`camp:config:${interaction.user.id}`);
  if (!cfg) return interaction.reply({ content: 'Sessão expirada.', flags: 64 });
  const tipoDupla = interaction.values[0];
  if (!modoPermiteTipoDupla(cfg.modo) || !['FIXA', 'SORTEADA'].includes(tipoDupla)) {
    return interaction.reply({ content: 'Escolha inválida para o modo selecionado.', flags: 64 });
  }
  cfg.tipoDupla = tipoDupla;
  configPainel.set(`camp:config:${interaction.user.id}`, cfg);
  return interaction.update(buildConfigPanel(interaction.user.id));
}

function buildRanksScreen(userId) {
  const cfg = configPainel.get(`camp:config:${userId}`);
  const selecionados = cfg?.ranksSelecionados || [];
  const linhas = config.ranks
    .map((r) => `${selecionados.includes(r.key) ? '✅' : '▫️'} ${r.emoji} ${r.label}`)
    .join('\n');
  const botoesRanks = config.ranks.map((r) => ({
    type: 2,
    style: selecionados.includes(r.key) ? 3 : 2,
    label: r.label,
    emoji: { name: r.emoji },
    custom_id: 'btn_config_rank_toggle_' + r.key
  }));
  const linhaConfirmar = [
    { type: 2, style: 3, label: `✅ Confirmar (${selecionados.length})`, custom_id: 'btn_config_rank_confirmar', disabled: selecionados.length === 0 },
    { type: 2, style: 4, label: 'Voltar', emoji: { name: '⬅️' }, custom_id: 'btn_config_rank_voltar' }
  ];
  return {
    content: `Selecione os ranks que o campeonato terá (pode escolher mais de um — cada rank selecionado vira um campeonato separado):\n\n${linhas}`,
    embeds: [],
    components: montarComponentes(botoesRanks.slice(0, 5), botoesRanks.slice(5), linhaConfirmar)
  };
}

async function onConfigRanks(interaction) {
  const t0 = diagInicio('onConfigRanks', interaction);
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg || !cfg.modo) {
    return interaction.update({ content: 'Escolha o modo primeiro.', embeds: [], components: [] });
  }
  return diagUpdate('onConfigRanks', t0, interaction, buildRanksScreen(userId));
}

async function onConfigRankToggle(interaction) {
  const t0 = diagInicio('onConfigRankToggle', interaction);
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) {
    return interaction.update({ content: 'Sessão expirada.', embeds: [], components: [] });
  }
  const rank = interaction.customId.replace('btn_config_rank_toggle_', '');
  cfg.ranksSelecionados = cfg.ranksSelecionados || [];
  const idx = cfg.ranksSelecionados.indexOf(rank);
  if (idx >= 0) cfg.ranksSelecionados.splice(idx, 1);
  else cfg.ranksSelecionados.push(rank);
  configPainel.set(`camp:config:${userId}`, cfg);
  return diagUpdate('onConfigRankToggle', t0, interaction, buildRanksScreen(userId));
}

async function onConfigRankConfirmar(interaction) {
  const t0 = diagInicio('onConfigRankConfirmar', interaction);
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg) {
    return interaction.update({ content: 'Sessão expirada.', embeds: [], components: [] });
  }
  console.log('[Diag Campeonato] ranks confirmados:', { ranksSelecionados: cfg.ranksSelecionados });
  if (!cfg.ranksSelecionados?.length) {
    return diagUpdate('onConfigRankConfirmar(vazio)', t0, interaction, buildRanksScreen(userId));
  }
  return diagUpdate('onConfigRankConfirmar', t0, interaction, buildConfigPanel(userId));
}

async function onConfigRankVoltar(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  return interaction.update(buildConfigPanel(userId));
}

async function onConfigEntrada(interaction) {
  const t0 = diagInicio('onConfigEntrada', interaction);
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const userId = interaction.user.id;
  const cfg = configPainel.get(`camp:config:${userId}`);
  if (!cfg || !cfg.modo) {
    return interaction.update({ content: 'Escolha o modo primeiro.', embeds: [], components: [] });
  }
  if (!cfg.ranksSelecionados?.length) {
    return interaction.update({ content: 'Escolha os ranks primeiro.', embeds: [], components: [] });
  }

  const buttons = [
    { type: 2, style: 3, label: 'Inscrição aberta', emoji: { name: '📝' }, custom_id: 'btn_config_entrada_aberta' },
    { type: 2, style: 2, label: 'Eu escolho os participantes', emoji: { name: '🔧' }, custom_id: 'btn_config_entrada_manual' },
    { type: 2, style: 4, label: 'Voltar', emoji: { name: '⬅️' }, custom_id: 'btn_config_entrada_voltar' }
  ];

  return diagUpdate('onConfigEntrada', t0, interaction, {
    content: 'Como os participantes entram?',
    embeds: [],
    components: toActionRows([buttons])
  });
}

async function onConfigEntradaEscolha(interaction) {
  const t0 = diagInicio('onConfigEntradaEscolha', interaction);
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
    return diagUpdate('onConfigEntradaEscolha(voltar)', t0, interaction, buildConfigPanel(userId));
  }
  configPainel.set(`camp:config:${userId}`, cfg);
  return diagUpdate('onConfigEntradaEscolha', t0, interaction, buildConfigPanel(userId));
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
    components: toActionRows([buttons])
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
    const guild = interaction.guild;
    const { dataInicio, dataFim } = construirPeriodoEvento(cfg.dataInicio, cfg.horarioInicio);
    
    const evento = await criarEvento(guild, {
      nome: cfg.nome,
      ranksSelecionados: cfg.ranksSelecionados,
      dataInicio,
      dataFim,
      dataLimiteInscricoes: cfg.dataLimiteInscricoes,
      organizadorId: interaction.user.id,
      modo: cfg.modo,
      tipoDupla: modoPermiteTipoDupla(cfg.modo) ? cfg.tipoDupla : 'FIXA',
      baseadoEmInscricoes: cfg.baseadoEmInscricoes,
      limiteInscricoes: cfg.limiteInscricoes,
      modalidade: cfg.formato,
      duracaoMin: cfg.duracaoMin || 180,
      horarioInicio: cfg.horarioInicio,
      simultaneo: cfg.simultaneo !== false,
      temTerceiroLugar: true,
      intervaloPartidasMin: 20
    });

    configPainel.delete(`camp:config:${userId}`);

    const statusPaineis = [];
    for (const campeonato of evento.campeonatos) {
      const publicados = await publicarPaineisCampeonato(guild, campeonato);
      statusPaineis.push({
        falhou: !publicados.inscricoes || !publicados.organizador || !publicados.avisos,
        texto: [
          `**${campeonato.rank.toUpperCase()}**`,
          `Inscrições: ${campeonato.canais?.inscricoes ? `<#${campeonato.canais.inscricoes}>` : 'canal indisponível'} ${publicados.inscricoes ? '✅' : '⚠️ painel não publicado'}`,
          `Organizador: ${campeonato.canais?.organizador ? `<#${campeonato.canais.organizador}>` : 'canal indisponível'} ${publicados.organizador ? '✅' : '⚠️ painel não publicado'}`,
          `Avisos: ${publicados.avisos ? '✅' : '⚠️ aviso não publicado'}`
        ].join(' | ')
      });
    }

    const falhaPublicacao = statusPaineis.some((status) => status.falhou);
    return interaction.editReply({
      content: `${falhaPublicacao ? '⚠️' : '✅'} Evento **${cfg.nome}** criado${falhaPublicacao ? ', mas houve falha ao publicar algum painel ou aviso' : ' com os painéis publicados'}.\n\n${statusPaineis.map((status) => status.texto).join('\n')}`,
      embeds: [],
      components: []
    });
  } catch (e) {
    console.error('[ConfigCriar] erro:', e);
    return interaction.editReply({
      ...buildConfigPanel(userId),
      content: `Erro ao criar campeonato: ${e.message}\nSua configuração foi mantida; revise os dados e tente novamente ou cancele.`
    });
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
  const [, campeonatoId, timeId] = interaction.customId.match(/^select_camp_jogador_excluir_([a-f0-9]{24})_([a-f0-9]{24})$/) || [];
  if (!campeonatoId || !timeId) return safeReply(interaction, { content: 'Selecione um time novamente.', flags: 64 });
  selecoesJogadoresTime.set(`${interaction.user.id}:${timeId}:excluir`, interaction.values[0]);
  return interaction.update({ content: 'Jogador selecionado. Clique em Excluir Jogador para confirmar.', embeds: [], components: [] });
}

async function onExcluirJogador(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Sem permissao.', flags: 64 });
  }
  const match = interaction.customId.match(/^btn_camp_excluir_jogador_([a-f0-9]{24})_([a-f0-9]{24})$/);
  if (!match) return safeReply(interaction, { content: 'Selecione um time para gerenciar novamente.', flags: 64 });
  const [, campeonatoId, timeId] = match;
  const chaveSelecao = `${interaction.user.id}:${timeId}:excluir`;
  const jogadorId = selecoesJogadoresTime.get(chaveSelecao);
  if (!jogadorId) {
    return safeReply(interaction, { content: 'Nenhum jogador selecionado.', flags: 64 });
  }
  const time = await Time.findOneAndUpdate(
    { _id: timeId, campeonatoId, 'jogadores.userId': jogadorId },
    { $pull: { jogadores: { userId: jogadorId } } },
    { new: true }
  );
  if (!time) {
    return safeReply(interaction, { content: 'Jogador nao encontrado no time.', flags: 64 });
  }
  selecoesJogadoresTime.delete(chaveSelecao);
  // If 1x1 and no players left, delete the team
  const modo = (await Campeonato.findById(campeonatoId).lean())?.modo || '1v1';
  if (['1v1', '2v2'].includes(modo) && time.jogadores.length === 0) {
    await Time.findByIdAndDelete(time._id);
    console.log('[Time] excluido por ficar vazio apos remover jogador', time._id);
  }
  console.log('[Jogador] excluido', jogadorId, 'do time', time._id);
  solicitarAtualizacaoPainelOrganizador(campeonatoId);
  return safeReply(interaction, { content: 'Jogador excluido do time.', flags: 64 });
}

async function onSelectJogadorCapitao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const [, campeonatoId, timeId] = interaction.customId.match(/^select_camp_jogador_capitao_([a-f0-9]{24})_([a-f0-9]{24})$/) || [];
  if (!campeonatoId || !timeId) return safeReply(interaction, { content: 'Selecione um time novamente.', flags: 64 });
  selecoesJogadoresTime.set(`${interaction.user.id}:${timeId}:capitao`, interaction.values[0]);
  return interaction.update({ content: 'Novo capitão selecionado. Clique em Trocar Capitão para confirmar.', embeds: [], components: [] });
}

async function onTrocarCapitao(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Sem permissao.', flags: 64 });
  }
  const match = interaction.customId.match(/^btn_camp_trocar_capitao_([a-f0-9]{24})_([a-f0-9]{24})$/);
  if (!match) return safeReply(interaction, { content: 'Selecione um time para gerenciar novamente.', flags: 64 });
  const [, campeonatoId, timeId] = match;
  const chaveSelecao = `${interaction.user.id}:${timeId}:capitao`;
  const novoCapitaoId = selecoesJogadoresTime.get(chaveSelecao);
  if (!novoCapitaoId) {
    return safeReply(interaction, { content: 'Nenhum jogador selecionado.', flags: 64 });
  }
  const time = await Time.findOneAndUpdate(
    { _id: timeId, campeonatoId },
    { $set: { capitaoId: novoCapitaoId } },
    { new: true }
  );
  if (!time) {
    return safeReply(interaction, { content: 'Time nao encontrado.', flags: 64 });
  }
  selecoesJogadoresTime.delete(chaveSelecao);
  console.log('[Capitao] trocado para', novoCapitaoId, 'no time', time._id);
  solicitarAtualizacaoPainelOrganizador(campeonatoId);
  return safeReply(interaction, { content: 'Capitão trocado com sucesso.', flags: 64 });
}

function register(registry) {
  registry.button('btn_campeonato_criar', onAbrirPainelCriacao);
  registry.button('btn_novo_campeonato', onAbrirPainelCriacao);
  // FLUXO 2 - Config panel
  registry.modal('modal_config_campeonato_dados', onSubmitConfigDados);
  registry.button('btn_config_dados', onConfigDados);
  registry.button('btn_config_simultaneo', onConfigSimultaneo);
  registry.button('btn_config_modo', onConfigModo);
  registry.select('select_config_modo', onSelectConfigModo);
  registry.button('btn_config_tipo_dupla', onConfigTipoDupla);
  registry.select('select_config_tipo_dupla', onSelectConfigTipoDupla);
  registry.button('btn_config_ranks', onConfigRanks);
  registry.button(/^btn_config_rank_toggle_(bronze|prata|ouro|platina|diamante|champion|grand_champion|omega_champion)$/, onConfigRankToggle);
  registry.button('btn_config_rank_confirmar', onConfigRankConfirmar);
  registry.button('btn_config_rank_voltar', onConfigRankVoltar);
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
  registry.button('btn_camp_inscrever_se', onBotaoInscreverSe);
  registry.button('btn_camp_inscrever_time', onBotaoInscreverTime);
  registry.button('btn_camp_inscricao_manual', onBotaoInscricaoManual);
  registry.button(/^btn_camp_inscricao_time_continuar_[a-f0-9]{24}_\d+$/, onContinuarInscricaoTime);
  registry.button(/^btn_camp_inscricao_time_cancelar_[a-f0-9]{24}$/, onCancelarInscricaoTime);
  registry.select(/^select_camp_inscricao_time_jogador_[a-f0-9]{24}$/, onSelecionarJogadorInscricaoTime);
  registry.modal(/^modal_camp_inscricao_time_[a-f0-9]{24}_\d+$/, onSubmitInscricaoTime);
  registry.modal('modal_camp_inscricao_manual', onSubmitInscricaoManual);
  registry.select('select_excluir_campeonato', onSelectExcluirCampeonato);
  registry.button(/^btn_confirmar_exclusao_\d+:\d+$/, onConfirmarExclusao);
  registry.button(/^btn_cancelar_exclusao_\d+:\d+$/, onCancelarExclusao);
  registry.select('select_camp_checkin_manual', onSelectCheckInOrganizador);
  // FLUXO 3 - Gestão (new patterns)
  registry.button(/^btn_encerrar_inscricoes_[a-f0-9]{24}$/, onBotaoFecharInscricoes);
  registry.button(/^btn_camp_fechar_inscricoes_[a-f0-9]{24}$/, onBotaoFecharInscricoes); // legacy
  registry.button(/^btn_gerenciar_participantes_[a-f0-9]{24}$/, onGerenciarTimes);
  registry.button(/^btn_camp_gerenciar_times_[a-f0-9]{24}$/, onGerenciarTimes); // legacy
  registry.button(/^btn_camp_editar_config_[a-f0-9]{24}$/, onAbrirEdicaoCampeonato);
  registry.button(/^btn_camp_editar_dados_[a-f0-9]{24}$/, (interaction) => onAbrirModalEdicao(interaction, 'dados'));
  registry.button(/^btn_camp_editar_avancado_[a-f0-9]{24}$/, (interaction) => onAbrirModalEdicao(interaction, 'avancado'));
  registry.modal(/^modal_camp_editar_dados_[a-f0-9]{24}$/, onSubmitDadosEvento);
  registry.modal(/^modal_camp_editar_avancado_[a-f0-9]{24}$/, onSubmitConfiguracoesEvento);
  registry.modal(/^modal_camp_aviso_ranks_[a-f0-9]{24}$/, onSubmitAvisoRanks);
  registry.select(/^select_camp_editar_ranks_[a-f0-9]{24}$/, onSelecionarRanksEvento);
  registry.select(/^select_camp_editar_(entrada|dupla|formato)_[a-f0-9]{24}$/, onSelecionarConfiguracaoEvento);
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
  registry.button(/^btn_camp_excluir_time_[a-f0-9]{24}_[a-f0-9]{24}$/, onExcluirTime);
  registry.button(/^btn_camp_excluir_jogador_[a-f0-9]{24}_[a-f0-9]{24}$/, onExcluirJogador);
  registry.button(/^btn_camp_trocar_capitao_[a-f0-9]{24}_[a-f0-9]{24}$/, onTrocarCapitao);
  registry.select(/^select_camp_jogador_excluir_[a-f0-9]{24}_[a-f0-9]{24}$/, onSelectJogadorExcluir);
  registry.select(/^select_camp_jogador_capitao_[a-f0-9]{24}_[a-f0-9]{24}$/, onSelectJogadorCapitao);
}

module.exports = {
  register,
  temPermissaoOrganizador,
  parseDataBR,
  construirPeriodoEvento,
  construirModalInscricaoTime,
  publicarPainelInscricao,
  publicarPaineisCampeonato,
  buildPainelOrganizadorCampeonato,
  atualizarPainelOrganizadorCampeonato,
  setCampeonatoClient
};
