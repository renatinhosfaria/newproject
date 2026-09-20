# Contrato de integração CRM–Hermes

Este documento define a fronteira entre o CRM e os runtimes Hermes. Os nomes de endpoints são uma proposta inicial e devem ser refinados durante o protótipo.

## Identidade de roteamento

O CRM mantém o relacionamento:

```json
{
  "broker_id": "broker_001",
  "hermes_profile_id": "corretor_001",
  "gateway_name": "hermes-broker-001",
  "gateway_url": "http://hermes-broker-001:PORT",
  "status": "connected"
}
```

O `gateway_url` e a API key são dados internos do Orchestrator. Nunca devem ser enviados ao navegador.

## Contexto de sessão

Toda solicitação ao Hermes deve receber contexto resolvido pelo servidor:

```json
{
  "broker_id": "broker_001",
  "user_id": "user_001",
  "role": "broker",
  "lead_id": "lead_918",
  "conversation_id": "conv_3301",
  "agent_id": "atendimento",
  "permissions": [
    "crm.lead.read",
    "crm.conversation.read",
    "crm.conversation.draft"
  ]
}
```

O agente não pode substituir o `broker_id` recebido do servidor.

## Endpoints do CRM

### Perfil Hermes

```http
GET /api/me/hermes
POST /api/me/hermes/pairing/start
POST /api/me/hermes/pairing/complete
POST /api/me/hermes/restart
GET /api/me/hermes/status
```

### Agentes

```http
GET /api/agents
POST /api/agent-sessions
GET /api/agent-sessions/:session_id
POST /api/agent-sessions/:session_id/messages
GET /api/agent-sessions/:session_id/events
POST /api/agent-sessions/:session_id/stop
```

### Conversas

```http
GET /api/conversations
GET /api/conversations/:conversation_id
GET /api/conversations/:conversation_id/messages
POST /api/conversations/:conversation_id/drafts/:message_id/approve
POST /api/conversations/:conversation_id/drafts/:message_id/cancel
```

## Eventos internos

Eventos devem possuir `event_id` único e ser processados de forma idempotente.

```json
{
  "event_id": "evt_001",
  "type": "whatsapp.message.received",
  "broker_id": "broker_001",
  "hermes_profile_id": "corretor_001",
  "conversation_id": "conv_3301",
  "external_message_id": "wa_abc123",
  "occurred_at": "2026-09-20T12:00:00Z",
  "payload": {
    "sender": "5511999999999",
    "text": "Olá, gostaria de saber mais sobre o imóvel"
  }
}
```

Eventos mínimos:

- `whatsapp.connected`;
- `whatsapp.disconnected`;
- `whatsapp.message.received`;
- `agent.run.started`;
- `agent.run.progress`;
- `agent.run.completed`;
- `agent.run.failed`;
- `message.draft.created`;
- `message.approved`;
- `message.sent`;
- `message.send_failed`.

## Idempotência

O processamento deve ser idempotente para:

- mensagens recebidas;
- mensagens enviadas;
- criação de conversas;
- aprovação de rascunhos;
- criação de eventos.

O `external_message_id` do WhatsApp deve ser salvo antes de iniciar um processamento que possa ser repetido.

## Estados de mensagem

```text
received
processing
draft
pending_approval
approved
sending
sent
failed
cancelled
```

## Erros

O Orchestrator deve converter falhas do Hermes em erros do domínio do CRM:

```json
{
  "code": "HERMES_PROFILE_UNAVAILABLE",
  "message": "O perfil Hermes do corretor está indisponível.",
  "retryable": true,
  "broker_id": "broker_001",
  "request_id": "req_001"
}
```

Nunca expor ao usuário final stack trace, API key, caminho de sessão ou erro bruto do bridge.
