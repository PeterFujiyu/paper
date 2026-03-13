// Global test setup — runs before any test file is executed.
// Sets env vars required by server modules that read them at import time.
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars-long!!'
