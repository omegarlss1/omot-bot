      if (acao === 'setgame') {
        const modal = new ModalBuilder().setCustomId(`modal-setgame_${callId}`).setTitle('Qual jogo você vai jogar?');
        const input = new TextInputBuilder().setCustomId('gameNome').setLabel('Nome do jogo').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Valorant, Fortnite, Minecraft').setMaxLength(30);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }