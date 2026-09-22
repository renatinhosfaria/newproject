# CRM Pacaembu — Implementation Plan do ciclo preparatório

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar login → lead → conversa → Atendimento simulado → rascunho persistido e auditado, com isolamento verificável por workspace e corretor.

**Architecture:** Monorepo pnpm com Next.js em `apps/web`, NestJS/Fastify em `apps/api` e Zod em `packages/contracts`. PostgreSQL guarda domínio, sessões, execuções, eventos e idempotência; o MockHermesAdapter executa dentro da API. Um proxy mantém JSON, cookies e SSE na mesma origem; Redis sobe como serviço auxiliar sem assumir a durabilidade do fluxo.

**Tech Stack:** TypeScript, React/Next.js, CSS variables/CSS Modules, NestJS/Fastify, Zod, Drizzle/SQL, PostgreSQL, Redis, Docker Compose, Vitest, Supertest e Playwright.

**Spec:** [Spec aprovada em 22/09/2026](../specs/2026-09-22-crm-vertical-slice-design.md), revisão Git `85b7bdc`.

## Global Constraints

- “Este documento descreve um ciclo preparatório; ele não conclui o MVP definido em `docs/product-mvp.md`.”
- “`workspace_memberships` é a única fonte do papel do usuário. `users` não possui `role`.”
- “Não haverá `apps/orchestrator` neste ciclo.”
- “A constraint `unique(run_id, sequence)` garante ordenação sem duplicidade.”
- “O endpoint SSE envia `id: <run_id>:<sequence>`, `event`, `data` e heartbeat a cada 15 segundos”.
- “Repetir a chave com outro hash retorna `409 IDEMPOTENCY_KEY_REUSED`.”
- “O adapter será determinístico e não fará chamadas a modelo ou rede.”
- Capacidades: `crm.lead.read`, `crm.conversation.read`, `crm.message.draft`; apenas Atendimento habilitado.
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` fora do ambiente local; idempotência por 24 horas; replay SSE por sete dias.
- Resultado do Agent: `type: draft | error`, `requires_approval: false`; nenhuma ação de envio implementada.
- Sem outbox, pairing, WhatsApp real, cadastro/suspensão administrativa, MinIO, MFA, IdP ou carga de 20 corretores.
- UI em português, tokens de `docs/DESIGN.md`, exemplos e fixtures sintéticos. Não acessar instalações, credenciais ou sessões Hermes/Brain existentes no host.

## Review Focus

1. Dois POSTs simultâneos com a mesma chave devem criar um único efeito; queda entre a transação e o início do mock não pode deixar uma execução sem resolução. Testes nas tarefas 4 e 6.
2. Uma sessão já autenticada perde acesso quando sua membership, workspace ou broker é suspenso, inclusive durante SSE e replay de resposta idempotente. Testes nas tarefas 3, 4 e 7.
3. Cursor SSE de outra sessão, cursor expirado e eventos criados durante a reconexão devem produzir resposta segura sem perda de eventos. Testes nas tarefas 7 e 8.
4. `lead_id` e `conversation_id` válidos individualmente podem pertencer a leads diferentes do mesmo corretor; a combinação deve ser recusada. Testes nas tarefas 2 e 6.
5. Supervisor sem `broker_id`, login com múltiplos workspaces e falha de geração precisam de um estado de interface utilizável, preservando o histórico. Testes nas tarefas 3, 6 e 8.

---

## Estado verificado e limites desta entrega de planejamento

Em 22/09/2026, o checkout `/root/pacaembu/newproject` está em `main`, commit `85b7bdc`, dois commits locais à frente de `origin/main`, sem modificações. Só há documentação; nenhum comando de build ou teste de aplicação existe. O host oferece Node `v26.7.0`; `pnpm`, `corepack`, `docker` e `docker compose` não foram encontrados. Isso não impede escrever o plano, mas impede afirmar que a aplicação foi executada.

A implementação começa após revisão deste plano. Usar ambiente de desenvolvimento isolado com Node `24.21.0` e pnpm `11.27.1`; manter o Node global e serviços de produção do host. Node 24 consta como LTS na [fonte oficial](https://nodejs.org/en/about/previous-releases), e a versão do pnpm fica registrada no `packageManager` do workspace. Fixar imagens de serviço por digest na tarefa 9, conferindo cada digest com `docker buildx imagetools inspect` antes do commit; não usar tags flutuantes no resultado commitado. A preparação deve usar uma máquina de desenvolvimento/CI com Docker, ou instalação isolada/rootless quando viável, e registrar explicitamente qualquer verificação que não puder executar.

## Decisões de implementação que tornam a spec executável

Estas definições operacionalizam o recorte aprovado; não adicionam recursos de produto.

| Tema | Decisão e consequência |
|---|---|
| Documentação vigente | Spec aprovada rege este ciclo. Tarefa 1 atualiza OpenAPI e identifica nos demais documentos requisitos do MVP posterior, preservando esse roadmap. Não adicionar rotas fora da lista aprovada por herança do OpenAPI antigo. |
| Membership ativa | FK garante identidade/workspace/usuário; status ativo é verificado pelo servidor no login e em cada requisição. Uma FK simples não expressa o predicado `status = active`. Não guardar papel confiável em cookie. |
| Usuário e membership | FK de sessão `(workspace_id, membership_id, user_id)` referencia membership `(workspace_id, id, user_id)`. Broker usa FK `(workspace_id, user_id)` para membership; guard exige papel `broker` e broker ativo. |
| Supervisor | Login, logout, identidade e catálogo são permitidos. Rotas de carteira e execução de Agent exigem papel `broker` neste ciclo. UI mostra o workspace e a indisponibilidade dos módulos de equipe, sem inventar um broker. |
| Contexto de conversa | Criação da sessão de Agent aceita contexto opcional. Se houver conversa, derivar seu lead; quando ambos forem informados, exigir igualdade. Sem conversa, resultado fica em `agent_runs`; com conversa, persistir uma nova mensagem outbound/draft. |
| Mensagens e execuções | Mensagem inbound do lead é evidência preservada e nunca vira resposta outbound. A falha da geração pertence a `agent_runs`; não alterar um rascunho já concluído para representar essa falha. O sucesso insere uma mensagem nova em `draft`. A transição de artefatos incompletos admite `received → processing → draft` e `draft → failed`; a enumeração de mensagem permanece a da spec. |
| Entrada do corretor | Guardar o prompt em `agent_runs.input_content` e exibir runs no detalhe da sessão; não fingir que o prompt privado do corretor é uma mensagem recebida do lead. |
| Cursor e múltiplas execuções | SSE em `/api/agent-sessions/{sessionId}/events` aceita query opcional `run_id`; sem ela, exige exatamente uma execução ativa. Cada conexão acompanha uma execução autorizada dessa sessão; `Last-Event-ID` deve referenciar o mesmo run. Não ordenar UUIDs para comparar runs. |
| Escopo da chave idempotente | `operation` é uma rota concreta, como `POST /api/agent-sessions/<uuid>/messages`; inclui assim o recurso. Manter a unicidade da spec `(workspace_id, user_id, operation, key)`, com hash do DTO normalizado. |
| Durabilidade do mock | Aceite 202, entrada do run, registro idempotente e auditoria são atômicos. Um executor dentro da API consome runs persistidos. Reinício resolve runs interrompidos com `failed/RUN_INTERRUPTED`; SSE desconectado não cancela processamento. |
| HMAC | Documentar os três headers reservados da spec na integração futura; nenhum receptor HMAC, credencial de serviço ou endpoint de eventos Hermes é implementado neste ciclo. |

As FKs compostas seguem o mecanismo de [constraints do PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html); verificações dinâmicas de status continuam na aplicação.

## Arquivos e dependências entre entregas

| Área | Caminhos e responsabilidade |
|---|---|
| Fundação | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `.node-version`, `.gitignore`, `.env.example`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc.json`. |
| Contratos | `packages/contracts/{package.json,tsconfig.json,src/index.ts}` e `src/{common,auth,crm,agents,events}.ts`; DTOs, enums e validação. |
| API | `apps/api/{package.json,tsconfig.json,src/main.ts,src/app.module.ts,src/app.ts}`; módulos por domínio em `src/{auth,crm,agents,audit,idempotency,db,http}`. |
| Persistência | `db/migrations/0001_identity.sql`, `0002_crm.sql`, `0003_agents.sql`, `0004_reliability.sql`; `db/{migrate,seed,maintenance}.ts`; `apps/api/src/db/{client,schema}.ts`. |
| UI | `apps/web/{package.json,tsconfig.json,next.config.ts}`, `src/app`, `src/components`, `src/lib`, `src/styles`. Componentes compartilhados locais; sem pacote UI vazio. |
| Testes | `tests/{helpers,contracts,unit,integration,e2e}`, `playwright.config.ts`; fixtures isoladas de seeds locais. |
| Operação local | `infra/compose/{compose.yaml,compose.test.yaml}`, `infra/reverse-proxy/nginx.conf`, `apps/{api,web}/Dockerfile`, `.github/workflows/ci.yml`, `README.md`. |

