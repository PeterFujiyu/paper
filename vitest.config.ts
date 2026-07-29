import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    // The agent-benchmark suite spawns real Git/CLI subprocesses and must run
    // serially — `npm run benchmark:test` owns it via --no-file-parallelism.
    exclude: [...configDefaults.exclude, 'tests/agent-benchmark/**'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'server/lib/**/*.ts'],
      exclude: ['src/main.ts', 'src/env.d.ts'],
    },
  },
})
