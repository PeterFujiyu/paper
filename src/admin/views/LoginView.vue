<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <h1 class="auth-title">{{ isRegister ? 'Create account' : 'Sign in' }}</h1>
      <p class="auth-sub">{{ isRegister ? 'Set up your admin account.' : 'Continue to the editor.' }}</p>

      <form @submit.prevent="submit" class="auth-form">
        <div v-if="isRegister" class="field">
          <label>Name</label>
          <input v-model="form.name" type="text" placeholder="Peter Fujiyu" required autocomplete="name" />
        </div>
        <div v-if="isRegister" class="field">
          <label>Invite code</label>
          <input v-model="form.inviteCode" type="password" placeholder="••••••••" required autocomplete="off" />
        </div>
        <div class="field">
          <label>Email</label>
          <input v-model="form.email" type="email" placeholder="you@example.com" required autocomplete="email" />
        </div>
        <div class="field">
          <label>Password</label>
          <input v-model="form.password" type="password" placeholder="••••••••" required autocomplete="current-password" />
        </div>

        <p v-if="error || validationMessage" class="auth-error">{{ error || validationMessage }}</p>

        <button type="submit" class="auth-btn" :disabled="loading || !!validationMessage">
          {{ loading ? 'Please wait…' : (isRegister ? 'Create account' : 'Sign in') }}
        </button>
      </form>

      <p class="auth-toggle">
        {{ isRegister ? 'Already have an account?' : 'No account yet?' }}
        <button @click="isRegister = !isRegister" class="toggle-btn">
          {{ isRegister ? 'Sign in' : 'Register' }}
        </button>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { setAuth, apiFetch, type AuthResponse } from '../store'

const router = useRouter()
const isRegister = ref(false)
const loading = ref(false)
const error = ref('')

const form = reactive({ name: '', email: '', password: '', inviteCode: '' })

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const validationMessage = computed(() => {
  if (isRegister.value && !form.name.trim()) return 'Name is required.'
  if (isRegister.value && form.name.trim().length < 2) return 'Name must be at least 2 characters.'
  if (isRegister.value && !form.inviteCode.trim()) return 'Invite code is required.'
  if (!form.email.trim()) return 'Email is required.'
  if (!emailPattern.test(form.email.trim())) return 'Enter a valid email address.'
  if (!form.password) return 'Password is required.'
  if (form.password.length < 8) return 'Password must be at least 8 characters.'
  return ''
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed'
}

async function submit() {
  if (validationMessage.value) {
    error.value = validationMessage.value
    return
  }

  loading.value = true
  error.value = ''
  try {
    const endpoint = isRegister.value ? '/auth-register' : '/auth-login'
    const body = isRegister.value
      ? { name: form.name, email: form.email, password: form.password, inviteCode: form.inviteCode }
      : { email: form.email, password: form.password }

    const data = await apiFetch<AuthResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setAuth(data.user)
    router.push('/admin')
  } catch (e: unknown) {
    error.value = getErrorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg);
  padding: 2rem;
}

.auth-card {
  width: 100%;
  max-width: 380px;
}

.auth-title {
  font-size: 1.8rem;
  font-weight: 400;
  letter-spacing: -0.02em;
  margin: 0 0 0.4rem 0;
  color: var(--text-main);
}

.auth-sub {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0 0 2.5rem 0;
  font-style: italic;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field label {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.field input {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 0.5rem 0;
  font-family: inherit;
  font-size: 1rem;
  color: var(--text-main);
  outline: none;
  transition: border-color 0.2s ease;
}

.field input:focus {
  border-bottom-color: var(--text-main);
}

.auth-error {
  font-size: 0.85rem;
  color: #c0392b;
  font-style: italic;
  margin: 0;
}

.auth-btn {
  margin-top: 0.5rem;
  background: var(--text-main);
  color: var(--bg);
  border: none;
  padding: 0.75rem 1.5rem;
  font-family: inherit;
  font-size: 0.875rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.auth-btn:hover:not(:disabled) { opacity: 0.8; }
.auth-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.auth-toggle {
  margin-top: 1.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.toggle-btn {
  background: none;
  border: none;
  font-family: inherit;
  font-size: inherit;
  color: var(--text-main);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  padding: 0;
}
</style>
