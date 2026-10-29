const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Campeonato = require('../../db/models/campeonato');
const { StartGGAdapter } = require('../../features/campeonato/adapters/StartGGAdapter');

function extrairIdentificadorEvento(valor) {
  const entrada = String(valor || '').trim();
  if (/^\d+$/.test(entrada)) return { tipo: 'id', valor: entrada };

  let slug = entrada;
  if (/^https?:\/\//i.test(entrada)) {
    let url;
    try {
      url = new URL(entrada);
    } catch {
      throw new Error('URL do Start.gg inválida.');
    }
    if (!/(^|\.)start\.gg$/i.test(url.hostname)) {
      throw new Error('Informe uma URL do Start.gg ou o slug do evento.');
    }
    slug = url.pathname.replace(/^\/+|\/+$/g, '');
  }
  if (!slug || slug.length > 200 || /[?#\s]/.test(slug)) {
    throw new Error('Informe o slug do evento, por exemplo `tournament/meu-torneio/event/duplas`.');
  }
  return { tipo: 'slug', valor: slug };
}

function obterFasesGrupos(evento) {
  const fases = evento.phases || [];
  const grupos = fases.filter((fase) =>
    fase.bracketType === 'ROUND_ROBIN' && Number(fase.groupCount) === 4
  );
  const eliminatorias = fases.filter((fase) =>
    ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION'].includes(fase.bracketType)
  );
  if (grupos.length !== 1 || eliminatorias.length !== 1) {
    throw new Error(
      'Para Grupos + mata-mata, prepare no evento exatamente uma fase Round Robin com 4 grupos e uma fase eliminatória, e tente novamente.'
    );
  }
  return { groupPhaseId: String(grupos[0].id), bracketPhaseId: String(eliminatorias[0].id) };
}

async function vincularEvento({ campeonato, identificador, adapter = new StartGGAdapter(), campeonatoModel = Campeonato }) {
  const evento = identificador.tipo === 'id'
    ? await adapter.getEventById(identificador.valor)
    : await adapter.getEventBySlug(identificador.valor);
  if (!evento?.id) {
    throw new Error('Evento não encontrado ou sem acesso. Confira a URL/ID e as permissões da conta Start.gg.');
  }

  let fasesGrupos = {};
  if (String(campeonato.modalidade || campeonato.formato || '').toLowerCase() === 'grupos-mata-mata') {
    fasesGrupos = obterFasesGrupos(evento);
  }
  const eventId = String(evento.id);
  if (campeonato.startgg?.phaseId && String(campeonato.startgg.eventId) !== eventId) {
    throw new Error('Este campeonato já tem uma fase Start.gg vinculada a outro evento. Não alterei o vínculo existente.');
  }

  const url = evento.slug ? `https://start.gg/${evento.slug}` : `https://start.gg/event/${eventId}`;
  await campeonatoModel.updateOne(
    { _id: campeonato._id },
    { $set: {
      'startgg.eventId': eventId,
      'startgg.tournamentId': evento.tournament?.id ? String(evento.tournament.id) : null,
      'startgg.url': url,
      'startgg.groupPhaseId': fasesGrupos.groupPhaseId || null,
      'startgg.bracketPhaseId': fasesGrupos.bracketPhaseId || null,
      ...(String(campeonato.startgg?.eventId) !== eventId ? { 'startgg.phaseId': null } : {})
    } }
  );
  return { evento, url, fasesGrupos };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('startgg-vincular')
    .setDescription('Vincula o campeonato do canal atual a um evento Start.gg já preparado')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) => option
      .setName('evento')
      .setDescription('URL, slug ou ID do evento no Start.gg')
      .setRequired(true)
      .setMaxLength(250)),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has?.('Administrator')) {
      return interaction.reply({ content: '❌ Apenas administradores.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    try {
      const campeonato = await Campeonato.findOne({
        guildId: interaction.guildId,
        'canais.organizador': interaction.channelId
      }).lean();
      if (!campeonato) {
        return interaction.editReply({
          content: 'Execute este comando no canal de organizador do campeonato que deseja vincular.'
        });
      }

      const identificador = extrairIdentificadorEvento(interaction.options.getString('evento', true));
      const { evento, url } = await vincularEvento({ campeonato, identificador });
      return interaction.editReply({
        content: `✅ Evento **${evento.name}** vinculado a **${campeonato.nome}**: ${url}` +
          (String(campeonato.modalidade || campeonato.formato || '').toLowerCase() === 'grupos-mata-mata'
            ? '\nAs fases devem estar preparadas no Start.gg: grupos Round Robin (4 grupos) e mata-mata, com o avanço dos 2 primeiros configurado manualmente.'
            : '\nConfirme que as equipes já estão inscritas no evento e usam os mesmos nomes dos times no Discord.')
      });
    } catch (error) {
      console.error('[StartGGVincular] Falha ao vincular evento:', {
        message: error?.message,
        code: error?.code
      });
      return interaction.editReply({
        content: `Não foi possível vincular o evento Start.gg: ${String(error?.message || 'erro desconhecido').slice(0, 1_500)}`
      });
    }
  },
  extrairIdentificadorEvento,
  obterFasesGrupos,
  vincularEvento
};
