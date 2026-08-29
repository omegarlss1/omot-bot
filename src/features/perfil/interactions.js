const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const PerfilMembro = require('../../db/models/perfilMembro');
const { getGames } = require('../games/catalog');
const { MAPA_INDICADORES, calcularCategorias } = require('../../data/mapa_indicadores');
const { getTitulosDoJogador, getPaginaTitulos, formatarTitulosParaTexto } = require('../../data/titulos');

const CATEGORIAS_META = {
  inteligencia_leitura: { emoji: '🧠', label: 'Inteligência e leitura de jogo' },
  conhecimento_evolucao: { emoji: '📚', label: 'Conhecimento e evolução' },
  controle_mecanica: { emoji: '⚙', label: 'Controle e mecânica' },
  ataque: { emoji: '⚔', label: 'Ataque' },
  defesa: { emoji: '🛡', label: 'Defesa' },
  equipe: { emoji: '🤝', label: 'Jogo em equipe' },
  criatividade: { emoji: '🎨', label: 'Criatividade e personalidade' },
  regularidade: { emoji: '📈', label: 'Regularidade e desempenho' }
};

function formatarBarra(valor) {
  const porcentagem = Math.max(0, Math.min(100, Number(valor) || 0));
  const preenchidos = Math.round(porcentagem / 10);
  const vazios = 10 - preenchidos;
  return `${'█'.repeat(preenchidos)}${'░'.repeat(vazios)}`;
}

function calcularIdade(dataNascimento) {
  if (!dataNascimento) return 0;

  const data = new Date(dataNascimento);
  if (Number.isNaN(data.getTime())) return 0;

  const hoje = new Date();
  let idade = hoje.getFullYear() - data.getFullYear();
  const mesAtual = hoje.getMonth();
  const diaAtual = hoje.getDate();
  const mesNascimento = data.getMonth();
  const diaNascimento = data.getDate();

  if (mesAtual < mesNascimento || (mesAtual === mesNascimento && diaAtual < diaNascimento)) {
    idade -= 1;
  }

  return idade > 0 ? idade : 0;
}

function normalizarValor(valor, fallback = 'Não informado') {
  if (valor === null || valor === undefined || valor === '') return fallback;
  return String(valor);
}

function sanitizeValue(value, fallback = 'Não informado') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function obterNomeExibicao(perfil, membro) {
  return perfil?.nomeComum || perfil?.nickJogo || membro?.displayName || membro?.user?.username || 'Jogador';
}

function criarLinhaCategoria(categoria, percentual) {
  const meta = CATEGORIAS_META[categoria] || { emoji: '📊', label: categoria };
  return `${meta.emoji} ${meta.label}: ${formatarBarra(percentual)} ${percentual}%`;
}

function buildAdminButtons(targetId) {
  if (!targetId) return [];

  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder().setCustomId(`btn_admin_gol_${targetId}`).setLabel('+ Gol').setStyle(ButtonStyle.Success).setEmoji('⚽'),
    new ButtonBuilder().setCustomId(`btn_admin_assist_${targetId}`).setLabel('+ Assist').setStyle(ButtonStyle.Primary).setEmoji('🅰️'),
    new ButtonBuilder().setCustomId(`btn_admin_save_${targetId}`).setLabel('+ Save').setStyle(ButtonStyle.Secondary).setEmoji('🧤'),
    new ButtonBuilder().setCustomId(`btn_admin_mvp_${targetId}`).setLabel('+ MVP').setStyle(ButtonStyle.Warning).setEmoji('🏅')
  );

  return [row];
}

function buildTitulosButtons(targetId, paginaAtual = 1, totalPaginas = 1) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_titulos_prev_${targetId}_${paginaAtual}`)
      .setLabel('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paginaAtual <= 1),
    new ButtonBuilder()
      .setCustomId(`btn_titulos_next_${targetId}_${paginaAtual}`)
      .setLabel('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paginaAtual >= totalPaginas)
  );
}

async function onVerTodosTitulos(interaction) {
  const targetId = interaction.customId.replace(/^btn_ver_titulos_/, '');
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);

  if (!perfil) {
    return interaction.reply({ content: '❌ Esse jogador ainda não possui perfil completo.', flags: 64 });
  }

  const titulosLista = Array.isArray(perfil.titulosLista) ? perfil.titulosLista : [];
  const pagina = getPaginaTitulos(titulosLista, 1, 15);
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Títulos de ${obterNomeExibicao(perfil, member)}`)
    .setDescription(formatarTitulosParaTexto(titulosLista, pagina.paginaAtual, 15))
    .setColor('#FFD700');

  return interaction.reply({ embeds: [embed], components: [buildTitulosButtons(targetId, 1, pagina.totalPaginas)], ephemeral: true });
}

