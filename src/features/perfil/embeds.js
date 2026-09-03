const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { CATEGORIAS_META } = require('./constants');
const { calcularIdade } = require('./validation');
const { calcularCategorias } = require('../../data/mapa_indicadores');
const { getTitulosDoJogador } = require('../../data/titulos');

// ─── Utilitários ───────────────────────────────────────────────────────────────

function formatarBarra(valor) {
  const porcentagem = Math.max(0, Math.min(100, Number(valor) || 0));
  const preenchidos = Math.round(porcentagem / 10);
  const vazios = 10 - preenchidos;
  return `${'█'.repeat(preenchidos)}${'░'.repeat(vazios)}`;
}

function formatarSocial(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  if (/^https?:\/\/.+/i.test(texto)) return `[${texto}](${texto})`;
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
  return perfil?.nick_principal || perfil?.nomeComum || perfil?.nickJogo || membro?.displayName || membro?.user?.username || 'Jogador';
}

function criarLinhaCategoria(categoria, percentual) {
  const meta = CATEGORIAS_META[categoria] || { emoji: '📊', label: categoria };
  return `${meta.emoji} ${meta.label}: ${formatarBarra(percentual)} ${percentual}%`;
}

// ─── Quadro de Medalhas ────────────────────────────────────────────────────────

function calcularQuadroMedalhas(titulosDetalhados = []) {
  const resultado = {
    omega: { ouro: 0, prata: 0, bronze: 0 },
    comunidade: { ouro: 0, prata: 0, bronze: 0 }
  };

  for (const titulo of titulosDetalhados) {
    const grupo = titulo.tipo === 'comunidade' ? resultado.comunidade : resultado.omega;
    if (titulo.colocacao === 1) grupo.ouro++;
    else if (titulo.colocacao === 2) grupo.prata++;
    else if (titulo.colocacao === 3) grupo.bronze++;
  }

  return resultado;
}

function formatarQuadroMedalhas(quadro) {
  const linhas = [];

  const total = quadro.omega.ouro + quadro.omega.prata + quadro.omega.bronze
    + quadro.comunidade.ouro + quadro.comunidade.prata + quadro.comunidade.bronze;

  if (total === 0) return '*(Nenhum título registrado ainda)*';

  if (quadro.omega.ouro + quadro.omega.prata + quadro.omega.bronze > 0) {
    linhas.push(`🏆 **Campeonatos Oficiais ÔMEGA**`);
    linhas.push(`🥇 ${quadro.omega.ouro} Ouro(s) | 🥈 ${quadro.omega.prata} Prata(s) | 🥉 ${quadro.omega.bronze} Bronze(s)`);
  }

  if (quadro.comunidade.ouro + quadro.comunidade.prata + quadro.comunidade.bronze > 0) {
    if (linhas.length > 0) linhas.push('');
    linhas.push(`👥 **Torneios da Comunidade**`);
    linhas.push(`🥇 ${quadro.comunidade.ouro} Ouro(s) | 🥈 ${quadro.comunidade.prata} Prata(s) | 🥉 ${quadro.comunidade.bronze} Bronze(s)`);
  }

  return linhas.join('\n');
}

// ─── Formatação de Título Detalhado ───────────────────────────────────────────

const ICONE_COLOCACAO = { 1: '🥇', 2: '🥈', 3: '🥉' };
const LABEL_TIPO = { omega: 'ÔMEGA Oficial', comunidade: 'Comunidade' };

