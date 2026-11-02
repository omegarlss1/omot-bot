const config = require('../../config');

const CORES = {
  bronze: '#CD7F32',
  prata: '#C0C0C0',
  ouro: '#FFD700',
  platina: '#00CED1',
  diamante: '#B9F2FF',
  champion: '#FF8C00',
  grand_champion: '#FF1493',
  omega_champion: '#9400D3'
};

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder } = require('discord.js');

function montarComponentes(...grupos) {
  // Don't flat(Infinity) - preserve row grouping from arrays
  // Each top-level argument = one or more rows
  const actionRows = [];
  
  for (const grupo of grupos) {
    if (grupo == null) continue;
    
    if (grupo instanceof ActionRowBuilder) {
      if (grupo.components.length === 0) continue;
      if (grupo.components.length > 5) {
        throw new Error(`ActionRow com ${grupo.components.length} componentes (máx. 5)`);
      }
      actionRows.push(grupo);
    } else if (Array.isArray(grupo)) {
      // grupo can be: [obj, obj, obj] (one row) or [[obj,obj], [obj]] (multiple rows)
      // Check if first element is also an array = multiple rows
      if (grupo.length > 0 && Array.isArray(grupo[0])) {
        // Multiple rows: [[obj,obj], [obj]]
        for (const rowItems of grupo) {
          if (!Array.isArray(rowItems)) continue;
          const row = new ActionRowBuilder();
          for (const comp of rowItems) {
            if (comp instanceof StringSelectMenuBuilder || comp instanceof UserSelectMenuBuilder) {
              if (row.components.length > 0) throw new Error('Select/UserSelect deve ocupar ActionRow inteiro');
              row.addComponents(comp);
              actionRows.push(row);
            } else if (comp instanceof ButtonBuilder) {
              row.addComponents(comp);
            } else if (comp && typeof comp === 'object') {
              row.addComponents(ButtonBuilder.from(comp));
            }
          }
          if (row.components.length > 0) {
            if (row.components.length > 5) throw new Error(`ActionRow com ${row.components.length} componentes (máx. 5)`);
            actionRows.push(row);
          }
        }
      } else {
        // Single row: [obj, obj, obj]
        const row = new ActionRowBuilder();
        for (const comp of grupo) {
          if (comp instanceof StringSelectMenuBuilder || comp instanceof UserSelectMenuBuilder) {
            if (row.components.length > 0) throw new Error('Select/UserSelect deve ocupar ActionRow inteiro');
            row.addComponents(comp);
            actionRows.push(row);
          } else if (comp instanceof ButtonBuilder) {
            row.addComponents(comp);
          } else if (comp && typeof comp === 'object') {
            row.addComponents(ButtonBuilder.from(comp));
          }
        }
        if (row.components.length > 0) {
          if (row.components.length > 5) throw new Error(`ActionRow com ${row.components.length} componentes (máx. 5)`);
          actionRows.push(row);
        }
      }
    } else if (grupo && typeof grupo === 'object') {
      if (grupo.type === 3 || grupo.type === 5) {
        throw new Error('Select/UserSelect deve vir dentro de array para ocupar ActionRow inteiro');
      }
      const row = new ActionRowBuilder().addComponents(ButtonBuilder.from(grupo));
      actionRows.push(row);
    }
  }
  
  if (actionRows.length > 5) {
    throw new Error(`${actionRows.length} ActionRows (máx. 5)`);
  }
  return actionRows;
}

function toActionRows(components = []) {
  return montarComponentes(...components);
}

function corRank(rank) {
  return CORES[rank] || '#5865F2';
}

function embedCentralCampeonatos() {
  return {
    embeds: [{
      title: '🏆 Central de Campeonatos',
      description: '**Crie e gerencie seus campeonatos em 2 minutos.**\n\nOrganize inscrições, partidas e premiações sem sair do Discord.',
      color: 0xFFD700,
      thumbnail: { url: 'attachment://trofeu_dourado.png' },
      footer: {
        text: 'Ômega Bot • Painel fixo • /painel_campeonato',
        icon_url: 'attachment://omega_logo.png'
      }
    }],
    components: [[
      { type: 2, style: 3, label: '＋ Criar Novo Campeonato', emoji: { name: '🏆' }, custom_id: 'criar_campeonato' }
    ]]
  };
}

