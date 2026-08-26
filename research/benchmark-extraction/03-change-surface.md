# Change surface — file:line inventory

Reference material for [Stage 1](01-stage-1-harden-in-place.md) and
[Stage 2](02-stage-2-split.md). Every claim here was verified against the code at
commit `a69dc1d` (2026-07-31).

> **Pre-Stage-1 snapshot.** Stage 1 landed in `48640f2`, so the `repoRoot` file:line inventory
> below describes the code *before* the split into `HARNESS_ROOT` / `subjectRoot`. It is still the
> map of what Stage 2 has to move, but do not use its line numbers against the current tree —
> `agent-benchmark/src/paths.mjs` and `src/subject.mjs` did not exist when it was written.

---

## 1. The four meanings of `repoRoot`

The single most useful thing to understand before touching this code. One parameter serves four
jobs; the split forces them apart.

| # | Meaning | Call sites | After the split |
|---|---|---|---|
| 1 | **Subject git repo** — `archive` / `show` / `diff` / `rev-list` | `engine.mjs:40,110,129,554,721`; `catalog.mjs:18`; `runner.mjs:54` | stays `paper` |
| 2 | **Dependency donor** — `join(root,'node_modules')` | `engine.mjs:167,607`; `doctor.mjs:31-32` | stays `paper` |
| 3 | **Harness asset root** — oracle source resolution | `engine.mjs:335,340`; `catalog.mjs:64-76,229` | → harness repo |
| 4 | **Runtime state root** — db, workspaces, results, spools | `repository.mjs:436`; `runner.mjs:178-179`; `engine.mjs:191`; `cli.mjs:992` | → harness repo |

**The only derivation** is `cli.mjs:26`:

```js
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
```

`cli.mjs:25` derives `manifestPath` the same way but is **correct as-is** — `benchmarks.json`
travels with the harness. Do not change it; do separate it conceptually from line 26.

---

## 2. Functions already taking `repoRoot`

The library layer is fully parameterized. These need no signature change beyond an optional rename
to `subjectRoot`:

| Function | Location |
|---|---|
| `prepareCase({repoRoot,...})` | `engine.mjs:86` |
| `defaultWorkspace(repoRoot, caseId)` | `engine.mjs:190` |
| `assertPreparedWorkspace(case, repoRoot, ws)` | `engine.mjs:194` |
| `verifyRunWorkspace({repoRoot,...})` | `engine.mjs:225` |
| `verifyLegacyWorkspace({repoRoot,...})` | `engine.mjs:245` |
| `candidateFingerprint({repoRoot,...})` | `engine.mjs:491` |
| `changedFileCoverage(case, repoRoot,...)` | `engine.mjs:534` |
| `evaluateCase({repoRoot,...})` | `engine.mjs:596` |
| `applyReferencePatch(case, repoRoot, ws)` | `engine.mjs:718` |
| `evaluateReferenceCase({repoRoot,...})` | `engine.mjs:749` |
| `evaluateBaselineCase({repoRoot,...})` | `engine.mjs:777` |
| `defaultDatabasePath(repoRoot)` | `repository.mjs:435` |
| `new BenchmarkRunner({repoRoot,...})` | `runner.mjs:177,192`; uses at `:51,837,1107` |

These **do** need both roots: `validateManifest` (`catalog.mjs:174`),
`validateHarnessSource` (`catalog.mjs:63`), `injectOracleFiles` (`engine.mjs:307`, call site `:652`),
`diagnoseEnvironment` (`doctor.mjs:18`), `assertSafeDatabasePath` (`database-path.mjs:36`).

---

## 3. Per-case oracle inventory

6 of 10 cases bundle exactly one oracle; `cli.test.ts:38-40` asserts `harnessFiles.length === 6`.

| rank | id | base | reference | oracleCommit | bundled oracle |
|---:|---|---|---|---|---|
| 1 | `auth-session-hardening` | `3a8db61e` | `801b47ed` | — | yes |
| 2 | `captcha-metric-gate` | `560ba4a7` | `4f30c147` | — | yes |
| 3 | `serverless-route-dispatch` | `da4562bd` | `1bca3ed9` | — | no |
| 4 | `notes-vertical-slice` | `abb2adca` | `936232fc` | — | yes |
| 5 | `content-auth-security` | `bde35d4a` | `156adebf` | `f4e2e831` | yes |
| 6 | `full-essay-search` | `fc8003ff` | `abb2adca` | — | yes |
| 7 | `accessibility-pass` | `e757893a` | `a83a54c6` | — | no |
| 8 | `post-metrics` | `c9ce5a6f` | `6bd81b3d` | — | yes |
| 9 | `hash-scroll-restoration` | `c18c08bd` | `0f3eaa38` | — | no |
| 10 | `post-media-tags-api` | `47e637be` | `556d4da8` | — | no |

