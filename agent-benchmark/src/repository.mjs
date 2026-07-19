import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import Database from 'better-sqlite3'

const CURRENT_SCHEMA_VERSION = 1
const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const DEFAULT_RUNNER_VERSION = '2'
const FULL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_PREFIX_PATTERN = /^[0-9a-f]+$/i
const INCOMPLETE_RUN_STATUSES = [
  'preparing',
  'prepared',
  'agent_running',
  'ready_for_evaluation',
  'evaluating',
  'evaluation_failed',
]

const RUN_UPDATE_COLUMNS = {
  displayId: 'display_id',
  caseId: 'case_id',
  title: 'case_title',
  baseTree: 'base_tree',
  benchmarkManifestHash: 'benchmark_manifest_hash',
  promptVersion: 'prompt_template_version',
  promptProvenance: 'prompt_provenance',
  promptText: 'prompt_text',
  promptHash: 'prompt_hash',
  adapterId: 'adapter_id',
  adapterDisplayName: 'adapter_display_name',
  executablePath: 'executable_path',
  executableRealpath: 'executable_realpath',
  versionRaw: 'version_raw',
  versionNormalized: 'version_normalized',
  capabilities: 'capabilities_json',
  requestedModel: 'requested_model',
  effectiveModel: 'effective_model',
  requestedEffort: 'requested_effort',
  adapterEffortValue: 'adapter_effort_value',
  effectiveEffort: 'effective_effort',
  runMode: 'run_mode',
  executionConfigVerified: 'execution_config_verified',
  executionConfigSource: 'execution_config_source',
  permissionPolicy: 'permission_policy',
  writeIsolation: 'write_isolation',
  secretIsolation: 'secret_isolation',
  toolNetworkIsolation: 'tool_network_isolation',
  dependencyStrategy: 'dependency_strategy',
  agentTimeoutMs: 'agent_timeout_ms',
  workspace: 'workspace',
  agentOutcome: 'agent_outcome',
  agentExitCode: 'agent_exit_code',
  agentSignal: 'agent_signal',
  agentSessionId: 'agent_session_id',
  agentStartedAt: 'agent_started_at',
  agentFinishedAt: 'agent_finished_at',
  agentDurationMs: 'agent_duration_ms',
  inputTokens: 'input_tokens',
  outputTokens: 'output_tokens',
  cachedTokens: 'cached_tokens',
  reasoningTokens: 'reasoning_tokens',
  cost: 'cost',
  exposureState: 'exposure_state',
  oracleExposedAt: 'oracle_exposed_at',
  exposureTypes: 'exposure_types_json',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  completedAt: 'completed_at',
  safeErrorSummary: 'safe_error_summary',
}

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function pickField(value, key, aliases = []) {
  for (const candidate of [key, ...aliases]) {
    if (hasOwn(value, candidate)) return value[candidate]
  }
  throw new TypeError(`Run field ${key} is required`)
}

function optionalField(value, key, aliases = [], fallback = null) {
  for (const candidate of [key, ...aliases]) {
    if (hasOwn(value, candidate)) return value[candidate] ?? null
  }
  return fallback
}

function jsonStringify(value, label) {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) throw new TypeError('value is not JSON serializable')
    return stableJsonStringify(JSON.parse(serialized))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new TypeError(`${label} must be JSON serializable: ${message}`)
  }
}

function stableJsonStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableJsonStringify(item)).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function jsonParse(value, label) {
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Stored ${label} JSON is invalid: ${message}`)
  }
}

function booleanInteger(value) {
  return value ? 1 : 0
}

function nullable(value) {
  return value === undefined ? null : value
}

function elapsedMilliseconds(startedAt, finishedAt) {
  const started = Date.parse(startedAt)
  const finished = Date.parse(finishedAt)
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return null
  return Math.max(0, finished - started)
}

function normalizeUuid(id, label) {
  if (typeof id !== 'string' || !FULL_UUID_PATTERN.test(id)) {
    throw new TypeError(`${label} must be a UUID`)
  }
  return id.toLowerCase()
}

function normalizeNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}

function normalizeTimestamp(value, label) {
  normalizeNonEmptyString(value, label)
  if (!Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must be a valid timestamp`)
  }
  return value
}

function operationLeaseRecord(row) {
  if (row === undefined) return null
  return {
    runId: row.run_id,
    operationType: row.operation_type,
    attemptId: row.attempt_id,
    ownerToken: row.owner_token,
    pid: row.pid,
    hostFingerprint: row.host_fingerprint,
    acquiredAt: row.acquired_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
  }
}

function normalizeRunInput(input) {
  const run = requireObject(input, 'Run')
  const id = normalizeUuid(pickField(run, 'id'), 'Run id')
  const capabilities = pickField(run, 'capabilities')
  const executionConfigVerified = pickField(run, 'executionConfigVerified')
  if (typeof executionConfigVerified !== 'boolean') {
    throw new TypeError('Run field executionConfigVerified must be a boolean')
  }

  return {
    id,
    displayId: optionalField(run, 'displayId', ['shortId'], id.replaceAll('-', '').slice(0, 8)),
    caseId: pickField(run, 'caseId'),
    title: pickField(run, 'title', ['caseTitle']),
    baseTree: pickField(run, 'baseTree'),
    benchmarkManifestHash: optionalField(run, 'benchmarkManifestHash', ['manifestHash']),
    promptVersion: pickField(run, 'promptVersion', ['promptTemplateVersion']),
    promptProvenance: optionalField(run, 'promptProvenance', [], 'generated'),
    promptText: pickField(run, 'promptText', ['prompt']),
    promptHash: pickField(run, 'promptHash', ['promptSha256']),
    adapterId: pickField(run, 'adapterId'),
    adapterDisplayName: pickField(run, 'adapterDisplayName'),
    executablePath: pickField(run, 'executablePath', ['plannedCliExecutable']),
    executableRealpath: pickField(run, 'executableRealpath', ['plannedCliRealpath']),
    versionRaw: pickField(run, 'versionRaw', ['plannedCliVersionRaw']),
    versionNormalized: pickField(run, 'versionNormalized', ['plannedCliVersionNormalized']),
    capabilities: jsonStringify(capabilities, 'Run capabilities'),
    requestedModel: pickField(run, 'requestedModel'),
    effectiveModel: optionalField(run, 'effectiveModel'),
    requestedEffort: pickField(run, 'requestedEffort'),
    adapterEffortValue: pickField(run, 'adapterEffortValue'),
    effectiveEffort: optionalField(run, 'effectiveEffort'),
    runMode: pickField(run, 'runMode'),
    executionConfigVerified: booleanInteger(executionConfigVerified),
    executionConfigSource: optionalField(run, 'executionConfigSource'),
    permissionPolicy: optionalField(run, 'permissionPolicy'),
    writeIsolation: optionalField(run, 'writeIsolation'),
    secretIsolation: optionalField(run, 'secretIsolation'),
    toolNetworkIsolation: optionalField(run, 'toolNetworkIsolation'),
    dependencyStrategy: pickField(run, 'dependencyStrategy'),
    agentTimeoutMs: optionalField(run, 'agentTimeoutMs'),
    workspace: pickField(run, 'workspace'),
    status: pickField(run, 'status'),
    agentOutcome: optionalField(run, 'agentOutcome'),
    agentExitCode: optionalField(run, 'agentExitCode'),
    agentSignal: optionalField(run, 'agentSignal'),
    agentSessionId: optionalField(run, 'agentSessionId'),
    agentStartedAt: optionalField(run, 'agentStartedAt'),
    agentFinishedAt: optionalField(run, 'agentFinishedAt'),
    agentDurationMs: optionalField(run, 'agentDurationMs'),
    inputTokens: optionalField(run, 'inputTokens'),
    outputTokens: optionalField(run, 'outputTokens'),
    cachedTokens: optionalField(run, 'cachedTokens'),
    reasoningTokens: optionalField(run, 'reasoningTokens'),
    cost: optionalField(run, 'cost'),
    exposureState: optionalField(run, 'exposureState', [], 'blind'),
    oracleExposedAt: optionalField(run, 'oracleExposedAt'),
    exposureTypes: hasOwn(run, 'exposureTypes')
      ? jsonStringify(run.exposureTypes, 'Run exposure types')
      : null,
    createdAt: pickField(run, 'createdAt'),
    updatedAt: pickField(run, 'updatedAt'),
    completedAt: optionalField(run, 'completedAt'),
    safeErrorSummary: optionalField(run, 'safeErrorSummary'),
  }
}

