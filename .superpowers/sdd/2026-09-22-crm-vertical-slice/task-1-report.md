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

## Fix report

A revisão da Tarefa 1 corrigiu a verificação de `$ref` do teste OpenAPI. O
validador Swagger resolve referências mutando o documento recebido; o teste
agora valida uma cópia e conserva o YAML bruto para conferir as referências
dos schemas.

Verificações executadas com `npx --yes pnpm@11.27.1`:

- `test:contract`: aprovado, 2 arquivos e 7 testes;
- `test:unit`: aprovado, 1 arquivo e 1 teste;
- `typecheck`, `lint` e `format:check`: aprovados;
- `test`: falha explicitamente porque `DATABASE_URL` não está configurada;
- `test:integration`: falha explicitamente pela mesma ausência de PostgreSQL.

Limitações do ambiente: o Node disponível é `v26.7.0`, fora da faixa declarada
`>=24.0.0 <25`, e não há executáveis PostgreSQL (`psql`/`postgres`) nem banco
configurado neste checkout. A ausência de integração é reportada como falha,
nunca como sucesso ou skip silencioso.