**21 SHA fields, 20 distinct commits** — `abb2adca` is rank 4's base *and* rank 6's reference. All
20 verified reachable from `HEAD`; all predate the first benchmark commit `73585e3` (2026-07-18).
Oldest `2026-03-13`, newest `2026-07-10`.

Ranks 3, 7, 9, 10 are unaffected by the oracle move. They are **not** unaffected by the split —
all 10 cases still need `paper`'s git for commit existence, parentage, reachability, diff stats, and
historical test extraction. Every case also implicitly pulls `tests/setup.ts` and `vitest.config.ts`
(`catalog.mjs:134`, `engine.mjs:315`) plus `tsconfig.json` and `vite.config.ts` from `baseCommit`
(`engine.mjs:328-331`).

---

## 4. Oracle → `paper` source imports

All 11 specifiers, verified with `git cat-file -e`:

| oracle:line | specifier | at HEAD? | at base? | at ref? |
|---|---|---|---|---|
| `auth-session-hardening:20` | `../../api/auth-register.js` | **NO** | yes | yes |
| `auth-session-hardening:9` | `../../server/lib/db.js` | yes | yes | yes |
| `auth-session-hardening:13` | `../../server/models/User.js` | yes | yes | yes |
| `auth-session-hardening:21` | `../../server/lib/logger.js` | yes | yes | yes |
| `captcha-metric-gate:4` | `../../src/views/PostView.vue` | yes | yes | yes |
| `captcha-metric-gate:10` | `../../src/shared/hcaptcha` | yes | **NO** | yes |
| `content-auth-security:8` | `../../server/lib/security.js` | yes | **NO** | yes |
| `full-essay-search:5` | `../../src/views/HomeView.vue` | yes | yes | yes |
| `notes-vertical-slice:6` | `../../src/router` | yes | yes | yes |
| `notes-vertical-slice:7` | `../../src/views/HomeView.vue` | yes | yes | yes |
| `post-metrics-post-view:4` | `../../src/views/PostView.vue` | yes | yes | yes |

Two rows deserve emphasis:

- **`api/auth-register.ts` no longer exists at HEAD** — the per-endpoint handlers were collapsed by
  the `serverless-route-dispatch` commit, which is itself benchmark case rank 3. The oracle is
  correct at *its own* commits and is never resolved against HEAD.
- **`src/shared/hcaptcha` and `server/lib/security.ts` are deliberately absent at their base
  commits.** That is the anti-baseline property: the oracle must fail on the unsolved base, enforced
  by `cli.mjs:912-914`. Resolution failure at baseline is the intended signal, not a bug.

Plus one non-import coupling: `content-auth-security.test.ts:45` does
`readFileSync('vercel.json', 'utf8')` — a **relative** path resolved against `process.cwd()`, which
works only because `executeCheck` sets `cwd: evaluationRoot` (`engine.mjs:421`).

### The `../../` depth arithmetic

| Location | Depth | `../../` resolves to |
|---|---|---|
| authoring: `agent-benchmark/oracles/X.test.ts` | 2 below `paper` root | `paper` root |
| injected: `tests/benchmark-oracle/X.test.ts` | 2 below evaluation root | evaluation root |

Resolution only ever happens at the **destination** — `commandForCheck` (`engine.mjs:381-389`) runs
vitest with `cwd: checkRoot` against `tests/benchmark-oracle/…`. The oracles are never executed in
place, which is why the dangling `api/auth-register.js` import is harmless.

Two consequences:

- **The destination must stay two levels deep.** `catalog.mjs:231` pins the
  `tests/benchmark-oracle/` prefix. Flatten it to `tests/` or deepen it and all 11 imports break
  simultaneously across 6 cases.
- **It must also stay inside `tests/**`.** For 5 of the 6 harness cases the `baseCommit`
  `tsconfig.json` includes `tests/**/*.ts`, and `engine.mjs:328-331` overwrites `tsconfig.json` from
  `baseCommit` — so the `typecheck` check compiles the injected oracle. (`content-auth-security`'s
  base `bde35d4a` is the exception; its include list has no `tests/**`.) Move the destination
  outside `tests/` and 5 cases silently lose typecheck coverage of their oracle.

---

## 5. Test-suite split

