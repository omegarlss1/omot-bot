const mongoose = require('mongoose');

const perfilMembroSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  nickJogo: { type: String, default: 'Não informado' },
  rankSideSwipe: { type: String, default: 'Unranked' },
  plataforma: { type: String, default: 'Mobile' }
});

perfilMembroSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.PerfilMembro || mongoose.model('PerfilMembro', perfilMembroSchema);
