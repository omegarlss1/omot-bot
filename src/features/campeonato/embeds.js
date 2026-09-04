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

function corRank(rank) {
  return CORES[rank] || '#5865F2';
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

function embedSelecionarRanks({ nome, dataInicio, dataFim, ranksSelecionados = [] }) {
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
    components: botoesSelecionarRanks()
  };
}

function botoesSelecionarRanks() {
  const linha1 = config.ranks.slice(0, 5).map((r) => ({
    type: 2, style: 2, label: r.label,
    emoji: { name: r.emoji }, custom_id: 'btn_camp_rank_toggle_' + r.key
  }));
  const linha2 = config.ranks.slice(5).map((r) => ({
    type: 2, style: 2, label: r.label,
    emoji: { name: r.emoji }, custom_id: 'btn_camp_rank_toggle_' + r.key
  }));
  const linhaConfirmar = [
    { type: 2, style: 3, label: '✅ Confirmar Ranks', custom_id: 'btn_camp_rank_confirmar' }
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
          '📝 Inscrições: <#' + (c.canals?.inscricoes || '—') + '>',
          '🎮 Partidas: <#' + (c.canals?.partidas || '—') + '>',
          '📸 Prints: <#' + (c.canals?.prints || '—') + '>'
        ].join('\n'),
        inline: true
      }))
    }]
  };
}

function embedPainelPartida({ partida, timeA, timeB }) {
  const checkA = partida.checkIns?.timeA?.fez ? '✅' : '⏳';
  const checkB = partida.checkIns?.timeB?.fez ? '✅' : '⏳';
  const statusEmoji = {
    AGUARDANDO_CHECKIN: '⏰', AGUARDANDO_PLACAR: '🎮', AGUARDANDO_VALIDACAO: '⏳',
    EM_DISPUTA_ORGANIZADOR: '⚖️', FINALIZADA: '🏆', CANCELADA: '❌', WO: '🚫'
  }[partida.status] || '❓';
  return {
    embeds: [{
      title: statusEmoji + ' Partida — Rodada ' + (partida.rodada || 1),
      description: 'Fase: **' + (partida.fase || 'R1') + '** | Status: **' + partida.status + '**',
      color: 0x00C2FF,
      fields: [
        { name: '🟦 Time A', value: (timeA?.nome || 'A definir') + ' ' + checkA, inline: true },
        { name: '🟥 Time B', value: (timeB?.nome || 'A definir') + ' ' + checkB, inline: true },
        { name: '🕐 Janela check-in', value: new Date(partida.janelaCheckIn.inicio).toLocaleString('pt-BR') + ' → ' + new Date(partida.janelaCheckIn.fim).toLocaleString('pt-BR'), inline: false }
      ]
    }],
    components: [[
      { type: 2, style: 3, label: '✅ Check-in', custom_id: 'btn_camp_checkin_' + partida._id, emoji: { name: '✅' } },
      { type: 2, style: 4, label: '🚫 Adversário não compareceu', custom_id: 'btn_camp_adversario_faltou_' + partida._id, emoji: { name: '🚫' } },
      { type: 2, style: 1, label: '🏆 Enviar Placar', custom_id: 'btn_camp_enviar_placar_' + partida._id, emoji: { name: '🏆' } }
    ]]
  };
}

function embedPlacarEnviado({ partida, lado, placar }) {
  return {
    embeds: [{
      title: '⏳ Placar Enviado — Aguardando Validação',
      description: 'Time ' + lado + ' enviou placar **' + placar + '**.\nO time adversário deve validar ou contestar.',
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

function embedPainelAdmin({ campeonato }) {
  return {
    embeds: [{
      title: '🛠️ Painel Admin — ' + campeonato.rank.toUpperCase(),
      description: 'Ações restritas a organizadores do campeonato `' + campeonato._id + '`.',
      color: 0xFF6B00,
      fields: [
        { name: '📌 Status', value: campeonato.status, inline: true }
      ]
    }],
    components: [[
      { type: 2, style: 1, label: '🏁 Finalizar', custom_id: 'btn_camp_finalizar_' + campeonato._id, emoji: { name: '🏁' } },
      { type: 2, style: 4, label: '⛔ Cancelar', custom_id: 'btn_camp_cancelar_' + campeonato._id, emoji: { name: '⛔' } }
    ]]
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
  corRank,
  CORES
};

function embedPainelInscricao(campeonato, totalInscritos) {
  const rankLabel = String(campeonato.rank || '').toUpperCase();
  return {
    embeds: [{
      title: '🎮 Inscrições Abertas — ' + rankLabel,
      description: 'Campeonato: **' + campeonato.nome + '**\nModo: **' + campeonato.modo + '** | Tipo: **' + campeonato.tipoDupla + '**\n\n' +
        'Clique no botão abaixo para inscrever seu time. Você deve ter o **cargo @' + rankLabel + '** no Discord e o rank correspondente na sua ficha.',
      color: 0x00C2FF,
      fields: [
        { name: '📊 Inscritos', value: String(totalInscritos || 0) + ' jogador(es)', inline: true },
        { name: '🎯 Modo', value: campeonato.modo, inline: true },
        { name: '👥 Tipo', value: campeonato.tipoDupla, inline: true }
      ]
    }],
    components: [[
      { type: 2, style: 3, label: '🎮 Inscrever Time', custom_id: 'btn_camp_inscrever', emoji: { name: '🎮' } }
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
