---
name: research-audit
description: Reconcile a research/plan document under research/ with the actual codebase — report what is done, partially done, or missing, then implement the gaps in priority order. Use for "what have I finished from research/X?", "complete this plan", or "@research/... implement".
---

# Research audit

The `research/` directory holds long-form plans and audits written ahead of implementation (existing examples: `research/design-anthropic-blog/01–04 + README`, `research/accessibility/01.md`). This skill turns such a document into a verified status report and, on request, into implemented changes.

## Phase 1 — Audit (always)

1. Read the research doc(s) fully and extract every concrete recommendation into a checklist item.
2. For **each** item, verify against the codebase — never trust the doc's own claims or your memory:
   - grep for the tokens, class names, components, or API routes the item implies (e.g. `--accent`, `aria-live`, a handler in `api/`);
   - read the surrounding code to confirm the item is genuinely implemented, not just name-matched;
   - check git log for related commits as supporting (not primary) evidence.
3. Produce a status table: **Done / Partial / Missing**, one row per recommendation, each with file:line evidence (or "no trace found"). For Partial, state exactly what remains.
4. Assign priorities to the gaps: **P0** (correctness, accessibility blockers, security), **P1** (clear user-facing value, low risk), **P2** (nice-to-have polish). End the audit with the ranked gap list.

Stop here if the user only asked for status ("what have I finished?").

## Phase 2 — Implement (on request: "fix P0", "complete this plan")

1. Create a TODO list from the gap list, priority-ordered; work items one at a time and keep statuses current.
2. Implement each item following the repo's other skills:
   - visual/design items → `design-polish` conventions (tokens in `src/style.css`, both themes, restrained motion);
   - features spanning layers → `fullstack-feature` conventions (model → validation → `api/` handler → types → Vue);
   - anything touching auth or input handling → check against `security-audit` rules.
3. Validate as you go: `npm run typecheck && npm run build && npm test`.
4. If the work reveals that the research doc is outdated or a recommendation is wrong, say so in the summary; update the doc only if the user asks.
5. Finish with a summary mapping each completed TODO back to its research-doc item, then offer to commit via `commit-and-ship`.
