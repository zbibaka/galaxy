import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Note } from '../shared/types'

/**
 * Turns a vault-relative note path from the page into an absolute path.
 * Refuses anything that is not a .md file inside the vault: the page is not trusted with the disk.
 */
export function resolveNote(root: string, rel: unknown): string {
  if (typeof rel !== 'string' || !rel.toLowerCase().endsWith('.md')) {
    throw new Error(`Not a note path: ${String(rel)}`)
  }
  const base = resolve(root)
  const prefix = base.endsWith(sep) ? base : base + sep
  const abs = resolve(base, rel)
  if (!abs.startsWith(prefix)) throw new Error(`Path is outside the vault: ${rel}`)
  return abs
}

/** Reads every .md note, skipping hidden folders (.obsidian, .git) and node_modules. */
export async function listNotes(root: string): Promise<Note[]> {
  const notes: Note[] = []
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) await walk(abs)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        notes.push({
          path: relative(root, abs).split(sep).join('/'),
          content: await readFile(abs, 'utf8'),
          mtime: (await stat(abs)).mtimeMs
        })
      }
    }
  }
  await walk(root)
  return notes
}

function assertText(content: unknown): asserts content is string {
  if (typeof content !== 'string') throw new Error('Note content must be text')
}

export async function writeNote(root: string, rel: unknown, content: unknown): Promise<void> {
  const abs = resolveNote(root, rel)
  assertText(content)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf8')
}

export function writeNoteSync(root: string, rel: unknown, content: unknown): void {
  const abs = resolveNote(root, rel)
  assertText(content)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

/** Creates an empty note; fails if one already exists so nothing is overwritten. */
export async function createNote(root: string, rel: unknown): Promise<void> {
  const abs = resolveNote(root, rel)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, '', { encoding: 'utf8', flag: 'wx' })
}
