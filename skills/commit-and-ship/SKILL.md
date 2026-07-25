---
name: commit-and-ship
description: Commit staged/unstaged work as clean conventional commits in English, optionally rebase onto main and push. Use when the user says "commit", "commit and push", "rebase to main", or asks to clean up the git history.
---

# Commit and ship

Turn the current working-tree changes into a clean, English-language git history, then (only when asked) rebase onto main and push.

## Before committing

1. Run the validation gate first; do not commit code that fails it:
   ```sh
   npm run typecheck && npm run build && npm test
   ```
   For docs-only or research-only changes, the gate can be skipped.
2. Review everything with `git status` and `git diff` (plus `git diff --staged`). Understand each change before staging it.
3. Never stage build artifacts or local data: `dist/`, `node_modules/`, `coverage/`, `backup_db-*/`, `.env`.

## Commit message style

- Always English, even if the conversation is in another language.
- Conventional commits with a scope: `type(scope): summary`.
  - Types in use: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`.
  - Scopes in use: `ui`, `design`, `api`, `post`, `notes`, `search`, `security`, `a11y`.
  - Examples from this repo's history:
    - `feat(ui): add hover chevrons to nav links & article open-arrow`
    - `fix(security): harden serverless auth and content handling`
    - `feat(design): establish two-voice typography (sans titles + serif body)`
- Summary line in imperative mood, lowercase after the colon, no trailing period.
- Add a short body only when the "why" is not obvious from the summary.
- End the message with the co-author trailer required by this workspace, naming
  the model that actually authored the commit — not a fixed name:
  ```
  Co-Authored-By: Claude <model> <noreply@anthropic.com>
  ```

## Grouping changes

When the working tree mixes unrelated work ("scan all changes and commit to make the git history clear"):

1. Cluster files by concern (e.g. API change vs. UI polish vs. docs).
2. Make one commit per concern, staging files explicitly (`git add <paths>`, never `git add -A` blindly).
3. Order commits so each one builds and makes sense on its own.

## Rebase and push (only when explicitly requested)

- This repo's remote is named `paper`, not `origin`. Never assume the name —
  resolve it, so the commands keep working if it is ever renamed or a second
  remote is added:
  ```sh
  REMOTE=$(git remote | grep -qx origin && echo origin || git remote | head -1)
  ```
- "rebase to main": `git fetch "$REMOTE" && git rebase "$REMOTE/main"`.
  A rebase that reports "up to date" is a success, not a failure — it means the
  branch already sits on top of main. Check with
  `git rev-list --left-right --count "$REMOTE/main"...HEAD` before assuming work is needed.
- Resolve conflicts gently: preserve both sides' intent, prefer the minimal reconciliation, and re-run the validation gate after resolving.
- Push only when the user asks ("push", "commit to main & push"). Use `git push` (or `git push --force-with-lease` after a rebase of an already-pushed branch — never plain `--force`).

## Verify

- `git log --oneline -5` shows the new commits with correct style.
- `git status` is clean (or only intentionally-untracked files remain).
