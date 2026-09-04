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
  return { id: botUserId, allow: [...PERMISSOES_GERAL, PermissionFlagsBits.ManageChannels] };
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
  return guild.channels.create({
    name: `🏆 ${evento.nome.toUpperCase()}`,
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

  canais.inscricoes = await guild.channels.create({
    name: `${rankConfig.emoji}‐${rank}‐inscricoes${sufixo ? '‐' + sufixo : ''}`.replace(/‐/g, '-'),
    type: ChannelType.GuildText,
    parent: categoria.id,
    permissionOverwrites: baseOverwrites,
    topic: `Inscrições do campeonato ${rankConfig.label} - ${evento.nome}`,
    reason: `Canal de inscrições ${rank} do evento ${evento.nome}`
  });

  canais.partidas = await guild.channels.create({
    name: `${rankConfig.emoji}‐${rank}‐partidas${sufixo ? '‐' + sufixo : ''}`.replace(/‐/g, '-'),
    type: ChannelType.GuildText,
    parent: categoria.id,
    permissionOverwrites: baseOverwrites,
    topic: `Partidas do campeonato ${rankConfig.label} - ${evento.nome}`,
    reason: `Canal de partidas ${rank} do evento ${evento.nome}`
  });

  canais.prints = await guild.channels.create({
    name: `${rankConfig.emoji}‐${rank}‐prints${sufixo ? '‐' + sufixo : ''}`.replace(/‐/g, '-'),
    type: ChannelType.GuildText,
    parent: categoria.id,
    permissionOverwrites: baseOverwrites,
    topic: `Prints do campeonato ${rankConfig.label} - ${evento.nome}`,
    reason: `Canal de prints ${rank} do evento ${evento.nome}`
  });

  return canais;
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
  gerarPainelPermissoes,
  permOrgao,
  permBot,
  permRank,
  bloqueioEveryone,
  PERMISSOES_GERAL,
  PERMISSOES_ORG,
  PERMISSOES_LEITURA
};
