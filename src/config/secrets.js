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

module.exports = {
  requireEnv,
  optionalEnv,
  mascarar,
  redacaoSegura,
  ConfigError
};
