import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ago, dashboardStats, dayKey, galaxyData, HOLE, LOOSE, noteLinks } from './galaxy.ts'

const now = new Date(2026, 10, 21, 12).getTime()
const h = 3_600_000
const notes = [
  { path: 'Home.md', content: '[[Ideas]] [[Ideas]] [[Home]] [[Missing]] [[projects/Galaxy]]', mtime: now - h },
  { path: 'Ideas.md', content: 'see [[Home]]', mtime: now - 30 * 24 * h },
  { path: 'projects/Galaxy.md', content: '', mtime: now - 2 * 24 * h }
]

test('noteLinks keeps each real pair once and drops self and missing links', () => {
  assert.deepEqual(noteLinks(notes), [
    ['Home.md', 'Ideas.md'],
    ['Home.md', 'projects/Galaxy.md']
  ])
})

test('galaxyData ties notes to constellation hubs around the black hole', () => {
  const { nodes, links } = galaxyData(notes)
  assert.deepEqual(nodes.filter((n) => n.kind === 'hub').map((n) => n.name), [LOOSE, 'projects'])
  assert.equal(nodes.find((n) => n.id === 'Home.md')?.degree, 2)
  assert.deepEqual(links.filter((l) => l.kind === 'orbit').map((l) => l.source), [HOLE, HOLE])
  assert.ok(links.some((l) => l.kind === 'member' && l.source === 'hub:projects' && l.target === 'projects/Galaxy.md'))
  assert.equal(links.filter((l) => l.kind === 'link').length, 2)
})

test('dashboardStats counts notes, links, activity and connections', () => {
  const s = dashboardStats(notes, now)
  assert.equal(s.notes, 3)
  assert.equal(s.links, 2)
  assert.equal(s.updatedThisWeek, 2)
  assert.deepEqual(s.constellations, [{ name: LOOSE, count: 2 }, { name: 'projects', count: 1 }])
  assert.equal(s.perDay.length, 14)
  assert.equal(s.perDay.at(-1)?.day, dayKey(now))
  assert.equal(s.perDay.at(-1)?.count, 1)
  assert.deepEqual(s.mostConnected.map((m) => m.path), ['Home.md', 'Ideas.md', 'projects/Galaxy.md'])
  assert.deepEqual(s.recent.map((r) => r.path), ['Home.md', 'projects/Galaxy.md', 'Ideas.md'])
})

test('ago reads as a short relative time', () => {
  assert.equal(ago(now, now - 10_000), 'just now')
  assert.equal(ago(now, now - 5 * 60_000), '5m ago')
  assert.equal(ago(now, now - 3 * h), '3h ago')
  assert.equal(ago(now, now - 50 * h), '2d ago')
})
