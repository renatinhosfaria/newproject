# CRM Pacaembu + Hermes Agent

Documentação inicial da arquitetura do CRM e da integração com o Hermes Agent.

## Documentos

- [Protótipo navegável](../prototype/README.md)
- [MVP do produto](./product-mvp.md)
- [Arquitetura do sistema](./architecture.md)
- [Modelo de segurança e isolamento](./security-model.md)
- [Contrato de integração CRM–Hermes](./integration-contract.md)
- [Modelo de dados](./data-model.md)
- [Plano de implementação](./implementation-plan.md)
- [ADR 001 — perfil Hermes por corretor](./adr/001-hermes-profile-per-broker.md)

## Decisões atuais

- O CRM será a interface principal para os corretores.
- O CRM terá autenticação, autorização e banco de dados próprios.
- O Hermes Agent será executado em um VPS administrado pelo supervisor.
- Cada corretor terá um perfil Hermes e uma sessão WhatsApp próprios.
- Os agentes especialistas serão distribuídos com a mesma configuração funcional para os perfis.
- O `broker_id` será a chave de isolamento dos dados do corretor.
- O MVP será validado com um único corretor antes da expansão para 15–20 corretores.

## Referências oficiais

- [Hermes Messaging Gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/)
- [Hermes WhatsApp bridge](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/whatsapp.md)
- [Hermes Profiles](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md)
- [Hermes Multi-profile Gateways](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/multi-profile-gateways.md)
- [Hermes Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)
