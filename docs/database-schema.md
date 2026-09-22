# Especificação do schema do banco

> **Ciclo preparatório atual:** as migrations desta entrega cobrirão workspace,
> memberships, sessão, leads, conversas, mensagens, Agent sessions/runs/events,
> catálogo de capacidades, idempotência e auditoria. Hermes profiles,
> WhatsApp e outbox são roadmap.

Este documento transforma o modelo conceitual em um contrato para migrations. A implementação deve usar PostgreSQL e `timestamptz` em UTC. A migration é a fonte de verdade do schema; este documento explica as invariantes que a migration deve preservar.

## Identificadores e convenções

- usar UUID v4 ou UUID gerado pelo banco para entidades públicas;
- nomes de tabelas e colunas em `snake_case`;
- todas as tabelas de negócio possuem `created_at` e `updated_at`;
- não expor IDs internos de runtime Hermes ao navegador;
- armazenar telefones em formato normalizado e exibir uma versão mascarada quando necessário;
- valores monetários futuros devem usar `numeric`, nunca `float`;
- datas de negócio devem ser armazenadas em UTC e convertidas para o timezone do workspace na apresentação.

## Escopo organizacional

O banco deve possuir uma fronteira explícita de workspace, mesmo que o MVP comece com uma única equipe.

### `workspaces`

| Campo        | Tipo         | Regra                       |
| ------------ | ------------ | --------------------------- |
| `id`         | uuid         | PK                          |
| `name`       | varchar(160) | obrigatório                 |
| `timezone`   | varchar(64)  | default `America/Sao_Paulo` |
| `status`     | enum         | `active` ou `suspended`     |
| `created_at` | timestamptz  | obrigatório                 |
| `updated_at` | timestamptz  | obrigatório                 |

### `users`

| Campo           | Tipo         | Regra                              |
| --------------- | ------------ | ---------------------------------- |
| `id`            | uuid         | PK                                 |
| `name`          | varchar(160) | obrigatório                        |
| `email`         | citext       | único global, normalizado          |
| `password_hash` | text         | Argon2id; nunca retornar           |
| `status`        | enum         | `invited`, `active` ou `suspended` |
| `created_at`    | timestamptz  | obrigatório                        |
| `updated_at`    | timestamptz  | obrigatório                        |

### `workspace_memberships`

| Campo          | Tipo        | Regra                              |
| -------------- | ----------- | ---------------------------------- |
| `id`           | uuid        | PK                                 |
| `workspace_id` | uuid        | FK para `workspaces`               |
| `user_id`      | uuid        | FK para `users`                    |
| `role`         | enum        | `broker` ou `supervisor`           |
| `status`       | enum        | `invited`, `active` ou `suspended` |
| `created_at`   | timestamptz | obrigatório                        |
| `updated_at`   | timestamptz | obrigatório                        |

Restrições: `unique(workspace_id, user_id)` e no máximo uma membership ativa de cada papel operacional por regra de negócio.

### `brokers`

| Campo               | Tipo         | Regra                                               |
| ------------------- | ------------ | --------------------------------------------------- |
| `id`                | uuid         | PK                                                  |
| `workspace_id`      | uuid         | FK obrigatório                                      |
| `user_id`           | uuid         | FK único por workspace                              |
| `display_name`      | varchar(160) | obrigatório                                         |
| `registration_code` | varchar(80)  | opcional; único quando presente no workspace        |
| `status`            | enum         | `onboarding`, `active`, `suspended` ou `offboarded` |
| `created_at`        | timestamptz  | obrigatório                                         |
| `updated_at`        | timestamptz  | obrigatório                                         |

## Autenticação

### `auth_sessions`

| Campo          | Tipo        | Regra                           |
| -------------- | ----------- | ------------------------------- |
| `id`           | uuid        | PK; valor opaco no cookie       |
| `user_id`      | uuid        | FK                              |
| `workspace_id` | uuid        | FK                              |
| `token_hash`   | text        | único; nunca guardar token puro |
| `expires_at`   | timestamptz | obrigatório                     |
| `last_seen_at` | timestamptz | obrigatório                     |
| `revoked_at`   | timestamptz | nullable                        |
| `created_at`   | timestamptz | obrigatório                     |

Índices: `user_id`, `workspace_id`, `expires_at` e `token_hash`. Sessões expiradas devem ser removidas por job seguro.

## Integração Hermes e WhatsApp (roadmap)

### `hermes_profiles`

Campos: `id`, `workspace_id`, `broker_id`, `profile_name`, `runtime_name`, `runtime_url_reference`, `secret_reference`, `agent_bundle_version`, `status`, `created_at`, `updated_at`.

Restrições: `unique(workspace_id, broker_id)`; URLs internas e referências de segredo nunca saem da API pública.

### `whatsapp_connections`

Campos: `id`, `workspace_id`, `broker_id`, `hermes_profile_id`, `phone_number_masked`, `provider`, `status`, `last_connected_at`, `last_disconnected_at`, `created_at`, `updated_at`.

