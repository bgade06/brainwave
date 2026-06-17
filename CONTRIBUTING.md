# Contributing to Brainwave

Welcome. This is how real teams ship. Follow it and your Git history becomes something you can show an interviewer.

## The workflow (every change, no exceptions)

1. **Find an issue** on the project board. Comment `claiming this` so no one doubles up.
2. **Branch** off `main`:
   ```bash
   git checkout main && git pull
   git checkout -b <your-initials>/<short-description>   # e.g. sm/add-idea-form
   ```
3. **Build it.** Small, focused commits with clear messages (present tense: "add idea form", not "added stuff").
4. **Open a pull request** against `main`. Fill in the template: what changed, why, how you tested it.
5. **Review.** The instructor (or a peer) reviews. Address comments by pushing more commits to the same branch.
6. **Merge.** Once approved and green, it merges. You just shipped.

## Rules

- **No direct pushes to `main`.** Ever. `main` stays releasable.
- **One issue per PR.** Keep them small enough to review in 10 minutes.
- **If you use an AI assistant** (Claude Code, Copilot), read [`CLAUDE.md`](./CLAUDE.md) first. You own every line you submit — be able to explain it.
- **Ask in the open.** If you're stuck, open a draft PR or comment on the issue. Questions in public help the whole cohort.

## Good first issues
Look for the `good first issue` label. Start there.

## Commit messages
```
<verb> <what>            # add idea list component
                          # fix token count off-by-one
                          # docs: clarify setup steps
```
Keep the subject under ~60 chars. Body optional, for the "why" when it isn't obvious.
