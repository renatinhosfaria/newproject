# ADR 002 — Stack tecnológica do MVP

- **Status:** proposta recomendada
- **Data:** 2026-09-22
- **Escopo:** fundação do CRM, API, banco, filas e frontend

## Contexto

O projeto precisa sair de uma documentação conceitual para uma implementação de MVP que possa operar com um corretor, evoluir para 15–20 corretores e manter o Hermes como runtime separado. A equipe precisa compartilhar contratos de tipos, autorização e eventos sem transformar o MVP em um conjunto de microserviços difícil de operar.

## Decisão recomendada

Usar um monorepo TypeScript com contratos compartilhados e serviços separados por responsabilidade:

| Camada | Escolha recomendada | Responsabilidade |
|---|---|---|
| Workspace | `pnpm` workspaces | Dependências e scripts do monorepo |
| CRM Web | Next.js + React + TypeScript | Interface autenticada, módulos do CRM e área de Agents |
| Estilos | CSS variables + CSS Modules | Implementar os tokens e regras de `DESIGN.md` |
| CRM API | NestJS com adapter Fastify | REST, SSE, autorização, domínio e auditoria |
| Validação | Zod e schemas compartilhados | Validar entrada, saída e eventos |
| Banco | PostgreSQL | Fonte de verdade dos dados do CRM |
| Acesso ao banco | Drizzle ORM e migrations SQL | Consultas tipadas e controle explícito do schema |
| Fila e locks | Redis + BullMQ | Outbox, reconexão, jobs e idempotência |
| Arquivos | MinIO compatível com S3 | Documentos, imagens, vídeos e artefatos |
| Hermes | Runtime separado por corretor | Agents, perfil e bridge WhatsApp |
| Eventos do Agent | SSE no CRM; HTTP interno no Orchestrator | Streaming de progresso e resposta |
| Testes | Vitest, Supertest, Playwright e k6 | Unitário, API, E2E e carga |
| Operação | Docker Compose no MVP | Ambiente local, staging e primeiro VPS |

O CRM API não deve importar código interno do Hermes. A comunicação ocorrerá pelo adapter do Orchestrator, protegido por rede interna e credenciais próprias.

## Motivos

- TypeScript em Web, API e contratos reduz conversões e divergências de payload.
- Next.js atende a interface autenticada sem exigir uma aplicação frontend e outra de servidor desde o primeiro dia.
- NestJS fornece módulos, guards, interceptors, documentação e uma estrutura adequada para autorização e auditoria.
- PostgreSQL mantém transações e relacionamentos necessários para leads, conversas, mensagens e outbox.
- Redis permite desacoplar eventos sem exigir Kafka ou outra plataforma operacional no MVP.
- SSE é suficiente para transmitir progresso e tokens do Agent para o navegador; WebSocket pode ser adicionado se houver necessidade real de comunicação bidirecional contínua.
- Docker Compose mantém o ambiente reproduzível e permite separar componentes quando a carga justificar.

## Alternativas rejeitadas para o MVP

### API em Python/FastAPI

É uma alternativa válida para uma integração mais próxima do ecossistema Python do Hermes, mas adiciona uma segunda linguagem à camada de negócio. Poderá ser reconsiderada se o adapter precisar executar código Python do Hermes no mesmo processo, o que não faz parte do desenho atual.

### Microserviços independentes desde o início

Adiados. O Orchestrator, a API e os workers terão fronteiras claras no código, mas podem ser implantados no mesmo projeto e VPS enquanto o volume não exigir separação operacional.

### JWT armazenado no `localStorage`

Rejeitado. O CRM usará sessão em cookie `HttpOnly`, `Secure` e `SameSite` adequado ao domínio. Tokens não devem ficar disponíveis para JavaScript de terceiros na página.

### WebSocket como transporte inicial

Adiado. O contrato usa SSE para eventos do Agent por ser suficiente para streaming de saída e mais simples de operar atrás do proxy reverso.

## Regras de implementação

- versões exatas ficam fixadas no lockfile;
- configurações entram por ambiente e nunca por código-fonte;
- contratos compartilhados ficam em um pacote interno versionado;
- migrations são a fonte de verdade do banco;
- cada serviço possui health check e logs estruturados;
- o Hermes continua isolado por perfil e corretor;
- qualquer mudança de stack deve gerar um novo ADR ou atualizar este documento antes de alterar a fundação.

## Estrutura inicial recomendada

```text
apps/
  web/
  api/
  orchestrator/
packages/
  contracts/
  config/
  ui/
db/
  migrations/
docs/
infra/
  compose/
  reverse-proxy/
```

## Critério de revisão

Revisar esta ADR depois do primeiro vertical slice e antes do teste com três corretores. A revisão deve considerar tempo de desenvolvimento, custo operacional, consumo de memória, latência da API, estabilidade do streaming e facilidade de depuração.
