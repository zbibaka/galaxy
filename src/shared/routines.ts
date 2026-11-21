import { noteName } from './links.ts'
import type { Note } from './types.ts'

const DATE = /(\d{4})-(\d{2})-(\d{2})/
const DAY_MS = 86_400_000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** A habit worth automating: notes with the same name and a date, made every day or on the same weekday. */
export type Routine = { name: string; folder: string; cadence: 'daily' | 'weekly'; weekday?: string; count: number; example: string }

/** Finds dated notes that repeat, like "2026-11-20" every day or "Meeting 2026-11-16" most Mondays. */
export function findRoutines(notes: Note[]): Routine[] {
  const groups = new Map<string, { name: string; folder: string; days: Map<number, string> }>()
  for (const note of notes) {
    const name = noteName(note.path)
    const m = DATE.exec(name)
    if (!m) continue
    const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS
    if (!Number.isInteger(day)) continue
    const stem = name.replace(DATE, '').replace(/[\s\-_–·]+/g, ' ').trim()
    const folder = note.path.includes('/') ? note.path.slice(0, note.path.lastIndexOf('/')) : ''
    const key = `${folder}|${stem.toLowerCase()}`
    const group = groups.get(key) ?? { name: stem || 'Daily note', folder, days: new Map() }
    group.days.set(day, note.path)
    groups.set(key, group)
  }

  const routines: Routine[] = []
  for (const { name, folder, days } of groups.values()) {
    if (days.size < 3) continue
    const sorted = [...days.keys()].sort((a, b) => a - b)
    const example = days.get(sorted[sorted.length - 1]!)!
    const nextDay = sorted.slice(1).filter((d, i) => d - sorted[i]! === 1).length
    if (nextDay / (sorted.length - 1) >= 0.6) {
      routines.push({ name, folder, cadence: 'daily', count: days.size, example })
      continue
    }
    const perWeekday = new Array<number>(7).fill(0)
    for (const d of sorted) perWeekday[(d + 4) % 7]!++ // day 0 (1970-01-01) was a Thursday
    const top = Math.max(...perWeekday)
    if (top >= 3 && top / days.size >= 0.6) {
      routines.push({ name, folder, cadence: 'weekly', weekday: WEEKDAYS[perWeekday.indexOf(top)], count: days.size, example })
    }
  }
  return routines.sort((a, b) => b.count - a.count)
}
