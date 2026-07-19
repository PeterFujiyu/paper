import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'

import { sortedCases } from './catalog.mjs'
import {
  buildHandoffCommand,
  getAdapter,
  probeAdapter as defaultProbeAdapter,
  probeAdapters as defaultProbeAdapters,
} from './adapters.mjs'
import {
  candidateFingerprint,
  prepareCase,
  verifyLegacyWorkspace,
  verifyRunWorkspace,
} from './engine.mjs'
import { evaluateCaseInSubprocess } from './evaluator.mjs'
import { createPromptBundle } from './prompt.mjs'
import {
  consumeEvaluationSpool,
  listEvaluationSpools,
  readEvaluationSpool,
  writeEvaluationSpool,
} from './recovery.mjs'

const INCOMPLETE_STATUSES = new Set([
  'preparing',
  'prepared',
  'ready_for_evaluation',
  'evaluating',
  'evaluation_failed',
])
const EVALUATION_LEASE_TTL_MS = 30_000

function isoDate(now) {
  return now().toISOString()
}

function manifestHash(manifest) {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
}

function treeForCase(repoRoot, benchmarkCase) {
  const result = spawnSync('git', [
    '-C',
    repoRoot,
    'rev-parse',
    `${benchmarkCase.baseCommit}^{tree}`,
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || '无法读取题目基线 tree')
  }
  return result.stdout.trim()
}

function effortValues(probe) {
  const values = probe?.capabilities?.efforts
    ?? probe?.capabilities?.effortValues
    ?? probe?.capabilities?.effort?.values
    ?? ['default']
  const unique = [...new Set(['default', ...values])]
  return unique.filter(value => typeof value === 'string' && value.length > 0)
}

function adapterFound(probe) {
  return probe?.found ?? probe?.available ?? false
}

function normalizeProbes(probes) {
  if (Array.isArray(probes)) {
    return Object.fromEntries(probes.map(probe => [probe.id ?? probe.adapterId, probe]))
  }
  return probes
}

function probeExecutable(probe) {
  return probe?.executable ?? probe?.executablePath ?? null
}

function probeRealpath(probe) {
  return probe?.realpath ?? probe?.executableRealpath ?? probeExecutable(probe)
}

function shortId(id) {
  return id.slice(0, 8)
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 1000)
}

function runStatusCanEvaluate(status) {
  return [
    'prepared',
    'ready_for_evaluation',
    'evaluation_failed',
    'completed',
  ].includes(status)
}

function expiresAfter(timestamp, durationMs) {
  return new Date(Date.parse(timestamp) + durationMs).toISOString()
}

export class BenchmarkRunner {
  constructor({
    manifest,
    repoRoot,
    runtimeRoot = join(repoRoot, '.agent-benchmark'),
    resultsDirectory = join(runtimeRoot, 'results'),
    repository,
    terminal,
    probeAdapters = defaultProbeAdapters,
    probeAdapter = defaultProbeAdapter,
    prepare = prepareCase,
    evaluator = evaluateCaseInSubprocess,
    createId = randomUUID,
    now = () => new Date(),
  }) {
    this.manifest = manifest
    this.repoRoot = resolve(repoRoot)
    this.runtimeRoot = resolve(runtimeRoot)
    this.resultsDirectory = resolve(resultsDirectory)
    this.repository = repository
    this.terminal = terminal
    this.probeAdapters = probeAdapters
    this.probeAdapter = probeAdapter
    this.prepare = prepare
    this.evaluator = evaluator
    this.createId = createId
    this.now = now
    this.cachedProbes = null
  }

  async probe() {
    const probes = normalizeProbes(await this.probeAdapters())
    this.cachedProbes = probes
    return probes
  }

  printEnvironment(probes) {
    this.terminal.write('环境检查\n')
    for (const id of ['codex', 'claude']) {
      const probe = probes[id]
      const name = probe?.displayName ?? getAdapter(id).displayName
      if (!adapterFound(probe)) {
        this.terminal.write(`✗ ${name}  未安装\n`)
        continue
      }
      this.terminal.write(
        `✓ ${name}  ${probe.versionNormalized ?? '版本未知'}  ${probeExecutable(probe)}\n`,
      )
    }
  }

