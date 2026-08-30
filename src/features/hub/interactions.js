const { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { iniciarAvaliacao } = require('../avaliacao/interactions');
const { onVerPerfil, onAbrirSelecionarPerfil } = require('../perfil/interactions');
const PainelPrincipal = require('../../db/models/painelPrincipal');

function buildPainelPrincipal() {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Ômega - Painel Principal')
    .setDescription('Escolha uma funcionalidade clicando em um botão abaixo:')
    .setColor('#7289DA');

  const btnAvaliar = new ButtonBuilder()
    .setCustomId('hub_btn_avaliar_75')
    .setLabel('Avaliar 75 categorias')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);

  const btnMeuPerfil = new ButtonBuilder()
    .setCustomId('hub_btn_ver_meu_perfil')
    .setLabel('Ver meu perfil')
    .setEmoji('👤')
    .setStyle(ButtonStyle.Success);

  const btnOutrosPerfis = new ButtonBuilder()
    .setCustomId('hub_btn_ver_outros_perfis')
    .setLabel('Ver outros perfis / Editar ficha')
    .setEmoji('🔍')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(btnAvaliar, btnMeuPerfil, btnOutrosPerfis)]
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

async function processarBotaoHub(interaction, rota) {
  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferUpdate(); } catch (_) {}
  }
  const mensagemFuncionalidade = await obterMensagemFuncionalidade(interaction);

  if (rota === 'avaliar_75') return iniciarAvaliacao(interaction, mensagemFuncionalidade);
  if (rota === 'ver_meu_perfil') return onVerPerfil(interaction, mensagemFuncionalidade);
  if (rota === 'ver_outros_perfis') return onAbrirSelecionarPerfil(interaction, mensagemFuncionalidade);
}

function onBtnAvaliar75(interaction) { return processarBotaoHub(interaction, 'avaliar_75'); }
function onBtnVerMeuPerfil(interaction) { return processarBotaoHub(interaction, 'ver_meu_perfil'); }
function onBtnVerOutrosPerfis(interaction) { return processarBotaoHub(interaction, 'ver_outros_perfis'); }

async function onVoltarPainelPrincipal(interaction) {
  return interaction.update(buildPlaceholderFuncionalidade());
}

function register(registry) {
  registry.button('hub_btn_avaliar_75', onBtnAvaliar75);
  registry.button('hub_btn_ver_meu_perfil', onBtnVerMeuPerfil);
  registry.button('hub_btn_ver_outros_perfis', onBtnVerOutrosPerfis);
  registry.button('hub_voltar_principal', onVoltarPainelPrincipal);
}

module.exports = { register, buildPainelPrincipal, buildPlaceholderFuncionalidade, obterMensagemFuncionalidade };
