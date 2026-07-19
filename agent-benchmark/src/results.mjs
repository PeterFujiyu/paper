function safeChecks(checks) {
  if (!Array.isArray(checks)) return []
  return checks.map(check => ({
    id: check.id ?? null,
    label: check.label ?? null,
    kind: check.kind ?? null,
    order: check.order ?? null,
    points: check.points ?? null,
    passed: check.passed === true,
    exitCode: check.exitCode ?? null,
    signal: check.signal ?? null,
    durationMs: check.durationMs ?? null,
  }))
}

function buildComparisonSide(run, evaluation) {
  return {
    runId: run.id,
    displayId: run.displayId ?? run.id.replaceAll('-', '').slice(0, 8),
    caseId: run.caseId ?? null,
    title: run.title ?? null,
    status: run.status ?? null,
    evaluationId: evaluation.id,
    isPrimary: evaluation.isPrimary === true,
    iterated: evaluation.isPrimary !== true,
    postExposure: evaluation.postExposure === true,
    adapterId: run.adapterId ?? null,
    adapterDisplayName: run.adapterDisplayName ?? null,
    versionRaw: run.versionRaw ?? null,
    versionNormalized: run.versionNormalized ?? null,
    requestedModel: run.requestedModel ?? null,
    effectiveModel: run.effectiveModel ?? null,
    requestedEffort: run.requestedEffort ?? null,
    adapterEffortValue: run.adapterEffortValue ?? null,
    effectiveEffort: run.effectiveEffort ?? null,
    runMode: run.runMode ?? null,
    dependencyStrategy: run.dependencyStrategy ?? null,
    permissionPolicy: run.permissionPolicy ?? null,
    writeIsolation: run.writeIsolation ?? null,
    secretIsolation: run.secretIsolation ?? null,
    toolNetworkIsolation: run.toolNetworkIsolation ?? null,
    executionConfigVerified: run.executionConfigVerified === true,
    executionConfigSource: run.executionConfigSource ?? null,
    exposureState: run.exposureState ?? null,
    exposureTypes: Array.isArray(run.exposureTypes) ? [...run.exposureTypes] : [],
    inputTokens: run.inputTokens ?? null,
    outputTokens: run.outputTokens ?? null,
    cachedTokens: run.cachedTokens ?? null,
    reasoningTokens: run.reasoningTokens ?? null,
    cost: run.cost ?? null,
    score: evaluation.score ?? null,
    maxScore: evaluation.maxScore ?? null,
    checks: safeChecks(evaluation.checks),
    changedFileF1: evaluation.changedFileF1 ?? null,
    agentDurationMs: run.agentDurationMs ?? null,
    evaluationDurationMs: evaluation.durationMs ?? null,
  }
}

function primaryEvaluation(repository, run) {
  if (run.primaryEvaluationId === null || run.primaryEvaluationId === undefined) {
    throw new Error(`Run ${run.id} has no primary evaluation`)
  }
  const evaluation = repository.getEvaluation(run.primaryEvaluationId)
  if (evaluation === null) {
    throw new Error(`Primary evaluation not found for Run ${run.id}`)
  }
  if (evaluation.status !== 'completed') {
    throw new Error(`Evaluation ${evaluation.id} is ${evaluation.status}; expected completed`)
  }
  return evaluation
}

const FULL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function selectedEvaluation(repository, run, evaluationId, side) {
  if (evaluationId === undefined) return primaryEvaluation(repository, run)
  if (typeof evaluationId !== 'string' || !FULL_UUID_PATTERN.test(evaluationId)) {
    throw new TypeError(`Evaluation ${side} ID must be a full UUID`)
  }
  const evaluation = repository.getEvaluation(evaluationId)
  if (evaluation === null) throw new Error(`Evaluation not found: ${evaluationId}`)
  if (evaluation.runId !== run.id) {
    throw new Error(`Evaluation ${evaluation.id} does not belong to Run ${run.id}`)
  }
  if (evaluation.status !== 'completed') {
    throw new Error(`Evaluation ${evaluation.id} is ${evaluation.status}; expected completed`)
  }
  return evaluation
}

