# CRM Pacaembu + Hermes Agent

Documentação inicial da arquitetura do CRM e da integração com o Hermes Agent.

## Escopo atual

O checkout implementa o ciclo preparatório verificável: sessão por cookie,
workspace/membership, leads, conversas, mensagens, Agent Atendimento em
`draft_only` e eventos SSE com replay. WhatsApp real, pairing, Hermes runtime,
outbox, aprovação/envio e dashboard completo são roadmap e não fazem parte das
rotas ou migrations deste ciclo.

## Documentos

- [Design system e especificação de UX/UI](./DESIGN.md)
- [MVP do produto](./product-mvp.md)
- [Arquitetura do sistema](./architecture.md)
- [Modelo de segurança e isolamento](./security-model.md)
- [Contrato de integração CRM–Hermes](./integration-contract.md)
- [Modelo de dados](./data-model.md)
- [Plano de implementação](./implementation-plan.md)
- [ADR 001 — perfil Hermes por corretor](./adr/001-hermes-profile-per-broker.md)
- [ADR 002 — stack tecnológica](./adr/002-stack-tecnologica.md)
- [Contrato OpenAPI da API](./api/openapi.yaml)
- [Especificação do schema do banco](./database-schema.md)
- [Matriz de autorização](./authorization-matrix.md)
- [Especificação dos Agents](./agents-spec.md)
- [Estratégia de testes](./testing-strategy.md)

## Decisões atuais

- O CRM será a interface principal para os corretores.
- O CRM terá autenticação, autorização e banco de dados próprios.
- O adapter simulado mantém a fronteira do Hermes; o runtime em VPS é roadmap.
- Perfis Hermes e sessões WhatsApp próprios entram no ciclo de integração futuro.
- Os agentes especialistas serão distribuídos com a mesma configuração funcional para os perfis.
- `workspace_memberships` é a única fonte de papel; `workspace_id` e
  `broker_id` derivado formam o escopo dos dados.
- O MVP será validado com um único corretor antes da expansão para 15–20 corretores.

## Referências oficiais

- [Hermes Messaging Gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/)
- [Hermes WhatsApp bridge](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/whatsapp.md)
- [Hermes Profiles](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md)
- [Hermes Multi-profile Gateways](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/multi-profile-gateways.md)
- [Hermes Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)
