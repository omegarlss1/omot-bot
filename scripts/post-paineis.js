#!/usr/bin/env node
const config = require('../src/config');
const { connectDb } = require('../src/db/connect');
const { createBot } = require('../src/bot/client');
const { embedCriarEvento } = require('../src/features/campeonato/embeds');
const { optionalEnv } = require('../src/config/secrets');

const CANAL_PAINEL_CAMPEONATO_ID = optionalEnv('CANAL_PAINEL_CAMPEONATO_ID', null);
const CANAL_PAINEL_HUB_ID = optionalEnv('CANAL_PAINEL_HUB_ID', null);
const GUILD_ID = optionalEnv('GUILD_ID_POSTAR_PAINEL', null);

async function postarPainelCampeonato(client) {
  if (!CANAL_PAINEL_CAMPEONATO_ID) {
    console.log('[post-paineis] CANAL_PAINEL_CAMPEONATO_ID nao definido. Pulando painel de campeonato.');
    return;
  }
  const canal = await client.channels.fetch(CANAL_PAINEL_CAMPEONATO_ID).catch(() => null);
  if (!canal) {
    console.error('[post-paineis] Canal do painel de campeonato nao encontrado:', CANAL_PAINEL_CAMPEONATO_ID);
    return;
  }
  const guild = canal.guild || (GUILD_ID ? await client.guilds.fetch(GUILD_ID).catch(() => null) : null);
  const payload = embedCriarEvento({
    guild: guild || { name: 'Servidor' },
    organizador: 'staff'
  });
  const mensagem = await canal.send(payload);
  console.log('[post-paineis] Painel de campeonato postado em #' + canal.name + ' (msg ' + mensagem.id + ')');
}

async function postarPainelHubStub(client) {
  if (!CANAL_PAINEL_HUB_ID) {
    console.log('[post-paineis] CANAL_PAINEL_HUB_ID nao definido. Pulando painel de hub.');
    return;
  }
  const canal = await client.channels.fetch(CANAL_PAINEL_HUB_ID).catch(() => null);
  if (!canal) {
    console.error('[post-paineis] Canal do hub nao encontrado:', CANAL_PAINEL_HUB_ID);
    return;
  }
  const payload = {
    embeds: [{
      title: '🎮 Painel Principal — Ômega RLSS',
      description: 'Use o menu abaixo para navegar entre as funcionalidades.',
      color: 0x5865F2
    }],
    components: [[
      { type: 2, style: 1, label: '📋 Minha Ficha', custom_id: 'btn_iniciar_ficha', emoji: { name: '📋' } },
      { type: 2, style: 2, label: '🔎 Buscar Jogador', custom_id: 'btn_abrir_busca_nick', emoji: { name: '🔎' } }
    ]]
  };
  const mensagem = await canal.send(payload);
  console.log('[post-paineis] Painel de hub postado em #' + canal.name + ' (msg ' + mensagem.id + ')');
}

async function main() {
  if (!CANAL_PAINEL_CAMPEONATO_ID && !CANAL_PAINEL_HUB_ID) {
    console.error('Defina CANAL_PAINEL_CAMPEONATO_ID e/ou CANAL_PAINEL_HUB_ID no .env antes de rodar.');
    process.exit(1);
  }
  await connectDb();
  const client = createBot();
  await client.login(config.token);
  try {
    await postarPainelCampeonato(client);
    await postarPainelHubStub(client);
  } finally {
    setTimeout(() => client.destroy(), 1500);
  }
}

main().catch((err) => {
  console.error('[post-paineis] Falha:', err);
  process.exit(1);
});