Dependências: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**. Após tarefa 1, UI pode preparar componentes, mas integrações e mudanças de contrato seguem essa ordem. Revisor pode rejeitar cada entrega por seus próprios testes. Setup fica na tarefa que precisa dele, não em commits vazios de scaffold.

## Comandos e suporte de teste a criar

Todos os comandos partem da raiz do repositório. Scripts definidos na tarefa 1 passam a apontar para implementações conforme surgem; não aceitar scripts que retornam sucesso sem checar nada.

| Script | Implementação |
|---|---|
| `pnpm format:check` | Prettier nos arquivos versionados suportados. |
| `pnpm lint` | ESLint em TS/TSX com regras React e TypeScript. |
| `pnpm typecheck` | `pnpm -r typecheck` em pacotes/apps existentes. |
| `pnpm test:unit` | `vitest run --project unit` em `tests/unit`. |
| `pnpm test:contract` | `vitest run --project contracts` e validação estrutural OpenAPI. |
| `pnpm test:integration` | `vitest run --project integration`, PostgreSQL real descartável. |
| `pnpm test` | Unitários, contratos e integração; ausência de banco é falha explícita, nunca skip silencioso. |
| `pnpm build` | Build contracts → API → Web na ordem das dependências. |
| `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:maintenance` | `tsx db/migrate.ts`, `tsx db/seed.ts`, `tsx db/maintenance.ts`. |
| `pnpm test:e2e` | `playwright test`, apenas dados/serviços de teste. |

Testes usam `tests/helpers/harness.ts`: `createHarness(options?: {mockScenario?: 'success' | 'unavailable'}): Promise<TestHarness>`. Retorna `http` (Supertest sobre o servidor Nest/Fastify), `db` (Drizzle), `pool` (pg), `clock` (ManualClock), `fixtures` e `close()`. Cada harness possui schema PostgreSQL exclusivo, executa migrations e seeds sintéticos e os remove no fechamento. `tests/helpers/fixtures.ts` expõe `brokerA`, `brokerB` (mesmo workspace), `brokerC` (outro workspace), `supervisor` e `multiWorkspace`, cada um com `userId`, `workspaceId`, `membershipId`, `brokerId: string | null`, `email` e `password` de teste. Conexões de teste exigem banco de nome terminado em `_test` e nunca reutilizam `DATABASE_URL` de operação.

`tests/helpers/clock.ts` define `ManualClock.now(): Date` e `advanceMs(ms: number): void`; `apps/api/src/clock.ts` define `Clock { now(): Date }` e `SystemClock`. Nenhuma fixture de falha é acionada por texto do lead ou parâmetro público. `tests/helpers/auth.ts` (tarefa 3) define `loginAs(h, actor): Promise<string>` retornando cookie via login real. `tests/helpers/runs.ts` (tarefa 6) define `waitForRun(h, runId, status): Promise<AgentRun>` com timeout finito e diagnóstico do último estado. Cada teste fecha seu harness; nenhuma expectativa depende de tempo de relógio arbitrário.

### Tarefa 1: Contratos do ciclo e workspace verificável

**Arquivos:** criar os arquivos de fundação e `packages/contracts` listados acima, `tests/contracts/{schemas,openapi}.test.ts`, `tests/unit/message-state.test.ts`. Modificar `docs/api/openapi.yaml`, `docs/{README,data-model,database-schema,architecture,integration-contract,authorization-matrix,agents-spec,testing-strategy}.md` e `docs/adr/002-stack-tecnologica.md` para distinguir ciclo atual do roadmap.

**Interfaces:** exportar `Problem`, `SessionUser`, `BrokerContext`, `Lead`, `CreateLeadRequest`, `UpdateLeadRequest`, `Conversation`, `CreateConversationRequest`, `Message`, `AgentSession`, `CreateAgentSessionRequest`, `AgentMessageRequest`, `AgentRun`, `AgentResult`, `AgentEvent`, schemas Zod de cada DTO e `canTransitionMessage`. Os tipos são inferidos dos schemas; exemplos abaixo fixam o vocabulário consumido pelas demais tarefas.

```ts
type BrokerContext = {
  user_id: string; workspace_id: string; membership_id: string;
  broker_id: string; role: 'broker'; request_id: string;
};
type AgentResult = {
  type: 'draft' | 'error'; content: string; citations: string[];
  proposed_actions: []; requires_approval: false;
  status: 'completed' | 'failed' | 'cancelled'; request_id: string;
};
type AgentRun = {
  run_id: string; session_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  input_content: string; result: AgentResult | null;
  error_code: string | null; created_at: string; updated_at: string;
};
```

- [ ] **1. Preparar apenas o runner e os testes de contrato.** Criar pnpm workspace e fixar dependências compatíveis no lockfile. Usar Node 24 isolado. Zod, Vitest, YAML parser, validador OpenAPI 3.1, TypeScript, ESLint e Prettier pertencem a esta entrega. Nest/Next entram nas tarefas consumidoras. `vitest.config.ts` declara projetos `unit`, `contracts`, `integration`; testes de integração só são invocados com banco pronto.
- [ ] **2. Escrever a evidência vermelha.** Criar os testes abaixo antes dos exports; adicionar também falha para entrada vazia e limites `name 2..160`, `content 1..12000`, `Idempotency-Key 16..128`, paginação `page >= 1`, `page_size <= 100` e UUID inválido. A primeira execução pode acusar módulo ausente; completar só os exports e observar asserção de comportamento antes da lógica.