function embedCriarEvento({ guild, organizador }) {
  return {
    embeds: [{
      title: '🏆 Criar Novo Evento de Campeonato',
      description: 'Olá, ' + organizador + '! Configure um novo evento com múltiplos ranks. Cada rank vira um campeonato independente com canais próprios.',
      color: 0xFF6B00,
      fields: [
        { name: '📋 Como funciona', value: '1. Clique em **Criar Evento**\n2. Preencha nome e datas\n3. Selecione os ranks (1 ou mais)\n4. O bot cria a categoria + canais com permissões granulares' },
        { name: '🔐 Permissões', value: '`@everyone` não vê. Cada rank vê só seus canais. `@OrganizadorCamps` vê tudo.' }
      ]
    }],
      components: [[
        { type: 2, style: 1, label: '➕ Criar Evento', emoji: { name: '🏆' }, custom_id: 'btn_campeonato_criar_evento' }
    ]]
  };
}

function embedSelecionarRanks({
  nome,
  dataInicio,
  dataFim,
  ranksSelecionados = [],
  customIdPrefix = 'btn_camp_rank_toggle_',
  confirmCustomId = 'btn_camp_rank_confirmar'
}) {
  const fmt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const linhasRanks = ranksSelecionados.length
    ? ranksSelecionados.map((r) => '• ' + r).join('\n')
    : '_nenhum ainda_';
  return {
    embeds: [{
      title: '🎯 Selecione os Ranks do Evento',
      description: '**' + nome + '**\n📅 ' + fmt(dataInicio) + ' → ' + fmt(dataFim) + '\n\n**Ranks selecionados (' + ranksSelecionados.length + '):**\n' + linhasRanks,
      color: 0xFF6B00
    }],
    components: botoesSelecionarRanks({ customIdPrefix, confirmCustomId })
  };
}

function botoesSelecionarRanks({ customIdPrefix = 'btn_camp_rank_toggle_', confirmCustomId = 'btn_camp_rank_confirmar' } = {}) {
  const linha1 = config.ranks.slice(0, 5).map((r) => ({
    type: 2, style: 2, label: r.label,
    emoji: { name: r.emoji }, custom_id: customIdPrefix + r.key
  }));
  const linha2 = config.ranks.slice(5).map((r) => ({
    type: 2, style: 2, label: r.label,
    emoji: { name: r.emoji }, custom_id: customIdPrefix + r.key
  }));
  const linhaConfirmar = [
    { type: 2, style: 3, label: '✅ Confirmar Ranks', custom_id: confirmCustomId }
  ];
  const rows = [];
  if (linha1.length) rows.push(linha1);
  if (linha2.length) rows.push(linha2);
  rows.push(linhaConfirmar);
  return rows;
}

function embedEventoCriado({ evento, categoria, campeonatos }) {
  return {
    embeds: [{
      title: '✅ Evento ' + evento.nome + ' criado!',
      description: 'Categoria: ' + categoria + '\n\n**' + campeonatos.length + ' campeonato(s) criado(s):**',
      color: 0x00FF00,
      fields: campeonatos.map((c) => ({
        name: c.rank.toUpperCase() + ' - ' + c.modo,
        value: [
          '📝 Inscrições: <#' + (c.canais?.inscricoes || '—') + '>',
          '🛠️ Organizador: <#' + (c.canais?.organizador || '—') + '>',
          '📣 Avisos: <#' + (c.canais?.avisos || '—') + '>',
          '⚔️ Canais de fase são criados ao gerar as partidas.',
          c.painelInscricaoErro ? '⚠️ O painel de inscrição não pôde ser publicado. Verifique as permissões do bot neste canal.' : '✅ Botão de inscrição publicado'
        ].join('\n'),
        inline: true
      }))
    }]
  };
}

