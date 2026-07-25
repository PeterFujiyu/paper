import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    // `.agent-benchmark/` and `agent-benchmark-claude/` hold generated benchmark
    // workspaces — gitignored copies of the app that would otherwise be linted.
    ignores: [
      '**/dist/**',
      '**/dist-ssr/**',
      '**/coverage/**',
      '.agent-benchmark/**',
      'agent-benchmark-claude/**',
    ],
  },

  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),
]