```ts
import { expect, it } from 'vitest';
import { LoginRequestSchema, AgentResultSchema, canTransitionMessage } from '@pacaembu/contracts';
it('aceita contexto explícito de workspace sem aceitar papel do cliente', () => {
  const parsed = LoginRequestSchema.parse({
    email: 'teste@example.test', password: 'somente-teste',
    workspace_id: '00000000-0000-4000-8000-000000000001', role: 'admin',
  });
  expect(parsed).not.toHaveProperty('role');
});
it('não autoriza envio no resultado simulado', () => {
  expect(AgentResultSchema.safeParse({type: 'draft', content: 'Oi', citations: [],
    proposed_actions: [], requires_approval: true, status: 'completed', request_id: 'r1'}).success).toBe(false);
  expect(canTransitionMessage('draft', 'sent')).toBe(false);
});
```

- [ ] **3. Rodar `pnpm test:contract` e `pnpm test:unit`; registrar a falha do comportamento.** Não contar erro de instalação como evidência funcional.
- [ ] **4. Implementar DTOs e alinhar a documentação.** Remover campos de identidade extra do input via schemas, sem usá-los para autorização. Definir `Message.status = received | processing | draft | failed`; `canTransitionMessage` aceita somente `received → processing`, `processing → draft` e `draft → failed`, conforme a máquina ativa da spec; falha de execução do Agent sem mensagem não cria um estado de mensagem. `AgentSession` inclui `runs: AgentRun[]` no detalhe. Separar `PersistedAgentEvent`, com `workspace_id`, `broker_id`, `request_id`, `payload` e demais campos da tabela, de `AgentEvent`, DTO SSE com os mesmos campos de escopo e `data` como alias público do payload; ambos possuem `id: string`, `run_id`, `session_id`, `sequence: integer >= 1`, `type` e `occurred_at`.

```ts
export const LoginRequestSchema = z.object({
  email: z.string().email(), password: z.string().min(8).max(256),
  workspace_id: z.string().uuid().optional(),
});
const transitions: Record<string, readonly string[]> = {
  received: ['processing'], processing: ['draft'], draft: ['failed'], failed: [],
};
export function canTransitionMessage(from: string, to: string): boolean {
  return transitions[from]?.includes(to) ?? false;
}
```

OpenAPI mantém apenas as rotas da spec e documenta `GET events` com `run_id` opcional, Last-Event-ID, cookies, 201 de criação, 202 de execução, 204 logout, 401/403/404/409/410/422/429 e `Problem` (`type,title,status,code,request_id,retryable`). Não confundir DTO de resposta 202 com estado final de run. Operações sem corpo não aceitam mutação por GET. Prever `WORKSPACE_CONTEXT_REQUIRED`, `CSRF_ORIGIN_REQUIRED`, `CSRF_ORIGIN_INVALID`, `IDEMPOTENCY_KEY_REUSED`, `EVENT_REPLAY_UNAVAILABLE`, `INVALID_EVENT_CURSOR`, `HERMES_PROFILE_UNAVAILABLE`. HMAC aparece somente em seção futura do contrato de integração.
- [ ] **5. Rodar contratos, unitários e typecheck; revisar diff.** Comparar conjunto de métodos/paths, referências `$ref`, schemas/enums públicos e exemplos Zod/OpenAPI por testes sem snapshots integrais do documento. Commit sugerido: `feat: establish preparatory CRM contracts`.

### Tarefa 2: Banco real, invariantes de isolamento e fixtures

**Arquivos:** criar `db/migrations/0001_identity.sql`, `0002_crm.sql`, `0003_agents.sql`, `0004_reliability.sql`, `db/{migrate,seed,maintenance}.ts`, `apps/api/src/db/{client,schema}.ts`, `apps/api/src/{clock,app,app.module}.ts`, `apps/api/src/http/health.controller.ts`, `apps/api/{package.json,tsconfig.json}`, `tests/helpers/{harness,fixtures,clock}.ts`, `tests/integration/schema.test.ts`, `infra/compose/compose.test.yaml`.

**Interfaces:** `createApp(config: ApiConfig, deps?: {clock?: Clock}): Promise<NestFastifyApplication>` cria app sem `listen`; main será responsável pelo processo. `Db` é Drizzle sobre pg; `Tx = Parameters<Parameters<Db['transaction']>[0]>[0]`. `migrate(pool: Pool): Promise<void>` aplica SQL com histórico e lock de migration; `seed(db: Db, credentials: DevCredentials): Promise<void>` é idempotente e restrito a desenvolvimento/teste.

- [ ] **1. Preparar PostgreSQL de teste isolado e Nest/Fastify mínimo.** Compose usa serviço `postgres-test`, banco `pacaembu_test` e portas apenas loopback. Criar role owner para migrations e role app sem privilégios DDL. Vitest usa DI explícita via tokens `@Inject`, evitando depender de inferência de metadata do transpiler. Plugins HTTP devem ser equivalentes Fastify, conforme [documentação do Nest](https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/techniques/performance.md).
- [ ] **2. Escrever teste de mistura de carteiras antes das constraints.** `schema.test.ts` deve testar insert SQL direto, não apenas filtro da API. Testar também membership de usuário diferente, lead diferente na mesma carteira e tentativa de alterar auditoria como role app.

```ts
it('o próprio banco rejeita conversa ligada ao lead de outro broker', async () => {
  const h = await createHarness();
  try {
    const a = h.fixtures.brokerA;
    const b = h.fixtures.brokerB;
    const lead = await h.db.insert(schema.leads).values({
      workspace_id: b.workspaceId, broker_id: b.brokerId!, name: 'Lead B', stage: 'novo',
    }).returning();
    await expect(h.pool.query(
      'INSERT INTO conversations (workspace_id, broker_id, lead_id) VALUES ($1,$2,$3)',
      [a.workspaceId, a.brokerId, lead[0].id],
    )).rejects.toMatchObject({code: '23503'});
  } finally { await h.close(); }
});
```

- [ ] **3. Rodar `pnpm test:integration tests/integration/schema.test.ts` em banco limpo e confirmar a violação ainda aceita antes da constraint.** Estrutura mínima é permitida para alcançar o teste; não aceitar sucesso por erro de tabela ausente.
- [ ] **4. Criar as 16 tabelas da spec, tipos e invariantes.** UUIDs públicos, `timestamptz` UTC, JSONB somente para resultados/metadata, email `citext UNIQUE`, senha Argon2id e nenhum papel em users. Completar leads com `name, phone_normalized, email, source, stage, interest, next_action, assigned_at`; `phone_masked` é derivado na resposta apropriada. Nullable segue spec, demais campos obrigatórios com defaults explícitos.

