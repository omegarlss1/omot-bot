const mongoose = require('mongoose');

const eventoSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  nome: { type: String, required: true, trim: true },
  ranksSelecionados: {
    type: [String],
    required: true,
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length > 0 && new Set(arr).size === arr.length,
      message: 'ranksSelecionados deve ter ao menos 1 rank único.'
    }
  },
  dataInicio: { type: Date, required: true },
  dataFim: { type: Date, required: true },
  organizadorId: { type: String, required: true },
  categoriaId: { type: String, default: null },
  descricao: { type: String, default: null },
  criadoEm: { type: Date, default: Date.now }
}, { timestamps: true });

eventoSchema.index({ guildId: 1, criadoEm: -1 });

module.exports = mongoose.models.Evento || mongoose.model('Evento', eventoSchema);
