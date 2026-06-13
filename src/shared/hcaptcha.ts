type HCaptchaWidgetId = number | string

type HCaptchaPendingRequest = {
  resolve: (token: string | null) => void
  timeoutId: number
}

type HCaptchaApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      size: 'invisible'
      callback: (token: string) => void
      'error-callback': () => void
      'expired-callback': () => void
    }
  ) => HCaptchaWidgetId
  execute: (widgetId: HCaptchaWidgetId) => void
  reset: (widgetId: HCaptchaWidgetId) => void
}

declare global {
  interface Window {
    hcaptcha?: HCaptchaApi
    __paperOnHCaptchaLoad?: () => void
  }
}

const HCAPTCHA_SCRIPT_URL =
  'https://js.hcaptcha.com/1/api.js?onload=__paperOnHCaptchaLoad&render=explicit'
const HCAPTCHA_TIMEOUT_MS = 30_000

const sitekey = import.meta.env.VITE_HCAPTCHA_SITEKEY?.trim() ?? ''

let scriptPromise: Promise<void> | null = null
let widgetId: HCaptchaWidgetId | null = null
let pendingRequest: HCaptchaPendingRequest | null = null
let tokenQueue = Promise.resolve()

function loadHCaptchaScript(): Promise<void> {
  if (window.hcaptcha) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve) => {
    window.__paperOnHCaptchaLoad = () => {
      resolve()
    }

    const script = document.createElement('script')
    script.src = HCAPTCHA_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onerror = () => {
      resolve()
    }

    document.head.appendChild(script)
  })

  return scriptPromise
}

async function ensureHCaptchaWidget(): Promise<HCaptchaWidgetId | null> {
  if (!sitekey || typeof window === 'undefined') return null

  await loadHCaptchaScript()
  if (!window.hcaptcha) return null
  if (widgetId !== null) return widgetId

  const container = document.createElement('div')
  container.hidden = true
  document.body.appendChild(container)

  widgetId = window.hcaptcha.render(container, {
    sitekey,
    size: 'invisible',
    callback(token: string) {
      resolvePendingRequest(token)
    },
    'error-callback'() {
      resolvePendingRequest(null)
    },
    'expired-callback'() {
      resolvePendingRequest(null)
    },
  })

  return widgetId
}

function resolvePendingRequest(token: string | null): void {
  if (!pendingRequest) return

  window.clearTimeout(pendingRequest.timeoutId)
  pendingRequest.resolve(token)
  pendingRequest = null

  if (widgetId !== null) {
    window.hcaptcha?.reset(widgetId)
  }
}

async function executeHCaptcha(): Promise<string | null> {
  const currentWidgetId = await ensureHCaptchaWidget()
  if (!window.hcaptcha || currentWidgetId === null) return null

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      resolvePendingRequest(null)
    }, HCAPTCHA_TIMEOUT_MS)

    pendingRequest = { resolve, timeoutId }
    window.hcaptcha?.execute(currentWidgetId)
  })
}

export function getHCaptchaToken(): Promise<string | null> {
  const run = tokenQueue.then(executeHCaptcha, executeHCaptcha)
  tokenQueue = run.then(() => undefined, () => undefined)
  return run
}