```sql
ALTER TABLE workspace_memberships ADD UNIQUE (workspace_id, id, user_id);
ALTER TABLE auth_sessions ADD FOREIGN KEY (workspace_id, membership_id, user_id)
  REFERENCES workspace_memberships (workspace_id, id, user_id);
ALTER TABLE brokers ADD UNIQUE (workspace_id, id);
ALTER TABLE brokers ADD UNIQUE (workspace_id, id, user_id);
ALTER TABLE brokers ADD UNIQUE (workspace_id, user_id);
ALTER TABLE leads ADD UNIQUE (workspace_id, broker_id, id);
ALTER TABLE conversations ADD FOREIGN KEY (workspace_id, broker_id, lead_id)
  REFERENCES leads (workspace_id, broker_id, id);
ALTER TABLE conversations ADD UNIQUE (workspace_id, broker_id, id);
ALTER TABLE conversations ADD UNIQUE (workspace_id, broker_id, id, lead_id);
ALTER TABLE agent_sessions ADD UNIQUE (workspace_id, broker_id, id);
ALTER TABLE agent_sessions ADD FOREIGN KEY (workspace_id, broker_id, lead_id)
  REFERENCES leads (workspace_id, broker_id, id);
ALTER TABLE agent_sessions ADD FOREIGN KEY (workspace_id, broker_id, conversation_id)
  REFERENCES conversations (workspace_id, broker_id, id);
ALTER TABLE agent_sessions ADD CHECK (conversation_id IS NULL OR lead_id IS NOT NULL);
```

Completar FKs de broker para membership, lead para broker, mensagem para conversa, sessão de Agent para broker+usuário e agente habilitado no workspace. As duas FKs separadas de `agent_sessions` validam `lead_id` e `conversation_id` individualmente; o guard exige que, quando ambos existirem, a conversa pertença ao lead informado. Runs e eventos usam FKs compostas que incluem sessão/broker/workspace; acrescentar `agent_runs.input_content text`, `output_message_id uuid nullable`, `events_expire_at timestamptz`, índices para estado queued/running e `agent_events UNIQUE(run_id,sequence)`. `workspace_agents` é PK `(workspace_id,agent_id)`. Nenhuma constraint de status dinâmico é simulada por FK; guards validam disponibilidade.

`audit_events` contém `id, workspace_id, actor_user_id, broker_id nullable, event_type, resource_type, resource_id nullable, request_id, metadata_json, created_at`; role app recebe INSERT/SELECT, sem UPDATE/DELETE. `idempotency_records` inclui exatamente os campos da spec, com operação concreta e corpo/status obrigatórios apenas ao commit. Acrescentar índices de todas as FKs, replay `(run_id,sequence)`, listas `(workspace_id,broker_id,created_at,id)`, expiração e chave idempotente única.

Ativar RLS nas tabelas de negócio `brokers, leads, conversations, messages, agent_sessions, agent_runs, agent_events, workspace_agents` e `audit_events`. Policies usam `current_setting('app.workspace_id', true)` e, para dados de corretor, `current_setting('app.broker_id', true)`; o repositório abre uma transação escopada e executa `set_config(..., true)` antes da consulta. O role de migrations é owner e bypassa RLS; o role da API não é owner e não pode consultar linhas de negócio sem contexto. `auth_sessions`, `users`, `workspaces` e memberships são lidos pelo fluxo de autenticação antes de estabelecer o contexto e recebem filtros explícitos por sessão. Testar com o role da API um SELECT cruzado e um INSERT cruzado negados pelo banco, além do teste de FK.
- [ ] **5. Criar seed local separado de fixtures de teste.** Um workspace `America/Sao_Paulo`, supervisor, broker e Atendimento com três capacidades. Senhas vêm de ambiente, sem default utilizável, sem logs de credencial; `.env.example` só contém nomes e instrução de geração. Seed não sobrescreve senha existente e recusa produção. Fixtures contêm dois brokers no mesmo workspace, terceiro fora dele e um Agent `follow-up` desabilitado criado somente no harness de testes, não no seed operacional. Não criar conexões/perfis Hermes artificiais no SQL.
- [ ] **6. Rodar migrations duas vezes, seeds duas vezes e integração completa.** Verificar uma única versão aplicada/usuário por email, 16 tabelas de negócio (além do histórico técnico de migrations) e zero outbox/perfis reais. Commit sugerido: `feat: add scoped CRM persistence`.

### Tarefa 3: Autenticação, CSRF e autorização revogável

**Arquivos:** criar `apps/api/src/auth/{auth.module,auth.controller,auth.service,session.guard,policies,passwords,csrf,rate-limit}.ts`, `apps/api/src/http/{problem.filter,request-id}.ts`, `apps/api/src/audit/audit.service.ts`, `tests/helpers/auth.ts`, `tests/integration/{auth,csrf}.test.ts`, `tests/unit/policies.test.ts`.

**Interfaces:** `AuthService.login(input: LoginRequest): Promise<{token: string; user: SessionUser}>`; `resolveSession(token: string): Promise<SessionUser>`; `logout(token: string): Promise<void>`; `requireBroker(user: SessionUser, requestId: string): BrokerContext`. `SessionUser` contém usuário, membership, workspace, papel e broker nullable. `AuditService.append(tx: Tx, event: AuditInput): Promise<void>` usa a mesma transação da mutação; AuditInput corresponde aos campos públicos seguros definidos na tarefa 2.

- [ ] **1. Escrever testes com cookie real e suspensão no banco.** Incluir credenciais inválidas/usuário ausente com o mesmo erro, role adulterado, zero memberships, duas memberships sem contexto (409 após senha válida), workspace não pertencente ao usuário (403), supervisor sem broker, expiração e logout. `loginAs` faz POST de login com Origin permitido e guarda apenas o cookie de sessão no helper.

```ts
it('revalida membership mesmo com um cookie emitido antes da suspensão', async () => {
  const h = await createHarness();
  try {
    const actor = h.fixtures.brokerA;
    const cookie = await loginAs(h, actor);
    await h.pool.query('UPDATE workspace_memberships SET status=$1 WHERE id=$2',
      ['suspended', actor.membershipId]);
    const response = await h.http.get('/api/auth/me').set('Cookie', cookie);
    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('broker_id');
  } finally { await h.close(); }
});
```

- [ ] **2. Rodar integração auth/CSRF e unitários de policy; confirmar falhas antes dos guards.** Testar `Origin: null`, origem com sufixo malicioso e Referer com caminho válido. Caso Origin inválido e Referer válido continua negado.
- [ ] **3. Implementar sessão opaca e validação em toda requisição.** Token aleatório de 32 bytes no cookie; SHA-256 do token no banco, ID de linha separado. TTL inicial 8 horas; validar sessão, membership, usuário, workspace e broker ativos. Seleção multi-workspace retorna opções somente depois da senha validada; UI pode repetir login com o ID escolhido sem persistir a senha. Nenhum token em localStorage. Guard rejeita carteiras para supervisor com 403, recurso fora da carteira com 404.

```ts
export function assertBrowserOrigin(headers: Record<string, string | undefined>, allowed: string) {
  const origin = headers.origin;
  const candidate = origin !== undefined ? origin : headers.referer;
  if (!candidate) throw problem(403, 'CSRF_ORIGIN_REQUIRED');
  try {
    if (new URL(candidate).origin === allowed && candidate !== 'null') return;
  } catch { /* resposta uniforme abaixo */ }
  throw problem(403, 'CSRF_ORIGIN_INVALID');
}
```

`problem(status,code)` será exportado por `problem.filter.ts` como erro de domínio traduzido para Problem; nunca retorna stack. Aplicar CSRF a todos POST/PATCH/DELETE baseados em cookie, inclusive login/logout, sem tentar inferir navegador por User-Agent. Cookie `Path=/`, sem Domain, `Cache-Control: no-store`; logout revoga a linha e expira cookie. Login limita 10 tentativas/15 minutos por IP+email normalizado e 100/IP/15 minutos na API única deste ciclo; testes usam relógio controlado. Redação de cookie/password/token em logger.
- [ ] **4. Implementar auditoria.** Login bem-sucedido e logout são auditados; falha registra código/contador, sem senha ou dados de outra conta. `AuditService` recebe somente metadata allowlisted. Rate limit retorna 429 e Retry-After. Testar cookie Secure em configuração não local sem fazer deploy.
- [ ] **5. Rodar auth, CSRF e políticas, typecheck e testes acumulados.** Confirmar que suspensão de usuário/workspace/broker invalida sessões existentes, mesmo sem endpoint administrativo. Commit sugerido: `feat: add membership-bound CRM sessions`.

### Tarefa 4: Idempotência transacional para operações locais

**Arquivos:** criar `apps/api/src/idempotency/{idempotency.service,canonical-json}.ts`, `tests/integration/idempotency.test.ts`, `tests/unit/canonical-json.test.ts`; completar `db/maintenance.ts` para expiração.

**Interfaces:** `IdempotencyService.execute<T>(scope: BrokerContext, operation: string, key: string, input: unknown, perform: (tx: Tx) => Promise<{status: number; body: T}>): Promise<{status: number; body: T}>`. O chamador autentica e autoriza o recurso antes de consultar uma resposta guardada; transação do callback não faz rede.

- [ ] **1. Escrever teste concorrente sobre banco real.** Duas chamadas do serviço usam transações distintas, fazem INSERT de conversa e retornam o mesmo ID; não medir apenas chamadas de um mock. Cobrir chave igual em recursos diferentes, corpo diferente, ordem diferente das propriedades, expiração e suspensão antes de replay.

```ts
it('duas chamadas concorrentes produzem uma conversa', async () => {
  const results = await Promise.all([
    service.execute(context, 'POST /api/conversations', key, input, createConversation),
    service.execute(context, 'POST /api/conversations', key, input, createConversation),
  ]);
  expect(results[0]).toEqual(results[1]);
  const persisted = await h.pool.query('SELECT count(*)::int AS n FROM conversations WHERE lead_id=$1', [input.lead_id]);
  expect(persisted.rows[0].n).toBe(1);
});
```

Neste teste, `context` é derivado da fixture brokerA, `input.lead_id` é lead sintético criado em beforeEach, `key = 'conversation-test-key-001'`, `service` é provider Nest e `createConversation(tx)` usa Drizzle para INSERT real/201, como definido na tarefa 5. Variáveis não são dependências externas ao harness.
- [ ] **2. Executar teste e verificar que falha por duplicidade antes do lock/constraint.** Não usar replay em cache de memória para fazer o teste passar.
- [ ] **3. Implementar execução transacional e resposta persistida.** Canonicalizar JSON do DTO validado ordenando chaves recursivamente, mantendo ordem de arrays. Hash inclui operação concreta e DTO; headers de origem/cookie ficam fora. `pg_advisory_xact_lock` sobre hash da identidade da chave serializa o ciclo select/insert; a constraint única continua sendo a garantia final. O teste de recursos diferentes deve usar explicitamente uma rota concreta com ID no `operation` quando a chave puder ser reutilizada por dois recursos; com a mesma `operation` e a mesma chave, recursos diferentes conflitam por desenho.

```text
BEGIN
  adquirir lock transacional de (workspace_id,user_id,operation,key)
  remover apenas registro expirado dessa identidade
  registro existente e hash diferente → rollback + 409
  registro existente e hash igual → retornar resposta já persistida
  executar mutação local + auditoria
  inserir idempotency_records com resposta e expires_at = now + 24 horas
COMMIT
```

Manter corpo original e request_id original em replay, com autenticação atual. Se a transação falhar, nenhuma resposta de sucesso ou efeito fica guardado. Quando há 202, registrar o run queued, nunca esperar execução do Agent dentro da transação.
- [ ] **4. Rodar teste concorrente e replay após suspensão, incluindo rollback entre efeito e registro.** Job `db:maintenance` remove registros expirados; limpeza é limitada a dados do próprio CRM. Commit sugerido: `feat: persist idempotent CRM operations`.

### Tarefa 5: Leads, conversas e histórico autorizado

**Arquivos:** criar `apps/api/src/crm/{crm.module,leads.controller,leads.service,conversations.controller,conversations.service,message-state}.ts`, `tests/integration/{leads,conversations}.test.ts`, completar `tests/unit/message-state.test.ts`.

**Interfaces:** `LeadsService.create(ctx, input): Promise<Lead>`, `list(ctx, query): Promise<LeadPage>`, `get(ctx,id): Promise<Lead>`, `update(ctx,id,input): Promise<Lead>`; `ConversationsService.create(ctx,input,key): Promise<Conversation>`, `list(ctx,query): Promise<ConversationPage>`, `get(ctx,id): Promise<Conversation>`, `messages(ctx,id,query): Promise<MessagePage>`. Query é `{page:number,page_size:number,search?:string,stage?:LeadStage}` com schemas da tarefa 1; `LeadPage/ConversationPage/MessagePage` são `{items,page:{page,page_size,total}}`.

- [ ] **1. Escrever testes HTTP de isolamento.** Criar lead do brokerA pelo POST; brokerB (mesmo workspace) e brokerC (outro) recebem 404 no GET/PATCH/conversa/mensagens. Listas não podem incluir linhas externas. Enviar broker_id e workspace_id falsos no body resulta em descarte dos campos e escopo da sessão.

```ts
it('PATCH não aceita trocar o dono do lead', async () => {
  const cookie = await loginAs(h, h.fixtures.brokerA);
  const created = await h.http.post('/api/leads').set('Cookie', cookie)
    .set('Origin', h.origin).send({name: 'Maria de teste'});
  const changed = await h.http.patch(`/api/leads/${created.body.id}`).set('Cookie', cookie)
    .set('Origin', h.origin).send({name: 'Maria atualizada', broker_id: h.fixtures.brokerB.brokerId});
  expect(changed.status).toBe(200);
  expect(changed.body.broker_id).toBe(h.fixtures.brokerA.brokerId);
});
```

`TestHarness.origin` é `http://localhost:3000`, configurada no helper da tarefa 2. Arquivos HTTP importam beforeEach/afterEach Vitest para abrir/fechar o harness e não compartilham cookie entre usuários.
- [ ] **2. Rodar testes e confirmar falhas com carteiras cruzadas antes dos filtros.** Cobrir input inválido 422, UUID inexistente 404, paginação limitada e busca com caracteres SQL tratada como valor.
- [ ] **3. Implementar CRUD limitado da spec.** Todas consultas incluem workspace+broker. Usar `libphonenumber-js` com região padrão `BR`: aceitar números internacionais válidos quando o país estiver explícito, armazenar o valor normalizado em E.164, preservar null e rejeitar número inválido com 422; sem requisito de unicidade de telefone inventado. Usar parâmetros SQL/Drizzle, não interpolação. Ordenação estável por created_at/id, etapa controlada, resposta de contato só do dono. Não implementar DELETE, exportação, dashboard ou mensagens enviadas.

