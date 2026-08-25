function gerarNomeCall(tipo, donoNome, jogo, totalMembros) {
  const amiguinhos = totalMembros - 1;
  let sufixoAmigos = '';

  if (amiguinhos === 1) {
    sufixoAmigos = ' +1 Ômigo';
  } else if (amiguinhos > 1) {
    sufixoAmigos = ` +${amiguinhos} Ômigos`;
  }

  if (tipo === 'sideswipe') {
    return `🎮 | RL SideSwipe | ${donoNome}${sufixoAmigos}`;
  }

  const nomeJogo = jogo || 'Jogos Diversos';
  return `🎮 | ${nomeJogo} | ${donoNome}${sufixoAmigos}`;
}

module.exports = { gerarNomeCall };
