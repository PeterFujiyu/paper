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

/**
 * The database may legitimately live anywhere — this function fails open by design, and that stays
 * true. What it must not allow is a path that would corrupt a git directory or land inside a
 * candidate workspace (which gets deleted between runs).
 *
 * @param repoRoot        the repository under test
 * @param harnessRoot     the harness repository; its .git is just as destructible as the subject's
 * @param workspacesRoot  where candidate workspaces are actually materialized. Passed in rather
 *                        than re-derived from repoRoot: once workspaces moved to the harness, the
 *                        old `<repoRoot>/.agent-benchmark/workspaces` literal named a directory
 *                        holding no workspaces, so this guard kept passing while protecting
 *                        nothing — leaving guard 3 (which only fires after a workspace has been
 *                        prepared) as the sole defense.
 */
export function assertSafeDatabasePath({
  databasePath,
  repoRoot,
  harnessRoot,
  workspacesRoot,
  candidateWorkspaces = [],
}) {
  if (typeof databasePath !== 'string' || databasePath.length === 0) {
    throw new TypeError('SQLite database path is required')
  }
  const target = canonicalFuturePath(databasePath)

  for (const root of [repoRoot, harnessRoot]) {
    if (!root) continue
    const gitDirectory = canonicalFuturePath(join(canonicalFuturePath(root), '.git'))
    if (containedBy(gitDirectory, target)) {
      throw new Error('SQLite 数据库不能位于仓库 .git 内')
    }
  }

  const workspaceRoots = [
    ...(workspacesRoot ? [workspacesRoot] : []),
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
