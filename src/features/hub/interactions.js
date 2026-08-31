const { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { obterMensagemFuncionalidade } = require('./mensagem');
const PainelPrincipal = require('../../db/models/painelPrincipal');

let avaliacaoModule = null;
function getAvaliacaoModule() {
  if (!avaliacaoModule) avaliacaoModule = require('../avaliacao/interactions');
  return avaliacaoModule;
}

let perfilModule = null;
function getPerfilModule() {
  if (!perfilModule) perfilModule = require('../perfil/interactions');
  return perfilModule;
}

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
    .setLabel('Ver outros perfis')
    .setEmoji('🔍')
    .setStyle(ButtonStyle.Secondary);

  const btnEditarFicha = new ButtonBuilder()
    .setCustomId('hub_btn_editar_ficha')
    .setLabel('Editar minha ficha')
    .setEmoji('✏️')
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(btnAvaliar, btnMeuPerfil, btnOutrosPerfis, btnEditarFicha)]
  };
}

function buildPlaceholderFuncionalidade() {
  return {
    content: '👇 Selecione uma opção no painel acima',
    embeds: [],
    components: []
  };
}

async function processarBotaoHub(interaction, rota) {
  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferUpdate(); } catch (_) {}
  }
  const mensagemFuncionalidade = await obterMensagemFuncionalidade(interaction);

  if (rota === 'avaliar_75') return getAvaliacaoModule().iniciarAvaliacao(interaction, mensagemFuncionalidade);
  if (rota === 'ver_meu_perfil') return getPerfilModule().onVerPerfil(interaction, mensagemFuncionalidade);
  if (rota === 'ver_outros_perfis') return getPerfilModule().onAbrirSelecionarPerfil(interaction, mensagemFuncionalidade);
  if (rota === 'editar_ficha') return getPerfilModule().onIniciarFicha(interaction, mensagemFuncionalidade);
}

function onBtnAvaliar75(interaction) { return processarBotaoHub(interaction, 'avaliar_75'); }
function onBtnVerMeuPerfil(interaction) { return processarBotaoHub(interaction, 'ver_meu_perfil'); }
function onBtnVerOutrosPerfis(interaction) { return processarBotaoHub(interaction, 'ver_outros_perfis'); }
function onBtnEditarFicha(interaction) { return processarBotaoHub(interaction, 'editar_ficha'); }

async function onVoltarPainelPrincipal(interaction) {
  return interaction.update(buildPlaceholderFuncionalidade());
}

function register(registry) {
  registry.button('hub_btn_avaliar_75', onBtnAvaliar75);
  registry.button('hub_btn_ver_meu_perfil', onBtnVerMeuPerfil);
  registry.button('hub_btn_ver_outros_perfis', onBtnVerOutrosPerfis);
  registry.button('hub_btn_editar_ficha', onBtnEditarFicha);
  registry.button('hub_voltar_principal', onVoltarPainelPrincipal);
}

module.exports = { register, buildPainelPrincipal, buildPlaceholderFuncionalidade, obterMensagemFuncionalidade };
