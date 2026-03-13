import { ref, computed } from 'vue'
import type { AuthResponse, UserInfo } from '../types/content'

export const user = ref<UserInfo | null>(null)
const sessionChecked = ref(false)
let pendingSession: Promise<boolean> | null = null

export const isLoggedIn = computed(() => !!user.value)

export function setAuth(u: UserInfo): void {
  user.value = u
  sessionChecked.value = true
}

export function clearAuth(): void {
  user.value = null
  sessionChecked.value = true
}

type ApiFetchOptions = RequestInit & {
  headers?: Record<string, string>
  redirectOnUnauthorized?: boolean
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const base = import.meta.env.VITE_API_BASE ?? '/api'
  const { headers = {}, redirectOnUnauthorized = true, ...rest } = options
  const res = await fetch(`${base}${path}`, {
    ...rest,
    credentials: 'same-origin',
    headers: {
      ...(typeof rest.body !== 'undefined' ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  })

  if (res.status === 401) {
    clearAuth()
    if (redirectOnUnauthorized) {
      window.location.href = '/admin/login'
    }
    throw new Error('Unauthorized')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

export async function loadSession(force = false): Promise<boolean> {
  if (sessionChecked.value && !force) {
    return !!user.value
  }

  if (!pendingSession || force) {
    pendingSession = apiFetch<UserInfo>('/auth-me', { redirectOnUnauthorized: false })
      .then((currentUser) => {
        setAuth(currentUser)
        return true
      })
      .catch(() => {
        clearAuth()
        return false
      })
      .finally(() => {
        pendingSession = null
      })
  }

  return pendingSession
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>('/auth-logout', {
      method: 'POST',
      redirectOnUnauthorized: false,
    })
  } finally {
    clearAuth()
  }
}

export type { AuthResponse }
