const mongoose = require('mongoose');

const NICK_PATTERN = /^[^\p{C}\r\n]+$/u;

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

  nick_principal: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: NICK_PATTERN,
    sparse: true
  },
  nicks_secundarios: {
    type: [String],
    default: [],
    validate: {
      validator: function validarNicks(nicks) {
        const principal = String(this.nick_principal || '').toLowerCase();
        const normalizados = (Array.isArray(nicks) ? nicks : []).map((nick) => String(nick).trim().toLowerCase());
        return normalizados.every((nick) => NICK_PATTERN.test(nick) && nick.length >= 3 && nick.length <= 20)
          && new Set(normalizados).size === normalizados.length
          && !normalizados.includes(principal);
      },
      message: 'Nicks secundários devem ter de 3 a 20 caracteres, ser únicos e diferentes do nick principal.'
    }
  },

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
  chutes: { type: Number, default: 0 },
  mvps: { type: Number, default: 0 },
  pontuacao: { type: Number, default: 0 },
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