**15 files, 97 tests** (collected via `vitest.benchmark.config.ts`). Zero imports from `paper`'s
`src/` or `server/` — every `../../` specifier resolves under `agent-benchmark/src/`.

### Self-contained — 11 files, 77 tests

| File | Tests | Fixtures |
|---|---:|---|
| `adapters.test.ts` | 7 | fake `codex`/`claude` executables in tmpdir |
| `database-path.test.ts` | 1 | synthetic `source/.git` + `candidate/` in tmpdir |
| `evaluator.test.ts` | 2 | writes its own `worker.mjs` |
| `history-cli.test.ts` | 10 | seeded temp SQLite; no manifest validation |
| `history-repository.test.ts` | 5 | tmpdir SQLite |
| `history-runner.test.ts` | 14 | fake repository object |
| `lease-recovery.test.ts` | 4 | tmpdir SQLite |
| `recovery.test.ts` | 1 | spool files in tmpdir |
| `repository.test.ts` | 8 | tmpdir SQLite |
| `results-comparison.test.ts` | 15 | `FakeRepository`, zero I/O |
| `terminal.test.ts` | 10 | `PassThrough` streams |

**Caveat on `history-cli.test.ts`:** it does not need `paper`, but it does need the subject path to
be a *defined string*. `cli.mjs:217-221` routes repository commands through `createRunnerResources`
→ `assertSafeDatabasePath`, and `canonicalFuturePath` calls `resolve(path)`
(`database-path.mjs:11`), which throws `ERR_INVALID_ARG_TYPE` on `undefined`. If the subject is
unconfigured, these 10 tests break — not because they need `paper`, but because the safety check
dereferences the path unconditionally. Handle it in Stage 1 §6's fail-fast validation.

**Also:** `history-runner.test.ts` never passes `runtimeRoot`, so the constructor default
(`runner.mjs:178`) applies. Nothing in `home()`/`compareFlow()` writes there, so it is latent — but
it assumes the root is a real writable directory. `runner.test.ts:64` does it properly.

### Require a real `paper` — 4 files, 20 tests

| File | Tests | Why |
|---|---:|---|
| `cli.test.ts` | 9 | 3 manifest-only; 1 needs git history; 2 need `node_modules`; 4 need git + `tar` |
| `engine-v2.test.ts` | 4 | all call `prepareCase` → `git archive` + tree-hash verification |
| `runner.test.ts` | 4 | **1 of 4** (`confirmed handoff creates a unique v2 workspace`, `:178`) reaches `prepareCase` |
| `v2-cli.test.ts` | 3 | **2 of 3** call `createRun()` → `assertManifestValid` → `prepareCase` |

