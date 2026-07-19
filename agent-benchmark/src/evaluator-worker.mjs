import { evaluateCase } from './engine.mjs'

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  input += chunk
})
process.stdin.on('end', () => {
  try {
    const options = JSON.parse(input)
    const report = evaluateCase(options)
    process.stdout.write(JSON.stringify({ ok: true, report }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stdout.write(JSON.stringify({ ok: false, error: message }))
    process.exitCode = 1
  }
})
