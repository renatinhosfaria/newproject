# ADR 001 — Perfil Hermes por corretor

- **Status:** aceito para o MVP
- **Data:** 2026-09-20
- **Escopo:** integração WhatsApp e runtime dos agentes

## Contexto

Cada corretor terá um número WhatsApp próprio. O projeto utilizará o bridge nativo não oficial do Hermes baseado em Baileys. Conversas, credenciais, memória e sessões não podem ser compartilhadas entre corretores.

O Hermes possui perfis isolados e suporta gateways com múltiplos perfis, mas a documentação informa uma limitação específica: o WhatsApp bridge é uma entrada compartilhada do perfil padrão quando o gateway multiplexado está ativo. Não devemos depender desse comportamento para administrar vários números independentes.

## Decisão

Para cada corretor, criar:

1. um registro de corretor no CRM;
2. um perfil Hermes próprio;
3. um processo ou container Hermes próprio;
4. uma sessão WhatsApp própria;
5. credenciais e API key próprias;
6. volume, logs e estado próprios;
7. uma rota no Hermes Orchestrator.

O CRM, o banco de dados e o Orchestrator serão centralizados no VPS. Os agentes especialistas serão distribuídos a partir de um pacote comum e versionado.

## Alternativas consideradas

### Um único perfil Hermes para todos os corretores

Rejeitada. Misturaria sessões, memória, credenciais e estado, além de dificultar a autorização por corretor.

### Um gateway multiplexado para todos os números Baileys

Não adotada no MVP. A documentação não confirma múltiplas sessões Baileys independentes dentro de um único gateway multiplexado e informa que o bridge WhatsApp é compartilhado pelo perfil padrão nesse modo.

### Um VPS separado por corretor

Adiada. Oferece isolamento físico maior, mas aumenta custo e complexidade operacional. O MVP começa com múltiplos runtimes no mesmo VPS, mantendo a possibilidade de migração posterior.

### Uma API oficial do WhatsApp Business

Fora da decisão atual. Pode ser avaliada posteriormente como outro adapter, sem alterar o CRM ou o contrato do Orchestrator.

## Consequências positivas

- Isolamento claro por corretor.
- Falha de um perfil não precisa interromper os demais.
- Credenciais e sessões podem ser revogadas individualmente.
- Provisionamento e desligamento podem ser automatizados.
- Um perfil pode ser movido para outro VPS sem alterar o CRM.

## Consequências negativas

- Mais processos ou containers para monitorar.
- Maior consumo de memória do que um processo único.
- Atualizações do pacote de agentes precisam ser distribuídas.
- O bridge não oficial continua sujeito a desconexões e alterações do protocolo.

## Critério de revisão

Reavaliar esta decisão depois de testar três perfis simultâneos, medindo:

- uso de CPU e memória;
- estabilidade das sessões;
- tempo de reconexão;
- duplicidade de mensagens;
- isolamento de conversas;
- capacidade do VPS.
