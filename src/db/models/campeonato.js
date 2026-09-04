const mongoose = require('mongoose');

const MODO_PARTIDA = ['1v1', '2v2', '3v3', '4v4', '6v6', '8v8', '10v10', '12v12'];
const TIPO_DUPLA = ['FIXA', 'SORTEADA'];
const FORMATO = ['single-elimination', 'double-elimination', 'round-robin', 'grupos-mata-mata'];
const STATUS = [
  'INSCRICOES_ABERTAS',
  'INSCRICOES_FECHADAS',
  'AGUARDANDO_INICIO',
  'EM_ANDAMENTO',
  'FINALIZADO',
  'CANCELADO'
];

const campeonatoSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  eventoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Evento', required: true, index: true },
  rank: { type: String, required: true },
  nome: { type: String, required: true, trim: true },
  modo: { type: String, enum: MODO_PARTIDA, required: true },
  tipoDupla: { type: String, enum: TIPO_DUPLA, default: 'SORTEADA' },
  formato: { type: String, enum: FORMATO, default: 'single-elimination' },
  status: { type: String, enum: STATUS, default: 'INSCRICOES_ABERTAS' },
  maxJogadoresPorTime: { type: Number, required: true, min: 1, max: 12 },
  baseadoEmInscricoes: { type: Boolean, default: true },
  canais: {
    inscricoes: { type: String, default: null },
    partidas: { type: String, default: null },
    prints: { type: String, default: null },
    geral: { type: String, default: null }
  },
  categoriaId: { type: String, default: null },
  startgg: {
    eventId: { type: String, default: null },
    tournamentId: { type: String, default: null },
    url: { type: String, default: null }
  },
  criadoEm: { type: Date, default: Date.now }
}, { timestamps: true });

campeonatoSchema.index({ guildId: 1, eventoId: 1, rank: 1 }, { unique: true });

module.exports = mongoose.models.Campeonato || mongoose.model('Campeonato', campeonatoSchema);
module.exports.MODO_PARTIDA = MODO_PARTIDA;
module.exports.TIPO_DUPLA = TIPO_DUPLA;
module.exports.FORMATO = FORMATO;
module.exports.STATUS = STATUS;
