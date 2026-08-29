// Indicadores binários: cada item marcado soma seu peso à categoria.
const D = {
  inteligencia: [
    ['antecipacao', 'Antecipação', 'Prevê jogadas e se posiciona antes das ações acontecerem.', 3],
    ['leitura_ofensiva', 'Leitura ofensiva', 'Identifica espaços e oportunidades para criar ataques.', 2],
    ['leitura_defensiva', 'Leitura defensiva', 'Identifica ameaças e prevê jogadas adversárias.', 2],
    ['tomada_de_decisao', 'Tomada de decisão', 'Escolhe boas ações durante a partida.', 3],
    ['decisao_rapida', 'Decisão rápida', 'Consegue decidir e agir em pouco tempo.', 2],
    ['leitura_de_adversario', 'Leitura de adversário', 'Identifica padrões de jogo e explora pontos fracos.', 2],
    ['consciencia_de_espaco', 'Consciência de espaço', 'Entende onde ocupar o campo em cada situação.', 2],
    ['controle_de_ritmo', 'Controle de ritmo', 'Sabe acelerar ou diminuir a velocidade da partida.', 2],
    ['jogo_sem_bola', 'Jogo sem bola', 'Influencia a partida mesmo sem estar com a bola.', 1],
    ['jogo_inteligente', 'Jogo inteligente', 'Encontra soluções eficientes durante a partida.', 3]
  ],
  conhecimento: [
    ['conhecimento_do_jogo', 'Conhecimento do jogo', 'Entende fundamentos, estratégias, mecânicas e situações do jogo.', 3],
    ['experiencia_competitiva', 'Experiência competitiva', 'Possui vivência em partidas de alto nível.', 2],
    ['analise_de_erros', 'Análise de erros', 'Identifica falhas e entende como melhorar.', 3],
    ['evolucao_e_disciplina', 'Evolução e Disciplina', 'Mantém dedicação para evoluir nos treinos e busca sempre desenvolver suas habilidades.', 3],
    ['aprendizado_rapido', 'Aprendizado rápido', 'Absorve novas técnicas e estratégias.', 2]
  ],
  controle: [
    ['controle_de_carro', 'Controle de carro', 'Domina movimentos do carro, direção, boost e recuperação.', 3],
    ['controle_aereo', 'Controle aéreo', 'Domina movimentos do carro no ar.', 2],
    ['controle_de_bola', 'Controle de bola', 'Mantém a bola próxima durante as jogadas.', 3],
    ['dominio_de_posse', 'Domínio de posse', 'Mantém a posse mesmo sob pressão.', 2],
    ['primeiro_toque', 'Primeiro toque', 'Recebe e direciona a bola com qualidade.', 2],
    ['drible', 'Drible', 'Supera adversários usando controle e movimentação.', 2],
    ['precisao_mecanica', 'Precisão mecânica', 'Executa mecânicas corretamente e com consistência.', 3],
    ['dominio_de_mecanica', 'Domínio de mecânica', 'Utiliza mecânicas avançadas com naturalidade.', 3],
    ['recovery', 'Recovery', 'Recupera rapidamente o controle do carro após uma jogada.', 3],
    ['movimentacao_avancada', 'Movimentação avançada', 'Controla o carro e a bola em jogadas complexas.', 2]
  ],
  ataque: [
    ['criacao_ofensiva', 'Criação ofensiva', 'Cria oportunidades de ataque e gera perigo ao adversário.', 3],
    ['finalizacao', 'Finalização', 'Transforma oportunidades em gols.', 3],
    ['chute_preciso', 'Chute preciso', 'Acerta finalizações em locais difíceis.', 2],
    ['poder_ofensivo', 'Poder ofensivo', 'Pressiona e domina ações ofensivas.', 2],
    ['drible_ofensivo', 'Drible ofensivo', 'Supera adversários no ataque com controle de bola.', 2],
    ['um_contra_um_ofensivo', '1 contra 1 ofensivo', 'Se destaca em disputas individuais no ataque.', 2],
    ['infiltracao', 'Infiltração', 'Encontra espaços para avançar e participar das jogadas.', 2],
    ['posicionamento_ofensivo', 'Posicionamento ofensivo', 'Se posiciona bem para receber ou criar oportunidades.', 3],
    ['contra_ataque', 'Contra-ataque', 'Transforma recuperações de bola em ataques rápidos.', 2],
    ['pressao_ofensiva', 'Pressão ofensiva', 'Mantém o adversário pressionado.', 3]
  ],
  defesa: [
    ['posicionamento_defensivo', 'Posicionamento defensivo', 'Mantém boa posição para proteger o gol.', 3],
    ['defesa_individual', 'Defesa individual', 'Defende jogadas sem depender de ajuda.', 2],
    ['defesa_sob_pressao', 'Defesa sob pressão', 'Mantém eficiência defensiva em situações difíceis.', 3],
    ['reflexo_defensivo', 'Reflexo defensivo', 'Reage rapidamente a ataques inesperados.', 2],
    ['save_dificil', 'Save difícil', 'Faz defesas improváveis.', 1],
    ['block', 'Block', 'Bloqueia chutes e interrompe jogadas.', 2],
    ['corte_de_jogada', 'Corte de jogada', 'Interrompe ataques antes da finalização.', 3],
    ['cobertura_defensiva', 'Cobertura defensiva', 'Protege o campo defensivo e evita deixar o gol vulnerável.', 3],
    ['paciencia_defensiva', 'Paciência defensiva', 'Espera o momento correto para realizar uma ação defensiva.', 3]
  ],
  equipe: [
    ['adaptacao', 'Adaptação', 'Muda o estilo de jogo conforme o adversário ou time.', 3],
    ['suporte_ao_parceiro', 'Suporte ao parceiro', 'Atua como apoio do time em defesa, rebotes e segurança.', 3],
    ['cobertura_ofensiva', 'Cobertura ofensiva', 'Acompanha o ataque do parceiro e dá continuidade à jogada.', 2],
    ['passe_inteligente', 'Passe inteligente', 'Cria oportunidades através de passes.', 2],
    ['entendimento_de_dupla', 'Entendimento de dupla', 'Se adapta ao estilo do parceiro.', 3],
    ['comunicacao', 'Comunicação', 'Facilita combinações e organização do time.', 2],
    ['flexibilidade_de_funcao', 'Flexibilidade de função', 'Atua em diferentes funções dentro da partida.', 2],
    ['jogo_coletivo', 'Jogo coletivo', 'Divide protagonismo e faz o time funcionar como uma unidade.', 3],
    ['lideranca', 'Liderança', 'Ajuda a organizar e orientar jogadores.', 1],
    ['construcao_de_jogada', 'Construção de jogada', 'Toma decisões que favorecem o time em qualquer setor.', 3]
  ],
  criatividade: [
    ['criatividade', 'Criatividade', 'Encontra soluções diferentes durante as partidas.', 2],
    ['improviso', 'Improviso', 'Resolve situações inesperadas.', 2],
    ['ousadia', 'Ousadia', 'Busca jogadas difíceis e inesperadas.', 1],
    ['estilo_imprevisivel', 'Estilo imprevisível', 'Dificulta a leitura dos adversários.', 1],
    ['controle_emocional', 'Controle emocional', 'Mantém equilíbrio durante as partidas.', 3],
    ['frieza', 'Frieza', 'Mantém qualidade nas decisões sob pressão.', 3],
    ['confianca', 'Confiança', 'Executa jogadas acreditando nas próprias habilidades.', 2],
    ['resiliencia', 'Resiliência', 'Mantém desempenho após erros.', 3],
    ['mentalidade_competitiva', 'Mentalidade competitiva', 'Busca evolução e alto desempenho.', 3],
    ['versatilidade', 'Versatilidade', 'Se adapta a estilos variados de jogo.', 2]
  ],
  desempenho: [
    ['consistencia', 'Consistência', 'Mantém bom desempenho dentro da mesma partida.', 3],
    ['regularidade', 'Regularidade', 'Mantém seu nível em diferentes partidas.', 3],
    ['velocidade_de_jogo', 'Velocidade de jogo', 'Acompanha partidas rápidas e intensas.', 2],
    ['velocidade_de_reacao', 'Velocidade de reação', 'Responde rapidamente aos acontecimentos.', 2],
    ['controle_de_espaco', 'Controle de espaço', 'Domina áreas importantes do campo.', 2],
    ['eficiencia', 'Eficiência', 'Age com pouco desperdício de boost e pulo.', 3],
    ['seguranca', 'Segurança', 'Evita erros desnecessários e mantém estabilidade.', 2],
    ['especializacao', 'Especialização', 'Possui alto nível em uma função específica.', 1],
    ['impacto_na_partida', 'Impacto na partida', 'Influencia diretamente o resultado.', 3],
    ['presenca_de_jogo', 'Presença de jogo', 'Está envolvido nas principais ações da partida.', 2]
  ]
};

const CATEGORIAS_INDICADORES = {
  inteligencia_leitura: 'inteligencia',
  conhecimento_evolucao: 'conhecimento',
  controle_mecanica: 'controle',
  ataque: 'ataque',
  defesa: 'defesa',
  equipe: 'equipe',
  criatividade: 'criatividade',
  regularidade: 'desempenho'
};

const INDICADORES = Object.fromEntries(Object.entries(D).map(([categoria, itens]) => [
  categoria, itens.map(([key, nome, descricao, peso]) => ({ key, nome, descricao, categoria, peso }))
]));
const INDICADORES_POR_CATEGORIA = Object.fromEntries(
  Object.entries(CATEGORIAS_INDICADORES).map(([categoria, grupo]) => [categoria, INDICADORES[grupo]])
);
const TOTAL_INDICADORES = Object.values(INDICADORES).reduce((total, itens) => total + itens.length, 0);

module.exports = { INDICADORES, CATEGORIAS_INDICADORES, INDICADORES_POR_CATEGORIA, TOTAL_INDICADORES };
