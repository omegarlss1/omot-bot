const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireEnv } = require('../../config/secrets');

const ENV_OBRIGATORIAS = [
  'TOKEN', 'MONGODB_URI', 'CANAL_PINGS_ID',
  'CARGO_RLSIDESWIPE_ID', 'CARGO_JOGOSDIVERSOS_ID', 'CARGO_ORGANIZADORCAMPS_ID',
  'CARGO_BRONZE_ID', 'CARGO_PRATA_ID', 'CARGO_OURO_ID', 'CARGO_PLATINA_ID',
  'CARGO_DIAMANTE_ID', 'CARGO_CHAMPION_ID', 'CARGO_GRAND_CHAMPION_ID',
  'CARGO_OMEGA_CHAMPION_ID', 'STARTGG_TOKEN', 'CLIENT_ID', 'GUILD_ID'
];

const ENV_OPCIONAIS = [
  { nome: 'PORT', fallback: '3000' },
  { nome: 'STARTGG_API_URL', fallback: 'https://api.start.gg/gql/alpha' },
  { nome: 'CLEAR_GUILD_COMMANDS', fallback: 'false' }
];

function buildDebugMessage() {
  const faltando = [];
  for (const nome of ENV_OBRIGATORIAS) {
    try { requireEnv(nome); } catch { faltando.push(nome); }
  }
  const opcionaisFaltando = [];
  for (const { nome } of ENV_OPCIONAIS) {
    if (!process.env[nome]) opcionaisFaltando.push(nome);
  }
  const linhas = [];
  linhas.push('**Obrigatórias:**');
  for (const nome of ENV_OBRIGATORIAS) {
    const status = faltando.includes(nome) ? '❌ faltando' : '✅ ok';
    linhas.push('• `' + nome + '`: ' + status);
  }
  linhas.push('\n**Opcionais:**');
  for (const { nome } of ENV_OPCIONAIS) {
    const status = opcionaisFaltando.includes(nome) ? '⚠️ não definida (usa fallback)' : '✅ ok';
    linhas.push('• `' + nome + '`: ' + status);
  }
  if (faltando.length === 0) {
    linhas.push('\n✅ **Todas as env vars obrigatórias estão setadas.**');
  } else {
    linhas.push('\n❌ **Faltando ' + faltando.length + ' variável(is) obrigatória(s).**');
  }
  return linhas.join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('debug-config')
    .setDescription('Lista env vars obrigatórias faltando (sem valores)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has?.('Administrator')) {
      return interaction.reply({ content: '❌ Apenas administradores.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    const mensagem = buildDebugMessage();
    return interaction.editReply({ content: mensagem });
  },
  buildDebugMessage
};
