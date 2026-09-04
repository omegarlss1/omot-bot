const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registrar-comandos')
    .setDescription('Registra/atualiza todos os slash commands do bot no servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has?.('Administrator')) {
      return interaction.reply({ content: '❌ Apenas administradores.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });

    const token = process.env.TOKKEN;
    const clientId = interaction.client.user.id;
    const guildId = interaction.guildId;

    if (!token) {
      return interaction.editReply({ content: '❌ TOKEN não configurado.', flags: 64 });
    }

    const commandsPath = path.join(__dirname, '..', '..', 'bot', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

    const commands = [];
    for (const file of commandFiles) {
      const command = require(path.join(commandsPath, file));
      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
      }
    }

    try {
      const rest = new REST().setToken(token);
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      await interaction.editReply({
        content: `✅ **${data.length} comandos registrados/atualizados** com sucesso!\n${commandFiles.map(f => '• ' + f).join('\n')}`
      });
    } catch (error) {
      console.error('Erro ao registrar comandos:', error);
      await interaction.editReply({ content: `❌ Erro: ${error.message}`, flags: 64 });
    }
  }
};