  async home() {
    const probes = await this.probe()
    const incomplete = this.repository.listIncompleteRuns()
    this.terminal.write('\nPaper Agent Benchmark v2\n')
    if (incomplete.length > 0) {
      this.terminal.write(`有 ${incomplete.length} 个未完成评测。\n`)
    }
    this.printEnvironment(probes)

    while (true) {
      const defaultIndex = incomplete.length > 0 ? 1 : 0
      const action = await this.terminal.select('请选择操作', [
        { value: 'new', label: '开始新的评测' },
        {
          value: 'resume',
          label: '继续未完成的评测',
          disabled: incomplete.length === 0,
        },
        { value: 'results', label: '查看历史结果（后续版本）', disabled: true },
        { value: 'compare', label: '对比两次结果（后续版本）', disabled: true },
        { value: 'doctor', label: '环境检查' },
        { value: 'exit', label: '退出' },
      ], { defaultIndex })

      if (action === 'exit') return { action: 'exit' }
      if (action === 'doctor') {
        this.printEnvironment(probes)
        continue
      }
      if (action === 'new') {
        await this.runWizard({ probes, waitForHandoff: true })
        return { action: 'new' }
      }
      if (action === 'resume') {
        const selected = incomplete.length === 1
          ? incomplete[0].id
          : await this.terminal.select(
              '选择要继续的 Run',
              incomplete.map(run => ({
                value: run.id,
                label: `${shortId(run.id)} · ${run.caseId} · ${run.status}`,
              })),
              { defaultIndex: 0 },
            )
        await this.resume(selected, { waitForHandoff: true })
        return { action: 'resume', runId: selected }
      }
    }
  }

