const mongoose = require('mongoose');

const PerfilMembroSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  nickJogo: { type: String, default: 'Não informado' },
  rankSideSwipe: { type: String, default: 'Unranked' },
  plataforma: { type: String, default: 'Mobile' }
});

PerfilMembroSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const PerfilMembro = mongoose.model('PerfilMembro', PerfilMembroSchema);

module.exports = { PerfilMembro };
