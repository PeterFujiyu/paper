import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function recoveryDirectory(runtimeRoot) {
  return join(resolve(runtimeRoot), 'recovery')
}

function payloadChecksum(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function assertEvaluationId(evaluationId) {
  if (!UUID_PATTERN.test(evaluationId)) {
    throw new Error('Evaluation ID is not a valid UUID')
  }
}

export function writeEvaluationSpool({
  runtimeRoot,
  evaluationId,
  runId,
  candidateFingerprint,
  report,
  createdAt,
  postExposure = false,
  exposureTypes = [],
  runProvenance = null,
}) {
  assertEvaluationId(evaluationId)
  const directory = recoveryDirectory(runtimeRoot)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, `${evaluationId}.json`)
  const payload = {
    schemaVersion: 1,
    evaluationId,
    runId,
    candidateFingerprint,
    report,
    createdAt,
    postExposure,
    exposureTypes,
    runProvenance,
  }
  const document = {
    ...payload,
    checksum: payloadChecksum(payload),
  }
  const serialized = `${JSON.stringify(document, null, 2)}\n`

  if (existsSync(path)) {
    const current = readEvaluationSpool(path)
    if (current.checksum !== document.checksum) {
      throw new Error(`Conflicting recovery spool already exists: ${path}`)
    }
    return path
  }

  const temporary = join(
    directory,
    `.${evaluationId}.${process.pid}.${randomUUID()}.tmp`,
  )
  let descriptor
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, serialized, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, path)
    return path
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
  }
}

export function readEvaluationSpool(path) {
  const target = resolve(path)
  const stat = lstatSync(target)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Recovery spool must be a regular file: ${target}`)
  }
  const document = JSON.parse(readFileSync(target, 'utf8'))
  const { checksum, ...payload } = document
  if (document.schemaVersion !== 1 || typeof checksum !== 'string') {
    throw new Error(`Unsupported recovery spool: ${target}`)
  }
  if (basename(target) !== `${document.evaluationId}.json`) {
    throw new Error(`Recovery spool filename does not match Evaluation ID: ${target}`)
  }
  if (payloadChecksum(payload) !== checksum) {
    throw new Error(`Recovery spool checksum mismatch: ${target}`)
  }
  return document
}

export function listEvaluationSpools(runtimeRoot) {
  const directory = recoveryDirectory(runtimeRoot)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && UUID_PATTERN.test(entry.name.replace(/\.json$/, '')))
    .map(entry => join(directory, entry.name))
    .toSorted()
}

export function consumeEvaluationSpool(path) {
  readEvaluationSpool(path)
  rmSync(resolve(path), { force: true })
}
