const { EventEmitter } = require('node:events');

class CampeonatoEvents extends EventEmitter {}

const instance = new CampeonatoEvents();
instance.setMaxListeners(50);

const EVENTOS = {
  EVENTO_CRIADO: 'evento.criado',
  CAMPEONATO_CRIADO: 'campeonato.criado',
  INSCRICAO_REALIZADA: 'inscricao.realizada',
  INSCRICOES_FECHADAS: 'inscricoes.fechadas',
  CORTE_REALIZADO: 'corte.realizado',
  FORMATO_ESCOLHIDO: 'formato.escolhido',
  PARTIDA_CRIADA: 'partida.criada',
  CHECKIN_REALIZADO: 'checkin.realizado',
  PLACAR_ENVIADO: 'placar.enviado',
  PLACAR_VALIDADO: 'placar.validado',
  PLACAR_CONTESTADO: 'placar.contestado',
  PLACAR_DEFINIDO_ORG: 'placar.definido.org',
  WO_REGISTRADO: 'wo.registrado',
  PARTIDA_FINALIZADA: 'partida.finalizada',
  DESEMPATE_NECESSARIO: 'desempate.necessario',
  CLASSIFICACAO_CALCULADA: 'classificacao.calculada'
};

function emitir(chaveOuValor, payload) {
  let valor = chaveOuValor;
  if (Object.prototype.hasOwnProperty.call(EVENTOS, chaveOuValor)) {
    valor = EVENTOS[chaveOuValor];
  } else if (!Object.values(EVENTOS).includes(chaveOuValor)) {
    throw new Error(`[campeonato.events] Evento desconhecido: ${chaveOuValor}`);
  }
  instance.emit(valor, payload);
}

module.exports = { CampeonatoEvents, instance, emitir, EVENTOS };
