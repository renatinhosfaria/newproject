# Task 5 Report: Leads, conversas e histórico autorizado

## RED

- Added HTTP integration coverage for leads and conversations before production CRM code:
  - broker A/B/C isolation for GET/PATCH/list/conversation/messages
  - client-supplied `broker_id`/`workspace_id` stripping
  - UUID/input validation, pagination, parameterized search with SQL wildcard characters
  - phone normalization with `libphonenumber-js` for BR/default, explicit international, invalid, and null values
  - idempotent conversation creation, replay, and key reuse conflict
  - supervisor 403, message history/draft reads, app restart on same schema
  - audit events in the same transaction without persisting contact content
- Added unit coverage for exact message DTO vocabularies.
- First targeted run:
  - `pnpm exec vitest run --project unit tests/unit/message-state.test.ts --project integration tests/integration/leads.test.ts tests/integration/conversations.test.ts`
  - Result: unit message-state passed; 10 integration tests failed before implementation. Failures showed missing harness `origin`/routes and validation behavior, matching the missing Task 5 feature.

## GREEN

- Implemented `CrmModule`, lead and conversation controllers/services, and message-state exports.
- Added shared page schemas: `LeadPageSchema`, `ConversationPageSchema`, `MessagePageSchema`.
- Added `TestHarness.origin` and `restartApp()` to verify persistence across app restart on the same schema.
- Added `libphonenumber-js` to `@pacaembu/api`.
- Added migration `0010_leads_update.sql` granting minimum column-level `UPDATE` on `leads`.
- Wired CRM through `AppModule` while preserving dynamic config and the existing AuthModule-backed DB/CLOCK providers.
- Extended audit metadata allowlist only for safe IDs/changed field names.

## Verification outputs

- Targeted Task 5 run:
  - `pnpm exec vitest run --project unit tests/unit/message-state.test.ts --project integration tests/integration/leads.test.ts tests/integration/conversations.test.ts`
  - Result: 3 files passed, 12 tests passed.
- Affected suites:
  - `pnpm test:unit`: 3 files passed, 9 tests passed.
  - `pnpm test:contract`: 2 files passed, 7 tests passed.
  - `pnpm test:integration`: 6 files passed, 44 tests passed.
- Final checks against the committed diff:
  - `pnpm typecheck`: passed.
  - `pnpm lint`: passed.
  - `pnpm format:check`: passed.
  - `pnpm test`: 11 files passed, 60 tests passed.

## Decisions

- Conversation creation uses the existing `IdempotencyService.execute` with operation `POST /api/conversations`; replay returns the stored body and the controller returns 201 for both original and replayed creates.
- Search escapes `%`, `_`, and backslash and passes the pattern as a SQL parameter, so wildcard-looking user input is treated as a value.
- Lead audit metadata stores only `lead_id` and comma-separated changed field names; conversation audit metadata stores `conversation_id` and `lead_id`. Phone and email are not stored in audit metadata.
- PATCH supports only the approved lead fields in `UpdateLeadRequestSchema`; no DELETE, send, admin, dashboard, export, outbox, WhatsApp, or Agent execution behavior was added.

## Task 5 idempotent replay authorization fix

- Added a `withWorkspaceContext` lead-scope check before `IdempotencyService.execute` in conversation creation. The existing check remains inside the transaction callback so a new INSERT is validated in the same transaction.
- Added a regression that creates a conversation, removes the empty conversation and its lead through `ownerPool` (without changing the foreign-key definition), then replays the same key and input. The replay now returns `404 RESOURCE_NOT_FOUND` instead of the stale stored `201` response.
- RED: `pnpm exec vitest run tests/integration/conversations.test.ts -t 'revalida acesso' --no-file-parallelism` — failed as expected with `expected 201 to be 404` when the pre-authorization was temporarily removed.
- GREEN: `pnpm exec vitest run tests/integration/conversations.test.ts tests/integration/idempotency.test.ts tests/contracts --no-file-parallelism` — 4 files and 20 tests passed.

## Review `cd4f023..82d93a4`

- **ADDRESSED**: conversation creation now authorizes the lead before idempotency lookup/replay, preventing a stale stored response from bypassing the current resource check.
- **SPEC PASS**: the transaction callback still calls `assertLeadInScope` before a new insert, and the regression requires `404 RESOURCE_NOT_FOUND` after the conversation and lead are removed.
- **QUALITY PASS**: the regression removes the dependent conversation before the lead through `ownerPool`; no foreign-key definition or constraint was relaxed. The diff is clean under `git diff --check`.
