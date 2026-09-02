const { TextInputStyle } = require('discord.js');

const CATEGORIAS_META = {
  inteligencia_leitura: { emoji: '🧠', label: 'Inteligência e leitura de jogo' },
  conhecimento_evolucao: { emoji: '📚', label: 'Conhecimento e evolução' },
  controle_mecanica: { emoji: '⚙', label: 'Controle e mecânica' },
  ataque: { emoji: '⚔', label: 'Ataque' },
  defesa: { emoji: '🛡', label: 'Defesa' },
  equipe: { emoji: '🤝', label: 'Jogo em equipe' },
  criatividade: { emoji: '🎨', label: 'Criatividade e personalidade' },
  regularidade: { emoji: '📈', label: 'Regularidade e desempenho' }
};

const VALORES_INPUT_PERMITIDOS = ['Touch', 'Controle', 'Híbrido'];
const VALORES_PLATAFORMA_PERMITIDAS = ['Android', 'iOS'];
const VALORES_RANK_PERMITIDOS = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Champion', 'Grand Champion'];
const OBRIGATORIOS = ['input', 'rank_x1', 'rank_x2', 'pico_rank'];
const NICK_PATTERN = /^[^\p{C}\r\n]+$/u;

const FICHA_MODAL_STEPS = [
  [
    { id: 'nome_comum_input', label: 'Nome da comunidade / como quer ser conhecido', style: TextInputStyle.Short, required: true },
    { id: 'data_nascimento_input', label: 'Data de nascimento', style: TextInputStyle.Short, required: false, placeholder: 'DD/MM/AAAA' },
    { id: 'estado_input', label: 'Estado', style: TextInputStyle.Short, required: false }
  ],
  [
    { id: 'pais_input', label: 'País', style: TextInputStyle.Short, required: false },
    { id: 'bio_input', label: 'Bio (máx. 150)', style: TextInputStyle.Paragraph, required: false },
    { id: 'cla_atual_input', label: 'CLA atual', style: TextInputStyle.Short, required: false },
    { id: 'nick_principal_input', label: 'Nick principal', style: TextInputStyle.Short, required: true, placeholder: 'Ex: Omotzin' }
  ],
  [
    { id: 'clas_anteriores_input', label: 'CLAs anteriores (separadas por ,)', style: TextInputStyle.Short, required: false },
    { id: 'modo_favorito_input', label: 'Modo favorito', style: TextInputStyle.Short, required: false },
    { id: 'controle_tipo_input', label: 'Tipo de controle', style: TextInputStyle.Short, required: false, placeholder: 'Ex: Três dedos, Joystick, Gamepad Bluetooth, controle PS4/Xbox...' }
  ],
  [
    { id: 'tiktok_input', label: 'TikTok (texto ou link)', style: TextInputStyle.Short, required: false },
    { id: 'instagram_input', label: 'Instagram (texto ou link)', style: TextInputStyle.Short, required: false }
  ]
];

module.exports = {
  CATEGORIAS_META,
  VALORES_INPUT_PERMITIDOS,
  VALORES_PLATAFORMA_PERMITIDAS,
  VALORES_RANK_PERMITIDOS,
  OBRIGATORIOS,
  NICK_PATTERN,
  FICHA_MODAL_STEPS
};

