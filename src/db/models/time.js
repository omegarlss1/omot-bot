const mongoose = require('mongoose');

const jogadorSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  rankSnapshot: { type: String, required: true },
  nickSnapshot: { type: String, required: true },
  isSubstituto: { type: Boolean, default: false },
  isCapitao: { type: Boolean, default: false },
  partidasJogadas: { type: Number, default: 0 },
  inscritoEm: { type: Date, default: Date.now }
}, { _id: false });

const timeSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  campeonatoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campeonato', required: true, index: true },
  capitaoId: { type: String, required: true },
  jogadores: {
    type: [jogadorSchema],
    required: true,
    validate: {
      validator: function validarJogadores(arr) {
        const titulares = arr.filter((j) => !j.isSubstituto);
        const substitutos = arr.filter((j) => j.isSubstituto);
        return titulares.length >= 1 && substitutos.length <= 1
          && new Set(arr.map((j) => j.userId)).size === arr.length;
      },
      message: 'Time deve ter ao menos 1 titular, no máximo 1 substituto, e userIds únicos.'
    }
  },
  nome: { type: String, default: null, trim: true },
  pontuacao: { type: Number, default: 0 },
  vitorias: { type: Number, default: 0 },
  derrotas: { type: Number, default: 0 },
  woTomados: { type: Number, default: 0 },
  woDados: { type: Number, default: 0 },
  partidasAnuladasPorWO: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  desclassificado: { type: Boolean, default: false },
  posicaoFinal: { type: Number, default: null },
  checkIns: {
    type: Map,
    of: {
      fez: { type: Boolean, default: false },
      timestamp: { type: Date, default: null }
    },
    default: {}
  },
  criadoEm: { type: Date, default: Date.now }
}, { timestamps: true });

timeSchema.index({ campeonatoId: 1, capitaoId: 1 });
timeSchema.index({ campeonatoId: 1, pontuacao: -1, vitorias: -1 });

module.exports = mongoose.models.Time || mongoose.model('Time', timeSchema);
module.exports.jogadorSchema = jogadorSchema;
