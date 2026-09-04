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

module.exports = {
  embedCriarEvento,
  embedSelecionarRanks,
  botoesSelecionarRanks,
  embedEventoCriado,
  corRank,
  CORES
};
