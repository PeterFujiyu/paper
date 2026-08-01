# Codebase audit — prioritized backlog

**Status:** written as a report; **A1, B1–B6 and C2 were then acted on** in the commits landing
alongside this document. Still open: **B7** (orphaned cursor PNGs), **C1** (the `validation.ts`
seam — now more relevant, not less, since a third concern has since been added to that file),
and the per-document `research/` reconciliation in [item D](01-inventory.md#d).
**Date:** 2026-07-31
**Scope:** everything in `paper` *except* `agent-benchmark/` and `tests/agent-benchmark/`, which
have their own plan in [`../benchmark-extraction/`](../benchmark-extraction/README.md).

Evidence for every item is in [`01-inventory.md`](01-inventory.md).

---

## The headline

**The codebase is in better shape than "mountain of crap" implies.** `typecheck`, `lint`, and
`npm test` (30 files, 331 tests) all pass on a clean tree. There is no broken code here.

More to the point, **four of the things that looked worst turned out to be fine**, and three of them
would have been actively damaged by a cleanup that trusted appearances. Those are listed under
"Verified fine — do not touch" below, because in an audit that section is worth as much as the
backlog.

What is actually wrong divides into one **defect** (documentation that will make an agent write
wrong code), a cluster of **stale artifacts** (a build output committed in March, four dead
scaffold files), and some ordinary **structural debt** that is arguably not worth paying down.

By volume, the real "mountain" was `agent-benchmark/` — 14,542 LOC, 1.9× the size of the product —
and that is already being addressed separately.

---

## Priority 1 — a defect

### A1. `AGENTS.md` tells agents to write route handlers in the wrong place

`AGENTS.md` describes the pre-`1bca3ed` architecture: its Repository Map calls `api/` "serverless
route entrypoints, each exporting a default async `handler`", and its whole "API Route Pattern"
section explains how to write handler bodies there. It never mentions `server/routes/` at all.

Today `api/*.ts` are **five one-line dispatchers**, and handlers live in `server/routes/`.
`CLAUDE.md` says so correctly. So the repo ships **two agent-instruction files that contradict each
other on the single most common change anyone makes here.**

An agent following `AGENTS.md` would add a handler to `api/`, which breaks the Vercel 12-function
grouping that the directory exists to satisfy and bypasses `server/routes/index.ts` — the table
`CLAUDE.md` identifies as the single source both `server/dev.ts` and `api/` read, specifically so
dev and prod cannot drift.

This is the one item in this audit that causes wrong behavior rather than costing maintenance.

**Fix:** delete `AGENTS.md`, or reduce it to a pointer at `CLAUDE.md`. It duplicates `CLAUDE.md`
across 20 sections while being a version behind. Two overlapping instruction files is the root
cause; correcting the stale one just resets the clock.

---

## Priority 2 — stale artifacts

| # | Item | Size | Why it is stale |
|---|---|---:|---|
| B1 | `coverage/` committed to git | 23 files, 276 KB | Generated 2026-03-13; covers 10 files of the ~28 that now exist — including `src/data/posts.ts`, which is itself dead. Not in `.gitignore`, so `npm run test:coverage` silently dirties the working tree. |
| B2 | `CLAUDE.md` says `api/` has "exactly four functions" | 1 line | There are five. `api/shell.ts` landed 2026-07-30. Both `vercel.json` and the contract test already know about it — `CLAUDE.md` is the only artifact that does not. |
| B3 | `src/data/posts.ts` | 77 LOC | Hardcoded legacy essays with Chinese comments. Zero importers anywhere, including tests. Untouched since 2026-03-07. |
| B4 | `src/components/HelloWorld.vue` | 43 LOC | Vite scaffold. Its only occurrence in the repo is its own body text. |
| B5 | `src/assets/vue.svg`, `public/vite.svg` | 2 files | Vite scaffold. Zero references. |
| B6 | `design.html` | 190 LOC | Not in Vite's build input, not served, not linked. `AGENTS.md` itself calls it "currently unreferenced by the app". Untouched since the initial commit. **But** `src/style.css:19` cites it as the authority for reading measure — so deleting it orphans a comment that points at design intent. |
| B7 | 5 orphaned cursor PNGs | ~20 KB | `arrow@2x.png`, `busy-strip{,@2x}.png`, `wait-strip{,@2x}.png` — present in `public/cursors/` but referenced by no CSS rule. The other 81 are live. |

B3–B5 are unambiguous deletions. B1 is a deletion plus a `.gitignore` line. B2 is a one-word edit.
B6 needs a decision first (see [inventory](01-inventory.md#b6)). B7 is trivial and near-worthless.

---

## Priority 3 — structural debt

| # | Item | Assessment |
|---|---|---|
| C1 | `server/lib/validation.ts` — 520 lines | **Real seam.** Lines 1–215 are request-body validation; 216–520 are TipTap content sanitization. Two different concerns, and the sanitizer is 59% of the file. Splitting is defensible. |
| C2 | Two components declare **global** `<style>` blocks | `TiptapEditor.vue:410` and `PostView.vue:482` each carry an unscoped `<style>` alongside their scoped one — global CSS declared inside a component. Small, real architectural smell. |
| C3 | Five Vue SFCs over 500 lines | **Not worth splitting.** In every one, ~40–55% of the file is its own scoped CSS. That is idiomatic Vue SFC structure, not a file doing several jobs. Named here so the line counts stop reading as a finding. |
| C4 | `vitest.benchmark.config.ts` is never typechecked | `tsconfig.json` includes `vite.config.ts` and `vitest.config.ts` but not this one. **Moot** — the file is deleted by the benchmark extraction. |

---

## Verified fine — do not "clean" these

Each of these was a candidate finding that survived scrutiny. Three would have been damaged by a
cleanup pass that trusted appearances.

- **The cursor system is a real, well-built feature.** 90+ PNGs in `public/cursors/`, a Python
  extractor in `scripts/`, and a `.cursor` binary in `vendor/` look exactly like abandoned assets.
  They are not: `src/main.ts:3` imports `src/styles/cursors.css`, 81 of 86 PNGs are live, and the
  default arrow is deliberately inlined as base64 — with a comment explaining that fetching it would
  show the visitor's own cursor first and "read as a bug". This is careful work.
- **No client/server logic duplication.** `src/shared/slug.ts` and `src/shared/reading-time.ts` look
  like they must have server twins that could drift. They do not — `server/lib/validation.ts:3`,
  `server/models/Post.ts:3`, and `server/scripts/backfill-reading-time.ts:7` all import *from*
  `src/shared/`. Single source of truth, and `reading-time.ts`'s header comment explains the
  arrangement deliberately.
- **Tailwind is used.** `CLAUDE.md` calls it "installed but not dominant", which reads like an
  unremoved dependency. `src/style.css:1` is `@import "tailwindcss"` and `vite.config.ts:7` loads
  the plugin. It is wired in.
- **The reading-measure regression is already fixed.** `research/design-anthropic-blog/` flags a live
  defect — 65ch design intent vs 81.25ch shipped — and calls it a direct hit to readability. It was
  fixed by commit `ce3ebf4`, "fix(design): restore golden reading measure to 68ch". The research doc
  is stale; the code is correct. **This was going to be the headline of this audit until it was
  checked.**
- **The route/`vercel.json` contract test really does cover the new dispatcher.**
  `tests/server/lib/dispatch.test.ts:97,120-123` exercises `shellRoutes` and asserts the
  `/writing/:slug` rewrite. The invariant `CLAUDE.md` claims is genuinely enforced.
- **Nothing in `src/shared/` or `server/lib/` is unreferenced.** Every module has a non-test
  importer.

---

## Suggested order

1. **A1** — the only item that causes wrong behavior. One deletion.
2. **B2** — one word, and it is in the file every session loads.
3. **B1, B3, B4, B5** — mechanical deletions, ~110 LOC and 276 KB, zero risk. One commit.
4. **Stale research docs** — annotate `research/design-anthropic-blog/` as resolved so the next
   reader does not re-open a fixed bug. See [inventory](01-inventory.md#d-stale-research-docs).
5. **B6** — decide `design.html`'s status before deleting it.
6. **C1, C2** — real but optional. Do them when next in those files, not as a campaign.
7. **B7, C3, C4** — leave alone.

---

## Confidence

Verification depth differs per item, and this section exists because the difference matters.

**Directly verified** — reachability proven by grep across all entry points, or by git archaeology:
A1, B1, B2, B3, B4, B5, B6, B7, C1, C2, C3, C4, and every entry in "Verified fine".

**Not exhaustively verified:** the `research/` document survey (item D in the inventory) samples
each document's claims rather than checking every assertion. The four docs are characterized as
completed / partial / stale on the basis of spot checks, not a full reconciliation. Running the
`research-audit` skill against each one would settle it properly.

A planned three-agent verification pass over this whole area failed on a session limit, so
everything above was checked inline instead. The coverage is narrower than intended in exactly one
place — item D — and that is flagged there too.