export function buildResultComparison(
  repository,
  runARef,
  runBRef,
  { evaluationA, evaluationB } = {},
) {
  const runA = repository.getRun(runARef)
  const runB = repository.getRun(runBRef)
  if (runA.id === runB.id) {
    throw new Error(`Cannot compare Run ${runA.id} with itself`)
  }
  const selectedA = selectedEvaluation(repository, runA, evaluationA, 'A')
  const selectedB = selectedEvaluation(repository, runB, evaluationB, 'B')
  const iterated = selectedA.isPrimary !== true || selectedB.isPrimary !== true
  const postExposure = selectedA.postExposure === true || selectedB.postExposure === true
  const warnings = []
  let incompatible = false
  let caution = false
  const addIncompatibility = (condition, code, message) => {
    if (!condition) return
    incompatible = true
    warnings.push({ code, message })
  }
  const isUnknown = value => value === null
    || value === undefined
    || value === ''
    || value === 'unknown'
  const addIdentityComparison = ({
    valueA,
    valueB,
    unknownCode,
    unknownMessage,
    mismatchCode,
    mismatchMessage,
    additionallyUnknown = () => false,
  }) => {
    if (isUnknown(valueA) || isUnknown(valueB)
      || additionallyUnknown(valueA) || additionallyUnknown(valueB)) {
      addIncompatibility(true, unknownCode, unknownMessage)
      return
    }
    addIncompatibility(valueA !== valueB, mismatchCode, mismatchMessage)
  }
  const addCaution = (condition, code, message) => {
    if (!condition) return
    caution = true
    warnings.push({ code, message })
  }
  const addConfigurationComparison = ({
    valueA,
    valueB,
    label,
    code,
  }) => {
    if (isUnknown(valueA) || isUnknown(valueB)) {
      addCaution(true, `${code}_UNKNOWN`, `至少一侧 ${label} 未知。`)
      return
    }
    addCaution(valueA !== valueB, `${code}_MISMATCH`, `两侧 ${label} 不一致。`)
  }
  addIncompatibility(
    runA.caseId !== runB.caseId,
    'CASE_MISMATCH',
    '两侧不是同一道 case，分数不能作为公平的横向对比。',
  )
  addIdentityComparison({
    valueA: runA.promptProvenance,
    valueB: runB.promptProvenance,
    unknownCode: 'PROMPT_PROVENANCE_UNKNOWN',
    unknownMessage: '至少一侧 Prompt provenance 无法验证。',
    mismatchCode: 'PROMPT_PROVENANCE_MISMATCH',
    mismatchMessage: '两侧 Prompt provenance 不一致。',
    additionallyUnknown: value => value === 'legacy_unverified',
  })
  addIdentityComparison({
    valueA: runA.promptVersion,
    valueB: runB.promptVersion,
    unknownCode: 'PROMPT_VERSION_UNKNOWN',
    unknownMessage: '至少一侧 Prompt 模板版本未知。',
    mismatchCode: 'PROMPT_VERSION_MISMATCH',
    mismatchMessage: '两侧 Prompt 模板版本不一致。',
  })
  addIdentityComparison({
    valueA: runA.promptHash,
    valueB: runB.promptHash,
    unknownCode: 'PROMPT_HASH_UNKNOWN',
    unknownMessage: '至少一侧 Prompt 哈希未知。',
    mismatchCode: 'PROMPT_HASH_MISMATCH',
    mismatchMessage: '两侧 Prompt 哈希不一致。',
  })
  addIdentityComparison({
    valueA: runA.benchmarkManifestHash,
    valueB: runB.benchmarkManifestHash,
    unknownCode: 'MANIFEST_UNKNOWN',
    unknownMessage: '至少一侧 benchmark manifest 哈希未知。',
    mismatchCode: 'MANIFEST_MISMATCH',
    mismatchMessage: '两侧 benchmark manifest 哈希不一致。',
  })
  addConfigurationComparison({
    valueA: runA.adapterId,
    valueB: runB.adapterId,
    label: 'Agent adapter',
    code: 'ADAPTER',
  })
  addConfigurationComparison({
    valueA: runA.versionNormalized,
    valueB: runB.versionNormalized,
    label: 'CLI 版本',
    code: 'CLI_VERSION',
  })
  const modelUnknown = [
    runA.requestedModel,
    runB.requestedModel,
    runA.effectiveModel,
    runB.effectiveModel,
  ].some(isUnknown)
  addCaution(
    modelUnknown,
    'MODEL_UNKNOWN',
    '至少一侧 requested/effective model 有未记录项。',
  )
  addCaution(
    !modelUnknown && (runA.requestedModel !== runB.requestedModel
      || runA.effectiveModel !== runB.effectiveModel),
    'MODEL_MISMATCH',
    '两侧 requested/effective model 不一致。',
  )
  const effortUnknown = [
    runA.requestedEffort,
    runB.requestedEffort,
    runA.adapterEffortValue,
    runB.adapterEffortValue,
    runA.effectiveEffort,
    runB.effectiveEffort,
  ].some(isUnknown)
  addCaution(
    effortUnknown,
    'EFFORT_UNKNOWN',
    '至少一侧 requested/adapter/effective effort 有未记录项。',
  )
  addCaution(
    !effortUnknown && (runA.requestedEffort !== runB.requestedEffort
      || runA.adapterEffortValue !== runB.adapterEffortValue
      || runA.effectiveEffort !== runB.effectiveEffort),
    'EFFORT_MISMATCH',
    '两侧 requested/adapter/effective effort 不一致。',
  )
  addCaution(
    !isUnknown(runA.adapterId)
      && !isUnknown(runB.adapterId)
      && runA.adapterId !== runB.adapterId
      && !effortUnknown,
    'CROSS_ADAPTER_EFFORT_SEMANTICS',
    '不同 adapter 中同名 effort 不代表严格等价的计算预算。',
  )
  for (const [valueA, valueB, label, code] of [
    [runA.runMode, runB.runMode, '运行模式', 'RUN_MODE'],
    [runA.dependencyStrategy, runB.dependencyStrategy, '依赖策略', 'DEPENDENCY_STRATEGY'],
    [runA.permissionPolicy, runB.permissionPolicy, '权限策略', 'PERMISSION_POLICY'],
    [runA.writeIsolation, runB.writeIsolation, '写入隔离', 'WRITE_ISOLATION'],
    [runA.secretIsolation, runB.secretIsolation, 'secret 隔离', 'SECRET_ISOLATION'],
    [runA.toolNetworkIsolation, runB.toolNetworkIsolation, '工具网络隔离', 'TOOL_NETWORK_ISOLATION'],
  ]) {
    addConfigurationComparison({ valueA, valueB, label, code })
  }
  addCaution(
    runA.executionConfigVerified !== true || runB.executionConfigVerified !== true,
    'EXECUTION_UNVERIFIED',
    '至少一侧实际执行配置未验证。',
  )
  addCaution(
    runA.executionConfigVerified !== runB.executionConfigVerified,
    'EXECUTION_VERIFICATION_MISMATCH',
    '两侧 execution verification 状态不一致。',
  )
  addConfigurationComparison({
    valueA: runA.executionConfigSource,
    valueB: runB.executionConfigSource,
    label: 'execution config source',
    code: 'EXECUTION_CONFIG_SOURCE',
  })
  const exposureTypesA = Array.isArray(runA.exposureTypes)
    ? [...runA.exposureTypes].toSorted().join('\0')
    : ''
  const exposureTypesB = Array.isArray(runB.exposureTypes)
    ? [...runB.exposureTypes].toSorted().join('\0')
    : ''
  addCaution(
    runA.exposureState !== runB.exposureState || exposureTypesA !== exposureTypesB,
    'EXPOSURE_MISMATCH',
    '两侧 oracle exposure 状态或类型不一致。',
  )
  if (postExposure) {
    incompatible = true
    warnings.push({
      code: 'POST_EXPOSURE',
      message: '至少一侧评价产生于 oracle 暴露之后，不能作为公平首轮对比。',
    })
  }
  if (iterated) {
    warnings.push({
      code: 'ITERATED_EVALUATION',
      message: '至少一侧显式选择了迭代评价；这不是双方首轮 primary 的公平对比。',
    })
  }

  return {
    schemaVersion: 2,
    type: 'comparison',
    comparability: {
      level: incompatible ? 'incomparable' : caution || iterated ? 'caution' : 'fair',
      warnings,
    },
    runA: buildComparisonSide(runA, selectedA),
    runB: buildComparisonSide(runB, selectedB),
  }
}

