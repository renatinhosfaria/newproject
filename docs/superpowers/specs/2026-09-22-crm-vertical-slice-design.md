# Design — vertical slice do CRM Pacaembu

**Data:** 2026-09-22  
**Status:** proposta para revisão  
**Escopo:** fundação executável do CRM e fluxo advisory-first com Hermes simulado

## Objetivo

Transformar a documentação do projeto em um primeiro fluxo executável e testável. O ciclo deve permitir que um usuário autenticado consulte sua carteira, abra uma conversa, execute o Agent Atendimento simulado e receba um rascunho auditado, preservando o isolamento por workspace e corretor.

O WhatsApp real, o bridge Baileys e o provisionamento de containers Hermes ficam fora deste ciclo. O adapter precisa ter a mesma fronteira que será usada na integração real, para que o mock possa ser substituído sem alterar o domínio do CRM.

## Resultado esperado

O ambiente local sobe com Docker Compose, executa migrations e disponibiliza:

1. login e logout por sessão em cookie;
2. workspace, membership, supervisor e corretor de desenvolvimento;
3. criação, listagem e atualização de leads dentro do escopo autorizado;
4. criação e leitura de conversas e mensagens;
5. sessão do Agent Atendimento em modo `draft_only`;
6. streaming de eventos da execução por SSE com replay básico;
7. criação de rascunho sem envio automático;
8. auditoria de login, criação de sessão, chamada de ferramenta e criação de rascunho;
9. testes de autorização, isolamento, idempotência e transições de mensagem.

## Decisões canônicas deste ciclo

### Identidade e workspace

`workspace_memberships` é a única fonte do papel do usuário. `users` não possui `role`. Cada `auth_session` fica vinculada a um `workspace_id` e a uma membership ativa.

O login aceita `email`, `password` e um `workspace_id` opcional. Se houver uma única membership ativa, o workspace é selecionado automaticamente; se houver mais de uma e nenhuma for informada, a API retorna erro de contexto obrigatório. O MVP começa com um workspace, mas o contrato não depende dessa limitação.

O `broker_id` é derivado da membership e do broker associado ao usuário. Qualquer valor recebido do navegador é ignorado para autorização.

### Capacidades do Agent

As capacidades do MVP são somente:

- `crm.lead.read`;
- `crm.conversation.read`;
- `crm.message.draft`.

O catálogo de Agents e capacidades será persistido em configuração do workspace. A matriz de autorização e o runtime usarão exatamente esses nomes. Capacidades de campanhas, arquivos e envio de WhatsApp ficam fora do ciclo.

Para manter essa regra verificável, o ciclo terá as tabelas `agents`, `agent_capabilities` e `workspace_agents`, com seed apenas para o Agent Atendimento.

### Máquina de estados de mensagens

Estados canônicos:

```text
received → processing → draft → pending_approval → approved → sending → sent
                         └──────→ failed
pending_approval ───────→ cancelled
approved ────────────────→ cancelled
sending ─────────────────→ failed
```

O Agent Atendimento só pode criar `draft`. Não haverá aprovação nem envio real neste ciclo. Workers futuros deverão validar as transições no domínio, e não apenas no controller.

### Eventos internos e SSE

O vertical slice persistirá `agent_runs` e `agent_events`. Cada evento terá `id`, `run_id`, `workspace_id`, `broker_id`, `sequence`, `type`, `payload`, `created_at` e `request_id`.

O endpoint SSE envia `id: <sequence>` e aceita `Last-Event-ID`. A reconexão reapresenta eventos posteriores à sequência informada. A API nunca envia eventos de outra sessão, workspace ou corretor.

O contrato interno do Hermes será preparado para HMAC por perfil, com timestamp e prevenção de replay, mas o adapter simulado não fará chamadas de rede neste ciclo. A implementação real deverá usar os headers `X-Hermes-Timestamp`, `X-Hermes-Event-Id` e `X-Hermes-Signature`.

### Idempotência

Operações com efeito externo ou assíncrono recebem `Idempotency-Key`. A chave é única por `workspace_id`, `broker_id`, operação e recurso, com hash do corpo e resposta armazenada para repetição segura.

Uma mensagem pode possuir no máximo uma `outbox_message`. Repetir a aprovação retorna a mesma outbox; uma chave diferente não cria uma segunda tentativa. O envio real e o lease do worker serão implementados no ciclo Hermes, mas a constraint será criada agora.

