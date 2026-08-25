const mongoose = require('mongoose');

const jogoCargoSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  jogoKey: { type: String, required: true },
  jogoNome: { type: String, required: true },
  roleId: { type: String, required: true }
});

jogoCargoSchema.index({ guildId: 1, jogoKey: 1 }, { unique: true });

module.exports = mongoose.models.JogoCargo || mongoose.model('JogoCargo', jogoCargoSchema);