```ts
const predicate = and(
  eq(leads.workspace_id, ctx.workspace_id),
  eq(leads.broker_id, ctx.broker_id),
  eq(leads.id, leadId),
);
```

Criação de conversa exige lead autorizado, key idempotente e transação com `conversation.created`; sem WhatsApp connection FK neste ciclo. Auditoria `lead.created`, `lead.updated` inclui IDs/campos alterados, não conteúdo de contato integral. Mensagens iniciais recebidas só aparecem em fixtures sintéticas; o usuário cria conversa vazia e poderá obter rascunho pelo Agent.
- [ ] **4. Rodar GET/POST/PATCH, paginação, transições inválidas e replay HTTP da criação de conversa.** Comparar respostas com schemas e confirmar persistência ao reiniciar a app no mesmo schema. Commit sugerido: `feat: add isolated leads and conversations`.

### Tarefa 6: Agent simulado, execução durável e rascunhos

**Arquivos:** criar `apps/api/src/agents/{agents.module,agents.controller,agents.service,hermes.port,mock-hermes.adapter,tools,run-executor,run-events}.ts`, `tests/integration/agents.test.ts`, `tests/unit/mock-hermes.test.ts`, `tests/helpers/runs.ts`; completar queries de runs em `schema.ts`.

**Interfaces:** `AgentsService.catalog(user): Promise<Agent[]>`, `createSession(ctx,input,key): Promise<AgentSession>`, `session(ctx,id): Promise<AgentSession>`, `send(ctx,sessionId,input,key): Promise<AgentRun>`. `AgentSession` detalhe carrega runs/inputs/resultados em ordem; IDs internos de provedor nunca são autorização. Porta tipada:

```ts
type RunContext = BrokerContext & {
  run_id: string; agent_id: string; agent_session_id: string;
  lead_id?: string; conversation_id?: string; permissions: Capability[];
};
type AgentInput = { content: string };
interface HermesPort {
  startAgentRun(context: RunContext, input: AgentInput): Promise<{status: 'running'}>;
  streamAgentEvents(runId: string, afterSequence: number): AsyncIterable<AdapterEvent>;
  stopAgentRun(runId: string): Promise<'cancelled'>;
}
```

`Capability` é união das três strings aprovadas. `AdapterEvent` é união `{sequence,type:'agent.run.started'}`, `{sequence,type:'agent.tool.called',tool:Capability}`, `{sequence,type:'agent.output.created',result:AgentResult}`, `{sequence,type:'agent.run.completed'}` e `{sequence,type:'agent.run.failed',code:string}`. RunContext e porta ficam em `hermes.port.ts`; a API cria `run_id`, passa esse valor ao adapter e mantém o mesmo ID em runs e eventos; o adapter não gera outro. Porta recebe `Tools` autorizado por injeção no start: definir `Tools.readLead(ctx,id): Promise<Lead>`, `readConversation(ctx,id): Promise<{conversation:Conversation,messages:Message[]}>`, `validateDraft(ctx,text): Promise<AgentResult>` em `tools.ts`; o adapter usa os mesmos guards/serviços reais do CRM, nunca banco irrestrito. Negações ficam somente em auditoria `agent.tool.denied`, sem novo tipo de evento de execução.

- [ ] **1. Escrever testes do ciclo completo, IDs conflitantes e capacidade negada.** Criar conversa e sessão via HTTP; enviar tarefa e aguardar run persistido. Duas requisições simultâneas com a mesma key retornam o mesmo run; uma chave diferente cria um novo run e ambos conservam IDs distintos. Fixtures de falha são injetadas pelo harness, sem trigger no prompt.

```ts
it('falha do adapter preserva sessão, entrada e histórico', async () => {
  const h = await createHarness({mockScenario: 'unavailable'});
  try {
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const session = await h.http.post('/api/agent-sessions').set('Cookie', cookie)
      .set('Origin', h.origin).set('Idempotency-Key', 'create-session-001')
      .send({agent_id: 'atendimento'});
    const accepted = await h.http.post(`/api/agent-sessions/${session.body.id}/messages`)
      .set('Cookie', cookie).set('Origin', h.origin).set('Idempotency-Key', 'send-agent-input-001')
      .send({content: 'Prepare um primeiro contato'});
    expect(accepted.status).toBe(202);
    const run = await waitForRun(h, accepted.body.run_id, 'failed');
    expect(run.input_content).toBe('Prepare um primeiro contato');
    const stored = await h.http.get(`/api/agent-sessions/${session.body.id}`).set('Cookie', cookie);
    expect(stored.status).toBe(200);
    expect(stored.body.runs[0].error_code).toBe('HERMES_PROFILE_UNAVAILABLE');
  } finally { await h.close(); }
});
```

- [ ] **2. Rodar testes Agents/mock e verificar falhas antes de implementar executor.** Adicionar lead A + conversa B do mesmo broker → 422; ID de outro broker → 404; agente disabled → 403; supervisor → 403. Texto pedindo autorização não pode mudar RunContext.
- [ ] **3. Implementar adapter determinístico e capacidades.** Mock lê contexto permitido via ferramentas e produz texto fixo contextual, marcado como simulado; não inventa condições comerciais. Catálogo só retorna Atendimento habilitado. UUID interno do Agent mapeia `key=atendimento` da API. Estado ativo do catálogo/capacidades é revalidado ao iniciar execução e antes de escrever resultado.

```ts
const result: AgentResult = {
  type: 'draft', content: 'Olá! Posso ajudar a esclarecer suas dúvidas sobre o imóvel?',
  citations: [], proposed_actions: [], requires_approval: false,
  status: 'completed', request_id: ctx.request_id,
};
```

Auditar chamadas e negações de ferramenta, sem retorno bruto ou prompt. Capacidade ausente retorna erro de domínio e registro `agent.tool.denied` na auditoria, não muda a sessão. Resultados incompletos nunca são apresentados como draft final.
- [ ] **4. Implementar aceite e execução com persistência.** Em uma transação: run queued, input, resposta 202 idempotente e auditoria. Executor único desta API reivindica runs queued com lock transacional; múltiplos runs podem executar na mesma sessão e somente a chave idempotente deduplica uma intenção repetida. Não manter transação aberta durante stream. Persistir cada evento e status; índice único parcial em `output_message_id` não nulo impede duplicar rascunho. Sucesso grava mensagem+resultado+evento terminal+auditoria atomicamente; sem conversa, apenas resultado do run.
- [ ] **5. Testar reinício e falhas entre commits.** Aceitar run sem iniciar adapter, reiniciar API e observar conclusão. Reiniciar após running: registrar `RUN_INTERRUPTED`, preservar input e encerrar com evento failed sem produzir segundo rascunho. Em shutdown usar `stopAgentRun` e marcar `cancelled` com resultado error/código cancelado, sem endpoint público de cancelamento. Nova tentativa é nova key/run; retry de key antiga repete o mesmo 202 original.
- [ ] **6. Rodar suíte acumulada, validar auditoria e ausência de secrets em resultado/logs.** `agent.run.started`, `agent.tool.called`, `agent.output.created`, `agent.run.failed`, sessão e terminais são persistidos. Commit sugerido: `feat: add durable mock agent runs`.

### Tarefa 7: SSE autorizado com replay e retenção

