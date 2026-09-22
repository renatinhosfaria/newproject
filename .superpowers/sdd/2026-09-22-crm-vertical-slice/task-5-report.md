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
