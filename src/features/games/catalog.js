const config = require('../../config');
const JogoCargo = require('../../db/models/jogoCargo');

function defaults() {
  return config.games.map((game) => ({
    key: game.key,
    nome: game.nome,
    emoji: game.emoji,
    roleId: game.roleId,
    descricaoChamada: game.descricaoChamada,
    descricaoCargo: game.descricaoCargo
  }));
}

async function syncGuildGames(guildId) {
  if (!guildId) return defaults();

  await Promise.all(
    defaults().map((game) =>
      JogoCargo.updateOne(
        { guildId, jogoKey: game.key },
        {
          $setOnInsert: {
            guildId,
            jogoKey: game.key,
            jogoNome: game.nome,
            roleId: game.roleId
          }
        },
        { upsert: true }
      )
    )
  );

  return getGames(guildId);
}

async function getGames(guildId) {
  const base = defaults();
  if (!guildId) return base;

  const rows = await JogoCargo.find({ guildId });
  if (!rows.length) return base;

  const byKey = new Map(rows.map((row) => [row.jogoKey, row]));
  return base.map((game) => {
    const row = byKey.get(game.key);
    if (!row) return game;
    return { ...game, nome: row.jogoNome, roleId: row.roleId };
  });
}

function getGame(key, games = defaults()) {
  return games.find((game) => game.key === key) || null;
}

module.exports = { defaults, syncGuildGames, getGames, getGame };