function embedPainelPartida({ partida, timeA, timeB }) {
  const checkA = partida.checkIns?.timeA?.fez ? '✅' : '⏳';
  const checkB = partida.checkIns?.timeB?.fez ? '✅' : '⏳';
  const timeTexto = (time) => (time?.jogadores || [])
    .map((jogador) => jogador.userId && !String(jogador.userId).startsWith('MANUAL_') ? `<@${jogador.userId}>` : null)
    .filter(Boolean)
    .join(' ');
  const placar = partida.placarEnviado?.timeA?.placar || partida.placarEnviado?.timeB?.placar || '0 x 0';
  const encerrada = ['FINALIZADA', 'CANCELADA', 'WO'].includes(partida.status);
  const vencedor = String(partida.vencedorId) === String(partida.timeB) ? timeB : timeA;
  const status = {
    AGUARDANDO_CHECKIN: '⏳ Aguardando check-in',
    AGUARDANDO_PLACAR: '🔴 AO VIVO',
    AGUARDANDO_VALIDACAO: '🧾 Aguardando validação',
    EM_DISPUTA_ORGANIZADOR: '⚖️ Em análise',
    FINALIZADA: `✅ Finalizada — Vencedor: ${vencedor?.nome || 'definido'} (${placar})`,
    CANCELADA: '❌ Cancelada',
    WO: `✅ Finalizada por W.O. — ${vencedor?.nome || 'Vencedor'}`
  }[partida.status] || '⏳ Aguardando';
  const numero = Number(String(partida.bracketMeta?.matchKey || '').match(/\d+$/)?.[0]) || partida.rodada || 1;
  const horario = partida.estimatedStartAt
    ? `<t:${Math.floor(new Date(partida.estimatedStartAt).getTime() / 1000)}:t>`
    : 'Horário a definir';
  const controles = encerrada
    ? [
      { type: 2, style: 2, label: 'Ver Prints', custom_id: 'btn_camp_ver_prints_' + partida._id, emoji: { name: '📊' } },
      { type: 2, style: 2, label: 'Abrir Thread', custom_id: 'btn_camp_abrir_thread_' + partida._id, emoji: { name: '💬' } }
    ]
    : [
      { type: 2, style: 3, label: 'Check-in', custom_id: 'btn_camp_checkin_' + partida._id, emoji: { name: '✅' } },
      { type: 2, style: 4, label: 'Reportar W.O.', custom_id: 'btn_camp_adversario_faltou_' + partida._id, emoji: { name: '⚠️' } },
      { type: 2, style: 1, label: 'Enviar placar', custom_id: 'btn_camp_enviar_placar_' + partida._id, emoji: { name: '🏆' } },
      { type: 2, style: 2, label: 'Enviar Print', custom_id: 'btn_camp_enviar_print_' + partida._id, emoji: { name: '📸' } },
      { type: 2, style: 2, label: 'Abrir Thread', custom_id: 'btn_camp_abrir_thread_' + partida._id, emoji: { name: '💬' } }
    ];
  return {
    embeds: [{
      title: `🕒 Partida #${numero} — ${horario}`,
      description: `**${timeA?.nome || 'A definir'}** ${checkA}  **${placar}**  **VS**  ${checkB} **${timeB?.nome || 'A definir'}**\n` +
        `${timeTexto(timeA)}${timeTexto(timeA) && timeTexto(timeB) ? ' · ' : ''}${timeTexto(timeB)}`,
      color: partida.status === 'AGUARDANDO_PLACAR' ? 0xE74C3C : encerrada ? 0x23A559 : 0x5865F2,
      footer: { text: `${status} · Fase ${partida.fase || 'R1'}` },
      ...(partida.duelos?.length ? {
        fields: [{
          name: '⚔️ Duplas',
          value: partida.duelos.map((duelo, index) =>
            `Dupla ${index + 1}: ${duelo.placarA ?? '—'} x ${duelo.placarB ?? '—'}`
          ).join('\n').slice(0, 1000)
        }]
      } : {})
    }],
    components: [controles]
  };
}

function embedPlacarEnviado({ partida, lado, placar, dueloIndex }) {
  const dueloInfo = dueloIndex !== null && partida.duelos && partida.duelos[dueloIndex]
    ? ' (Dupla ' + (dueloIndex + 1) + ')'
    : '';
  return {
    embeds: [{
      title: '⏳ Placar Enviado — Aguardando Validação',
      description: 'Time ' + lado + ' enviou placar **' + placar + '**' + dueloInfo + '.\nO time adversário deve validar ou contestar.',
      color: 0xFFA500
    }],
    components: [[
      { type: 2, style: 3, label: '✅ Validar Placar', custom_id: 'btn_camp_validar_placar_' + partida._id, emoji: { name: '✅' } },
      { type: 2, style: 4, label: '❌ Contestar', custom_id: 'btn_camp_contestar_placar_' + partida._id, emoji: { name: '❌' } }
    ]]
  };
}

