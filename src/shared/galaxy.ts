import { noteName, parseLinks, resolveLink } from './links.ts'
import type { Note } from './types.ts'

export const LOOSE = 'Loose stars'
export const HOLE = 'hole'
const DAY = 86_400_000

/** A note's constellation: its top-level folder, or "Loose stars" for notes at the vault root. */
// shortcut: folders stand in for constellations until Phase 4 groups notes by meaning.
export const constellationOf = (path: string): string => (path.includes('/') ? path.slice(0, path.indexOf('/')) : LOOSE)

/** Links between notes that resolve to a real note, each pair once, no self-links. */
export function noteLinks(notes: Note[]): [string, string][] {
  const paths = notes.map((n) => n.path)
  const seen = new Set<string>()
  const pairs: [string, string][] = []
  for (const note of notes) {
    for (const target of parseLinks(note.content)) {
      const to = resolveLink(paths, target)
      if (!to || to === note.path) continue
      const key = [note.path, to].sort().join('\n')
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push([note.path, to])
    }
  }
  return pairs
}

function degrees(pairs: [string, string][]): Map<string, number> {
  const degree = new Map<string, number>()
  for (const [a, b] of pairs) {
    degree.set(a, (degree.get(a) ?? 0) + 1)
    degree.set(b, (degree.get(b) ?? 0) + 1)
  }
  return degree
}

export type GalaxyNode = { id: string; kind: 'hole' | 'hub' | 'note'; name: string; group: string; degree: number }
/** orbit: black hole to constellation; member: constellation to note; link: a [[link]] between notes. */
export type GalaxyLink = { source: string; target: string; kind: 'orbit' | 'member' | 'link' }

/**
 * The black hole sits at the center. Each constellation is an invisible hub tied to it, and each note is
 * tied to its hub, so related notes cluster and the hub's label lands in the middle of its cluster.
 */
export function galaxyData(notes: Note[]): { nodes: GalaxyNode[]; links: GalaxyLink[] } {
  const pairs = noteLinks(notes)
  const degree = degrees(pairs)
  const groups = [...new Set(notes.map((n) => constellationOf(n.path)))].sort()
  return {
    nodes: [
      { id: HOLE, kind: 'hole', name: 'Dashboard', group: '', degree: 0 },
      ...groups.map((g) => ({ id: `hub:${g}`, kind: 'hub' as const, name: g, group: g, degree: 0 })),
      ...notes.map((n) => ({
        id: n.path,
        kind: 'note' as const,
        name: noteName(n.path),
        group: constellationOf(n.path),
        degree: degree.get(n.path) ?? 0
      }))
    ],
    links: [
      ...groups.map((g) => ({ source: HOLE, target: `hub:${g}`, kind: 'orbit' as const })),
      ...notes.map((n) => ({ source: `hub:${constellationOf(n.path)}`, target: n.path, kind: 'member' as const })),
      ...pairs.map(([source, target]) => ({ source, target, kind: 'link' as const }))
    ]
  }
}

/** Local calendar day as YYYY-MM-DD. */
export const dayKey = (t: number): string => new Date(t).toLocaleDateString('en-CA')

export function dashboardStats(notes: Note[], now: number) {
  const pairs = noteLinks(notes)
  const degree = degrees(pairs)
  const groups = new Map<string, number>()
  for (const n of notes) groups.set(constellationOf(n.path), (groups.get(constellationOf(n.path)) ?? 0) + 1)
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (13 - i))
    return dayKey(d.getTime())
  })
  return {
    notes: notes.length,
    links: pairs.length,
    updatedThisWeek: notes.filter((n) => now - n.mtime < 7 * DAY).length,
    constellations: [...groups].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    perDay: days.map((day) => ({ day, count: notes.filter((n) => dayKey(n.mtime) === day).length })),
    mostConnected: notes
      .map((n) => ({ path: n.path, degree: degree.get(n.path) ?? 0 }))
      .filter((x) => x.degree > 0)
      .sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path))
      .slice(0, 5),
    recent: [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, 8).map((n) => ({ path: n.path, mtime: n.mtime }))
  }
}

/** "just now", "5m ago", "3h ago", "2d ago". */
export function ago(now: number, t: number): string {
  const minutes = Math.floor((now - t) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / (60 * 24))}d ago`
}
