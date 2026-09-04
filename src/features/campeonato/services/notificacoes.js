const { emitir, EVENTOS } = require('../events');
const config = require('../../../config');
const { redacaoSegura } = require('../../../config/secrets');

class NotificacaoError extends Error {
  constructor(mensagem, code) {
    super(mensagem);
    this.name = 'NotificacaoError';
    this.code = code || 'NOTIFICACAO_ERROR';
  }
}

function _client() {
  if (typeof globalThis.__DISCORD_CLIENT__ !== 'undefined') return globalThis.__DISCORD_CLIENT__;
  return null;
}

function _setClient(client) {
  globalThis.__DISCORD_CLIENT__ = client;
}

async function notificarCampeao({ campeonatoId, vencedor, pódio = [], executadoPor = null }) {
  if (!vencedor?.capitaoId) {
    throw new NotificacaoError('Vencedor sem capitão.', 'VENCEDOR_SEM_CAPITAO');
  }
  const client = _client();
  if (!client) {
    return { ok: false, motivo: 'CLIENT_INDISPONIVEL' };
  }
  const linhas = [];
  linhas.push('🏆 Parabéns, **' + (vencedor.nome || 'Time') + '**!');
  linhas.push('Você venceu o campeonato `' + campeonatoId + '`.');
  if (pódio.length) {
    linhas.push('\n**Pódio:**');
    pódio.forEach((p) => linhas.push(p.posicao + 'º — ' + p.nome));
  }
  const mensagem = {
    content: '<@' + vencedor.capitaoId + '>',
    embeds: [{ title: '🏆 Você é campeão!', description: linhas.join('\n'), color: 0xFFD700 }]
  };
  try {
    const user = await client.users.fetch(vencedor.capitaoId);
    await user.send(mensagem);
    emitir(EVENTOS.NOTIFICACAO_ENVIADA, {
      campeonatoId: String(campeonatoId),
      tipo: 'CAMPEAO_DM',
      destinoId: vencedor.capitaoId
    });
    return { ok: true, canal: 'DM' };
  } catch (err) {
    return { ok: false, motivo: 'DM_FECHADA', erro: err?.message };
  }
}

async function anunciarNoCanal({ channelId, payload, executadoPor = null }) {
  const client = _client();
  if (!client) return { ok: false, motivo: 'CLIENT_INDISPONIVEL' };
  const canal = await client.channels.fetch(channelId).catch(() => null);
  if (!canal || !canal.send) return { ok: false, motivo: 'CANAL_INVALIDO' };
  await canal.send(payload);
  emitir(EVENTOS.NOTIFICACAO_ENVIADA, { canalId: channelId, tipo: 'ANUNCIO' });
  return { ok: true };
}

module.exports = { notificarCampeao, anunciarNoCanal, _setClient, NotificacaoError, redacaoSegura, config };
