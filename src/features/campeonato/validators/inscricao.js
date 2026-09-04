const config = require('../../../config');

class InscricaoError extends Error {
  constructor(mensagem, code) {
    super(mensagem);
    this.name = 'InscricaoError';
    this.code = code || 'INSCRICAO_ERROR';
  }
}

function temCargoRank(member, rank) {
  if (!member || !member.roles?.cache) return false;
  const roleId = config.campeonato.cargosRanks[rank];
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

function temAlgumCargoRank(member, ranks) {
  if (!Array.isArray(ranks) || !member?.roles?.cache) return null;
  for (const rank of ranks) {
    if (temCargoRank(member, rank)) return rank;
  }
  return null;
}

function perfilValido(perfil) {
  if (!perfil) return { ok: false, motivo: 'Perfil não encontrado. Preencha sua ficha antes de se inscrever.' };
  if (!perfil.nick_principal) return { ok: false, motivo: 'Seu nick principal não está cadastrado. Preencha a ficha.' };
  if (!perfil.rankX1 && !perfil.rankX2) {
    return { ok: false, motivo: 'Você precisa ter pelo menos um rank cadastrado (X1 ou X2) na ficha.' };
  }
  return { ok: true };
}

function rankDoPerfil(perfil) {
  return perfil?.rankX1 || perfil?.rankX2 || perfil?.picoRank || null;
}

function rankSnapshotEhCompativel(perfil, rankCampeonato) {
  const rankPerfil = (rankDoPerfil(perfil) || '').toLowerCase().trim();
  return rankPerfil === rankCampeonato.toLowerCase();
}

function validarInscricao({ member, perfil, ranksDisponiveis }) {
  if (!Array.isArray(ranksDisponiveis) || ranksDisponiveis.length === 0) {
    throw new InscricaoError('Nenhum rank disponível neste campeonato.', 'INSCRICAO_RANK_INDISPONIVEL');
  }
  const rankComCargo = temAlgumCargoRank(member, ranksDisponiveis);
  if (!rankComCargo) {
    throw new InscricaoError(
      'Você não tem o cargo de nenhum rank deste campeonato. Peça à staff para atribuir.',
      'INSCRICAO_SEM_CARGO'
    );
  }
  const checkPerfil = perfilValido(perfil);
  if (!checkPerfil.ok) {
    throw new InscricaoError(checkPerfil.motivo, 'INSCRICAO_PERFIL_INVALIDO');
  }
  if (!rankSnapshotEhCompativel(perfil, rankComCargo)) {
    throw new InscricaoError(
      `Seu rank no perfil (${rankDoPerfil(perfil)}) não confere com o cargo (${rankComCargo}). Atualize sua ficha.`,
      'INSCRICAO_RANK_DIVERGENTE'
    );
  }
  return {
    rank: rankComCargo,
    capitaoUserId: member.id,
    capitaoNick: perfil.nick_principal,
    capitaoRankSnapshot: rankDoPerfil(perfil),
    capitaoNickJogo: perfil.nickJogo || perfil.nick_principal
  };
}

module.exports = {
  InscricaoError,
  temCargoRank,
  temAlgumCargoRank,
  perfilValido,
  rankDoPerfil,
  rankSnapshotEhCompativel,
  validarInscricao
};
