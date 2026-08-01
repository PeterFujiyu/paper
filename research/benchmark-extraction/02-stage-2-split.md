# Stage 2 — the split

Prerequisite: every [Stage 1 exit criterion](01-stage-1-harden-in-place.md#stage-1-exit-criteria)
is met. At that point the harness already resolves its own root from `import.meta.url`, reads its
subject from config, writes runtime state next to itself, and validates against tags. Stage 2 moves
files and deletes a fallback.

---

## 1. The split

Work on a **fresh clone**, never the working repo — `git filter-repo` refuses to run on a repo with
a remote by default, and you want `paper` untouched.

```bash
git clone /path/to/paper /tmp/harness-split
cd /tmp/harness-split
git filter-repo \
  --path agent-benchmark/ \
  --path tests/agent-benchmark/ \
  --path vitest.benchmark.config.ts \
  --path-rename agent-benchmark/: \
  --path-rename tests/agent-benchmark/:tests/
```

`filter-repo` is not bundled with git; install it first (`brew install git-filter-repo`).

**Expected result:** 7 commits, original authorship and dates preserved, spanning 2026-07-18 →
2026-07-25. No collision between the two renames — `agent-benchmark/` contains `cli.mjs`, `src/`,
`oracles/`, `benchmarks.json`, `package.json`, and three docs; `tests/agent-benchmark/` maps to a
`tests/` directory that does not otherwise exist in the harness.

**Verify the split before proceeding:**

```bash
git log --oneline           # expect 7 commits
git ls-files | wc -l        # expect 42 (41 tracked + vitest config)
ls                          # cli.mjs src/ oracles/ tests/ benchmarks.json package.json *.md
```

`paper`'s history is **not** rewritten. It keeps the 7 benchmark commits in its past; only the
working tree loses the files, via an ordinary deletion commit (§4).

---

## 2. New-repo scaffolding

Nothing here is logic — Stage 1 did the logic. This is the packaging the harness never had because
it was borrowing `paper`'s.

### `package.json`

```jsonc
{
  "name": "paper-agent-benchmark",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },          // raised from >=22; see README forced calls
  "bin": { "paper-agent-benchmark": "./cli.mjs" },
  "scripts": {
    "start": "node cli.mjs",
    "test": "vitest run",                  // the --root .. reach-up is gone
    "validate": "node cli.mjs validate",
    "lint": "eslint ."
  },
  "dependencies": {
    "better-sqlite3": "12.11.1"            // exact pin, was paper's devDependency
  },
  "devDependencies": {
    "vitest": "^4.1.0",
    "typescript": "^5.9.3",
    "@types/node": "^25.3.5",
    "eslint": "^10.4.1",
    "typescript-eslint": "^8.60.1"
  }
}
```

`better-sqlite3` becomes a **real dependency**, not a devDependency — `src/repository.mjs:4`
imports it at runtime, and `cli.mjs:821` dynamically imports it in `doctor`.

`bin` already pointed at `./cli.mjs` with the shebang and executable bit in place; it just becomes
the primary entry point instead of being reached through `paper`'s `npm run benchmark`.

There is **no lockfile** in `agent-benchmark/` today. Generate one and commit it.

### `vitest.config.ts`

Replaces `vitest.benchmark.config.ts`. Three deliberate changes from the file it replaces:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['oracles/**'],   // NEW — see below, this is the easiest self-inflicted breakage
    fileParallelism: false,
    // dropped: environment: 'happy-dom'  — no benchmark test touches the DOM
    // dropped: setupFiles: ['tests/setup.ts'] — only set JWT_SECRET for paper's server modules
  },
})
```

**The `exclude` is not optional.** `oracles/*.test.ts` look like ordinary test files and would be
collected by any sane `include` glob. They would fail instantly — no `vue`, no `@vue/test-utils`,
and no `src/views/HomeView.vue` to import. They are *data*, not tests.

`fileParallelism: false` is now over-broad: it exists because 4 files contend on `git archive` and
disk, while the other 11 parallelize fine. A `projects` split (fast tier parallel, integration tier
serial) is a reasonable follow-up but is not required for the move.

There is **no coverage instrumentation for the harness today** — `paper`'s coverage config scopes to
`src/**/*.ts` and `server/lib/**/*.ts`. The new repo starts from zero on that front.

### `tsconfig.json`

The tests are `.ts`, the harness is `.mjs`. Two constraints:

- **Keep `allowJs: false`.** All 21 `@ts-expect-error` directives across 13 test files exist purely
  because the `.mjs` imports do not resolve under `allowJs: false`. Enable `allowJs` (or add `.d.ts`
  files) and every one becomes an `Unused '@ts-expect-error' directive` error. If you want typed
  harness imports, strip all 21 in the same commit.
- **Exclude `oracles/`** for the same reason as vitest. Their 11 `../../` specifiers point at
  `paper`'s source and cannot resolve from the harness root.

Keep `types: ["node"]`. Drop `lib: ["DOM", "DOM.Iterable"]` and `jsx` — this repo has no Vue.

### `eslint.config.js`

`paper`'s config is built from `eslint-plugin-vue` + `@vue/eslint-config-typescript`, neither of
which belongs here. But note what the current setup actually does: `.mjs` files receive **20 active
`@typescript-eslint` rules** (`no-unused-vars`, `no-unused-expressions`, `no-explicit-any`, …) via
`typescript-eslint/parser`; the other 83 active rules are `vue/*` and never fire. So the replacement
needs `typescript-eslint` to preserve today's real coverage, and nothing Vue-related — **except**
that it must still parse the Vue-importing oracle files if they are not ignored. Ignoring
`oracles/` is simpler and consistent with the vitest and tsconfig treatment.

Add `.agent-benchmark/` to the ignore list — that is where runtime state now lives (Stage 1 §3).

### `.gitignore`

Both entries were inherited from `paper` and must be declared here:

```
node_modules
/.agent-benchmark/
.benchmark.local.json
```

The third is new — the gitignored local subject-path override from Stage 1 §6.

---

## 3. Flip the config to an external subject

Delete the Stage 1 fallback (`new URL('..', import.meta.url)`) from the resolution chain. The
subject now **must** come from `--subject`, `$PAPER_BENCHMARK_SUBJECT`, or `.benchmark.local.json`,
and the startup validation from Stage 1 §6 becomes the enforcement point.

Write `.benchmark.local.json` pointing at your `paper` checkout and confirm:

```bash
node cli.mjs doctor        # ready: true
node cli.mjs validate      # 10 cases, valid, zero errors
```

If `validate` reports missing tags, the subject clone was made without them —
`git -C <paper> fetch --tags`.

---

## 4. `paper`-side cleanup

One ordinary commit. Nothing here rewrites history.

| Action | Target |
|---|---|
| Delete | `agent-benchmark/` (26 files, 9,697 LOC) |
| Delete | `tests/agent-benchmark/` (15 files, 4,845 LOC) |
| Delete | `vitest.benchmark.config.ts` |
| Remove scripts | `package.json` — `benchmark`, `benchmark:test` |
| Remove devDependency | `package.json` — `better-sqlite3` (nothing in `src/`, `server/`, `api/`, or `paper`'s tests imports it) |
| Remove exclude | `vitest.config.ts` — `'tests/agent-benchmark/**'`, the two-line comment, **and the now-unused `configDefaults` import on line 1** |
| Remove ignores | `eslint.config.js` — `.agent-benchmark/**`, `agent-benchmark-claude/**`, and the comment explaining them |
| Remove ignores | `.gitignore` — `/.agent-benchmark/`, `/agent-benchmark-claude/` |
| Rewrite | `AGENTS.md` — the `agent-benchmark/` line in Repository Map, the two benchmark command lines, and the `tests/agent-benchmark/cli.test.ts` bullet in Test Layout |

**Keep the tags.** They are now `paper`'s contract with the harness. Consider a one-line note in
`AGENTS.md` explaining that `benchmark/*` tags are load-bearing for an external repository and must
not be deleted — otherwise they look like debris to a future cleanup.

**Verify after cleanup:**

```bash
npm run typecheck && npm run lint && npm test    # 331 tests, unchanged
npm run build
git grep -n "agent-benchmark"                    # expect only the AGENTS.md note, if you add one
```

---

## 5. CI

The new repo is where CI finally appears — `paper` has none, and this plan does not add any to it.

### `unit` — every push

```yaml
- checkout: harness repo only
- setup-node: 24
- npm ci
- npx vitest run tests/  (11 self-contained files, 77 tests)
```

No subject repo, no git history, no network beyond npm. Runs in seconds. **This job is the concrete
payoff of the extraction** — 77 of 97 tests become runnable with no `paper` present at all.

The 11 self-contained files: `adapters`, `database-path`, `evaluator`, `history-cli`,
`history-repository`, `history-runner`, `lease-recovery`, `recovery`, `repository`,
`results-comparison`, `terminal`.

### `integration` — scheduled or label-gated

```yaml
- checkout: harness repo
- checkout: paper       # fetch-depth: 0  <- MANDATORY
- npm ci                # in BOTH checkouts
- export PAPER_BENCHMARK_SUBJECT=<paper path>
- npx vitest run --no-file-parallelism  (4 files, 20 tests)
```

The 4 files that need a real `paper`: `cli.test.ts` (9 tests), `engine-v2.test.ts` (4),
`runner.test.ts` (4), `v2-cli.test.ts` (3).

Hard requirements, each verified against source rather than assumed:

1. **`fetch-depth: 0`.** `actions/checkout` defaults to a shallow clone. `git archive <baseCommit>`
   and the tree-hash verification need full history; a shallow clone fails all 20 tests.
2. **`npm ci` inside the *subject* checkout**, not just the harness. `doctor.mjs:31` computes
   `available: existsSync(join(subjectRoot, 'node_modules'))` and `cli.test.ts:148` asserts it is
   `true`. The checks execute `paper`'s `vitest`/`vue-tsc`/`vite` out of that tree.
3. **`git`, `npm`, and `tar` on `PATH`** — asserted at `cli.test.ts:149`.
4. **A writable, `git status`-stable subject checkout.** `cli.test.ts:155,181` snapshot
   `git status --porcelain=v1 --untracked-files=all` before and after and assert equality; `:267`
   plants a symlink at `join(subjectRoot, 'package.json')`. Any CI step that mutates the subject
   mid-run (a cache restore, a lockfile rewrite) breaks these. They are the guard tests proving the
   harness never dirties the repo under test — they matter.
5. **Tags must be fetched.** See §3.
6. **Budget ~7 minutes.** `TEST_REPORT.md` records 366s for the full suite run by hand. One test
   (`v2-cli.test.ts:323`) allows 200s on its own; `validate --run-gold` (`cli.test.ts:289`) prepares
   *and* evaluates both a baseline and a reference, running `paper`'s `typecheck` and `build` inside
   the candidate workspace.

Because of (6), gate `integration` on a schedule or an explicit label rather than running it per
push. **A weekly scheduled run is what makes the tagging decision pay off** — it is the only
mechanism that detects the pinned commits or tags rotting out from under the manifest.

### Optional: widen the fast tier

Seven repo-free tests are currently trapped inside repo-requiring files — 3 in `cli.test.ts`
(`list --json`, `show --json`, the four-weighted-checks assertion), 3 in `runner.test.ts`
(`home()`, ad-hoc resume, cancelled wizard), 1 in `v2-cli.test.ts` (`non-TTY run fails fast`).
Relocating them takes the `unit` tier from 77 to 84 tests. Worth doing eventually; not worth
bundling into a move that already touches all 15 files.

---

## Stage 2 exit criteria

- [ ] New repo: 7 commits, original dates, flat layout.
- [ ] New repo: `npm ci && npm test` green — 97 tests.
- [ ] New repo: `node cli.mjs doctor` → `ready: true` against an external `paper`.
- [ ] New repo: `node cli.mjs validate` → 10 cases valid, zero errors.
- [ ] New repo: one full `prepare` → agent → `evaluate` cycle scores a case end to end.
- [ ] New repo: `validate --run-gold` passes for a harness-oracle case.
- [ ] New repo: nothing is written into the subject checkout — `git status` on `paper` stays clean.
- [ ] `paper`: `npm run typecheck && npm run lint && npm test && npm run build` all green.
- [ ] `paper`: `git grep agent-benchmark` returns nothing unintended.
- [ ] `paper`: the `benchmark/*` tags exist and are pushed.