Mensagens recebidas usarão unicidade por `workspace_id`, `hermes_profile_id`, provedor e `external_message_id` quando o identificador existir.

### Proteção de sessão

Sessões usarão cookie `HttpOnly`, `Secure` em ambientes não locais, `SameSite=Lax`, rotação após login e invalidação explícita no logout. Todas as mutações exigirão validação de `Origin`/`Referer` contra a origem configurada. A resposta de autenticação terá `Cache-Control: no-store`.

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

O Orchestrator real será uma implementação posterior de `HermesPort`. O domínio da API não conhecerá URL, API key, diretório de sessão ou protocolo Hermes.

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
- `outbox_messages`;
- `audit_events`.

As tabelas de negócio terão `workspace_id` e, quando aplicável, `broker_id`. FKs compostas ou constraints equivalentes impedirão combinações de recursos de workspaces diferentes. `messages` e `agent_events` serão append-oriented; eventos de auditoria serão append-only.

O perfil Hermes e a conexão WhatsApp serão representados por um adapter simulado e por fixtures mínimas; credenciais e sessões reais não entram no banco local.

## API mínima

Além das rotas já documentadas, o contrato deste ciclo incluirá:

- `POST /api/auth/login` com contexto de workspace;
- `POST /api/auth/logout`;
- `GET /api/auth/me`;
- `GET/POST /api/leads`;
- `GET/PATCH /api/leads/{leadId}`;
- `GET/POST /api/conversations` e `GET /api/conversations/{conversationId}`;
- `GET /api/conversations/{conversationId}/messages`;
- `GET /api/agents`;
- `POST /api/agent-sessions`;
- `GET /api/agent-sessions/{sessionId}`;
- `POST /api/agent-sessions/{sessionId}/messages`;
- `GET /api/agent-sessions/{sessionId}/events`;
- `GET /api/admin/brokers`;
- `POST /api/admin/brokers`;
- `PATCH /api/admin/brokers/{brokerId}/status`.

O endpoint de rascunho retorna mensagem estruturada e `requires_approval: true` apenas como metadado de produto; não haverá endpoint de aprovação funcional até o ciclo que implementar outbox e envio.

## Segurança e falhas

- Policies reutilizáveis derivam workspace, usuário, papel e broker da sessão.
- Recurso fora do escopo responde `404` quando revelar existência for sensível.
- Conteúdo do lead é tratado como dado, nunca como instrução de autorização.
- Logs não incluirão senha, cookie, token, API key ou conteúdo integral desnecessário.
- Erros públicos terão `code`, `request_id` e `retryable`, sem stack trace.
- O mock Hermes poderá retornar indisponibilidade; a sessão do Agent permanecerá preservada e a execução será marcada como `failed`.

## Testes de aceitação

O ciclo será considerado concluído quando estes cenários passarem:

1. login inválido retorna erro genérico e login válido cria sessão;
2. logout e suspensão invalidam a sessão;
3. corretor não lê nem altera lead, conversa ou sessão de outro corretor;
4. membership de outro workspace não pode ser usada sem contexto explícito;
5. `broker_id` enviado no body não muda o escopo efetivo;
6. Agent Atendimento lê apenas lead/conversa autorizados;
7. chamada de ferramenta fora das três capacidades é rejeitada e auditada;
8. reconexão SSE retoma eventos sem duplicação;
9. execução duplicada por `Idempotency-Key` não cria duas sessões ou mensagens;
10. transições inválidas de mensagem são rejeitadas;
11. migrations sobem em PostgreSQL vazio;
12. o fluxo completo funciona com o MockHermesAdapter.

## Fora do escopo

- WhatsApp real, QR Code e Baileys;
- provisionamento de containers Hermes;
- envio de mensagens e worker de outbox;
- uploads, MinIO e arquivos;
- dashboards avançados e Agents além de Atendimento;
- MFA, recuperação de senha e integração com IdP;
- carga de 20 corretores.

## Critério de substituição do mock

O mock será substituível por uma implementação real por meio da interface `HermesPort`, sem alterar controllers, policies, schemas públicos ou tabelas de CRM. O próximo design deverá definir o endpoint interno, HMAC, health checks, reconexão, provisionamento e outbox real.
