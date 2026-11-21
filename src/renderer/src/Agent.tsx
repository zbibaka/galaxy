import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { noteName } from '../../shared/links'
import { findRoutines, type Routine } from '../../shared/routines'
import type { AgentEvent, AgentResult, Filing, N8nStatus, Note } from '../../shared/types'

const api = window.galaxy

type Line = AgentEvent | { kind: 'you' | 'done'; text: string }

/** Electron wraps errors from the main process; show only the message. */
const errorText = (e: unknown): string => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

type Props = {
  hidden: boolean
  notes: Note[]
  onClose: () => void
  /** Saves pending typing and locks the editor before the agent touches notes. */
  onStart: () => Promise<void>
  /** Unlocks the editor and loads the vault as the agent left it. */
  onDone: (result?: AgentResult) => void
}

/** Ask Claude to work on the vault. Runs only when the user presses Run; each run can be undone. */
export function Agent({ hidden, notes, onClose, onStart, onDone }: Props) {
  const [version, setVersion] = useState<string | null | undefined>(undefined)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [decided, setDecided] = useState<Record<number, string>>({})
  const add = (...more: Line[]): void => setLines((l) => [...l, ...more])
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  // Fills in a suggested request for the user to read, edit and run.
  const suggest = (text: string): void => {
    setPrompt(text)
    input.current?.focus()
  }

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
            ref={input}
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
      {version !== null && <N8n notes={notes} onSuggest={suggest} />}
    </aside>
  )
}

const STARTERS: [string, string][] = [
  ['Daily note', 'Build an n8n workflow that creates today\'s daily note every morning at 8:00, named YYYY-MM-DD in a "Daily" folder, with the headings Plan, Notes and Done.'],
  ['Weekly review', 'Build an n8n workflow that creates a "Weekly review YYYY-MM-DD" note every Friday at 17:00 with the headings Wins, Lessons and Next week.'],
  ['Inbox by webhook', 'Build an n8n workflow with a webhook that adds any text it receives as a new line at the end of Inbox.md.']
]

function routinePrompt(r: Routine): string {
  const when = r.cadence === 'daily' ? 'every morning at 8:00' : `every ${r.weekday} at 8:00`
  return `Build an n8n workflow that creates the next "${r.name}" note ${when} in ${r.folder ? `the "${r.folder}" folder` : 'the vault root'}, named like "${noteName(r.example)}" with that day's date. Read "${r.example}" first and reuse its headings.`
}

/** Optional n8n connection: routines worth automating, starter automations, and sharing the vault with n8n. */
function N8n({ notes, onSuggest }: { notes: Note[]; onSuggest: (text: string) => void }) {
  const [status, setStatus] = useState<N8nStatus | null>(null)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const routines = useMemo(() => findRoutines(notes), [notes])

  useEffect(() => {
    api.n8nStatus().then(setStatus, (e) => setError(errorText(e)))
  }, [])

  const attempt = (work: Promise<N8nStatus>): void => {
    setError(null)
    work.then(setStatus, (e) => setError(errorText(e)))
  }

  const connect = (event: FormEvent): void => {
    event.preventDefault()
    attempt(api.connectN8n(url, token).then((s) => (setToken(''), s)))
  }

  return (
    <details className="jev">
      <summary>n8n {status?.url ? 'is connected' : '(optional)'}</summary>
      {status?.url ? (
        <>
          <p className="muted">Claude can build n8n workflows for you. They stay switched off until you review and publish them in n8n.</p>
          {routines.length > 0 && <p>Routines in your notes:</p>}
          {routines.slice(0, 3).map((r) => (
            <button key={r.example} className="suggestion" onClick={() => onSuggest(routinePrompt(r))}>
              Automate "{r.name}" {r.cadence === 'daily' ? 'every day' : `every ${r.weekday}`} ({r.count} so far)
            </button>
          ))}
          <p>Starter automations:</p>
          <div className="agent-actions wrap">
            {STARTERS.map(([label, text]) => (
              <button key={label} onClick={() => onSuggest(text)}>
                {label}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={status.shareOn} onChange={(e) => attempt(api.shareVault(e.target.checked))} />
            Let n8n read and write this vault
          </label>
          {status.shareOn && status.shareToken && (
            <div className="share">
              <p className="muted">
                In n8n, add a Bearer Auth credential named "Galaxy vault" with this token. n8n reaches the vault at {status.shareUrl}, or
                at host.docker.internal instead of 127.0.0.1 if n8n runs in Docker.
              </p>
              <input readOnly value={status.shareToken} aria-label="Token for n8n" onFocus={(e) => e.target.select()} />
            </div>
          )}
          <div className="agent-actions">
            <button onClick={() => attempt(api.connectN8n(null))}>Disconnect</button>
          </div>
        </>
      ) : (
        status && (
          <form onSubmit={connect}>
            <p className="muted">
              Use your own n8n (Galaxy does not include it). In n8n, open Settings, then Instance-level MCP, turn on MCP access, and copy
              the server URL and an access token.
            </p>
            <input placeholder="n8n MCP URL, ending in /mcp-server/http" aria-label="n8n MCP URL" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input type="password" autoComplete="off" placeholder="n8n MCP access token" aria-label="n8n MCP access token" value={token} onChange={(e) => setToken(e.target.value)} />
            <div className="agent-actions">
              <button className="primary" type="submit" disabled={!url.trim() || !token.trim()}>
                Connect n8n
              </button>
            </div>
          </form>
        )
      )}
      {error && <p className="line error">{error}</p>}
    </details>
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
