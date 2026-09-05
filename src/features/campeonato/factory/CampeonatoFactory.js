const Campeonato = require('../../../db/models/campeonato');
const config = require('../../../config');

function maxJogadoresPorModo(modo) {
  if (modo === '1v1' || modo === 'ffa') return 1;
  if (modo === '2v2') return 2;
  if (modo === '3v3') return 3;
  if (modo === '4v4') return 4;
  if (modo === '6v6') return 6;
  if (modo === '8v8') return 8;
  if (modo === '10v10') return 10;
  if (modo === '12v12') return 12;
  return 2;
}

function modoPadrao(rank) {
  return '3v3';
}

function criar({ eventoId, guildId, rank, sufixoNumero, modo = modoPadrao(), tipoDupla = 'SORTEADA', formato = 'single-elimination', baseadoEmInscricoes = true, limiteInscricoes = null, modalidade = null, temTerceiroLugar = true } = {}) {
  if (!eventoId) throw new Error('[CampeonatoFactory] eventoId obrigatório.');
  if (!guildId) throw new Error('[CampeonatoFactory] guildId obrigatório.');
  if (!rank) throw new Error('[CampeonatoFactory] rank obrigatório.');

  const rankConfig = config.ranks.find((r) => r.key === rank);
  if (!rankConfig) throw new Error(`[CampeonatoFactory] Rank ${rank} não existe em config.ranks.`);

  const modoFinal = modo || modoPadrao(rank);
  const maxJog = maxJogadoresPorModo(modoFinal);
  const nome = `Ômega #${sufixoNumero} - ${rankConfig.label.toUpperCase()}`;

  return Campeonato.create({
    guildId,
    eventoId,
    rank,
    nome,
    modo: modoFinal,
    tipoDupla,
    formato,
    maxJogadoresPorTime: maxJog,
    baseadoEmInscricoes,
    limiteInscricoes,
    modalidade,
    temTerceiroLugar,
    status: 'INSCRICOES_ABERTAS'
  });
}

function sufixoDoEvento(evento) {
  if (!evento || !evento.nome) return '00';
  const match = String(evento.nome).match(/(\d+)/);
  return match ? match[1] : '00';
}

module.exports = { criar, maxJogadoresPorModo, modoPadrao, sufixoDoEvento };
