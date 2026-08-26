const locks = new Map();

async function adquirirLockCall(channelId) {
  const anterior = locks.get(channelId) || Promise.resolve();
  let liberar;
  const atual = new Promise((resolve) => {
    liberar = resolve;
  });
  locks.set(channelId, atual);

  await anterior;
  let liberado = false;
  return () => {
    if (liberado) return;
    liberado = true;
    liberar();
    if (locks.get(channelId) === atual) locks.delete(channelId);
  };
}

module.exports = { adquirirLockCall };
