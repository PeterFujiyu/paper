import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

function containedBy(root, target) {
  const path = relative(root, target)
  return path === ''
    || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function canonicalFuturePath(path) {
  const target = resolve(path)
  const missing = []
  let ancestor = target
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor)
    if (parent === ancestor) break
    missing.push(basename(ancestor))
    ancestor = parent
  }
  const canonicalAncestor = existsSync(ancestor) ? realpathSync(ancestor) : ancestor
  return resolve(canonicalAncestor, ...missing.reverse())
}

function enclosingPreparedWorkspace(target) {
  let directory = dirname(target)
  while (true) {
    if (existsSync(join(directory, '.benchmark-session.json'))) return directory
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

export function assertSafeDatabasePath({
  databasePath,
  repoRoot,
  candidateWorkspaces = [],
}) {
  if (typeof databasePath !== 'string' || databasePath.length === 0) {
    throw new TypeError('SQLite database path is required')
  }
  const target = canonicalFuturePath(databasePath)
  const source = canonicalFuturePath(repoRoot)
  const gitDirectory = canonicalFuturePath(join(source, '.git'))
  if (containedBy(gitDirectory, target)) {
    throw new Error('SQLite 数据库不能位于源仓库 .git 内')
  }

  const workspaceRoots = [
    join(source, '.agent-benchmark', 'workspaces'),
    ...candidateWorkspaces,
  ].map(canonicalFuturePath)
  if (workspaceRoots.some(workspace => containedBy(workspace, target))) {
    throw new Error('SQLite database cannot be inside a candidate workspace')
  }
  if (enclosingPreparedWorkspace(target)) {
    throw new Error('SQLite database cannot be inside a prepared workspace')
  }
  return target
}
