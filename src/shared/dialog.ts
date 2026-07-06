import { reactive, readonly } from 'vue'

// A single, app-wide dialog host renders whatever is placed in `state.active`,
// so confirmations and alerts look identical across browsers instead of falling
// back to each engine's native window.confirm / window.alert chrome.

export type DialogVariant = 'confirm' | 'alert'
export type DialogTone = 'default' | 'danger'

export interface DialogOptions {
  /** Optional bold heading shown above the message. */
  title?: string
  /** Body copy explaining the action or notice. */
  message: string
  /** Label for the affirmative button (defaults: "Confirm" / "OK"). */
  confirmText?: string
  /** Label for the dismissive button (confirm variant only, default "Cancel"). */
  cancelText?: string
  /** `danger` paints the confirm button in the accent hue for destructive actions. */
  tone?: DialogTone
}

interface ActiveDialog extends DialogOptions {
  variant: DialogVariant
  resolve: (confirmed: boolean) => void
}

const state = reactive<{ active: ActiveDialog | null }>({ active: null })

/** Read-only view of the current dialog for the host component. */
export const dialogState = readonly(state)

function open(variant: DialogVariant, options: DialogOptions): Promise<boolean> {
  // If a dialog is somehow already open, settle it as dismissed before replacing.
  state.active?.resolve(false)
  return new Promise<boolean>((resolve) => {
    state.active = { ...options, variant, resolve }
  })
}

/** Web-native confirmation. Resolves `true` when confirmed, `false` when cancelled. */
export function confirmDialog(options: DialogOptions): Promise<boolean> {
  return open('confirm', options)
}

/** Web-native alert. Resolves once the user acknowledges it. */
export function alertDialog(options: DialogOptions): Promise<void> {
  return open('alert', options).then(() => undefined)
}

/** Settle the active dialog with a result and clear it. Called only by the host. */
export function settleDialog(confirmed: boolean): void {
  const active = state.active
  if (!active) return
  state.active = null
  active.resolve(confirmed)
}
