const mongoose = require('mongoose');

const JogoCargoSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  jogoKey: { type: String, required: true }, // ex: 'sideswipe'
  jogoNome: { type: String, required: true }, // ex: 'RL SideSwipe'
  roleId: { type: String, required: true }
});

// Índice composto para evitar duplicações por servidor/jogo
JogoCargoSchema.index({ guildId: 1, jogoKey: 1 }, { unique: true });

const JogoCargo = mongoose.model('JogoCargo', JogoCargoSchema);

module.exports = { JogoCargo };