const MIGRATION_1 = `
  CREATE TABLE IF NOT EXISTS benchmark_runs (
    id TEXT PRIMARY KEY,
    display_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    case_title TEXT NOT NULL,
    base_tree TEXT NOT NULL,
    benchmark_manifest_hash TEXT,
    prompt_template_version TEXT,
    prompt_provenance TEXT NOT NULL DEFAULT 'generated',
    prompt_text TEXT,
    prompt_hash TEXT,
    adapter_id TEXT,
    adapter_display_name TEXT,
    executable_path TEXT,
    executable_realpath TEXT,
    version_raw TEXT,
    version_normalized TEXT,
    capabilities_json TEXT NOT NULL,
    requested_model TEXT,
    effective_model TEXT,
    requested_effort TEXT,
    adapter_effort_value TEXT,
    effective_effort TEXT,
    run_mode TEXT NOT NULL,
    execution_config_verified INTEGER NOT NULL CHECK (execution_config_verified IN (0, 1)),
    execution_config_source TEXT,
    permission_policy TEXT,
    write_isolation TEXT,
    secret_isolation TEXT,
    tool_network_isolation TEXT,
    dependency_strategy TEXT NOT NULL,
    agent_timeout_ms INTEGER,
    workspace TEXT NOT NULL,
    status TEXT NOT NULL,
    agent_outcome TEXT,
    agent_exit_code INTEGER,
    agent_signal TEXT,
    agent_session_id TEXT,
    agent_started_at TEXT,
    agent_finished_at TEXT,
    agent_duration_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cached_tokens INTEGER,
    reasoning_tokens INTEGER,
    cost REAL,
    primary_evaluation_id TEXT REFERENCES evaluations(id),
    latest_evaluation_id TEXT REFERENCES evaluations(id),
    exposure_state TEXT NOT NULL DEFAULT 'blind',
    oracle_exposed_at TEXT,
    exposure_types_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    safe_error_summary TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_launches (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    executable_path TEXT NOT NULL,
    executable_realpath TEXT NOT NULL,
    version_raw TEXT,
    version_normalized TEXT,
    capabilities_json TEXT NOT NULL,
    invocation_mode TEXT NOT NULL,
    sanitized_argv_json TEXT NOT NULL,
    invocation_fingerprint TEXT NOT NULL,
    permission_policy TEXT,
    telemetry_status TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER,
    exit_code INTEGER,
    signal TEXT,
    termination_reason TEXT,
    session_id TEXT,
    effective_model TEXT,
    effective_effort TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cached_tokens INTEGER,
    reasoning_tokens INTEGER,
    cost REAL,
    safe_error_summary TEXT,
    UNIQUE (run_id, attempt_number)
  );

  CREATE TABLE IF NOT EXISTS evaluations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    candidate_fingerprint TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER,
    status TEXT NOT NULL,
    schema_version INTEGER,
    case_id TEXT,
    title TEXT,
    workspace TEXT,
    score REAL,
    max_score REAL,
    check_score REAL,
    check_max_score REAL,
    check_weight REAL,
    changed_file_candidate_count INTEGER,
    changed_file_reference_count INTEGER,
    changed_file_matched_count INTEGER,
    changed_file_precision REAL,
    changed_file_recall REAL,
    changed_file_f1 REAL,
    changed_file_weight REAL,
    oracle_file_count INTEGER,
    dependency_mode TEXT,
    reveal_check_output INTEGER NOT NULL DEFAULT 0 CHECK (reveal_check_output IN (0, 1)),
    keep_evaluation INTEGER NOT NULL DEFAULT 0 CHECK (keep_evaluation IN (0, 1)),
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    post_exposure INTEGER NOT NULL DEFAULT 0 CHECK (post_exposure IN (0, 1)),
    evaluator_version TEXT,
    runner_version TEXT,
    report_json TEXT,
    artifact_path TEXT,
    safe_error_summary TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS evaluations_one_primary_per_run
    ON evaluations(run_id)
    WHERE is_primary = 1;

  CREATE TABLE IF NOT EXISTS evaluation_checks (
    evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL,
    label TEXT NOT NULL,
    kind TEXT,
    sort_order INTEGER NOT NULL,
    points REAL NOT NULL,
    passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
    exit_code INTEGER,
    signal TEXT,
    duration_ms INTEGER,
    details_hidden INTEGER NOT NULL CHECK (details_hidden IN (0, 1)),
    diagnostic_reference TEXT,
    PRIMARY KEY (evaluation_id, check_id)
  );

  CREATE TABLE IF NOT EXISTS run_events (
    run_id TEXT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (run_id, sequence)
  );

  CREATE TABLE IF NOT EXISTS operation_leases (
    run_id TEXT PRIMARY KEY REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    operation_type TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    owner_token TEXT NOT NULL,
    pid INTEGER NOT NULL,
    host_fingerprint TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TRIGGER IF NOT EXISTS benchmark_runs_primary_evaluation_is_immutable
  BEFORE UPDATE OF primary_evaluation_id ON benchmark_runs
  WHEN OLD.primary_evaluation_id IS NOT NULL
    AND NEW.primary_evaluation_id IS NOT OLD.primary_evaluation_id
  BEGIN
    SELECT RAISE(ABORT, 'primary evaluation is immutable');
  END;

  CREATE TRIGGER IF NOT EXISTS evaluations_primary_flag_is_immutable
  BEFORE UPDATE OF is_primary ON evaluations
  WHEN OLD.is_primary = 1 AND NEW.is_primary != 1
  BEGIN
    SELECT RAISE(ABORT, 'primary evaluation is immutable');
  END;
`

export function defaultDatabasePath(repoRoot) {
  return join(resolve(repoRoot), '.agent-benchmark', 'benchmark.sqlite3')
}

export class BenchmarkRepository {
  constructor(databasePath, { runnerVersion = DEFAULT_RUNNER_VERSION } = {}) {
    if (typeof databasePath !== 'string' || databasePath.length === 0) {
      throw new TypeError('A database path is required')
    }

    this.databasePath = databasePath === ':memory:' ? databasePath : resolve(databasePath)
    this.runnerVersion = runnerVersion
    this.closed = false
    const previousUmask = process.platform === 'win32' ? null : process.umask(0o077)
    try {
      if (this.databasePath !== ':memory:') {
        mkdirSync(dirname(this.databasePath), { recursive: true, mode: 0o700 })
      }
      this.database = new Database(this.databasePath)
      this.#configureConnection()
      this.#migrate()
      this.#hardenFilePermissions()
    } catch (error) {
      this.database?.close()
      this.closed = true
      throw error
    } finally {
      if (previousUmask !== null) process.umask(previousUmask)
    }
  }

