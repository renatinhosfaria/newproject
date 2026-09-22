# Task 1 Report: Contratos do ciclo e workspace verificável

## Resultado

Task 1 foi concluída com o runner pnpm, contratos compartilhados em
`packages/contracts`, testes de contrato/unitários e a documentação/OpenAPI
alinhada ao ciclo preparatório.

## Entregas verificadas

- workspace pnpm com lockfile e Node 24 declarado em `.node-version`/`.nvmrc`;
- scripts de teste, typecheck, lint e formatação;
- projetos Vitest `unit`, `contracts` e `integration`;
- schemas Zod e tipos inferidos para autenticação, workspace, leads,
  conversas, mensagens e Agent sessions/runs/events;
- máquina de estados `received -> processing -> draft -> failed`;
- limites de entrada, UUID, idempotência, paginação e remoção de campos de
  identidade enviados pelo cliente;
- OpenAPI 3.1 somente com as rotas do ciclo atual, incluindo SSE, replay,
  cookies, códigos de erro e respostas 201/202/204/410;
- documentação distinguindo o ciclo executado do roadmap Hermes/WhatsApp,
  outbox, aprovação e pairing.

## Verificação

Comando equivalente ao pnpm disponível no ambiente:

```text
npx --yes pnpm@11.27.1 install --frozen-lockfile
npx --yes pnpm@11.27.1 test:contract
npx --yes pnpm@11.27.1 test:unit
npx --yes pnpm@11.27.1 typecheck
npx --yes pnpm@11.27.1 lint
npx --yes pnpm@11.27.1 format:check
```

Resultados:

- instalação congelada concluída;
- contratos: 2 arquivos, 7 testes aprovados;
- unitários: 1 arquivo, 1 teste aprovado;
- TypeScript: `tsc --noEmit` aprovado;
- ESLint: aprovado;
- Prettier: todos os arquivos aprovados.

O ambiente fornece Node `v26.7.0`, enquanto o projeto fixa Node `>=24.0.0 <25`;
por isso o pnpm emitiu o aviso de engine em cada comando. Não há runtime Node
24 disponível neste checkout para repetir a verificação na versão declarada.

Testes de integração não foram executados porque não há banco pronto e não há
testes em `tests/integration` nesta entrega.
