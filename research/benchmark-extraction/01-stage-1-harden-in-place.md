# Stage 1 — harden in place

Everything here happens **inside `paper`**, with `agent-benchmark/` still nested where it is. The
97-test benchmark suite and `paper`'s own 331-test suite must stay green after every step.

The goal is that Stage 2 becomes a file move plus a config value — no logic changes, nothing to
debug in a repo without a working test suite.

**Status: landed in `48640f2` (2026-08-01), with two exit criteria still failing.** Sections 1–8
below were all implemented as written — verified section by section against the code on 2026-08-26,
not taken from the commit message. The gaps are in the exit criteria at the end of this file.

---

## The key insight that makes Stage 1 safe

`repoRoot` today serves **four distinct jobs** (see [03 §1](03-change-surface.md#1-the-four-meanings-of-reporoot)).
Two of them stay with `paper`, two of them must follow the harness. Stage 1 introduces the second
root as a separate parameter while both still resolve inside `paper`.

The derivation is chosen so **the same expression is correct before and after the split**:

```js
// agent-benchmark/cli.mjs — today, cli.mjs sits at agent-benchmark/cli.mjs
const harnessRoot = fileURLToPath(new URL('.', import.meta.url))   // -> paper/agent-benchmark/
// after the split, cli.mjs sits at the new repo root
                                                                    // -> <harness-repo>/
```

`manifestPath` at `cli.mjs:25` already uses this shape (`new URL('./benchmarks.json', ...)`) and
needs no change at all — `benchmarks.json` travels with the harness in both worlds.

The corollary is that **`benchmarks.json`'s `harnessFiles[].source` paths should be rewritten to
their post-split form during Stage 1**, i.e. `agent-benchmark/oracles/X.test.ts` → `oracles/X.test.ts`.
Resolved against `harnessRoot` they are correct in both stages, so Stage 2 never has to touch the
manifest. `git -C paper/agent-benchmark ls-files --error-unmatch -- oracles/X.test.ts` resolves
correctly — git locates the enclosing repository and interprets the pathspec relative to `-C`.

---

## 1. Split `repoRoot` into `harnessRoot` and `subjectRoot`

**What.** Replace the single overloaded parameter with two, and thread both through every consumer
that needs the second one.

**Where.**

| Change | Location |
|---|---|
| Add `harnessRoot` derivation; keep `subjectRoot` defaulting to `new URL('..', ...)` | `cli.mjs:26` |
| `validateManifest(manifest, repoRoot)` → takes both roots | `catalog.mjs:174` |
| `validateHarnessSource(repoRoot, file)` → `validateHarnessSource(harnessRoot, file)` | `catalog.mjs:63` |
| `injectOracleFiles(case, repoRoot, evalRoot)` → takes both roots | `engine.mjs:307`, call site `engine.mjs:652` |
| `diagnoseEnvironment(manifest, repoRoot)` → takes both roots | `doctor.mjs:18`, call site `cli.mjs:815` |
| `assertSafeDatabasePath({repoRoot, ...})` → gains `workspacesRoot` | `database-path.mjs:36` |
| `assertSafeNewWorkspace` → learns about the harness repo | `engine.mjs:60-71` |

Everything else in [03 §2](03-change-surface.md#2-functions-already-taking-reporoot) keeps taking a
single root — it is the *subject* root, and its meaning is unchanged. Renaming the parameter from
`repoRoot` to `subjectRoot` in those functions is optional but recommended for clarity; it is a pure
rename with no behavioral effect.

**During Stage 1** both roots are real directories inside `paper`, so every existing test exercises
the new signatures. This is the whole point of the staging.

**Verify.** `npm run benchmark:test` — all 97 tests still pass. `npm run benchmark -- validate` —
all 10 cases still valid.

---

## 2. Re-anchor the oracle contract

This is the hardest coupling in the extraction. Three sites enforce it, and they must move
**together** — re-anchoring one and not another produces the worst possible state, where `validate`
passes against the harness copy while `evaluate` crashes looking in the subject repo.

### 2.1 `validateHarnessSource` — `catalog.mjs:63-81`

Five checks, all currently anchored to `repoRoot`. All five move to `harnessRoot`:

| Line | Check | Defends against |
|---|---|---|
| `:64` | `pathIsContained(root, file.source)` | path traversal out of the trusted root |
| `:67-68` | `!stat.isFile() \|\| stat.isSymbolicLink()` | symlink/FIFO redirection to attacker content |
| `:69-71` | `realpathSync` containment | symlinked-ancestor escape |
| `:72` | `git ls-files --error-unmatch` | provenance — the rule must have passed review |
| `:75-76` | SHA-256 match | content substitution |

Guards 1, 3, 4 are anchor-agnostic — they need *some* trusted root, and `harnessRoot` derived from
`import.meta.url` is a better one than a user-supplied path. Guard 2 (`git ls-files`) only keeps its
meaning if it moves: post-split, `benchmarks.json`, the recorded SHA-256 values, and the oracle bytes
all live in the same repo, which makes cross-repo skew structurally impossible.

**Leaving guard 2 anchored to the subject would be an active regression** — it would ask the
repository under test to vouch for the grading rule.

### 2.2 The twin in the injection path — `engine.mjs:333-347`

Byte-for-byte the same logic minus the git-tracked check. Same re-anchoring, same commit.

Note the pre-existing asymmetry: `catalog.mjs` checks git-tracked, `engine.mjs` does not. So an
untracked-but-correctly-hashed oracle is rejected by `validate` and accepted by `evaluate`. The
re-anchoring must not widen this. Closing it is optional and cheap.

### 2.3 The prefix literal — `catalog.mjs:229`

```js
file.source.startsWith('agent-benchmark/oracles/')   // -> 'oracles/'
```

A pure string test. It must change in lockstep with the manifest rewrite described above, or every
case fails with `invalid harness file mapping` at `catalog.mjs:233`.

The **destination** prefix at `catalog.mjs:231` (`tests/benchmark-oracle/`) does **not** change —
it names a path inside the ephemeral evaluation copy, anchored to neither repo.

### 2.4 Optional hardening while you are here

`git ls-files --error-unmatch` checks the **index**, not `HEAD`. A tracked file with uncommitted
working-tree modifications still passes. So "edit the oracle in place, recompute the hash, paste it
into `benchmarks.json`" passes both the tracking and checksum guards today. The only signal that
would notice is `doctor.mjs:25-28`'s `sourceDirty` — which is **reported but not enforced**
(`ready` at `doctor.mjs:34-36` does not include it).

If you want a real anti-drift guarantee, compare against `git -C harnessRoot show HEAD:<source>`
rather than the working tree. This is the natural moment to do it, since the code is already open.

**Verify.** `tests/agent-benchmark/cli.test.ts:38-40` asserts exactly 6 harness files with 64-hex
checksums; `:108` asserts the literal destination; `:119-134` asserts `validate --json` returns
`valid === true` with zero errors. These are the regression net — they must stay green.

---

## 3. Re-point runtime state

**What.** Runtime state stops deriving from the subject root.

| Path | Current | Becomes |
|---|---|---|
| SQLite DB | `repository.mjs:435-437` → `<repoRoot>/.agent-benchmark/benchmark.sqlite3` | `<harnessRoot>/.agent-benchmark/…` |
| Runtime root | `runner.mjs:178` → `join(repoRoot, '.agent-benchmark')` | `<harnessRoot>/.agent-benchmark` |
| Results | `runner.mjs:179`, duplicated at `cli.mjs:992` | follows `runtimeRoot` |
| Recovery spools | `recovery.mjs:19-21` (mode `0o700` at `:46`) | follows `runtimeRoot` |
| v2 workspaces | `runner.mjs:800` | follows `runtimeRoot` |
| v1 workspaces | `engine.mjs:190-192` `defaultWorkspace()` | follows `runtimeRoot` |

`BenchmarkRunner` already accepts `runtimeRoot` as a constructor override (`runner.mjs:178`) — it is
simply never passed by `cli.mjs:236-241`. That side is a one-line fix. `defaultDatabasePath()` and
the duplicated literal at `cli.mjs:992` are the two that need real work.

**During Stage 1** `<harnessRoot>/.agent-benchmark` is `paper/agent-benchmark/.agent-benchmark`,
which `paper`'s `.gitignore:37` rule (`/.agent-benchmark/`) does **not** cover — that pattern is
anchored to the repo root. Add a `.gitignore` inside `agent-benchmark/` during Stage 1; it travels
with the harness in Stage 2 and becomes the new repo's ignore file.

**Verify.** Run a full case end-to-end and confirm nothing is written under `paper/` outside
`agent-benchmark/.agent-benchmark/`. `git status --porcelain` on `paper` stays clean.

---

## 4. Fix the guards that will fail open

Both of these are silent under-protection, not errors. They pass while protecting nothing.

### 4.1 `assertSafeDatabasePath` — `database-path.mjs:34-59`

Guard #2 (`:49-52`) computes its forbidden zone as `join(source, '.agent-benchmark', 'workspaces')`
where `source` is `repoRoot`. Once workspaces move (§3), that literal points at a directory that
holds no workspaces. The check keeps passing.

Guard #3 (`enclosingPreparedWorkspace`, `:56-58`) is then the only real defense, and it only fires
**after** a workspace has been prepared — `.benchmark-session.json` is written at `engine.mjs:161-164`.
Between "operator names a database path under the future workspaces directory" and "prepare runs",
nothing catches it. Guard #2 covers that window today.

**Fix.** Take `workspacesRoot` as an explicit input rather than re-deriving it. Extend guard #1
(`:44-47`) to reject both `<subject>/.git` and `<harness>/.git`.

Note also that the function **fails open by design** — there is no requirement that the database be
*inside* any particular root. Moving it to a separate repo will not throw. That is intentional and
should stay, but it is why the explicit `workspacesRoot` matters.

### 4.2 `assertSafeNewWorkspace` — `engine.mjs:60-71`

Rejects `workspace === repoRoot` and anything under `<repoRoot>/.git`, but knows nothing about the
harness repo. After the split, `--workspace <harnessRepo>/.git/anything` passes all three checks —
the `existsSync` guard at `:69` only rejects paths that already exist — and `git archive | tar -x`
would unpack `paper`'s tree inside the harness's own `.git`.

**This is a new hazard the extraction creates.** Fix it in Stage 1, while both roots are still
testable in one place.

**Verify.** Extend `tests/agent-benchmark/database-path.test.ts` — it already builds fully synthetic
`source/.git` + `candidate/` fixtures in a tmpdir (`:20-28`), so a harness-root case is a natural
addition.

---

## 5. Tag the pinned commits

**What.** Create annotated tags in `paper` for all pinned commits, record them in the manifest, and
replace the `main`-reachability check with tag identity.

The manifest pins **21 SHA fields across 20 distinct commits** — 10 `baseCommit`, 10
`referenceCommit`, 1 `oracleCommit`. `abb2adca` appears twice (rank 4's base and rank 6's
reference), so it carries two tags.

Suggested scheme:

```
benchmark/<case-id>/base     -> baseCommit
benchmark/<case-id>/ref      -> referenceCommit
benchmark/<case-id>/oracle   -> oracleCommit   (content-auth-security only)
```

All 20 distinct commits are verified reachable from `HEAD` today, and all predate the first
benchmark commit `73585e3` (2026-07-18) — the oldest is `156adeb`/`bde35d4` (2026-03-13), the newest
`0f3eaa3`/`1bca3ed`/`c18c08b`/`da4562b` (2026-07-10).

**Manifest changes.** Add `baseTag` / `referenceTag` / `oracleTag` per case.

**Check changes — `catalog.mjs:270-292`.**

| Current | Becomes |
|---|---|
| `merge-base --is-ancestor <referenceCommit> main` | `rev-parse <referenceTag>^{commit}` equals `referenceCommit` |
| `merge-base --is-ancestor <oracleCommit> main` | `rev-parse <oracleTag>^{commit}` equals `oracleCommit` |
| `oracleFollowsReference` (`:287-292`) | **keep as-is** — a genuine semantic invariant |

Tag identity is strictly stronger than reachability from a mutable branch: it proves the subject
repo has the tag *and* that it points where expected. `sourceRef: "main"` becomes vestigial and can
be dropped or repurposed as documentation of the branch the cases were mined from.

**One new failure mode to handle:** a subject clone made without tags. `git clone` fetches tags by
default, but `--single-branch` and some CI checkout actions do not. `doctor` should report missing
tags with `git fetch --tags` as the remediation, rather than letting it surface as a confusing
`validate` failure.

**Verify.** `cli.test.ts:119-134` (`validate --json`, `valid === true`) covers this. Add a negative
case: a tag pointing at the wrong commit must fail validation.

---

## 6. The config loader

**What.** Introduce the config mechanism now, defaulting to today's behavior so nothing changes yet.

```
benchmark.config.json         committed, beside benchmarks.json
  { "subject": { "remote": "<paper's remote URL>", "ref": "main" } }

.benchmark.local.json         gitignored
  { "subject": { "path": "/absolute/path/to/paper" } }
```

Resolution order: `--subject <path>` › `$PAPER_BENCHMARK_SUBJECT` › `.benchmark.local.json` ›
**during Stage 1 only**, fall back to `new URL('..', import.meta.url)` › error.

That final fallback is what keeps Stage 1 non-breaking. Stage 2 deletes it.

**Where.** `--subject` joins `parseGlobalArguments` (`cli.mjs:141-182`) next to `--db`, resolved
with `resolve(process.cwd(), value)` exactly like `cli.mjs:153` and using the same conflicting-values
guard at `:171-173`.

**Note.** This introduces the harness's **first** `process.env` config read. Today `process.env` is
only ever inherited or allowlisted. Confirm `PAPER_BENCHMARK_SUBJECT` does not leak into check
subprocesses — it does not, because `checkEnvironment()` (`engine.mjs:357-379`) is an allowlist —
and add a comment marking that invariant as now load-bearing.

**Fail-fast validation at startup.** Whichever path resolves, assert before doing anything:

1. the path exists;
2. `git -C <path> rev-parse --is-inside-work-tree` is `true` — **not a bare or mirror clone**;
3. `git -C <path> cat-file -e <first baseCommit>^{commit}` succeeds — it really is `paper`;
4. `<path>/node_modules` exists.

Without this, (2) surfaces as confusing failures inside `validateManifest`, and (4) as the raw
message at `engine.mjs:609`.

---

## 7. Incidental hardcoded paths

Small, but each one silently encodes the nested layout.

| Location | Problem |
|---|---|
| `evaluator.mjs:9-14` | Non-`file:` fallback hardcodes `resolve(process.cwd(), 'agent-benchmark', 'src', 'evaluator-worker.mjs')`. Inert today (the URL is always `file:`) but wrong after the move. |
| `runner.mjs:951, 952, 1026` | Prints `npm run benchmark -- resume …` — a command that will not exist in either repo. |
| `agent-benchmark/package.json:10` | The `test` script collects **zero tests**. Delete it. |
| `agent-benchmark/package.json` | `engines: {node: ">=22"}` conflicts with `paper`'s `>=24` and `.nvmrc`. Raise, and raise `assertV2NodeVersion` at `cli.mjs:184-189` to match. |

---

## 8. Doctor accuracy

Not required for the split, but `doctor` becomes the primary diagnostic surface once the subject is
external, and it has three known inaccuracies:

- **`npm` is probed but never invoked.** `doctor.mjs:22` probes it and `:34` folds `npm.available`
  into `ready`, but the checks bypass npm entirely (`engine.mjs:381-409` invokes binaries directly).
  A missing `npm` fails `doctor` for a tool the harness does not use.
- **`cp` is required but never probed.** `engine.mjs:287` shells out to it; `doctor` does not check.
- **A worktree-less subject is silently misreported as clean.** `git status --porcelain` exits `128`
  in a bare repo, and `doctor.mjs:41` reads `status.status === 0 && …`, so `sourceDirty` comes back
  `false`. The split makes this reachable — the startup validation in §6 should catch it first, but
  the diagnostic should not lie.

Consider also adding a **harness-repo dirtiness probe**. Post-split, the existing `git status` check
runs against the *subject*, so the signal that would have noticed a locally-edited oracle disappears
entirely (see §2.4).

---

## Stage 1 exit criteria

Measured 2026-08-26 on a clean tree. **Six of eight pass; two fail, and Stage 2 must not start
until they do** — its whole premise is that the suite is green before anything moves.

- [x] `npm test` — green. (331 at the time of writing; **433 across 37 files** on 2026-08-27, since `paper`
      kept shipping. `paper` is unaffected by the refactor, which was the point.)
- [ ] ~~`npm run benchmark:test` — 97 tests green.~~ **FAILS: 76 pass, 3 of 15 files fail to
      collect, 22 tests never run.**

      ```
      TypeError: The URL must be of scheme file
       ❯ agent-benchmark/src/paths.mjs:17:29
       ❯ agent-benchmark/src/catalog.mjs:6:1
      ```

      `paths.mjs:17` is `fileURLToPath(new URL('..', import.meta.url))`. Run by Node that is a
      `file:` URL; run through Vitest's transform pipeline it is not, so every test that imports
      `catalog.mjs` / `engine.mjs` / `runner.mjs` dies at import:
      `tests/agent-benchmark/{engine-v2,history-runner,runner}.test.ts`. The 12 files that pass
      either avoid those modules or shell out to `cli.mjs` as a subprocess, where the URL is a real
      `file:`. §1's own note — *"derived from this module's own location so the same expression is
      correct before and after the extraction"* — is right about the extraction and wrong about the
      test runner. The fix belongs in `paths.mjs` (fall back to a path-based derivation when
      `import.meta.url` is not `file:`), not in the tests.
- [ ] ~~`npm run typecheck` and `npm run lint` clean.~~ **`typecheck` clean; `lint` FAILS with 6
      errors**, every one of them inside
      `agent-benchmark/.agent-benchmark/workspaces/…` — generated copies of `paper`, not source.
      §3 moved runtime state under the harness and `agent-benchmark/.gitignore:5` was updated to
      match, but `eslint.config.js:18` still lists only the repo-root `.agent-benchmark/**`, which
      in a flat config is anchored to the config's own directory. One line:
      `'**/.agent-benchmark/**'`.
- [x] `npm run benchmark -- validate --json` — `valid: true`, `caseCount: 10`, `errors: []`; all 10
      cases report `parentMatches`, `onSourceRef`, `oracleFilesPresent`, `statsMatches`.
- [x] `npm run benchmark -- doctor` — ready. Environment ready, source worktree clean, harness
      worktree clean, all 11 tool checks OK.
- [ ] `npm run benchmark -- validate --run-gold` for a harness-oracle case — **not re-run in this
      reconciliation** (it materializes workspaces and takes minutes). Unverified, not failed.
- [ ] A full `prepare` → `evaluate` cycle writes nothing outside
      `agent-benchmark/.agent-benchmark/`; `git status` on `paper` stays clean. — **Partially
      evidenced:** `git status` is clean and the runtime tree
      (`benchmark.sqlite3`, `recovery/`, `results/`, `workspaces/`) does sit under
      `agent-benchmark/.agent-benchmark/`, but no fresh cycle was run for this check.
- [x] `benchmarks.json` `harnessFiles[].source` values in post-split form, and all 21 tag fields
      populated and verified. **All 21 annotated tags exist** — `benchmark/<case>/base` and
      `/ref` for the 10 cases, plus `benchmark/content-auth-security/oracle` — and `validate`
      confirms them.
