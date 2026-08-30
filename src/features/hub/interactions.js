const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { iniciarAvaliacao } = require('../avaliacao/interactions');
const { onVerPerfil } = require('../perfil/interactions');
const PainelPrincipal = require('../../db/models/painelPrincipal');

function buildPainelPrincipal() {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Ômega - Painel Principal')
    .setDescription('Escolha uma funcionalidade:')
    .setColor('#7289DA');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('hub_principal')
    .setPlaceholder('Escolha uma funcionalidade')
    .addOptions(
      { label: 'Avaliar 75 categorias', value: 'avaliar_perfil', description: 'Monte seu perfil com os 75 indicadores', emoji: '📊' },
      { label: 'Ver meu perfil', value: 'ver_perfil', description: 'Veja seu perfil e as 8 notas', emoji: '👤' },
      { label: 'Ranking do servidor', value: 'ranking', description: 'Consulte os melhores jogadores', emoji: '🏆' },
      { label: 'Treinos recomendados', value: 'treinos', description: 'Veja sugestões para evoluir', emoji: '🎯' }
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

function buildFuncionalidadeEmBreve(nome) {
  return {
    content: '',
    embeds: [new EmbedBuilder()
      .setTitle(`🎮 Ômega - ${nome}`)
      .setDescription('Esta funcionalidade será disponibilizada em breve.')
      .setColor('#7289DA')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hub_voltar_principal').setLabel('← Voltar ao painel').setStyle(ButtonStyle.Secondary)
    )]
  };
}

function buildPlaceholderFuncionalidade() {
  return {
    content: '👇 Selecione uma opção no painel acima',
    embeds: [],
    components: []
  };
}

async function obterMensagemFuncionalidade(interaction) {
  const guildId = interaction.guildId || interaction.guild?.id;
  const canal = interaction.channel;
  let dados = guildId ? await PainelPrincipal.findOne({ guildId }).catch(() => null) : null;
  let mensagem = null;

  if (dados?.funcMessageId) {
    mensagem = await canal.messages.fetch(dados.funcMessageId).catch(() => null);
  }

  if (!mensagem) {
    mensagem = await canal.send(buildPlaceholderFuncionalidade());
    if (guildId) {
      dados = await PainelPrincipal.findOneAndUpdate(
        { guildId },
        {
          guildId,
          canalId: canal.id,
          hubMessageId: interaction.message.id,
          hubChannelId: canal.id,
          funcMessageId: mensagem.id
        },
        { upsert: true, new: true }
      );
    }
  }

  return mensagem;
}

async function onHubPrincipal(interaction) {
  const escolha = interaction.values[0];
  await interaction.deferUpdate();
  const mensagemFuncionalidade = await obterMensagemFuncionalidade(interaction);

  if (escolha === 'avaliar_perfil') return iniciarAvaliacao(interaction, mensagemFuncionalidade);
  if (escolha === 'ver_perfil') return onVerPerfil(interaction, mensagemFuncionalidade);
  if (escolha === 'ranking') return mensagemFuncionalidade.edit(buildFuncionalidadeEmBreve('Ranking do servidor'));
  if (escolha === 'treinos') return mensagemFuncionalidade.edit(buildFuncionalidadeEmBreve('Treinos recomendados'));
}

async function onVoltarPainelPrincipal(interaction) {
  return interaction.update(buildPlaceholderFuncionalidade());
}

function register(registry) {
  registry.select('hub_principal', onHubPrincipal);
  registry.button('hub_voltar_principal', onVoltarPainelPrincipal);
}

module.exports = { register, buildPainelPrincipal, buildPlaceholderFuncionalidade };
