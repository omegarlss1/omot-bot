# 📋 CONTEXTO DO PROJETO E HANDOVER PARA AGENTES DE IA

> **Documento de passagem de bastão (Handover Context)**: Criado para contextualizar rapidamente qualquer novo agente ou desenvolvedor sobre o estado atual do projeto, objetivos atingidos, arquitetura e convenções técnicas.

---

## 📌 1. Visão Geral do Projeto
* **Nome do Projeto:** Ômot (Bot Oficial da Comunidade Ômega RLSS)
* **Repositório:** `omegarlss1/omot-bot`
* **Ambiente de Hospedagem:** Render (Plano Web Service / Node.js) mantido acordado via UptimeRobot pingando `GET /health` e `GET /`.
* **Stack Tecnológica:**
  * **Runtime:** Node.js (v24 LTS / CommonJS `require`)
  * **Framework do Bot:** Discord.js v14
  * **Banco de Dados:** MongoDB via Mongoose (armazenamento persistente de perfis, calls, gatilhos e painéis)
  * **Servidor HTTP:** Express (porta `process.env.PORT` com healthcheck para Render)
  * **Test Runner:** Node.js Native Test Runner (`node:test` e `node:assert/strict`)

---

## 🎯 2. Histórico das Últimas Atualizações Realizadas

### Sessão Atual: Experiência do Usuário (UX), Perfil, Títulos e Avaliação
1. **Correção e Contador na Avaliação:**
   * Corrigido bug em `iniciarAvaliacao` onde o título e ícone da categoria não apareciam na abertura inicial (estava passando `embeds: []`).
   * Adicionado **contador dinâmico em tempo real** de indicadores marcados na categoria (ex: `📊 Indicadores selecionados nesta categoria: 6/10`), refletido tanto na descrição do embed quanto no placeholder do select menu.
2. **Redesign do Perfil do Membro:**
   * **Nick Principal em destaque supremo** no cabeçalho e descrição.
   * Todos os dados preenchidos na ficha agrupados no topo (Nick principal, nicks secundários, bio, redes sociais TikTok/Instagram e origem/idade).
   * **Horário removido** do perfil conforme solicitado.
   * Ranks acompanhados de texto instrutivo explicando que representam a média habitual do jogador ao longo das seasons e são usados para o **balanceamento justo de times em campeonatos internos**.
   * Seção de estatísticas (gols, assists, saves, chutes, mvps, pontos) e títulos com aviso explícito de que correspondem a dados oficiais computados em **campeonatos e torneios internos da Ômega**.
   * A frase *"Baseado em 75 indicadores avaliados"* posicionada diretamente junto às 8 categorias oficiais.
3. **Sistema de Cadastro de Títulos por Staff:**
   * Novo botão no painel admin do perfil: `+ Título` (`btn_admin_add_titulo_[targetId]`).
   * Modal com: Colocação/Posição (ex: 1º Lugar, Campeão, Vice-campeão, MVP), Nome do Campeonato (ex: Torneio Interno 2v2), Edição/Ano (ex: S4, 2024), e Modo/Detalhes.
   * Suporte a ícones automáticos com base na colocação (🥇 para 1º/campeão, 🥈 para vice/2º, 🥉 para 3º, 🏅 para mvp, 🏆 default).
   * Suporte tanto para títulos de catálogo (`titulos.json`) quanto para títulos personalizados registrados dinamicamente no MongoDB.
4. **Painel Admin sem Sair do Perfil:**
   * Ao adicionar gols, saves, assistências ou títulos via modal, o bot atualiza o banco e **re-renderiza o perfil na hora com os novos valores**, mantendo os botões de administração e um botão claro de "Concluir / Voltar". O admin nunca mais é expulso do perfil ao editar stats.
5. **Busca Global de Membros em Servidores Grandes:**
   * Substituição do menu limitado a 25 membros pelo **`UserSelectMenuBuilder` nativo do Discord**, com barra de busca integrada e autocomplete para qualquer membro do servidor.
   * Adição do botão **"🔍 Buscar por Nick / Nome"** com busca regex flexível no MongoDB por `nick_principal`, `nomeComum` ou `nicks_secundarios`.
