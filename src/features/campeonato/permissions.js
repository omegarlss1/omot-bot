const { PermissionFlagsBits, ChannelType } = require('discord.js');
const config = require('../../config');

const PERMISSOES_LEITURA = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory
];

const PERMISSOES_GERAL = [
  ...PERMISSOES_LEITURA,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.UseExternalEmojis
];

const PERMISSOES_ORG = [
  ...PERMISSOES_GERAL,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.PinMessages,
  PermissionFlagsBits.MentionEveryone
];

function permOrgao() {
  return { id: config.campeonato.cargoOrganizacaoId, allow: PERMISSOES_ORG };
}

function permBot(botUserId) {
  return {
    id: botUserId,
    allow: [
      ...PERMISSOES_GERAL,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.ManageThreads
    ]
  };
}

function permRank(rankKey) {
  const id = config.campeonato.cargosRanks[rankKey];
  if (!id) throw new Error(`[permissions] Cargo do rank ${rankKey} não configurado.`);
  return { id, allow: PERMISSOES_GERAL };
}

function bloqueioEveryone() {
  return { id: config.ranks._everyoneId || undefined, deny: PERMISSOES_LEITURA };
}

async function criarCategoriaEvento(guild, evento, botUserId) {
  const nomeEvento = String(evento.nome || 'Campeonato').replace(/\s+/g, ' ').trim().slice(0, 52);
  const sufixo = evento.sufixoNumero && evento.sufixoNumero !== '00'
    ? ` — Ômega #${evento.sufixoNumero}`
    : '';
  return guild.channels.create({
    name: `🏆 ${nomeEvento}${sufixo}`.slice(0, 100),
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: PERMISSOES_LEITURA },
      permOrgao(),
      permBot(botUserId)
    ],
    reason: `Campeonato Ômega: evento ${evento.nome}`
  });
}

async function criarCanalGeral(guild, categoria, ranksSelecionados, evento, botUserId) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: PERMISSOES_LEITURA },
    permOrgao(),
    permBot(botUserId),
    ...ranksSelecionados.map(permRank)
  ];
  return guild.channels.create({
    name: `📝‐geral‐${evento.sufixoNumero || ''}`.replace(/‐/g, '-'),
    type: ChannelType.GuildText,
    parent: categoria.id,
    permissionOverwrites: overwrites,
    topic: `Painel geral do evento ${evento.nome}.`,
    reason: `Canal geral do evento ${evento.nome}`
  });
}

async function criarCanaisRank(guild, categoria, rank, evento, botUserId) {
  const rankConfig = config.ranks.find((r) => r.key === rank);
  if (!rankConfig) throw new Error(`[permissions] Rank ${rank} não existe em config.ranks.`);
  const sufixo = evento.sufixoNumero || '';
  const canais = {};
  const baseOverwrites = [
    { id: guild.roles.everyone.id, deny: PERMISSOES_LEITURA },
    permOrgao(),
    permBot(botUserId),
    permRank(rank)
  ];

  canais.avisos = await guild.channels.create({
    name: '📢・avisos',
    type: ChannelType.GuildText,
    parent: categoria.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: PERMISSOES_LEITURA },
      permOrgao(),
      permBot(botUserId),
      permRank(rank)
    ],
    topic: `Avisos oficiais do campeonato ${rankConfig.label} - ${evento.nome}`,
    reason: `Canal de avisos ${rank} do evento ${evento.nome}`
  });

  canais.inscricoes = await guild.channels.create({
    name: '📝・inscricoes',
    type: ChannelType.GuildText,
    parent: categoria.id,
    permissionOverwrites: baseOverwrites,
    topic: `Inscrições do campeonato ${rankConfig.label} - ${evento.nome}`,
    reason: `Canal de inscrições ${rank} do evento ${evento.nome}`
  });

  canais.organizador = await guild.channels.create({
    name: '🔧・painel-org',
    type: ChannelType.GuildText,
    parent: categoria.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: PERMISSOES_LEITURA },
      permOrgao(),
      permBot(botUserId)
    ],
    topic: `Painel do organizador ${rankConfig.label} - ${evento.nome}`,
    reason: `Canal do organizador ${rank} do evento ${evento.nome}`
  });

  return canais;
}

async function recriarCanaisInscricoesPartidas(guild, categoriaId, rank, evento, botUserId) {
  const rankConfig = config.ranks.find((r) => r.key === rank);
  if (!rankConfig) throw new Error(`[permissions] Rank ${rank} não existe em config.ranks.`);
  const sufixo = evento.sufixoNumero || '';
  const overwrites = [
    { id: guild.roles.everyone.id, deny: PERMISSOES_LEITURA },
    permOrgao(),
    permBot(botUserId),
    permRank(rank)
  ];
  const inscricoes = await guild.channels.create({
    name: '📝・inscricoes',
    type: ChannelType.GuildText,
    parent: categoriaId,
    permissionOverwrites: overwrites,
    topic: `Inscrições do campeonato ${rankConfig.label} - ${evento.nome}`,
    reason: `Reativação de inscrições do rank ${rank} no evento ${evento.nome}`
  });
  return { inscricoes };
}

async function criarCanaisTime(guild, categoria, time, jogadorIds = [], botUserId, modo = null) {
  const numJogadores = parseInt(modo) || 3;
  if (numJogadores < 3) {
    return {};
  }
  const ids = [...new Set(jogadorIds.filter((id) => String(id).startsWith('MANUAL_WHATSAPP_') === false))];
  const overwrites = [
    { id: guild.roles.everyone.id, deny: PERMISSOES_LEITURA },
    permOrgao(),
    permBot(botUserId),
    ...ids.map((id) => ({ id, allow: PERMISSOES_GERAL }))
  ];
  const nome = String(time || 'time').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'time';
  const texto = await guild.channels.create({
    name: `🎮｜${nome}`,
    type: ChannelType.GuildText,
    parent: categoria,
    permissionOverwrites: overwrites,
    reason: `Canal do ${time}`
  });
  const voz = await guild.channels.create({
    name: `🔊｜${nome}`,
    type: ChannelType.GuildVoice,
    parent: categoria,
    permissionOverwrites: overwrites,
    reason: `Sala do ${time}`
  });
  return { texto: texto.id, voz: voz.id };
}

function gerarPainelPermissoes(overwrites) {
  return overwrites.map((ow) => ({
    id: ow.id,
    allow: ow.allow ? Array.from(ow.allow, (p) => p.toString()) : [],
    deny: ow.deny ? Array.from(ow.deny, (p) => p.toString()) : []
  }));
}

module.exports = {
  criarCategoriaEvento,
  criarCanalGeral,
  criarCanaisRank,
  recriarCanaisInscricoesPartidas,
  criarCanaisTime,
  gerarPainelPermissoes,
  permOrgao,
  permBot,
  permRank,
  bloqueioEveryone,
  PERMISSOES_GERAL,
  PERMISSOES_ORG,
  PERMISSOES_LEITURA
};
