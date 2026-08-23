const { Client, GatewayIntentBits, Collection, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const express = require('express');
const { carregarGatilhos } = require('./utils/database');

// Servidor HTTP para satisfazer o Health Check do Render (Plano Free)
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Ômot Bot ativo e operacional! 🚀'));
app.listen(port, () => console.log(`Servidor HTTP ativo na porta ${port}`));

// Inicialização do Client do Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();
client.canaisGatilho = new Set();

// Evento: Bot Online e Conexão ao Banco de Dados
client.once('ready', async () => {
  console.log(`🤖 Ômot online como ${client.user.tag}!`);
  
  // Carrega as configurações e gatilhos salvos no MongoDB Atlas
  await carregarGatilhos(client);
});

// Evento: Interações (Comandos, Botões e Modais)
client.on('interactionCreate', async interaction => {
  // 1. Execução de Comandos Slash
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error('Erro ao executar comando:', error);
      const content = 'Ocorreu um erro ao executar este comando!';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: 64 });
      } else {
        await interaction.reply({ content, flags: 64 });
      }
    }
  }

  // 2. Clique no Botão "Validar Meu Selo Ω"
  if (interaction.isButton() && interaction.customId === 'iniciar_validacao') {
    const modal = new ModalBuilder()
      .setCustomId('modal_epic_nick')
      .setTitle('Validação de Nick Epic Games');

    const inputNick = new TextInputBuilder()
      .setCustomId('epic_nick_input')
      .setLabel('Digite seu Nick exato da Epic Games:')
      .setPlaceholder('Ex: Ω_Jogador123 ou Jogador_Ω')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(inputNick));
    await interaction.showModal(modal);
  }

  // 3. Envio do Formulário (Modal) de Verificação
  if (interaction.isModalSubmit() && interaction.customId === 'modal_epic_nick') {
    const nickEpic = interaction.fields.getTextInputValue('epic_nick_input');
    const temSelo = nickEpic.includes('Ω') || nickEpic.toLowerCase().includes('omega') || nickEpic.toLowerCase().includes('ômega');

    if (temSelo) {
      const cargoOmega = interaction.guild.roles.cache.find(role => role.name === 'Ômega');

      if (cargoOmega) {
        await interaction.member.roles.add(cargoOmega);
      }

      try {
        await interaction.member.setNickname(`Ω | ${interaction.user.username}`);
      } catch (err) {
        // Silencia erro caso o usuário seja o Dono do Servidor (permissão hierárquica)
      }

      await interaction.reply({
        content: `🎉 **Validação Concluída!** Identificamos o selo no nick **${nickEpic}**.\nO cargo **Ômega** foi concedido e seus acessos foram liberados!`,
        flags: 64
      });
    } else {
      await interaction.reply({
        content: `❌ **Selo não encontrado!** O nick informado (\`${nickEpic}\`) não contém o símbolo **Ω**.\n\nPor favor, adicione o símbolo no seu nick da Epic e tente novamente.`,
        flags: 64
      });
    }
  }
});

// Login com o Token do Bot
client.login(process.env.TOKEN);