  static open(databasePath, options) {
    return new BenchmarkRepository(databasePath, options)
  }

  #configureConnection() {
    this.database.pragma('foreign_keys = ON')
    this.database.pragma(`busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS}`)
    this.database.pragma('journal_mode = WAL')
  }

  #hardenFilePermissions() {
    if (this.databasePath === ':memory:' || process.platform === 'win32') return
    for (const path of [
      this.databasePath,
      `${this.databasePath}-wal`,
      `${this.databasePath}-shm`,
    ]) {
      if (existsSync(path)) chmodSync(path, 0o600)
    }
  }

  #migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL,
        runner_version TEXT NOT NULL
      )
    `)

    const migration = this.database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get()
    const databaseVersion = migration.version ?? 0
    if (databaseVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${databaseVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}`,
      )
    }

    if (databaseVersion < 1) {
      this.database.transaction(() => {
        this.database.exec(MIGRATION_1)
        this.database.prepare(`
          INSERT INTO schema_migrations (version, applied_at, runner_version)
          VALUES (?, ?, ?)
        `).run(1, new Date().toISOString(), this.runnerVersion)
      })()
    }
  }

  createRun(run) {
    const normalized = normalizeRunInput(run)
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO benchmark_runs (
          id,
          display_id,
          case_id,
          case_title,
          base_tree,
          benchmark_manifest_hash,
          prompt_template_version,
          prompt_provenance,
          prompt_text,
          prompt_hash,
          adapter_id,
          adapter_display_name,
          executable_path,
          executable_realpath,
          version_raw,
          version_normalized,
          capabilities_json,
          requested_model,
          effective_model,
          requested_effort,
          adapter_effort_value,
          effective_effort,
          run_mode,
          execution_config_verified,
          execution_config_source,
          permission_policy,
          write_isolation,
          secret_isolation,
          tool_network_isolation,
          dependency_strategy,
          agent_timeout_ms,
          workspace,
          status,
          agent_outcome,
          agent_exit_code,
          agent_signal,
          agent_session_id,
          agent_started_at,
          agent_finished_at,
          agent_duration_ms,
          input_tokens,
          output_tokens,
          cached_tokens,
          reasoning_tokens,
          cost,
          exposure_state,
          oracle_exposed_at,
          exposure_types_json,
          created_at,
          updated_at,
          completed_at,
          safe_error_summary
        ) VALUES (
          @id,
          @displayId,
          @caseId,
          @title,
          @baseTree,
          @benchmarkManifestHash,
          @promptVersion,
          @promptProvenance,
          @promptText,
          @promptHash,
          @adapterId,
          @adapterDisplayName,
          @executablePath,
          @executableRealpath,
          @versionRaw,
          @versionNormalized,
          @capabilities,
          @requestedModel,
          @effectiveModel,
          @requestedEffort,
          @adapterEffortValue,
          @effectiveEffort,
          @runMode,
          @executionConfigVerified,
          @executionConfigSource,
          @permissionPolicy,
          @writeIsolation,
          @secretIsolation,
          @toolNetworkIsolation,
          @dependencyStrategy,
          @agentTimeoutMs,
          @workspace,
          @status,
          @agentOutcome,
          @agentExitCode,
          @agentSignal,
          @agentSessionId,
          @agentStartedAt,
          @agentFinishedAt,
          @agentDurationMs,
          @inputTokens,
          @outputTokens,
          @cachedTokens,
          @reasoningTokens,
          @cost,
          @exposureState,
          @oracleExposedAt,
          @exposureTypes,
          @createdAt,
          @updatedAt,
          @completedAt,
          @safeErrorSummary
        )
      `).run(normalized)
      this.#appendEvent(normalized.id, 'run_created', normalized.createdAt, {
        status: normalized.status,
      })
    })()
    return this.getRun(normalized.id)
  }

  getRun(idOrUniquePrefix) {
    const id = this.#resolveRunId(idOrUniquePrefix)
    return this.#readRun(id)
  }

  listRuns() {
    return this.database.prepare(`
      SELECT *
      FROM benchmark_runs
      ORDER BY created_at DESC, id ASC
    `).all().map(row => this.#runRecord(row))
  }

  listResultSummaries({
    caseId,
    adapterId,
    requestedModel,
    from,
    to,
    limit = 20,
    offset = 0,
  } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError('limit must be an integer between 1 and 100')
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new TypeError('offset must be a non-negative integer')
    }
    for (const [label, value] of [
      ['caseId', caseId],
      ['adapterId', adapterId],
      ['requestedModel', requestedModel],
    ]) {
      if (value !== undefined) normalizeNonEmptyString(value, label)
    }
    if (from !== undefined) normalizeTimestamp(from, 'from')
    if (to !== undefined) normalizeTimestamp(to, 'to')
    if (from !== undefined && to !== undefined && Date.parse(from) > Date.parse(to)) {
      throw new TypeError('from must not be after to')
    }

    const predicates = []
    const parameters = { limit, offset }
    if (caseId !== undefined) {
      predicates.push('runs.case_id = @caseId')
      parameters.caseId = caseId
    }
    if (adapterId !== undefined) {
      predicates.push('runs.adapter_id = @adapterId')
      parameters.adapterId = adapterId
    }
    if (requestedModel !== undefined) {
      predicates.push('runs.requested_model = @requestedModel')
      parameters.requestedModel = requestedModel
    }
    if (from !== undefined) {
      predicates.push('COALESCE(latest.finished_at, runs.updated_at) >= @from')
      parameters.from = from
    }
    if (to !== undefined) {
      predicates.push('COALESCE(latest.finished_at, runs.updated_at) <= @to')
      parameters.to = to
    }
    const whereClause = predicates.length === 0
      ? ''
      : `WHERE ${predicates.join('\n        AND ')}`

    const rows = this.database.prepare(`
      WITH completed_evaluations AS (
        SELECT evaluations.*,
               ROW_NUMBER() OVER (
                 PARTITION BY run_id
                 ORDER BY finished_at DESC, id ASC
               ) AS recency
        FROM evaluations
        WHERE status = 'completed'
          AND finished_at IS NOT NULL
      )
      SELECT runs.id,
             runs.display_id,
             runs.case_id,
             runs.case_title,
             runs.adapter_id,
             runs.adapter_display_name,
             runs.version_normalized,
             runs.requested_model,
             runs.requested_effort,
             runs.run_mode,
             runs.status,
             runs.execution_config_verified,
             runs.agent_duration_ms,
             runs.input_tokens,
             runs.output_tokens,
             runs.cached_tokens,
             runs.reasoning_tokens,
             runs.cost,
             COALESCE(latest.finished_at, runs.updated_at) AS activity_at,
             primary_evaluation.id AS primary_evaluation_id,
             primary_evaluation.score AS primary_score,
             primary_evaluation.max_score AS primary_max_score,
             primary_evaluation.changed_file_f1 AS primary_changed_file_f1,
             primary_evaluation.finished_at AS primary_finished_at,
             primary_evaluation.duration_ms AS primary_duration_ms,
             latest.id AS completed_latest_evaluation_id,
             EXISTS (
               SELECT 1
               FROM completed_evaluations later
               WHERE later.run_id = runs.id
                 AND later.id != primary_evaluation.id
                 AND (
                   later.finished_at > primary_evaluation.finished_at
                   OR (
                     later.finished_at = primary_evaluation.finished_at
                     AND later.id < primary_evaluation.id
                   )
                 )
             ) AS has_later_evaluation,
             EXISTS (
               SELECT 1
               FROM completed_evaluations non_primary
               WHERE non_primary.run_id = runs.id
                 AND non_primary.is_primary = 0
             ) AS has_non_primary_evaluation
      FROM benchmark_runs runs
      LEFT JOIN completed_evaluations latest
        ON latest.run_id = runs.id
       AND latest.recency = 1
      LEFT JOIN evaluations primary_evaluation
        ON primary_evaluation.id = runs.primary_evaluation_id
       AND primary_evaluation.status = 'completed'
      ${whereClause}
      ORDER BY (latest.id IS NULL) ASC,
               latest.finished_at DESC,
               CASE WHEN latest.id IS NULL THEN runs.updated_at END DESC,
               runs.id ASC
      LIMIT @limit OFFSET @offset
    `).all(parameters)

    const primaryEvaluationIds = rows
      .map(row => row.primary_evaluation_id)
      .filter(id => id !== null)
    const checksByEvaluationId = new Map()
    if (primaryEvaluationIds.length > 0) {
      const placeholders = primaryEvaluationIds.map(() => '?').join(', ')
      const checks = this.database.prepare(`
        SELECT evaluation_id, check_id, points, passed, duration_ms
        FROM evaluation_checks
        WHERE evaluation_id IN (${placeholders})
          AND check_id IN ('behavior', 'typecheck', 'build')
        ORDER BY evaluation_id ASC, sort_order ASC, check_id ASC
      `).all(...primaryEvaluationIds)
      for (const check of checks) {
        let evaluationChecks = checksByEvaluationId.get(check.evaluation_id)
        if (evaluationChecks === undefined) {
          evaluationChecks = {}
          checksByEvaluationId.set(check.evaluation_id, evaluationChecks)
        }
        evaluationChecks[check.check_id] = {
          id: check.check_id,
          passed: check.passed === 1,
          points: check.points,
          durationMs: check.duration_ms,
        }
      }
    }

    const total = this.database.prepare(`
      WITH completed_evaluations AS (
        SELECT evaluations.*,
               ROW_NUMBER() OVER (
                 PARTITION BY run_id
                 ORDER BY finished_at DESC, id ASC
               ) AS recency
        FROM evaluations
        WHERE status = 'completed'
          AND finished_at IS NOT NULL
      )
      SELECT COUNT(*) AS count
      FROM benchmark_runs runs
      LEFT JOIN completed_evaluations latest
        ON latest.run_id = runs.id
       AND latest.recency = 1
      ${whereClause}
    `).get(parameters).count

    return {
      items: rows.map(row => {
        const storedChecks = checksByEvaluationId.get(row.primary_evaluation_id) ?? {}
        return {
          id: row.id,
          displayId: row.display_id,
          caseId: row.case_id,
          title: row.case_title,
          adapterId: row.adapter_id,
          adapterDisplayName: row.adapter_display_name,
          versionNormalized: row.version_normalized,
          requestedModel: row.requested_model,
          requestedEffort: row.requested_effort,
          runMode: row.run_mode,
          status: row.status,
          executionConfigVerified: row.execution_config_verified === 1,
          agentDurationMs: row.agent_duration_ms,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          cachedTokens: row.cached_tokens,
          reasoningTokens: row.reasoning_tokens,
          cost: row.cost,
          activityAt: row.activity_at,
          primaryEvaluation: row.primary_evaluation_id === null
            ? null
            : {
                id: row.primary_evaluation_id,
                score: row.primary_score,
                maxScore: row.primary_max_score,
                changedFileF1: row.primary_changed_file_f1,
                finishedAt: row.primary_finished_at,
                durationMs: row.primary_duration_ms,
                checks: {
                  behavior: storedChecks.behavior ?? null,
                  typecheck: storedChecks.typecheck ?? null,
                  build: storedChecks.build ?? null,
                },
              },
          latestEvaluationId: row.completed_latest_evaluation_id,
          hasLaterEvaluation: row.has_later_evaluation === 1,
          hasNonPrimaryEvaluation: row.has_non_primary_evaluation === 1,
        }
      }),
      total,
      limit,
      offset,
      hasPrevious: offset > 0,
      hasNext: offset + rows.length < total,
    }
  }

  listResumableHandoffRuns() {
    const placeholders = INCOMPLETE_RUN_STATUSES.map(() => '?').join(', ')
    return this.database.prepare(`
      SELECT *
      FROM benchmark_runs
      WHERE status IN (${placeholders})
        AND run_mode = 'handoff'
      ORDER BY updated_at DESC, id ASC
    `).all(...INCOMPLETE_RUN_STATUSES).map(row => this.#runRecord(row))
  }

  transitionRun(runId, allowedStatuses, nextStatus, updates = {}) {
    if (!Array.isArray(allowedStatuses) || allowedStatuses.length === 0) {
      throw new TypeError('allowedStatuses must be a non-empty array')
    }
    if (allowedStatuses.some(status => typeof status !== 'string' || status.length === 0)) {
      throw new TypeError('allowedStatuses must contain status strings')
    }
    if (typeof nextStatus !== 'string' || nextStatus.length === 0) {
      throw new TypeError('nextStatus must be a non-empty string')
    }
    requireObject(updates, 'Run updates')

    const id = this.#resolveRunId(runId)
    const updateEntries = []
    const parameters = {
      id,
      nextStatus,
    }
    const requestedUpdates = { ...updates }
    if (!hasOwn(requestedUpdates, 'updatedAt') || requestedUpdates.updatedAt === undefined) {
      requestedUpdates.updatedAt = new Date().toISOString()
    }

    for (const [key, value] of Object.entries(requestedUpdates)) {
      if (value === undefined) continue
      const column = RUN_UPDATE_COLUMNS[key]
      if (column === undefined) {
        throw new TypeError(`Run field ${key} cannot be updated`)
      }

      let storedValue = value
      if (key === 'capabilities') storedValue = jsonStringify(value, 'Run capabilities')
      if (key === 'exposureTypes') storedValue = jsonStringify(value, 'Run exposure types')
      if (key === 'executionConfigVerified') {
        if (typeof value !== 'boolean') {
          throw new TypeError('Run field executionConfigVerified must be a boolean')
        }
        storedValue = booleanInteger(value)
      }
      updateEntries.push(`${column} = @${key}`)
      parameters[key] = storedValue
    }

    const allowedParameters = allowedStatuses.map((status, index) => {
      const key = `allowedStatus${index}`
      parameters[key] = status
      return `@${key}`
    })
    const transitionedAt = requestedUpdates.updatedAt

    this.database.transaction(() => {
      const result = this.database.prepare(`
        UPDATE benchmark_runs
        SET ${['status = @nextStatus', ...updateEntries].join(',\n            ')}
        WHERE id = @id
          AND status IN (${allowedParameters.join(', ')})
      `).run(parameters)

      if (result.changes !== 1) {
        const current = this.database
          .prepare('SELECT status FROM benchmark_runs WHERE id = ?')
          .get(id)
        const actualStatus = current?.status ?? 'missing'
        throw new Error(
          `Run ${id} is in status ${actualStatus}; expected one of ${allowedStatuses.join(', ')}`,
        )
      }

      this.#appendEvent(id, 'run_status_transition', transitionedAt, {
        from: allowedStatuses,
        to: nextStatus,
      })
    })()

    return this.#readRun(id)
  }

  markRunReady(runId) {
    const run = this.getRun(runId)
    if (run.status === 'ready_for_evaluation') return run
    return this.transitionRun(
      run.id,
      ['prepared', 'agent_running', 'evaluation_failed'],
      'ready_for_evaluation',
      { safeErrorSummary: null },
    )
  }

  acquireOperationLease(
    runId,
    operationType,
    attemptId,
    ownerToken,
    pid,
    hostFingerprint,
    acquiredAt,
    expiresAt,
  ) {
    const id = this.#resolveRunId(runId)
    const normalizedOperationType = normalizeNonEmptyString(
      operationType,
      'Operation lease type',
    )
    const normalizedAttemptId = normalizeUuid(attemptId, 'Operation lease attempt id')
    const normalizedOwnerToken = normalizeNonEmptyString(
      ownerToken,
      'Operation lease owner token',
    )
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new TypeError('Operation lease pid must be a positive integer')
    }
    const normalizedHostFingerprint = normalizeNonEmptyString(
      hostFingerprint,
      'Operation lease host fingerprint',
    )
    const normalizedAcquiredAt = normalizeTimestamp(
      acquiredAt,
      'Operation lease acquiredAt',
    )
    const normalizedExpiresAt = normalizeTimestamp(
      expiresAt,
      'Operation lease expiresAt',
    )
    if (Date.parse(normalizedExpiresAt) <= Date.parse(normalizedAcquiredAt)) {
      throw new TypeError('Operation lease expiresAt must be after acquiredAt')
    }

    this.database.transaction(() => {
      const result = this.database.prepare(`
        INSERT INTO operation_leases (
          run_id,
          operation_type,
          attempt_id,
          owner_token,
          pid,
          host_fingerprint,
          acquired_at,
          heartbeat_at,
          expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO NOTHING
      `).run(
        id,
        normalizedOperationType,
        normalizedAttemptId,
        normalizedOwnerToken,
        pid,
        normalizedHostFingerprint,
        normalizedAcquiredAt,
        normalizedAcquiredAt,
        normalizedExpiresAt,
      )

      if (result.changes !== 1) {
        const existing = this.database.prepare(`
          SELECT operation_type, attempt_id, expires_at
          FROM operation_leases
          WHERE run_id = ?
        `).get(id)
        throw new Error(
          `Run ${id} already has an operation lease for ${existing.operation_type}`
          + ` attempt ${existing.attempt_id} until ${existing.expires_at}`,
        )
      }

      this.#appendEvent(id, 'operation_lease_acquired', normalizedAcquiredAt, {
        operationType: normalizedOperationType,
        attemptId: normalizedAttemptId,
        pid,
        hostFingerprint: normalizedHostFingerprint,
        expiresAt: normalizedExpiresAt,
      })
    })()

    return this.#readOperationLease(id)
  }

  renewOperationLease(runId, attemptId, ownerToken, heartbeatAt, expiresAt) {
    const id = this.#resolveRunId(runId)
    const normalizedAttemptId = normalizeUuid(attemptId, 'Operation lease attempt id')
    const normalizedOwnerToken = normalizeNonEmptyString(
      ownerToken,
      'Operation lease owner token',
    )
    const normalizedHeartbeatAt = normalizeTimestamp(
      heartbeatAt,
      'Operation lease heartbeatAt',
    )
    const normalizedExpiresAt = normalizeTimestamp(
      expiresAt,
      'Operation lease expiresAt',
    )
    if (Date.parse(normalizedExpiresAt) <= Date.parse(normalizedHeartbeatAt)) {
      throw new TypeError('Operation lease expiresAt must be after heartbeatAt')
    }

    const result = this.database.prepare(`
      UPDATE operation_leases
      SET heartbeat_at = ?,
          expires_at = ?
      WHERE run_id = ?
        AND attempt_id = ?
        AND owner_token = ?
    `).run(
      normalizedHeartbeatAt,
      normalizedExpiresAt,
      id,
      normalizedAttemptId,
      normalizedOwnerToken,
    )
    if (result.changes !== 1) {
      throw new Error(
        `Attempt ${normalizedAttemptId} with the supplied owner token does not own`
        + ` the operation lease for Run ${id}`,
      )
    }
    return this.#readOperationLease(id)
  }

  heartbeatOperationLease(runId, attemptId, ownerToken, heartbeatAt, expiresAt) {
    return this.renewOperationLease(
      runId,
      attemptId,
      ownerToken,
      heartbeatAt,
      expiresAt,
    )
  }

  releaseOperationLease(runId, attemptId, ownerToken) {
    const id = this.#resolveRunId(runId)
    const normalizedAttemptId = normalizeUuid(attemptId, 'Operation lease attempt id')
    const normalizedOwnerToken = normalizeNonEmptyString(
      ownerToken,
      'Operation lease owner token',
    )

    const result = this.database.prepare(`
      DELETE FROM operation_leases
      WHERE run_id = ?
        AND attempt_id = ?
        AND owner_token = ?
    `).run(id, normalizedAttemptId, normalizedOwnerToken)
    if (result.changes !== 1) {
      throw new Error(
        `Attempt ${normalizedAttemptId} with the supplied owner token does not own`
        + ` the operation lease for Run ${id}`,
      )
    }
    return true
  }

  getOperationLease(runId) {
    const id = this.#resolveRunId(runId)
    return this.#readOperationLease(id)
  }

  recoverExpiredOperation(runId, now) {
    const id = this.#resolveRunId(runId)
    const recoveredAt = normalizeTimestamp(now, 'Operation recovery timestamp')
    let outcome

    this.database.transaction(() => {
      const lease = this.database.prepare(`
        SELECT *
        FROM operation_leases
        WHERE run_id = ?
      `).get(id)
      if (lease === undefined) {
        outcome = { recovered: false, reason: 'no_lease' }
        return
      }
      if (Date.parse(lease.expires_at) > Date.parse(recoveredAt)) {
        outcome = {
          recovered: false,
          reason: 'not_expired',
          operationType: lease.operation_type,
          attemptId: lease.attempt_id,
          expiresAt: lease.expires_at,
        }
        return
      }

      let evaluationInterrupted = false
      let runStatus = this.database.prepare(`
        SELECT status
        FROM benchmark_runs
        WHERE id = ?
      `).get(id).status
      if (lease.operation_type === 'evaluation') {
        const evaluation = this.database.prepare(`
          SELECT *
          FROM evaluations
          WHERE id = ? AND run_id = ?
        `).get(lease.attempt_id, id)
        if (evaluation?.status === 'running') {
          this.database.prepare(`
            UPDATE evaluations
            SET status = 'interrupted',
                finished_at = ?,
                duration_ms = ?,
                safe_error_summary = NULL
            WHERE id = ? AND status = 'running'
          `).run(
            recoveredAt,
            elapsedMilliseconds(evaluation.started_at, recoveredAt),
            evaluation.id,
          )
          evaluationInterrupted = true

          const run = this.database.prepare(`
            SELECT status, primary_evaluation_id, latest_evaluation_id
            FROM benchmark_runs
            WHERE id = ?
          `).get(id)
          const hasCompletedEvaluation = run.primary_evaluation_id !== null
            || run.latest_evaluation_id !== null
          runStatus = hasCompletedEvaluation ? 'completed' : 'ready_for_evaluation'
          this.database.prepare(`
            UPDATE benchmark_runs
            SET status = ?,
                updated_at = ?,
                safe_error_summary = NULL
            WHERE id = ?
          `).run(runStatus, recoveredAt, id)
          this.#appendEvent(id, 'evaluation_interrupted', recoveredAt, {
            evaluationId: evaluation.id,
            leaseExpiredAt: lease.expires_at,
            previousRunStatus: run.status,
            nextRunStatus: runStatus,
          })
        }
      }

      const released = this.database.prepare(`
        DELETE FROM operation_leases
        WHERE run_id = ?
          AND attempt_id = ?
          AND owner_token = ?
      `).run(id, lease.attempt_id, lease.owner_token)
      if (released.changes !== 1) {
        throw new Error(`Operation lease changed while recovering Run ${id}`)
      }
      if (!evaluationInterrupted) {
        this.#appendEvent(id, 'operation_lease_recovered', recoveredAt, {
          operationType: lease.operation_type,
          attemptId: lease.attempt_id,
          leaseExpiredAt: lease.expires_at,
        })
      }

      outcome = {
        recovered: true,
        operationType: lease.operation_type,
        attemptId: lease.attempt_id,
        evaluationInterrupted,
        runStatus,
      }
    })()

    return outcome
  }

  beginEvaluation(runId, evaluationId, startedAt, candidateFingerprint) {
    const id = this.#resolveRunId(runId)
    const normalizedEvaluationId = normalizeUuid(evaluationId, 'Evaluation id')
    if (typeof startedAt !== 'string' || startedAt.length === 0) {
      throw new TypeError('Evaluation startedAt must be a non-empty string')
    }
    if (typeof candidateFingerprint !== 'string' || candidateFingerprint.length === 0) {
      throw new TypeError('Evaluation candidateFingerprint must be a non-empty string')
    }

    this.database.transaction(() => {
      const lease = this.database.prepare(`
        SELECT operation_type, attempt_id
        FROM operation_leases
        WHERE run_id = ?
      `).get(id)
      if (lease !== undefined
        && (lease.operation_type !== 'evaluation'
          || lease.attempt_id !== normalizedEvaluationId)) {
        throw new Error(
          `Run ${id} operation lease belongs to ${lease.operation_type}`
          + ` attempt ${lease.attempt_id}; cannot begin evaluation ${normalizedEvaluationId}`,
        )
      }

      const existing = this.database
        .prepare('SELECT * FROM evaluations WHERE id = ?')
        .get(normalizedEvaluationId)
      if (existing !== undefined) {
        const sameAttempt = existing.run_id === id
          && existing.started_at === startedAt
          && existing.candidate_fingerprint === candidateFingerprint
          && existing.status === 'running'
        if (sameAttempt) return
        throw new Error(`Evaluation already exists: ${normalizedEvaluationId}`)
      }

      const run = this.database.prepare(`
        SELECT status, primary_evaluation_id, latest_evaluation_id
        FROM benchmark_runs
        WHERE id = ?
      `).get(id)
      const isFirstEvaluation = run.latest_evaluation_id === null
      const allowed = isFirstEvaluation
        ? ['ready_for_evaluation', 'evaluation_failed', 'evaluating']
        : ['completed']
      if (!allowed.includes(run.status)) {
        throw new Error(
          `Run ${id} is in status ${run.status}; cannot begin an evaluation`,
        )
      }

      const running = this.database.prepare(`
        SELECT id
        FROM evaluations
        WHERE run_id = ? AND status = 'running'
        LIMIT 1
      `).get(id)
      if (running !== undefined) {
        throw new Error(`Run ${id} already has a running evaluation: ${running.id}`)
      }

      this.database.prepare(`
        INSERT INTO evaluations (
          id,
          run_id,
          candidate_fingerprint,
          started_at,
          status,
          runner_version
        ) VALUES (?, ?, ?, ?, 'running', ?)
      `).run(
        normalizedEvaluationId,
        id,
        candidateFingerprint,
        startedAt,
        this.runnerVersion,
      )

      if (isFirstEvaluation) {
        this.database.prepare(`
          UPDATE benchmark_runs
          SET status = 'evaluating',
              updated_at = ?,
              safe_error_summary = NULL
          WHERE id = ?
        `).run(startedAt, id)
      }
      this.#appendEvent(id, 'evaluation_started', startedAt, {
        evaluationId: normalizedEvaluationId,
        candidateFingerprint,
      })
    })()

    return this.getEvaluation(normalizedEvaluationId)
  }

  completeEvaluation(
    runId,
    evaluationId,
    report,
    finishedAt,
    postExposure = false,
    exposureTypes = [],
  ) {
    const id = this.#resolveRunId(runId)
    const normalizedEvaluationId = normalizeUuid(evaluationId, 'Evaluation id')
    requireObject(report, 'Evaluation report')
    if (!Array.isArray(report.checks)) {
      throw new TypeError('Evaluation report checks must be an array')
    }
    if (typeof finishedAt !== 'string' || finishedAt.length === 0) {
      throw new TypeError('Evaluation finishedAt must be a non-empty string')
    }
    if (typeof postExposure !== 'boolean') {
      throw new TypeError('postExposure must be a boolean')
    }
    if (!Array.isArray(exposureTypes)
      || exposureTypes.some(type => typeof type !== 'string' || type.length === 0)) {
      throw new TypeError('exposureTypes must contain non-empty strings')
    }
    const requestedExposureTypes = [...new Set(exposureTypes)].toSorted()

    const reportJson = jsonStringify(report, 'Evaluation report')
    this.database.transaction(() => {
      const evaluation = this.database
        .prepare('SELECT * FROM evaluations WHERE id = ?')
        .get(normalizedEvaluationId)
      if (evaluation === undefined) {
        throw new Error(`Evaluation not found: ${normalizedEvaluationId}`)
      }
      if (evaluation.run_id !== id) {
        throw new Error(
          `Evaluation ${normalizedEvaluationId} does not belong to Run ${id}`,
        )
      }
      if (evaluation.status === 'completed') {
        const sameReport = evaluation.report_json === reportJson
        if (sameReport) return
        throw new Error(
          `Evaluation ${normalizedEvaluationId} is already completed with a different report`,
        )
      }
      if (evaluation.status !== 'running') {
        throw new Error(
          `Evaluation ${normalizedEvaluationId} is in status ${evaluation.status}; expected running`,
        )
      }

      const run = this.database.prepare(`
        SELECT primary_evaluation_id,
               exposure_state,
               exposure_types_json,
               completed_at
        FROM benchmark_runs
        WHERE id = ?
      `).get(id)
      const exposed = run.exposure_state === 'oracle_exposed'
        || run.exposure_state === 'exposed'
      const effectivePostExposure = postExposure || exposed
      const isPrimary = run.primary_evaluation_id === null
        && !effectivePostExposure
      const existingExposureTypes = jsonParse(
        run.exposure_types_json,
        'run exposure types',
      ) ?? []
      const mergedExposureTypes = [
        ...new Set([...existingExposureTypes, ...requestedExposureTypes]),
      ].toSorted()
      const exposesOracle = requestedExposureTypes.length > 0
      const checkScoring = report.scoring?.checks ?? {}
      const changedFiles = report.scoring?.changedFiles ?? {}
      const revealCheckOutput = report.checks.some(check => check?.detailsHidden !== true)
      const keepEvaluation = report.evaluationDirectory !== null
        && report.evaluationDirectory !== undefined
        || Array.isArray(report.evaluationDirectories)
          && report.evaluationDirectories.length > 0
      const durationMs = report.durationMs ?? elapsedMilliseconds(
        evaluation.started_at,
        finishedAt,
      )
      const completedCandidateFingerprint = report.candidateFingerprint
        ?? evaluation.candidate_fingerprint
      if (typeof completedCandidateFingerprint !== 'string'
        || completedCandidateFingerprint.length === 0) {
        throw new TypeError('Evaluation candidate fingerprint must be a non-empty string')
      }

      this.database.prepare(`
        UPDATE evaluations
        SET candidate_fingerprint = @candidateFingerprint,
            finished_at = @finishedAt,
            duration_ms = @durationMs,
            status = 'completed',
            schema_version = @schemaVersion,
            case_id = @caseId,
            title = @title,
            workspace = @workspace,
            score = @score,
            max_score = @maxScore,
            check_score = @checkScore,
            check_max_score = @checkMaxScore,
            check_weight = @checkWeight,
            changed_file_candidate_count = @changedFileCandidateCount,
            changed_file_reference_count = @changedFileReferenceCount,
            changed_file_matched_count = @changedFileMatchedCount,
            changed_file_precision = @changedFilePrecision,
            changed_file_recall = @changedFileRecall,
            changed_file_f1 = @changedFileF1,
            changed_file_weight = @changedFileWeight,
            oracle_file_count = @oracleFileCount,
            dependency_mode = @dependencyMode,
            reveal_check_output = @revealCheckOutput,
            keep_evaluation = @keepEvaluation,
            is_primary = @isPrimary,
            post_exposure = @postExposure,
            evaluator_version = @evaluatorVersion,
            runner_version = @runnerVersion,
            report_json = @reportJson,
            artifact_path = @artifactPath,
            safe_error_summary = NULL
        WHERE id = @evaluationId
      `).run({
        evaluationId: normalizedEvaluationId,
        candidateFingerprint: completedCandidateFingerprint,
        finishedAt,
        durationMs: nullable(durationMs),
        schemaVersion: nullable(report.schemaVersion),
        caseId: nullable(report.caseId),
        title: nullable(report.title),
        workspace: nullable(report.workspace),
        score: nullable(report.score),
        maxScore: nullable(report.maxScore),
        checkScore: nullable(checkScoring.score),
        checkMaxScore: nullable(checkScoring.maxScore),
        checkWeight: nullable(checkScoring.weight),
        changedFileCandidateCount: nullable(changedFiles.candidateCount),
        changedFileReferenceCount: nullable(changedFiles.referenceCount),
        changedFileMatchedCount: nullable(changedFiles.matchedCount),
        changedFilePrecision: nullable(changedFiles.precision),
        changedFileRecall: nullable(changedFiles.recall),
        changedFileF1: nullable(changedFiles.f1),
        changedFileWeight: nullable(changedFiles.weight),
        oracleFileCount: nullable(report.oracleFileCount),
        dependencyMode: nullable(report.dependencyMode),
        revealCheckOutput: booleanInteger(revealCheckOutput),
        keepEvaluation: booleanInteger(keepEvaluation),
        isPrimary: booleanInteger(isPrimary),
        postExposure: booleanInteger(effectivePostExposure),
        evaluatorVersion: nullable(report.evaluatorVersion),
        runnerVersion: report.runnerVersion ?? this.runnerVersion,
        reportJson,
        artifactPath: report.reportFile ?? report.artifactPath ?? null,
      })

      const checkIds = new Set()
      const insertCheck = this.database.prepare(`
        INSERT INTO evaluation_checks (
          evaluation_id,
          check_id,
          label,
          kind,
          sort_order,
          points,
          passed,
          exit_code,
          signal,
          duration_ms,
          details_hidden,
          diagnostic_reference
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      report.checks.forEach((check, index) => {
        requireObject(check, `Evaluation check ${index}`)
        if (typeof check.id !== 'string' || check.id.length === 0) {
          throw new TypeError(`Evaluation check ${index} id must be a non-empty string`)
        }
        if (checkIds.has(check.id)) {
          throw new Error(`Evaluation report contains duplicate check id: ${check.id}`)
        }
        checkIds.add(check.id)
        insertCheck.run(
          normalizedEvaluationId,
          check.id,
          check.label ?? check.id,
          check.kind ?? null,
          index,
          check.points ?? 0,
          booleanInteger(check.passed === true),
          check.exitCode ?? null,
          check.signal ?? null,
          check.durationMs ?? null,
          booleanInteger(check.detailsHidden === true),
          check.diagnosticReference ?? check.diagnosticRef ?? null,
        )
      })

      this.database.prepare(`
        UPDATE benchmark_runs
        SET primary_evaluation_id = CASE
              WHEN @isPrimary = 1 THEN @evaluationId
              ELSE primary_evaluation_id
            END,
            latest_evaluation_id = @evaluationId,
            status = 'completed',
            exposure_state = CASE
              WHEN @exposesOracle = 1 THEN 'oracle_exposed'
              ELSE exposure_state
            END,
            oracle_exposed_at = CASE
              WHEN @exposesOracle = 1 THEN COALESCE(oracle_exposed_at, @finishedAt)
              ELSE oracle_exposed_at
            END,
            exposure_types_json = CASE
              WHEN @exposesOracle = 1 THEN @exposureTypes
              ELSE exposure_types_json
            END,
            updated_at = @finishedAt,
            completed_at = COALESCE(completed_at, @finishedAt),
            safe_error_summary = NULL
        WHERE id = @runId
      `).run({
        runId: id,
        evaluationId: normalizedEvaluationId,
        isPrimary: booleanInteger(isPrimary),
        exposesOracle: booleanInteger(exposesOracle),
        exposureTypes: exposesOracle
          ? jsonStringify(mergedExposureTypes, 'Run exposure types')
          : null,
        finishedAt,
      })
      this.#appendEvent(id, 'evaluation_completed', finishedAt, {
        evaluationId: normalizedEvaluationId,
        isPrimary,
        postExposure: effectivePostExposure,
        score: report.score ?? null,
      })
      if (exposesOracle) {
        this.#appendEvent(id, 'oracle_exposed', finishedAt, {
          evaluationId: normalizedEvaluationId,
          exposureTypes: requestedExposureTypes,
        })
      }
    })()

    return this.getEvaluation(normalizedEvaluationId)
  }

  failEvaluation(runId, evaluationId, error, finishedAt) {
    const id = this.#resolveRunId(runId)
    const normalizedEvaluationId = normalizeUuid(evaluationId, 'Evaluation id')
    if (typeof finishedAt !== 'string' || finishedAt.length === 0) {
      throw new TypeError('Evaluation finishedAt must be a non-empty string')
    }
    const safeErrorSummary = error instanceof Error ? error.message : String(error)

    this.database.transaction(() => {
      const evaluation = this.database
        .prepare('SELECT * FROM evaluations WHERE id = ?')
        .get(normalizedEvaluationId)
      if (evaluation === undefined) {
        throw new Error(`Evaluation not found: ${normalizedEvaluationId}`)
      }
      if (evaluation.run_id !== id) {
        throw new Error(
          `Evaluation ${normalizedEvaluationId} does not belong to Run ${id}`,
        )
      }
      if (evaluation.status === 'failed') {
        if (evaluation.safe_error_summary === safeErrorSummary) return
        throw new Error(
          `Evaluation ${normalizedEvaluationId} already failed with a different error`,
        )
      }
      if (evaluation.status !== 'running') {
        throw new Error(
          `Evaluation ${normalizedEvaluationId} is in status ${evaluation.status}; expected running`,
        )
      }

      this.database.prepare(`
        UPDATE evaluations
        SET status = 'failed',
            finished_at = ?,
            duration_ms = ?,
            safe_error_summary = ?
        WHERE id = ?
      `).run(
        finishedAt,
        elapsedMilliseconds(evaluation.started_at, finishedAt),
        safeErrorSummary,
        normalizedEvaluationId,
      )

      const run = this.database.prepare(`
        SELECT latest_evaluation_id
        FROM benchmark_runs
        WHERE id = ?
      `).get(id)
      if (run.latest_evaluation_id === null) {
        this.database.prepare(`
          UPDATE benchmark_runs
          SET status = 'evaluation_failed',
              updated_at = ?,
              safe_error_summary = ?
          WHERE id = ?
        `).run(finishedAt, safeErrorSummary, id)
      }
      this.#appendEvent(id, 'evaluation_failed', finishedAt, {
        evaluationId: normalizedEvaluationId,
        safeErrorSummary,
      })
    })()

    return this.getEvaluation(normalizedEvaluationId)
  }

  getEvaluation(evaluationId) {
    const normalizedEvaluationId = normalizeUuid(evaluationId, 'Evaluation id')
    const row = this.database
      .prepare('SELECT * FROM evaluations WHERE id = ?')
      .get(normalizedEvaluationId)
    return row === undefined ? null : this.#evaluationRecord(row)
  }

  listEvaluations(runId) {
    const id = this.#resolveRunId(runId)
    return this.database.prepare(`
      SELECT *
      FROM evaluations
      WHERE run_id = ?
      ORDER BY started_at DESC, id DESC
    `).all(id).map(row => this.#evaluationRecord(row))
  }

  #evaluationRecord(row) {
    const checks = this.database.prepare(`
      SELECT *
      FROM evaluation_checks
      WHERE evaluation_id = ?
      ORDER BY sort_order ASC, check_id ASC
    `).all(row.id).map(check => ({
      evaluationId: check.evaluation_id,
      id: check.check_id,
      label: check.label,
      kind: check.kind,
      order: check.sort_order,
      points: check.points,
      passed: check.passed === 1,
      exitCode: check.exit_code,
      signal: check.signal,
      durationMs: check.duration_ms,
      detailsHidden: check.details_hidden === 1,
      diagnosticReference: check.diagnostic_reference,
    }))

    return {
      id: row.id,
      runId: row.run_id,
      candidateFingerprint: row.candidate_fingerprint,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: row.duration_ms,
      status: row.status,
      schemaVersion: row.schema_version,
      caseId: row.case_id,
      title: row.title,
      workspace: row.workspace,
      score: row.score,
      maxScore: row.max_score,
      checkScore: row.check_score,
      checkMaxScore: row.check_max_score,
      checkWeight: row.check_weight,
      changedFileCandidateCount: row.changed_file_candidate_count,
      changedFileReferenceCount: row.changed_file_reference_count,
      changedFileMatchedCount: row.changed_file_matched_count,
      changedFilePrecision: row.changed_file_precision,
      changedFileRecall: row.changed_file_recall,
      changedFileF1: row.changed_file_f1,
      changedFileWeight: row.changed_file_weight,
      oracleFileCount: row.oracle_file_count,
      dependencyMode: row.dependency_mode,
      revealCheckOutput: row.reveal_check_output === 1,
      keepEvaluation: row.keep_evaluation === 1,
      isPrimary: row.is_primary === 1,
      postExposure: row.post_exposure === 1,
      evaluatorVersion: row.evaluator_version,
      runnerVersion: row.runner_version,
      report: jsonParse(row.report_json, 'evaluation report'),
      artifactPath: row.artifact_path,
      safeErrorSummary: row.safe_error_summary,
      checks,
    }
  }

  #resolveRunId(idOrUniquePrefix) {
    if (typeof idOrUniquePrefix !== 'string') {
      throw new TypeError('Run ID must be a full UUID or a hexadecimal prefix')
    }
    const candidate = idOrUniquePrefix.trim().toLowerCase()
    if (FULL_UUID_PATTERN.test(candidate)) {
      const row = this.database
        .prepare('SELECT id FROM benchmark_runs WHERE lower(id) = ?')
        .get(candidate)
      if (row === undefined) throw new Error(`Run not found: ${idOrUniquePrefix}`)
      return row.id
    }

    if (HEX_PREFIX_PATTERN.test(candidate) && candidate.length < 8) {
      throw new Error('Run ID prefix must contain at least 8 hexadecimal characters')
    }
    if (!HEX_PREFIX_PATTERN.test(candidate) || candidate.length < 8) {
      throw new Error('Run ID must be a full UUID or a hexadecimal prefix of at least 8 characters')
    }

    const rows = this.database.prepare(`
      SELECT id
      FROM benchmark_runs
      WHERE lower(replace(id, '-', '')) LIKE ?
      ORDER BY id
      LIMIT 2
    `).all(`${candidate}%`)
    if (rows.length === 0) throw new Error(`Run not found: ${idOrUniquePrefix}`)
    if (rows.length > 1) throw new Error(`Run ID prefix is ambiguous: ${idOrUniquePrefix}`)
    return rows[0].id
  }

  #readRun(id) {
    const row = this.database
      .prepare('SELECT * FROM benchmark_runs WHERE id = ?')
      .get(id)
    if (row === undefined) throw new Error(`Run not found: ${id}`)
    return this.#runRecord(row)
  }

  #readOperationLease(id) {
    const row = this.database.prepare(`
      SELECT *
      FROM operation_leases
      WHERE run_id = ?
    `).get(id)
    return operationLeaseRecord(row)
  }

  #runRecord(row) {
    return {
      id: row.id,
      displayId: row.display_id,
      caseId: row.case_id,
      title: row.case_title,
      baseTree: row.base_tree,
      benchmarkManifestHash: row.benchmark_manifest_hash,
      promptVersion: row.prompt_template_version,
      promptProvenance: row.prompt_provenance,
      promptText: row.prompt_text,
      promptHash: row.prompt_hash,
      adapterId: row.adapter_id,
      adapterDisplayName: row.adapter_display_name,
      executablePath: row.executable_path,
      executableRealpath: row.executable_realpath,
      versionRaw: row.version_raw,
      versionNormalized: row.version_normalized,
      capabilities: jsonParse(row.capabilities_json, 'run capabilities'),
      requestedModel: row.requested_model,
      effectiveModel: row.effective_model,
      requestedEffort: row.requested_effort,
      adapterEffortValue: row.adapter_effort_value,
      effectiveEffort: row.effective_effort,
      runMode: row.run_mode,
      executionConfigVerified: row.execution_config_verified === 1,
      executionConfigSource: row.execution_config_source,
      permissionPolicy: row.permission_policy,
      writeIsolation: row.write_isolation,
      secretIsolation: row.secret_isolation,
      toolNetworkIsolation: row.tool_network_isolation,
      dependencyStrategy: row.dependency_strategy,
      agentTimeoutMs: row.agent_timeout_ms,
      workspace: row.workspace,
      status: row.status,
      agentOutcome: row.agent_outcome,
      agentExitCode: row.agent_exit_code,
      agentSignal: row.agent_signal,
      agentSessionId: row.agent_session_id,
      agentStartedAt: row.agent_started_at,
      agentFinishedAt: row.agent_finished_at,
      agentDurationMs: row.agent_duration_ms,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cachedTokens: row.cached_tokens,
      reasoningTokens: row.reasoning_tokens,
      cost: row.cost,
      primaryEvaluationId: row.primary_evaluation_id,
      latestEvaluationId: row.latest_evaluation_id,
      exposureState: row.exposure_state,
      oracleExposedAt: row.oracle_exposed_at,
      exposureTypes: jsonParse(row.exposure_types_json, 'run exposure types'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      safeErrorSummary: row.safe_error_summary,
    }
  }

  #appendEvent(runId, eventType, occurredAt, payload) {
    this.database.prepare(`
      INSERT INTO run_events (run_id, sequence, event_type, occurred_at, payload_json)
      SELECT ?, COALESCE(MAX(sequence), 0) + 1, ?, ?, ?
      FROM run_events
      WHERE run_id = ?
    `).run(
      runId,
      eventType,
      occurredAt,
      jsonStringify(payload, 'Run event payload'),
      runId,
    )
  }

  close() {
    if (this.closed) return
    this.database.close()
    this.closed = true
  }
}