Seven repo-free tests are trapped inside these files. See [02 §5](02-stage-2-split.md#optional-widen-the-fast-tier).

### Six sites that re-derive the root the same wrong way

`cli.test.ts:8-9`, `v2-cli.test.ts:15-16`, `history-cli.test.ts:11-12`, `engine-v2.test.ts:17-18`,
`runner.test.ts:16-17`, `history-runner.test.ts:13-14`:

```ts
const testCwd = process.cwd()
const repoRoot = basename(testCwd) === 'agent-benchmark' ? resolve(testCwd, '..') : testCwd
```

This conflates the harness root, the subject root, and the vitest cwd. It exists only because of the
dead `test` script in `agent-benchmark/package.json`. Once that script is gone there is exactly one
cwd, and **the conditional collapses to a single unconditional root.**

Plus 21 import sites across 12 files rewriting `'../../agent-benchmark/src/*.mjs'` → `'../../src/*.mjs'`,
and 21 `@ts-expect-error` directives across 13 files that must survive or be stripped together.

Hardcoded `paper` facts inside the tests, all of which survive the move because `paper` remains the
single subject: `cli.test.ts:176` pins `0f3eaa38…`; `:32,130` pin `caseCount === 10`; `:38-40` pins
`harnessFiles.length === 6`; `:108` pins the destination path literal.

---

## 6. Environment and external binaries

**Env vars read for configuration: none.** All configuration is CLI flags today. Stage 1 §6
introduces the first one — worth knowing, because `checkEnvironment()` (`engine.mjs:357-379`) is an
**allowlist**: `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SystemRoot`, `ComSpec`, `PATHEXT`.
Everything else is stripped from check subprocesses, so a new subject-path env var does not leak
into evaluations. That invariant becomes load-bearing.

**Env vars injected into checks** (`engine.mjs:373-378`): `CI=1`, `NODE_ENV=test`, `NO_COLOR=1`, and
`JWT_SECRET='benchmark-secret-that-is-at-least-32-characters'`. That last one is a **`paper`-specific
contract** (`paper` enforces ≥32 chars) baked into the engine. It stays hardcoded in a single-subject
harness, but it should be labelled as subject coupling.

**Binaries:**

| Binary | Used at | Probed by `doctor`? |
|---|---|---|
| `git` | `engine.mjs` ×13, `catalog.mjs:18`, `runner.mjs:52` | yes |
| `tar` | `engine.mjs:118` | yes |
| `cp` | `engine.mjs:287` | **no** |
| `node` (`process.execPath`) | `engine.mjs:384,392,401`; `evaluator.mjs:59` | version only |
| `npm` | **never invoked** | yes — and folded into `ready` |
| `codex` | `adapters.mjs:21-26` | yes |
| `claude` | `adapters.mjs:27-36` | yes |

Every evaluation sandbox is `mkdtempSync` under the OS temp dir (`engine.mjs:17,103,613,647,752,780`),
not under either repo. Unaffected by the split.

---

## 7. Full move / stay inventory

### Moves — 41 files, 14,542 LOC

**`agent-benchmark/` — 26 files, 9,697 LOC**

| File | LOC | Purpose |
|---|---:|---|
| `src/repository.mjs` | 1864 | SQLite run store: schema, migrations, WAL pragmas, leases, immutable-primary-evaluation trigger |
| `src/runner.mjs` | 1302 | `BenchmarkRunner` — home screen, config wizard, handoff, resume/history |
| `cli.mjs` | 1049 | Command dispatch + interactive home |
| `PRODUCT_SPEC.md` | 1108 | v2 spec: run lifecycle, wizard order, handoff, isolation, recovery |
| `src/engine.mjs` | 804 | `git archive` → workspace, oracle injection, check execution, scoring |
| `src/adapters.mjs` | 594 | Probes Codex CLI / Claude Code; capability gating; safe command quoting |
| `benchmarks.json` | 403 | The 10-case manifest |
| `src/results.mjs` | 361 | Result-comparison and detail view models |
| `src/catalog.mjs` | 323 | `loadManifest` / `sortedCases` / `validateManifest` |
| `src/terminal.mjs` | 213 | Readline wrapper, `ScriptedTerminal` test double |
| `oracles/notes-vertical-slice.test.ts` | 209 | bundled oracle |
| `README.md` | 176 | User-facing Chinese guide |
| `oracles/captcha-metric-gate.test.ts` | 170 | bundled oracle |
| `oracles/post-metrics-post-view.test.ts` | 161 | bundled oracle |
| `oracles/full-essay-search.test.ts` | 148 | bundled oracle |
| `src/evaluator.mjs` | 142 | Subprocess evaluation with heartbeat/cancel |
| `src/recovery.mjs` | 124 | Atomic checksummed evaluation spools |
| `oracles/auth-session-hardening.test.ts` | 117 | bundled oracle |
| `src/prompt.mjs` | 92 | Deterministic prompt bundle + SHA-256 |
| `TEST_REPORT.md` | 85 | Manual verification log, 2026-07-19 |
| `oracles/content-auth-security.test.ts` | 65 | bundled oracle |
| `src/database-path.mjs` | 60 | `assertSafeDatabasePath` |
| `src/checks.mjs` | 47 | Check ordering + Chinese labels |
| `src/doctor.mjs` | 46 | Environment diagnosis |
| `src/evaluator-worker.mjs` | 18 | stdin → `evaluateCase` → stdout worker |
| `package.json` | 16 | Nested package manifest |

**`tests/agent-benchmark/` — 15 files, 4,845 LOC.** Plus `vitest.benchmark.config.ts`.

### Stays in `paper`

- `tests/setup.ts` — `paper`'s own tests need it; the benchmark never did.
- The 6 oracles' *targets* — `src/views/PostView.vue`, `server/lib/security.ts`, etc. They are
  `paper`'s source, pulled from git at historical commits.
- All historical test files named in `checks[].files` — pulled from git, never copied.
- The `benchmark/*` tags — `paper`'s contract with the external harness.

### Becomes dead in `paper`

`better-sqlite3` devDependency · `benchmark` + `benchmark:test` scripts · `vitest.benchmark.config.ts` ·
the `tests/agent-benchmark/**` exclude and the `configDefaults` import that exists only to serve it ·
2 eslint ignore entries · 2 `.gitignore` entries · 3 `AGENTS.md` sections.
