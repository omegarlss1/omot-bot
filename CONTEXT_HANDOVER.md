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

## 🎯 2. Última Atualização Realizada (Objetivo e Alterações)

### Objetivo
Eliminar dívidas técnicas estruturais, remover código morto/legado que gerava confusão de manutenção, desmembrar o arquivo monolítico de perfil (1.374 linhas), corrigir fragilidades na detecção de permissões de moderação e instituir uma suíte de testes unitários automatizados.

### O Que Foi Modificado:
1. **Limpeza de Código Morto:**
   * Arquivo legado `events/interactionCreate.js` (raiz) excluído. O bot utiliza exclusivamente [src/bot/events/interactionCreate.js](file:///c:/Users/flavi/OneDrive/Documentos/%C3%94mega/GitHub/omot-bot/src/bot/events/interactionCreate.js).
2. **Modularização de `src/features/perfil/`:**
   * O arquivo `src/features/perfil/interactions.js` foi reduzido de **1.374 para 442 linhas**, desacoplando responsabilidades:
     * `constants.js`: Metadados das etapas do formulário, opções de ranks, inputs permitidos e regex de nicks.
     * `validation.js`: Funções puras de validação de datas (`DD/MM/AAAA`), sanitização de menções, cálculo de idade e permissão de staff.
     * `embeds.js`: Construtores visuais de perfil, barras ASCII, links sociais e visualizador de nicks secundários.
     * `modals.js`: Builders de modais Discord, menus suspensos, botões de paginação e botões de admin.
     * `interactions.js`: Foco estrito na orquestração de eventos, estado em memória e integração com o Hub. Reexporta 100% da interface anterior para não quebrar dependências externas.
3. **Reforço na Checagem de Permissões de Staff (`hasPermissaoAdmin`):**
   * Agora valida permissões nativas do Discord (`Administrator`, `ManageGuild`, `ModerateMembers`) e inclui regex aprimorada para cargos (`moderação`, `moderador`, `staff`, `admin`, `diretoria`, `coordenação`).
4. **Suíte de Testes Automatizados:**
   * Criado `tests/perfil.test.js` com **28 testes unitários** rodando via `npm test`.
   * Cobre: validação de datas (inclusive anos bissextos), cálculo de idades, remoção de menções indesejadas, cálculo ponderado de categorias, sanitização e formatação de nomes de calls.

---

## 🏗️ 3. Arquitetura e Onde Fica Cada Recurso

```
omot-bot/
├── deploy-commands.js             # Script de registro de comandos Slash na guilda
├── index.js                      # Entrada raiz (require('./src'))
├── package.json                  # Dependências e scripts ("start", "dev", "test")
├── tests/
│   └── perfil.test.js            # 28 testes unitários nativos (npm test)
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
   * Nunca manipule canais de voz temporários ou vagas de LFG sem adquirir o lock respectivo (`adquirirLockCall` em calls ou `comBloqueioDaChamada` em LFG), pois múltiplos usuários clicam ao mesmo tempo.
2. **Mensagem Funcionalidade do Hub:**
   * O Hub utiliza apenas **duas mensagens** no canal: a primeira é fixa e a segunda é editada dinamicamente via `obterMensagemFuncionalidade`. Nunca envie mensagens novas no canal para ações do hub; edite a mensagem dinâmica.
3. **Respostas Efêmeras e Flags:**
   * Use `flags: 64` (ou `deferReply({ flags: 64 })` / `deferUpdate()`) para respostas privadas ou quando a mensagem dinâmica for editada.
4. **Despacho de Interações:**
   * Todo novo botão, modal ou select deve ser registrado no método `register(registry)` da sua feature correspondente em `src/features/`.

---

## 🚀 5. Comandos Úteis
* **Rodar os testes unitários:** `npm test`
* **Iniciar o bot em desenvolvimento:** `npm start`
* **Verificar sintaxe de todos os arquivos:** `node -c src/**/*.js`
