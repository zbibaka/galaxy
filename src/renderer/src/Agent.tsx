import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { AgentEvent, AgentResult, Filing } from '../../shared/types'

const api = window.galaxy

type Line = AgentEvent | { kind: 'you' | 'done'; text: string }

/** Electron wraps errors from the main process; show only the message. */
const errorText = (e: unknown): string => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

type Props = {
  hidden: boolean
  onClose: () => void
  /** Saves pending typing and locks the editor before the agent touches notes. */
  onStart: () => Promise<void>
  /** Unlocks the editor and loads the vault as the agent left it. */
  onDone: (result?: AgentResult) => void
}

/** Ask Claude to work on the vault. Runs only when the user presses Run; each run can be undone. */
export function Agent({ hidden, onClose, onStart, onDone }: Props) {
  const [version, setVersion] = useState<string | null | undefined>(undefined)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [decided, setDecided] = useState<Record<number, string>>({})
  const add = (...more: Line[]): void => setLines((l) => [...l, ...more])
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.agentStatus().then(setVersion, () => setVersion(null))
    return api.onAgentEvent((e) => add(e))
  }, [])

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [lines.length, running])

  const act = async (work: () => Promise<AgentResult>, label: string): Promise<void> => {
    setBusy(true)
    let result: AgentResult | undefined
    try {
      await onStart()
      result = await work()
      if (result.error) add({ kind: 'error', text: result.error })
      add({ kind: 'done', text: result.changed.length ? `${label}: ${result.changed.join(', ')}` : 'No notes changed' })
    } catch (e) {
      add({ kind: 'error', text: errorText(e) })
    } finally {
      setBusy(false)
      setRunning(false)
      onDone(result)
    }
    if (result) setCanUndo(label !== 'Restored' && result.changed.length > 0)
  }

  const run = (event?: FormEvent): void => {
    event?.preventDefault()
    const text = prompt.trim()
    if (!text || busy) return
    setPrompt('')
    setRunning(true)
    add({ kind: 'you', text })
    void act(() => api.runAgent(text), 'Changed')
  }

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) run(event)
  }

  const decide = (id: number, allow: boolean): void => {
    api.decideAgent(id, allow)
    setDecided((d) => ({ ...d, [id]: allow ? 'Allowed' : 'Denied' }))
  }

  return (
    <aside className="agent" aria-label="Agent" hidden={hidden}>
      <header>
        <h2>Agent</h2>
        <button onClick={onClose} aria-label="Close agent panel">
          Close
        </button>
      </header>

      <div className="agent-log" role="log" aria-live="polite" ref={log}>
        {lines.length ? (
          lines.map((l, i) =>
            l.kind === 'approve' ? (
              <div key={i} className="line approve">
                <p>{l.text}</p>
                {decided[l.id] ? (
                  <p className="muted">{decided[l.id]}</p>
                ) : running ? (
                  <div className="agent-actions">
                    <button className="primary" onClick={() => decide(l.id, true)}>
                      Allow
                    </button>
                    <button onClick={() => decide(l.id, false)}>Deny</button>
                  </div>
                ) : (
                  <p className="muted">Not answered, so it was skipped</p>
                )}
              </div>
            ) : (
              <p key={i} className={`line ${l.kind}`}>
                {l.text}
              </p>
            )
          )
        ) : version === null ? (
          <p className="muted">
            The agent uses Claude Code with your own Claude account. Install it from{' '}
            <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">
              claude.com/claude-code
            </a>
            , sign in once by running <code>claude</code> in a terminal, then reopen Galaxy.
          </p>
        ) : (
          <p className="muted">
            Ask Claude to work on your notes, like "make a todo list from this week's notes". It can read, search and write notes in
            this vault, and nothing else on your PC. You can undo each run.
          </p>
        )}
        {running && <p className="line tool">Working…</p>}
      </div>

      <form onSubmit={run}>
        {version !== null && (
          <textarea
            rows={3}
            placeholder="What should Claude do? Enter to run, Shift+Enter for a new line"
            aria-label="Agent request"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKey}
            disabled={busy || version === undefined}
          />
        )}
        <div className="agent-actions">
          {running ? (
            <button type="button" onClick={() => api.stopAgent()}>
              Stop
            </button>
          ) : (
            version !== null && (
              <button className="primary" type="submit" disabled={busy || !prompt.trim() || version === undefined}>
                Run
              </button>
            )
          )}
          <button type="button" onClick={() => void act(api.undoAgent, 'Restored')} disabled={busy || !canUndo}>
            Undo last change
          </button>
        </div>
      </form>

      <Jev busy={busy} onMove={(moves) => act(() => api.fileNotes(moves), 'Moved')} />
    </aside>
  )
}

