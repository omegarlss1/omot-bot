const Evento = require('../../db/models/evento');
const Campeonato = require('../../db/models/campeonato');
const config = require('../../config');
const { criarCategoriaEvento, criarCanalGeral, criarCanaisRank } = require('./permissions');
const CampeonatoFactory = require('./factory/CampeonatoFactory');
const { emitir, EVENTOS } = require('./events');

class EventoError extends Error {
  constructor(mensagem, code) {
    super(mensagem);
    this.name = 'EventoError';
    this.code = code || 'EVENTO_ERROR';
  }
}

function validarParametros({ guildId, nome, ranksSelecionados, dataInicio, dataFim, organizadorId }) {
  if (!guildId) throw new EventoError('guildId obrigatório.', 'EVENTO_GUILD_MISSING');
  if (!nome || nome.trim().length < 3) throw new EventoError('Nome deve ter ao menos 3 caracteres.', 'EVENTO_NOME_INVALIDO');
  if (!Array.isArray(ranksSelecionados) || ranksSelecionados.length === 0) {
    throw new EventoError('Selecione ao menos 1 rank.', 'EVENTO_RANKS_VAZIO');
  }
  const ranksValidos = new Set(config.ranks.map((r) => r.key));
  const invalidos = ranksSelecionados.filter((r) => !ranksValidos.has(r));
  if (invalidos.length) {
    throw new EventoError(`Ranks inválidos: ${invalidos.join(', ')}`, 'EVENTO_RANK_INVALIDO');
  }
  if (new Set(ranksSelecionados).size !== ranksSelecionados.length) {
    throw new EventoError('Ranks duplicados.', 'EVENTO_RANKS_DUPLICADOS');
  }
  const inicio = dataInicio instanceof Date ? dataInicio : new Date(dataInicio);
  const fim = dataFim instanceof Date ? dataFim : new Date(dataFim);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    throw new EventoError('Datas inválidas.', 'EVENTO_DATAS_INVALIDAS');
  }
  if (fim <= inicio) {
    throw new EventoError('Data fim deve ser maior que data início.', 'EVENTO_DATAS_ORDEM');
  }
  if (!organizadorId) throw new EventoError('organizadorId obrigatório.', 'EVENTO_ORG_MISSING');
  return { nome: nome.trim(), dataInicio: inicio, dataFim: fim };
}

async function criarEvento(guild, parametros) {
  if (!guild) throw new EventoError('guild obrigatória.', 'EVENTO_GUILD_MISSING');
  const params = validarParametros({ ...parametros, guildId: guild.id });
  const botUserId = guild.members.me?.id || guild.client?.user?.id;
  if (!botUserId) throw new EventoError('Não foi possível identificar o userId do bot.', 'EVENTO_BOT_MISSING');

  const evento = await Evento.create({
    guildId: guild.id,
    nome: params.nome,
    ranksSelecionados: parametros.ranksSelecionados,
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    organizadorId: parametros.organizadorId
  });
  emitir(EVENTOS.EVENTO_CRIADO, { eventoId: evento._id, guildId: guild.id });

  const sufixo = CampeonatoFactory.sufixoDoEvento(evento);
  const categoria = await criarCategoriaEvento(guild, { nome: evento.nome, sufixoNumero: sufixo }, botUserId);
  evento.categoriaId = categoria.id;
  await evento.save();

  await criarCanalGeral(guild, categoria, parametros.ranksSelecionados, { nome: evento.nome, sufixoNumero: sufixo }, botUserId);

  const campeonatos = [];
  for (const rank of parametros.ranksSelecionados) {
    const camp = await CampeonatoFactory.criar({
      eventoId: evento._id,
      guildId: guild.id,
      rank,
      sufixoNumero: sufixo
    });
    const canais = await criarCanaisRank(guild, categoria, rank, { nome: evento.nome, sufixoNumero: sufixo }, botUserId);
    camp.canais = {
      inscricoes: canais.inscricoes.id,
      partidas: canais.partidas.id,
      prints: canais.prints.id
    };
    camp.categoriaId = categoria.id;
    await camp.save();
    campeonatos.push(camp);
    emitir(EVENTOS.CAMPEONATO_CRIADO, { campeonatoId: camp._id, eventoId: evento._id, rank });
  }

  return { evento, categoria, campeonatos };
}

module.exports = { criarEvento, validarParametros, EventoError };
