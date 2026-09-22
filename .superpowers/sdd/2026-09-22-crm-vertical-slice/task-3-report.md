# Relatório da Tarefa 3 — fix round 1 concluído

## Resultado

Autenticação, CSRF e autorização revogável validados com PostgreSQL real e a role restrita `pacaembu_app`. Nenhuma alteração da Tarefa 4 foi incluída.

## Correções

- Cada `createHarness` cria um schema UUID exclusivo; app, pool e Drizzle usam esse schema sob `pacaembu_app`. A conexão owner faz somente migrations, fixtures e mudanças administrativas explícitas dos testes. `close()` fecha conexões e remove apenas o schema correspondente, inclusive em falha de setup.
- Migrations usam um cliente e transação com `search_path` fixado no schema confiável e `pg_temp` por último. A tabela de versões, grants, tipos e constraints ficam no schema correto. Não existe mais fila global de setup; apenas a instalação das extensões compartilhadas usa lock global curto. O lock de migrations é por schema.
- Guards SQL e `auth_broker_for_user` capturam esse path, mantendo RLS e o lookup `SECURITY DEFINER` restrito a id/status. `PUBLIC` não recebe execução do lookup. `0008_schema_scoped_auth.sql` atualiza instalações que já tinham aplicado 0001–0007, incluindo a permissão necessária de UPDATE em `auth_sessions`.
- Origem, ambiente e relógio são configurados por instância via DI, sem escrever em `process.env`. O relógio controlado alcança sessão, rate limiter e health.
- Todas as respostas `/api/auth/*`, inclusive falhas de guard, validação, CSRF e rate limit, recebem `Cache-Control: no-store`. Logout limpa o cookie mesmo quando a sessão está ausente ou inválida, preservando a validação de origem.
- Logger Fastify com redação de cookie, password, token e Authorization; testes capturam um stream real. `trustProxy: false` torna explícito que headers encaminhados não definem o IP do rate limiter.

## Cobertura

Integração cobre schema por harness, execução paralela, remoção independente, role sem superuser/bypass RLS, impossibilidade de criar tabelas pela app, lookup resistente a tabela temporária, grants de execução, migrations/seed repetíveis e atualização de instalação anterior.

Autenticação cobre credenciais ausentes/inválidas uniformes; zero memberships; opções multi-workspace apenas após senha correta; workspace alheio e role adulterada; supervisor sem broker; login real Argon2 de A/B/C; token opaco distinto e somente SHA-256 no banco; revogação por suspensão de usuário, membership, workspace e broker; expiração e logout; duas instâncias com origem/ambiente/relógio independentes; limites 10/IP+email e 100/IP, normalização e headers de IP forjados; auditoria de sucesso/falha/logout com código/contador sem segredos e metadata allowlisted; captura de logs redigidos. CSRF e políticas acumuladas continuam passando.

## Validação executada

Ambiente: Node 24.21.0, pnpm 11.27.1, PostgreSQL 18.4 exclusivo de teste em `127.0.0.1:55439/pacaembu_test`. URLs de app e owner configuradas separadamente. Nenhum outro serviço foi acessado.

- Regressões reproduzidas antes das correções: harness simultâneo retornava schema `public`; `/api/auth/me` sem sessão não retornava `no-store`.
- `pnpm test`: **7 arquivos, 40 testes passaram**, com arquivos de integração executados em paralelo.
- `vitest run --project integration`: **3 arquivos, 27 testes passaram**, incluindo atualização de instalação com migrations 0001–0007 previamente aplicadas.
- `tsc --noEmit` e `tsc -p apps/api/tsconfig.json --noEmit`: passaram.
- `eslint apps/api/src packages tests db vitest.config.ts`: passou.
- `pnpm format:check` e `git diff --check`: passaram.

## Limites mantidos

Rate limiter em memória é adequado à API única deste ciclo; várias instâncias exigirão storage compartilhado. Falhas para usuário desconhecido não criam auditoria persistente porque não há ator/workspace confiável no modelo atual; o erro público segue uniforme. Extensões PostgreSQL são compartilhadas em `public`, enquanto dados operacionais e conexões de cada harness ficam no seu schema exclusivo.