async function onPaginarTitulos(interaction) {
  const match = interaction.customId.match(/^btn_titulos_(prev|next)_(\d+)_(\d+)$/);
  if (!match) return;

  const [, tipo, targetId, paginaAtualStr] = match;
  const paginaAtual = Number(paginaAtualStr) || 1;
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });

  if (!perfil) {
    return interaction.reply({ content: '❌ Perfil não encontrado.', flags: 64 });
  }

  const titulosLista = Array.isArray(perfil.titulosLista) ? perfil.titulosLista : [];
  const paginaIndex = tipo === 'prev' ? paginaAtual - 1 : paginaAtual + 1;
  const pagina = getPaginaTitulos(titulosLista, paginaIndex, 15);
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Títulos de ${obterNomeExibicao(perfil, member)}`)
    .setDescription(formatarTitulosParaTexto(titulosLista, pagina.paginaAtual, 15))
    .setColor('#FFD700');

  await interaction.update({ embeds: [embed], components: [buildTitulosButtons(targetId, pagina.paginaAtual, pagina.totalPaginas)] });
}

async function onIniciarFicha(interaction) {
  const modal = new ModalBuilder().setCustomId('modal_ficha_perfil').setTitle('Ficha de Membro - Perfil');

  const inputs = [
    { id: 'nome_comum_input', label: 'Nome da comunidade / como quer ser conhecido', style: TextInputStyle.Short, required: true },
    { id: 'data_nascimento_input', label: 'Data de nascimento (YYYY-MM-DD)', style: TextInputStyle.Short, required: false },
    { id: 'data_entrada_omega_input', label: 'Data de entrada na Ômega (YYYY-MM-DD)', style: TextInputStyle.Short, required: false },
    { id: 'estado_input', label: 'Estado', style: TextInputStyle.Short, required: false },
    { id: 'pais_input', label: 'País', style: TextInputStyle.Short, required: false },
    { id: 'bio_input', label: 'Bio (máx. 150)', style: TextInputStyle.Paragraph, required: false },
    { id: 'cla_atual_input', label: 'CLA atual', style: TextInputStyle.Short, required: false },
    { id: 'clas_anteriores_input', label: 'CLAs anteriores (separadas por ,)', style: TextInputStyle.Short, required: false },
    { id: 'rank_x1_input', label: 'Rank X1', style: TextInputStyle.Short, required: false },
    { id: 'rank_x2_input', label: 'Rank X2', style: TextInputStyle.Short, required: false },
    { id: 'pico_rank_input', label: 'Pico Rank', style: TextInputStyle.Short, required: false },
    { id: 'modo_favorito_input', label: 'Modo favorito', style: TextInputStyle.Short, required: false },
    { id: 'input_input', label: 'Input (Touch / Controle / Híbrido)', style: TextInputStyle.Short, required: false },
    { id: 'controle_tipo_input', label: 'Tipo de controle', style: TextInputStyle.Short, required: false },
    { id: 'plataforma_input', label: 'Plataforma (Android / iOS)', style: TextInputStyle.Short, required: false },
    { id: 'horario_joga_input', label: 'Horário que joga', style: TextInputStyle.Short, required: false },
    { id: 'tiktok_input', label: 'TikTok', style: TextInputStyle.Short, required: false },
    { id: 'instagram_input', label: 'Instagram', style: TextInputStyle.Short, required: false }
  ];

  inputs.forEach((campo) => {
    const input = new TextInputBuilder()
      .setCustomId(campo.id)
      .setLabel(campo.label)
      .setStyle(campo.style)
      .setRequired(Boolean(campo.required));

    if (campo.id === 'bio_input') {
      input.setMaxLength(150);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return interaction.showModal(modal);
}

function buildPerfilEmbed(perfil, member, { isPublic = false } = {}) {
  const nomeExibicao = obterNomeExibicao(perfil, member);
  const idade = Number(perfil?.idade) || calcularIdade(perfil?.dataNascimento);
  const estado = perfil?.estado || 'Não informado';
  const pais = perfil?.pais || 'Não informado';
  const bio = perfil?.bio || 'Sem bio por enquanto.';

  const categorias = calcularCategorias(perfil?.indicadoresDetalhados || {});
  const categoriasAtuais = Object.entries(CATEGORIAS_META).reduce((acc, [key]) => {
    acc[key] = Number(perfil?.[key]) || categorias[key] || 0;
    return acc;
  }, {});

  const rankX1 = normalizarValor(perfil?.rankX1, 'Não informado');
  const rankX2 = normalizarValor(perfil?.rankX2, 'Não informado');
  const picoRank = normalizarValor(perfil?.picoRank, 'Não informado');
  const modoFavorito = normalizarValor(perfil?.modoFavorito, 'Não informado');
  const input = normalizarValor(perfil?.input, 'Não informado');
  const controleTipo = normalizarValor(perfil?.controleTipo, 'Não informado');
  const plataforma = normalizarValor(perfil?.plataforma, 'Não informado');
  const horarioJoga = normalizarValor(perfil?.horarioJoga, 'Não informado');

  const titulosLista = Array.isArray(perfil?.titulosLista) ? perfil.titulosLista : [];
  const titulosFisicos = getTitulosDoJogador(titulosLista);
  const titulosTexto = titulosFisicos.length > 10 ? `${titulosFisicos.slice(0, 10).map((titulo) => `${titulo.icone} ${titulo.nome}`).join(' | ')} ...` : titulosFisicos.map((titulo) => `${titulo.icone} ${titulo.nome}`).join(' | ');

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${nomeExibicao}`)
    .setDescription(`Bio: ${bio}`)
    .addFields(
      {
        name: '🏆 Competitivo',
        value: `Rank X1: **${rankX1}**\nRank X2: **${rankX2}**\nPico: **${picoRank}**\nModo Fav: **${modoFavorito}**`,
        inline: true
      },
      {
        name: '🎮 Setup',
        value: `Input: **${input}**\nControle: **${controleTipo}**\nPlataforma: **${plataforma}**\nHorário: **${horarioJoga}**`,
        inline: true
      },
      {
        name: '📊 8 categorias oficiais',
        value: Object.entries(CATEGORIAS_META)
          .map(([key, meta]) => `${meta.emoji} ${meta.label}: ${formatarBarra(categoriasAtuais[key] || 0)} ${categoriasAtuais[key] || 0}%`)
          .join('\n'),
        inline: false
      },
      {
        name: '📈 Stats ÔMEGA',
        value: `Gols: **${Number(perfil?.gols || 0)}** | Assist: **${Number(perfil?.assist || 0)}** | Saves: **${Number(perfil?.saves || 0)}** | MVPs: **${Number(perfil?.mvps || 0)}** | Títulos: **${Number(perfil?.titulos || 0)}** | Edições: **${Number(perfil?.edicoes || 0)}**`,
        inline: false
      },
      {
        name: '🏆 Títulos',
        value: titulosLista.length > 0 ? titulosTexto : 'Ainda não há títulos cadastrados.',
        inline: false
      }
    )
    .setFooter({ text: 'Baseado em 75 indicadores avaliados' })
    .setColor('#00C2FF');

  const nomeHeader = `${nomeExibicao} • ${idade} anos • ${estado} - ${pais}`;
  if (member) {
    embed.setAuthor({ name: nomeHeader, iconURL: member.user.displayAvatarURL({ dynamic: true }) });
  } else {
    embed.setAuthor({ name: nomeHeader });
  }

  return embed;
}

