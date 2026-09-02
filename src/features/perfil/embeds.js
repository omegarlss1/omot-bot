const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { CATEGORIAS_META } = require('./constants');
const { calcularIdade } = require('./validation');
const { calcularCategorias } = require('../../data/mapa_indicadores');
const { getTitulosDoJogador } = require('../../data/titulos');

function formatarBarra(valor) {
  const porcentagem = Math.max(0, Math.min(100, Number(valor) || 0));
  const preenchidos = Math.round(porcentagem / 10);
  const vazios = 10 - preenchidos;
  return `${'█'.repeat(preenchidos)}${'░'.repeat(vazios)}`;
}

function formatarSocial(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  const urlMatch = texto.match(/^https?:\/\/.+/i);
  if (urlMatch) {
    return `[${texto}](${texto})`;
  }
  return texto;
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
  const horarioJoga = normalizarValor(perfil?.horarioJoga, 'Não informado');
  const tiktok = formatarSocial(perfil?.tiktok);
  const instagram = formatarSocial(perfil?.instagram);

  const nicksSecundarios = Array.isArray(perfil?.nicks_secundarios) ? perfil.nicks_secundarios.filter(Boolean) : [];
  const titulosLista = Array.isArray(perfil?.titulosLista) ? perfil.titulosLista : [];
  const titulosFisicos = getTitulosDoJogador(titulosLista);
  const titulosTexto = titulosFisicos.length > 10
    ? `${titulosFisicos.slice(0, 10).map((titulo) => `${titulo.icone} ${titulo.nome}`).join(' | ')} ...`
    : titulosFisicos.map((titulo) => `${titulo.icone} ${titulo.nome}`).join(' | ');

  const camposSocial = [];
  if (tiktok) camposSocial.push(`[TikTok](${tiktok})`);
  if (instagram) camposSocial.push(`[Instagram](${instagram})`);

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
        value: `Input: **${input}**\nControle: **${controleTipo}**\nHorário: **${horarioJoga}**`,
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
        value: `Gols: **${Number(perfil?.gols || 0)}** | Assist: **${Number(perfil?.assist || 0)}** | Saves: **${Number(perfil?.saves || 0)}** | Chutes: **${Number(perfil?.chutes || 0)}** | MVPs: **${Number(perfil?.mvps || 0)}** | Pontuação: **${Number(perfil?.pontuacao || 0)}** | Edições: **${Number(perfil?.edicoes || 0)}**`,
        inline: false
      },
      ...(camposSocial.length > 0 ? [{
        name: '🔗 Redes sociais',
        value: camposSocial.join(' | '),
        inline: false
      }] : []),
      {
        name: '📋 Nicks',
        value: nicksSecundarios.length > 0 ? nicksSecundarios.join(', ') : 'Nenhum nick secundário cadastrado.',
        inline: false
      },
      {
        name: 'Baseado em 75 indicadores avaliados',
        value: '🏆 Títulos',
        inline: false
      }
    )
    .setFooter({ text: titulosLista.length > 0 ? titulosTexto : 'Ainda não há títulos cadastrados.' })
    .setColor('#00C2FF');

  const nomeHeader = `${nomeExibicao} • ${idade} anos • ${estado} - ${pais}`;
  if (member) {
    embed.setAuthor({ name: nomeHeader, iconURL: member.user.displayAvatarURL({ dynamic: true }) });
  } else {
    embed.setAuthor({ name: nomeHeader });
  }

  return embed;
}

function buildNicksSecundariosView(dados = {}) {
  const principal = dados.nick_principal_input || dados.nick_principal || 'Não informado';
  const secundarios = Array.isArray(dados.nicks_secundarios) ? dados.nicks_secundarios : [];
  const resumo = secundarios.length
    ? secundarios.join(', ')
    : 'Nenhum nick secundário cadastrado.';
  const botoes = [
    new ButtonBuilder()
      .setCustomId('btn_add_nick_sec')
      .setLabel('+ Adicionar nick secundário')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_continuar_ficha')
      .setLabel('Continuar para etapa 3/4')
      .setStyle(ButtonStyle.Success)
  ];

  if (secundarios.length > 0) {
    botoes.splice(1, 0, new ButtonBuilder()
      .setCustomId('btn_remove_nick_sec')
      .setLabel('Remover')
      .setStyle(ButtonStyle.Danger));
  }

  return {
    embeds: [new EmbedBuilder()
      .setTitle('Nicks da ficha')
      .setDescription(`Nick principal: **${principal}**\nSecundários (${secundarios.length}): ${resumo}`)],
    components: [new ActionRowBuilder().addComponents(botoes)]
  };
}

module.exports = {
  formatarBarra,
  formatarSocial,
  normalizarValor,
  sanitizeValue,
  obterNomeExibicao,
  criarLinhaCategoria,
  buildPerfilEmbed,
  buildNicksSecundariosView
};

