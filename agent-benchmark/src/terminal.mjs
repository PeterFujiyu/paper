import { createInterface } from 'node:readline'

export class TerminalCancelledError extends Error {
  constructor(reason = 'cancelled') {
    const messages = {
      cancelled: '\u5df2\u53d6\u6d88\u7ec8\u7aef\u4ea4\u4e92',
      closed: '\u7ec8\u7aef\u5df2\u5173\u95ed',
      eof: '\u7ec8\u7aef\u8f93\u5165\u5df2\u7ed3\u675f',
      sigint: '\u7ec8\u7aef\u4ea4\u4e92\u5df2\u4e2d\u65ad',
    }
    super(messages[reason] ?? messages.cancelled)
    this.name = 'TerminalCancelledError'
    this.code = 'TERMINAL_CANCELLED'
    this.reason = reason
  }
}

function isCancellationAnswer(answer) {
  return ['q', 'quit', 'cancel', '/cancel', '\u53d6\u6d88', '\u9000\u51fa']
    .includes(answer.trim().toLowerCase())
}

function throwIfCancellation(answer) {
  if (isCancellationAnswer(answer)) throw new TerminalCancelledError('cancelled')
}

function resolveDefaultIndex(choices, defaultIndex) {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new RangeError('Terminal choices must include at least one option')
  }
  const firstEnabled = choices.findIndex(choice => !choice.disabled)
  if (firstEnabled === -1) throw new RangeError('Terminal choices do not include an enabled option')
  if (defaultIndex === undefined) return firstEnabled
  if (!Number.isInteger(defaultIndex) || defaultIndex < 0 || defaultIndex >= choices.length) {
    throw new RangeError(`Invalid terminal default index: ${String(defaultIndex)}`)
  }
  if (choices[defaultIndex].disabled) {
    throw new RangeError(`Terminal default option is disabled: ${defaultIndex + 1}`)
  }
  return defaultIndex
}

export function createReadlineTerminal({ input, output }) {
  const readline = createInterface({
    input,
    output,
    crlfDelay: Infinity,
    terminal: Boolean(input.isTTY && output.isTTY),
  })
  const lines = []
  const waiters = []
  let closed = false
  let cancellationError = null

  function cancel(reason) {
    closed = true
    cancellationError ??= new TerminalCancelledError(reason)
    for (const waiter of waiters.splice(0)) waiter.reject(cancellationError)
  }

  function handleInputData(chunk) {
    if (!closed && String(chunk).includes('\u0003')) {
      cancel('sigint')
      readline.close()
    }
  }

  input.on('data', handleInputData)

  readline.on('line', line => {
    if (line.includes('\u0003')) {
      cancel('sigint')
      readline.close()
      return
    }
    const waiter = waiters.shift()
    if (waiter) waiter.resolve(line)
    else lines.push(line)
  })
  readline.on('SIGINT', () => {
    cancel('sigint')
    readline.close()
  })
  readline.on('close', () => {
    input.off('data', handleInputData)
    cancel(cancellationError?.reason ?? 'eof')
  })

  function write(text) {
    output.write(String(text))
  }

  function nextLine() {
    if (lines.length > 0) return Promise.resolve(lines.shift())
    if (closed) return Promise.reject(cancellationError ?? new TerminalCancelledError('closed'))
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject })
    })
  }

  return {
    write,

    async select(message, choices, { defaultIndex } = {}) {
      const resolvedDefaultIndex = resolveDefaultIndex(choices, defaultIndex)
      write(`${message}\n`)
      choices.forEach((choice, index) => {
        write(`  ${index + 1}. ${choice.label}${choice.disabled ? ' (\u4e0d\u53ef\u7528)' : ''}\n`)
      })

      while (true) {
        write(`\u8bf7\u9009\u62e9 [${resolvedDefaultIndex + 1}]\uff08\u8f93\u5165 q \u53d6\u6d88\uff09: `)
        const answer = (await nextLine()).trim()
        throwIfCancellation(answer)
        const index = answer === '' ? resolvedDefaultIndex : Number(answer) - 1
        if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
          write('\u8bf7\u8f93\u5165\u6709\u6548\u7684\u9009\u9879\u7f16\u53f7\u3002\n')
          continue
        }
        const choice = choices[index]
        if (choice.disabled) {
          write('\u8be5\u9009\u9879\u4e0d\u53ef\u7528\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u3002\n')
          continue
        }
        return choice.value
      }
    },

    async input(message, { defaultValue } = {}) {
      write(`${message}${defaultValue === undefined ? '' : ` [${defaultValue}]`}: `)
      const answer = await nextLine()
      throwIfCancellation(answer)
      return answer === '' && defaultValue !== undefined ? defaultValue : answer
    },

    async confirm(message, { defaultValue = false } = {}) {
      while (true) {
        write(`${message} (${defaultValue ? 'Y/n' : 'y/N'}): `)
        const answer = (await nextLine()).trim().toLowerCase()
        throwIfCancellation(answer)
        if (answer === '') return defaultValue
        if (['y', 'yes', '\u662f', '\u597d', '\u786e\u8ba4', '\u7ee7\u7eed'].includes(answer)) return true
        if (['n', 'no', '\u5426', '\u4e0d'].includes(answer)) return false
        write('\u8bf7\u8f93\u5165 y \u6216 n\u3002\n')
      }
    },

    close() {
      if (!closed) {
        cancel('closed')
        readline.close()
      }
    },
  }
}

export class ScriptedTerminal {
  constructor(answers = []) {
    this.answers = [...answers]
    this.output = ''
    this.closed = false
  }

  write(text) {
    this.output += String(text)
  }

  async select(message, choices, { defaultIndex } = {}) {
    const resolvedDefaultIndex = resolveDefaultIndex(choices, defaultIndex)
    this.write(`${message}\n`)
    choices.forEach((choice, index) => {
      this.write(`  ${index + 1}. ${choice.label}${choice.disabled ? ' (\u4e0d\u53ef\u7528)' : ''}\n`)
    })
    this.write(`\u8bf7\u9009\u62e9 [${resolvedDefaultIndex + 1}]\uff08\u8f93\u5165 q \u53d6\u6d88\uff09: `)

    const answer = this.#nextAnswer()
    this.write(`${String(answer)}\n`)
    const selected = answer === ''
      ? choices[resolvedDefaultIndex]
      : choices.find(choice => !choice.disabled && Object.is(choice.value, answer))
    if (selected?.disabled) throw new Error(`Invalid scripted selection: ${String(answer)}`)
    if (!selected) throw new Error(`Invalid scripted selection: ${String(answer)}`)
    return selected.value
  }

  async input(message, { defaultValue } = {}) {
    this.write(`${message}${defaultValue === undefined ? '' : ` [${defaultValue}]`}: `)
    const answer = this.#nextAnswer()
    this.write(`${String(answer)}\n`)
    return answer === '' && defaultValue !== undefined ? defaultValue : String(answer)
  }

  async confirm(message, { defaultValue = false } = {}) {
    this.write(`${message} (${defaultValue ? 'Y/n' : 'y/N'}): `)
    const answer = this.#nextAnswer()
    this.write(`${String(answer)}\n`)
    if (answer === '') return defaultValue
    if (typeof answer !== 'boolean') throw new Error(`Invalid scripted confirmation: ${String(answer)}`)
    return answer
  }

  close() {
    this.closed = true
  }

  #nextAnswer() {
    if (this.closed) throw new TerminalCancelledError('closed')
    if (this.answers.length === 0) throw new TerminalCancelledError('eof')
    const answer = this.answers.shift()
    if (answer instanceof Error) throw answer
    return answer
  }
}
