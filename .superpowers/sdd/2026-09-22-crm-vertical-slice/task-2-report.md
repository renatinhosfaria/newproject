# Tarefa 2 — relatório

## Resultado

Implementação concluída no commit desta tarefa, com a estrutura de persistência, isolamento por banco, seed local, harness/fixtures e Nest/Fastify mínimo previstos no brief. Durante a auditoria final, o job de manutenção foi ajustado para respeitar `events_expire_at` e remover somente eventos de runs terminados, e o seed passou a aceitar exclusivamente `development` ou `test`.

## Arquivos

- `db/migrations/0001_identity.sql` a `0004_reliability.sql`: extensões, enums, 16 tabelas do ciclo, chaves compostas, índices, trigger de escopo de Agent, RLS/policies e grants para `pacaembu_app`.
- `db/migrate.ts`, `db/seed.ts`, `db/maintenance.ts`: migrations idempotentes com lock advisory, seed Argon2id restrito explicitamente a desenvolvimento/teste e limpeza de sessões/idempotência/eventos expirados de runs terminados.
- `apps/api/src/db/{client,schema}.ts`: pool, Drizzle, `Db`, `Tx`, contexto transacional e tabelas/tipos.
- `apps/api/src/{clock,app,app.module}.ts`, `apps/api/src/http/health.controller.ts`: relógio injetável e app Nest/Fastify sem `listen`.
- `tests/helpers/{harness,fixtures,clock}.ts`, `tests/integration/schema.test.ts`: banco `_test`, roles owner/app, fixtures de dois brokers no mesmo workspace, broker externo, membership multi-workspace, Agent `follow-up` desabilitado e testes SQL de FK/RLS/auditoria/seed.
- `infra/compose/{compose.test.yaml,init-test.sql}`: PostgreSQL de teste apenas em loopback, banco `pacaembu_test`, role owner e role app sem DDL.
- `.env.example`, `package.json`, `tsconfig.json`, `scripts/check-integration-db.mjs` atualizados para dependências/comandos e proteção do banco de teste.

## Verificações executadas nesta auditoria

- `pnpm typecheck`: **não executado**, `pnpm` não está instalado no host (`command not found`).
- `pnpm lint`: **não executado**, `pnpm` não está instalado no host.
- `pnpm test:unit`: **não executado**, `pnpm` não está instalado no host.
- `pnpm test:contract`: **não executado**, `pnpm` não está instalado no host.
- `pnpm format:check`: **não executado**, `pnpm` não está instalado no host.
- `docker compose -f infra/compose/compose.test.yaml config`: **não executado**, Docker não está instalado no host.
- `./node_modules/.bin/vitest run tests/unit tests/contracts`: **passou**, 3 arquivos e 8 testes.
- `./node_modules/.bin/eslint packages tests apps db vitest.config.ts`: **passou**.
- `./node_modules/.bin/prettier --check ...`: **passou**.
- `git diff --check`: **passou** após as correções desta auditoria.
- `./node_modules/.bin/tsc --noEmit`: **falhou por dependências ausentes** (`@nestjs/*`, `pg`, `drizzle-orm`, `argon2`), com erros derivados de tipos não carregados.

## Verificações históricas registradas

- `vitest run tests/unit tests/contracts`: passou em execução anterior, 3 arquivos e 8 testes.
- `prettier --check ...`: passou em execução anterior após formatar os arquivos da tarefa.
- `eslint packages tests apps db vitest.config.ts`: passou em execução anterior.
- Teste vermelho escrito antes da implementação: falhou inicialmente por módulo `tests/helpers/harness.js` ausente, conforme TDD.

## Não executado / limitações do host

- `vitest run tests/integration/schema.test.ts`: não executado nesta auditoria porque o host não possui `pnpm`/dependências instaladas; a execução histórica também não iniciou por ausência de `pg`/Drizzle (`Cannot find package 'pg'`).
- `node scripts/check-integration-db.mjs`: recusou execução por ausência de `DATABASE_URL_TEST`; não há Docker, PostgreSQL (`psql`) ou `pnpm` no host.
- `tsc --noEmit`: não concluiu por dependências novas ausentes (`pg`, `drizzle-orm`, Nest, `argon2` e tipos correspondentes). Os manifests declaram essas dependências para instalação em ambiente Node/pnpm suportado.
- Não há evidência de migrations, seed, RLS ou integração real executados; não declarar aprovação de integração até rodar Compose/PostgreSQL limpo com `DATABASE_URL_TEST` e `DATABASE_URL_TEST_OWNER`.

## Riscos/observações

- O harness exige explicitamente duas URLs terminadas em `_test`, uma owner e uma app; isso evita que uma role owner faça os testes de RLS passarem artificialmente.
- `pacaembu_app` é criado pelo Compose de teste e recebe somente DML necessário; migrations operacionais devem ser executadas com a URL de owner.
- A migration não cria `hermes_profiles`, `whatsapp_connections`, `outbox_messages` ou conexões Hermes reais, conforme o escopo fechado.
