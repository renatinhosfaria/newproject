# Protótipo navegável — Pacaembu Orbit CRM

Protótipo estático de alta fidelidade para explorar a estrutura do CRM e a experiência da área de Agents.

## Executar localmente

Na pasta prototype, execute:

    python -m http.server 4173

Depois acesse:

    http://127.0.0.1:4173/

Também é possível usar qualquer servidor HTTP estático.

## O que está navegável

- Visão geral com KPIs, ritmo comercial, funil e agenda.
- Leads e clientes em Kanban.
- Seleção de lead e ficha contextual.
- Cadastro mocado de novo lead.
- Área de Agents com especialistas, sessões, contexto e composer.
- Resposta mocada do Agent após o envio de uma tarefa.
- Performance com metas e ranking.
- Imóveis com modo de apresentação do produto.
- Documentos com biblioteca de materiais.
- Gestão da equipe com tabela de corretores.
- Configurações de permissões dos Agents.

## Observações

- Todos os dados são mocados no app.js.
- Nenhuma integração real com CRM, Hermes, WhatsApp ou Meta Ads está conectada.
- Os elementos visuais de imóvel são formas CSS para manter o protótipo independente de mídia externa.
- A área de Agents segue a lógica de sessões e especialistas do Hermes Bot, com uma linguagem visual própria para o CRM.
