const PainelPrincipal = require('../../db/models/painelPrincipal');

async function obterMensagemFuncionalidade(interaction) {
  const guildId = interaction.guildId || interaction.guild?.id;
  const canal = interaction.channel;
  let dados = guildId ? await PainelPrincipal.findOne({ guildId }).catch(() => null) : null;
  let mensagem = null;

  if (dados?.funcMessageId) {
    mensagem = await canal.messages.fetch(dados.funcMessageId).catch(() => null);
  }

  if (!mensagem) {
    mensagem = await canal.send({
      content: '👇 Selecione uma opção no painel acima',
      embeds: [],
      components: []
    });
    if (guildId) {
      dados = await PainelPrincipal.findOneAndUpdate(
        { guildId },
        {
          guildId,
          canalId: canal.id,
          hubMessageId: interaction.message.id,
          hubChannelId: canal.id,
          funcMessageId: mensagem.id
        },
        { upsert: true, new: true }
      );
    }
  }

  return mensagem;
}

module.exports = { obterMensagemFuncionalidade };
