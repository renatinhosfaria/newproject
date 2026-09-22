# Modelo de dados inicial

> **Ciclo preparatório:** este documento distingue o schema executado agora do
> roadmap. O ciclo usa workspace e memberships; Hermes/WhatsApp e outbox ficam
> para a integração posterior.

Este modelo representa o MVP e deve ser refinado durante a implementação. Todas as entidades que contêm dados de negócio precisam carregar o escopo do corretor diretamente ou por relacionamento validado no servidor.

## Entidades principais

### `users`

Usuários que podem acessar o CRM.

Campos principais:

```text
id
name
email
password_hash ou identity_provider_id
status: active | suspended | invited
created_at
updated_at
```

### `workspace_memberships` (ciclo atual)

```text
id
workspace_id
user_id
role: broker | supervisor
status: active | suspended | invited
created_at
updated_at
```

O papel nunca é lido de `users` nem aceito de inputs do navegador.

### `brokers`

Identidade operacional do corretor.

```text
id
user_id
display_name
registration_code
status: onboarding | active | suspended | offboarded
created_at
updated_at
```

### `hermes_profiles` (roadmap)

Relaciona um corretor ao runtime Hermes correspondente.

```text
id
broker_id
profile_name
runtime_name
runtime_url_internal
api_key_reference
agent_bundle_version
status: provisioning | pairing | connected | degraded | stopped
created_at
updated_at
```

As credenciais não devem ser armazenadas em texto puro nessa tabela. `api_key_reference` aponta para o mecanismo de segredos.

### `whatsapp_connections` (roadmap)

Estado da conexão do número do corretor.

```text
id
broker_id
hermes_profile_id
phone_number_masked
provider: baileys_bridge
status: pending | connected | disconnected | revoked
last_connected_at
last_disconnected_at
created_at
updated_at
```

### `leads`

Potenciais clientes da carteira do corretor.

```text
id
broker_id
name
phone
email
source
stage
assigned_at
created_at
updated_at
```

### `conversations`

Conversa entre um lead e o canal do corretor.

```text
id
broker_id
lead_id
whatsapp_connection_id
hermes_session_id
status: open | waiting | closed | archived
last_message_at
created_at
updated_at
```

### `messages`

Mensagens recebidas, geradas e enviadas.

```text
id
conversation_id
broker_id
external_message_id
direction: inbound | outbound
author: lead | broker | agent | system
status: received | processing | draft | failed
content
metadata_json
occurred_at
created_at
```

Deve existir uma restrição única para `external_message_id` quando o valor estiver presente.

### `agent_sessions`

Sessões da interface de agentes dentro do CRM.

```text
id
broker_id
agent_id
hermes_session_id
title
status: active | stopped | completed | failed
created_at
updated_at
```

### `outbox_messages` (roadmap)

Fila de mensagens que podem ser enviadas pelo WhatsApp.

```text
id
broker_id
conversation_id
message_id
idempotency_key
status: pending | approved | sending | sent | failed | cancelled
attempt_count
next_attempt_at
last_error_code
created_at
updated_at
```

### `audit_events` (ciclo atual)

Registro imutável das ações relevantes.

```text
id
actor_user_id
broker_id nullable
event_type
resource_type
resource_id
request_id
metadata_json
created_at
```

## Relacionamentos

```text
users 1──1 brokers
brokers 1──1 hermes_profiles
brokers 1──1 whatsapp_connections
brokers 1──N leads
leads 1──N conversations
conversations 1──N messages
conversations 1──N agent_sessions
messages 1──0..1 outbox_messages
```

## Regras de isolamento

- Toda consulta de corretor inclui `broker_id` derivado da sessão autenticada.
- Um `lead_id` só pode ser usado se pertencer ao `broker_id` ativo.
- Uma conversa só pode ser carregada se seu corretor for autorizado.
- O supervisor consulta dados agregados conforme sua permissão.
- O Hermes recebe identificadores de domínio, mas não acessa diretamente o banco.
