# Estratégia de testes

## Limites do ciclo atual

Os testes desta entrega verificam schemas Zod, máquina de estados de mensagens
e OpenAPI 3.1. Integração PostgreSQL, autorização, SSE, idempotência e E2E
serão ativados pelas tarefas consumidoras. Aprovação/envio, pairing e
mensagens WhatsApp permanecem cenários do roadmap.

## Objetivo

Garantir que o CRM preserve isolamento por corretor, consistência de mensagens e previsibilidade do fluxo de Agents antes de conectar múltiplos perfis Hermes e números WhatsApp.

## Pirâmide de testes

### Unitários

Cobrem regras puras e rápidas:

- transições de etapa de lead;
- cálculo de indicadores;
- políticas de autorização;
- normalização de telefone;
- idempotência;
- estados de mensagem e outbox;
- montagem de contexto do Agent;
- validação de payloads Zod.

Ferramenta recomendada: Vitest.

### Integração

Executados contra PostgreSQL e Redis temporários ou containers de teste:

- migrations em banco vazio;
- constraints e índices;
- consultas sempre filtradas por workspace/broker;
- criação de sessão e revogação;
- outbox e locks;
- processamento idempotente de eventos;
- conversão de falha Hermes em erro de domínio.

Ferramenta recomendada: Vitest + Supertest + containers Docker.

### Contrato

- validar a API contra `docs/api/openapi.yaml`;
- validar schemas de eventos entre API, Orchestrator e runtime Hermes;
- validar estados permitidos de mensagem, pairing e execução do Agent;
- manter fixtures versionadas sem dados reais.

### End-to-end

Ferramenta recomendada: Playwright.

Fluxos mínimos:

1. login, logout e sessão expirada;
2. corretor vê apenas sua carteira;
3. supervisor vê o agregado autorizado;
4. criação e atualização de lead;
5. abertura e troca de sessão de Agent;
6. streaming de resposta e reconexão;
7. geração de rascunho;
8. mensagem duplicada sem duplicação no CRM (roadmap de integração).

### Carga e resiliência

Ferramenta recomendada: k6.

Executar progressivamente com 1, 3 e 20 corretores, medindo:

- latência p50/p95 da API;
- tempo para abrir sessão de Agent;
- tempo até o primeiro evento SSE;
- throughput de mensagens recebidas;
- consumo de CPU, memória e armazenamento;
- reconexões do bridge;
- tamanho da fila e tempo de processamento;
- ausência de acesso cruzado sob concorrência.

Os limites definitivos devem ser definidos após uma medição do VPS escolhido. Até lá, usar como alvo inicial p95 menor que 500 ms para consultas do CRM e nenhuma perda ou duplicação confirmada de mensagem.

## Matriz de cenários críticos

| ID | Cenário | Resultado esperado |
|---|---|---|
| AUTH-01 | senha inválida repetida | resposta genérica e rate limit |
| AUTH-02 | sessão revogada | API retorna 401 e Web redireciona para login |
| ISO-01 | corretor consulta lead de outro broker | 404 ou 403 sem revelar existência |
| ISO-02 | `broker_id` adulterado no body | servidor ignora o valor e usa o contexto autenticado |
| ISO-03 | Agent tenta ferramenta fora da capacidade | chamada negada e auditada |
| DB-01 | migration em banco vazio | todas as tabelas e constraints são criadas |
| MSG-01 | mesmo evento WhatsApp duas vezes | uma mensagem persistida e um processamento |
| MSG-02 | aprovação repetida | uma outbox ativa e resposta idempotente |
| MSG-03 | falha durante envio | estado `failed`, erro sanitizado e retry controlado |
| AGT-01 | runtime Hermes indisponível | sessão preservada e execução marcada como falha |
| AGT-02 | reconexão SSE | eventos não são duplicados na interface |
| AGT-03 | prompt pede para ignorar autorização | Agent mantém o contexto do servidor |
| OPS-01 | reinício do VPS | banco, outbox e sessões persistentes retornam ao estado esperado |
| OPS-02 | revogação de um WhatsApp | apenas o runtime correspondente é parado |
| A11Y-01 | fluxo completo somente com teclado | todos os controles essenciais são alcançáveis |
| A11Y-02 | erro de formulário | mensagem associada ao campo e anunciada |

## Segurança nos testes

Os testes devem verificar explicitamente:

- ausência de secrets em logs, respostas, prompts e fixtures;
- cookies com `HttpOnly`, `Secure` e `SameSite` adequado;
- proteção contra CSRF quando aplicável;
- validação de assinatura e replay de eventos internos;
- rate limiting em login, pairing e mensagens;
- sanitização de conteúdo exibido no CRM;
- exportações limitadas ao escopo autorizado;
- auditoria de ações administrativas.

## Ambientes

### Local

PostgreSQL, Redis e serviços auxiliares em Docker Compose. Dados descartáveis e secrets de desenvolvimento separados.

### CI

Executar em cada pull request:

1. formatação e lint;
2. typecheck;
3. unitários;
4. integração com banco limpo;
5. validação do OpenAPI;
6. build do Web e API;
7. smoke E2E sem WhatsApp real.

### Staging

Usar um VPS ou ambiente isolado com um perfil Hermes de teste. Nunca conectar um número pessoal ou de produção.

### Produção

Liberar somente após evidência dos testes de isolamento, backup/restore, reconexão e carga inicial.

## Definição de pronto para uma funcionalidade

Uma funcionalidade só está pronta quando:

- possui teste unitário para regra de negócio;
- possui teste de autorização;
- possui teste de integração para persistência;
- possui fluxo E2E quando houver interface;
- documenta erros e estados vazios;
- não emite secret ou PII desnecessária nos logs;
- atualiza o contrato OpenAPI/eventos quando necessário;
- passa em lint, typecheck, testes e build;
- tem evidência manual do fluxo no ambiente adequado.