  async runWizard(options = {}) {
    const cases = sortedCases(this.manifest)
    const selectedCaseId = options.caseId ?? await this.terminal.select(
      '选择题目',
      cases.map(entry => ({
        value: entry.id,
        label: `#${entry.rank} ${entry.title} · ${entry.difficulty} · ${entry.timeBudgetMinutes} 分钟`,
      })),
      { defaultIndex: 0 },
    )
    const benchmarkCase = cases.find(entry => entry.id === selectedCaseId)
    if (!benchmarkCase) throw new Error(`未知 benchmark 题目：${selectedCaseId}`)

    let probes = normalizeProbes(options.probes ?? this.cachedProbes ?? await this.probeAdapters({
      executables: options.executable && options.adapterId
        ? { [options.adapterId]: options.executable }
        : undefined,
    }))
    let adapterId = options.adapterId
    if (!adapterId) {
      adapterId = await this.terminal.select('选择 Agent CLI', ['codex', 'claude'].map(id => {
        const probe = probes[id]
        const adapter = getAdapter(id)
        const suffix = adapterFound(probe)
          ? `${probe.versionNormalized ?? '版本未知'} · ${probeExecutable(probe)}`
          : '未安装（选择后可指定其他可执行文件）'
        return { value: id, label: `${adapter.displayName} · ${suffix}` }
      }), { defaultIndex: adapterFound(probes.codex) ? 0 : 1 })
    }
    const adapter = getAdapter(adapterId)
    let selectedProbe = probes[adapterId]
    if (options.executable) {
      selectedProbe = await this.probeAdapter(adapterId, {
        executable: options.executable,
      })
      probes = { ...probes, [adapterId]: selectedProbe }
    } else if (!adapterFound(selectedProbe)) {
      const executable = await this.terminal.input(
        `${adapter.displayName} 未安装，请输入其他可执行文件绝对路径`,
      )
      selectedProbe = await this.probeAdapter(adapterId, { executable })
      probes = { ...probes, [adapterId]: selectedProbe }
    }
    if (!adapterFound(selectedProbe)) {
      throw new Error(`${adapter.displayName} 探测失败；未创建 Run 或 workspace`)
    }

    let model = options.model
    if (model === undefined) {
      const modelChoice = await this.terminal.select('选择模型', [
        { value: 'default', label: '使用 CLI 默认模型' },
        { value: 'manual', label: '手动输入模型标识' },
      ], { defaultIndex: 0 })
      model = modelChoice === 'manual'
        ? await this.terminal.input('模型标识')
        : 'default'
    }
    const modelCapability = selectedProbe.capabilities?.model
    const modelSupported = typeof modelCapability === 'object'
      ? modelCapability.supported
      : modelCapability !== false
    if (model !== 'default' && !modelSupported) {
      throw new Error(`${adapter.displayName} 当前探测结果不支持显式模型参数`)
    }

    const supportedEfforts = effortValues(selectedProbe)
    let effort = options.effort
    if (effort === undefined) {
      const effortDefault = supportedEfforts.indexOf('high')
      effort = await this.terminal.select(
        '选择思考深度',
        supportedEfforts.map(value => ({
          value,
          label: value === 'default'
            ? '使用 CLI 默认值'
            : `${value}${value === 'high' ? '（推荐）' : ''}`,
        })),
        { defaultIndex: effortDefault === -1 ? 0 : effortDefault },
      )
    }
    if (!supportedEfforts.includes(effort)) {
      throw new Error(
        `${adapter.displayName} 当前版本不支持 effort=${effort}；可用值：${supportedEfforts.join(', ')}`,
      )
    }

    const mode = options.mode ?? await this.terminal.select('选择运行方式', [
      { value: 'handoff', label: '只准备后手动运行（当前可用）' },
      { value: 'managed', label: '托管运行（后续版本）', disabled: true },
    ], { defaultIndex: 0 })
    if (mode !== 'handoff') {
      throw new Error('首条 v2 主路径当前只支持 handoff；未创建 Run 或 workspace')
    }

    const dependencyStrategy = options.dependencyStrategy ?? await this.terminal.select(
      '确认依赖策略',
      [
        { value: 'isolated', label: '隔离（不链接源项目 node_modules）' },
        { value: 'linked', label: '可信快速试跑（链接源项目依赖）' },
      ],
      { defaultIndex: 0 },
    )
    if (!['isolated', 'linked'].includes(dependencyStrategy)) {
      throw new Error(`未知依赖策略：${dependencyStrategy}`)
    }

    const id = this.createId()
    const workspace = options.workspace
      ? resolve(options.workspace)
      : join(this.runtimeRoot, 'workspaces', benchmarkCase.id, id)
    const promptBundle = createPromptBundle(benchmarkCase)
    const handoffCommand = buildHandoffCommand({
      adapter,
      probe: selectedProbe,
      workspace,
      model,
      effort,
    })
    if (!options.quiet) {
      this.printConfirmation({
        id,
        benchmarkCase,
        adapter,
        probe: selectedProbe,
        model,
        effort,
        dependencyStrategy,
        workspace,
      })
    }
    const confirmed = options.yes === true
      ? true
      : await this.terminal.confirm('确认后才会创建工作目录。继续？', {
          defaultValue: true,
        })
    if (!confirmed) {
      if (!options.quiet) this.terminal.write('已取消；未创建 Run 或 workspace。\n')
      return { cancelled: true, run: null }
    }

    const timestamp = isoDate(this.now)
    const runInput = {
      id,
      shortId: shortId(id),
      caseId: benchmarkCase.id,
      title: benchmarkCase.title,
      baseTree: treeForCase(this.repoRoot, benchmarkCase),
      manifestHash: manifestHash(this.manifest),
      promptVersion: promptBundle.version,
      promptTemplateVersion: promptBundle.version,
      promptProvenance: 'canonical_v2',
      promptText: promptBundle.text,
      promptHash: promptBundle.sha256,
      adapterId,
      adapterDisplayName: adapter.displayName,
      executablePath: probeExecutable(selectedProbe),
      executableRealpath: probeRealpath(selectedProbe),
      versionRaw: selectedProbe.versionRaw ?? null,
      versionNormalized: selectedProbe.versionNormalized ?? null,
      capabilities: selectedProbe.capabilities ?? {},
      requestedModel: model,
      effectiveModel: null,
      requestedEffort: effort,
      adapterEffortValue: effort,
      effectiveEffort: null,
      runMode: 'handoff',
      executionConfigVerified: false,
      executionConfigSource: 'planned',
      permissionPolicy: 'handoff_user_controlled',
      writeIsolation: 'unverified',
      secretIsolation: 'unverified',
      toolNetworkIsolation: 'unverified',
      dependencyStrategy,
      agentTimeoutMs: null,
      workspace,
      status: 'preparing',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.repository.createRun(runInput)

    let prepared
    try {
      prepared = this.prepare({
        benchmarkCase,
        repoRoot: this.repoRoot,
        workspace,
        linkDependencies: dependencyStrategy === 'linked',
        promptBundle,
        runId: id,
      })
      this.repository.transitionRun(id, ['preparing'], 'prepared', {
        baseTree: prepared.baselineTree,
        updatedAt: isoDate(this.now),
      })
    } catch (error) {
      this.repository.transitionRun(id, ['preparing'], 'prepare_failed', {
        safeErrorSummary: safeError(error),
        updatedAt: isoDate(this.now),
      })
      throw new Error(
        `准备失败：${safeError(error)}。不完整 workspace 已清理；Run ${shortId(id)} 已记录。`,
      )
    }

    const run = this.repository.getRun(id)
    if (!options.quiet) this.printHandoff(run, handoffCommand)
    if (options.waitForHandoff) {
      await this.handoffLoop(run.id)
    }
    return {
      cancelled: false,
      run,
      prepared,
      prompt: promptBundle,
      handoffCommand,
    }
  }

  printConfirmation({
    benchmarkCase,
    adapter,
    probe,
    model,
    effort,
    dependencyStrategy,
    workspace,
  }) {
    this.terminal.write('\n请确认本次评测\n\n')
    this.terminal.write(`题目        ${benchmarkCase.id} · ${benchmarkCase.title}\n`)
    this.terminal.write(`Agent       ${adapter.displayName}\n`)
    this.terminal.write(`CLI 版本    ${probe.versionNormalized ?? '未知'}（自动获取）\n`)
    this.terminal.write(`模型        ${model}\n`)
    this.terminal.write(`思考深度    ${effort}\n`)
    this.terminal.write('运行方式    handoff（手动运行）\n')
    this.terminal.write(`依赖策略    ${dependencyStrategy}\n`)
    this.terminal.write('Agent 超时  不适用（handoff）\n')
    this.terminal.write(`工作目录    ${workspace}\n\n`)
  }

  commandForRun(run) {
    return buildHandoffCommand({
      adapter: getAdapter(run.adapterId),
      probe: {
        executable: run.executablePath,
        realpath: run.executableRealpath,
        capabilities: run.capabilities ?? {},
      },
      workspace: run.workspace,
      model: run.requestedModel,
      effort: run.requestedEffort,
    })
  }

  printHandoff(run, command = this.commandForRun(run)) {
    this.terminal.write('\n环境已准备\n')
    this.terminal.write(`Run ID: ${run.id}\n\n`)
    this.printDirectoryAndCommand(run, command)
    this.printPrompt(run)
    this.terminal.write('配置可信度：准备时探测，实际执行未验证。\n')
    this.terminal.write(`暂停后恢复：npm run benchmark -- resume ${shortId(run.id)}\n`)
    this.terminal.write(`快捷评价：npm run benchmark -- evaluate ${shortId(run.id)}\n`)
  }

  printDirectoryAndCommand(run, command = this.commandForRun(run)) {
    this.terminal.write('工作目录（DIR）\n')
    this.terminal.write('────────────────────────────────────────\n')
    this.terminal.write(`${run.workspace}\n`)
    this.terminal.write('────────────────────────────────────────\n\n')
    this.terminal.write('快捷命令\n')
    this.terminal.write('────────────────────────────────────────\n')
    this.terminal.write(`${command}\n`)
    this.terminal.write('────────────────────────────────────────\n\n')
  }

  printPrompt(run) {
    this.terminal.write('完整 Prompt（从下一行开始复制）\n')
    this.terminal.write('──────────────────── PROMPT BEGIN ────────────────────\n')
    this.terminal.write(run.promptText)
    if (!run.promptText.endsWith('\n')) this.terminal.write('\n')
    this.terminal.write('───────────────────── PROMPT END ─────────────────────\n\n')
  }

  async resume(runReference, { waitForHandoff = true, quiet = false } = {}) {
    let run = this.repository.getRun(runReference)
    if (run.status === 'evaluating') {
      const recovery = this.repository.recoverExpiredOperation(run.id, isoDate(this.now))
      if (!recovery.recovered) {
        throw new Error(
          `Run ${shortId(run.id)} 的评价仍有有效操作租约（${recovery.expiresAt ?? '状态未知'}），请稍后重试。`,
        )
      }
      run = this.repository.getRun(run.id)
    }
    if (run.status === 'preparing') {
      const benchmarkCase = sortedCases(this.manifest).find(entry => entry.id === run.caseId)
      try {
        verifyRunWorkspace({
          benchmarkCase,
          repoRoot: this.repoRoot,
          workspace: run.workspace,
          runId: run.id,
          promptHash: run.promptHash,
        })
        this.repository.transitionRun(run.id, ['preparing'], 'prepared', {
          updatedAt: isoDate(this.now),
        })
      } catch {
        throw new Error(
          `Run ${shortId(run.id)} 仍处于 preparing，无法证明 workspace 已完整准备；未删除任何目录。`,
        )
      }
    }
    const refreshed = this.repository.getRun(run.id)
    if (!INCOMPLETE_STATUSES.has(refreshed.status) && refreshed.status !== 'completed') {
      throw new Error(`Run ${shortId(refreshed.id)} 当前状态为 ${refreshed.status}，无法恢复`)
    }
    const handoffCommand = this.commandForRun(refreshed)
    if (!quiet) this.printHandoff(refreshed, handoffCommand)
    if (waitForHandoff) await this.handoffLoop(refreshed.id)
    return { run: refreshed, handoffCommand }
  }

  async handoffLoop(runId) {
    while (true) {
      const action = await this.terminal.select('请在另一终端完成任务', [
        { value: 'evaluate', label: 'Agent 已完成，立即评价' },
        { value: 'pause', label: '暂停并稍后继续' },
        { value: 'prompt', label: '再次打印完整 Prompt' },
        { value: 'directory', label: '再次打印工作目录和命令' },
        { value: 'cancel', label: '放弃 Run（保留 workspace）' },
      ], { defaultIndex: 0 })
      const run = this.repository.getRun(runId)
      if (action === 'pause') {
        this.terminal.write(`已暂停。恢复命令：npm run benchmark -- resume ${shortId(run.id)}\n`)
        return { action: 'pause', run }
      }
      if (action === 'prompt') {
        this.printPrompt(run)
        continue
      }
      if (action === 'directory') {
        this.printDirectoryAndCommand(run)
        continue
      }
      if (action === 'cancel') {
        const confirmed = await this.terminal.confirm(
          '确认放弃此 Run？workspace 会保留，删除需要单独操作',
          { defaultValue: false },
        )
        if (!confirmed) continue
        this.repository.transitionRun(
          run.id,
          [run.status],
          'cancelled',
          { updatedAt: isoDate(this.now) },
        )
        this.terminal.write(`Run ${shortId(run.id)} 已取消；workspace 已保留：${run.workspace}\n`)
        return { action: 'cancel', run: this.repository.getRun(run.id) }
      }
      if (action === 'evaluate') {
        return this.evaluateRun(run.id)
      }
    }
  }

  async evaluateRun(runReference, options = {}) {
    let run = this.repository.getRun(runReference)
    if (run.status === 'evaluating') {
      const recovery = this.repository.recoverExpiredOperation(run.id, isoDate(this.now))
      if (!recovery.recovered) {
        throw new Error(
          `Run ${shortId(run.id)} 的评价仍在运行或等待租约过期；请稍后重试。`,
        )
      }
      run = this.repository.getRun(run.id)
    }
    if (!runStatusCanEvaluate(run.status)) {
      throw new Error(`Run ${shortId(run.id)} 当前状态为 ${run.status}，不能评价`)
    }
    const benchmarkCase = sortedCases(this.manifest).find(entry => entry.id === run.caseId)
    if (!benchmarkCase) throw new Error(`Run 引用了未知题目：${run.caseId}`)
    verifyRunWorkspace({
      benchmarkCase,
      repoRoot: this.repoRoot,
      workspace: run.workspace,
      runId: run.id,
      promptHash: run.promptHash,
    })
    if (run.status === 'prepared' || run.status === 'evaluation_failed') {
      this.repository.transitionRun(
        run.id,
        [run.status],
        'ready_for_evaluation',
        { updatedAt: isoDate(this.now) },
      )
      run = this.repository.getRun(run.id)
    }
    return this.#evaluateRecordedRun(run, benchmarkCase, options)
  }

  async evaluateAdHoc({ benchmarkCase, workspace, ...options }) {
    verifyLegacyWorkspace({
      benchmarkCase,
      repoRoot: this.repoRoot,
      workspace,
    })
    const id = this.createId()
    const timestamp = isoDate(this.now)
    const sessionPrompt = null
    this.repository.createRun({
      id,
      shortId: shortId(id),
      caseId: benchmarkCase.id,
      title: benchmarkCase.title,
      baseTree: treeForCase(this.repoRoot, benchmarkCase),
      manifestHash: manifestHash(this.manifest),
      promptVersion: null,
      promptTemplateVersion: null,
      promptProvenance: 'legacy_unverified',
      promptText: sessionPrompt,
      promptHash: null,
      adapterId: null,
      adapterDisplayName: null,
      executablePath: null,
      executableRealpath: null,
      versionRaw: null,
      versionNormalized: null,
      capabilities: {},
      requestedModel: null,
      effectiveModel: null,
      requestedEffort: null,
      adapterEffortValue: null,
      effectiveEffort: null,
      runMode: 'ad-hoc',
      executionConfigVerified: false,
      executionConfigSource: 'unknown',
      permissionPolicy: 'unknown',
      writeIsolation: 'unknown',
      secretIsolation: 'unknown',
      toolNetworkIsolation: 'unknown',
      dependencyStrategy: 'unknown',
      agentTimeoutMs: null,
      workspace: resolve(workspace),
      status: 'ready_for_evaluation',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return this.#evaluateRecordedRun(
      this.repository.getRun(id),
      benchmarkCase,
      options,
    )
  }

  async #evaluateRecordedRun(run, benchmarkCase, {
    resultsDirectory = this.resultsDirectory,
    keepEvaluation = false,
    revealCheckOutput = false,
    quiet = false,
  } = {}) {
    const evaluationId = this.createId()
    const startedAt = isoDate(this.now)
    const ownerToken = randomUUID()
    const postExposureAtStart = run.exposureState === 'oracle_exposed'
      || run.exposureState === 'exposed'
    const exposureTypes = [
      ...(revealCheckOutput ? ['check_output'] : []),
      ...(keepEvaluation ? ['evaluation_directory'] : []),
    ]
    this.repository.acquireOperationLease(
      run.id,
      'evaluation',
      evaluationId,
      ownerToken,
      process.pid,
      createHash('sha256').update(hostname()).digest('hex'),
      startedAt,
      expiresAfter(startedAt, EVALUATION_LEASE_TTL_MS),
    )
    try {
      const initialFingerprint = candidateFingerprint({
        benchmarkCase,
        repoRoot: this.repoRoot,
        workspace: run.workspace,
      })
      this.repository.beginEvaluation(
        run.id,
        evaluationId,
        startedAt,
        initialFingerprint,
      )
      if (!quiet) this.terminal.write(`正在评价 ${shortId(run.id)}\n`)

      const controller = new AbortController()
      const handleInterrupt = () => controller.abort()
      process.once('SIGINT', handleInterrupt)
      process.once('SIGTERM', handleInterrupt)
      let report
      try {
        report = await this.evaluator({
          benchmarkCase,
          repoRoot: this.repoRoot,
          workspace: run.workspace,
          resultsDirectory,
          keepEvaluation,
          revealCheckOutput,
        }, {
          signal: controller.signal,
          onHeartbeat: () => {
            const heartbeatAt = isoDate(this.now)
            this.repository.heartbeatOperationLease(
              run.id,
              evaluationId,
              ownerToken,
              heartbeatAt,
              expiresAfter(heartbeatAt, EVALUATION_LEASE_TTL_MS),
            )
          },
        })
      } catch (error) {
        this.repository.failEvaluation(
          run.id,
          evaluationId,
          safeError(error),
          isoDate(this.now),
        )
        throw new Error(
          `评价已中断或基础设施失败：${safeError(error)}。workspace 已保留，可用同一 Run 重试。`,
        )
      } finally {
        process.off('SIGINT', handleInterrupt)
        process.off('SIGTERM', handleInterrupt)
      }

      const fingerprint = report.candidateFingerprint ?? initialFingerprint
      const spoolPath = writeEvaluationSpool({
        runtimeRoot: this.runtimeRoot,
        evaluationId,
        runId: run.id,
        candidateFingerprint: fingerprint,
        report,
        createdAt: isoDate(this.now),
        postExposure: postExposureAtStart,
        exposureTypes,
        runProvenance: run,
      })
      try {
        this.repository.completeEvaluation(
          run.id,
          evaluationId,
          report,
          isoDate(this.now),
          postExposureAtStart,
          exposureTypes,
        )
      } catch (error) {
        throw new Error(
          `评分已完成但 SQLite 写入失败：${safeError(error)}。恢复文件已保留：${spoolPath}`,
        )
      }
      consumeEvaluationSpool(spoolPath)
      if (!quiet) this.printEvaluation(report)
      return {
        run: this.repository.getRun(run.id),
        evaluation: this.repository.getEvaluation(evaluationId),
        report,
      }
    } finally {
      try {
        this.repository.releaseOperationLease(run.id, evaluationId, ownerToken)
      } catch {
        // A recovered or concurrently closed attempt may already have released the lease.
      }
    }
  }

  printEvaluation(report) {
    for (const check of report.checks) {
      this.terminal.write(
        `${check.passed ? '✓' : '✗'} ${check.label}  ${check.passed ? check.points : 0}/${check.points}\n`,
      )
    }
    this.terminal.write(
      `路径覆盖 F1 ${(report.scoring.changedFiles.f1 * 100).toFixed(1)}%\n`,
    )
    this.terminal.write(`总分 ${report.score} / ${report.maxScore}\n`)
    this.terminal.write(`结果已写入 SQLite：${this.repository.databasePath}\n`)
  }

  recoverEvaluationSpools(paths = listEvaluationSpools(this.runtimeRoot)) {
    const recovered = []
    for (const path of paths) {
      const spool = readEvaluationSpool(path)
      const existing = this.repository.getEvaluation(spool.evaluationId)
      if (!existing || existing.status !== 'completed') {
        this.repository.completeEvaluation(
          spool.runId,
          spool.evaluationId,
          spool.report,
          spool.createdAt,
          spool.postExposure ?? false,
          spool.exposureTypes ?? [],
        )
      }
      consumeEvaluationSpool(path)
      recovered.push(spool.evaluationId)
    }
    return recovered
  }
}
