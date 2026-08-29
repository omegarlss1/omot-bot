const mongoose = require('mongoose');

const perfilMembroSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  discordId: { type: String, default: null },

  nomeComum: { type: String, default: null },
  dataNascimento: { type: String, default: null },
  idade: { type: Number, default: 0 },
  estado: { type: String, default: null },
  pais: { type: String, default: null },
  bio: { type: String, default: null },
  dataEntradaOmega: { type: String, default: null },
  claAtual: { type: String, default: null },
  clasAnteriores: { type: [String], default: [] },
  tiktok: { type: String, default: null },
  instagram: { type: String, default: null },

  nickJogo: { type: String, default: null },
  rankSideSwipe: { type: String, default: 'Unranked' },
  rankX1: { type: String, default: null },
  rankX2: { type: String, default: null },
  picoRank: { type: String, default: null },
  modoFavorito: { type: String, default: null },

  input: { type: String, default: null },
  controleTipo: { type: String, default: null },
  plataforma: { type: String, default: 'Mobile' },
  horarioJoga: { type: String, default: null },

  gols: { type: Number, default: 0 },
  assist: { type: Number, default: 0 },
  saves: { type: Number, default: 0 },
  mvps: { type: Number, default: 0 },
  titulos: { type: Number, default: 0 },
  edicoes: { type: Number, default: 0 },

  indicadoresDetalhados: { type: mongoose.Schema.Types.Mixed, default: {} },
  inteligenciaLeitura: { type: Number, default: 0 },
  conhecimentoEvolucao: { type: Number, default: 0 },
  controleMecanica: { type: Number, default: 0 },
  ataque: { type: Number, default: 0 },
  defesa: { type: Number, default: 0 },
  equipe: { type: Number, default: 0 },
  criatividade: { type: Number, default: 0 },
  regularidade: { type: Number, default: 0 },

  titulosLista: { type: [String], default: [] },
  selos: { type: [String], default: [] }
}, { timestamps: true });

perfilMembroSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.PerfilMembro || mongoose.model('PerfilMembro', perfilMembroSchema);
