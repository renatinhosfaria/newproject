# Design — vertical slice do CRM Pacaembu

**Data:** 2026-09-22  
**Status:** revisada para planejamento
**Escopo:** ciclo preparatório executável do CRM e fluxo advisory-first com Hermes simulado

## Objetivo

Transformar a documentação do projeto em um primeiro fluxo executável e testável. O ciclo deve permitir que um usuário autenticado consulte sua carteira, abra uma conversa, execute o Agent Atendimento simulado e receba um rascunho auditado, preservando o isolamento por workspace e corretor.

Este documento descreve um ciclo preparatório; ele não conclui o MVP definido em `docs/product-mvp.md`. O MVP completo só será considerado pronto depois da integração com um runtime Hermes real, pairing do WhatsApp, processamento de mensagens recebidas e outbox de mensagens enviadas.

O WhatsApp real, o bridge Baileys e o provisionamento de containers Hermes ficam fora deste ciclo. O adapter precisa ter a mesma fronteira que será usada na integração real, para que o mock possa ser substituído sem alterar o domínio do CRM.

## Resultado esperado

O ambiente local sobe com Docker Compose, executa migrations e disponibiliza:

1. login e logout por sessão em cookie;
2. um workspace seedado, uma membership de supervisor e uma membership de corretor;
3. criação, listagem e atualização de leads dentro do escopo autorizado;
4. criação e leitura de conversas e mensagens;
5. sessão do Agent Atendimento em modo `draft_only`;
6. streaming de eventos da execução por SSE com replay definido;
7. criação de rascunho sem envio automático;
8. auditoria de login, criação de sessão, chamada de ferramenta e criação de rascunho;
9. testes de autorização, isolamento, CSRF, idempotência e transições de mensagem do ciclo.

## Decisões canônicas deste ciclo

### Identidade e workspace

`workspace_memberships` é a única fonte do papel do usuário. `users` não possui `role`. Cada `auth_session` possui `membership_id` e `workspace_id`, com FK composta para uma membership ativa do mesmo workspace.

O login aceita `email`, `password` e um `workspace_id` opcional. Se houver uma única membership ativa, o workspace é selecionado automaticamente; se houver mais de uma e nenhuma for informada, a API retorna `409 WORKSPACE_CONTEXT_REQUIRED`. O ambiente local seeda um único workspace, mas a regra permanece testável com duas memberships.

O `broker_id` só existe no contexto de uma membership `broker` e é derivado do broker associado ao usuário. Memberships `supervisor` não recebem `broker_id`. Qualquer valor recebido do navegador é ignorado para autorização.

Esta decisão substitui, para o ciclo, qualquer definição anterior que coloque `role` em `users` ou trate `users` e `brokers` como uma relação global fora do workspace.

### Capacidades do Agent

As capacidades do MVP são somente:

- `crm.lead.read`;
- `crm.conversation.read`;
- `crm.message.draft`.

O catálogo de Agents e capacidades será persistido em configuração do workspace. A matriz de autorização e o runtime usarão exatamente esses nomes. Capacidades de campanhas, arquivos e envio de WhatsApp ficam fora do ciclo.

Para manter essa regra verificável, o ciclo terá as tabelas `agents`, `agent_capabilities` e `workspace_agents`, com seed apenas para o Agent Atendimento.

### Máquina de estados de mensagens

Estados ativos neste ciclo:

```text
received → processing → draft
                         └──→ failed
```

`pending_approval`, `approved`, `sending`, `sent` e `cancelled` ficam reservados ao ciclo de outbox e não entram nas migrations ou rotas deste ciclo. O Agent Atendimento só pode criar `draft`. O domínio valida as transições, e não apenas o controller.

### Eventos internos e SSE

O vertical slice persistirá `agent_runs` e `agent_events`. Cada evento terá `id`, `run_id`, `workspace_id`, `broker_id`, `sequence`, `type`, `payload`, `created_at` e `request_id`. A constraint `unique(run_id, sequence)` garante ordenação sem duplicidade.

