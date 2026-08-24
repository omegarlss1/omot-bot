const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { JogoCargo } = require('../utils/jogosDatabase');
const { PerfilMembro } = require('../utils/perfilDatabase');

const cooldowns = new Map();
const TEMPO_COOLDOWN = 5 * 60 * 1000;

// ID do canal exclusivo para chamadas de jogos
const CANAL_PERMITIDO_ID = '1541254928545218610'; 

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
        .setDescription('Obrigatório para Jogos Diversos (nome do jogo). Opcional para SideSwipe.')
        .setRequired(false)),

  async execute(interaction, client) {
    // Trava de Canal
    if (interaction.channelId !== CANAL_PERMITIDO_ID) {
      return interaction.reply({
        content: `❌ Esse comando só pode ser usado no canal <#${CANAL_PERMITIDO_ID}>!`,
        flags: 64
      });
    }

    const membroId = interaction.user.id;
    const agora = Date.now();

    // Verificação de Cooldown (5m)
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

    const jogoKey = interaction.options.getString('jogo');
    const vagas = interaction.options.getInteger('vagas');
    const nota = interaction.options.getString('nota');
    const criador = interaction.member;

    if (jogoKey === 'diversos' && !nota) {
      return interaction.reply({
        content: '❌ Quando vc escolhe **Jogos Diversos**, é obrigatório colocar o nome do jogo no campo `nota`!',
        flags: 64
      });
    }

    await interaction.deferReply();

    const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: membroId });
    const nickRegistrado = perfil?.nickJogo || criador.displayName;
    const rankRegistrado = perfil?.rankSideSwipe || 'Não informado';

    const config = await JogoCargo.findOne({ guildId: interaction.guildId, jogoKey });
    const mencaoCargo = config ? `<@&${config.roleId}>` : (jogoKey === 'sideswipe' ? '<@&1541236990232764416>' : '<@&1541237104754041002>');

    const tituloHeader = jogoKey === 'diversos' ? `Procura-se Players para: ${nota}` : `Procura-se Players para: RL SideSwipe`;

    let descricao = `📢 **${criador.displayName}** tá chamando pra jogar!\n\n`;
    descricao += `👤 **Líder:** ${criador} (Nick: \`${nickRegistrado}\`)\n`;

    if (jogoKey === 'sideswipe') {
      descricao += `🏆 **Rank:** \`${rankRegistrado}\`\n`;
    }

    if (jogoKey === 'sideswipe' && nota) {
      descricao += `📌 **Recado:** ${nota}\n`;
    }

    descricao += `👥 **Vagas Restantes:** ${vagas}\n\n`;
    descricao += `**Time:**\n• ${criador}`;

    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${tituloHeader}`)
      .setDescription(descricao)
      .setColor('#FF6B00')
      .setFooter({ text: 'Clica nos botões abaixo pra entrar ou cancelar a busca!' })
      .setTimestamp();

    const rowBotoes = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_join_team_${criador.id}_${vagas}`)
        .setLabel('Entrar no Time')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎮'),
      new ButtonBuilder()
        .setCustomId(`btn_cancel_team_${criador.id}`)
        .setLabel('Cancelar Procura')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    cooldowns.set(membroId, agora);

    return interaction.editReply({
      content: mencaoCargo ? `📢 ${mencaoCargo}` : null,
      embeds: [embed],
      components: [rowBotoes]
    });
  }
};





