class ConfigError extends Error {
  constructor(variavel) {
    super(`[config] Variável de ambiente obrigatória não definida: ${variavel}`);
    this.name = 'ConfigError';
    this.code = 'CONFIG_MISSING_VAR';
  }
}

function requireEnv(nome) {
  const valor = process.env[nome];
  if (valor === undefined || valor === null || valor === '') {
    throw new ConfigError(nome);
  }
  return valor;
}

function optionalEnv(nome, fallback = null) {
  const valor = process.env[nome];
  if (valor === undefined || valor === null || valor === '') return fallback;
  return valor;
}

function mascarar(segredo) {
  if (!segredo || typeof segredo !== 'string') return '';
  if (segredo.length <= 8) return '***';
  return `${segredo.slice(0, 4)}…${segredo.slice(-4)}`;
}

const SEGREDO_REDATOR = ['TOKEN', 'DISCORD_TOKEN', 'MONGODB_URI', 'STARTGG_TOKEN'];

function redacaoSegura(...args) {
  return args.map((arg) => {
    if (typeof arg !== 'string') return arg;
    let redacted = arg;
    for (const nome of SEGREDO_REDATOR) {
      const valor = process.env[nome];
      if (valor && valor.length >= 8 && redacted.includes(valor)) {
        redacted = redacted.split(valor).join(`<${nome}>`);
      }
    }
    return redacted;
  });
}

const ENV_OBRIGATORIAS = [
  'TOKEN', 'MONGODB_URI', 'CANAL_PINGS_ID',
  'CARGO_RLSIDESWIPE_ID', 'CARGO_JOGOSDIVERSOS_ID', 'CARGO_ORGANIZADORCAMPS_ID',
  'CARGO_BRONZE_ID', 'CARGO_PRATA_ID', 'CARGO_OURO_ID', 'CARGO_PLATINA_ID',
  'CARGO_DIAMANTE_ID', 'CARGO_CHAMPION_ID', 'CARGO_GRAND_CHAMPION_ID',
  'CARGO_OMEGA_CHAMPION_ID', 'STARTGG_TOKEN'
];

function validarEnv() {
  const faltando = [];
  for (const nome of ENV_OBRIGATORIAS) {
    const valor = process.env[nome];
    if (valor === undefined || valor === null || valor === '') {
      faltando.push(nome);
    }
  }
  return faltando;
}

module.exports = {
  requireEnv,
  optionalEnv,
  mascarar,
  redacaoSegura,
  ConfigError,
  validarEnv,
  ENV_OBRIGATORIAS
};
