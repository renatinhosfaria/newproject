# Pacaembu Orbit CRM — ciclo preparatório

Este repositório executa o fluxo local de login, carteira de leads, conversa e Agent Atendimento **simulado**. O Agent cria um rascunho persistido; não envia mensagens nem chama modelos, WhatsApp ou instalações Hermes existentes.

## Requisitos

- Docker com Compose para executar a aplicação completa;
- Node 24.21.0 e pnpm 11.27.1 para desenvolvimento e testes fora dos containers.

## Iniciar localmente

1. Copie `.env.example` para `.env`.
2. Preencha as senhas, os e-mails e a origem no arquivo, conforme a tabela de [variáveis de ambiente](#variáveis-de-ambiente). Gere senhas diferentes com `openssl rand -hex 32`; use endereços de e-mail sintéticos para os usuários locais. A origem deve corresponder exatamente ao endereço usado no navegador, inclusive porta.
3. Execute `docker compose --env-file .env -f infra/compose/compose.yaml up --build --wait`.
4. Abra o valor de `APP_ORIGIN`. Entre com `SEED_BROKER_EMAIL` e `SEED_BROKER_PASSWORD` para criar um lead, abrir sua conversa e pedir um rascunho. Use as credenciais de supervisor para conferir a identidade e os módulos disponíveis a esse papel.

Somente o proxy Nginx publica uma porta no loopback. PostgreSQL, Redis, API e Web permanecem na rede interna do Compose. O Redis está preparado para um ciclo posterior e não é necessário para servir os dados ou o stream SSE deste ciclo.

## Variáveis de ambiente

O `.env` (copiado de `.env.example`) só alimenta o Compose. As demais variáveis são definidas pelo próprio Compose, pelos Dockerfiles, pelo CI ou pelo seu shell quando você executa comandos fora dos containers. Nunca faça commit de `.env`; ele é ignorado pelo Git e pelo contexto Docker.

| Variável | Uso | Obrigatória / padrão | Onde definir |
| --- | --- | --- | --- |
| `APP_PORT` | Porta publicada pelo proxy Nginx em `127.0.0.1`. | Opcional; padrão `8080`. | `.env` |
| `APP_ORIGIN` | Origem única do CRM no navegador. A API compara `Origin`/`Referer` das mutações com ela (CSRF) e não libera CORS. Deve coincidir exatamente com a URL usada, inclusive porta (`http://127.0.0.1:${APP_PORT}`). | Obrigatória no Compose. Fora dele, a API usa `http://localhost:3000` se estiver ausente. | `.env`; shell ao rodar a API fora do Compose |
| `DB_OWNER_PASSWORD` | Senha da role dona do schema (`pacaembu_owner`), usada pelo PostgreSQL e pelos serviços `migrate` e `seed`. | Obrigatória no Compose. Use hex (`openssl rand -hex 32`), pois entra na URL. O PostgreSQL só a aplica ao criar o volume. | `.env` |
| `DB_APP_PASSWORD` | Senha da role da aplicação (`pacaembu_app`, sem DDL), criada por `infra/compose/init-dev.sh` e usada pela API. | Obrigatória no Compose; também em hex. É lida só na criação do volume: trocar depois exige recriar o volume. | `.env` |
| `SEED_SUPERVISOR_EMAIL`, `SEED_SUPERVISOR_PASSWORD`, `SEED_BROKER_EMAIL`, `SEED_BROKER_PASSWORD` | Usuários locais criados por `pnpm db:seed`. | Obrigatórias para o seed, que recusa valores vazios e e-mails sem `@`. Use e-mails sintéticos. | `.env`; shell ao rodar `pnpm db:seed` |
| `DATABASE_URL` | URL PostgreSQL usada pela API (readiness incluída), `pnpm db:migrate`, `pnpm db:seed` e `pnpm db:maintenance`. Migrate e seed usam a role owner; a API usa a role da aplicação. | Obrigatória para esses comandos e para a API. | Montada pelo Compose; shell/CI fora dele |
| `NODE_ENV` | `development`, `test` ou `local` (ou ausente) **omitem o atributo `Secure` do cookie** `crm_session`; qualquer outro valor, como `production`, o inclui, e o cookie só volta por HTTPS. `pnpm db:seed` só roda com `development` ou `test`, e com `test` exige banco terminado em `_test`. Com `test`, a API não escreve logs. | Os Dockerfiles definem `production`; o Compose sobrescreve para `development` na API e no seed, porque o proxy local serve HTTP. Os testes usam `test`. | Compose, Dockerfiles, CI, shell |
| `API_HOST` | Interface em que a API escuta. | Padrão `127.0.0.1`; `0.0.0.0` somente dentro do container. | Dockerfile/Compose; shell |
| `API_PORT` | Porta da API. | Padrão `3001`. | Dockerfile/Compose; shell |
| `DB_POOL_MAX` | Tamanho do pool PostgreSQL da API. O executor do Agent reserva uma conexão para o lock e precisa de outra para trabalhar. | Padrão `10`; precisa ser inteiro `>= 2`, ou a API não inicia (`Agent executor requires DB_POOL_MAX >= 2`). | Shell/ambiente da API |
| `DATABASE_URL_TEST` | Banco dos testes de integração e E2E, com a role da aplicação. | Obrigatória para `pnpm test`, `pnpm test:integration` e `pnpm test:e2e`. O nome do banco precisa terminar em `_test`. | Shell/CI |
| `DATABASE_URL_TEST_OWNER` | Mesmo banco com a role owner, usada pelo harness para criar e remover um schema por teste. | Obrigatória junto com `DATABASE_URL_TEST`. | Shell/CI |
| `E2E_WEB_URL` | URL do `next start` iniciado pelo Playwright e usado pelo proxy de teste. | Padrão `http://127.0.0.1:3100`. | Shell |
| `E2E_WORKERS` | Número de workers do Playwright. Cada teste abre um harness com pool próprio no banco de testes. | Padrão `3`. | Shell |
| `CI` | Quando definida, o Playwright falha se houver `test.only`. | Definida pelo runner de CI. | CI |
| `PLAYWRIGHT_BROWSERS_PATH` | Diretório dos browsers do Playwright, lido pelo próprio Playwright. | Opcional; padrão é o cache do usuário. | Shell |

O smoke `pnpm test:e2e:compose` não lê o seu `.env`: ele gera um `.env` temporário com senhas aleatórias, porta livre e projeto Compose próprios, e remove o projeto e o volume no final.

## Testes

Os testes de integração e E2E usam PostgreSQL real. Para um banco local descartável:

```sh
docker compose -f infra/compose/compose.test.yaml up -d --wait
export NODE_ENV=test
export DATABASE_URL=postgresql://pacaembu_owner:pacaembu_owner@127.0.0.1:55432/pacaembu_test
export DATABASE_URL_TEST=postgresql://pacaembu_app:pacaembu_app@127.0.0.1:55432/pacaembu_test
export DATABASE_URL_TEST_OWNER=postgresql://pacaembu_owner:pacaembu_owner@127.0.0.1:55432/pacaembu_test
pnpm db:migrate
pnpm test
```

As senhas acima são sintéticas e valem só para esse banco em loopback. `pnpm test` falha se `DATABASE_URL_TEST` não estiver definido ou se o PostgreSQL não responder.

Os E2E precisam do build do Web e de um Chromium do Playwright:

```sh
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`playwright install chromium` baixa apenas o browser para o cache do usuário, ou para `PLAYWRIGHT_BROWSERS_PATH`, sem privilégios. Se faltarem bibliotecas do sistema, **não** rode `playwright install --with-deps` na sua máquina ou em um host compartilhado: essa opção executa `apt` como root e instala ou atualiza pacotes do sistema operacional. Deixe `--with-deps` para o CI, que usa runner efêmero, ou para um container descartável. Em outro ambiente, instale as dependências de sistema apenas por decisão explícita de quem administra o host.

`pnpm test:e2e:compose` exige Docker com Compose, constrói as imagens e sobe a pilha completa em um projeto isolado.

## Comandos úteis

```sh
docker compose --env-file .env -f infra/compose/compose.yaml ps
docker compose --env-file .env -f infra/compose/compose.yaml logs --tail=100 api web proxy
docker compose --env-file .env -f infra/compose/compose.yaml stop
docker compose --env-file .env -f infra/compose/compose.yaml run --rm migrate pnpm db:maintenance
pnpm install --frozen-lockfile
pnpm format:check && pnpm lint && pnpm typecheck
pnpm test && pnpm build && pnpm test:e2e
```

Os logs de aplicação ocultam cookie, token e senha. Não compartilhe o arquivo `.env` ou a saída de `docker compose config` sem revisão. `GET /api/health/live` confirma que o processo responde; `GET /api/health/ready` confirma conexão com o banco e a migration final. O comando de manutenção acima expira sessões, registros de idempotência e eventos de runs terminados conforme as janelas do contrato.

O runner de integração cria um schema exclusivo por teste e o remove ao concluir. Use roles diferentes para a aplicação e para o dono do schema, como faz `infra/compose/compose.test.yaml`.

O proxy de desenvolvimento fora do Compose deve encaminhar `/api/` para a API e as demais rotas para o Web sob um único `APP_ORIGIN`; a API não libera CORS arbitrário. O contrato HTTP está em `docs/api/openapi.yaml`. O escopo e os limites deste ciclo estão em `docs/superpowers/specs/2026-09-22-crm-vertical-slice-design.md` e `docs/product-mvp.md`.
