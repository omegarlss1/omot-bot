const INDICADORES = {
  inteligencia: [
    ['antecipacao', 'Antecipação', 'Prevê jogadas e se posiciona antes das ações acontecerem.'],
    ['leitura_ofensiva', 'Leitura ofensiva', 'Identifica espaços e oportunidades para criar ataques.'],
    ['leitura_defensiva', 'Leitura defensiva', 'Identifica ameaças e prevê jogadas adversárias.'],
    ['tomada_de_decisao', 'Tomada de decisão', 'Escolhe boas ações durante a partida.'],
    ['decisao_rapida', 'Decisão rápida', 'Consegue decidir e agir em pouco tempo.'],
    ['leitura_de_adversario', 'Leitura de adversário', 'Identifica padrões de jogo e explora pontos fracos.'],
    ['consciencia_de_espaco', 'Consciência de espaço', 'Entende onde ocupar o campo em cada situação.'],
    ['controle_de_ritmo', 'Controle de ritmo', 'Sabe acelerar ou diminuir a velocidade da partida.'],
    ['jogo_sem_bola', 'Jogo sem bola', 'Consegue influenciar a partida mesmo sem estar com a bola.'],
    ['jogo_inteligente', 'Jogo inteligente', 'Encontra soluções eficientes mesmo sem depender de conhecimento avançado do jogo.']
  ],
  conhecimento: [
    ['conhecimento_do_jogo', 'Conhecimento do jogo', 'Entende fundamentos, estratégias, mecânicas e situações do jogo.'],
    ['experiencia_competitiva', 'Experiência competitiva', 'Possui vivência em partidas de alto nível.'],
    ['analise_de_erros', 'Análise de erros', 'Identifica falhas e entende como melhorar.'],
    ['evolucao_e_disciplina', 'Evolução e Disciplina', 'Mantém dedicação para evoluir nos treinos e busca sempre desenvolver suas habilidades.'],
    ['aprendizado_rapido', 'Aprendizado rápido', 'Absorve novas técnicas e estratégias.']
  ],
  controle: [
    ['controle_de_carro', 'Controle de carro', 'Domina movimentos do carro, direção, uso de boost e recuperação do controle durante a movimentação.'],
    ['controle_aereo', 'Controle aéreo', 'Domina movimentos do carro no ar.'],
    ['controle_de_bola', 'Controle de bola', 'Consegue manter a bola próxima e evita perder a posse durante as jogadas.'],
    ['dominio_de_posse', 'Domínio de posse', 'Consegue manter a posse mesmo sob pressão e ataques adversários.'],
    ['primeiro_toque', 'Primeiro toque', 'Consegue receber e direcionar a bola com qualidade.'],
    ['drible', 'Drible', 'Supera adversários usando controle e movimentação.'],
    ['precisao_mecanica', 'Precisão mecânica', 'Executa mecânicas corretamente sem perder consistência (stall, fast stall, gold bounce e outras técnicas).'],
    ['dominio_de_mecanica', 'Domínio de mecânica', 'Possui alto nível de controle e utiliza mecânicas avançadas com naturalidade.'],
    ['recovery', 'Recovery', 'Recupera rapidamente o controle do carro após qualquer situação que exija uma retomada da jogada.'],
    ['movimentacao_avancada', 'Movimentação avançada', 'Controla simultaneamente movimentação do carro e interação com a bola em jogadas complexas.']
  ],
  ataque: [
    ['criacao_ofensiva', 'Criação ofensiva', 'Cria oportunidades de ataque e gera perigo ao adversário.'],
    ['finalizacao', 'Finalização', 'Transforma oportunidades em gols.'],
    ['chute_preciso', 'Chute preciso', 'Consegue acertar finalizações em locais difíceis ou com maior dificuldade de execução.'],
    ['poder_ofensivo', 'Poder ofensivo', 'Tem facilidade para pressionar e dominar ações ofensivas.'],
    ['drible_ofensivo', 'Drible ofensivo', 'Usa controle de bola para superar adversários no ataque.'],
    ['um_contra_um_ofensivo', '1 contra 1 ofensivo', 'Se destaca em disputas individuais no ataque.'],
    ['infiltracao', 'Infiltração', 'Encontra espaços para avançar e participar das jogadas.'],
    ['posicionamento_ofensivo', 'Posicionamento ofensivo', 'Se posiciona bem para receber ou criar oportunidades.'],
    ['contra_ataque', 'Contra-ataque', 'Transforma recuperações de bola em ataques rápidos.'],
    ['pressao_ofensiva', 'Pressão ofensiva', 'Mantém o adversário pressionado.']
  ],
  defesa: [
    ['posicionamento_defensivo', 'Posicionamento defensivo', 'Mantém boa posição para proteger o gol.'],
    ['defesa_individual', 'Defesa individual', 'Consegue defender jogadas sem depender de ajuda.'],
    ['defesa_sob_pressao', 'Defesa sob pressão', 'Mantém eficiência defensiva em situações difíceis.'],
    ['reflexo_defensivo', 'Reflexo defensivo', 'Reage rapidamente a ataques inesperados.'],
    ['save_dificil', 'Save difícil', 'Faz defesas improváveis.'],
    ['block', 'Block', 'Bloqueia chutes e interrompe jogadas.'],
    ['corte_de_jogada', 'Corte de jogada', 'Interrompe ataques antes da finalização.'],
    ['cobertura_defensiva', 'Cobertura defensiva', 'Protege o campo defensivo, acompanha possíveis contra-ataques e evita deixar o gol vulnerável.'],
    ['paciencia_defensiva', 'Paciência defensiva', 'Espera o momento correto para realizar uma ação defensiva.'],
    ['rebote_defensivo', 'Rebote defensivo', 'Antecipa e controla rebotes na parede e no backboard (parede) defensivo, evitando segundo chute do adversário.']
  ],
  equipe: [
    ['adaptacao', 'Adaptação', 'Muda o estilo de jogo conforme o adversário ou time.'],
    ['suporte_ao_parceiro', 'Suporte ao parceiro', 'Atua como apoio do time, ajudando com defesa, limpeza de jogadas, rebotes e segurança.'],
    ['cobertura_ofensiva', 'Cobertura ofensiva', 'Acompanha o ataque do parceiro, dando continuidade à jogada e mantendo presença ofensiva.'],
    ['passe_inteligente', 'Passe inteligente', 'Cria oportunidades através de passes.'],
    ['entendimento_de_dupla', 'Entendimento de dupla', 'Consegue se adaptar ao estilo do parceiro.'],
    ['comunicacao', 'Comunicação', 'Facilita combinações e organização do time.'],
    ['flexibilidade_de_funcao', 'Flexibilidade de função', 'Consegue atuar em diferentes funções dentro da partida.'],
    ['jogo_coletivo', 'Jogo coletivo', 'Consegue dividir protagonismo, unir forças e fazer o time funcionar como uma unidade.'],
    ['lideranca', 'Liderança', 'Ajuda a organizar e orientar jogadores.'],
    ['construcao_de_jogada', 'Construção de jogada', 'Toma decisões que transformam a situação da partida e favorecem o time, seja na defesa, meio campo ou ataque.']
  ],
  criatividade: [
    ['criatividade', 'Criatividade', 'Encontra soluções diferentes durante as partidas.'],
    ['improviso', 'Improviso', 'Resolve situações inesperadas.'],
    ['ousadia', 'Ousadia', 'Busca jogadas difíceis e inesperadas.'],
    ['estilo_imprevisivel', 'Estilo imprevisível', 'Dificulta a leitura dos adversários.'],
    ['controle_emocional', 'Controle emocional', 'Mantém equilíbrio durante as partidas.'],
    ['frieza', 'Frieza', 'Mantém qualidade nas decisões sob pressão.'],
    ['confianca', 'Confiança', 'Executa jogadas acreditando nas próprias habilidades.'],
    ['resiliencia', 'Resiliência', 'Mantém desempenho após erros.'],
    ['mentalidade_competitiva', 'Mentalidade competitiva', 'Busca evolução e alto desempenho.'],
    ['versatilidade', 'Versatilidade', 'Consegue jogar de diferentes maneiras e se adaptar a estilos variados.']
  ],
  desempenho: [
    ['consistencia', 'Consistência', 'Mantém bom desempenho dentro da mesma partida.'],
    ['regularidade', 'Regularidade', 'Mantém seu nível de desempenho em diferentes partidas.'],
    ['velocidade_de_jogo', 'Velocidade de jogo', 'Consegue acompanhar partidas rápidas e intensas.'],
    ['velocidade_de_reacao', 'Velocidade de reação', 'Responde rapidamente aos acontecimentos.'],
    ['controle_de_espaco', 'Controle de espaço', 'Domina áreas importantes do campo.'],
    ['eficiencia', 'Eficiência', 'Faz ações com pouco desperdício de boost e pulo.'],
    ['seguranca', 'Segurança', 'Evita erros desnecessários e mantém estabilidade.'],
    ['especializacao', 'Especialização', 'Possui alto nível em uma função específica.'],
    ['impacto_na_partida', 'Impacto na partida', 'Consegue influenciar diretamente o resultado.'],
    ['presenca_de_jogo', 'Presença de jogo', 'Está envolvido nas principais ações da partida.']
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

const INDICADORES_POR_CATEGORIA = Object.fromEntries(
  Object.entries(CATEGORIAS_INDICADORES).map(([categoria, grupo]) => [
    categoria,
    INDICADORES[grupo].map(([id, nome, descricao]) => ({ id, nome, descricao }))
  ])
);

const TOTAL_INDICADORES = Object.values(INDICADORES).reduce((total, itens) => total + itens.length, 0);

module.exports = { INDICADORES, CATEGORIAS_INDICADORES, INDICADORES_POR_CATEGORIA, TOTAL_INDICADORES };