**Arquivos:** criar `apps/api/src/agents/{events.controller,event-store,sse}.ts`, `tests/integration/sse.test.ts`, `tests/unit/event-cursor.test.ts`; completar `db/maintenance.ts`.

**Interfaces:** `parseEventCursor(value: string): {runId:string,sequence:number}`; `EventStore.after(ctx,sessionId,runId,sequence): Promise<AgentEvent[]>`; `authorizeStream(user,sessionId,runId): Promise<void>`. A fonte do replay é PostgreSQL; stream do adapter alimenta banco pelo executor e não é consumido diretamente por navegador.

- [ ] **1. Escrever testes com socket HTTP real e fetch streaming.** Harness inicia listener em porta efêmera e helper `tests/helpers/sse.ts` oferece `readSse(url,headers,{until,signal}): Promise<AgentEvent[]>`, limitado por AbortSignal. Parser divide frames em `\n\n`, trata CRLF, data multilinha e comentários; não esperar `.json()` de stream aberto.

```ts
const replay = await readSse(urlWithRunId, {
  Cookie: cookie, 'Last-Event-ID': `${runId}:2`,
}, {until: e => e.type === 'agent.run.completed', signal: AbortSignal.timeout(5000)});
expect(replay.every(e => e.sequence > 2)).toBe(true);
expect(new Set(replay.map(e => e.id)).size).toBe(replay.length);
```

Setup do teste cria run de sucesso pelo fluxo da tarefa 6, espera terminal e define `urlWithRunId` com sessão/run retornados. Adicionar teste em que novo evento é persistido durante replay; nenhuma transição entre replay/live pode perder esse evento.
- [ ] **2. Rodar testes e confirmar falha de replay/isolamento antes do event store.** Cursor malformado/futuro → 422; run fora de escopo → 404; cursor válido de outro run dessa sessão → 422. Autorização precede consulta de retenção, evitando revelar run de outra carteira.
- [ ] **3. Implementar sequência e framing.** Sequence é atribuída pelo banco sob lock de run e incrementada de modo transacional, começando em 1. Emitir somente eventos commitados e em ordem. Fazer polling PostgreSQL com cursor a cada 250ms durante stream local; isso evita janela entre inscrição em memória e leitura do banco. Encerrar polling e heartbeat ao desconectar. A stream da [API Nest](https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/techniques/server-sent-events.md) requer descarte de recursos na desconexão; usar resposta Fastify controlada para validar 401/404/410 antes de enviar headers SSE.

