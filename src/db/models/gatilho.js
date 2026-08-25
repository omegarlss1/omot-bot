const mongoose = require('mongoose');

const gatilhoSchema = new mongoose.Schema({
  canalId: { type: String, required: true, unique: true },
  tipo: { type: String, enum: ['sideswipe', 'diversos'], default: 'sideswipe' }
});

module.exports = mongoose.models.Gatilho || mongoose.model('Gatilho', gatilhoSchema);
