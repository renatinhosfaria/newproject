# Tarefa 4 - Idempotencia transacional para operacoes locais

## Red

- `pnpm vitest run --project unit tests/unit/canonical-json.test.ts`
  - Falhou como esperado porque `apps/api/src/idempotency/canonical-json.js` ainda nao existia.
- `node_modules/.bin/vitest run --project integration tests/integration/idempotency.test.ts`
  - Falhou como esperado porque `apps/api/src/idempotency/idempotency.service.js` ainda nao existia.

## Green

- Adicionado `canonicalJson` com ordenacao recursiva de chaves de objeto, preservando ordem de arrays, e `sha256Hex`.
- Adicionado `IdempotencyService.execute` como provider Nest, usando transacao do Drizzle/Postgres, `pg_advisory_xact_lock` transacional sobre `(workspace_id,user_id,operation,key)`, constraint unica existente e persistencia de resposta.
- O hash inclui `operation` concreta e DTO validado canonico. Headers/cookies ficam fora.
- Antes de qualquer replay, a transacao seta contexto RLS e revalida usuario, workspace, membership e broker ativos.
- Replay preserva `status`, corpo e `request_id` originalmente persistidos.
- Corpo diferente com mesma `(workspace_id,user_id,operation,key)` retorna `409 IDEMPOTENCY_KEY_REUSED`.
- Falha dentro do callback faz rollback do efeito local e nao grava resposta de sucesso.
- TTL usa `Clock` injetado, com `expires_at = now + 24h`; `db:maintenance` remove registros expirados.
- Migration `0009_idempotency_rls.sql` habilita RLS em `idempotency_records` e concede `DELETE` minimo para expiracao sob a role da API, preservando audit append-only.

## Testes adicionados

- `tests/unit/canonical-json.test.ts`
  - Ordenacao recursiva e preservacao de arrays.
  - Hash igual para objetos equivalentes com ordem diferente.
- `tests/integration/idempotency.test.ts`
  - Duas chamadas concorrentes criam uma conversa unica em PostgreSQL real.
  - Mesma chave isolada por `operation` concreta com IDs de recurso distintos.
  - Corpo diferente com mesma chave/operacao retorna 409 sem nova mutacao.
  - Replay preserva corpo e `request_id` original.
  - Rollback entre efeito local e registro nao deixa efeito nem replay gravado.
  - Expiracao com `ManualClock` + maintenance permite nova execucao apos 24h.
  - Replay apos suspensao do broker e bloqueado antes de devolver resposta gravada.

## Ambiente real usado

```sh
PATH=/tmp/pacaembu-validation-tools/node_modules/.bin:$PATH
NODE_ENV=test
DATABASE_URL_TEST=postgres://pacaembu_app@127.0.0.1:55439/pacaembu_test
DATABASE_URL_TEST_OWNER=postgres://postgres@127.0.0.1:55439/pacaembu_test
```

Os testes de integracao usam PostgreSQL real. O harness abre a pool da API com a role restrita `pacaembu_app`; `ownerPool` fica limitado a fixtures, migrations, checks administrativos e maintenance no teste de expiracao.

## Comandos e resultados

```text
pnpm vitest run --project unit tests/unit/canonical-json.test.ts
1 failed suite: modulo canonical-json ausente

node_modules/.bin/vitest run --project integration tests/integration/idempotency.test.ts
1 failed suite: modulo idempotency.service ausente

pnpm vitest run --project unit tests/unit/canonical-json.test.ts
1 file passed, 2 tests passed

node_modules/.bin/vitest run --project integration tests/integration/idempotency.test.ts
1 file passed, 7 tests passed

pnpm test:unit
3 files passed, 8 tests passed

pnpm test:contract
2 files passed, 7 tests passed

pnpm test:integration
4 files passed, 34 tests passed

pnpm test
9 files passed, 49 tests passed

pnpm typecheck
tsc --noEmit passed

pnpm lint
eslint packages tests vitest.config.ts passed

pnpm format:check
All matched files use Prettier code style
```

## Decisoes

- Usei `operation` como parte do escopo da chave. Para chaves reutilizadas entre recursos, a rota concreta inclui o ID do recurso em `operation`; com a mesma `operation` e mesma chave, recursos diferentes conflitam por desenho.
- A limpeza de expirados dentro do ciclo de `execute` remove apenas a identidade atual e expirada. A maintenance faz a limpeza geral da tabela CRM `idempotency_records`.
- Revalidacao de status fica dentro do service para garantir que um chamador futuro nao consiga receber replay persistido depois de suspensao.
