import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { validateManifest } from './catalog.mjs'

function probe(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  return {
    available: result.status === 0,
    version: (result.stdout || result.stderr || '').trim().split('\n')[0],
  }
}

export function diagnoseEnvironment(manifest, repoRoot) {
  const tools = {
    node: { available: true, version: process.version },
    git: probe('git', ['--version']),
    npm: probe('npm', ['--version']),
    tar: probe('tar', ['--version']),
  }
  const status = spawnSync('git', ['-C', repoRoot, 'status', '--porcelain'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  const manifestResult = validateManifest(manifest, repoRoot)
  const dependencies = {
    available: existsSync(join(repoRoot, 'node_modules')),
    path: join(repoRoot, 'node_modules'),
  }
  const ready = Object.values(tools).every(tool => tool.available)
    && manifestResult.valid
    && dependencies.available

  return {
    ready,
    sourceRepository: repoRoot,
    sourceDirty: status.status === 0 && status.stdout.trim().length > 0,
    tools,
    dependencies,
    manifest: manifestResult,
  }
}
