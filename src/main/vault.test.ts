import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createNote, listNotes, moveNote, resolveNote, writeNote } from './vault.ts'

test('resolveNote refuses paths outside the vault or not ending in .md', () => {
  const root = join(tmpdir(), 'vault')
  assert.equal(resolveNote(root, 'a/b.md'), join(root, 'a', 'b.md'))
  assert.throws(() => resolveNote(root, '../escape.md'), /outside the vault/)
  assert.throws(() => resolveNote(root, join(tmpdir(), 'other.md')), /outside the vault/)
  assert.throws(() => resolveNote(root, 'evil.exe'), /Not a note path/)
  assert.throws(() => resolveNote(root, 42), /Not a note path/)
})

test('notes round-trip and hidden folders are skipped', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galaxy-'))
  await mkdir(join(root, '.obsidian'))
  await writeFile(join(root, '.obsidian', 'hidden.md'), 'x')
  await writeNote(root, 'deep/Note.md', 'hello')
  await createNote(root, 'Empty.md')
  await assert.rejects(createNote(root, 'Empty.md'), /EEXIST/)

  const notes = await listNotes(root)
  assert.deepEqual(notes.map((n) => n.path).sort(), ['Empty.md', 'deep/Note.md'])
  assert.equal(await readFile(join(root, 'deep', 'Note.md'), 'utf8'), 'hello')

  await moveNote(root, 'Empty.md', 'Projects/Empty.md')
  assert.deepEqual((await listNotes(root)).map((n) => n.path).sort(), ['Projects/Empty.md', 'deep/Note.md'])
  await writeNote(root, 'Other.md', 'x')
  await assert.rejects(moveNote(root, 'Other.md', 'Projects/Empty.md'), /already exists/)
  await assert.rejects(moveNote(root, 'Other.md', '../out.md'), /outside the vault/)
})
