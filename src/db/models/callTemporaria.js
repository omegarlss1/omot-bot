const mongoose = require('mongoose');

const callTemporariaSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  guildId: { type: String, required: true },
  donoId: { type: String, required: true },
  donoNome: { type: String, required: true },
  tipo: { type: String, required: true },
  jogo: { type: String, default: null },
  hidden: { type: Boolean, default: false },
  bannedUserIds: { type: [String], default: [] }
});

module.exports = mongoose.models.CallTemporaria || mongoose.model('CallTemporaria', callTemporariaSchema);
