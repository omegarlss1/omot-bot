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
  return interaction.update({
    ...embedCriarEvento({ guild: interaction.guild, organizador: interaction.member }),
    flags: 64
  });
}

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
  // Extrair campeonatoId do customId (btn_camp_fechar_inscricoes_<id>)
  const campeonatoId = interaction.customId.replace('btn_camp_fechar_inscricoes_', '');
  const campeonato = await Campeonato.findById(campeonatoId);
  if (!campeonato) {
    console.error('[Encerrar] Campeonato não encontrado, ID extraído:', campeonatoId);
    return safeReply(interaction, { content: `❌ Campeonato não encontrado (ID: ${campeonatoId}). Tente reabrir o painel /painel-organizador`, flags: 64 });
  }
  const inscricoes = await listarInscricoes(campeonato._id);
  await fecharInscricoes(campeonato._id);
  console.log('[Finalizar] campeonatoId', campeonato._id, 'status INSCRICOES_FECHADAS');
  // Atualizar painel do organizador se estiver aberto
  const canalOrgao = campeonato.canais?.organizador;
  if (canalOrgao) {
    try {
      const canal = await interaction.guild.channels.fetch(canalOrgao);
      if (canal) {
        const campAtualizado = await Campeonato.findById(campeonato._id).lean();
        const { atualizarPainelOrganizador } = require('./services/painel');
        await atualizarPainelOrganizador(canal, campAtualizado, 'gestao');
      }
    } catch (e) {
      console.warn('[Finalizar] falha ao atualizar painel:', e.message);
    }
  }
  return safeReply(interaction, { 
    content: 'Inscricoes fechadas. ' + inscricoes.length + ' time(s) inscrito(s).', 
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

async function onGerenciarTimes(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return safeReply(interaction, { content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  const campeonatoId = interaction.customId.replace('btn_camp_gerenciar_times_', '');
  const campeonato = await Campeonato.findById(campeonatoId).lean();
  if (!campeonato) {
    return safeReply(interaction, { content: 'Campeonato não encontrado.', flags: 64 });
  }
  // Find the painel organizador message and update it to show 'times' tab
  const canalOrgao = campeonato.canais?.organizador;
  if (!canalOrgao) {
    return safeReply(interaction, { content: 'Canal de organizador não configurado.', flags: 64 });
  }
  try {
    const canal = await interaction.guild.channels.fetch(canalOrgao);
    if (!canal) {
      return safeReply(interaction, { content: 'Canal de organizador não encontrado.', flags: 64 });
    }
    // Get the painel organizador message
    const messageId = campeonato.painelOrganizador?.mensagens?.times || campeonato.painelOrganizador?.dinamicaMessageId;
    let mensagem = messageId ? await canal.messages.fetch(messageId).catch(() => null) : null;
    
    // If no existing message, we'll create one by calling the 'times' tab logic
    const times = await Time.find({ campeonatoId }).lean();
    const linhas = times.map((t, i) => {
      const jogadores = (t.jogadores || []).map(j => {
        if (j.origem === 'WHATSAPP' || String(j.userId || '').startsWith('MANUAL_WHATSAPP_')) {
          return j.nickSnapshot || '—';
        }
        return `<@${j.userId}>`;
      }).join(', ') || 'Sem jogadores';
      return `${i + 1}. **${t.nome || 'Sem nome'}** — ${jogadores}`;
    }).join('\n') || 'Nenhum time definido.';
    
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
            .setCustomId('select_camp_time_acao_' + campeonatoId)
            .setPlaceholder('Selecione um time para gerenciar')
            .addOptions(opcoesTimes)
        )
      );
    }
    
    const payload = {
      embeds: [{
        title: '👥 ABA 2 - TIMES DEFINIDOS',
        description: linhas,
        color: 0x00FF00,
        footer: { text: `Total: ${times.length} time(s)` }
      }],
      components: components
    };
    
    if (mensagem) {
      await mensagem.edit(payload);
      await Campeonato.updateOne(
        { _id: campeonatoId },
        { $set: { 'painelOrganizador.mensagens.times': mensagem.id } }
      );
    } else {
      mensagem = await canal.send(payload);
      await Campeonato.updateOne(
        { _id: campeonatoId },
        { $set: { 'painelOrganizador.mensagens.times': mensagem.id } }
      );
    }
    
    return safeReply(interaction, { content: 'Painel de times atualizado no canal de organizador.', flags: 64 });
  } catch (e) {
    console.error('[GerenciarTimes] erro:', e);
    return safeReply(interaction, { content: 'Erro ao atualizar painel de times.', flags: 64 });
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
  const campeonatoId = interaction.customId.replace('btn_camp_definir_formato_', '');
  const select = new StringSelectMenuBuilder()
    .setCustomId('modal_camp_definir_formato_select_' + campeonatoId)
    .setPlaceholder('Escolha o formato do campeonato')
    .addOptions([
      { label: 'Single Elimination', value: 'single-elimination', description: 'Eliminatória simples' },
      { label: 'Double Elimination', value: 'double-elimination', description: 'Eliminatória dupla' },
      { label: 'Round Robin', value: 'round-robin', description: 'Todos contra todos' },
      { label: 'Grupos + Mata-mata', value: 'grupos-mata-mata', description: 'Fase de grupos + eliminatória' }
    ]);
  return interaction.update({
    content: 'Selecione o formato do campeonato:',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function onDefinirFormatoSelect(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.update({ content: 'Sem permissao.', embeds: [], components: [] });
  }
  const match = interaction.customId.match(/^modal_camp_definir_formato_select_([a-f0-9]{24})$/);
  if (!match) return;
  const [, campeonatoId] = match;
  const formato = interaction.values[0];
  await definirFormato(campeonatoId, formato);
  
  const campeonato = await Campeonato.findById(campeonatoId);
  if (!campeonato) {
    return interaction.update({ content: 'Campeonato não encontrado.', embeds: [], components: [] });
  }
  
  // Re-criar os botões do painel mantendo o select de formato com o valor selecionado
  const rowFormato = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
     .setCustomId(`modal_camp_definir_formato_select_${campeonato._id}`)
     .setPlaceholder(`Formato atual: ${formato}`)
     .addOptions([
        { label: 'Single Elimination', value: 'single-elimination', default: formato==='single-elimination' },
        { label: 'Double Elimination', value: 'double-elimination', default: formato==='double-elimination' },
        { label: 'Round Robin', value: 'round-robin', default: formato==='round-robin' },
        { label: 'Grupos + Mata-mata', value: 'grupos-mata-mata', default: formato==='grupos-mata-mata' }
      ])
  );

  const rowAcoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_camp_gerar_bracket_${campeonato._id}`)
      .setLabel('🎯 Gerar Bracket')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_camp_fechar_inscricoes_${campeonato._id}`)
      .setLabel('🔒 Encerrar Inscrições')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(campeonato.status==='INSCRICOES_FECHADAS'),
    new ButtonBuilder()
      .setCustomId(`btn_camp_gerenciar_times_${campeonato._id}`)
      .setLabel('👥 Gerenciar Times')
      .setStyle(ButtonStyle.Secondary)
  );

  // IMPORTANTE: usar update, não reply, para manter mensagem
  return interaction.update({
    content: `✅ Formato definido: **${formato.toUpperCase()}** para **${campeonato.nome}**.\nAgora clique em Gerar Bracket.`,
    components: [rowFormato, rowAcoes]
  });
}

async function onBotaoGerarBracket(interaction) {
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps pode gerar bracket.', flags: 64 });
  }
  // Try to get campeonato ID from customId first (btn_camp_gerar_bracket_<id>)
  let campeonato;
  const match = interaction.customId.match(/^btn_camp_gerar_bracket_([a-f0-9]{24})$/);
  if (match) {
    campeonato = await Campeonato.findById(match[1]);
  } else {
    campeonato = await findCampeonatoPorCanal(interaction.channelId);
  }
  if (!campeonato) {
    return interaction.reply({ content: 'Campeonato nao encontrado.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const resultado = await gerarBracket(campeonato._id);
    
    // Post bracket to #partidas channel
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
    
    if (resultado.canvas) {
      return interaction.editReply({
        content: `Bracket gerado! ${resultado.totalPartidas} partidas na R1. Postado em <#${campeonato.canais?.partidas}>.`,
        files: [new AttachmentBuilder(resultado.canvas, { name: `bracket-${campeonato.rank}.png` })],
        embeds: [],
        components: []
      });
    }
    return interaction.editReply({
      content: 'Bracket gerado! ' + resultado.totalPartidas + ' partidas na R1. Veja em <#' + campeonato.canais.partidas + '>.',
      embeds: [],
      components: []
    });
  } catch (error) {
    if (error instanceof BracketError) {
      return safeReply(interaction, { content: error.message });
    }
    console.error('[campeonato.gerarBracket] erro:', error);
    return safeReply(interaction, { content: 'Erro ao gerar bracket.' });
  }
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
  const cid = interaction.customId.replace('btn_camp_finalizar_', '');
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    const camp = await Campeonato.findById(cid);
    if (!camp) return interaction.editReply({ content: 'Campeonato nao encontrado.' });
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
  const cid = interaction.customId.replace('btn_camp_cancelar_', '');
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    await cancelarCampeonato({ campeonatoId: cid, executadoPor: interaction.user.id });
    return interaction.editReply(embedCancelamentoConfirmado({ motivo: 'Cancelado por organizador.' }));
  } catch (error) {
    if (error instanceof AdminError) return interaction.editReply({ content: error.message });
    console.error('[campeonato.cancelar] erro:', error);
    return interaction.editReply({ content: 'Erro ao cancelar.' });
  }
}

async function onBotaoReabrir(interaction) {
  const cid = interaction.customId.replace('btn_camp_reabrir_', '');
  if (!temPermissaoOrganizador(interaction.member)) {
    return interaction.reply({ content: 'Apenas @OrganizadorCamps.', flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  try {
    await reabrirCampeonato({ campeonatoId: cid, executadoPor: interaction.user.id });
    return interaction.editReply(embedReaberturaConfirmada());
  } catch (error) {
    if (error instanceof AdminError) return interaction.editReply({ content: error.message });
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
  registry.button('btn_campeonato_criar_evento', onBotaoCriarEvento);
  registry.button('btn_novo_campeonato', onBotaoCriarEvento);
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
  registry.button(/^btn_camp_fechar_inscricoes_[a-f0-9]{24}$/, onBotaoFecharInscricoes);
  registry.button(/^btn_camp_gerenciar_times_[a-f0-9]{24}$/, onGerenciarTimes);
  registry.button('btn_camp_cortar', onBotaoCortar);
  registry.button(/^btn_camp_formato_(round-robin|grupos-mata-mata|double-elimination|single-elimination)_[a-f0-9]{24}$/, onEscolherFormato);
  registry.button(/^btn_camp_definir_formato_[a-f0-9]{24}$/, onDefinirFormato);
  registry.select(/^modal_camp_definir_formato_select_[a-f0-9]{24}$/, onDefinirFormatoSelect);
  registry.button('btn_camp_gerar_bracket', onBotaoGerarBracket);
  registry.button(/^btn_camp_gerar_bracket_[a-f0-9]{24}$/, onBotaoGerarBracket);
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
