# Evidência do ciclo preparatório do CRM

Data: 22/09/2026. Branch de integração: `feat/preparatory-crm-infra`, baseada na tarefa 8 em `0146785`. Ambiente local: Linux, Node 24.21.0, pnpm 11.27.1, PostgreSQL 18.4 portátil em `127.0.0.1:55439`, banco exclusivo `pacaembu_test`, Chromium headless do Playwright. Nenhuma conta, sessão ou instalação Hermes/Brain existente foi usada.

| Verificação executada | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passou no workspace de quatro pacotes. |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | Passaram na branch integrada. |
| `NODE_ENV=production pnpm build` | Passou; Next 16.3.5 compilou as rotas de login, leads, conversa e Agent. |
| `pnpm test` com `DATABASE_URL_TEST` e `DATABASE_URL_TEST_OWNER` no banco isolado | 117/117 testes em 18 arquivos passaram na branch integrada. |
| `pnpm test:e2e --workers 4` | Na tarefa 8 (`0146785`), 35 passaram e 1 foi pulado por escopo da tela. O merge de infraestrutura não alterou as telas ou os cenários dessa matriz. |
| `docker compose -f infra/compose/compose.yaml config --quiet` com variáveis sintéticas | Passou. |
| `pnpm exec playwright test --config playwright.compose.config.ts --list` | Descobriu o smoke de Compose, 1 teste. |
| `pnpm db:migrate` e processo real `pnpm exec tsx apps/api/src/main.ts` no banco de testes | Passaram na branch de infraestrutura antes do rebase da interface; `/api/health/live` e `/api/health/ready` responderam HTTP 200. O processo foi encerrado após a consulta. |
| `git diff --check` | Passou. |

Foram inspecionadas capturas das telas de carteira, Agent e supervisor em 1280px e de menu, conversa e Agent em 390px. As ações e o estado “Rascunho não enviado” ficaram visíveis; o menu móvel mostrou a identidade do corretor e o conteúdo permaneceu legível sem corte horizontal nas capturas. Os testes Playwright também cobriram teclado, validações associadas aos campos, reconexão SSE, cursor expirado, revogação, CSRF, envio duplicado e persistência após recarregar.

Durante a validação, dois testes de integração excederam o timeout padrão de 5 segundos quando a suíte rodou em paralelo. Ambos passaram isoladamente; o timeout foi elevado somente no projeto de integração para 10 segundos, seguido da suíte integrada verde. Uma rodada anterior do Playwright apontou que Escape não fechava o menu móvel; a tarefa 8 corrigiu o comportamento e a matriz final passou.

**Limite de validação:** a CLI Docker e o plugin Compose estão presentes, mas não há daemon Docker neste host (`docker info` falha ao conectar a `/var/run/docker.sock`). Por isso não foram executados `docker compose up --build --wait`, o reinício da API em containers, o healthcheck do proxy nem o SSE através do Nginx. O smoke em `tests/e2e/compose.spec.ts` está pronto para um runner com daemon e usa projeto e volume exclusivos, removidos ao final. A CI exige esse smoke; até ele passar, o empacotamento Compose permanece sem validação de execução.

Não foi feito reset manual do banco. Os testes usam schemas efêmeros no banco terminado em `_test` e seus harnesses os removem ao concluir. A inspeção de `apps/api/src/agents` encontrou apenas o adapter determinístico e a porta Hermes, sem chamadas HTTP externas, modelo ou envio de WhatsApp neste ciclo.
