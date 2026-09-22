# Relatório da Tarefa 3

## Escopo auditado

Foram revisados os fluxos de sessão opaca, revalidação de usuário/membership/workspace/broker, guard, políticas de corretor, CSRF por `Origin`/`Referer`, rate limit, Problem Filter, request id e auditoria transacional.

Foram corrigidos dois pontos essenciais encontrados na auditoria:

- a chave de email do rate limit usa a mesma forma canônica do login (`trim` + `lowercase`);
- `AuditService` persiste somente metadata allowlisted (`method`, `code`, `count`), evitando que credenciais, cookies, tokens ou dados arbitrários atravessem a fronteira de auditoria.

## Validação

Executado com os binários locais em `node_modules/.bin` (o ambiente não possui `pnpm`):

| Comando | Resultado |
| --- | --- |
| `node_modules/.bin/tsc --noEmit` | passou |
| `node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` | passou |
| `node_modules/.bin/eslint apps/api/src/auth apps/api/src/http/problem.filter.ts apps/api/src/http/request-id.ts apps/api/src/audit tests/helpers/auth.ts tests/integration/auth.test.ts tests/integration/csrf.test.ts tests/unit/policies.test.ts` | passou |
| `node_modules/.bin/eslint packages tests vitest.config.ts` | passou |
| `node_modules/.bin/vitest run tests/unit tests/contracts` | passou: 4 arquivos, 12 testes |
| `node_modules/.bin/prettier --check ...` | passou |
| `git diff --check` | passou |

## Integração e riscos

`node scripts/check-integration-db.mjs` não passou porque `DATABASE_URL_TEST` não está configurada. Portanto os testes de integração de auth/CSRF não foram executados e não há aprovação de integração/Postgres neste ambiente. O compose e as migrations devem ser validados em ambiente com PostgreSQL de teste e as URLs `DATABASE_URL_TEST` e `DATABASE_URL_TEST_OWNER` configuradas.

O rate limiter é memória local da instância, adequado ao ciclo atual de uma API única; múltiplas instâncias exigirão armazenamento compartilhado. A auditoria de falhas de login com usuário desconhecido não cria linha porque não há workspace/ator confiável para satisfazer o modelo de auditoria; o erro público permanece uniforme.

## Fix round 1

Reprodução real com Node 24.21.0, PostgreSQL isolado na porta 55439 e role `pacaembu_app` encontrou 500 no login. Foram corrigidos:

- tokens explícitos no construtor do controller e guard;
- configuração de URL do banco passada por `AppModule.forRoot`, sem mutar `DATABASE_URL` global no harness;
- lookup pré-sessão de broker via função SQL `SECURITY DEFINER` estreita (`0006_auth_broker_lookup.sql`), mantendo o restante da API sob a role app/RLS;
- permissão `UPDATE` somente em `auth_sessions` para atualizar `last_seen_at`;
- setup de grants serializado com advisory lock entre workers Vitest;
- `allowBuilds` válido para `@nestjs/core` e `argon2` em `pnpm-workspace.yaml`.

Validação real:

`vitest run --project integration` passou: 3 arquivos, 14 testes. Os testes cobrem auth, CSRF e invariantes de schema usando a role app; migrations/fixtures administrativas usam a conexão owner.
