const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { iniciarAvaliacao } = require('../avaliacao/interactions');
const { onVerPerfil, onAbrirSelecionarPerfil } = require('../perfil/interactions');
const PainelPrincipal = require('../../db/models/painelPrincipal');

function buildPainelPrincipal() {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Ômega - Painel Principal')
    .setDescription('Escolha uma funcionalidade:')
    .setColor('#7289DA');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('hub_principal_select')
    .setPlaceholder('Escolha uma funcionalidade')
    .addOptions([
      { label: 'Avaliar as 75 categorias', value: 'avaliar_75', description: 'Preencha seu perfil de jogador', emoji: '📝' },
      { label: 'Ver meu perfil', value: 'ver_meu_perfil', description: 'Veja seu perfil geral e % por categoria', emoji: '👤' },
      { label: 'Ver outros perfis / Editar ficha', value: 'ver_outros_perfis', description: 'Consultar ou editar fichas de jogadores', emoji: '🔍' }
    ]);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
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

  if (escolha === 'avaliar_75') return iniciarAvaliacao(interaction, mensagemFuncionalidade);
  if (escolha === 'ver_meu_perfil') return onVerPerfil(interaction, mensagemFuncionalidade);
  if (escolha === 'ver_outros_perfis') return onAbrirSelecionarPerfil(interaction, mensagemFuncionalidade);
}

async function onVoltarPainelPrincipal(interaction) {
  return interaction.update(buildPlaceholderFuncionalidade());
}

function register(registry) {
  registry.select('hub_principal_select', onHubPrincipal);
  registry.button('hub_voltar_principal', onVoltarPainelPrincipal);
}

module.exports = { register, buildPainelPrincipal, buildPlaceholderFuncionalidade };
