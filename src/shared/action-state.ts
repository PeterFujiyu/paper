import { computed, onScopeDispose, reactive, ref } from 'vue'

// Every action button in the admin writing surfaces runs through this: it owns
// the idle → doing → done → idle cycle so the label, the spinner, and the
// disabled state can never disagree with the request that is actually in flight.

export type ActionPhase = 'idle' | 'doing' | 'done'

/** How long the completion label stays on screen before settling back to idle. */
export const DONE_LABEL_MS = 1600

/** Beat given to the completion label before an action navigates away. */
export const NAV_HOLD_MS = 700

export interface ActionLabels {
  /** Resting label — what the button says before it is pressed. */
  idle: string
  /** Processing label, shown alongside the spinner while the task runs. */
  doing: string
  /** Brief confirmation label, shown for `DONE_LABEL_MS` after success. */
  done: string
}

export interface ActionState {
  readonly phase: ActionPhase
  readonly pending: boolean
  readonly settled: boolean
  readonly label: string
  /** Runs `task` through the phase cycle. Rethrows so callers own the message. */
  run<T>(task: () => Promise<T> | T): Promise<T>
  /** Drops back to idle immediately, cancelling any pending revert. */
  reset(): void
}

export function useActionState(labels: ActionLabels, doneMs: number = DONE_LABEL_MS): ActionState {
  const phase = ref<ActionPhase>('idle')
  let revertTimer: ReturnType<typeof setTimeout> | null = null

  function clearRevert(): void {
    if (revertTimer === null) return
    clearTimeout(revertTimer)
    revertTimer = null
  }

  function reset(): void {
    clearRevert()
    phase.value = 'idle'
  }

  // A failed action returns to idle rather than to `done`: the error copy the
  // caller renders is the feedback, and the button must stay pressable.
  async function run<T>(task: () => Promise<T> | T): Promise<T> {
    clearRevert()
    phase.value = 'doing'
    try {
      const result = await task()
      phase.value = 'done'
      revertTimer = setTimeout(reset, doneMs)
      return result
    } catch (err: unknown) {
      phase.value = 'idle'
      throw err
    }
  }

  onScopeDispose(clearRevert, true)

  // Returned reactive (not raw refs) so the state can sit inside computed lists
  // and lookup maps and still unwrap cleanly in templates.
  return reactive({
    phase,
    pending: computed(() => phase.value === 'doing'),
    settled: computed(() => phase.value === 'done'),
    label: computed(() => labels[phase.value]),
    run,
    reset,
  })
}

/** Lets a completion label register before the view routes elsewhere. */
export function holdDone(ms: number = NAV_HOLD_MS): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
