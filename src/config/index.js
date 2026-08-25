const GAMES = [
  {
    key: 'sideswipe',
    nome: 'RL SideSwipe',
    emoji: '🏎️',
    roleId: process.env.CARGO_SIDESWIPE_ID || '1541236990232764416',
    descricaoChamada: 'Notifica a galera do SideSwipe',
    descricaoCargo: 'Avisos de chamadas do SideSwipe'
  },
  {
    key: 'diversos',
    nome: 'Jogos Diversos',
    emoji: '🎮',
    roleId: process.env.CARGO_DIVERSOS_ID || '1541237104754041002',
    descricaoChamada: 'Notifica a galera de Jogos Diversos',
    descricaoCargo: 'Avisos de chamadas de outros jogos'
  }
];

module.exports = {
  token: process.env.TOKEN || process.env.DISCORD_TOKEN,
  mongoUri: process.env.MONGODB_URI,
  port: Number(process.env.PORT) || 3000,
  discord: {
    canalPingsId: process.env.CANAL_PINGS_ID || '1541254928545218610'
  },
  games: GAMES,
  lfg: {
    cooldownMs: 5 * 60 * 1000,
    limpezaMensagemMs: 2 * 60 * 60 * 1000
  }
};
