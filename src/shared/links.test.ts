import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backlinks, buildTree, linkAt, parseLinks, resolveLink, search } from './links.ts'

const notes = [
  { path: 'Home.md', content: 'Start at [[Ideas#Top|my ideas]] and [[projects/Galaxy]].', mtime: 0 },
  { path: 'Ideas.md', content: '# Ideas\nBuild a galaxy.', mtime: 0 },
  { path: 'projects/Galaxy.md', content: 'Back to [[home]].', mtime: 0 }
]

test('parseLinks reads targets and drops headings and aliases', () => {
  assert.deepEqual(parseLinks(notes[0]!.content), ['Ideas', 'projects/Galaxy'])
  assert.deepEqual(parseLinks('no links, just [single] brackets'), [])
})

test('linkAt finds the link under an offset', () => {
  const line = 'see [[Ideas]] now'
  assert.equal(linkAt(line, 7), 'Ideas')
  assert.equal(linkAt(line, 1), null)
})

test('resolveLink matches by name or path, ignoring case', () => {
  const paths = notes.map((n) => n.path)
  assert.equal(resolveLink(paths, 'galaxy'), 'projects/Galaxy.md')
  assert.equal(resolveLink(paths, 'projects/Galaxy'), 'projects/Galaxy.md')
  assert.equal(resolveLink(paths, 'Missing'), undefined)
})

test('backlinks lists notes linking here, not the note itself', () => {
  assert.deepEqual(backlinks(notes, 'Home.md'), [{ path: 'projects/Galaxy.md', line: 'Back to [[home]].' }])
  assert.deepEqual(backlinks(notes, 'Ideas.md').map((h) => h.path), ['Home.md'])
})

test('search matches text and names', () => {
  assert.deepEqual(search(notes, 'GALAXY').map((h) => h.path), ['Home.md', 'Ideas.md', 'projects/Galaxy.md'])
  assert.deepEqual(search(notes, '   '), [])
})

test('buildTree puts folders first and sorts by name', () => {
  const tree = buildTree(['b.md', 'a.md', 'z/c.md'])
  assert.deepEqual(tree.map((n) => n.name), ['z', 'a', 'b'])
  assert.deepEqual(tree[0]!.children, [{ name: 'c', path: 'z/c.md' }])
})