O endpoint SSE envia `id: <run_id>:<sequence>`, `event`, `data` e heartbeat a cada 15 segundos, e aceita `Last-Event-ID` nesse mesmo formato. A reconexão reapresenta eventos posteriores à sequência informada. Se a sequência estiver fora da retenção de sete dias, responde `410 EVENT_REPLAY_UNAVAILABLE`. A API nunca envia eventos de outra sessão, workspace ou corretor.

O contrato interno do Hermes será preparado para HMAC por perfil, com timestamp e prevenção de replay, mas o adapter simulado não fará chamadas de rede neste ciclo. A implementação real deverá usar os headers `X-Hermes-Timestamp`, `X-Hermes-Event-Id` e `X-Hermes-Signature`.

### Idempotência

As operações `POST /api/conversations`, `POST /api/agent-sessions` e `POST /api/agent-sessions/{sessionId}/messages` recebem `Idempotency-Key`. A chave é única por `workspace_id`, `user_id`, operação e recurso, com hash do corpo e resposta armazenada por 24 horas.

Repetir a mesma chave com o mesmo hash reapresenta status e corpo da resposta original. Repetir a chave com outro hash retorna `409 IDEMPOTENCY_KEY_REUSED`. O registro é persistido em `idempotency_records`. A idempotência de mensagens recebidas de Hermes e da outbox será definida no ciclo de integração real.

### Proteção de sessão

Sessões usarão cookie `HttpOnly`, `Secure` em ambientes não locais, `SameSite=Lax`, rotação após login e invalidação explícita no logout. Todas as mutações originadas pelo navegador exigirão `Origin` permitido; se `Origin` estiver ausente, a API aceitará `Referer` somente quando corresponder exatamente à origem configurada; se ambos estiverem ausentes, responderá `403 CSRF_ORIGIN_REQUIRED`. A resposta de autenticação terá `Cache-Control: no-store`.

## Arquitetura do primeiro ciclo

```text
apps/web (Next.js)
        ↓ cookie de sessão / JSON / SSE
apps/api (NestJS + Fastify)
        ├── domínio e policies
        ├── PostgreSQL (Drizzle + SQL migrations)
        ├── Redis (preparado para jobs)
        └── HermesPort → MockHermesAdapter
packages/contracts (Zod e tipos compartilhados)
```

Não haverá `apps/orchestrator` neste ciclo. O Orchestrator real será uma implementação posterior de `HermesPort`. O domínio da API não conhecerá URL, API key, diretório de sessão ou protocolo Hermes.

O frontend terá apenas as telas necessárias para validar o fluxo: login, lista de leads, detalhe de conversa e sessão do Agent. O design system será aplicado aos estados de carregamento, erro, vazio, streaming e rascunho, sem construir o dashboard completo.

## Modelo mínimo de persistência

As migrations do ciclo criarão:

- `workspaces`;
- `users`;
- `workspace_memberships`;
- `auth_sessions`;
- `brokers`;
- `leads`;
- `conversations`;
- `messages`;
- `agent_sessions`;
- `agent_runs`;
- `agent_events`;
- `agents`;
- `agent_capabilities`;
- `workspace_agents`;
- `idempotency_records`;
- `audit_events`.

As tabelas de negócio terão `workspace_id` e, quando aplicável, `broker_id`. O ciclo usará FKs compostas explícitas: pais terão chaves únicas `(workspace_id, id)` e filhos referenciarão o par correspondente; leads e conversas também terão chaves únicas `(workspace_id, broker_id, id)` para proteger relações dentro do corretor. `auth_sessions` referenciará `(workspace_id, membership_id)`. `messages` e `agent_events` serão append-oriented; eventos de auditoria serão append-only.

As tabelas novas terão este contrato mínimo:

