import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks must be declared before the dynamic import so that
// Vitest's module registry sees the mock when the store module is first loaded.
// ---------------------------------------------------------------------------

// Mock import.meta.env so apiFetch can resolve the base URL without Vite.
vi.stubEnv('VITE_API_BASE', '/api')

// We mock global fetch to avoid real network calls.
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// We stub window.location.href assignment (happy-dom supports this but we
// want to capture it as a spy rather than actually navigate).
const locationAssignSpy = vi.fn()
Object.defineProperty(globalThis, 'location', {
  value: { href: '' },
  writable: true,
})

// Import the store after stubs are in place.  Using a direct path with .ts
// extension works in Vitest's Vite environment.
import { user, isLoggedIn, setAuth, clearAuth, apiFetch, loadSession, logout } from '../../src/admin/store.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockFetchJson(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })
}

// ---------------------------------------------------------------------------
// setAuth / clearAuth
// ---------------------------------------------------------------------------
describe('setAuth / clearAuth', () => {
  beforeEach(() => {
    clearAuth()
  })

  it('setAuth populates user ref', () => {
    setAuth({ id: '1', email: 'a@b.com', name: 'Alice' })
    expect(user.value).toEqual({ id: '1', email: 'a@b.com', name: 'Alice' })
  })

  it('isLoggedIn is true after setAuth', () => {
    setAuth({ id: '1', email: 'a@b.com', name: 'Alice' })
    expect(isLoggedIn.value).toBe(true)
  })

  it('clearAuth nulls user ref', () => {
    setAuth({ id: '1', email: 'a@b.com', name: 'Alice' })
    clearAuth()
    expect(user.value).toBeNull()
  })

  it('isLoggedIn is false after clearAuth', () => {
    clearAuth()
    expect(isLoggedIn.value).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// apiFetch
// ---------------------------------------------------------------------------
describe('apiFetch', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    clearAuth()
    globalThis.location.href = ''
  })

  it('returns parsed JSON on success', async () => {
    mockFetchJson(200, { hello: 'world' })
    const result = await apiFetch<{ hello: string }>('/test')
    expect(result).toEqual({ hello: 'world' })
  })

  it('throws on a non-ok response', async () => {
    mockFetchJson(400, { error: 'Bad request' })
    await expect(apiFetch('/test')).rejects.toThrow('Bad request')
  })

  it('throws with a fallback message when error field is missing', async () => {
    mockFetchJson(500, {})
    await expect(apiFetch('/test')).rejects.toThrow('Request failed')
  })

  it('clears auth and throws Unauthorized on 401', async () => {
    setAuth({ id: '1', email: 'a@b.com', name: 'Alice' })
    mockFetchJson(401, { error: 'Unauthorized' })
    await expect(apiFetch('/test')).rejects.toThrow('Unauthorized')
    expect(user.value).toBeNull()
  })

  it('redirects to /admin/login on 401 by default', async () => {
    mockFetchJson(401, {})
    try { await apiFetch('/test') } catch { /* expected */ }
    expect(globalThis.location.href).toBe('/admin/login')
  })

  it('does not redirect when redirectOnUnauthorized is false', async () => {
    globalThis.location.href = ''
    mockFetchJson(401, {})
    try { await apiFetch('/test', { redirectOnUnauthorized: false }) } catch { /* expected */ }
    expect(globalThis.location.href).toBe('')
  })

  it('sends Content-Type header when body is provided', async () => {
    mockFetchJson(200, {})
    await apiFetch('/test', { method: 'POST', body: JSON.stringify({ x: 1 }) })
    const callArgs = fetchMock.mock.calls[0]
    const opts = callArgs[1] as RequestInit & { headers: Record<string, string> }
    expect(opts.headers['Content-Type']).toBe('application/json')
  })
})

// ---------------------------------------------------------------------------
// loadSession
// ---------------------------------------------------------------------------
describe('loadSession', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    clearAuth()
  })

  it('returns true and sets user on successful auth-me', async () => {
    mockFetchJson(200, { id: '1', email: 'a@b.com', name: 'Alice' })
    const result = await loadSession(true)
    expect(result).toBe(true)
    expect(user.value).not.toBeNull()
  })

  it('returns false and clears user on failed auth-me', async () => {
    mockFetchJson(401, { error: 'Unauthorized' })
    const result = await loadSession(true)
    expect(result).toBe(false)
    expect(user.value).toBeNull()
  })

  it('returns cached result without a network call on second call', async () => {
    mockFetchJson(200, { id: '1', email: 'a@b.com', name: 'Alice' })
    await loadSession(true)
    fetchMock.mockReset()
    // Second call without force should use cache (sessionChecked = true)
    const result = await loadSession()
    expect(result).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
describe('logout', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    setAuth({ id: '1', email: 'a@b.com', name: 'Alice' })
  })

  it('calls auth-logout endpoint and clears auth', async () => {
    mockFetchJson(200, { ok: true })
    await logout()
    expect(user.value).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('clears auth even if the endpoint call fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'))
    // logout swallows nothing — the error propagates, but clearAuth() still runs in finally
    await expect(logout()).rejects.toThrow('Network error')
    expect(user.value).toBeNull()
  })
})
