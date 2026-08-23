const { salvarCall } = require('.utils/database');

function nomeCallPara(dados, totalMembros) {
  if (totalMembros <= 1) return `${dados.game} | ${dados.donoNome}`;
  if (totalMembros === 2) return `${dados.game} | ${dados.donoNome} +1 Ômigo`;
  return `${dados.game} | ${dados.donoNome} +${totalMembros - 1} Ômigos`;
}

async function renomearCall(canal, dados) {
  const nomeFinal = nomeCallPara(dados, canal.members.size);
  if (canal.name !== nomeFinal) await canal.setName(nomeFinal).catch(() => {});
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

module.exports = { transferirDono, renomearCall, nomeCallPara };

