import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { snapshots } from './snapshot.ts'

test('undo restores edited notes, deletes created ones and leaves the vault without .git', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galaxy-vault-'))
  // The snapshots folder and its parents do not exist yet, as on a first run.
  const snap = snapshots(root, join(await mkdtemp(join(tmpdir(), 'galaxy-git-')), 'snapshots', 'repo'))
  await writeFile(join(root, 'Keep.md'), 'original')
  await writeFile(join(root, 'Other.md'), 'untouched')

  const before = await snap.take('before')
  await writeFile(join(root, 'Keep.md'), 'agent edit')
  await writeFile(join(root, 'New note.md'), 'agent made this')
  const after = await snap.take('after')

  assert.deepEqual((await snap.changed(before, after)).sort(), ['Keep.md', 'New note.md'])
  assert.deepEqual((await snap.undo(before, after)).sort(), ['Keep.md', 'New note.md'])
  assert.equal(await readFile(join(root, 'Keep.md'), 'utf8'), 'original')
  assert.equal(existsSync(join(root, 'New note.md')), false)
  assert.equal(await readFile(join(root, 'Other.md'), 'utf8'), 'untouched')
  assert.equal(existsSync(join(root, '.git')), false)
})

test('undo puts a moved note back where it was', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galaxy-vault-'))
  const snap = snapshots(root, join(await mkdtemp(join(tmpdir(), 'galaxy-git-')), 'repo'))
  await writeFile(join(root, 'Inbox.md'), 'a note long enough for git to see a rename')
  await mkdir(join(root, 'Projects'))
  const before = await snap.take('before')
  await rename(join(root, 'Inbox.md'), join(root, 'Projects', 'Inbox.md'))
  const after = await snap.take('after')

  assert.deepEqual((await snap.changed(before, after)).sort(), ['Inbox.md', 'Projects/Inbox.md'])
  await snap.undo(before, after)
  assert.equal(await readFile(join(root, 'Inbox.md'), 'utf8'), 'a note long enough for git to see a rename')
  assert.equal(existsSync(join(root, 'Projects', 'Inbox.md')), false)
})

test('undo refuses when a changed note was edited again afterwards', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galaxy-vault-'))
  const snap = snapshots(root, join(await mkdtemp(join(tmpdir(), 'galaxy-git-')), 'repo'))
  await writeFile(join(root, 'A.md'), 'one')
  const before = await snap.take('before')
  await writeFile(join(root, 'A.md'), 'two')
  const after = await snap.take('after')
  await writeFile(join(root, 'A.md'), 'my own later edit')

  await assert.rejects(snap.undo(before, after), /changed after the agent ran/)
  assert.equal(await readFile(join(root, 'A.md'), 'utf8'), 'my own later edit')
})
