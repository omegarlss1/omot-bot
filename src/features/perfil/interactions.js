const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const PerfilMembro = require('../../db/models/perfilMembro');
const { getGames } = require('../games/catalog');

async function onIniciarFicha(interaction) {
  const modal = new ModalBuilder().setCustomId('modal_ficha_etapa1').setTitle('Ficha de Membro - Perfil');
  const inputNick = new TextInputBuilder().setCustomId('nick_game_input').setLabel('Seu Nick no Jogo:').setStyle(TextInputStyle.Short).setRequired(true);
  const inputRank = new TextInputBuilder().setCustomId('rank_side_input').setLabel('Rank no RL SideSwipe:').setStyle(TextInputStyle.Short).setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputNick),
    new ActionRowBuilder().addComponents(inputRank)
  );
  return interaction.showModal(modal);
}

async function onVerPerfil(interaction) {
  await interaction.deferReply({ flags: 64 });
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });

  if (!perfil) {
    return interaction.editReply({ content: '❌ Vc ainda não preencheu sua ficha! Clica em **Editar Ficha** pra cadastrar.' });
  }

  const embedPerfil = new EmbedBuilder()
    .setTitle(`👤 Seu Perfil - ${interaction.user.username}`)
    .addFields(
      { name: '🎮 Nick no Jogo', value: `\`${perfil.nickJogo}\``, inline: true },
      { name: '🏆 Rank SideSwipe', value: `\`${perfil.rankSideSwipe || 'Não informado'}\``, inline: true }
    )
    .setColor('#00FF7F');

  return interaction.editReply({ embeds: [embedPerfil] });
}

async function onModalFichaEtapa1(interaction) {
  await interaction.deferReply({ flags: 64 });
  const nick = interaction.fields.getTextInputValue('nick_game_input');
  const rank = interaction.fields.getTextInputValue('rank_side_input') || 'Não informado';

  await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: interaction.user.id },
    { nickJogo: nick, rankSideSwipe: rank },
    { upsert: true, new: true }
  );

  const games = await getGames(interaction.guildId);
  const selectCargos = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_cargos_jogos')
      .setPlaceholder('Escolha os jogos que quer ser notificado...')
      .setMinValues(0)
      .setMaxValues(Math.max(1, games.length))
      .addOptions(
        games.map((game) => ({
          label: game.nome,
          value: game.roleId,
          description: game.descricaoCargo
        }))
      )
  );

  return interaction.editReply({
    content: '✅ Perfil salvo! Agora escolha abaixo os avisos que vc quer receber quando chamarem pro time:',
    components: [selectCargos]
  });
}

async function onSelectCargos(interaction) {
  await interaction.deferReply({ flags: 64 });
  for (const roleId of interaction.values) {
    if (roleId) await interaction.member.roles.add(roleId).catch(() => {});
  }
  return interaction.editReply({ content: '🎉 Ficha concluída! Vc já tá pronto pra jogar com a gente.' });
}

function register(registry) {
  registry.button('btn_iniciar_ficha', onIniciarFicha);
  registry.button('btn_ver_perfil', onVerPerfil);
  registry.modal('modal_ficha_etapa1', onModalFichaEtapa1);
  registry.select('select_cargos_jogos', onSelectCargos);
}

module.exports = { register };