function formatarTituloDetalhado(titulo, indice = 0) {
  const icone = ICONE_COLOCACAO[titulo.colocacao] || '🏆';
  const tipo = LABEL_TIPO[titulo.tipo] || titulo.tipo;
  const edicao = titulo.edicao ? ` (${titulo.edicao})` : '';

  const linhas = [`**${icone} ${titulo.campeonato}${edicao}** — *${tipo}*`];

  if (titulo.formato === 'eliminatoria') {
    if (titulo.finais) {
      linhas.push('⚔️ **Final:**');
      if (titulo.finais.time1Nome || titulo.finais.time1Jogadores) {
        linhas.push(`  • ${titulo.finais.time1Nome || 'Time 1'}: ${titulo.finais.time1Jogadores || '—'}`);
      }
      if (titulo.finais.time2Nome || titulo.finais.time2Jogadores) {
        linhas.push(`  • ${titulo.finais.time2Nome || 'Time 2'}: ${titulo.finais.time2Jogadores || '—'}`);
      }
      if (titulo.finais.modo) linhas.push(`  📋 Modo: ${titulo.finais.modo}`);
    }
    if (titulo.semifinais) {
      linhas.push('🔹 **Semifinais:**');
      if (titulo.semifinais.time1Nome || titulo.semifinais.time1Jogadores) {
        linhas.push(`  • ${titulo.semifinais.time1Nome || 'Time 1'}: ${titulo.semifinais.time1Jogadores || '—'}`);
      }
      if (titulo.semifinais.time2Nome || titulo.semifinais.time2Jogadores) {
        linhas.push(`  • ${titulo.semifinais.time2Nome || 'Time 2'}: ${titulo.semifinais.time2Jogadores || '—'}`);
      }
    }
  } else if (titulo.formato === 'colocacao' && titulo.colocacoesTabela) {
    const tab = titulo.colocacoesTabela;
    linhas.push('📊 **Classificação:**');
    if (tab.primeiro) linhas.push(`  🥇 1º: ${tab.primeiro}`);
    if (tab.segundo) linhas.push(`  🥈 2º: ${tab.segundo}`);
    if (tab.terceiro) linhas.push(`  🥉 3º: ${tab.terceiro}`);
    if (tab.quarto) linhas.push(`  4️⃣ 4º: ${tab.quarto}`);
  }

  return linhas.join('\n');
}

// ─── Barra de Navegação entre Nichos ─────────────────────────────────────────

function buildNavegacaoNichosPerfil(targetId, abaAtiva = 'ficha') {
  const abaFichaStyle = abaAtiva === 'ficha' ? ButtonStyle.Primary : ButtonStyle.Secondary;
  const abaAvalStyle = abaAtiva === 'avaliacao' ? ButtonStyle.Primary : ButtonStyle.Secondary;
  const abaStatStyle = abaAtiva === 'stats' ? ButtonStyle.Primary : ButtonStyle.Secondary;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_aba_perfil_ficha_${targetId}`)
      .setLabel('👤 Ficha & Dados')
      .setStyle(abaFichaStyle),
    new ButtonBuilder()
      .setCustomId(`btn_aba_perfil_avaliacao_${targetId}`)
      .setLabel('📊 Avaliação (8 Cat.)')
      .setStyle(abaAvalStyle),
    new ButtonBuilder()
      .setCustomId(`btn_aba_perfil_stats_${targetId}`)
      .setLabel('🏆 Stats & Medalhas')
      .setStyle(abaStatStyle),
    new ButtonBuilder()
      .setCustomId('hub_voltar_principal')
      .setLabel('← Voltar')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row];
}

// ─── ABA 1: Ficha & Dados ─────────────────────────────────────────────────────

function buildEmbedFicha(perfil, member) {
  const nickPrincipal = perfil?.nick_principal || perfil?.nickJogo || member?.displayName || 'Não informado';
  const nomeComum = perfil?.nomeComum || member?.displayName || member?.user?.username || 'Jogador';
  const idade = Number(perfil?.idade) || calcularIdade(perfil?.dataNascimento);
  const estado = perfil?.estado || 'Não informado';
  const pais = perfil?.pais || 'Não informado';
  const bio = perfil?.bio || 'Sem bio por enquanto.';
  const claAtual = perfil?.claAtual || 'Nenhum';
  const rankX1 = normalizarValor(perfil?.rankX1);
  const rankX2 = normalizarValor(perfil?.rankX2);
  const picoRank = normalizarValor(perfil?.picoRank);
  const modoFavorito = normalizarValor(perfil?.modoFavorito);
  const input = normalizarValor(perfil?.input);
  const controleTipo = normalizarValor(perfil?.controleTipo);
  const tiktok = formatarSocial(perfil?.tiktok);
  const instagram = formatarSocial(perfil?.instagram);
  const nicksSecundarios = Array.isArray(perfil?.nicks_secundarios) ? perfil.nicks_secundarios.filter(Boolean) : [];

  let descricao = `⭐ **NICK PRINCIPAL:** \`${nickPrincipal.toUpperCase()}\`\n`;
  descricao += `👤 **Nome:** ${nomeComum}`;
  if (idade > 0) descricao += ` (${idade} anos)`;
  descricao += ` • 🌍 ${estado} - ${pais}\n`;
  if (nicksSecundarios.length > 0) {
    descricao += `📋 **Nicks Secundários:** ${nicksSecundarios.map((n) => `\`${n}\``).join(', ')}\n`;
  }
  descricao += `💬 **Bio:** ${bio}\n`;
  const sociais = [];
  if (tiktok) sociais.push(`🎵 TikTok: ${tiktok}`);
  if (instagram) sociais.push(`📸 Instagram: ${instagram}`);
  if (sociais.length > 0) descricao += `🔗 ${sociais.join(' • ')}\n`;

  const embed = new EmbedBuilder()
    .setTitle(`👤 PERFIL • ${nickPrincipal.toUpperCase()}`)
    .setDescription(descricao)
    .addFields(
      {
        name: '🎮 Setup',
        value: `Input: **${input}**\nControle: **${controleTipo}**\nCLA: **${claAtual}**\nModo Fav: **${modoFavorito}**`,
        inline: true
      },
      {
        name: '🏆 Ranks Habituais',
        value: `X1: **${rankX1}**\nX2: **${rankX2}**\nPico: **${picoRank}**\n*(Usados para equilíbrio em campeonatos internos)*`,
        inline: true
      }
    )
    .setColor('#5865F2')
    .setFooter({ text: '📊 Use os botões abaixo para navegar pelas outras abas do perfil' });

  if (member) {
    embed.setAuthor({ name: `${nickPrincipal} • ${nomeComum}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) });
  }

  return embed;
}