6. **Navegação Livre da Ficha por Etapas Nomeadas:**
   * Substituição do botão único de avanço por botões nomeados pelos campos de cada etapa:
     * `1. Nome / Nasc / Estado`
     * `2. País / Bio / CLA / Nick`
     * `3. CLAs / Modo / Controle`
     * `4. TikTok / Instagram`
     * `📋 Nicks Secundários`
     * `💾 Finalizar e Salvar Perfil`
7. **Suíte de Testes Automatizados:**
   * 31 testes unitários nativos rodando via `npm test` em ~500ms com 100% de sucesso.

---

## 🏗️ 3. Arquitetura e Onde Fica Cada Recurso

```
omot-bot/
├── deploy-commands.js             # Script de registro de comandos Slash na guilda
├── index.js                      # Entrada raiz (require('./src'))
├── package.json                  # Dependências e scripts ("start", "dev", "test")
├── tests/
│   └── perfil.test.js            # 31 testes unitários nativos (npm test)
└── src/
    ├── index.js                  # Inicialização do banco, servidor HTTP e login do bot
    ├── bot/
    │   ├── client.js             # Factory do Client Discord, stores e inits
    │   ├── loaders.js            # Carregador dinâmico de comandos e eventos
    │   ├── commands/             # /call, /setup-boasvindas, /setup-painel-principal
    │   └── events/               # interactionCreate, voiceStateUpdate, ready, messageCreate
    ├── config/                   # Variáveis de ambiente, roles e configurações
    ├── data/                     # 75 indicadores, catálogo de títulos e mapa de categorias
    ├── db/                       # Conexão MongoDB e modelos Mongoose
    ├── features/
    │   ├── hub/                  # Hub com mensagem dinâmica reutilizável
    │   ├── perfil/               # Ficha de membro, multi-step modals e stats admin
    │   │   ├── constants.js      # Ranks, opções permitidas e etapas da ficha
    │   │   ├── validation.js     # Datas, idades, permissões de staff
    │   │   ├── embeds.js         # Cards visuais, barras ASCII e formatações
    │   │   ├── modals.js         # Modais, action rows e botões de navegação
    │   │   └── interactions.js   # Orquestração de eventos e rotas do Hub
    │   ├── calls/                # Calls temporárias com locks e auto-destruição
    │   ├── lfg/                  # Chamadas para times com mutex e auto-limpeza
    │   ├── avaliacao/            # Avaliação de 75 indicadores competitivos
    │   └── games/                # Sincronização e catálogo de jogos por guilda
    ├── http/
    │   └── server.js             # Servidor Express com / e /health (Render Uptime)
    └── interactions/
        └── registry.js           # Roteador central de botões, selects e modais
```

---

## ⚙️ 4. Padrões Técnicos Críticos Que Devem Ser Mantidos

1. **Locks e Concorrência:**
   * Nunca manipule canais de voz temporários ou vagas de LFG sem adquirir o lock respectivo (`adquirirLockCall` em calls ou `comBloqueioDaChamada` em LFG).
2. **Mensagem Funcionalidade do Hub:**
   * O Hub utiliza apenas **duas mensagens** no canal: a primeira é fixa e a segunda é editada dinamicamente via `obterMensagemFuncionalidade`. Nunca envie mensagens novas no canal para ações do hub; edite a mensagem dinâmica.
3. **Respostas Efêmeras e Flags:**
   * Use `flags: 64` (ou `deferReply({ flags: 64 })` / `deferUpdate()`) para respostas privadas ou quando a mensagem dinâmica for editada.
4. **Despacho de Interações:**
   * Todo novo botão, modal ou select deve ser registrado no método `register(registry)` da sua feature correspondente em `src/features/`.
5. **Testes Unitários:**
   * Execute sempre `npm test` antes de commitar qualquer alteração em regras de negócio.