function embedDisputaOrganizador({ partida, placarA, placarB }) {
  return {
    embeds: [{
      title: '⚖️ Disputa de Placar — Organização',
      description: 'Os times enviaram placares diferentes. A staff precisa definir.',
      color: 0xFF6B00,
      fields: [
        { name: '🟦 Placar Time A', value: placarA || 'não enviado', inline: true },
        { name: '🟥 Placar Time B', value: placarB || 'não enviado', inline: true }
      ]
    }]
  };
}

function embedBracket(times = []) {
  const linhas = [];
  for (let i = 0; i < times.length; i += 2) {
    const a = times[i] || { nome: 'TBD' };
    const b = times[i + 1] || { nome: 'TBD' };
    linhas.push('**' + a.nome + '** vs **' + b.nome + '**');
  }
  return {
    embeds: [{
      title: '🏆 Bracket — Rodada 1',
      description: linhas.join('\n') || 'Sem chaves geradas ainda.',
      color: 0xFFD700
    }]
  };
}

function embedClassificacao({ classificacao, desempatesPendentes }) {
  const linhas = classificacao.map((c) =>
    '**' + c.posicao + 'º** ' + c.nome + ' — ' + c.pontos + ' pts (' + c.vitorias + 'V / ' + c.derrotas + 'D)'
  ).join('\n');
  let desc = linhas || 'Nenhum time classificado ainda.';
  if (desempatesPendentes?.length) {
    desc += '\n\n⚠️ **Desempates pendentes:**\n' + desempatesPendentes.map((d) =>
      '• ' + d.tipo + ': ' + d.times.length + ' time(s) (' + d.times.join(', ') + ')'
    ).join('\n');
  }
  return { embeds: [{ title: '📊 Classificação', description: desc, color: 0x00C2FF }] };
}

function embedCampeaoDefinido({ vencedor, podio }) {
  const linhas = podio.map((p) => p.posicao + 'º — ' + p.nome).join('\n');
  return {
    embeds: [{
      title: '🏆 Campeão Definido!',
      description: '**' + vencedor.nome + '** é o grande campeão!\n\n**Pódio:**\n' + linhas,
      color: 0xFFD700
    }]
  };
}

function embedPainelAdmin({ campeonato, totalTimes = 0 }) {
  const status = {
    INSCRICOES_ABERTAS: '🟢 INSCRIÇÕES ABERTAS',
    INSCRICOES_FECHADAS: '🔒 INSCRIÇÕES ENCERRADAS',
    AGUARDANDO_INICIO: '🕒 AGUARDANDO INÍCIO',
    EM_ANDAMENTO: '🔴 EM ANDAMENTO',
    FINALIZADO: '🏁 FINALIZADO',
    CANCELADO: '⛔ CANCELADO'
  }[campeonato.status] || '⚪ STATUS INDEFINIDO';
  const total = campeonato.limiteInscricoes
    ? `${totalTimes}/${campeonato.limiteInscricoes} times`
    : `${totalTimes} ${totalTimes === 1 ? 'time' : 'times'}`;
  const botoes = [
    [
      { type: 2, style: 1, label: '📊 Classificação', custom_id: 'btn_camp_ver_classificacao', emoji: { name: '📊' } },
      { type: 2, style: 1, label: '👥 Gerenciar Times', custom_id: 'btn_camp_gerenciar_times_' + campeonato._id, emoji: { name: '👥' } }
    ],
    [
      {
        type: 2,
        style: 1,
        label: '⚔️ Gerar Partidas',
        custom_id: 'btn_camp_gerar_bracket_' + campeonato._id,
        emoji: { name: '⚔️' },
        disabled: campeonato.status === 'INSCRICOES_ABERTAS'
      },
      { type: 2, style: 1, label: '🔒 Encerrar inscrições', custom_id: 'btn_camp_fechar_inscricoes_' + campeonato._id, emoji: { name: '🔒' } }
    ],
    [
      { type: 2, style: 2, label: '📣 Broadcast', custom_id: 'btn_camp_broadcast', emoji: { name: '📣' } }
    ]
  ];
  
  if (campeonato.baseadoEmInscricoes && !campeonato.modalidade && campeonato.status === 'INSCRICOES_ABERTAS') {
    botoes.push([
      { type: 2, style: 3, label: '📋 Definir Formato', custom_id: 'btn_camp_definir_formato_' + campeonato._id, emoji: { name: '📋' } }
    ]);
  }

  if (campeonato.status !== 'CANCELADO') {
    botoes.push([
      { type: 2, style: 2, label: '⚙️ Editar', custom_id: 'btn_camp_editar_config_' + campeonato._id, emoji: { name: '⚙️' } },
      { type: 2, style: 3, label: '🏁 Finalizar', custom_id: 'btn_camp_finalizar_' + campeonato._id, emoji: { name: '🏁' } },
      { type: 2, style: 4, label: '⛔ Cancelar', custom_id: 'btn_camp_cancelar_' + campeonato._id, emoji: { name: '⛔' } },
      { type: 2, style: 4, label: '🗑️ Excluir', custom_id: 'btn_camp_excluir_campeonato_' + campeonato._id, emoji: { name: '🗑️' } }
    ]);
  } else {
    botoes.push([
      { type: 2, style: 1, label: '♻️ Reabrir', custom_id: 'btn_camp_reabrir_' + campeonato._id, emoji: { name: '♻️' } }
    ]);
  }
  return {
    embeds: [{
      title: '🛠️ Painel do Organizador — ' + campeonato.rank.toUpperCase(),
      description: `**${status} • ${total}**`,
      color: 0xFF8C00,
    }],
    components: botoes
  };
}

function embedCancelamentoConfirmado({ motivo }) {
  return { embeds: [{ title: '⛔ Campeonato cancelado', description: motivo || 'Sem motivo informado.', color: 0xFF0000 }] };
}

function embedReaberturaConfirmada() {
  return { embeds: [{ title: '♻️ Campeonato reaberto', description: 'O campeonato voltou ao status EM_ANDAMENTO.', color: 0x00FF00 }] };
}

function embedTimeDesclassificado({ time, partidasAnuladas }) {
  return {
    embeds: [{
      title: '⛔ Time desclassificado',
      description: 'Time **' + (time.nome || time._id) + '** foi desclassificado. ' + partidasAnuladas + ' partida(s) anulada(s) por WO.',
      color: 0xFF0000
    }]
  };
}

function embedPlacarAjustado({ novoPlacar, vencedorNome }) {
  return {
    embeds: [{
      title: '🛠️ Placar ajustado pela organização',
      description: 'Novo placar: **' + novoPlacar + '**\nVencedor: **' + vencedorNome + '**',
      color: 0xFFA500
    }]
  };
}

module.exports = {
  embedCentralCampeonatos,
  embedCriarEvento,
  embedSelecionarRanks,
  botoesSelecionarRanks,
  embedEventoCriado,
  embedPainelInscricao,
  embedInscricaoConfirmada,
  embedResumoCorte,
  embedMenuFormato,
  embedPainelPartida,
  embedPlacarEnviado,
  embedDisputaOrganizador,
  embedBracket,
  embedClassificacao,
  embedCampeaoDefinido,
  embedPainelAdmin,
  embedCancelamentoConfirmado,
  embedReaberturaConfirmada,
  embedTimeDesclassificado,
  embedPlacarAjustado,
  montarComponentes,
  corRank,
  CORES,
  toActionRows
};

