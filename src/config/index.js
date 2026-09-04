const { requireEnv, optionalEnv } = require('./secrets');

const GAMES = [
  {
    key: 'sideswipe',
    nome: 'RL SideSwipe',
    emoji: '🏎️',
    roleId: requireEnv('CARGO_RLSIDESWIPE_ID'),
    descricaoChamada: 'Notifica a galera do SideSwipe',
    descricaoCargo: 'Avisos de chamadas do SideSwipe'
  },
  {
    key: 'diversos',
    nome: 'Jogos Diversos',
    emoji: '🎮',
    roleId: requireEnv('CARGO_JOGOSDIVERSOS_ID'),
    descricaoChamada: 'Notifica a galera de Jogos Diversos',
    descricaoCargo: 'Avisos de chamadas de outros jogos'
  }
];

const RANKS = [
  { key: 'bronze', label: 'Bronze', emoji: '🥉' },
  { key: 'prata', label: 'Prata', emoji: '🥈' },
  { key: 'ouro', label: 'Ouro', emoji: '🥇' },
  { key: 'platina', label: 'Platina', emoji: '💠' },
  { key: 'diamante', label: 'Diamante', emoji: '💎' },
  { key: 'champion', label: 'Champion', emoji: '🏅' },
  { key: 'grand_champion', label: 'Grand Champion', emoji: '🏆' },
  { key: 'omega_champion', label: 'Ômega Champion', emoji: '👑' }
];

module.exports = {
  token: requireEnv('TOKEN'),
  mongoUri: requireEnv('MONGODB_URI'),
  port: Number(optionalEnv('PORT', 3000)),
  discord: {
    canalPingsId: requireEnv('CANAL_PINGS_ID')
  },
  games: GAMES,
  ranks: RANKS,
  campeonato: {
    cargoOrganizacaoId: requireEnv('CARGO_ORGANIZADORCAMPS_ID'),
    cargosRanks: Object.fromEntries(
      RANKS.map((r) => [r.key, requireEnv(`CARGO_${r.key.toUpperCase()}_ID`)])
    )
  },
  startgg: {
    token: requireEnv('STARTGG_TOKEN'),
    apiUrl: optionalEnv('STARTGG_API_URL', 'https://api.start.gg/gql/alpha')
  },
  lfg: {
    cooldownMs: 5 * 60 * 1000,
    limpezaMensagemMs: 2 * 60 * 1000
  }
};
