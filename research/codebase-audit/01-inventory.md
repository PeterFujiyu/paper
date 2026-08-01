# Codebase audit — evidence

Backing evidence for [`README.md`](README.md). Verified at commit `a69dc1d`, 2026-07-31.
Every command below is read-only.

---

## Baseline

```
npm run typecheck   clean
npm run lint        clean
npm test            30 files, 331 tests, all passing
```

Product size, excluding the benchmark:

| Area | LOC |
|---|---:|
| `src/` + `server/` + `api/` | 7,780 |
| `agent-benchmark/` + `tests/agent-benchmark/` | 14,542 |

---

## A1 — `AGENTS.md` contradicts `CLAUDE.md` on route architecture {#a1}

**Verdict: CONFIRMED — defect.**

`AGENTS.md:24` (Repository Map):

> `api/` - serverless route entrypoints, each exporting a default async `handler`.

`AGENTS.md:137-147` ("API Route Pattern") then describes writing handler bodies — `beginRequest`,
`try/catch/finally`, `finishRequest`, `sendJson`, `requireAuth`, `readBody<T>` — with `api/` as the
implied location. `AGENTS.md` never mentions `server/routes/` in any of its 20 sections.

Reality at HEAD:

```
$ ls api/
admin.ts  auth.ts  content.ts  metrics.ts  shell.ts

$ cat api/auth.ts
import { createDispatcher } from '../server/lib/dispatch.js'
import { authRoutes } from '../server/routes/index.js'

export default createDispatcher(authRoutes)
```

Every file in `api/` is four lines. The handler pattern `AGENTS.md` describes lives in
`server/routes/*.ts`. `CLAUDE.md:22` has it right:

> `server/routes/` — one thin route per file (method guard, auth gate, validation, shaping),
> default async `handler`. `index.ts` is the single route table read by both `server/dev.ts` and
> `api/`, so dev/prod can't drift.

