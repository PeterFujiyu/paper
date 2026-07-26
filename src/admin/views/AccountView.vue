<template>
  <div class="admin-wrap">
    <header class="admin-header">
      <h1 class="admin-title">Account</h1>
      <div class="admin-header-actions">
        <RouterLink to="/admin" class="btn-ghost">Writing</RouterLink>
        <RouterLink to="/admin/notes" class="btn-ghost">Notes</RouterLink>
      </div>
    </header>

    <section class="account-section">
      <h2 class="section-title">Change password</h2>
      <p class="section-sub">
        Signed in as {{ user?.email }}. Changing your password signs out every other session.
      </p>

      <form @submit.prevent="submit" @input="success = false" class="auth-form">
        <div class="field">
          <label for="account-current">Current password</label>
          <input
            id="account-current"
            v-model="form.currentPassword"
            type="password"
            placeholder="••••••••"
            required
            autocomplete="current-password"
            :aria-describedby="showError ? 'account-error' : undefined"
            :aria-invalid="showError || undefined"
          />
        </div>
        <div class="field">
          <label for="account-new">New password</label>
          <input
            id="account-new"
            v-model="form.newPassword"
            type="password"
            placeholder="••••••••"
            required
            autocomplete="new-password"
            :aria-describedby="showError ? 'account-error' : undefined"
            :aria-invalid="showError || undefined"
          />
        </div>
        <div class="field">
          <label for="account-confirm">Confirm new password</label>
          <input
            id="account-confirm"
            v-model="form.confirmPassword"
            type="password"
            placeholder="••••••••"
            required
            autocomplete="new-password"
            :aria-describedby="showError ? 'account-error' : undefined"
            :aria-invalid="showError || undefined"
          />
        </div>

        <p v-if="showError" id="account-error" class="auth-error" role="alert">
          {{ error || validationMessage }}
        </p>
        <div role="status">
          <p v-if="success" class="auth-success">Password updated.</p>
        </div>

        <button type="submit" class="btn-primary submit-btn" :disabled="saving || !!validationMessage">
          {{ saving ? 'Saving…' : 'Update password' }}
        </button>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { apiFetch, user } from '../store'

const saving = ref(false)
const error = ref('')
const success = ref(false)

const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })

const validationMessage = computed(() => {
  if (!form.currentPassword) return 'Current password is required.'
  if (!form.newPassword) return 'New password is required.'
  if (form.newPassword.length < 8) return 'Password must be at least 8 characters.'
  if (form.newPassword === form.currentPassword) return 'New password must differ from the current one.'
  if (form.newPassword !== form.confirmPassword) return 'New passwords do not match.'
  return ''
})

// Drives the error paragraph plus the fields' aria-describedby / aria-invalid.
// A successful change empties the fields, which makes validationMessage read
// "Current password is required." again — that guidance must stay hidden until
// the user starts typing, or it renders next to "Password updated." The form's
// @input handler drops the success flag on the first keystroke, and input
// events don't fire for the programmatic reset in submit().
const showError = computed(() =>
  Boolean(error.value || (!success.value && validationMessage.value))
)

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed'
}

async function submit() {
  if (validationMessage.value) {
    error.value = validationMessage.value
    return
  }

  saving.value = true
  error.value = ''
  success.value = false
  try {
    await apiFetch<{ ok: boolean }>('/auth-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    })
    success.value = true
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
  } catch (e: unknown) {
    error.value = getErrorMessage(e)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.admin-wrap {
  max-width: 56rem;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}

.admin-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1.5rem;
  margin-bottom: 3rem;
}

.admin-title {
  font-size: 1.5rem;
  font-weight: 400;
  margin: 0;
}

.admin-header-actions {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.btn-primary {
  font-family: inherit;
  font-size: 0.875rem;
  background: var(--text-main);
  color: var(--bg);
  border: none;
  padding: 0.45rem 1rem;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-primary:hover:not(:disabled) { opacity: 0.75; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-ghost {
  font-family: inherit;
  font-size: 0.875rem;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  transition: color 0.2s;
}
.btn-ghost:hover { color: var(--text-main); }

.account-section {
  max-width: 380px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0 0 0.4rem 0;
  color: var(--text-main);
}

.section-sub {
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

.auth-success {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0;
}

.submit-btn {
  margin-top: 0.5rem;
  align-self: flex-start;
}
</style>