Restrições: uma conexão ativa por perfil; o número completo não deve ser usado como chave pública.

## CRM

### `leads`

Campos: `id`, `workspace_id`, `broker_id`, `name`, `phone_normalized`, `phone_masked`, `email`, `source`, `stage`, `interest`, `next_action`, `assigned_at`, `created_at`, `updated_at`.

Regras:

- `broker_id` deve pertencer ao `workspace_id`;
- `stage` usa enum controlado: `novo`, `contato`, `visita`, `proposta`, `aprovado`, `perdido`;
- buscas por telefone devem usar valor normalizado e respeitar o workspace;
- alterações de etapa devem gerar `audit_event`.

### `conversations`

Campos: `id`, `workspace_id`, `broker_id`, `lead_id`, `whatsapp_connection_id`, `hermes_session_id`, `status`, `last_message_at`, `created_at`, `updated_at`.

Restrições: todas as FKs devem pertencer ao mesmo workspace e broker. Estados: `open`, `waiting`, `closed`, `archived`.

### `messages`

Campos: `id`, `workspace_id`, `broker_id`, `conversation_id`, `external_message_id`, `direction`, `author`, `status`, `content`, `metadata_json`, `occurred_at`, `created_at`.

Restrições:

- `unique(broker_id, external_message_id)` quando o ID externo estiver presente;
- conteúdo nunca deve conter API keys, tokens ou credenciais;
- mensagens recebidas devem ser persistidas antes de iniciar processamento repetível;
- alterações de estado devem ser monotônicas, salvo uma transição explícita de cancelamento.

### `agent_sessions` (ciclo atual)

Campos: `id`, `workspace_id`, `broker_id`, `user_id`, `agent_id`, `lead_id`, `conversation_id`, `title`, `status`, `created_at`, `updated_at`.

Restrições: o usuário, lead e conversa precisam estar no escopo do broker.

### `agent_runs` (ciclo atual)

Campos: `run_id`, `session_id`, `status`, `input_content`, `result_json`, `error_code`, `created_at`, `updated_at`.

Estados: `queued`, `running`, `completed`, `failed`, `cancelled`.

Cada execução pertence a uma sessão autorizada. `result_json` pode ser nulo
enquanto a execução estiver pendente; uma falha de execução sem mensagem de
domínio não cria uma transição de `messages`.

### `agent_events` (ciclo atual)

Campos: `id`, `workspace_id`, `broker_id`, `request_id`, `run_id`,
`session_id`, `sequence`, `type`, `payload`, `occurred_at`.

Restrições: `unique(run_id, sequence)`; `sequence >= 1`; replay deve respeitar
o workspace, broker e sessão autenticada. O DTO SSE usa `data` como alias
público de `payload`.

### `outbox_messages` (roadmap)

Campos: `id`, `workspace_id`, `broker_id`, `conversation_id`, `message_id`, `idempotency_key`, `status`, `attempt_count`, `next_attempt_at`, `last_error_code`, `created_at`, `updated_at`.

Restrições: `unique(broker_id, idempotency_key)`; apenas um worker pode possuir uma mensagem em estado `sending` usando lock transacional.

### `audit_events`

Campos: `id`, `workspace_id`, `actor_user_id`, `broker_id`, `event_type`, `resource_type`, `resource_id`, `request_id`, `metadata_json`, `created_at`.

O registro é append-only. A API não deve permitir edição ou exclusão de eventos de auditoria.

## Tabelas posteriores ao MVP

As tabelas abaixo não bloqueiam o primeiro vertical slice e devem entrar quando o módulo correspondente for iniciado:

- `agents` e `agent_capabilities`;
- `files` e `file_access_grants`;
- `properties`, `units` e `commercial_conditions`;
- `campaigns`, `ad_sets` e `ad_metrics`;
- `notifications`;
- `lead_stage_history`.

## Índices mínimos

- todos os FKs;
- `(workspace_id, status)` em usuários, brokers, perfis e conexões
  (perfis e conexões são roadmap);
- `(broker_id, updated_at desc)` em leads, conversas e sessões;
- `(conversation_id, occurred_at)` em mensagens;
- `(session_id, created_at desc)` em Agent runs;
- `(run_id, sequence)` em Agent events;
- `(broker_id, status, next_attempt_at)` em outbox;
- `(workspace_id, created_at desc)` em auditoria;
- índices parciais para valores únicos que aceitem `NULL`.

## Migrations e transações

1. criar `workspaces`, `users`, memberships e sessões;
2. criar brokers;
3. criar leads, conversas e mensagens;
4. criar Agent sessions, runs e events;
5. criar auditoria; outbox só entra no ciclo de integração;
6. adicionar índices e constraints depois das tabelas-base;
7. cada migration deve ser reversível quando a operação for segura;
8. seeds de desenvolvimento nunca podem conter credenciais reais;
9. alterações de mensagem e criação de outbox devem ocorrer na mesma transação quando uma aprovação gerar envio.
