import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Git snapshots of a vault's notes, kept in `gitDir` outside the vault so the vault folder is never touched
 * (no .git appears in it, and a vault that is already a git repo keeps its own history).
 */
export function snapshots(root: string, gitDir: string) {
  const git = async (...args: string[]): Promise<string> => {
    const base = ['-c', 'user.name=Galaxy', '-c', 'user.email=galaxy@localhost', '-c', 'core.autocrlf=false', '-c', 'core.quotepath=false']
    try {
      const { stdout } = await run('git', [...base, `--git-dir=${gitDir}`, `--work-tree=${root}`, ...args], { maxBuffer: 64 * 1024 * 1024 })
      return stdout
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('The agent needs Git for its undo history. Install it from git-scm.com')
      throw error
    }
  }

  /** Commits every note as it is now and returns the commit hash. */
  async function take(message: string): Promise<string> {
    if (!existsSync(gitDir)) {
      await mkdir(gitDir, { recursive: true })
      await git('init', '-q')
    }
    // The agent can only touch .md notes, so attachments are left out of the snapshot.
    await git('add', '-A', '--', ':(glob)**/*.md')
    await git('commit', '-q', '--allow-empty', '--no-verify', '-m', message)
    return (await git('rev-parse', 'HEAD')).trim()
  }

  /** Notes that differ between two snapshots. */
  async function changed(before: string, after: string): Promise<string[]> {
    // --no-renames: a moved note must list both its old and new path, so undo restores one and removes the other.
    return (await git('diff', '--name-only', '--no-renames', '-z', before, after)).split('\0').filter(Boolean)
  }

  /**
   * Puts the notes changed between `before` and `after` back to how they were at `before`:
   * edited notes are restored and notes created in between are deleted.
   * Refuses if any of those notes changed again since `after`, so later edits are never lost.
   */
  async function undo(before: string, after: string): Promise<string[]> {
    const paths = await changed(before, after)
    if (!paths.length) return []
    const specs = paths.map((p) => `:(literal)${p}`)
    // Stage all notes, not just `specs`: git refuses a pathspec that no longer exists anywhere (a moved note's old path).
    await git('add', '-A', '--', ':(glob)**/*.md')
    const since = (await git('diff', '--name-only', '--no-renames', '-z', '--cached', after, '--', ...specs)).split('\0').filter(Boolean)
    if (since.length) {
      await git('reset', '-q', after, '--', ...specs)
      throw new Error(`These notes changed after the agent ran, so undo was stopped: ${since.join(', ')}`)
    }
    await git('restore', `--source=${before}`, '--staged', '--worktree', '--', ...specs)
    await git('commit', '-q', '--allow-empty', '--no-verify', '-m', `undo ${after}`)
    return paths
  }

  return { take, changed, undo }
}
