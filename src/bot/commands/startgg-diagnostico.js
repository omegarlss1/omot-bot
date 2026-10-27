const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { StartGGAdapter } = require('../../features/campeonato/adapters/StartGGAdapter');

const TIPOS_RELEVANTES = [
  'TournamentCreateInput',
  'TournamentUpsertInput',
  'EventCreateInput',
  'EventUpsertInput',
  'ParticipantInput',
  'EntrantCreateInput',
  'PhaseUpsertInput',
  'UpdatePhaseSeedInfo',
  'BracketType'
];

const MUTACOES_RELEVANTES = /tournament|event|participant|entrant|phase|seed|bracket/i;
const LIMITE_TEXTO = 16_000;

function tipoCompleto(tipo) {
  if (!tipo) return 'desconhecido';
  if (tipo.name) return tipo.name;
  return tipo.ofType ? `${tipo.kind}(${tipoCompleto(tipo.ofType)})` : tipo.kind || 'desconhecido';
}

function criarQuerySchema() {
  const tipos = TIPOS_RELEVANTES.map((nome, indice) =>
    `tipo${indice}: __type(name: "${nome}") { name kind inputFields { name type { kind name ofType { kind name ofType { kind name } } } } enumValues { name } }`
  );
  return `query StartGGSchemaDiagnostic {
    mutation: __type(name: "Mutation") {
      fields {
        name
        args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      }
    }
    ${tipos.join('\n')}
  }`;
}

function mensagemErroSegura(error) {
  const mensagem = String(error?.message || 'erro desconhecido');
  const token = process.env.STARTGG_TOKEN;
  return (token ? mensagem.split(token).join('[redigido]') : mensagem).slice(0, 1_500);
}

function formatarDiagnosticoSchema(data) {
  const linhas = ['Diagnóstico do schema GraphQL do Start.gg'];
  const mutacoes = (data?.mutation?.fields || [])
    .filter((campo) => MUTACOES_RELEVANTES.test(campo.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  linhas.push('', 'Mutações relacionadas a torneios, eventos, participantes e fases:');
  if (!mutacoes.length) {
    linhas.push('(nenhuma encontrada ou introspecção não disponível)');
  } else {
    for (const mutacao of mutacoes) {
      const args = (mutacao.args || [])
        .map((arg) => `${arg.name}: ${tipoCompleto(arg.type)}`)
        .join(', ');
      linhas.push(`- ${mutacao.name}(${args})`);
    }
  }

  linhas.push('', 'Tipos de entrada e enumeração relevantes:');
  TIPOS_RELEVANTES.forEach((nome, indice) => {
    const tipo = data?.[`tipo${indice}`];
    if (!tipo) {
      linhas.push(`- ${nome}: não encontrado`);
    } else if (tipo.kind === 'ENUM') {
      linhas.push(`- ${nome}: ${(tipo.enumValues || []).map((valor) => valor.name).join(', ') || '(sem valores)'}`);
    } else {
      const campos = (tipo.inputFields || [])
        .map((campo) => `${campo.name}: ${tipoCompleto(campo.type)}`)
        .join(', ');
      linhas.push(`- ${nome}: ${campos || '(sem campos)'}`);
    }
  });

  const texto = linhas.join('\n');
  if (texto.length > LIMITE_TEXTO) {
    throw new Error('O schema retornado é grande demais para este diagnóstico. Restrinja a consulta ou tente novamente.');
  }
  return texto;
}

async function consultarSchema(adapter = new StartGGAdapter()) {
  const resultado = await adapter.request({ query: criarQuerySchema() });
  if (!resultado?.mutation) {
    throw new Error('A API não retornou o schema de mutações. Confira a autenticação e a disponibilidade de introspecção.');
  }
  return formatarDiagnosticoSchema(resultado);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('startgg-diagnostico')
    .setDescription('Consulta o schema da API Start.gg sem exibir credenciais')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has?.('Administrator')) {
      return interaction.reply({ content: '❌ Apenas administradores.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });
    try {
      const diagnostico = await consultarSchema();
      if (diagnostico.length <= 1_900) {
        return interaction.editReply({ content: `\`\`\`text\n${diagnostico}\n\`\`\`` });
      }
      return interaction.editReply({
        content: 'Diagnóstico concluído. Baixe o arquivo e compartilhe o conteúdo; ele não inclui credenciais.',
        files: [{ attachment: Buffer.from(diagnostico, 'utf8'), name: 'startgg-schema-diagnostico.txt' }]
      });
    } catch (error) {
      const mensagem = mensagemErroSegura(error);
      console.error('[StartGGDiagnostico] Falha ao consultar schema:', {
        message: mensagem,
        code: error?.code
      });
      return interaction.editReply({
        content: `Não foi possível consultar o schema do Start.gg: ${mensagem}`
      });
    }
  },
  criarQuerySchema,
  formatarDiagnosticoSchema,
  consultarSchema
};
