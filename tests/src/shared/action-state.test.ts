import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { DONE_LABEL_MS, holdDone, useActionState } from '../../../src/shared/action-state'

const LABELS = { idle: 'Save', doing: 'Saving…', done: 'Saved' }

/** useActionState registers a scope disposer, so give it a scope to live in. */
function inScope<T>(fn: () => T): { value: T; stop: () => void } {
  const scope = effectScope()
  const value = scope.run(fn) as T
  return { value, stop: () => scope.stop() }
}

describe('useActionState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('walks idle → doing → done and settles back to idle', async () => {
    const { value: action, stop } = inScope(() => useActionState(LABELS))
    expect(action.phase).toBe('idle')
    expect(action.label).toBe('Save')

    let release = (): void => {}
    const pending = action.run(() => new Promise<void>((resolve) => { release = resolve }))

    await nextTick()
    expect(action.phase).toBe('doing')
    expect(action.pending).toBe(true)
    expect(action.label).toBe('Saving…')

    release()
    await pending

    expect(action.phase).toBe('done')
    expect(action.settled).toBe(true)
    expect(action.label).toBe('Saved')

    vi.advanceTimersByTime(DONE_LABEL_MS)
    expect(action.phase).toBe('idle')
    expect(action.label).toBe('Save')

    stop()
  })

  it('returns the task result to the caller', async () => {
    const { value: action, stop } = inScope(() => useActionState(LABELS))
    await expect(action.run(() => 'note-1')).resolves.toBe('note-1')
    stop()
  })

  it('drops back to idle and rethrows when the task fails', async () => {
    const { value: action, stop } = inScope(() => useActionState(LABELS))

    await expect(action.run(() => Promise.reject(new Error('Request failed')))).rejects.toThrow('Request failed')

    expect(action.phase).toBe('idle')
    expect(action.label).toBe('Save')
    stop()
  })

  it('restarts the cycle when a second run lands during the done window', async () => {
    const { value: action, stop } = inScope(() => useActionState(LABELS))

    await action.run(() => undefined)
    expect(action.phase).toBe('done')

    vi.advanceTimersByTime(DONE_LABEL_MS / 2)
    await action.run(() => undefined)

    // The first revert timer was cancelled, so the label keeps its full window.
    vi.advanceTimersByTime(DONE_LABEL_MS - 1)
    expect(action.phase).toBe('done')
    vi.advanceTimersByTime(1)
    expect(action.phase).toBe('idle')

    stop()
  })

  it('reset clears the pending revert immediately', async () => {
    const { value: action, stop } = inScope(() => useActionState(LABELS))

    await action.run(() => undefined)
    action.reset()

    expect(action.phase).toBe('idle')
    vi.advanceTimersByTime(DONE_LABEL_MS)
    expect(action.phase).toBe('idle')
    stop()
  })

  it('leaves no revert timer behind when its scope is disposed', async () => {
    const { value: action, stop } = inScope(() => useActionState(LABELS))

    await action.run(() => undefined)
    stop()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('holdDone resolves after the requested beat', async () => {
    let held = true
    const waiting = holdDone(50).then(() => { held = false })

    vi.advanceTimersByTime(49)
    await Promise.resolve()
    expect(held).toBe(true)

    vi.advanceTimersByTime(1)
    await waiting
    expect(held).toBe(false)
  })
})
