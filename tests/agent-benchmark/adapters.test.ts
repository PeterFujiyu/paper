import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, test } from 'vitest'

// @ts-expect-error -- the benchmark CLI is intentionally authored as native ESM JavaScript
import * as adapterApi from '../../agent-benchmark/src/adapters.mjs'
// @ts-expect-error -- the benchmark CLI is intentionally authored as native ESM JavaScript
import * as promptApi from '../../agent-benchmark/src/prompt.mjs'

const {
  buildHandoffCommand,
  getAdapter,
  probeAdapter,
  probeAdapters,
} = adapterApi
const { PROMPT_TEMPLATE_VERSION, createPromptBundle } = promptApi

const temporaryRoots: string[] = []

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

function writeExecutable(path: string, source: string): void {
  writeFileSync(path, `#!/bin/sh\n${source}`)
  chmodSync(path, 0o755)
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createPromptBundle renders the exact v1 Chinese template deterministically', () => {
  const benchmarkCase = {
    title: '修复示例功能',
    difficulty: 'medium',
    timeBudgetMinutes: 45,
    prompt: '实现一个完整、可验证的纵向功能。',
    acceptanceCriteria: [
      '公开接口保持兼容。',
      '新增行为具有回归测试。',
    ],
  }
  const expected = `你正在完成一项真实代码库的隔离基准任务。请直接检查并修改当前仓库中的代码，完成任务；不要只给出方案。

# 任务信息

题目：修复示例功能
难度：medium
建议时长：45 分钟

# 任务描述

实现一个完整、可验证的纵向功能。

# 验收标准

- 公开接口保持兼容。
- 新增行为具有回归测试。

# 工作规则

1. 先检查当前代码、项目约定和公开测试，再制定并实施完整修改。
2. 只在当前仓库内读取和写入文件。不要读取或搜索父目录、原项目、外部 Git 历史、参考提交、gold patch、benchmark 清单或隐藏 oracle。
3. 不要调用 benchmark 评价器，不要修改 .benchmark-task.md 或 .benchmark-session.json，也不要通过删除、弱化或绕过测试来提高分数。
4. 按当前项目的既有架构和编码约定完成生产代码；避免与任务无关的重写。
5. 运行与改动相关的测试、类型检查和构建。发现失败时继续定位并修复，而不是只报告失败。
6. 在任务真正满足验收标准后再结束。

# 完成时回复

请简要说明：

- 完成了哪些修改；
- 实际运行了哪些验证及其结果；
- 是否仍有已知风险或未完成项。

现在开始。`

  const codexBundle = createPromptBundle({ ...benchmarkCase, adapterId: 'codex' })
  const claudeBundle = createPromptBundle({ ...benchmarkCase, adapterId: 'claude' })

  assert.equal(PROMPT_TEMPLATE_VERSION, '1.0')
  assert.deepEqual(codexBundle, claudeBundle)
  assert.equal(codexBundle.text, expected)
  assert.equal(codexBundle.version, PROMPT_TEMPLATE_VERSION)
  assert.equal(
    codexBundle.sha256,
    createHash('sha256').update(Buffer.from(expected, 'utf8')).digest('hex'),
  )
  assert.doesNotMatch(codexBundle.text, /\{\{|Codex|Claude|referenceCommit/)
})

test('getAdapter exposes stable Codex and Claude definitions', () => {
  assert.deepEqual(
    [getAdapter('codex').command, getAdapter('claude').command],
    ['codex', 'claude'],
  )
  assert.throws(() => getAdapter('other'), /Unsupported agent adapter: other/)
})

test('probeAdapters discovers real paths, accepts stderr warnings, and inspects help capabilities', async () => {
  const root = temporaryRoot('paper-adapter-probe-')
  const bin = join(root, 'bin')
  mkdirSync(bin)

  const realCodex = join(root, 'codex-real')
  writeExecutable(realCodex, `
case "$1 $2" in
  "--version ")
    printf '%s\\n' 'codex-cli 0.144.5'
    printf '%s\\n' 'wrapper warning' >&2
    ;;
  "exec --help")
    printf '%s\\n' 'Usage: codex exec [OPTIONS] [PROMPT]'
    printf '%s\\n' '  -m, --model <MODEL>'
    printf '%s\\n' '  -c, --config <key=value>'
    printf '%s\\n' '  -C, --cd <DIR>'
    printf '%s\\n' '  -s, --sandbox <SANDBOX_MODE>'
    printf '%s\\n' '      --ephemeral'
    printf '%s\\n' '      --json'
    ;;
  *) exit 9 ;;
esac
`)
  symlinkSync(realCodex, join(bin, 'codex'))

  writeExecutable(join(bin, 'claude'), `
case "$1" in
  --version)
    printf '%s\\n' 'legacy wrapper requires -v' >&2
    exit 1
    ;;
  -v)
    printf '%s\\n' '2.1.215 (Claude Code)'
    ;;
  --help)
    printf '%s\\n' 'Usage: claude [options] [prompt]'
    printf '%s\\n' '  -p, --print'
    printf '%s\\n' '      --model <model>'
    printf '%s\\n' '      --effort <level> (low, medium, high, xhigh, max)'
    printf '%s\\n' '      --no-session-persistence'
    printf '%s\\n' '      --safe-mode'
    ;;
  *) exit 9 ;;
esac
`)

  const snapshots = await probeAdapters({
    env: { PATH: bin },
    timeoutMs: 2500,
  })
  const codex = snapshots.find((snapshot: { adapterId: string }) =>
    snapshot.adapterId === 'codex')
  const claude = snapshots.find((snapshot: { adapterId: string }) =>
    snapshot.adapterId === 'claude')

  assert.equal(codex?.found, true)
  assert.equal(codex?.executable, resolve(bin, 'codex'))
  assert.equal(codex?.realpath, realpathSync(realCodex))
  assert.equal(codex?.versionRaw, 'codex-cli 0.144.5')
  assert.equal(codex?.versionNormalized, '0.144.5')
  assert.match(codex?.diagnostics.version.stderr ?? '', /wrapper warning/)
  assert.equal(codex?.capabilities.model.supported, true)
  assert.equal(codex?.capabilities.effort.supported, true)
  assert.equal(codex?.capabilities.effort.argumentStyle, 'config')
  assert.equal(codex?.capabilities.workspace.supported, true)
  assert.equal(codex?.capabilities.sandbox.supported, true)
  assert.equal(codex?.capabilities.ephemeral, true)

  assert.equal(claude?.found, true)
  assert.equal(claude?.versionRaw, '2.1.215 (Claude Code)')
  assert.equal(claude?.versionNormalized, '2.1.215')
  assert.deepEqual(claude?.diagnostics.version.args, ['-v'])
  assert.match(claude?.diagnostics.versionAttempts[0]?.stderr ?? '', /requires -v/)
  assert.equal(claude?.capabilities.model.supported, true)
  assert.equal(claude?.capabilities.effort.supported, true)
  assert.deepEqual(
    claude?.capabilities.effort.values,
    ['low', 'medium', 'high', 'xhigh', 'max'],
  )
  assert.equal(claude?.capabilities.nonInteractive, true)
  assert.equal(claude?.capabilities.ephemeral, true)
  assert.equal(claude?.snapshotType, 'planned')
  assert.equal(claude?.executionConfigVerified, false)
})

test('probeAdapter resolves an explicit executable and applies one bounded probe deadline', async () => {
  const root = temporaryRoot('paper-adapter-timeout-')
  const executable = join(root, 'slow-codex')
  writeExecutable(executable, '/bin/sleep 5 &\nexit 0\n')

  const startedAt = Date.now()
  const snapshot = await probeAdapter('codex', {
    executable,
    env: { PATH: '' },
    timeoutMs: 120,
  })
  const elapsedMs = Date.now() - startedAt

  assert.equal(snapshot.found, true)
  assert.equal(snapshot.executable, executable)
  assert.equal(snapshot.realpath, realpathSync(executable))
  assert.equal(snapshot.versionRaw, null)
  assert.equal(snapshot.diagnostics.version.timedOut, true)
  assert.equal(snapshot.diagnostics.help.timedOut, true)
  assert.ok(elapsedMs < 1000, `probe took ${elapsedMs}ms`)
})

test('probeAdapter uses a valid stderr version when stdout has wrapper noise', async () => {
  const root = temporaryRoot('paper-adapter-stderr-version-')
  const executable = join(root, 'codex-wrapper')
  writeExecutable(executable, `
if [ "$1" = '--version' ]; then
  printf '%s\\n' 'loading wrapper'
  printf '%s\\n' 'codex-cli 0.144.6' >&2
  exit 0
fi
if [ "$1" = 'exec' ] && [ "$2" = '--help' ]; then
  printf '%s\\n' 'Usage: codex exec [OPTIONS] [PROMPT]'
  exit 0
fi
`)

  const snapshot = await probeAdapter('codex', {
    executable,
    env: { PATH: '' },
    timeoutMs: 2500,
  })

  assert.equal(snapshot.versionRaw, 'codex-cli 0.144.6')
  assert.equal(snapshot.versionNormalized, '0.144.6')
  assert.match(snapshot.diagnostics.version.stdout, /loading wrapper/)
})

test('probeAdapter does not invent effort values for an unknown CLI version', async () => {
  const root = temporaryRoot('paper-adapter-unknown-effort-')
  const codex = join(root, 'future-codex')
  writeExecutable(codex, `
if [ "$1" = '--version' ]; then
  printf '%s\\n' 'codex-cli 9.9.9'
  exit 0
fi
if [ "$1" = 'exec' ] && [ "$2" = '--help' ]; then
  printf '%s\\n' 'Usage: codex exec [OPTIONS] [PROMPT]'
  printf '%s\\n' '  --config <key=value>'
  exit 0
fi
`)
  const claude = join(root, 'future-claude')
  writeExecutable(claude, `
if [ "$1" = '--version' ]; then
  printf '%s\\n' '9.9.9 (Claude Code)'
  exit 0
fi
if [ "$1" = '--help' ]; then
  printf '%s\\n' 'Usage: claude [options] [prompt]'
  printf '%s\\n' '  --effort <level>'
  exit 0
fi
`)

  const codexProbe = await probeAdapter('codex', {
    executable: codex,
    env: { PATH: '' },
  })
  const claudeProbe = await probeAdapter('claude', {
    executable: claude,
    env: { PATH: '' },
  })

  assert.equal(codexProbe.capabilities.effort.supported, false)
  assert.deepEqual(codexProbe.capabilities.effort.values, [])
  assert.equal(claudeProbe.capabilities.effort.supported, false)
  assert.deepEqual(claudeProbe.capabilities.effort.values, [])
  assert.throws(
    () => buildHandoffCommand({
      adapter: 'codex',
      probe: codexProbe,
      workspace: root,
      effort: 'high',
    }),
    /does not support an explicit reasoning effort/,
  )
})

test('buildHandoffCommand safely quotes argv, reads the canonical task file, and gates optional flags', async () => {
  const root = temporaryRoot("paper-adapter-command-'")
  const workspace = join(root, "candidate worktree's copy")
  const bin = join(root, 'bin')
  const argsFile = join(root, 'args.txt')
  const stdinFile = join(root, 'stdin.txt')
  const injectionMarker = join(root, 'injected')
  mkdirSync(workspace)
  mkdirSync(bin)
  writeFileSync(join(workspace, '.benchmark-task.md'), '完全一致的 Prompt 字节。')
  writeExecutable(join(bin, 'codex'), `
if [ "$1" = '--version' ]; then
  printf '%s\\n' 'codex-cli 0.144.5'
  exit 0
fi
if [ "$1" = 'exec' ] && [ "$2" = '--help' ]; then
  printf '%s\\n' 'Usage: codex exec [OPTIONS] [PROMPT]'
  printf '%s\\n' '  --model <MODEL>'
  printf '%s\\n' '  --config <key=value>'
  printf '%s\\n' '  --cd <DIR>'
  exit 0
fi
printf '%s\\n' "$@" > "$BENCH_ARGS_FILE"
/bin/cat > "$BENCH_STDIN_FILE"
`)

  const probe = await probeAdapter('codex', {
    executable: join(bin, 'codex'),
    env: { PATH: bin },
    timeoutMs: 2500,
  })
  const hostileModel = `gpt-5'$(touch ${injectionMarker})`
  const command = buildHandoffCommand({
    adapter: 'codex',
    probe,
    workspace,
    model: hostileModel,
    effort: 'high',
  })

  assert.doesNotMatch(command, /dangerously|bypass|danger-full-access|--add-dir/)
  const result = spawnSync('/bin/sh', ['-c', command], {
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      BENCH_ARGS_FILE: argsFile,
      BENCH_STDIN_FILE: stdinFile,
    },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(stdinFile, 'utf8'), '完全一致的 Prompt 字节。')
  assert.equal(readFileSync(argsFile, 'utf8'), [
    'exec',
    '--cd',
    workspace,
    '--model',
    hostileModel,
    '--config',
    'model_reasoning_effort="high"',
    '-',
    '',
  ].join('\n'))
  assert.throws(() => readFileSync(injectionMarker), /ENOENT/)

  writeExecutable(join(bin, 'claude'), `
if [ "$1" = '--version' ]; then
  printf '%s\\n' '2.1.215 (Claude Code)'
  exit 0
fi
if [ "$1" = '--help' ]; then
  printf '%s\\n' 'Usage: claude [options] [prompt]'
  printf '%s\\n' '  --print'
  printf '%s\\n' '  --model <MODEL>'
  printf '%s\\n' '  --effort <level> (low, medium, high, xhigh, max)'
  printf '%s\\n' '  --safe-mode'
  printf '%s\\n' '  --no-session-persistence'
  printf '%s\\n' '  --permission-mode <mode> (acceptEdits, manual, plan)'
  exit 0
fi
printf '%s\\n' "$@" > "$BENCH_ARGS_FILE"
/bin/cat > "$BENCH_STDIN_FILE"
`)
  const claudeProbe = await probeAdapter('claude', {
    executable: join(bin, 'claude'),
    env: { PATH: bin },
    timeoutMs: 2500,
  })
  const claudeCommand = buildHandoffCommand({
    adapter: 'claude',
    probe: claudeProbe,
    workspace,
    model: 'claude-sonnet-4-5',
    effort: 'xhigh',
  })
  const claudeResult = spawnSync('/bin/sh', ['-c', claudeCommand], {
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      BENCH_ARGS_FILE: argsFile,
      BENCH_STDIN_FILE: stdinFile,
    },
  })
  assert.equal(claudeResult.status, 0, claudeResult.stderr)
  assert.equal(readFileSync(stdinFile, 'utf8'), '完全一致的 Prompt 字节。')
  assert.equal(readFileSync(argsFile, 'utf8'), [
    '--print',
    '--safe-mode',
    '--no-session-persistence',
    '--permission-mode',
    'acceptEdits',
    '--model',
    'claude-sonnet-4-5',
    '--effort',
    'xhigh',
    '',
  ].join('\n'))
  assert.doesNotMatch(claudeCommand, /dangerously|bypass|--add-dir/)

  const noModelCapability = structuredClone(probe)
  noModelCapability.capabilities.model.supported = false
  assert.throws(
    () => buildHandoffCommand({
      adapter: 'codex',
      probe: noModelCapability,
      workspace,
      model: 'gpt-5',
    }),
    /does not support an explicit model/,
  )

  const defaultCommand = buildHandoffCommand({
    adapter: 'codex',
    probe: noModelCapability,
    workspace,
    model: 'default',
    effort: 'default',
  })
  assert.doesNotMatch(defaultCommand, /--model|model_reasoning_effort/)
})
