const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const Campeonato = require('../../db/models/campeonato');
const Time = require('../../db/models/time');
const Partida = require('../../db/models/partida');
const { buildPainelOrganizadorCampeonato } = require('../../features/campeonato/interactions');

function temPermissaoOrganizador(member) {
  if (!member) return false;
  if (member.permissions?.has?.('Administrator')) return true;
  const orgRoleId = config.campeonato.cargoOrganizacaoId;
  return member.roles?.cache?.has?.(orgRoleId) || false;
}

function buildPainelOrganizador() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('painel_org_tab')
    .setPlaceholder('Selecione uma aba...')
    .addOptions([
      { label: 'ABA 1 - INSCRITOS', value: 'inscritos', description: 'Lista de inscritos por rank', emoji: '📋' },
      { label: 'ABA 2 - TIMES DEFINIDOS', value: 'times', description: 'Times formados (FIXA)', emoji: '👥' },
      { label: 'ABA 3 - CHECK-IN', value: 'checkin', description: 'Acompanhe quem confirmou presença', emoji: '✅' },
      { label: 'ABA 4 - PARTIDAS AO VIVO', value: 'partidas', description: 'Partidas em andamento', emoji: '🎮' },
      { label: 'ABA 5 - GESTÃO EXTRA', value: 'gestao', description: 'W.O., broadcast, classificação', emoji: '🛠️' }
    ]);

  return {
    embeds: [{
      title: '🛠️ Painel do Organizador V3',
      description: 'Selecione uma aba abaixo para gerenciar o campeonato.',
      color: 0xFF6B00
    }],
    components: [
      new ActionRowBuilder().addComponents(select)
    ]
  };
}

module.exports = {
  buildPainelOrganizador,
  data: new SlashCommandBuilder()
    .setName('painel-organizador')
    .setDescription('Posta o painel do organizador V3 no canal atual')
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    if (!temPermissaoOrganizador(interaction.member)) {
      return interaction.reply({ content: '❌ Apenas @OrganizadorCamps ou administradores.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    try {
      const campeonato = await Campeonato.findOne({ 'canais.organizador': interaction.channelId }).lean();
      let payload = buildPainelOrganizador();
      if (campeonato) {
        const [times, partidas] = await Promise.all([
          Time.find({ campeonatoId: campeonato._id }).lean(),
          Partida.find({ campeonatoId: campeonato._id }).sort({ rodada: 1, criadoEm: 1 }).lean()
        ]);
        payload = buildPainelOrganizadorCampeonato({ campeonato, times, partidas });
      }
      const mensagem = await interaction.channel.send(payload);
      if (campeonato) {
        await Campeonato.updateOne({ _id: campeonato._id }, {
          $set: {
            'painelOrganizador.fixaMessageId': mensagem.id,
            'painelOrganizador.dinamicaMessageId': mensagem.id,
            'painelOrganizador.mensagens.inscritos': mensagem.id,
            'painelOrganizador.mensagens.checkin': mensagem.id,
            'painelOrganizador.mensagens.partidas': mensagem.id,
            'painelOrganizador.mensagens.gestao': mensagem.id
          }
        });
      }
      await interaction.editReply({
        content: `✅ Painel do organizador postado em ${interaction.channel} (mensagem \`${mensagem.id}\`).`
      });
    } catch (err) {
      console.error('ERRO /painel-organizador:', err);
      return interaction.editReply({ content: `❌ Erro: ${err.message}`, flags: 64 });
    }
  }
};
