# CLAUDE.md — working in this repo with an AI assistant

This file orients Claude Code (and applies equally to Copilot users). Read it before generating code.

## What this is
Brainwave: a full-stack AI app. Collect group input → LLM synthesis (summary / prioritize / patterns) → cached, cost-tracked output. See [`CHARTER.md`](./CHARTER.md) for the full scope.

## Stack
- **Frontend:** React + Vite
- **Backend:** Node + Express
- **Data:** MongoDB
- **AI:** Claude on **AWS Bedrock** via the AnthropicBedrock SDK, tier-routed (Haiku / Sonnet / Opus). See [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## House rules for AI-assisted work
- **You own every line.** If an assistant writes it and you can't explain it in review, don't submit it.
- **Prompts are code.** AI prompts live in versioned source files (e.g. `server/lib/prompts.js`), not scattered inline strings. Change them in a PR like any other code.
- **Cost awareness.** Every model call records token usage. Don't strip that out.
- **Smallest change that works.** Match the surrounding style. Don't refactor unrelated files in a feature PR.
- **No secrets in code.** API keys come from environment variables. Never commit a `.env`.

## How we reason about changes
For any non-trivial decision, write it down as: **Problem → the CS pattern → the architecture → the judgment call (why this, not the alternative).** This is how the cohort thinks; mirror it in PR descriptions.

## Before you open a PR
- It runs locally.
- It does one thing (one issue).
- You tested the happy path and at least one edge case.
- The PR description explains *why*, not just *what*.
