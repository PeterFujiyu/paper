import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { test } from 'vitest'

// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import * as terminalApi from '../../agent-benchmark/src/terminal.mjs'

const {
  createReadlineTerminal,
  ScriptedTerminal,
  TerminalCancelledError,
} = terminalApi

function isTerminalCancellation(error: unknown, reason?: string): boolean {
  if (!(error instanceof Error)) return false
  const cancellation = error as Error & { code?: string; reason?: string }
  return cancellation.code === 'TERMINAL_CANCELLED'
    && (reason === undefined || cancellation.reason === reason)
}

test('ScriptedTerminal returns queued answers and captures the transcript', async () => {
  const terminal = new ScriptedTerminal(['second', 'custom', true])

  terminal.write('\u6b22\u8fce\n')
  const selected = await terminal.select('\u9009\u62e9 Agent', [
    { value: 'first', label: '\u7b2c\u4e00\u4e2a' },
    { value: 'second', label: '\u7b2c\u4e8c\u4e2a' },
  ], { defaultIndex: 0 })
  const entered = await terminal.input('\u6a21\u578b', { defaultValue: 'default' })
  const confirmed = await terminal.confirm('\u7ee7\u7eed\uff1f', { defaultValue: false })

  assert.equal(selected, 'second')
  assert.equal(entered, 'custom')
  assert.equal(confirmed, true)
  assert.match(terminal.output, /\u6b22\u8fce/)
  assert.match(terminal.output, /1\. \u7b2c\u4e00\u4e2a/)
  assert.match(terminal.output, /2\. \u7b2c\u4e8c\u4e2a/)
  assert.match(terminal.output, /\u6a21\u578b \[default\]/)
  assert.match(terminal.output, /\u7ee7\u7eed\uff1f \(y\/N\)/)
})

test('ScriptedTerminal applies defaults just like the interactive terminal', async () => {
  const terminal = new ScriptedTerminal(['', '', ''])

  assert.equal(await terminal.select('\u9009\u62e9', [
    { value: 'first', label: '\u7b2c\u4e00\u4e2a' },
    { value: 'second', label: '\u7b2c\u4e8c\u4e2a' },
  ], { defaultIndex: 1 }), 'second')
  assert.equal(await terminal.input('\u6a21\u578b', { defaultValue: 'default' }), 'default')
  assert.equal(await terminal.confirm('\u7ee7\u7eed\uff1f', { defaultValue: true }), true)
})

test('terminals choose the first enabled option when the default is omitted', async () => {
  const choices = [
    { value: 'missing', label: '\u672a\u5b89\u88c5', disabled: true },
    { value: 'ready', label: '\u53ef\u7528' },
  ]
  const scripted = new ScriptedTerminal([''])
  assert.equal(await scripted.select('\u9009\u62e9', choices, {}), 'ready')

  const input = new PassThrough()
  const output = new PassThrough()
  const interactive = createReadlineTerminal({ input, output })
  const pending = interactive.select('\u9009\u62e9', choices, {})
  input.end('\n')
  assert.equal(await pending, 'ready')
  interactive.close()
})

test('ScriptedTerminal reports exhausted or closed input as cancellation', async () => {
  const exhausted = new ScriptedTerminal([])
  await assert.rejects(exhausted.input('\u6a21\u578b', {}), TerminalCancelledError)

  const closed = new ScriptedTerminal(['unused'])
  closed.close()
  await assert.rejects(
    closed.select('\u9009\u62e9', [{ value: 'one', label: '\u4e00' }], { defaultIndex: 0 }),
    TerminalCancelledError,
  )
})

test('readline terminal numbers choices and retries disabled selections', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let transcript = ''
  output.setEncoding('utf8')
  output.on('data', chunk => {
    transcript += chunk
  })
  const terminal = createReadlineTerminal({ input, output })

  const selection = terminal.select('\u9009\u62e9 Agent', [
    { value: 'codex', label: 'Codex CLI' },
    { value: 'claude', label: 'Claude Code', disabled: true },
    { value: 'exit', label: '\u9000\u51fa' },
  ], { defaultIndex: 0 })
  input.end('2\n3\n')

  assert.equal(await selection, 'exit')
  assert.match(transcript, /1\. Codex CLI/)
  assert.match(transcript, /2\. Claude Code.*\u4e0d\u53ef\u7528/)
  assert.match(transcript, /\u8be5\u9009\u9879\u4e0d\u53ef\u7528/)
  terminal.close()
})

test('readline terminal applies input defaults and validates confirmations', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let transcript = ''
  output.setEncoding('utf8')
  output.on('data', chunk => {
    transcript += chunk
  })
  const terminal = createReadlineTerminal({ input, output })

  const defaultedInput = terminal.input('\u6a21\u578b', { defaultValue: 'gpt-default' })
  input.write('\n')
  assert.equal(await defaultedInput, 'gpt-default')

  const confirmation = terminal.confirm('\u7ee7\u7eed\uff1f', { defaultValue: true })
  input.end('\u4e5f\u8bb8\n\u5426\n')
  assert.equal(await confirmation, false)
  assert.match(transcript, /\u6a21\u578b \[gpt-default\]:/)
  assert.match(transcript, /\u7ee7\u7eed\uff1f \(Y\/n\):/)
  assert.match(transcript, /\u8bf7\u8f93\u5165 y \u6216 n/)
  terminal.close()
})

test('readline terminal rejects current and future prompts after EOF', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const terminal = createReadlineTerminal({ input, output })

  const pending = terminal.input('\u6a21\u578b', {})
  input.end()

  await assert.rejects(pending, error => isTerminalCancellation(error))
  await assert.rejects(
    terminal.confirm('\u7ee7\u7eed\uff1f', { defaultValue: true }),
    TerminalCancelledError,
  )
  terminal.close()
})

test('readline terminal turns Ctrl+C into a typed cancellation', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const terminal = createReadlineTerminal({ input, output })

  const pending = terminal.select('\u9009\u62e9', [
    { value: 'continue', label: '\u7ee7\u7eed' },
  ], { defaultIndex: 0 })
  input.end('\u0003')

  await assert.rejects(pending, error => isTerminalCancellation(error, 'sigint'))
  terminal.close()
})

test('readline terminal does not treat a piped Ctrl+C byte as text', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const terminal = createReadlineTerminal({ input, output })

  const pending = terminal.input('\u6a21\u578b', {})
  input.end('\u0003\n')

  await assert.rejects(pending, error => isTerminalCancellation(error, 'sigint'))
  terminal.close()
})

test('readline terminal accepts an explicit cancellation answer', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let transcript = ''
  output.setEncoding('utf8')
  output.on('data', chunk => {
    transcript += chunk
  })
  const terminal = createReadlineTerminal({ input, output })

  const pending = terminal.select('\u9009\u62e9', [
    { value: 'continue', label: '\u7ee7\u7eed' },
  ], { defaultIndex: 0 })
  input.end('q\n')

  await assert.rejects(pending, error => isTerminalCancellation(error, 'cancelled'))
  assert.match(transcript, /q.*\u53d6\u6d88/)
  terminal.close()
})
