const mongoose = require('mongoose');

const GatilhoSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true }
});

const CallSchema = new mongoose.Schema({
  callId: { type: String, required: true, unique: true },
  dono: { type: String, required: true },
  donoNome: { type: String, required: true },
  game: { type: String, required: true }
});

module.exports = {
  Gatilho: mongoose.model('Gatilho', GatilhoSchema),
  Call: mongoose.model('Call', CallSchema)
};