- `workspaces`: `id`, `name`, `timezone`, `status`, timestamps;
- `users`: `id`, `name`, `email`, `password_hash`, `status`, timestamps;
- `workspace_memberships`: `id`, `workspace_id`, `user_id`, `role`, `status`, timestamps, com unicidade `(workspace_id, user_id)`;
- `auth_sessions`: `id`, `user_id`, `workspace_id`, `membership_id`, `token_hash`, `expires_at`, `last_seen_at`, `revoked_at`, `created_at`;
- `brokers`: `id`, `workspace_id`, `user_id`, `display_name`, `status`, timestamps;
- `leads`: `id`, `workspace_id`, `broker_id`, dados de contato normalizados e timestamps;
- `conversations`: `id`, `workspace_id`, `broker_id`, `lead_id`, `status`, `last_message_at`, timestamps;
- `messages`: `id`, `workspace_id`, `broker_id`, `conversation_id`, `direction`, `author`, `status`, `content`, `metadata_json`, `occurred_at`, `created_at`;
- `agent_sessions`: `id`, `workspace_id`, `broker_id`, `user_id`, `agent_id`, `lead_id` opcional, `conversation_id` opcional, `title`, `status`, timestamps;
- `agent_runs`: `id`, `workspace_id`, `broker_id`, `agent_session_id`, `request_id`, `status`, `result_json` opcional, `error_code` opcional, timestamps;
- `agent_events`: `id`, `workspace_id`, `broker_id`, `agent_session_id`, `run_id`, `sequence`, `type`, `payload`, `request_id`, `created_at`;
- `agents`: `id`, `key`, `name`, `description`, `status`;
- `agent_capabilities`: `id`, `agent_id`, `key`, com unicidade `(agent_id, key)`;
- `workspace_agents`: `workspace_id`, `agent_id`, `enabled`, com unicidade `(workspace_id, agent_id)`;
- `idempotency_records`: `id`, `workspace_id`, `user_id`, `broker_id` opcional, `operation`, `resource_type`, `resource_id` opcional, `key`, `request_hash`, `response_status`, `response_body`, `expires_at`, `created_at`.

`idempotency_records` terá unicidade `(workspace_id, user_id, operation, key)` e índice de expiração. Todas as relações opcionais `lead_id` e `conversation_id` de `agent_sessions` deverão referenciar o mesmo workspace e broker. Apenas memberships `broker` podem criar `agent_sessions`; memberships `supervisor` não recebem `broker_id` e não podem abrir sessões de Agent neste ciclo.

`hermes_profiles` e `whatsapp_connections` não entram nas migrations deste ciclo. O perfil Hermes e a conexão WhatsApp serão representados pelo adapter simulado e por fixtures mínimas; credenciais e sessões reais não entram no banco local. Essas tabelas entram no ciclo de integração real.

## API mínima

Além das rotas já documentadas, o contrato deste ciclo incluirá:

- `POST /api/auth/login` com contexto de workspace (`workspace_id` opcional);
- `POST /api/auth/logout`;
- `GET /api/auth/me`;
- `GET/POST /api/leads`;
- `GET/PATCH /api/leads/{leadId}`;
- `GET/POST /api/conversations`, com `lead_id` obrigatório na criação, e `GET /api/conversations/{conversationId}`;
- `GET /api/conversations/{conversationId}/messages`;
- `GET /api/agents`;
- `POST /api/agent-sessions`;
- `GET /api/agent-sessions/{sessionId}`;
- `POST /api/agent-sessions/{sessionId}/messages`;
- `GET /api/agent-sessions/{sessionId}/events`;

O OpenAPI será atualizado na mesma mudança que implementar este ciclo e será a fonte canônica dos requests, responses, headers e códigos de erro. Ele incluirá `workspace_id` em `LoginRequest`, `409 WORKSPACE_CONTEXT_REQUIRED`, `409 IDEMPOTENCY_KEY_REUSED`, os endpoints de conversa e os schemas dos eventos SSE.

O endpoint de Agent retorna `AgentRun` com `queued`, `running`, `completed`, `failed` e `cancelled`. `result_json` seguirá o contrato estruturado do Agent com `type`, `content`, `citations`, `proposed_actions`, `requires_approval`, `status` e `request_id`. Neste ciclo, `type` será `draft` ou `error`, e `requires_approval` será `false`: o resultado é um rascunho não enviado, sem ação executável pendente.