/** Optional Jev key, and filing loose notes into constellations. */
function Jev({ busy, onMove }: { busy: boolean; onMove: (moves: Filing[]) => Promise<void> }) {
  const [on, setOn] = useState<boolean | undefined>(undefined)
  const [key, setKey] = useState('')
  const [asking, setAsking] = useState(false)
  const [suggestions, setSuggestions] = useState<Filing[] | null>(null)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.jevStatus().then(setOn, () => setOn(false))
  }, [])

  const attempt = async (work: () => Promise<void>): Promise<void> => {
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const save = (event: FormEvent): void => {
    event.preventDefault()
    void attempt(async () => {
      await api.setJevKey(key)
      setKey('')
      setOn(true)
    })
  }

  const remove = (): void =>
    void attempt(async () => {
      await api.setJevKey(null)
      setOn(false)
      setSuggestions(null)
    })

  const suggest = (): void => {
    setAsking(true)
    void attempt(async () => {
      setSuggestions(await api.suggestFiling())
      setSkipped(new Set())
    }).finally(() => setAsking(false))
  }

  const toggle = (path: string): void =>
    setSkipped((s) => {
      const next = new Set(s)
      if (!next.delete(path)) next.add(path)
      return next
    })

  const picked = suggestions?.filter((s) => !skipped.has(s.path)) ?? []
  const move = (event: FormEvent): void => {
    event.preventDefault()
    setSuggestions(null)
    void onMove(picked)
  }

  return (
    <details className="jev">
      <summary>Jev {on ? 'is on' : '(optional)'}</summary>
      {on ? (
        <>
          <p className="muted">
            Jev picks a fast model for small jobs, pauses risky changes to existing notes for your OK, and files loose notes into
            constellations.
          </p>
          {suggestions &&
            (suggestions.length ? (
              <form onSubmit={move} className="filing">
                {suggestions.map((s) => (
                  <label key={s.path}>
                    <input type="checkbox" checked={!skipped.has(s.path)} onChange={() => toggle(s.path)} />
                    {s.path.replace(/\.md$/i, '')} → {s.folder} <span className="muted">({Math.round(s.confidence * 100)}%)</span>
                  </label>
                ))}
                <div className="agent-actions">
                  <button className="primary" type="submit" disabled={busy || !picked.length}>
                    Move {picked.length}
                  </button>
                  <button type="button" onClick={() => setSuggestions(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="muted">Jev is not sure where any loose note belongs, so nothing needs moving.</p>
            ))}
          <div className="agent-actions">
            <button onClick={suggest} disabled={busy || asking}>
              {asking ? 'Asking Jev…' : 'File loose notes'}
            </button>
            <button onClick={remove}>Remove key</button>
          </div>
        </>
      ) : (
        on === false && (
          <form onSubmit={save}>
            <p className="muted">
              Jev by TypeSafe makes fast, cheap decisions for the agent. It needs your own API key from{' '}
              <a href="https://typesafe.ai" target="_blank" rel="noreferrer">
                typesafe.ai
              </a>
              . The key is encrypted on this computer.
            </p>
            <input type="password" autoComplete="off" placeholder="TypeSafe API key" aria-label="TypeSafe API key" value={key} onChange={(e) => setKey(e.target.value)} />
            <div className="agent-actions">
              <button className="primary" type="submit" disabled={!key.trim()}>
                Turn on Jev
              </button>
            </div>
          </form>
        )
      )}
      {error && <p className="line error">{error}</p>}
    </details>
  )
}