// ─── ABA 2: Avaliação (8 Categorias) ─────────────────────────────────────────

function buildEmbedAvaliacao(perfil, member) {
  const nickPrincipal = perfil?.nick_principal || perfil?.nickJogo || member?.displayName || 'Jogador';
  const categorias = calcularCategorias(perfil?.indicadoresDetalhados || {});

  const categoriasAtuais = Object.entries(CATEGORIAS_META).reduce((acc, [key]) => {
    acc[key] = Number(perfil?.[key]) || categorias[key] || 0;
    return acc;
  }, {});

  const totalPreenchidas = Object.values(categoriasAtuais).filter((v) => v > 0).length;
  const media = totalPreenchidas > 0
    ? Math.round(Object.values(categoriasAtuais).reduce((a, b) => a + b, 0) / Object.keys(categoriasAtuais).length)
    : 0;

  const linhasCategorias = Object.entries(CATEGORIAS_META)
    .map(([key, meta]) => `${meta.emoji} **${meta.label}:** ${formatarBarra(categoriasAtuais[key])} \`${categoriasAtuais[key]}%\``)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`📊 AVALIAÇÃO TÉCNICA • ${nickPrincipal.toUpperCase()}`)
    .setDescription(`Índices técnicos calculados a partir da avaliação de **75 indicadores** competitivos.\n\n${linhasCategorias}`)
    .addFields({
      name: '📈 Média Geral',
      value: `${formatarBarra(media)} \`${media}%\`\n*(${totalPreenchidas}/8 categorias avaliadas)*`,
      inline: false
    })
    .setColor('#00C2FF')
    .setFooter({ text: 'Baseado em 75 indicadores avaliados por avaliador interno | Use os botões para navegar' });

  if (member) {
    embed.setAuthor({ name: `${nickPrincipal} • ${member.displayName}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) });
  }

  return embed;
}

// ─── ABA 3: Stats & Medalhas ──────────────────────────────────────────────────

function buildEmbedStatsMedalhas(perfil, member) {
  const nickPrincipal = perfil?.nick_principal || perfil?.nickJogo || member?.displayName || 'Jogador';
  const titulosDetalhados = Array.isArray(perfil?.titulosDetalhados) ? perfil.titulosDetalhados : [];
  const titulosLista = Array.isArray(perfil?.titulosLista) ? perfil.titulosLista : [];

  const quadro = calcularQuadroMedalhas(titulosDetalhados);
  const textoMedalhas = formatarQuadroMedalhas(quadro);

  // Histórico detalhado (máx. 5 mais recentes)
  let textoHistorico = '';
  if (titulosDetalhados.length > 0) {
    const recentes = [...titulosDetalhados].reverse().slice(0, 5);
    textoHistorico = recentes.map((t, i) => formatarTituloDetalhado(t, i)).join('\n\n');
    if (titulosDetalhados.length > 5) {
      textoHistorico += `\n\n*...e mais ${titulosDetalhados.length - 5} título(s). Veja tudo no histórico completo.*`;
    }
  } else if (titulosLista.length > 0) {
    // fallback para títulos legados (string)
    const legados = getTitulosDoJogador(titulosLista);
    textoHistorico = legados.slice(0, 8).map((t) => `${t.icone} **${t.nome}**`).join('\n');
  } else {
    textoHistorico = '*(Nenhum título registrado ainda)*';
  }

  const embed = new EmbedBuilder()
    .setTitle(`🏆 STATS & MEDALHAS • ${nickPrincipal.toUpperCase()}`)
    .addFields(
      {
        name: '📈 Estatísticas ÔMEGA',
        value: [
          `⚽ Gols: **${Number(perfil?.gols || 0)}** | 🅰️ Assist: **${Number(perfil?.assist || 0)}** | 🧤 Saves: **${Number(perfil?.saves || 0)}**`,
          `🥅 Chutes: **${Number(perfil?.chutes || 0)}** | 🏅 MVPs: **${Number(perfil?.mvps || 0)}** | 🎯 Pontos: **${Number(perfil?.pontuacao || 0)}**`,
          '*(Dados oficiais computados em campeonatos e torneios internos Ômega)*'
        ].join('\n'),
        inline: false
      },
      {
        name: '🏅 Quadro de Medalhas',
        value: textoMedalhas,
        inline: false
      },
      {
        name: `🏆 Histórico de Títulos (${titulosDetalhados.length || titulosLista.length} total)`,
        value: textoHistorico.slice(0, 1024) || '*(Nenhum título registrado ainda)*',
        inline: false
      }
    )
    .setColor('#FFD700')
    .setFooter({ text: 'Títulos e conquistas oficiais em torneios e campeonatos internos Ômega | Use os botões para navegar' });

  if (member) {
    embed.setAuthor({ name: `${nickPrincipal} • ${member.displayName}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) });
  }

  return embed;
}

