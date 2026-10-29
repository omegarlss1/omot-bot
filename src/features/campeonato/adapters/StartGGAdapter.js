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
  constructor({ token = process.env.STARTGG_TOKEN, apiUrl = config.startgg.apiUrl, fetchImpl = globalThis.fetch } = {}) {
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
    const data = await this.request({ query: 'query { currentUser { id name slug } }' });
    return data?.currentUser ?? null;
  }

  async validarContaOmega() {
    const conta = await this.ping();
    if (!conta?.id) throw new Error('[StartGGAdapter] A API não retornou uma conta autenticada.');
    return conta;
  }

  async getEventById(eventId) {
    const query = `query StartGGEvent($eventId: ID!) {
      event(id: $eventId) {
        id name slug
        tournament { id slug }
        phases { id name bracketType groupCount }
      }
    }`;
    const data = await this.request({ query, variables: { eventId: String(eventId) } });
    return data?.event ?? null;
  }

  async getEventBySlug(slug) {
    const query = `query StartGGEventBySlug($slug: String!) {
      event(slug: $slug) {
        id name slug
        tournament { id slug }
        phases { id name bracketType groupCount }
      }
    }`;
    const data = await this.request({ query, variables: { slug } });
    return data?.event ?? null;
  }

  async getEventEntrants(eventId) {
    const query = `query StartGGEventEntrants($eventId: ID!, $page: Int!, $perPage: Int!) {
      event(id: $eventId) {
        entrants(query: { page: $page, perPage: $perPage }) {
          pageInfo { totalPages }
          nodes { id name participants { id gamerTag } }
        }
      }
    }`;
    const entrants = [];
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      const data = await this.request({ query, variables: { eventId: String(eventId), page, perPage: 500 } });
      const connection = data?.event?.entrants;
      if (!connection) throw new Error('[StartGGAdapter] O evento não retornou sua lista de participantes.');
      entrants.push(...(connection.nodes || []));
      totalPages = Number(connection.pageInfo?.totalPages || 1);
    }
    return entrants;
  }

  async upsertPhase({ eventId, phaseId = null, name, bracketType, groupCount = null } = {}) {
    const query = `mutation UpsertPhase($eventId: ID, $phaseId: ID, $payload: PhaseUpsertInput!) {
      upsertPhase(eventId: $eventId, phaseId: $phaseId, payload: $payload) {
        id name bracketType groupCount numSeeds
      }
    }`;
    const payload = { name, bracketType };
    if (groupCount !== null) payload.groupCount = groupCount;
    const data = await this.request({
      query,
      variables: { eventId: String(eventId), phaseId: phaseId ? String(phaseId) : null, payload }
    });
    return data?.upsertPhase ?? null;
  }

  async getPhaseSeeds(phaseId) {
    const query = `query StartGGPhaseSeeds($phaseId: ID!, $page: Int!, $perPage: Int!) {
      phase(id: $phaseId) {
        id event { id }
        seeds(query: { page: $page, perPage: $perPage }) {
          pageInfo { totalPages }
          nodes { id seedNum entrant { id } }
        }
      }
    }`;
    const seeds = [];
    let totalPages = 1;
    let phase = null;
    for (let page = 1; page <= totalPages; page++) {
      const data = await this.request({ query, variables: { phaseId: String(phaseId), page, perPage: 500 } });
      phase = data?.phase || null;
      const connection = phase?.seeds;
      if (!connection) throw new Error(`[StartGGAdapter] Fase ${phaseId} não retornou seeds.`);
      seeds.push(...(connection.nodes || []));
      totalPages = Number(connection.pageInfo?.totalPages || 1);
    }
    return { phase, seeds };
  }

  async updatePhaseSeeding(phaseId, seedMapping) {
    const mutation = `mutation UpdatePhaseSeeding($phaseId: ID!, $seedMapping: [UpdatePhaseSeedInfo]!) {
      updatePhaseSeeding(phaseId: $phaseId, seedMapping: $seedMapping) { id }
    }`;
    const data = await this.request({ query: mutation, variables: { phaseId: String(phaseId), seedMapping } });
    return data?.updatePhaseSeeding ?? null;
  }

  async reportScore({ setId, winnerId, gameNum = 1 }) {
    const mutation = `mutation ReportScore($setId: ID!, $winnerId: ID!, $gameNum: Int!) {
      reportScore(setId: $setId, winnerId: $winnerId, gameNum: $gameNum) { id state }
    }`;
    const data = await this.request({ query: mutation, variables: { setId, winnerId, gameNum } });
    return data?.reportScore ?? null;
  }

  async fetchStandingsMetrics(tournamentId) {
    if (!tournamentId) return new Map();
    const query = `query TournamentStandings($tournamentId: ID!) {
      tournament(id: $tournamentId) {
        events { standings(query: { page: 1, perPage: 100 }) {
          nodes { placement entrant { id } stats { score { value } } }
        } }
      }
    }`;
    const data = await this.request({ query, variables: { tournamentId } });
    const metrics = new Map();
    for (const event of data?.tournament?.events || []) {
      for (const node of event?.standings?.nodes || []) {
        const entrantId = node?.entrant?.id;
        if (entrantId) metrics.set(String(entrantId), {
          gameWinPercent: Number(node?.stats?.score?.value ?? null),
          buchholz: null,
          placement: node.placement
        });
      }
    }
    return metrics;
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
