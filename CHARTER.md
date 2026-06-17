# Project Charter — Brainwave

## What it is
**Brainwave is a multi-tenant SaaS brainstorming tool.** A group starts a brainstorming topic, everyone adds ideas, and an LLM turns the raw input into suggestions, themes, and prioritized **action items** — which can then be pushed into Jira and kept in sync.

A brainstorming topic behaves like a Jira epic/project, but topics aren't only for software. "Plan the team offsite" is as valid as "Q3 roadmap."

## The problem
Brainstorms generate energy and a pile of sticky notes — then nothing happens. The ideas live in a doc nobody re-reads, the good ones aren't prioritized, and none of it connects to the tools where work actually gets tracked. Brainwave closes that loop: **idea → analysis → action item → Jira ticket → done.**

## Core objects
- **Organization** — a tenant. Has many users. Data is isolated per org.
- **User** — belongs to an organization. Signs in via third-party login (Google / GitHub / etc.).
- **Topic** — a brainstorming session: `title`, `description`, `goal`. Like an epic. Belongs to an org.
- **Idea** — free text added to a topic, optionally with a contributor name.
- **Action item** — produced by AI analysis (or added manually); can be prioritized, assigned, and acted on.

## The build ladder (each phase = real PRs, maps to the 16-week curriculum)

### Phase 1 — Core loop (the cohort's first milestone)
- Create a topic (title, description, goal).
- Anyone adds ideas to a topic (optional name).
- Trigger **AI analysis**: themes + suggestions + a list of action items.
- Results are persisted and cached; each AI call records token usage (cost awareness from day one).
- *Single workspace, no auth yet — prove the loop before adding the SaaS shell.*

### Phase 2 — SaaS shell
- Organizations + users; data isolated per org (multi-tenancy).
- **Third-party login** (OAuth: Google / GitHub).
- Roles (owner / member).

### Phase 3 — Action layer
- Prioritize action items (rank, or high/med/low with rationale).
- "Pick to act" — a user claims/assigns an action item; track status.

### Phase 4 — Jira integration (the differentiator)
- Connect a Jira account (OAuth to Atlassian).
- Create a Jira ticket from an action item (one-way first).
- **Two-way sync**: status changes in Jira reflect in Brainwave and vice versa (webhooks).

### Later
- RAG over a topic's history (Week 8), an agent that interviews the group (Week 10), evals + a cost dashboard, deploy + CI.

## How we make decisions
Every non-trivial choice gets written down: **Problem → the CS pattern it maps to → the architecture → the judgment call (why this, not the alternative).** Senior engineering is knowing *when not* to reach for something. Document the "why not" as much as the "why."

## Stack
React + Vite (frontend) · Node + Express (backend) · MongoDB (data) · **AWS Bedrock** (LLM) · OAuth for login · Jira REST API + webhooks (Phase 4). Full detail and diagrams in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## The fence — what's open vs. what's protected
Brainwave is **Emergtech intellectual property**: a general-purpose brainstorming product the company builds, markets, and sells as open-core. It is **not** derived from, and does **not** incorporate, any contributor's pre-existing personal or consulting IP (e.g. proprietary diagnostic methodologies). Building Brainwave here does not entangle anyone's separate, personally-owned work.

The line we hold is **methodology, not features**:

- **Open (this repo, MIT, students contribute):** the entire Brainwave engine — topics, ideas, AI analysis, prioritization, and **all integrations, including Jira sync**. Integrations are commodity plumbing; they're open by design and freely reusable.
- **Protected (separate, private):** the **hosted service and paid tiers** — deployment, multi-tenant operations, enterprise features, billing, white-label. A *connector* is open; the *business of running and selling the service* is not.

A proprietary method that decides what an output should *mean* would never live here — but Brainwave doesn't contain one. It's a clean, generic product. Open-core, the model GitLab and Grafana use.