// ─── Embed de Perfil Legado (retrocompatibilidade) ────────────────────────────
// Mantido para funções que chamam buildPerfilEmbed diretamente

function buildPerfilEmbed(perfil, member, { isPublic = false } = {}) {
  return buildEmbedFicha(perfil, member);
}

// ─── buildNicksSecundariosView ────────────────────────────────────────────────

function buildNicksSecundariosView(dados = {}) {
  const principal = dados.nick_principal_input || dados.nick_principal || 'Não informado';
  const secundarios = Array.isArray(dados.nicks_secundarios) ? dados.nicks_secundarios : [];
  const resumo = secundarios.length ? secundarios.join(', ') : 'Nenhum nick secundário cadastrado.';

  const botoes = [
    new ButtonBuilder().setCustomId('btn_add_nick_sec').setLabel('+ Adicionar nick secundário').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_etapa_3').setLabel('Continuar para etapa 3/4').setStyle(ButtonStyle.Success)
  ];

  if (secundarios.length > 0) {
    botoes.splice(1, 0, new ButtonBuilder().setCustomId('btn_remove_nick_sec').setLabel('Remover').setStyle(ButtonStyle.Danger));
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
  calcularQuadroMedalhas,
  formatarQuadroMedalhas,
  formatarTituloDetalhado,
  buildNavegacaoNichosPerfil,
  buildEmbedFicha,
  buildEmbedAvaliacao,
  buildEmbedStatsMedalhas,
  buildPerfilEmbed,
  buildNicksSecundariosView
};
