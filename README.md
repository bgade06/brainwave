# Brainwave

**An open-source, AI-powered brainstorming tool — built by the Emergtech AI Engineer Accelerator cohort.**

Start a brainstorming topic, let everyone add ideas, and let an LLM turn the pile into themes, suggestions, and prioritized **action items** — then push those into Jira and keep them in sync. A topic works like a Jira epic, but it's just as good for "plan the team offsite" as for a product roadmap.

> This is a teaching product, not a tutorial. You ship real features via real pull requests, reviewed like production code. The lines you contribute here are resume lines you can defend in an interview.

## What it does (the loop)
**idea → AI analysis → action item → Jira ticket → done**, all multi-tenant SaaS with third-party login.

See [`CHARTER.md`](./CHARTER.md) for the full product spec and the phased build ladder.

## Stack

| Layer | Tech | What you learn |
|---|---|---|
| Frontend | React + Vite | State, forms, async UI |
| Backend | Node + Express | REST design, multi-tenancy, OAuth |
| Data | MongoDB | Document modeling, per-org isolation |
| AI | AWS Bedrock (LLM) | Prompts-as-code, tier-routed models, action-item extraction, cost-aware calls |
| Integrations | Jira REST + webhooks | External APIs, two-way sync (Phase 4) |

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for system + sequence diagrams, the LLM model-routing table, and the decision record.

## Implemented

- Topic and idea workspaces with persisted, cached Bedrock analysis
- Versioned prompts, validated AI output, token-usage metadata, and safe regeneration
- GitHub and Google OAuth, organization membership, sessions, CSRF protection, and tenant isolation
- Action-item priority, rationale, claiming, assignment, and status workflows
- Jira Cloud connection, ticket creation, and webhook-driven status sync
- Request IDs, liveness/readiness probes, validation, and automated tests

## Quick start
```bash
git clone https://github.com/bgade06/brainwave.git
cd brainwave
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
docker compose up -d mongo
npm run dev
```

The default environment uses a development-only authentication bypass and
leaves AI and Jira disabled. Configure the documented server environment
variables to exercise OAuth, Bedrock, or Jira. Never enable `AUTH_BYPASS` in
production.

Run `npm run verify` before opening a pull request.

## How we work
- Branch → pull request → review. No direct pushes to `main`.
- Pick an issue, comment to claim it, open a PR when ready. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License
MIT — see [`LICENSE`](./LICENSE). Built and maintained by the Emergtech AI Engineer Accelerator.