function embedPainelInscricao(campeonato, totalInscritos) {
  const rankLabel = config.ranks.find((rank) => rank.key === campeonato.rank)?.label || campeonato.rank || 'Campeonato';
  const numero = String(campeonato.nome || '').match(/#\s*(\d+)/)?.[1];
  const modoDuelo = String(campeonato.modo || '').toLowerCase() === '1v1'
    || Number(campeonato.maxJogadoresPorTime) <= 1;
  const limite = Number(campeonato.limiteInscricoes) || 0;
  const progresso = limite ? Math.min(1, (Number(totalInscritos) || 0) / limite) : 0;
  const barra = limite
    ? `${'🟩'.repeat(Math.round(progresso * 8))}${'⬛'.repeat(8 - Math.round(progresso * 8))}`
    : '♾️ Inscrições sem limite de vagas';
  const statusAberto = campeonato.status === 'INSCRICOES_ABERTAS';
  return {
    embeds: [{
      title: `${statusAberto ? '🟢 Inscrições abertas' : '🔒 Inscrições encerradas'} — ${rankLabel}${numero ? ` #${numero}` : ''}`,
      description: (modoDuelo
        ? 'Inscreva-se com sua conta Discord.'
        : 'Inscreva seu time e informe os jogadores.') +
        `\nCargo necessário: **${rankLabel}**.`,
      color: statusAberto ? 0x23A559 : 0x808080,
      fields: [
        { name: '🎮 Formato', value: String(campeonato.modo || '—'), inline: true },
        {
          name: '👥 Times',
          value: limite
            ? `${Number(totalInscritos) || 0}/${limite}\n${barra}`
            : `${Number(totalInscritos) || 0} inscritos\n${barra}`,
          inline: true
        }
      ]
    }],
    components: modoDuelo
      ? [[
          { type: 2, style: 3, label: 'Inscrever meu time', custom_id: 'btn_camp_inscrever_se', emoji: { name: '✅' }, disabled: !statusAberto },
          { type: 2, style: 2, label: 'Pedir inscrição manual', custom_id: 'btn_camp_inscricao_manual', emoji: { name: '🛠️' }, disabled: !statusAberto }
        ], [
          { type: 2, style: 3, label: 'Inscrever Time (até 3)', custom_id: 'btn_camp_inscrever_time_usuario', emoji: { name: '👥' }, disabled: !statusAberto },
          { type: 2, style: 1, label: 'Inscrever WhatsApp', custom_id: 'btn_camp_inscricao_whatsapp', emoji: { name: '📱' }, disabled: !statusAberto },
          { type: 2, style: 1, label: 'Inscrição Individual', custom_id: 'btn_camp_inscricao_individual', emoji: { name: '🆔' }, disabled: !statusAberto }
        ]]
      : [[
          { type: 2, style: 3, label: 'Inscrever meu time', custom_id: 'btn_camp_inscrever_time', emoji: { name: '✅' }, disabled: !statusAberto },
          { type: 2, style: 2, label: 'Pedir inscrição manual', custom_id: 'btn_camp_inscricao_manual', emoji: { name: '🛠️' }, disabled: !statusAberto }
        ], [
          { type: 2, style: 3, label: 'Inscrever Time (até 3)', custom_id: 'btn_camp_inscrever_time_usuario', emoji: { name: '👥' }, disabled: !statusAberto },
          { type: 2, style: 1, label: 'Inscrever WhatsApp', custom_id: 'btn_camp_inscricao_whatsapp', emoji: { name: '📱' }, disabled: !statusAberto },
          { type: 2, style: 1, label: 'Inscrição Individual', custom_id: 'btn_camp_inscricao_individual', emoji: { name: '🆔' }, disabled: !statusAberto }
        ]]
  };
}

function embedInscricaoConfirmada({ time, capitao }) {
  return {
    embeds: [{
      title: '✅ Inscrição Confirmada!',
      description: '**' + time.nome + '** entrou no campeonato.\nCapitão: <@' + capitao.userId + '> (' + capitao.nickSnapshot + ')',
      color: 0x00FF00
    }]
  };
}

function embedResumoCorte({ totalAntes, totalDepois, removidos, motivoCorte, potenciaDe2, totalTimes, menuFormatoNecessario, alternativas }) {
  const fields = [
    { name: '👥 Inscritos antes', value: String(totalAntes), inline: true },
    { name: '🗑️ Removidos', value: String(removidos) + (motivoCorte ? ' (' + motivoCorte + ')' : ''), inline: true },
    { name: '✅ Restantes', value: String(totalDepois), inline: true }
  ];
  if (potenciaDe2) {
    fields.push({ name: '🎯 Total de times', value: String(totalTimes) + ' (potência de 2 — pode iniciar single elimination)', inline: false });
  } else if (menuFormatoNecessario) {
    fields.push({
      name: '⚠️ Não é potência de 2',
      value: 'Total de times: **' + totalTimes + '**. Escolha um formato alternativo:\n' + alternativas.map((f) => '• ' + f).join('\n'),
      inline: false
    });
  }
  return { embeds: [{ title: '✂️ Corte Realizado', color: potenciaDe2 ? 0x00FF00 : 0xFFA500, fields }] };
}

function embedMenuFormato(campeonatoId, totalTimes, alternativas) {
  return {
    embeds: [{
      title: '⚠️ Escolha o Formato do Campeonato',
      description: 'Com **' + totalTimes + '** times, não é possível usar Single Elimination.\n\n' +
        'Como organizador, escolha um formato alternativo:',
      color: 0xFFA500
    }],
    components: [alternativas.map((f) => ({
      type: 2, style: 1,
      label: f.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      custom_id: 'btn_camp_formato_' + f + '_' + campeonatoId
    }))]
  };
}
