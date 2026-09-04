const mongoose = require('mongoose');

const STATUS_PARTIDA = [
  'AGUARDANDO_CHECKIN',
  'AGUARDANDO_PLACAR',
  'AGUARDANDO_VALIDACAO',
  'EM_DISPUTA_ORGANIZADOR',
  'FINALIZADA',
  'CANCELADA',
  'WO'
];

const dueloSchema = new mongoose.Schema({
  duplaA: { type: [String], default: [] },
  duplaB: { type: [String], default: [] },
  placarA: { type: Number, default: null },
  placarB: { type: Number, default: null },
  vencedorLado: { type: String, enum: ['A', 'B', null], default: null },
  foiWO: { type: Boolean, default: false }
}, { _id: false });

const checkinSchema = new mongoose.Schema({
  fez: { type: Boolean, default: false },
  timestamp: { type: Date, default: null },
  porUserId: { type: String, default: null }
}, { _id: false });

const placarEnviadoSchema = new mongoose.Schema({
  por: { type: String, required: true },
  placar: { type: String, required: true },
  prints: { type: [String], default: [] },
  duelosRegistrados: { type: [dueloSchema], default: [] },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const partidaSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  campeonatoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campeonato', required: true, index: true },
  fase: { type: String, required: true },
  rodada: { type: Number, default: 1 },
  timeA: { type: mongoose.Schema.Types.ObjectId, ref: 'Time', default: null },
  timeB: { type: mongoose.Schema.Types.ObjectId, ref: 'Time', default: null },
  janelaCheckIn: {
    inicio: { type: Date, required: true },
    fim: { type: Date, required: true }
  },
  status: { type: String, enum: STATUS_PARTIDA, default: 'AGUARDANDO_CHECKIN' },
  checkIns: {
    timeA: { type: checkinSchema, default: () => ({}) },
    timeB: { type: checkinSchema, default: () => ({}) }
  },
  placarEnviado: {
    timeA: { type: placarEnviadoSchema, default: null },
    timeB: { type: placarEnviadoSchema, default: null }
  },
  vencedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Time', default: null },
  isWO: { type: Boolean, default: false },
  woDeclarado: {
    por: { type: String, default: null },
    motivo: { type: String, default: null },
    timestamp: { type: Date, default: null }
  },
  validacao: {
    timeAValidou: { type: Boolean, default: false },
    timeBValidou: { type: Boolean, default: false }
  },
  duelos: { type: [dueloSchema], default: [] },
  criadoEm: { type: Date, default: Date.now }
}, { timestamps: true });

partidaSchema.index({ campeonatoId: 1, fase: 1, rodada: 1 });
partidaSchema.index({ status: 1, 'janelaCheckIn.fim': 1 });

module.exports = mongoose.models.Partida || mongoose.model('Partida', partidaSchema);
module.exports.STATUS_PARTIDA = STATUS_PARTIDA;
module.exports.dueloSchema = dueloSchema;
