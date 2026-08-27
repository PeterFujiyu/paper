# `research/` — status index

Long-form plans and audits written ahead of (or alongside) implementation. Every document below was
reconciled against the code on **2026-08-26** and carries its own status header with file:line
evidence; this table is the summary. The suite numbers and the `PostView.vue` line citations were
refreshed on **2026-08-27**, after the section anchors and contents rail landed: `npm test` is
**37 files / 433 tests**, green.

The rule these documents live by: **a plan that has landed is a historical record, not a todo
list.** Three of them had headers claiming work was unstarted when it had shipped months earlier,
and one of those was hiding a live regression. Check the code, not the header — and when you land
something, update the header.

| Document | Status | One line |
|---|---|---|
| [`accessibility/01-accessibility-plan.md`](accessibility/01-accessibility-plan.md) | ✅ **Implemented** | All 7 phases landed in `a83a54c`, tests included. |
| [`page-transitions/design.md`](page-transitions/design.md) | ✅ **Implemented** | `c213305`, built exactly to spec. |
| [`cursor-theme.md`](cursor-theme.md) | ✅ **Shipped** | `44212f4` + `27903b3`; two paragraphs superseded by the pre-paint bootstrap and marked inline. |
| [`design-anthropic-blog/`](design-anthropic-blog/README.md) | ✅ **All recommendations landed** | P0–P2 complete. `03-blog-audit.md` is a June snapshot whose findings are all now false — banner added. |
| [`codebase-audit/`](codebase-audit/README.md) | 🟡 **Mostly acted on** | A1, B1–B6, C2 done. Open: **B8** (one line — `lint` currently fails), **C1** (`validation.ts` seam), **B7** (5 orphaned PNGs, ignorable). |
| [`benchmark-extraction/`](benchmark-extraction/README.md) | 🟡 **Stage 1 landed, not green** | `48640f2` implemented all of Stage 1 including 21 annotated tags, but `benchmark:test` loses 22 tests to a `paths.mjs` URL scheme error and `lint` reports 6 errors. Stage 2 not started, and blocked on those. |
| [`aws-migration-plan.md`](aws-migration-plan.md) | 📋 **Plan only** | Nothing built; still Vercel + MongoDB Atlas. Its own §11 explains why: at this traffic the migration saves nothing. |
| [`doctor/2026-07-29-1944.md`](doctor/2026-07-29-1944.md) | 📎 **Applied, historical** | Point-in-time health check; annotated with what has changed since. |

## Open work, in order

1. **`eslint.config.js:18` → `'**/.agent-benchmark/**'`** — `npm run lint` fails today for anyone
   who has run the benchmark locally. One line.
   ([B8](codebase-audit/README.md), [Stage 1 exit criteria](benchmark-extraction/01-stage-1-harden-in-place.md#stage-1-exit-criteria))
2. **`agent-benchmark/src/paths.mjs:17`** — `fileURLToPath(new URL('..', import.meta.url))` throws
   under Vitest's transform, so 3 of 15 benchmark test files never collect. Needs a non-`file:`
   fallback in `paths.mjs`, not a change to the tests.
3. **Stage 2 of the benchmark extraction** — blocked on 1 and 2 by its own sequencing decision.
4. **`server/lib/validation.ts`** — the 520-line, two-concern seam. Optional; do it when next in
   that file.

## Not part of the plans

`design-anthropic-blog/design.html` is a typographic reference, not a page. Nothing builds or serves
it; `src/style.css:20` cites it as the authority for `--measure`. Do not delete it without
re-pointing that comment.
