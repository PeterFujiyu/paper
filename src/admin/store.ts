/**
 * Minimal auth store — persists JWT in localStorage
 */
import { ref, computed } from 'vue'
import type { AuthResponse, UserInfo } from '../types/content'

const TOKEN_KEY = 'pf_admin_token'
const USER_KEY = 'pf_admin_user'

export const token = ref(localStorage.getItem(TOKEN_KEY) ?? null)
export const user = ref<UserInfo | null>(JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'))

export const isLoggedIn = computed(() => !!token.value)

export function setAuth(t: string, u: UserInfo): void {
  token.value = t
  user.value = u
  localStorage.setItem(TOKEN_KEY, t)
  localStorage.setItem(USER_KEY, JSON.stringify(u))
}

export function clearAuth(): void {
  token.value = null
  user.value = null
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

type ApiFetchOptions = RequestInit & {
  headers?: Record<string, string>
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const base = import.meta.env.VITE_API_BASE ?? '/api'
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    clearAuth()
    window.location.href = '/admin/login'
    throw new Error('Unauthorized')
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

export type { AuthResponse }
