/**
 * Minimal auth store — persists JWT in localStorage
 */
import { ref, computed } from 'vue'

const TOKEN_KEY = 'pf_admin_token'
const USER_KEY  = 'pf_admin_user'

export const token = ref(localStorage.getItem(TOKEN_KEY) ?? null)
export const user  = ref(JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'))

export const isLoggedIn = computed(() => !!token.value)

export function setAuth(t, u) {
  token.value = t
  user.value  = u
  localStorage.setItem(TOKEN_KEY, t)
  localStorage.setItem(USER_KEY, JSON.stringify(u))
}

export function clearAuth() {
  token.value = null
  user.value  = null
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// Axios-like fetch wrapper with auth header
export async function apiFetch(path, options = {}) {
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
    return
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}
