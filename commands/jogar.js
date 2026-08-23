const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { JogoCargo } = require('../utils/jogosDatabase');

// Guardador de tempo de espera por usuário
const cooldowns = new Map();
const TEMPO_COOLDOWN = 10 * 60 * 1000; // 10 minutos em milissegundos

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jogar')
    .setDescription('Chama pro time e abre as vagas')
    .addStringOption(option =>
      option.setName('jogo')
        .setDescription('Escolha o jogo')
        .setRequired(true)
        .addChoices(
          { name: 'RL SideSwipe', value: 'sideswipe' },
          { name: 'Jogos Diversos', value: 'diversos' }
        ))
    .addIntegerOption(option =>
      option.setName('vagas')
        .setDescription('Quantas vagas faltam?')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10))
    .addStringOption(option =>
      option.setName('nota')
        .setDescription('Recado curto (ex: Falta 1 pra fechar o time)')
        .setRequired(false)),

  async execute(interaction, client) {
    const membroId = interaction.user.id;
    const agora = Date.now();

    // Verificação de Cooldown
    if (cooldowns.has(membroId)) {
      const expiracao = cooldowns.get(membroId) + TEMPO_COOLDOWN;

      if (agora < expiracao) {
        const tempoRestante = Math.ceil((expiracao - agora) / 1000 / 60);
        return interaction.reply({
          content: `❌ Vc precisa esperar **${tempoRestante} min** pra chamar o time de novo.`,
          flags: 64
        });
      }
    }

    await interaction.deferReply();

    const jogoKey = interaction.options.getString('jogo');
    const vagas = interaction.options.getInteger('vagas');
    const nota = interaction.options.getString('nota') || 'Bora jogar!';
    const criador = interaction.member;

    const config = await JogoCargo.findOne({ guildId: interaction.guildId, jogoKey });
    const mencaoCargo = config ? `<@&${config.roleId}>` : '';
    const nomeJogo = config ? config.jogoNome : (jogoKey === 'sideswipe' ? 'RL SideSwipe' : 'Jogos Diversos');

    const embed = new EmbedBuilder()
      .setTitle(`🎮 Procura-se Time: ${nomeJogo}`)
      .setDescription(`**${criador.displayName}** tá chamando pra jogar!\n\n📌 **Recado:** ${nota}\n👥 **Vagas Restantes:** ${vagas}\n👥 **Confirmados:**\n• ${criador}`)
      .setColor('#FF6B00')
      .setFooter({ text: 'Clica no botão abaixo pra entrar no time!' })
      .setTimestamp();

    const btnEntrar = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_join_team_${criador.id}_${vagas}`)
        .setLabel('Entrar no Time')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎮')
    );

    // Registra o tempo de uso
    cooldowns.set(membroId, agora);

    return interaction.editReply({
      content: mencaoCargo ? `📢 ${mencaoCargo}` : null,
      embeds: [embed],
      components: [btnEntrar]
    });
  }
};



