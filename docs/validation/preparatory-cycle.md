# Evidência do ciclo preparatório do CRM

Data: 22/09/2026. Branch integrada: `feat/preparatory-crm-cycle`, com correção final da tarefa 8 em `9ecf9cf` e infraestrutura da tarefa 9 em `e9022a0`. Ambiente local: Linux, Node 24.21.0, pnpm 11.27.1, Chromium headless e PostgreSQL 18.4 no Compose de teste, publicado somente em `127.0.0.1:55432` para o banco `pacaembu_test`. Para executar o smoke sem instalar um serviço Docker no host, foi usado Docker Engine 29.8.1 e Compose 5.5.1 em `/tmp/pacaembu-docker`, com socket e dados exclusivos. Nenhuma conta, sessão ou instalação Hermes/Brain existente foi usada.

| Verificação executada | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passou no workspace de quatro pacotes. |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | Passaram na revisão final. |
| `docker compose -f infra/compose/compose.test.yaml up -d --wait` | PostgreSQL 18.4 ficou saudável; `down -v --remove-orphans` passou ao final. |
| `pnpm db:migrate` com a URL de owner do banco de teste | Passou. |
| `pnpm test` com `DATABASE_URL_TEST` e `DATABASE_URL_TEST_OWNER` no Compose de teste | 118/118 testes em 18 arquivos passaram. |
| `NODE_ENV=production pnpm build` | Passou; Next 16.3.5 compilou as rotas de login, leads, conversa e Agent. |
| `pnpm exec playwright install --with-deps chromium` | Passou. |
| `pnpm test:e2e` | 43 passaram e 1 foi pulado por escopo da tela; desktop 1280px e mobile 390px. |
| `pnpm test:e2e:compose` | 1/1 passou em 3,8 minutos. Construiu as imagens, subiu o Compose, autenticou pelo Nginx, verificou `/api/health/ready`, criou e leu um lead após reiniciar a API e recebeu `agent.run.completed` por SSE via proxy. O projeto e o volume exclusivos foram removidos pelo teste. |
| `docker compose --env-file <arquivo temporário> -f infra/compose/compose.yaml config --quiet` | Passou com variáveis sintéticas; o arquivo temporário foi removido. |
| `git diff --check` | Passou; revisão independente anterior do conjunto não encontrou problemas críticos ou importantes. |

Foram inspecionadas capturas das telas de carteira, Agent e supervisor em 1280px e de menu, conversa e Agent em 390px. As ações e o estado “Rascunho não enviado” ficaram visíveis; o menu móvel mostrou a identidade do corretor e o conteúdo permaneceu legível sem corte horizontal nas capturas. Os testes Playwright também cobriram teclado, validações associadas aos campos, reconexão SSE, cursor expirado, revogação, CSRF, envio duplicado e persistência após recarregar.

Durante a validação, dois testes de integração excederam o timeout padrão de 5 segundos quando a suíte rodou em paralelo. Ambos passaram isoladamente; o timeout foi elevado somente no projeto de integração para 10 segundos, seguido da suíte integrada verde. Uma rodada anterior do Playwright apontou que Escape não fechava o menu móvel; a tarefa 8 corrigiu o comportamento e a matriz final passou.

O daemon temporário respondeu pelo socket exclusivo e o smoke validou o empacotamento em execução. Após os testes, `docker ps -a` e `docker volume ls` no daemon isolado não listaram recursos restantes. A CI contém a mesma matriz e o smoke Compose; a execução remota da CI depende de publicar a branch, etapa fora deste plano.

O comando `playwright install --with-deps chromium` atualizou quatro pacotes `libglib2.0` do host via apt; o `needrestart` reiniciou serviços de sistema associados. O comando terminou com exit 0. O daemon temporário foi encerrado e suas regras Docker de rede foram removidas após a validação.

Não foi feito reset manual do banco. Os testes usam schemas efêmeros no banco terminado em `_test` e seus harnesses os removem ao concluir. A inspeção de `apps/api/src/agents` encontrou apenas o adapter determinístico e a porta Hermes, sem chamadas HTTP externas, modelo ou envio de WhatsApp neste ciclo.