```ts
export function frameEvent(event: AgentEvent): string {
  return `id: ${event.run_id}:${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
```

Headers `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; heartbeat `: heartbeat\n\n` a cada 15s. Terminais completed/failed/cancelled fecham conexão após envio; cliente não reconecta após terminal. Run já terminal com cursor no último evento abre uma resposta 200 sem replay e fecha imediatamente. Sem cursor começa no evento 1.
- [ ] **4. Implementar retenção e autorização contínua.** Eventos expiram sete dias após término do run (`events_expire_at`); job remove somente eventos de runs terminados vencidos, preservando run/resultado/input para histórico. Pedido com cursor desse run → 410; UI usa GET sessão para recuperar resultado. Revalidar sessão/membership/broker antes de cada lote e heartbeat; revogação fecha stream sem novos dados. Cursor de run com dados retidos não é autorizado automaticamente.
- [ ] **5. Rodar testes de expiração por ManualClock, eventos concorrentes, revogação e limpeza de timers.** Teste do heartbeat usa relógio/timers controlados, não espera 15s reais. Commit sugerido: `feat: stream authorized agent events with replay`.

### Tarefa 8: Interface do fluxo completo em português

**Arquivos:** criar `apps/web/{package.json,tsconfig.json,next.config.ts}`, `src/app/{layout.tsx,page.tsx,login/page.tsx,leads/page.tsx,conversations/[id]/page.tsx,agents/[id]/page.tsx}`, `src/components/{app-shell,lead-form,conversation-view,agent-panel,ui}.tsx`, `src/components/ui.module.css`, `src/lib/{api,sse-client}.ts`, `src/styles/{tokens,globals}.css`, fontes locais licenciadas em `public/fonts/` com licença; `tests/unit/sse-client.test.ts`, `tests/e2e/{crm,auth,sse,accessibility}.spec.ts`, `playwright.config.ts`.

**Interfaces:** `api<T>(path:string, options?:RequestInit): Promise<T>` usa cookie same-origin e valida respostas com schemas no consumidor; `subscribeRun({sessionId,runId,lastEventId,onEvent,onExpired,signal}): Promise<void>` usa fetch/ReadableStream, pois a UI precisa interpretar 401/410 e enviar Last-Event-ID. Estado guardado em memória por run; GET sessão reidrata histórico após reload. Nunca inserir token em storage.

- [ ] **1. Escrever testes Playwright do resultado visível.** Entrar como broker sintético, criar lead, abrir conversa, criar sessão, pedir rascunho e recarregar: texto deve continuar no histórico. Testes usam banco/harness isolados e credenciais de fixtures, não conta real.

```ts
await page.getByLabel('E-mail').fill(actor.email);
await page.getByLabel('Senha').fill(actor.password);
await page.getByRole('button', {name: 'Entrar'}).click();
await page.getByRole('button', {name: 'Novo lead'}).click();
await page.getByLabel('Nome').fill('Pessoa de teste');
await page.getByRole('button', {name: 'Salvar lead'}).click();
await page.getByRole('link', {name: 'Pessoa de teste'}).click();
await page.getByRole('button', {name: 'Abrir conversa'}).click();
await page.getByRole('button', {name: 'Atendimento'}).click();
await page.getByLabel('Mensagem para o Agent').fill('Prepare uma apresentação');
await page.getByRole('button', {name: 'Gerar rascunho'}).click();
await expect(page.getByText('Rascunho não enviado', {exact: true})).toBeVisible();
await page.reload();
await expect(page.getByText('Prepare uma apresentação', {exact: true})).toBeVisible();
```

Fixture Playwright exporta `actor`/baseURL por teste, mantendo isolation. Nenhum seletor depende de detalhes CSS. Acrescentar supervisor, workspace-context-required, falha do mock, rejeição CSRF, logout e submissão duplicada sob reconexão.
- [ ] **2. Executar teste no esqueleto mínimo e registrar falha funcional.** Construir apenas rotas necessárias para chegar à asserção antes de implementar ações; nenhum teste de config espelhando JSX.
- [ ] **3. Implementar UI sobre API real.** Tokens: navy `#003D4C`, navy-2 `#002E3A`, blue-bright `#005568`, red `#E4002B`, red-bright `#C90027`, yellow `#FFB81C`, green `#2EB67D`, whatsapp `#00A811`, purple `#7564EE`, surface `#F7FAF9`, card `#FFFFFF`, line `#E5EBF3`, ink `#003D4C`, muted `#718097`. Fontes Dongle/Nunito Sans locais para build sem download. Breakpoints 1180/880/590px, espaçamento 4px, radius 8..18px; texto pequeno usa ink quando muted não satisfizer contraste. Aplicar estados vazio/loading/erro, foco visível, labels e alertas associados a campos.
- [ ] **4. Implementar ações e histórico.** Login multi-workspace mostra escolha após 409 autenticado; supervisor vê identidade/contexto e informação de módulos indisponíveis, sem tela de carteira vazia enganosa. Leads têm formulário criar/editar e navegação para conversa. Agent possui composer Enter/Shift+Enter, badge “Simulado”, indicação “Processando” e rascunho sem botão de envio/aprovação. Conteúdo externo como texto escapado, sem HTML interpretado. Gerar key no início da ação e reutilizá-la no retry de rede, criando nova somente para nova intenção.

```ts
const seen = new Set<string>();
function applyEvent(event: AgentEvent) {
  if (seen.has(event.id)) return;
  seen.add(event.id);
  onEvent(event);
}
```

`seen` é por assinatura de run; `onEvent` pertence ao subscriber. Parser lê frames mesmo fragmentados e UTF-8 com TextDecoder incremental. Backoff 1/2/4/8s até 10s, abort ao trocar sessão; 401 leva ao login, 410 recupera GET sessão e informa histórico, terminal para reconexão. Não confundir erro HTTP com ausência de resultado.
- [ ] **5. Rodar Playwright em 1280px/390px, teclado e reconexão com falha determinística.** Streaming e status usam `aria-live=polite`; mensagens de validação têm `aria-describedby`. Testes verificam conteúdo uma vez após replay e histórico após erro/reload. Commit sugerido: `feat: add CRM preparatory user flow`.

### Tarefa 9: Compose reproduzível, CI e evidência final

**Arquivos:** criar `apps/api/src/main.ts`, `apps/{api,web}/Dockerfile`, `.dockerignore`, `infra/compose/compose.yaml`, `infra/reverse-proxy/nginx.conf`, `.github/workflows/ci.yml`, `README.md`, `docs/validation/preparatory-cycle.md`; completar compose.test, scripts e `.env.example`.

**Interfaces:** `docker compose --env-file .env -f infra/compose/compose.yaml up --build --wait` disponibiliza UI/API na mesma origem loopback configurável. Serviços `postgres`, `redis`, `migrate`, `seed`, `api`, `web`, `proxy`; migrations precedem seed e app. `GET /api/health/live` indica processo vivo; `/api/health/ready` verifica banco/migrations, sem vazar URLs ou secrets. Redis preparado não é requisito para servir dados/SSE do ciclo.

- [ ] **1. Escrever smoke real e verificar falha antes da integração Compose.** Adicionar `tests/e2e/compose.spec.ts`: login real pela URL do proxy, criar lead e ler o mesmo lead após reiniciar API. Usar projeto Compose de testes próprio, sem tocar volumes do desenvolvedor. Healthcheck e SSE do proxy são parte da evidência, não só YAML válido.
- [ ] **2. Implementar imagens, rede interna e proxy.** Node 24 e dependências de lockfile, build contracts antes de apps. API usa `0.0.0.0` apenas na rede do container; somente proxy publica porta `127.0.0.1`. Não expor PostgreSQL/Redis fora do projeto. Nest/Fastify usa plugins próprios e redaction. Secrets via ambiente local ignorado pelo Git. Nginx encaminha `/api/` para API, resto para Web, sem buffering/cache em eventos.

```nginx
location /api/ {
  proxy_pass http://api:3001;
  proxy_http_version 1.1;
  proxy_set_header Host $http_host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 60s;
}
```

Next não faz proxy adicional da mesma rota. Origin/Referer originais são preservados. Em desenvolvimento sem Compose, declarar proxy equivalente e um único APP_ORIGIN, sem liberar CORS arbitrário para contornar CSRF.
- [ ] **3. Implementar pipeline CI e documentação de execução.** CI com Node 24/pnpm fixados, PostgreSQL de teste, instalação frozen, migrations, suite completa e Playwright contra build. Não iniciar testes de apps externos ou runtime Hermes. `README` define todas envs, geração local de credenciais, login de desenvolvimento por email (senha nunca commitada), fluxo, limites de mock, manutenção e comandos de logs sanitizados.
- [ ] **4. Executar a sequência de validação em ambiente com Docker.** Fixar `TEST_DATABASE_URL` isolada no runner antes de testes. Após cada falha, corrigir causa e repetir apenas checks afetados, depois suíte final. Não marcar testes ignorados como passados.

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
docker compose -f infra/compose/compose.test.yaml up -d --wait
pnpm test
pnpm build
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
docker compose --env-file .env -f infra/compose/compose.yaml config --quiet
git diff --check
```

- [ ] **5. Registrar evidência e revisar branch.** Em `docs/validation/preparatory-cycle.md`, registrar comandos realmente executados, ambiente, data, resultado, falhas e limitações. Conferir manualmente desktop/mobile, reset seguro somente do banco de teste e inexistência de chamadas a WhatsApp/modelo. Fazer revisão independente do conjunto após suíte verde. Commit sugerido: `chore: package and verify preparatory CRM cycle`; push/merge/deploy são etapas distintas e não pertencem a este plano.

## Matriz de cobertura da spec

| Requisito | Entrega | Evidência |
|---|---|---|
| Papéis só na membership; cookie e workspace | 2, 3, 8 | auth/CSRF + Playwright multi-workspace/supervisor |
| Carteiras, FKs e relações coerentes | 2, 5, 6 | INSERT cruzado e HTTP 404 no mesmo/outro workspace |
| Catálogo e três capacidades | 1, 2, 6 | catálogo disabled, tool denied e prompt sem autoridade |
| Conversa e rascunho persistidos | 5, 6, 8 | criação → run → mensagem nova; reload/reinício |
| Estados de mensagem e run | 1, 5, 6 | enum, transição inválida, terminal failed/cancelled |
| Idempotência e TTL 24h | 4, 5, 6 | concorrência real, replay, payload diferente e expiração |
| SSE ID composto, 15s, sete dias | 7, 8, 9 | cursor, retenção, heartbeat, proxy, reconnect |
| Auditoria e secrets | 2, 3, 5, 6 | role append-only, mutação atômica, redaction |
| Migrations/seeds em banco vazio | 2, 9 | instalação limpa, execução duplicada e CI |
| Mock determinístico e substituível | 6 | HermesPort, falha controlada, zero chamada externa |
| Interface/estados/acessibilidade | 8 | fluxo E2E, teclado, duas larguras e labels |
| Compose, Redis preparado, lock e CI | 1, 2, 9 | frozen install, health checks e smoke |
| Contrato atual versus MVP futuro | 1, 9 | OpenAPI limitado e roadmap mantido em docs |

## Auto-revisão do plano e passagem à execução

Antes de apresentar este plano: conferir a matriz acima contra cada seção da spec, consistência de nomes de DTOs/rotas/fixtures, comandos e links, ausência de etapas genéricas sem critério observável, e os cinco riscos de Review Focus cobertos nas tarefas indicadas. Esta revisão é do autor do plano; uma revisão independente de código ocorrerá durante a execução escolhida.

O plano oferece duas formas de execução: **na mesma sessão**, com um implementador acompanhando os contratos dependentes e revisão independente final; ou **por subagentes**, com revisão por entrega e revisão final do conjunto. A recomendação para estas nove tarefas é execução na mesma sessão, porque elas compartilham schema, DTOs e harness, com checkpoints de teste em cada entrega. A aprovação da spec autoriza escrever este plano; a escolha de execução e a revisão deste documento precedem alterações de código.
