import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findRoutines } from './routines.ts'

const note = (path: string) => ({ path, content: '', mtime: 0 })

test('findRoutines spots daily notes and weekly meetings, and ignores one-offs', () => {
  const notes = [
    // 2026-11-02, 09, 16 and 23 are Mondays; the 11th is a Wednesday.
    ...['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-11'].map((d) => note(`Work/Meeting ${d}.md`)),
    ...['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'].map((d) => note(`Daily/${d}.md`)),
    note('Trip 2026-05-01.md'),
    note('Trip 2026-06-12.md'),
    note('Ideas.md')
  ]
  assert.deepEqual(findRoutines(notes), [
    { name: 'Meeting', folder: 'Work', cadence: 'weekly', weekday: 'Monday', count: 5, example: 'Work/Meeting 2026-11-23.md' },
    { name: 'Daily note', folder: 'Daily', cadence: 'daily', count: 4, example: 'Daily/2026-11-21.md' }
  ])
})
