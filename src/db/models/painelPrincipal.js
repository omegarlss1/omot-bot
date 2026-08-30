const mongoose = require('mongoose');

const painelPrincipalSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  canalId: { type: String, required: true },
  hubMessageId: { type: String, required: true },
  hubChannelId: { type: String, required: true },
  funcMessageId: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.models.PainelPrincipal || mongoose.model('PainelPrincipal', painelPrincipalSchema);
