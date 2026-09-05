function calcularFasesSimultaneo({ numTimes, modo, duracaoMin = 180, intervaloMin = 30 }) {
  if (numTimes <= 1) return { fases: 0, duracaoReal: 0, intervalo: intervaloMin, precisaDividirDias: false };

  let numFases;
  if (modo === 'dupla') {
    numFases = Math.ceil(Math.log2(numTimes) * 2) - 1;
  } else if (modo === 'tripla') {
    numFases = Math.ceil(Math.log2(numTimes) * 3) - 2;
  } else {
    numFases = Math.ceil(Math.log2(numTimes));
  }

  const duracaoPorFase = Math.floor((duracaoMin - intervaloMin) / numFases);
  const duracaoReal = numFases * duracaoPorFase + intervaloMin;
  const maxPartidasPorFase = Math.max(1, Math.floor(numTimes / 2 / numFases));

  return {
    fases: numFases,
    duracaoReal,
    duracaoPorFase,
    intervalo: intervaloMin,
    maxPartidasPorFase,
    precisaDividirDias: duracaoReal > duracaoMin && numTimes > 512,
    sugestaoDuracao: numTimes > 512 ? 240 : duracaoMin
  };
}

function calcularFasesEscalonado({ numTimes, modo, duracaoMin = 180, intervaloMin = 30 }) {
  if (numTimes <= 1) return { partidas: 0, duracaoReal: 0, dias: 0, partidasPorDia: 0, precisaDividirDias: false };

  let totalPartidas;
  if (modo === 'dupla') {
    totalPartidas = (Math.ceil(Math.log2(numTimes)) * 2 - 1) * numTimes;
  } else if (modo === 'tripla') {
    totalPartidas = (Math.ceil(Math.log2(numTimes)) * 3 - 2) * numTimes;
  } else {
    totalPartidas = numTimes - 1;
  }

  const partidasPorDia = Math.floor((duracaoMin - intervaloMin) / 20);
  const dias = Math.ceil(totalPartidas / partidasPorDia);

  return {
    partidas: totalPartidas,
    duracaoReal: duracaoMin,
    dias,
    partidasPorDia,
    precisaDividirDias: dias > 1,
    sugestaoDuracao: dias > 1 ? 240 : duracaoMin
  };
}

function gerarDescricaoEvento({ dataInicio, duracaoMin = 180, numTimes = 0, modo = 'simples', simultaneo = true }) {
  const diaSemana = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'][new Date(dataInicio).getDay()];
  const horaInicio = diaSemana === 'SEXTA' ? '19:30' : diaSemana === 'SÁBADO' ? '19:00' : '14:30';
  const [h, m] = horaInicio.split(':').map(Number);
  const inicio = new Date(dataInicio);
  inicio.setHours(h, m, 0, 0);
  const fim = new Date(inicio.getTime() + duracaoMin * 60 * 1000);
  const horaFim = fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  const calc = simultaneo
    ? calcularFasesSimultaneo({ numTimes, modo, duracaoMin })
    : calcularFasesEscalonado({ numTimes, modo, duracaoMin });

  const linhas = [];
  linhas.push(`🏆 **Campeonato Ômega**`);
  linhas.push(`📅 Início: **${diaSemana} ${dataInicio.toLocaleDateString('pt-BR')} às ${horaInicio}**`);
  linhas.push(`⏰ Previsão de término: **${horaFim}**`);
  linhas.push(`👥 Times inscritos: **${numTimes}**`);
  linhas.push(`🎮 Modo: **${modo}** (${simultaneo ? 'SIMULTÂNEO' : 'ESCALONADO'})`);
  linhas.push(`⏱️ Duração: **${duracaoMin >= 240 ? '4h' : '3h'}**`);

  if (numTimes > 0) {
    if (simultaneo) {
      linhas.push(`\n📊 **Cálculo automático:**`);
      linhas.push(`• Fases: ${calc.fases}`);
      linhas.push(`• Duração real: ${calc.duracaoReal}min`);
      linhas.push(`• Intervalo: ${calc.intervalo}min`);
      if (calc.precisadividirDias || calc.sugestaoDuracao !== duracaoMin) {
        linhas.push(`\n⚠️ Com ${numTimes} times, recomenda-se **4h** de duração para acomodar todas as fases.`);
      }
    } else {
      linhas.push(`\n📊 **Cálculo automático:**`);
      linhas.push(`• Total de partidas: ${calc.partidas}`);
      linhas.push(`• Partidas por dia: ${calc.partidasPorDia}`);
      linhas.push(`• Dias necessários: ${calc.dias}`);
      if (calc.precisadividirDias) {
        linhas.push(`\n⚠️ Com ${numTimes} times, são necessários **${calc.dias} dias** no formato escalonado.`);
        linhas.push(`Sugestão: ${diaSemana} ${horaInicio}-${horaFim} + ${calc.dias - 1} dia(s) adicional(is).`);
      }
    }
  }

  return {
    descricao: linhas.join('\n'),
    inicio,
    fim,
    horaInicio,
    horaFim,
    calculo: calc
  };
}

module.exports = {
  calcularFasesSimultaneo,
  calcularFasesEscalonado,
  gerarDescricaoEvento
};
