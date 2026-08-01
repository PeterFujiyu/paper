import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000
const DEFAULT_TERMINATION_GRACE_MS = 2_000
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024

function defaultWorkerPath() {
  const url = new URL('./evaluator-worker.mjs', import.meta.url)
  if (url.protocol === 'file:') return fileURLToPath(url)
  // Unreachable today (the URL is always file:), and the old fallback hardcoded the nested
  // `agent-benchmark/src/` layout, which stops existing after the extraction. There is no correct
  // cwd-relative guess for a non-file module URL, so fail loudly instead of guessing wrongly.
  throw new Error(`Cannot locate the evaluator worker from a non-file module URL: ${url.href}`)
}

export class EvaluationInterruptedError extends Error {
  constructor(message = '评价已中断') {
    super(message)
    this.name = 'EvaluationInterruptedError'
    this.code = 'EVALUATION_INTERRUPTED'
  }
}

function appendBounded(current, chunk) {
  const remaining = MAX_OUTPUT_BYTES - Buffer.byteLength(current)
  if (remaining <= 0) return current
  return current + chunk.toString('utf8', 0, remaining)
}

function terminate(child, signal) {
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, signal)
    } else {
      child.kill(signal)
    }
  } catch {
    child.kill(signal)
  }
}

function safeWorkerError(stderr, payload) {
  const message = payload?.error ?? stderr.trim()
  return message || '评价子进程异常退出'
}

export function evaluateCaseInSubprocess(input, {
  workerPath = defaultWorkerPath(),
  signal,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  onHeartbeat,
  terminationGraceMs = DEFAULT_TERMINATION_GRACE_MS,
} = {}) {
  if (signal?.aborted) {
    return Promise.reject(new EvaluationInterruptedError())
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        PAPER_BENCHMARK_EVALUATOR_WORKER: '1',
      },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let terminalError = null
    let forceTimer
    let heartbeatTimer
    let settled = false

    const cleanup = () => {
      clearInterval(heartbeatTimer)
      clearTimeout(forceTimer)
      signal?.removeEventListener('abort', handleAbort)
    }
    const stop = error => {
      if (terminalError) return
      terminalError = error
      terminate(child, 'SIGTERM')
      forceTimer = setTimeout(() => terminate(child, 'SIGKILL'), terminationGraceMs)
      forceTimer.unref?.()
    }
    const handleAbort = () => stop(new EvaluationInterruptedError())

    signal?.addEventListener('abort', handleAbort, { once: true })
    if (onHeartbeat) {
      heartbeatTimer = setInterval(() => {
        try {
          onHeartbeat()
        } catch (error) {
          stop(error instanceof Error ? error : new Error(String(error)))
        }
      }, heartbeatIntervalMs)
      heartbeatTimer.unref?.()
    }

    child.stdout.on('data', chunk => {
      stdout = appendBounded(stdout, chunk)
      if (Buffer.byteLength(stdout) >= MAX_OUTPUT_BYTES) {
        stop(new Error('评价子进程输出超过安全上限'))
      }
    })
    child.stderr.on('data', chunk => {
      stderr = appendBounded(stderr, chunk)
    })
    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE') stop(error)
    })
    child.on('error', error => stop(error))
    child.on('close', (exitCode, exitSignal) => {
      if (settled) return
      settled = true
      cleanup()
      if (terminalError) {
        reject(terminalError)
        return
      }

      let payload
      try {
        payload = JSON.parse(stdout)
      } catch {
        reject(new Error(
          `评价子进程未返回有效结果（exit=${exitCode}, signal=${exitSignal ?? 'none'}）：${stderr.trim()}`,
        ))
        return
      }
      if (exitCode !== 0 || payload?.ok !== true) {
        reject(new Error(safeWorkerError(stderr, payload)))
        return
      }
      resolve(payload.report)
    })

    child.stdin.end(JSON.stringify(input))
  })
}
