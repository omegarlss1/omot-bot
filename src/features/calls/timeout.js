function comTimeout(operacao, tempo = 5000) {
  let temporizador;
  let ativo = true;
  const trabalho = Promise.resolve()
    .then(() => operacao(() => ativo))
    .then((resultado) => {
      if (!ativo) {
        console.log('Operação concluída após timeout:', resultado);
        return undefined;
      }
      return resultado;
    })
    .catch((error) => {
      if (!ativo) {
        console.error('Operação concluída após timeout:', {
          message: error?.message,
          code: error?.code,
          stack: error?.stack
        });
        return undefined;
      }
      throw error;
    });
  const timeout = new Promise((resolve, reject) => {
    temporizador = setTimeout(() => {
      ativo = false;
      reject(Object.assign(new Error('Call operation timed out'), { code: 'CALL_TIMEOUT' }));
    }, tempo);
  });
  return Promise.race([trabalho, timeout]).finally(() => clearTimeout(temporizador));
}

module.exports = { comTimeout };