export function buildResultDetail(repository, runRef) {
  const run = repository.getRun(runRef)
  const evaluations = repository.listEvaluations(run.id).map(evaluation => {
    let label = 'ITERATION'
    if (evaluation.id === run.primaryEvaluationId) label = 'PRIMARY'
    else if (evaluation.id === run.latestEvaluationId) label = 'LATEST'
    return {
      ...buildComparisonSide(run, evaluation),
      label,
    }
  })

  return {
    schemaVersion: 2,
    type: 'result',
    run: {
      runId: run.id,
      displayId: run.displayId ?? run.id.replaceAll('-', '').slice(0, 8),
      caseId: run.caseId ?? null,
      title: run.title ?? null,
      status: run.status ?? null,
      primaryEvaluationId: run.primaryEvaluationId ?? null,
      latestEvaluationId: run.latestEvaluationId ?? null,
      adapterId: run.adapterId ?? null,
      adapterDisplayName: run.adapterDisplayName ?? null,
      versionRaw: run.versionRaw ?? null,
      versionNormalized: run.versionNormalized ?? null,
      requestedModel: run.requestedModel ?? null,
      effectiveModel: run.effectiveModel ?? null,
      requestedEffort: run.requestedEffort ?? null,
      adapterEffortValue: run.adapterEffortValue ?? null,
      effectiveEffort: run.effectiveEffort ?? null,
      runMode: run.runMode ?? null,
      dependencyStrategy: run.dependencyStrategy ?? null,
      permissionPolicy: run.permissionPolicy ?? null,
      writeIsolation: run.writeIsolation ?? null,
      secretIsolation: run.secretIsolation ?? null,
      toolNetworkIsolation: run.toolNetworkIsolation ?? null,
      executionConfigVerified: run.executionConfigVerified === true,
      executionConfigSource: run.executionConfigSource ?? null,
      exposureState: run.exposureState ?? null,
      exposureTypes: Array.isArray(run.exposureTypes) ? [...run.exposureTypes] : [],
      inputTokens: run.inputTokens ?? null,
      outputTokens: run.outputTokens ?? null,
      cachedTokens: run.cachedTokens ?? null,
      reasoningTokens: run.reasoningTokens ?? null,
      cost: run.cost ?? null,
      agentDurationMs: run.agentDurationMs ?? null,
    },
    evaluations,
  }
}
