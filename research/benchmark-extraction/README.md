# Extracting `agent-benchmark/` into a standalone repository

**Status (reconciled 2026-08-26):** **Stage 1 has landed. Stage 2 has not started, and Stage 1's
exit criteria are not all met.**

- **Stage 1 — landed** in `48640f2` (*refactor(benchmark): separate the harness root from the
  subject root*, 2026-08-01). `agent-benchmark/src/paths.mjs` and `src/subject.mjs` exist, the
  oracle contract is anchored to the harness, runtime state writes to
  `agent-benchmark/.agent-benchmark/`, `agent-benchmark/benchmark.config.json` is committed with
  the subject remote, and **all 21 annotated tags are pushed** (`benchmark/<case>/{base,ref}` plus
  `benchmark/content-auth-security/oracle`). `validate --json` reports `valid: true`, 10 cases,
  zero errors; `doctor` reports ready.
- **Two exit criteria fail** — both introduced by Stage 1, both one-line fixes. See
  [01 § Stage 1 exit criteria](01-stage-1-harden-in-place.md#stage-1-exit-criteria) for the
  detail:
  1. `npm run benchmark:test` — **3 of 15 files fail to collect**, so 22 tests never run
     (76 pass). `paths.mjs:17` derives `HARNESS_ROOT` with
     `fileURLToPath(new URL('..', import.meta.url))`, and under Vitest's transform
     `import.meta.url` is not a `file:` URL: *TypeError: The URL must be of scheme file*.
  2. `npm run lint` — **6 errors, all from generated candidate workspaces.** `.gitignore` was
     updated for the harness-local runtime dir (`agent-benchmark/.gitignore:5`), but
     `eslint.config.js:18` still ignores only the repo-root `.agent-benchmark/**`.
- **Stage 2 — not started.** No `git filter-repo` run, no separate repository, no CI. The
  harness is still 30 tracked files in `agent-benchmark/` plus 15 in `tests/agent-benchmark/`.

**Date:** 2026-07-31 (plan) · status reconciled 2026-08-26
**Scope:** move the commit-reproduction benchmark harness out of `paper` into its own git
repository, without weakening any of its integrity guarantees.

---

## Why

`paper` is a personal essay platform. The shipping product — `src/` + `server/` + `api/` — is
**7,780 LOC**. The benchmark harness that lives inside it is **14,542 LOC**:

| Component | Files | LOC |
|---|---:|---:|
| `agent-benchmark/` | 26 | 9,697 |
| `tests/agent-benchmark/` | 15 | 4,845 |
| **Total** | **41** | **14,542** |

*(2026-08-26: now 30 + 15 tracked files, 14,999 lines — Stage 1 added `paths.mjs`, `subject.mjs`,
`benchmark.config.json` and a harness-local `.gitignore`. The product side is 10,689 lines, so the
ratio is now ~1.4×, not 1.9×. The argument is unchanged.)*

The harness is ~1.9× the size of the product it is nested inside. It also imposes on `paper`:
a devDependency (`better-sqlite3`), two npm scripts, a second vitest config, an `exclude` rule in
the primary vitest config, two `.gitignore` entries, two eslint ignore entries, and three sections
of `AGENTS.md`.

Two facts make the split unusually cheap:

1. **The histories are disjoint.** Of 81 commits on `main`, exactly **7** touch the benchmark, and
   **zero** commits touch both the benchmark and `src/`/`server/`/`api/`. All benchmark work landed
   between 2026-07-18 and 2026-07-25. There is no interleaving to untangle — normally the entire
   cost of a `filter-repo` split.
2. **The library layer is already parameterized.** Every consumer takes `repoRoot` as an argument.
   The subject repo is derived in exactly one place, `agent-benchmark/cli.mjs:26`.

One fact makes it harder than it looks:

3. **The benchmark's subject matter *is* `paper`'s git history.** It pins 21 SHA fields across 20
   distinct commits, `git archive`s `paper` at each `baseCommit`, and requires `paper` as a fully
   `npm install`-ed working tree. The harness can be moved; the dependency cannot be removed.

---

## The nine decisions

| # | Decision | Choice | Where it is worked out |
|---|---|---|---|
| 1 | Territory | Standalone repo, single-subject | below |
| 2 | Oracles | Move to the harness repo; integrity re-anchored to `harnessRoot` | [01](01-stage-1-harden-in-place.md#2-re-anchor-the-oracle-contract) |
| 3 | History | Preserve + flatten via `git filter-repo`; `paper`'s history untouched | [02](02-stage-2-split.md#1-the-split) |
| 4 | Subject resolution | Committed config + layered override | [01](01-stage-1-harden-in-place.md#4-the-config-loader) |
| 5 | Runtime state | Defaults to `.agent-benchmark/` inside the harness repo | [01](01-stage-1-harden-in-place.md#3-re-point-runtime-state) |
| 6 | SHA durability | Annotated tags in `paper`; manifest checks tags, not `main` | [01](01-stage-1-harden-in-place.md#5-tag-the-pinned-commits) |
| 7 | Sequencing | Harden in place, then split | [01](01-stage-1-harden-in-place.md), [02](02-stage-2-split.md) |
| 8 | Deliverable | This directory + `research/codebase-audit/` | — |
| 9 | CI | `unit` every push + `integration` gated | [02](02-stage-2-split.md#5-ci) |

### 1. Territory — standalone repo, single-subject

The harness moves to its own repository. It continues to benchmark `paper` specifically: it keeps
`paper`'s SHAs and calls `paper`'s npm script names (`typecheck`, `build`). It does **not** become
a generic multi-subject harness.

*Rejected:* a generic harness with `paper` as the first "suite". That is speculative architecture
for a second subject that does not exist, and the first step is identical either way — parameterize
the subject root. It can be promoted later without rework.

*Rejected:* an npm workspace inside `paper`. Tidies the root but does not produce an independent
project, which was the requirement.

*Rejected:* `paper` as a git submodule of the harness. Buys determinism that tags (decision 6) buy
more cheaply, at the cost of submodule friction.

### 2. Oracles — move, and re-anchor the integrity checks

The six bundled oracle files (870 LOC) move to the harness repo. `validateHarnessSource`'s
containment, git-tracked, and SHA-256 checks re-anchor to the **harness** repo.

The check exists to stop grading rules from drifting silently. Today that guarantee is anchored in
the same repo the evaluated agent works from. After the move the oracle is a committed, hash-pinned
file in a repo the evaluated agent has no filesystem relationship to at all — **the same invariant
with better isolation**.

Leaving the anchor on `repoRoot` would be an actual regression: it would ask the repository *under
test* to vouch for the grading rule. See [01 §2](01-stage-1-harden-in-place.md#2-re-anchor-the-oracle-contract).

### 3. History — preserve and flatten

`git filter-repo` over a fresh clone, keeping `agent-benchmark/`, `tests/agent-benchmark/`, and
`vitest.benchmark.config.ts`, with renames that flatten the harness to the new repo root. All 7
commits carry over with original authorship and dates.

**`paper`'s own history is not rewritten.** Purging the benchmark from `paper`'s past would
technically be safe — all 20 pinned commits predate the first benchmark commit `73585e3`, so
`filter-repo` would leave their trees and parents untouched, preserving both their SHAs and their
reachability. But it would rewrite 7 benchmark commits plus every app commit after them and require
a force-push of the very history the benchmark consumes as its dataset. The only gain is clone size.

### 4. Subject resolution — committed config, layered override

```
benchmark.config.json      (committed)     what the subject IS
  subject.remote: <paper's remote URL>
  subject.ref:    main

resolution order at runtime                where the subject IS
  1. --subject <path>
  2. $PAPER_BENCHMARK_SUBJECT
  3. .benchmark.local.json   (gitignored)
  4. fail with a doctor-style remediation message
```

Provenance stays in git; machine-specific absolute paths do not. The interactive TTY entry point
(`cli.mjs:456-484`) takes no flags at all and needs a persistent source, which is what rules out a
flag-only design.

**Auto-discovery is explicitly rejected.** A mis-discovered subject root feeds
`assertSafeNewWorkspace`, `assertSafeDatabasePath`, and `cloneDependencies` — meaning
`git archive` and `cp` run against the wrong tree with the containment guards silently anchored to
the wrong root.

### 5. Runtime state — harness-local

`defaultDatabasePath()` and `defaultWorkspace()` currently derive from `repoRoot`. Once `repoRoot`
is an external `paper`, the harness would write its SQLite database and every materialized candidate
workspace — a full copy of the repo per run — back into `paper`. That is precisely the pollution the
extraction removes. Runtime state defaults to `.agent-benchmark/` inside the harness repo, keeping
the existing on-disk layout and the explicit-path override.

### 6. SHA durability — tags, not `main`

`benchmarks.json` records `sourceRef: "main"` and checks reachability with
`merge-base --is-ancestor <ref> main`. It records **no remote URL, no expected tip, no tag**.

While the harness lives inside `paper`, a history rewrite touches both and the breakage is visible
in one place. Split apart, the harness pins 20 commits into a repo it cannot see change, and the
failure is graded: a local rebase flips every case to `reference commit is not on main`; a
force-push followed by GC makes all 10 cases permanently unreproducible.

Annotated tags in `paper` fix **both** failure modes with one mechanism — tags resist GC so the
objects survive, and tag-based reachability stops depending on where `main` currently points, so
rebasing `paper` no longer invalidates anything. It also makes the coupling visible inside `paper`.

### 7. Sequencing — harden in place, then split

Stage 1 happens **inside `paper`**, where the full 97-test suite still runs green and both roots
still point at the same directory. Every refactor is proven behavior-preserving before anything
moves. Stage 2 is then a file move plus a config value.

The alternative — split first, fix after — means debugging 20 broken integration tests in a repo
whose suite cannot fully run until the config mechanism exists, with no green baseline to regress
against.

### 9. CI — two jobs

There is no CI anywhere in `paper` today. The new repo gets:

- **`unit`** — every push. Checkout the harness only, `npm ci`, run the 11 self-contained files
  (77 tests) in seconds. No subject repo needed. *This is the concrete payoff of extraction.*
- **`integration`** — gated on a schedule or label. Additionally checkout `paper` at
  `fetch-depth: 0`, `npm ci` in the subject, run the remaining 4 files (20 tests) serially, ~7 min.

The scheduled `integration` run is what makes decision 6 pay off: it is the only thing that detects
the pinned commits or tags rotting.

---

## Forced calls (not decisions)

These follow from the code and are not open questions:

- **`engines` → `>=24`.** `better-sqlite3` is a native module and the checks execute `paper`'s
  `vitest`/`vue-tsc`/`vite` via `process.execPath` (`engine.mjs:384,392,401`). A node-major skew
  against the tree `paper`'s `node_modules` was built with produces `NODE_MODULE_VERSION` errors.
  `paper`'s `.nvmrc` pins 24, so the harness's current `>=22` is already a lie. The runtime gate at
  `cli.mjs:184-189` rises to match.
- **The harness stays Chinese-language.** Translating the TUI, prompts, and docs is not extraction
  work.
- **`oracles/` must be excluded from the new repo's tsconfig / eslint / vitest globs.** In `paper`
  this never mattered because `agent-benchmark/` sits outside every include glob. In the harness
  repo the oracles become first-class source, and their 11 `../../` imports into `paper` would fail
  to resolve. This is a failure mode the move *creates*.
- **`tests/benchmark-oracle/` stays exactly two levels deep.** All 11 oracle imports resolve by
  depth arithmetic. Flatten or deepen the destination and they break simultaneously across 6 cases.
- **`better-sqlite3@12.11.1` becomes a real dependency** of the new repo, at the same exact pin.
- **`allowJs: false` stays**, or all 21 `@ts-expect-error` directives get stripped in the same
  commit — otherwise they become `Unused '@ts-expect-error' directive` errors.
- **`happy-dom` and `tests/setup.ts` are dropped** from the new vitest config. No benchmark test
  touches the DOM, and `tests/setup.ts` only sets `JWT_SECRET` for `paper`'s server modules, which
  the benchmark tests never import.
- **The `test` script in `agent-benchmark/package.json` is deleted.** It is already silently dead —
  `--root ..` makes vitest load `paper`'s root config, whose `exclude` removes
  `tests/agent-benchmark/**`, so it collects **zero tests**.

---

## Reading order

1. [`01-stage-1-harden-in-place.md`](01-stage-1-harden-in-place.md) — everything done inside
   `paper`, with the suite green throughout.
2. [`02-stage-2-split.md`](02-stage-2-split.md) — the split itself, new-repo scaffolding,
   `paper`-side cleanup, CI.
3. [`03-change-surface.md`](03-change-surface.md) — the file:line inventory. Reference material for
   both stages.
