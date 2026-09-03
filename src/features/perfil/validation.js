const { PermissionFlagsBits } = require('discord.js');
const { FICHA_MODAL_STEPS, NICK_PATTERN } = require('./constants');

function normalizarOpcaoPermitida(valor, opcoesPermitidas) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  const encontrado = opcoesPermitidas.find((opcao) => opcao.toLowerCase() === texto.toLowerCase());
  return encontrado || null;
}

function validarDataNascimento(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return { ok: true, value: null };
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(texto)) {
    return { ok: false, error: '❌ O campo de data de nascimento precisa seguir o formato DD/MM/AAAA.' };
  }

  const [dia, mes, ano] = texto.split('/').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    Number.isNaN(data.getTime()) ||
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return { ok: false, error: '❌ A data de nascimento informada é inválida.' };
  }

  return { ok: true, value: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` };
}

function sanitizeTextoLivre(valor, { maxLength = 120, allowEmpty = true } = {}) {
  const texto = String(valor ?? '').trim();
  if (!texto) return allowEmpty ? '' : null;
  const semMention = texto.replace(/@everyone|@here/gi, '');
  return semMention.slice(0, maxLength);
}

function calcularIdade(dataNascimento) {
  if (!dataNascimento) return 0;

  const data = new Date(dataNascimento);
  if (Number.isNaN(data.getTime())) return 0;

  const hoje = new Date();
  let idade = hoje.getFullYear() - data.getFullYear();
  const mesAtual = hoje.getMonth();
  const diaAtual = hoje.getDate();
  const mesNascimento = data.getMonth();
  const diaNascimento = data.getDate();

  if (mesAtual < mesNascimento || (mesAtual === mesNascimento && diaAtual < diaNascimento)) {
    idade -= 1;
  }

  return idade > 0 ? idade : 0;
}

function hasPermissaoAdmin(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ModerateMembers)) return true;
  const nomes = (member.roles?.cache?.map((role) => role.name || '') || []).map((nome) => nome.toLowerCase());
  return nomes.some((nome) => /staff|admin|modera(dor[ea]s?|ção|cao)?|coordena(ca|ção)|diretoria/i.test(nome));
}

function obterCampoFicha(campoId) {
  return FICHA_MODAL_STEPS.flat().find((campo) => campo.id === campoId) || null;
}

function obterCampoComErro(validacao) {
  return validacao.campo || validacao.campoId;
}

async function validarCamposEtapa(stepIndex, dadosEtapa, userId = null, PerfilMembro = null) {
  const campos = FICHA_MODAL_STEPS[stepIndex] || [];

  for (const campo of campos) {
    if (campo.id === 'nick_principal_input') {
      const nick = String(dadosEtapa[campo.id] || '').trim();
      if (!nick || nick.length < 3 || nick.length > 20 || !NICK_PATTERN.test(nick)) {
        return { ok: false, campo: campo.id, mensagem: 'Nick inválido. Use 3-20 caracteres sem quebras de linha ou caracteres de controle.' };
      }
      if (userId && PerfilMembro) {
        const escape = String(nick).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existente = await PerfilMembro.findOne({ nick_principal: { $regex: `^${escape}$`, $options: 'i' }, userId: { $ne: userId } }).select('_id').lean();
        if (existente) {
          return { ok: false, campo: campo.id, mensagem: 'Esse nick principal já está em uso.' };
        }
      }
      continue;
    }

    if (campo.id !== 'data_nascimento_input') continue;

    const resultado = validarDataNascimento(dadosEtapa[campo.id]);
    if (!resultado.ok) {
      return { ok: false, campo: campo.id, mensagem: resultado.error };
    }
  }

  return { ok: true };
}

module.exports = {
  normalizarOpcaoPermitida,
  validarDataNascimento,
  sanitizeTextoLivre,
  calcularIdade,
  hasPermissaoAdmin,
  obterCampoFicha,
  obterCampoComErro,
  validarCamposEtapa
};
