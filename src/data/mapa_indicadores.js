const MAPA_INDICADORES = {
  inteligencia_leitura: [
    'leitura_kickoff',
    'antecipacao_bola',
    'boost_management',
    'posicionamento_defensivo',
    'controle_areas',
    'tempo_decisao',
    'reacao_espaco',
    'leitura_ataque',
    'saidas_pressao',
    'cobertura'
  ],
  conhecimento_evolucao: [
    'entendimento_meta',
    'adaptacao_tatica',
    'aproveitamento_info',
    'estudo_weakness',
    'tomada_decisao',
    'aprendizado_pontual',
    'resposta_ao_time',
    'evolucao_mec',
    'consistencia_analise',
    'dominio_situacoes'
  ],
  controle_mecanica: [
    'controle_bola',
    'drible_rapido',
    'contato_fisico',
    'quica_firme',
    'micro_adjust',
    'reacao_virada',
    'stamina_mec',
    'sinalizacao',
    'cinematics',
    'posicionamento_bola'
  ],
  ataque: [
    'finalizacao',
    'pressao_ofensiva',
    'infiltracao',
    'criatividade_ataque',
    'transicao_ataque',
    'qualidade_chute',
    'combate_1x1',
    'finta',
    'tempo_ataque'
  ],
  defesa: [
    'desarme',
    'recuo',
    'marcacao',
    'recuperacao_bola',
    'interceptacao',
    'pressao_defensiva',
    'anti_finesse',
    'cobertura_tatica',
    'escala_espaco'
  ],
  equipe: [
    'comunicacao',
    'apoio_companheiro',
    'organizacao_time',
    'decision_making_time',
    'coordenacao',
    'sacrifcio',
    'jogo_coletivo',
    'lideranca',
    'compromisso'
  ],
  criatividade: [
    'jogo_lateral',
    'solucao_inovadora',
    'trick_play',
    'improviso',
    'rotacao_ataque',
    'finta_espaco',
    'adaptacao_jogo',
    'variedade_tatica',
    'personalidade'
  ],
  regularidade: [
    'consistencia_rend',
    'rotina_competitiva',
    'presenca_jogo',
    'performance_fase',
    'desempenho_ultimos',
    'resiliencia',
    'chegando_ao_ideal',
    'presenca_mensal',
    'valor_contribuicao'
  ]
};

function calcularCategorias(indicadoresDetalhados = {}) {
  const resultado = {};

  for (const [categoria, nomes] of Object.entries(MAPA_INDICADORES)) {
    const notas = nomes
      .map((chave) => Number(indicadoresDetalhados[chave] ?? 0))
      .filter((valor) => Number.isFinite(valor));

    if (!notas.length) {
      resultado[categoria] = 0;
      continue;
    }

    const media = notas.reduce((soma, valor) => soma + valor, 0) / notas.length;
    resultado[categoria] = Math.round((media / 10) * 100);
  }

  return resultado;
}

module.exports = { MAPA_INDICADORES, calcularCategorias }; 