Não haverá endpoints administrativos, pairing, aprovação, cancelamento de rascunho ou envio neste ciclo. O seed fornece o supervisor e o corretor; cadastro, suspensão e revogação entram no ciclo operacional posterior.

## Interface do MockHermesAdapter

O adapter será determinístico e não fará chamadas a modelo ou rede. A porta terá operações equivalentes a:

```text
startAgentRun(context, input) → { run_id, status }
streamAgentEvents(run_id, after_sequence) → eventos ordenados
stopAgentRun(run_id) → status
```

`context` será criado pelo servidor e conterá `request_id`, `workspace_id`, `user_id`, `broker_id`, `agent_id`, `agent_session_id`, referências opcionais de lead/conversa e as três capacidades canônicas. O mock emitirá `agent.run.started`, `agent.output.created` e `agent.run.completed`; uma fixture de falha emitirá `agent.run.failed`. Cada execução produzirá um `result_json` persistido em `agent_runs`.

## Segurança e falhas

- Policies reutilizáveis derivam workspace, usuário, papel e broker da sessão.
- Recurso fora do escopo responde `404` quando revelar existência for sensível.
- Conteúdo do lead é tratado como dado, nunca como instrução de autorização.
- Logs não incluirão senha, cookie, token, API key ou conteúdo integral desnecessário.
- Erros públicos terão `code`, `request_id` e `retryable`, sem stack trace.
- O mock Hermes poderá retornar indisponibilidade; a sessão do Agent permanecerá preservada e a execução será marcada como `failed`.

Os eventos de auditoria deste ciclo serão `auth.login.succeeded`, `auth.logout`, `lead.created`, `lead.updated`, `conversation.created`, `agent.session.created`, `agent.run.started`, `agent.tool.called`, `agent.output.created` e `agent.run.failed`. Cada mutação terá `request_id`; falhas de login não guardarão senha nem conteúdo de credencial.

## Testes de aceitação

O ciclo será considerado concluído quando estes cenários passarem:

1. login inválido retorna erro genérico e login válido cria sessão vinculada à membership;
2. logout invalida a sessão e uma membership suspensa não pode criar nova sessão;
3. corretor não lê nem altera lead, conversa ou sessão de outro corretor;
4. membership de outro workspace não pode ser usada sem contexto explícito;
5. `broker_id` enviado no body não muda o escopo efetivo;
6. Agent Atendimento lê apenas lead/conversa autorizados;
7. chamada de ferramenta fora das três capacidades é rejeitada e auditada;
8. requisições mutáveis sem `Origin`/`Referer` válido são rejeitadas;
9. reconexão SSE retoma eventos pelo ID composto sem duplicação;
10. execução duplicada por `Idempotency-Key` reapresenta a resposta original;
11. a mesma chave com payload diferente retorna conflito;
12. transições inválidas de mensagem são rejeitadas;
13. FKs compostas impedem misturar recursos de workspaces ou brokers;
14. migrations e seeds sobem em PostgreSQL vazio;
15. o fluxo completo funciona com o MockHermesAdapter, inclusive falha determinística.

Os testes deste ciclo cobrirão unitários de policies, estados, contexto e idempotência; integração das migrations, FKs compostas e sessões; contrato OpenAPI/SSE; e E2E do login, leads, conversa, Agent, reconexão SSE e erro CSRF. Pairing, eventos reais Hermes, outbox, aprovação, backup/restore e carga de 20 corretores pertencem à estratégia do ciclo posterior.

## Fora do escopo

- WhatsApp real, QR Code e Baileys;
- provisionamento de containers Hermes;
- envio de mensagens, aprovação e worker de outbox;
- cadastro, suspensão e revogação administrativa de brokers;
- uploads, MinIO e arquivos;
- dashboards avançados e Agents além de Atendimento;
- MFA, recuperação de senha e integração com IdP;
- carga de 20 corretores.

## Critério de substituição do mock

O mock será substituível por uma implementação real por meio da interface `HermesPort`, sem alterar controllers, policies, schemas públicos ou tabelas de CRM. O próximo design deverá definir o endpoint interno, HMAC, health checks, reconexão, provisionamento e outbox real.