The architecture changed in `1bca3ed` (2026-07-10, *"refactor(api): group routes behind four
dispatchers to fit Vercel's cap"*). `AGENTS.md` claims to be "based on the current codebase state on
2026-07-18" — eight days *after* that commit — and instructs that it be updated when tooling
changes. It was not.

**Consequence.** An agent that reads `AGENTS.md` and adds a route writes a full handler into
`api/`. That (a) consumes one of the 12 Vercel Hobby function slots the grouping exists to conserve,
and (b) bypasses `server/routes/index.ts`, which is the mechanism preventing dev/prod drift. The
contract test at `tests/server/lib/dispatch.test.ts` would likely catch the second, but only after
the work is done the wrong way.

**Fix.** Delete `AGENTS.md` or reduce it to a pointer at `CLAUDE.md`. Merely correcting the stale
sections leaves two overlapping instruction files, which is the underlying problem — `AGENTS.md`'s
20 sections (Commands, Import Conventions, Formatting, TypeScript, Naming, Vue Patterns, CSS,
Database, Validation, Error Handling, Change Strategy) all restate `CLAUDE.md` at greater length.

**Risk of the fix:** none. Nothing reads `AGENTS.md` programmatically.

---

## B1 — `coverage/` is committed {#b1}

**Verdict: CONFIRMED — debt.**

```
$ git ls-files coverage | wc -l
23
$ du -sh coverage
276K
$ git check-ignore coverage/index.html   # no output — not ignored
$ git log -1 --format="%ad %h" --date=short -- coverage/
2026-03-13 f4e2e83
```

Added by `f4e2e83` (*"Introduce Vitest for unit testing…"*), never regenerated. The report covers
**10 files**:

```
server/lib/{auth,db,logger,security,validation,vercel-auth}.ts
src/admin/store.ts   src/data/posts.ts   src/router/index.ts   src/types/content.ts
```

Today there are 15 files in `server/lib/` and 13 tracked `src/**/*.ts`. So the report describes
roughly a third of its own target surface — and one of the ten files it does cover,
`src/data/posts.ts`, is itself dead code (see [B3](#b3)).

`vitest.config.ts:16-18` sets `reporter: ['text', 'html']`, so `npm run test:coverage` regenerates
`coverage/` in place. With the directory tracked and unignored, that command silently dirties the
working tree — a trap for anyone running it before a commit.

**Fix.** `git rm -r --cached coverage/`, add `coverage` to `.gitignore`.
**Risk:** none. Nothing references the directory.

---

## B2 — `CLAUDE.md`'s "exactly four functions" {#b2}

**Verdict: CONFIRMED — debt.**

`CLAUDE.md:21`:

> `api/` — exactly four functions (`auth`, `admin`, `content`, `metrics`), each one line:
> `createDispatcher(<group>Routes)`.

There are five. `api/shell.ts` was added 2026-07-30 in `a69dc1d`
(*"feat(api): serve per-essay link previews to crawlers"*).

Notably, **every other artifact is already correct**:

- `vercel.json:59` — `{ "source": "/api/post-shell", "destination": "/api/shell?route=post-shell" }`
- `vercel.json:70` — the `/writing/:slug` rewrite
- `tests/server/lib/dispatch.test.ts:5` imports `shellRoutes`; `:97` registers it; `:120-123`
  asserts the slug rewrite

So the contract test `CLAUDE.md` credits with enforcing route/rewrite pairing **does** cover the
fifth dispatcher. `CLAUDE.md` is the sole straggler.

**Fix.** "exactly four" → "exactly five", and add `shell` to the list. Consider phrasing it as
"one function per route group" so the next addition does not re-stale it.

---

## B3 — `src/data/posts.ts` is dead {#b3}

**Verdict: CONFIRMED — debt.**

```
$ grep -rn "data/posts\|LegacyPost" src server api tests index.html
(no matches outside the file itself)
$ git log -1 --format="%ad %h %s" --date=short -- src/data/posts.ts
2026-03-07 9ffce7f feat: Migrate the entire codebase from JavaScript to TypeScript…
```

77 lines: a `LegacyPost` interface and a two-entry array of hardcoded essays, with a Chinese
docblock explaining how to add articles by editing the array. It is the pre-database content model,
carried through the TypeScript migration and then orphaned when posts moved to MongoDB.

It is one of the ten files `coverage/` reports on — an artifact of how long both have sat.

**Fix.** Delete. **Risk:** none; no importers, no test references.

---

## B4, B5 — Vite scaffold leftovers {#b4}

**Verdict: CONFIRMED — debt.**

```
$ grep -rn "HelloWorld" src index.html tests
src/components/HelloWorld.vue:18:  <code>components/HelloWorld.vue</code> to test HMR

$ grep -rn "vue.svg\|vite.svg" src index.html vite.config.ts tests
(no matches)
```

`HelloWorld.vue`'s only occurrence in the repository is its own body text. `src/assets/vue.svg` and
`public/vite.svg` have none at all.

**Fix.** Delete all three. **Risk:** none.

---

## B6 — `design.html` {#b6}

**Verdict: CONFIRMED unreferenced — but needs a decision, not a deletion.**

```
$ grep -n "input\|rollupOptions" vite.config.ts
(no multi-input configuration — only index.html is a build entry)
$ git log -1 --format="%ad %h" --date=short -- design.html
2026-03-07 c637d54     # the initial commit; never touched since
```

`AGENTS.md:33` already says so: *"`design.html` - standalone file, currently unreferenced by the
app."*

**But it is not inert.** `src/style.css:19`:

```css
/* Layout — golden reading measure (~50-75 chars; see design.html) */
--measure: 68ch;
```

The shipped stylesheet points at `design.html` as the authority for a value it sets. And
`research/design-anthropic-blog/README.md:45` describes it as *"a typographic example in Anthropic
style"* that predates and justifies the current design direction.

So `design.html` is functioning as a **design reference document that happens to be written in
HTML**, not as dead code. Three coherent options:

1. Keep it and move it somewhere that says so — `research/design-anthropic-blog/` or `docs/`.
2. Keep it in place and add one line to `CLAUDE.md` recording that it is a reference, not a page.
3. Delete it, and rewrite the `src/style.css:19` comment to state the measure rationale inline.

Deleting it *without* (3) leaves a stylesheet comment pointing at a file that no longer exists.

---

## B7 — orphaned cursor PNGs {#b7}

**Verdict: CONFIRMED — noise.**

```
$ ls public/cursors/*.png | wc -l
86
$ grep -oE "cursors/[a-z0-9@.-]+\.png" src/styles/cursors.css | sort -u | wc -l
81
```

The five with no CSS reference: `arrow@2x.png`, `busy-strip.png`, `busy-strip@2x.png`,
`wait-strip.png`, `wait-strip@2x.png`.

Both patterns are explainable rather than accidental:

- **`arrow@2x.png`** — the default arrow is inlined as base64 in `cursors.css:85-86`
  (`--arrow-src-1x` / `--arrow-src-2x`). `arrow.png` still appears once, at `cursors.css:171`, inside
  an `@supports (cursor: image-set(...))` feature probe. The `@2x` file has no such use.
- **The `-strip` files** are animation sprite sheets, presumably emitted by
  `scripts/extract-cursors.py`; the CSS uses static frames.

~20 KB. Deleting them is safe and almost pointless. Listed for completeness.

---

## C1 — `server/lib/validation.ts` has a real seam {#c1}

**Verdict: CONFIRMED — optional debt.**

520 lines, 11 exports:

| Lines | Concern | Exports |
|---|---|---|
| 1–215 | Request-body validation and field normalization | `AuthBody`, `PostBody`, `normalizeSlug`, `validateRegisterBody`, `validateLoginBody`, `validatePostBody`, `normalizeCoverImage`, `normalizeReadingOverride`, `resolveReadingMinutes`, `normalizeTags` |
| 216–520 | TipTap JSON sanitization | `sanitizePostContent` and its helpers |

The sanitizer is **59% of the file** and a genuinely different concern — an allowlist walker over
rich-text nodes with safe-link and safe-image validation, versus a set of field checks on request
bodies. `CLAUDE.md` lists them as separate security invariants.

A `server/lib/post-content.ts` split would mirror the existing `server/lib/note-content.ts`, which
already holds the notes equivalent — so the convention exists and this file is the outlier.

**Risk:** low, but it touches a security-critical path with good test coverage
(`tests/server/lib/validation.test.ts` is 668 lines). Do it as its own change with no behavior edits.

---

## C2 — global `<style>` blocks inside components {#c2}

**Verdict: CONFIRMED — minor debt.**

```
src/admin/components/TiptapEditor.vue:359  <style scoped>
src/admin/components/TiptapEditor.vue:410  <style>          <- global
src/views/PostView.vue:290                 <style scoped>
src/views/PostView.vue:482                 <style>          <- global
```

Both files declare an unscoped block alongside their scoped one — 174 lines in `TiptapEditor.vue`,
47 in `PostView.vue`. Almost certainly deliberate (styling TipTap's rendered output and prose
content, neither of which scoping can reach), but it means global CSS is declared in two component
files rather than in `src/style.css`, where the design tokens live.

**Fix.** Either move them to `src/style.css` under a clearly-named section, or leave them and add a
comment at each block stating why scoping cannot apply. The second is cheaper and probably right.

---

## C3 — the long Vue files are fine {#c3}

**Verdict: FALSE as a finding. Recorded so the line counts stop reading as a problem.**

| File | Total | Template | Script | Style | Style share |
|---|---:|---:|---:|---:|---:|
| `src/App.vue` | 647 | 174 | 118 | 350 | 54% |
| `src/views/HomeView.vue` | 588 | 119 | 152 | 312 | 53% |
| `src/admin/components/TiptapEditor.vue` | 584 | 104 | 250 | 225 | 39% |
| `src/admin/views/PostEditView.vue` | 553 | 94 | 233 | 221 | 40% |
| `src/views/PostView.vue` | 529 | 75 | 210 | 238 | 45% |

In every case the largest section is the component's own CSS. None is a file doing several unrelated
jobs — the script blocks are 118–250 lines, which is unremarkable. Splitting any of them would mean
extracting CSS into separate files, which fights Vue SFC convention and the co-location that makes
scoped styles work.

`CLAUDE.md` asks for "small, convention-following changes over rewrites". Splitting these would be
the opposite.

---

## C4 — `vitest.benchmark.config.ts` is never typechecked {#c4}

**Verdict: CONFIRMED — moot.**

`tsconfig.json`'s `include` lists `vite.config.ts` and `vitest.config.ts` but not
`vitest.benchmark.config.ts`, so `vue-tsc --noEmit` never sees it.

The benchmark extraction deletes the file. No action.

---

## D — stale `research/` documents {#d}

**Verdict: CONFIRMED for the one checked in depth. PARTIAL for the rest — see caveat.**

### `research/design-anthropic-blog/` — stale on its most prominent claim

`03-blog-audit.md:27` and `README.md:53` both flag a live regression: `design.html:39` specifies
`max-width: 65ch` with a comment calling it the golden reading measure, while production ships
`81.25ch` at `src/App.vue:135` — *"25% wider than the design intent, directly harming readability."*

It was fixed:

```
$ git log --oneline -S "--measure" -- src/style.css
ce3ebf4 fix(design): restore golden reading measure to 68ch

$ grep -n "measure" src/style.css
19:  /* Layout — golden reading measure (~50-75 chars; see design.html) */
20:  --measure: 68ch;

$ grep -n "max-width: var(--measure)" src/App.vue
322:  max-width: var(--measure);
```

68ch sits inside the 50–75 range the comment states and near `design.html`'s 65ch. **The defect
described in the research doc no longer exists.**

**Fix.** Annotate the doc as resolved, citing `ce3ebf4`. Leaving it as-is invites someone to
"fix" a bug that is already fixed — which is exactly what nearly happened while producing this
audit.

### The other documents — spot-checked only

`research/accessibility/01-accessibility-plan.md`, `research/page-transitions/design.md`,
`research/aws-migration-plan.md`, and `research/cursor-theme.md` were not reconciled line by line.
Surface signals: the accessibility work appears substantially landed (`a83a54c`,
*"feat(a11y): add live regions, landmarks, and keyboard affordances"*, plus `a842e0e`,
*"feat(a11y): add an opt-in high-contrast palette"*, and a `high-contrast` class in `src/App.vue:2`);
the cursor theme is clearly shipped (see below). The AWS migration plan's status is unknown — the
stack is still Vercel + MongoDB.

**Caveat.** This is the one section of this audit that is *not* verified to the standard of the
rest. The `research-audit` skill exists precisely for this and should be run per document.

---

## Verified fine — evidence {#fine}

### The cursor system is live and deliberate

```
$ grep -rn "styles/cursors" src/main.ts
src/main.ts:3:import './styles/cursors.css'
```

81 of 86 PNGs referenced. `src/shared/cursor.ts` computes which cursor to draw and at what size;
`tests/src/styles/cursors.test.ts` (176 lines) covers it. `cursors.css:79-81` explains why the
default arrow is inlined rather than fetched:

> the visitor's own arrow first and then snap to Bibata, which reads as a bug

`scripts/extract-cursors.py` and `vendor/cursors/BibataModernIce.cursor` are the build-time
provenance for the PNGs — worth keeping precisely because they document where the artwork came from.

### No client/server duplication

```
$ grep -rn "src/shared" server/
server/lib/validation.ts:3:import { estimateReadingMinutes, MAX_READING_MINUTES } from '../../src/shared/reading-time.js'
server/models/Post.ts:3:import { slugify } from '../../src/shared/slug.js'
server/scripts/backfill-reading-time.ts:7:import { estimateReadingMinutes } from '../../src/shared/reading-time.js'
```

The server imports *from* `src/shared/`; there are no twins to drift apart. `reading-time.ts`'s
header comment states the arrangement is intentional — the module lives in `src/shared` rather than
`server/lib` so the frontend can import it without reaching into server code.

### Tailwind is wired in

```
vite.config.ts:2  import tailwindcss from '@tailwindcss/vite'
vite.config.ts:7  plugins: [vue(), tailwindcss()],
src/style.css:1   @import "tailwindcss";
```

`CLAUDE.md`'s "installed but not dominant" is accurate, not a euphemism for unused.

### Nothing unreferenced in `src/shared/` or `server/lib/`

Every module in both directories has at least one importer outside `tests/`. Checked per file.
