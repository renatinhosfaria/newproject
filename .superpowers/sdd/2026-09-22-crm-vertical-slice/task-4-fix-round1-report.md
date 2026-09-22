# Tarefa 4 - Fix round1

## Feedback

SPEC/QUALITY FAIL Important: o service retornava `409 IDEMPOTENCY_CONFLICT`, mas o contrato publico/OpenAPI exige `409 IDEMPOTENCY_KEY_REUSED`.

## Red

Atualizei primeiro `tests/integration/idempotency.test.ts` para esperar `IDEMPOTENCY_KEY_REUSED` no caso de mesma chave com corpo diferente.

```text
node_modules/.bin/vitest run --project integration tests/integration/idempotency.test.ts
1 failed, 6 passed
AssertionError: expected ProblemError: IDEMPOTENCY_CONFLICT to match object { status: 409, code: "IDEMPOTENCY_KEY_REUSED" }
```

## Green

Corrigi `IdempotencyService` para lançar `problem(409, "IDEMPOTENCY_KEY_REUSED")` quando a mesma identidade `(workspace_id,user_id,operation,key)` recebe hash de request diferente.

```text
node_modules/.bin/vitest run --project integration tests/integration/idempotency.test.ts
1 file passed, 7 tests passed

pnpm test:contract
2 files passed, 7 tests passed
```

## Decisao

Mantive o comportamento transacional e o escopo da chave intactos. A mudanca e apenas o codigo de erro publico para alinhar service, teste de integracao e contrato OpenAPI.