async function onVerPerfil(interaction) {
  await interaction.deferReply({ flags: 64 });
  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });

  if (!perfil) {
    return interaction.editReply({ content: '❌ Vc ainda não preencheu sua ficha! Clica em **Editar Ficha** pra cadastrar.' });
  }

  const embedPerfil = buildPerfilEmbed(perfil, interaction.member, { isPublic: false });
  const adminButtons = interaction.member.permissions?.has(PermissionFlagsBits.Administrator) ? buildAdminButtons(interaction.user.id) : [];

  return interaction.editReply({ embeds: [embedPerfil], components: [...adminButtons, ...componentsExtras] });
}

async function onAbrirSelecionarPerfil(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: '❌ Essa ação só funciona em servidor.', flags: 64 });
  }

  const membros = [...interaction.guild.members.cache.values()]
    .filter((membro) => !membro.user.bot)
    .slice(0, 25);

  const select = new StringSelectMenuBuilder()
    .setCustomId('select_ver_perfil')
    .setPlaceholder('Escolha um membro para ver o perfil público')
    .addOptions(
      membros.map((membro) => ({
        label: membro.displayName || membro.user.username,
        value: membro.user.id,
        description: `Ver perfil de ${membro.user.username}`
      }))
    );

  const row = new ActionRowBuilder().addComponents(select);
  return interaction.reply({ content: '🔎 Selecione o membro no menu abaixo:', components: [row], flags: 64 });
}

