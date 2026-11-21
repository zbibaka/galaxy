import { useMemo, useState } from 'react'
import { ago, dashboardStats } from '../../shared/galaxy'
import { noteName } from '../../shared/links'
import type { Note } from '../../shared/types'
import { constellationColor } from './palette'

type Props = { notes: Note[]; onOpenNote: (path: string) => void }

const shortDay = (day: string): string => new Date(`${day}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function Dashboard({ notes, onOpenNote }: Props) {
  const [now] = useState(() => Date.now())
  const [hover, setHover] = useState<number | null>(null)
  const s = useMemo(() => dashboardStats(notes, now), [notes, now])
  const groups = s.constellations.map((c) => c.name)
  const maxDay = Math.max(1, ...s.perDay.map((d) => d.count))
  const maxGroup = Math.max(1, ...s.constellations.map((c) => c.count))
  const hovered = hover === null ? undefined : s.perDay[hover]
  const lastTwoWeeks = s.perDay.reduce((sum, d) => sum + d.count, 0)

  const tiles: [string, number][] = [
    ['Notes', s.notes],
    ['Links', s.links],
    ['Constellations', s.constellations.length],
    ['Edited this week', s.updatedThisWeek]
  ]

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <div className="tiles">
        {tiles.map(([label, value]) => (
          <div className="tile" key={label}>
            <span className="tile-value">{value}</span>
            <span className="tile-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="cards">
        <section className="card">
          <h2>Notes by day last edited</h2>
          <p className="readout">
            {hovered ? `${shortDay(hovered.day)}: ${plural(hovered.count, 'note')}` : `${plural(lastTwoWeeks, 'note')} in the last 14 days`}
          </p>
          <div
            className="bars"
            role="img"
            aria-label={`Notes last edited per day, last 14 days: ${s.perDay.map((d) => `${shortDay(d.day)} ${d.count}`).join(', ')}`}
            onMouseLeave={() => setHover(null)}
          >
            {s.perDay.map((d, i) => (
              <div key={d.day} className={`bar-slot${hover === i ? ' hovered' : ''}`} onMouseEnter={() => setHover(i)}>
                <div className="bar" style={{ height: `${(d.count / maxDay) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="bar-axis">
            <span>{shortDay(s.perDay[0]!.day)}</span>
            <span>Today</span>
          </div>
        </section>

        <section className="card">
          <h2>Notes by constellation</h2>
          {s.constellations.map((c) => (
            <div className="meter-row" key={c.name}>
              <span className="meter-name">{c.name}</span>
              <div className="meter">
                <div style={{ width: `${(c.count / maxGroup) * 100}%`, background: constellationColor(groups, c.name) }} />
              </div>
              <span className="meter-value">{c.count}</span>
            </div>
          ))}
          {!s.constellations.length && <p className="muted">No notes yet.</p>}
        </section>

        <section className="card">
          <h2>Most connected</h2>
          {s.mostConnected.length ? (
            s.mostConnected.map((m) => (
              <button key={m.path} className="hit row" onClick={() => onOpenNote(m.path)}>
                <strong>{noteName(m.path)}</strong>
                <span>{plural(m.degree, 'link')}</span>
              </button>
            ))
          ) : (
            <p className="muted">No links yet. Connect notes with [[links]].</p>
          )}
        </section>

        <section className="card">
          <h2>Recent activity</h2>
          {s.recent.map((r) => (
            <button key={r.path} className="hit row" onClick={() => onOpenNote(r.path)}>
              <strong>{noteName(r.path)}</strong>
              <span>{ago(now, r.mtime)}</span>
            </button>
          ))}
          {!s.recent.length && <p className="muted">No notes yet.</p>}
        </section>
      </div>
    </div>
  )
}
