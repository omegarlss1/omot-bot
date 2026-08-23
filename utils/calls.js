const { salvarCall } = require('./database');

function nomeCallPara(dados, totalMembros) {
  if (totalMembros <= 1) return `${dados.game} | ${dados.donoNome}`;
  if (totalMembros === 2) return `${dados.game} | ${dados.donoNome} +1 Ômigo`;
  return `${dados.game} | ${dados.donoNome} +${totalMembros - 1} Ômigos`;
}

async function renomearCall(canal, dados) {
  const nomeFinal = nomeCallPara(dados, canal.members.size);
  if (canal.name !== nomeFinal) await canal.setName(nomeFinal).catch(() => {});
}

// O Discord só permite 2 mudanças de nome por canal a cada 10 min. Como entra/sai gente
// da call o tempo todo, chamar setName() na hora a cada evento estoura essa cota rápido -
// e quando estoura, o discord.js FICA ESPERANDO o tempo de espera (podendo passar de 1 min)
// antes de qualquer outra coisa que dependa do mesmo canal (ex: o dono tentando renomear
// pelo botão), travando o bot na visão de quem está usando.
// Aqui, em vez de renomear a cada evento, agrupamos várias mudanças rápidas numa só chamada
// alguns segundos depois - preserva a cota pra ações manuais do dono.
const timersRenomear = new Map();
const DEBOUNCE_MS = 6000;

function renomearCallDebounced(client, canalId) {
  const timerAntigo = timersRenomear.get(canalId);
  if (timerAntigo) clearTimeout(timerAntigo);

  const timer = setTimeout(async () => {
    timersRenomear.delete(canalId);
    const dados = client.callsTemporarias.get(canalId);
    if (!dados) return;
    const canal = client.channels.cache.get(canalId);
    if (!canal) return;
    await renomearCall(canal, dados);
  }, DEBOUNCE_MS);

  timersRenomear.set(canalId, timer);
}

// Usado tanto quando o dono sai sem avisar (auto) quanto pelo botão "Passar Dono" (manual).
// Atualiza Map em memória, database.json, permissões do canal e o nome da call.
async function transferirDono(client, canal, dadosAtuais, novoDonoMember) {
  const dadosAtualizados = { ...dadosAtuais, dono: novoDonoMember.id, donoNome: novoDonoMember.displayName };
  client.callsTemporarias.set(canal.id, dadosAtualizados);
  salvarCall(canal.id, dadosAtualizados);

  await canal.permissionOverwrites.delete(dadosAtuais.dono).catch(() => {});
  await canal.permissionOverwrites.edit(novoDonoMember.id, { ManageChannels: true, MoveMembers: true }).catch(() => {});
  await renomearCall(canal, dadosAtualizados);

  return dadosAtualizados;
}

module.exports = { transferirDono, renomearCall, renomearCallDebounced, nomeCallPara };
