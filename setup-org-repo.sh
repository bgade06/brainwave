#!/usr/bin/env bash
# Run AFTER the GitHub org exists. Usage: ./setup-org-repo.sh <org> [repo]
# Example: ./setup-org-repo.sh emergtech brainwave
set -euo pipefail

ORG="${1:?Pass the org name, e.g. ./setup-org-repo.sh emergtech}"
REPO="${2:-brainwave}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

echo "==> Committing seed locally"
git add -A
git commit -qm "chore: scaffold Brainwave seed (charter, contributing, CI conventions)" || true
git branch -M main

echo "==> Creating $ORG/$REPO and pushing"
gh repo create "$ORG/$REPO" --public --source=. --remote=origin --push

echo "==> Ensuring labels exist"
gh label create "good first issue" --color "7057ff" --description "Good entry point" --repo "$ORG/$REPO" 2>/dev/null || true
gh label create "frontend" --color "1d76db" --repo "$ORG/$REPO" 2>/dev/null || true
gh label create "backend"  --color "0e8a16" --repo "$ORG/$REPO" 2>/dev/null || true
gh label create "ai"       --color "d93f0b" --repo "$ORG/$REPO" 2>/dev/null || true
gh label create "setup"    --color "fbca04" --repo "$ORG/$REPO" 2>/dev/null || true
gh label create "epic"     --color "5319e7" --description "A whole build phase" --repo "$ORG/$REPO" 2>/dev/null || true
gh label create "phase-1"  --color "c2e0c6" --repo "$ORG/$REPO" 2>/dev/null || true

mk() { gh issue create --repo "$ORG/$REPO" --title "$1" --body "$2" --label "$3"; }

echo "==> Creating Phase 1 starter issues (claimable now)"
mk "Scaffold the backend (Express server + health route)" \
"Stand up an Express server with a \`GET /health\` route returning \`{ ok: true }\`. Add \`npm run dev\`. No DB yet.

**Why:** every full-stack app needs a running shell before features. This is our hello-world." \
"backend,good first issue,setup,phase-1"

mk "Scaffold the frontend (Vite + React, hello page)" \
"Create a Vite + React app that renders the Brainwave landing page and calls \`GET /health\` to prove front/back talk to each other.

**Why:** prove the wire between the two halves before building on it." \
"frontend,good first issue,setup,phase-1"

mk "Data model: Topic has many Ideas (and produces Action Items)" \
"Define the MongoDB models for Phase 1: a \`Topic\` (id, title, description, goal, createdAt), an \`Idea\` (id, topicId, text, author?, createdAt), and an \`ActionItem\` (id, topicId, text, priority?, status, createdAt). Add a connection helper reading the URI from an env var. (Organization/User come in Phase 2.)

**Why:** the data model is the spine of the whole product. See CHARTER.md." \
"backend,phase-1"

mk "Create a brainstorming topic (API + UI)" \
"\`POST /topics\` (title, description, goal), \`GET /topics\`, \`GET /topics/:id\`. A form on the frontend to create a topic and a page to view it.

**Why:** the topic is the core object — like a Jira epic. Everything hangs off it." \
"backend,frontend,phase-1"

mk "Add ideas to a topic (API + UI)" \
"\`POST /topics/:id/ideas\` with text and an optional author name. Render the running list of ideas on the topic page.

**Why:** this is the 'collect group input' half of the loop. Optional name = low friction to contribute." \
"backend,frontend,good first issue,phase-1"

mk "AI analysis: themes + suggestions + action items" \
"Add \`POST /topics/:id/analyze\`. Send the topic's goal + all ideas to the Claude API and return: themes, suggestions, and a list of action items. Keep the prompt in a versioned \`server/lib/prompts.js\` (prompts are code). Record token usage on the response. Persist the result.

**Why:** this is the product's brain — raw ideas become prioritizable action. Cost tracking starts here." \
"ai,backend,phase-1"

mk "Render AI analysis + cache it in the UI" \
"Persist each analysis so re-opening a topic shows it without re-calling the model. Render themes/suggestions/action items on the topic page with a 'regenerate' button.

**Why:** model calls cost money and time. Caching is a real engineering constraint, not an afterthought." \
"ai,frontend,backend,phase-1"

echo "==> Creating roadmap epics (later phases — for the board, not for week 1)"
mk "EPIC — Phase 2: SaaS shell (orgs, users, third-party login)" \
"Multi-tenancy: an \`Organization\` has many \`User\`s; all data scoped per org. Third-party login via OAuth (Google / GitHub). Owner/member roles.

Break into child issues when we reach this phase. **Maps to curriculum: auth, multi-tenancy, security.**" \
"epic"

mk "EPIC — Phase 3: Action layer (prioritize, assign, act)" \
"Prioritize action items (rank or high/med/low with rationale). 'Pick to act' — a user claims/assigns an action item and tracks its status.

Break into child issues when we reach this phase." \
"epic"

mk "EPIC — Phase 4: Jira integration (create tickets + two-way sync)" \
"Connect Jira via OAuth (Atlassian). Create a Jira ticket from an action item (one-way first). Then two-way sync: status changes in Jira reflect in Brainwave and vice versa (webhooks).

The differentiator. Break into child issues when we reach this phase. **Maps to curriculum: external APIs, webhooks.**" \
"epic"

echo "==> Done. Repo: https://github.com/$ORG/$REPO"
