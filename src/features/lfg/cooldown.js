class CooldownStore {
  constructor(duracaoMs) {
    this.duracaoMs = duracaoMs;
    this.porUsuario = new Map();
  }

  restanteMinutos(userId) {
    const inicio = this.porUsuario.get(userId);
    if (!inicio) return 0;
    const expiracao = inicio + this.duracaoMs;
    const agora = Date.now();
    if (agora >= expiracao) {
      this.porUsuario.delete(userId);
      return 0;
    }
    return Math.ceil((expiracao - agora) / 1000 / 60);
  }

  marcar(userId) {
    this.porUsuario.set(userId, Date.now());
  }
}

module.exports = { CooldownStore };
