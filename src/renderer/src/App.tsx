import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { backlinks, buildTree, noteName, resolveLink, search } from '../../shared/links'
import type { AgentResult, Vault } from '../../shared/types'
import { Agent } from './Agent'
import { Dashboard } from './Dashboard'
import { Editor } from './Editor'
import { Galaxy } from './Galaxy'
import { Tree } from './Tree'

const api = window.galaxy
const SAVE_DELAY_MS = 400

type View = 'galaxy' | 'notes' | 'dashboard'
const VIEWS: [View, string][] = [
  ['galaxy', 'Galaxy'],
  ['notes', 'Notes'],
  ['dashboard', 'Dashboard']
]

export default function App() {
  const [vault, setVault] = useState<Vault | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('galaxy')
  const [current, setCurrent] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  // Bumped when the agent changes notes on disk, so the editor reloads the open note.
  const [reloads, setReloads] = useState(0)
  const pending = useRef<{ path: string; content: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const flush = (): Promise<void> => {
    window.clearTimeout(timer.current)
    const save = pending.current
    pending.current = null
    if (!save) return Promise.resolve()
    return api.writeNote(save.path, save.content).catch((e: Error) => setError(`Could not save ${save.path}: ${e.message}`))
  }

  const agentStart = (): Promise<void> => {
    setAgentBusy(true)
    return flush()
  }

  const agentDone = (result?: AgentResult): void => {
    setAgentBusy(false)
    if (!result) return
    setVault(result.vault)
    setReloads((n) => n + 1)
    if (current && !result.vault.notes.some((n) => n.path === current)) setCurrent(null)
  }

  useEffect(() => {
    api.lastVault().then(setVault, (e: Error) => setError(e.message)).finally(() => setLoading(false))
    // Last chance to save typing that is still waiting for the save delay.
    const onUnload = (): void => {
      const save = pending.current
      if (save) api.writeNoteSync(save.path, save.content)
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  const notes = vault?.notes ?? []
  const note = notes.find((n) => n.path === current)
  const pathsKey = notes.map((n) => n.path).join('\n')
  const tree = useMemo(() => buildTree(pathsKey ? pathsKey.split('\n') : []), [pathsKey])
  // shortcut: search and backlinks rescan every note on each keystroke; index them once vaults reach thousands of notes.
  const results = useMemo(() => search(notes, query), [notes, query])
  const links = useMemo(() => (current ? backlinks(notes, current) : []), [notes, current])

  // n8n changed notes on disk. Unsaved typing wins for the open note; otherwise the editor reloads it if it changed.
  const outsideChange = useRef<(v: Vault) => void>(() => {})
  outsideChange.current = (v) => {
    if (agentBusy) return
    const typing = pending.current
    setVault(typing ? { ...v, notes: v.notes.map((n) => (n.path === typing.path ? { ...n, content: typing.content } : n)) } : v)
    const fresh = note && v.notes.find((n) => n.path === note.path)
    if (!typing && note && fresh?.content !== note.content) setReloads((n) => n + 1)
    if (current && !fresh) setCurrent(null)
  }
  useEffect(() => api.onVaultChanged((v) => outsideChange.current(v)), [])

  const pick = (): void => {
    flush()
    api.pickVault().then(
      (v) => {
        if (!v) return
        setVault(v)
        setCurrent(null)
        setQuery('')
        setView('galaxy')
      },
      (e: Error) => setError(e.message)
    )
  }

  const open = (path: string): void => {
    flush()
    setCurrent(path)
    setView('notes')
  }

  const switchView = (next: View): void => {
    flush()
    setView(next)
  }

  const edit = (content: string): void => {
    if (!current) return
    const path = current
    setVault((v) => v && { ...v, notes: v.notes.map((n) => (n.path === path ? { ...n, content, mtime: Date.now() } : n)) })
    pending.current = { path, content }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
  }

  const create = async (path: string): Promise<void> => {
    try {
      await api.createNote(path)
      setVault((v) => v && { ...v, notes: [...v.notes, { path, content: '', mtime: Date.now() }] })
      open(path)
    } catch (e) {
      setError(`Could not create ${path}: ${(e as Error).message}`)
    }
  }

  // Opens the note a link points to, or creates it like Obsidian does.
  const openLink = (target: string): void => {
    const hit = resolveLink(notes.map((n) => n.path), target)
    if (hit) open(hit)
    else void create(`${target.replace(/\.md$/i, '')}.md`)
  }

  const submitNew = (event: FormEvent): void => {
    event.preventDefault()
    const name = newName.trim().replace(/[\\:*?"<>|]/g, '')
    if (!name) return
    setNewName('')
    openLink(name)
  }

  const errorBar = error && (
    <p className="error" role="alert">
      {error} <button onClick={() => setError(null)}>Dismiss</button>
    </p>
  )

  if (loading) return <main className="space" />

  if (!vault) {
    return (
      <main className="space">
        <div className="core" aria-hidden="true" />
        <h1>Galaxy</h1>
        <p className="muted">Your notes, as a galaxy. Open a folder of Markdown notes to begin.</p>
        <button className="primary" onClick={pick}>
          Open vault folder
        </button>
        {errorBar}
      </main>
    )
  }

  const notesView = (
    <div className="app">
      <aside className="sidebar" aria-label="Notes">
        <header className="vault-name">
          <span title={vault.root}>{vault.root.split(/[\\/]/).filter(Boolean).pop()}</span>
          <button onClick={pick} disabled={agentBusy} title={agentBusy ? 'Wait for the agent to finish' : undefined}>
            Switch
          </button>
        </header>
        <input type="search" placeholder="Search notes" aria-label="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        <form onSubmit={submitNew}>
          <input placeholder="New note name, then Enter" aria-label="New note name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </form>
        <nav className="files">
          {query.trim() ? (
            results.length ? (
              results.map((r) => (
                <button key={r.path} className="hit" onClick={() => open(r.path)}>
                  <strong>{noteName(r.path)}</strong>
                  {r.line && <span>{r.line}</span>}
                </button>
              ))
            ) : (
              <p className="muted">No matches</p>
            )
          ) : notes.length ? (
            <Tree nodes={tree} current={current} onOpen={open} />
          ) : (
            <p className="muted">No notes yet. Type a name above to create one.</p>
          )}
        </nav>
      </aside>

      {/* Locked while the agent works, so its writes and your typing never collide. */}
      <main className="editor" inert={agentBusy}>
        {note ? (
          <>
            <h1 className="note-title">{noteName(note.path)}</h1>
            <Editor key={reloads} path={note.path} doc={note.content} onChange={edit} onOpenLink={openLink} />
          </>
        ) : (
          <p className="muted empty">Pick a note, or type a name on the left to create one.</p>
        )}
      </main>

      <aside className="backlinks" aria-label="Backlinks">
        <h2>Backlinks</h2>
        {note &&
          (links.length ? (
            links.map((l) => (
              <button key={l.path} className="hit" onClick={() => open(l.path)}>
                <strong>{noteName(l.path)}</strong>
                <span>{l.line}</span>
              </button>
            ))
          ) : (
            <p className="muted">No notes link here yet.</p>
          ))}
        <p className="hint">Ctrl+click a [[link]] to follow it.</p>
      </aside>
    </div>
  )

  return (
    <div className="shell">
      {view === 'galaxy' && <Galaxy key={vault.root} notes={notes} onOpenNote={open} onOpenDashboard={() => switchView('dashboard')} />}
      {view === 'dashboard' && <Dashboard notes={notes} onOpenNote={open} />}
      {view === 'notes' && notesView}
      {errorBar}
      <Agent hidden={!agentOpen} notes={notes} onClose={() => setAgentOpen(false)} onStart={agentStart} onDone={agentDone} />
      <nav className="views" aria-label="Views">
        {VIEWS.map(([id, label]) => (
          <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => switchView(id)}>
            <span className="dot" aria-hidden="true" />
            {label}
          </button>
        ))}
        <button className="agent-toggle" aria-pressed={agentOpen} onClick={() => setAgentOpen((o) => !o)}>
          {agentBusy ? 'Agent working…' : 'Agent'}
        </button>
      </nav>
    </div>
  )
}
