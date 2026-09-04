const config = require('../../../config');
const { mascarar } = require('../../../config/secrets');

const JANELA_LIMIT_MS = 60_000;
const MAX_REQS_POR_JANELA = 80;
const MAX_OBJETOS_POR_REQ = 1000;
const MAX_RETRIES_429 = 3;
const BACKOFF_BASE_MS = 500;

class RateLimiter {
  constructor({ janelaMs = JANELA_LIMIT_MS, maxPorJanela = MAX_REQS_POR_JANELA } = {}) {
    this.janelaMs = janelaMs;
    this.maxPorJanela = maxPorJanela;
    this.historico = [];
  }

  async adquirir() {
    const agora = Date.now();
    this.historico = this.historico.filter((t) => agora - t < this.janelaMs);
    if (this.historico.length >= this.maxPorJanela) {
      const espera = this.janelaMs - (agora - this.historico[0]);
      await new Promise((resolve) => setTimeout(resolve, espera));
      return this.adquirir();
    }
    this.historico.push(agora);
  }

  snapshot() {
    return { usados: this.historico.length, max: this.maxPorJanela, janelaMs: this.janelaMs };
  }
}

class StartGGAdapter {
  constructor({ token = config.startgg.token, apiUrl = config.startgg.apiUrl, fetchImpl = globalThis.fetch } = {}) {
    if (!token) throw new Error('[StartGGAdapter] STARTGG_TOKEN ausente. Verifique .env.');
    this.token = token;
    this.apiUrl = apiUrl;
    this.fetchImpl = fetchImpl;
    this.limiter = new RateLimiter();
  }

  async request({ query, variables = {}, operationName = null } = {}) {
    if (!query) throw new Error('[StartGGAdapter] query é obrigatória.');
    for (let tentativa = 1; tentativa <= MAX_RETRIES_429; tentativa++) {
      await this.limiter.adquirir();
      const resposta = await this.fetchImpl(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({ query, variables, operationName })
      });
      if (resposta.status === 429 && tentativa < MAX_RETRIES_429) {
        await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * 2 ** (tentativa - 1)));
        continue;
      }
      const body = await resposta.json().catch(() => null);
      if (!resposta.ok || (body && Array.isArray(body.errors) && body.errors.length)) {
        const msg = body?.errors?.[0]?.message || resposta.statusText;
        throw new Error(`[StartGGAdapter] ${resposta.status} ${msg}`);
      }
      return body?.data ?? null;
    }
    throw new Error('[StartGGAdapter] Limite de retries em 429 esgotado.');
  }

  async queryMany(operations = []) {
    if (!Array.isArray(operations) || operations.length === 0) return [];
    if (operations.length > MAX_OBJETOS_POR_REQ) {
      throw new Error(`[StartGGAdapter] queryMany excedeu ${MAX_OBJETOS_POR_REQ} operações.`);
    }
    const query = operations.map((op, i) => `#${i}\n${op.query}`).join('\n\n');
    const variables = operations.reduce((acc, op, i) => ({ ...acc, [`v${i}`]: op.variables || {} }), {});
    const data = await this.request({ query, variables });
    return operations.map((_, i) => data?.[`#${i}`] ?? null);
  }

  async ping() {
    const data = await this.request({ query: 'query { currentUser { id name } }' });
    return data?.currentUser ?? null;
  }

  static diagnostic() {
    return {
      apiUrl: config.startgg.apiUrl,
      tokenMasked: mascarar(config.startgg.token),
      limites: { maxPorJanela: MAX_REQS_POR_JANELA, janelaMs: JANELA_LIMIT_MS, maxObjetosPorReq: MAX_OBJETOS_POR_REQ }
    };
  }
}

module.exports = { StartGGAdapter, RateLimiter };