async function onSelectVerPerfil(interaction) {
  const targetId = interaction.values[0];
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);

  if (!member) {
    return interaction.reply({ content: '❌ Não foi possível localizar esse membro no servidor.', flags: 64 });
  }

  const perfil = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: targetId });
  if (!perfil) {
    return interaction.reply({ content: `❌ ${member.displayName} ainda não completou o perfil.`, flags: 64 });
  }

  const embedPerfil = buildPerfilEmbed(perfil, member, { isPublic: true });
  const adminButtons = interaction.member.permissions?.has(PermissionFlagsBits.Administrator) ? buildAdminButtons(targetId) : [];
  const titulosFisicos = getTitulosDoJogador(Array.isArray(perfil.titulosLista) ? perfil.titulosLista : []);
  const componentsExtras = titulosFisicos.length > 10
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_ver_titulos_${targetId}`).setLabel(`Ver todos os títulos (${titulosFisicos.length}+)`).setStyle(ButtonStyle.Primary))]
    : [];

  return interaction.reply({ embeds: [embedPerfil], components: [...adminButtons, ...componentsExtras] });
}

async function onModalFichaPerfil(interaction) {
  await interaction.deferReply({ flags: 64 });

  const nomeComum = interaction.fields.getTextInputValue('nome_comum_input').trim() || interaction.user.username;
  const dataNascimento = interaction.fields.getTextInputValue('data_nascimento_input').trim();
  const dataEntradaOmega = interaction.fields.getTextInputValue('data_entrada_omega_input').trim();
  const estado = interaction.fields.getTextInputValue('estado_input').trim();
  const pais = interaction.fields.getTextInputValue('pais_input').trim();
  const bio = interaction.fields.getTextInputValue('bio_input').trim();
  const claAtual = interaction.fields.getTextInputValue('cla_atual_input').trim();
  const clasAnteriores = interaction.fields.getTextInputValue('clas_anteriores_input').trim();
  const rankX1 = interaction.fields.getTextInputValue('rank_x1_input').trim();
  const rankX2 = interaction.fields.getTextInputValue('rank_x2_input').trim();
  const picoRank = interaction.fields.getTextInputValue('pico_rank_input').trim();
  const modoFavorito = interaction.fields.getTextInputValue('modo_favorito_input').trim();
  const input = interaction.fields.getTextInputValue('input_input').trim();
  const controleTipo = interaction.fields.getTextInputValue('controle_tipo_input').trim();
  const plataforma = interaction.fields.getTextInputValue('plataforma_input').trim();
  const horarioJoga = interaction.fields.getTextInputValue('horario_joga_input').trim();
  const tiktok = interaction.fields.getTextInputValue('tiktok_input').trim();
  const instagram = interaction.fields.getTextInputValue('instagram_input').trim();

  const idade = calcularIdade(dataNascimento);

  const perfilAtual = await PerfilMembro.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
  const indicadoresDetalhados = perfilAtual?.indicadoresDetalhados || {};
  const categoriasCalculadas = calcularCategorias(indicadoresDetalhados);
  const clasAnterioresArray = clasAnteriores ? clasAnteriores.split(',').map((item) => item.trim()).filter(Boolean) : perfilAtual?.clasAnteriores || [];

  const dadosPerfil = {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    discordId: interaction.user.id,
    nomeComum,
    dataNascimento: dataNascimento || perfilAtual?.dataNascimento || null,
    dataEntradaOmega: dataEntradaOmega || perfilAtual?.dataEntradaOmega || null,
    idade: idade || perfilAtual?.idade || 0,
    estado: estado || perfilAtual?.estado || null,
    pais: pais || perfilAtual?.pais || null,
    bio: bio || perfilAtual?.bio || null,
    claAtual: claAtual || perfilAtual?.claAtual || null,
    clasAnteriores: clasAnterioresArray,
    rankX1: rankX1 || perfilAtual?.rankX1 || null,
    rankX2: rankX2 || perfilAtual?.rankX2 || null,
    picoRank: picoRank || perfilAtual?.picoRank || null,
    modoFavorito: modoFavorito || perfilAtual?.modoFavorito || null,
    input: input || perfilAtual?.input || null,
    controleTipo: controleTipo || perfilAtual?.controleTipo || null,
    plataforma: plataforma || perfilAtual?.plataforma || 'Mobile',
    horarioJoga: horarioJoga || perfilAtual?.horarioJoga || null,
    tiktok: tiktok || perfilAtual?.tiktok || null,
    instagram: instagram || perfilAtual?.instagram || null,
    nickJogo: perfilAtual?.nickJogo || interaction.member.displayName || null,
    rankSideSwipe: perfilAtual?.rankSideSwipe || 'Unranked',
    indicadoresDetalhados,
    inteligenciaLeitura: categoriasCalculadas.inteligencia_leitura || perfilAtual?.inteligenciaLeitura || 0,
    conhecimentoEvolucao: categoriasCalculadas.conhecimento_evolucao || perfilAtual?.conhecimentoEvolucao || 0,
    controleMecanica: categoriasCalculadas.controle_mecanica || perfilAtual?.controleMecanica || 0,
    ataque: categoriasCalculadas.ataque || perfilAtual?.ataque || 0,
    defesa: categoriasCalculadas.defesa || perfilAtual?.defesa || 0,
    equipe: categoriasCalculadas.equipe || perfilAtual?.equipe || 0,
    criatividade: categoriasCalculadas.criatividade || perfilAtual?.criatividade || 0,
    regularidade: categoriasCalculadas.regularidade || perfilAtual?.regularidade || 0
  };

  await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: interaction.user.id },
    { $set: dadosPerfil },
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

async function onAdminIncrement(interaction) {
  if (!interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Apenas administradores podem alterar essas estatísticas.', flags: 64 });
  }

  const [, campo, targetId] = interaction.customId.match(/^btn_admin_(gol|assist|save|mvp)_(.+)$/) || [];
  if (!campo || !targetId) {
    return interaction.reply({ content: '❌ Comando de administração inválido.', flags: 64 });
  }

  const camposMap = {
    gol: 'gols',
    assist: 'assist',
    save: 'saves',
    mvp: 'mvps'
  };

  const fieldName = camposMap[campo];
  if (!fieldName) return interaction.reply({ content: '❌ Campo de stats inválido.', flags: 64 });

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  await PerfilMembro.findOneAndUpdate(
    { guildId: interaction.guildId, userId: targetId },
    { $inc: { [fieldName]: 1 } },
    { upsert: true, new: true }
  );

  return interaction.reply({
    content: `✅ Estatística **${fieldName.toUpperCase()}** atualizada para ${target ? target.displayName : 'o jogador'}!`,
    flags: 64
  });
}

async function onSelectCargos(interaction) {
  await interaction.deferReply({ flags: 64 });
  const games = await getGames(interaction.guildId);
  const roleIds = games.map((game) => game.roleId).filter(Boolean);
  const selecionados = new Set(interaction.values);
  const adicionar = roleIds.filter((roleId) => selecionados.has(roleId));
  const remover = roleIds.filter((roleId) => !selecionados.has(roleId));
  const resultados = await Promise.allSettled([
    adicionar.length ? interaction.member.roles.add(adicionar) : Promise.resolve(),
    remover.length ? interaction.member.roles.remove(remover) : Promise.resolve()
  ]);

  if (resultados.some((resultado) => resultado.status === 'rejected')) {
    return interaction.editReply({ content: '⚠️ O perfil foi salvo, mas não consegui atualizar todos os cargos. Verifique as permissões do bot.' });
  }

  return interaction.editReply({ content: '🎉 Ficha concluída! Vc já tá pronto pra jogar com a gente.' });
}

function register(registry) {
  registry.button('btn_iniciar_ficha', onIniciarFicha);
  registry.button('btn_ver_perfil', onVerPerfil);
  registry.button('btn_abrir_select_ver_perfil', onAbrirSelecionarPerfil);
  registry.button(/^btn_ver_titulos_\d+$/, onVerTodosTitulos);
  registry.button(/^btn_titulos_(prev|next)_\d+_\d+$/, onPaginarTitulos);
  registry.button(/^btn_admin_(gol|assist|save|mvp)_[0-9]+$/, onAdminIncrement);
  registry.modal('modal_ficha_perfil', onModalFichaPerfil);
  registry.select('select_cargos_jogos', onSelectCargos);
  registry.select('select_ver_perfil', onSelectVerPerfil);
}

module.exports = { register, buildPerfilEmbed, calcularIdade, calcularCategorias, MAPA_INDICADORES };
