# Brainwave — Codex Project Context

Read this file before changing the repository. It records the current state,
product boundaries, and working method for future Codex sessions.

## Current state (verified 2026-07-24)

- Phases 1–4 are implemented on `codex/build-brainwave`: React/Vite client,
  Express/Mongoose API, Bedrock analysis, multi-tenant OAuth, action workflows,
  and Jira Cloud two-way sync.
- The npm workspace targets Node 20 and uses ESM, Vitest/Supertest, TypeScript,
  MongoDB 8 via Compose, and GitHub Actions.
- The default branch is `main`.
- `origin` is `https://github.com/bgade06/brainwave.git`.
- `upstream` is `https://github.com/emergtechinc/brainwave.git`.
- The latest seed commit at the time of this note is
  `57873fa` (`docs: remove vendor-specific references; make LLM stack generic`).
- `npm run verify` is the repository-wide quality gate. Server HTTP tests need
  permission to bind ephemeral localhost ports in restricted sandboxes.
- Production credentials and a live MongoDB/Jira/Bedrock environment have not
  been exercised in this workspace. Never equate mocked provider tests with a
  production integration certification.

Update this section whenever a milestone materially changes the repository.

## Sources of truth

Use these documents in this order:

1. The user's latest explicit instruction.
2. `CHARTER.md` for product scope, phases, and object definitions.
3. `ARCHITECTURE.md` for intended technical choices and decision records.
4. `CONTRIBUTING.md` for branch, commit, PR, and review conventions.
5. `README.md` for the public overview.
6. This file for implementation state and execution discipline.

If code and documentation disagree, inspect the code and tests, identify the
drift, and fix or clearly report it. Do not silently choose one.

## Product in one sentence

Brainwave is a multi-tenant brainstorming SaaS that turns a topic and its ideas
into themes, suggestions, and action items, then eventually syncs action items
with Jira.

The core loop is:

`idea → AI analysis → action item → Jira ticket → done`

## Delivery order

Do not skip ahead unless the user explicitly changes priorities.

### Phase 1 — prove the core loop (implemented)

1. Scaffold the Express API and add `GET /health`.
2. Scaffold the React + Vite client and verify client-to-API communication.
3. Add MongoDB connection/configuration and Phase 1 models.
4. Add topic APIs and UI.
5. Add idea APIs and UI.
6. Add Bedrock-backed analysis, versioned prompts, persistence, and token usage.
7. Render cached analysis and support explicit regeneration.

Phase 1 is single-workspace and has no authentication. Keep seams for future
`organizationId` scoping, but do not build Phase 2 prematurely.

### Phase 2 — SaaS shell (implemented)

Add organizations, users, OAuth login, owner/member roles, and enforce tenant
isolation on every data access path.

### Phase 3 — action layer (implemented)

Add action-item priority, rationale, assignment/claiming, and status.

### Phase 4 — Jira integration (implemented)

Add Atlassian OAuth, one-way ticket creation, then idempotent two-way status
sync using webhooks.

Later work (RAG, interviewing agent, evals, cost dashboard, production
deployment) begins only after the four phases are stable.

## Intended technical baseline

- Frontend: React + Vite.
- Backend: Node.js + Express REST API.
- Data: MongoDB; Atlas Vector Search only when RAG is implemented.
- AI: AWS Bedrock through a single service boundary.
- Authentication: third-party OAuth; never store passwords.
- Jira: Jira Cloud REST API and webhooks.
- Prompts: version-controlled in `server/lib/prompts.js`; do not inline prompt
  strings inside route handlers.
- Model routing: small/mid/large tiers selected by task difficulty.
- Every model call must capture token usage and enough metadata for later cost
  reporting without storing secrets.

These are approved intentions from `ARCHITECTURE.md`. If implementation
constraints require a deviation, document the decision before spreading the
new pattern across the codebase.

## Planned Phase 1 domain and API

Treat this as a starting contract to refine with tests, not as implemented code.

- `Topic`: id, title, description, goal, createdAt.
- `Idea`: id, topicId, text, optional author, createdAt.
- `ActionItem`: id, topicId, text, optional priority, status, createdAt.
- Persisted analysis: topicId, themes, suggestions, action items, prompt/model
  metadata, token usage, createdAt, and a way to distinguish regeneration.

Initial endpoints named in the seed documents:

- `GET /health`
- `POST /topics`
- `GET /topics`
- `GET /topics/:id`
- `POST /topics/:id/ideas`
- `POST /topics/:id/analyze`

For each endpoint, define validation, success shape, not-found behavior, and
error shape before wiring the UI.

## Method for every implementation task

1. Inspect relevant files, Git status, and the current phase.
2. State the smallest testable outcome and any material assumption.
3. Keep the change focused; do not bundle unrelated cleanup.
4. Add or update tests with behavior changes. Cover the happy path and at least
   one meaningful failure or edge case.
5. Validate at the narrowest useful level, then run the broader relevant suite.
6. Check for secrets, tenant-boundary mistakes, unsafe logging, and stale docs.
7. Report what changed, exact verification run, and remaining limitations.
8. Update the "Current state" and milestone checklist below when appropriate.

For non-trivial choices, record:

`Problem → CS pattern → architecture → judgment (including why not alternatives)`

## Engineering guardrails

- No secrets, credentials, tokens, or real `.env` values in Git. Provide
  `.env.example` with placeholders when configuration is introduced.
- Validate input at the API boundary. Do not trust client validation.
- Keep route handlers thin; put domain, persistence, AI, and integration logic
  behind explicit service boundaries.
- Keep external providers replaceable at their boundary, but avoid speculative
  abstractions before a second implementation is plausible.
- Persist AI output only after validating its structure. Fail clearly on
  malformed model responses.
- Cache analysis by default; regeneration must be an explicit user action.
- Make webhook and sync operations idempotent before enabling two-way Jira sync.
- In Phase 2+, every tenant-owned query and mutation must be scoped by
  organization on the server, never only filtered in the client.
- Prefer accessible UI semantics and explicit loading, empty, success, and
  error states.
- Do not claim production readiness without security, migration, observability,
  backup, and deployment work that proves it.

## Working conventions

- Follow `CONTRIBUTING.md`: branch from `main`, one issue per PR, small commits,
  and no direct push to `main` in normal project work.
- Use present-tense commit subjects under roughly 60 characters.
- Keep `main` releasable once runtime code exists.
- Preserve upstream attribution and the MIT license.
- Do not run `setup-org-repo.sh` against this fork; the repository already
  exists and the script is historical bootstrap tooling.

## Milestone checklist

- [x] Phase 1 backend scaffold and health route
- [x] Phase 1 frontend scaffold and API connectivity
- [x] Phase 1 MongoDB connection and models
- [x] Topic API and UI
- [x] Idea API and UI
- [x] Bedrock analysis with versioned prompts and token tracking
- [x] Persisted/cached analysis UI with regeneration
- [x] Phase 1 service and HTTP tests
- [x] Phase 2 tenant and authentication design implemented
- [x] Phase 2 implemented with tenant-isolation tests
- [x] Phase 3 action layer implemented
- [x] Phase 4 Jira one-way creation implemented
- [x] Phase 4 two-way sync implemented with idempotency tests
- [ ] Later roadmap explicitly prioritized

## Known open questions

Do not guess these when they become implementation blockers:

- Exact Bedrock region, model IDs, response schema, and cost calculation.
- Production hosting topology and protected open-core boundaries.
- Production observability, backups, secret management, and release process.
- Live-provider certification for OAuth, Bedrock, and Jira.

Resolve each question at the phase where it matters, record the decision, and
update this file.
