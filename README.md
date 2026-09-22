# Pacaembu Orbit CRM — ciclo preparatório

Este repositório executa o fluxo local de login, carteira de leads, conversa e Agent Atendimento **simulado**. O Agent cria um rascunho persistido; não envia mensagens nem chama modelos, WhatsApp ou instalações Hermes existentes.

## Requisitos

- Docker com Compose para executar a aplicação completa;
- Node 24.21.0 e pnpm 11.27.1 para desenvolvimento e testes fora dos containers.

## Iniciar localmente

1. Copie `.env.example` para `.env`.
2. Preencha as senhas, os e-mails e a origem no arquivo. Gere senhas diferentes com `openssl rand -hex 32`; use endereços de e-mail sintéticos para os usuários locais. A origem deve corresponder exatamente ao endereço usado no navegador, inclusive porta.
3. Execute `docker compose --env-file .env -f infra/compose/compose.yaml up --build --wait`.
4. Abra o valor de `APP_ORIGIN`. Entre com `SEED_BROKER_EMAIL` e `SEED_BROKER_PASSWORD` para criar um lead, abrir sua conversa e pedir um rascunho. Use as credenciais de supervisor para conferir a identidade e os módulos disponíveis a esse papel.

Somente o proxy Nginx publica uma porta no loopback. PostgreSQL, Redis, API e Web permanecem na rede interna do Compose. O Redis está preparado para um ciclo posterior e não é necessário para servir os dados ou o stream SSE deste ciclo.

## Comandos úteis

```sh
docker compose --env-file .env -f infra/compose/compose.yaml ps
docker compose --env-file .env -f infra/compose/compose.yaml logs --tail=100 api web proxy
docker compose --env-file .env -f infra/compose/compose.yaml stop
pnpm install --frozen-lockfile
pnpm format:check && pnpm lint && pnpm typecheck
pnpm test && pnpm build && pnpm test:e2e
```

Os logs de aplicação ocultam cookie, token e senha. Não compartilhe o arquivo `.env` ou a saída de `docker compose config` sem revisão. `GET /api/health/live` confirma que o processo responde; `GET /api/health/ready` confirma conexão com o banco e a migration final. A manutenção manual `pnpm db:maintenance` expira sessões, registros de idempotência e eventos de runs terminados conforme as janelas do contrato.

Para testes de integração fora do Compose, configure `DATABASE_URL_TEST` e `DATABASE_URL_TEST_OWNER` para o mesmo banco isolado com nome terminado em `_test`; use roles diferentes para a aplicação e o dono do schema. `infra/compose/compose.test.yaml` fornece um banco de testes local. O runner cria um schema exclusivo por teste e o remove ao concluir.

O proxy de desenvolvimento fora do Compose deve encaminhar `/api/` para a API e as demais rotas para o Web sob um único `APP_ORIGIN`; a API não libera CORS arbitrário. O contrato HTTP está em `docs/api/openapi.yaml`. O escopo e os limites deste ciclo estão em `docs/superpowers/specs/2026-09-22-crm-vertical-slice-design.md` e `docs/product-mvp.md`.
