const { requireEnv, optionalEnv, validarEnv, ENV_OBRIGATORIAS } = require('./secrets');

const GAMES = [
  {
    key: 'sideswipe',
    nome: 'RL SideSwipe',
    emoji: '🏎️',
    roleId: optionalEnv('CARGO_RLSIDESWIPE_ID', null),
    descricaoChamada: 'Notifica a galera do SideSwipe',
    descricaoCargo: 'Avisos de chamadas do SideSwipe'
  },
  {
    key: 'diversos',
    nome: 'Jogos Diversos',
    emoji: '🎮',
    roleId: optionalEnv('CARGO_JOGOSDIVERSOS_ID', null),
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

const faltando = validarEnv();
if (faltando.length > 0) {
  const err = new Error(`[config] Variáveis obrigatórias não definidas (${faltando.length}): ${faltando.join(', ')}`);
  err.code = 'CONFIG_MISSING_VARS';
  err.faltando = faltando;
  throw err;
}

module.exports = {
  token: requireEnv('TOKEN'),
  mongoUri: requireEnv('MONGODB_URI'),
  port: Number(optionalEnv('PORT', 3000)),
  discord: {
    canalPingsId: optionalEnv('CANAL_PINGS_ID', null)
  },
  games: GAMES,
  ranks: RANKS,
  campeonato: {
    cargoOrganizacaoId: optionalEnv('CARGO_ORGANIZADORCAMPS_ID', null),
    cargosRanks: Object.fromEntries(
      RANKS.map((r) => [r.key, optionalEnv(`CARGO_${r.key.toUpperCase()}_ID`, null)])
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
