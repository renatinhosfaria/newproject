# Plano de implementação

## Fase 0 — Preparação

Entregáveis:

- repositório inicial;
- ambiente local com Docker Compose;
- variáveis de ambiente documentadas;
- migrações do banco;
- pipeline básico de lint, testes e build;
- estrutura dos perfis Hermes de desenvolvimento;
- registro de decisões arquiteturais.
- ADR da stack tecnológica;
- contrato OpenAPI da API;
- especificação do schema e migrations planejadas;
- matriz de autorização;
- especificação dos Agents;
- estratégia de testes.

Critério de conclusão: o projeto sobe localmente com um CRM vazio e um perfil Hermes de teste.

## Fase 1 — Fundação do CRM

Implementar:

- autenticação;
- usuários e papéis;
- corretores;
- `broker_id`;
- middleware de autorização;
- leads;
- auditoria básica.

Critério de conclusão: um corretor consegue entrar e só consultar os próprios registros.

## Fase 2 — Perfil Hermes e WhatsApp

Implementar:

- criação de `hermes_profile`;
- provisionamento do processo ou container;
- volume persistente da sessão;
- API key interna;
- status do runtime;
- fluxo de pairing do WhatsApp;
- reconexão e revogação;
- monitoramento básico.

Critério de conclusão: o número do corretor conecta, permanece conectado após reinicialização e pode ser revogado pelo supervisor.

## Fase 3 — Conversas e agente Atendimento

Implementar:

- conversas;
- mensagens;
- sessões de agentes;
- integração com o Hermes Orchestrator;
- streaming de resposta;
- ferramentas CRM com escopo de corretor;
- modo de rascunho ou aprovação;
- idempotência de mensagens.

Critério de conclusão: uma conversa real percorre WhatsApp, Hermes e CRM sem misturar dados.

## Fase 4 — Teste de isolamento e carga inicial

Testar:

- dois e três corretores simultâneos;
- desconexão de um bridge;
- reinicialização de um runtime;
- duplicação de eventos;
- acesso cruzado entre corretores;
- perda e recuperação de mensagens;
- uso de CPU, memória e armazenamento.

Critério de conclusão: os critérios de aceitação do MVP passam com evidências registradas.

## Fase 5 — Provisionamento automático

Implementar:

- criação de corretor pelo supervisor;
- criação do perfil Hermes;
- criação do volume;
- criação do runtime;
- geração de credenciais internas;
- estado de onboarding;
- tela de conexão WhatsApp;
- suspensão e desligamento;
- limpeza controlada de recursos.

Critério de conclusão: um novo corretor pode ser incluído sem intervenção manual no servidor, exceto pela leitura do QR Code.

## Fase 6 — Expansão do produto

Após o MVP:

- follow-up;
- tráfego pago;
- tráfego orgânico;
- criativos de imagem;
- criativos de vídeo;
- análise de desempenho;
- dashboards de KPIs;
- documentos e ativos;
- supervisor e visão de equipe.

## Definição de pronto

Uma etapa só é considerada pronta quando:

- o fluxo principal funciona;
- falhas esperadas possuem tratamento;
- permissões foram testadas;
- eventos relevantes são auditados;
- dados sensíveis não aparecem em logs ou respostas;
- documentação foi atualizada;
- testes automatizados e teste manual do fluxo foram executados.
