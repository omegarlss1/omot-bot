const bracket = require('./bracket');
const admin = require('./admin');
const checkin = require('./checkin');
const classificacao = require('./classificacao');
const duracao = require('./duracao');
const finalizacao = require('./finalizacao');
const inscricao = require('./inscricao');
const notificacoes = require('./notificacoes');
const placar = require('./placar');

module.exports = {
  ...bracket,
  ...admin,
  ...checkin,
  ...classificacao,
  ...duracao,
  ...finalizacao,
  ...inscricao,
  ...notificacoes,
  ...placar
};
