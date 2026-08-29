const mongoose = require('mongoose');

const avaliacaoPerfilSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  categoriaAtual: { type: Number, default: 0 },
  respostas: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, default: 'em_andamento' },
  ultimaAtualizacao: { type: Date, default: Date.now }
}, { timestamps: true });

avaliacaoPerfilSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.AvaliacaoPerfil || mongoose.model('AvaliacaoPerfil', avaliacaoPerfilSchema);
