import { defineConfig } from 'vitest/config'

// The agent-benchmark suite is excluded from vitest.config.ts because it spawns
// real Git and CLI subprocesses: run in parallel the tests contend for disk and
// time out. It runs here instead, serially, via `npm run benchmark:test`.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/agent-benchmark/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
  },
})
