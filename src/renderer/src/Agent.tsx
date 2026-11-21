import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { AgentEvent, AgentResult } from '../../shared/types'

const api = window.galaxy

type Line = AgentEvent | { kind: 'you' | 'done'; text: string }

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
      add({ kind: 'error', text: (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
    } finally {
      setBusy(false)
      setRunning(false)
      onDone(result)
    }
    if (result) setCanUndo(label === 'Changed' && result.changed.length > 0)
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

  return (
    <aside className="agent" aria-label="Agent" hidden={hidden}>
      <header>
        <h2>Agent</h2>
        <button onClick={onClose} aria-label="Close agent panel">
          Close
        </button>
      </header>

      {version === null ? (
        <p className="muted">
          The agent uses Claude Code with your own Claude account. Install it from{' '}
          <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">
            claude.com/claude-code
          </a>
          , sign in once by running <code>claude</code> in a terminal, then reopen Galaxy.
        </p>
      ) : (
        <>
          <div className="agent-log" role="log" aria-live="polite" ref={log}>
            {lines.length ? (
              lines.map((l, i) => (
                <p key={i} className={`line ${l.kind}`}>
                  {l.text}
                </p>
              ))
            ) : (
              <p className="muted">
                Ask Claude to work on your notes, like "make a todo list from this week's notes". It can read, search and write notes
                in this vault, and nothing else on your PC. You can undo each run.
              </p>
            )}
            {running && <p className="line tool">Working…</p>}
          </div>
          <form onSubmit={run}>
            <textarea
              rows={3}
              placeholder="What should Claude do? Enter to run, Shift+Enter for a new line"
              aria-label="Agent request"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKey}
              disabled={busy || version === undefined}
            />
            <div className="agent-actions">
              {running ? (
                <button type="button" onClick={() => api.stopAgent()}>
                  Stop
                </button>
              ) : (
                <button className="primary" type="submit" disabled={busy || !prompt.trim() || version === undefined}>
                  Run
                </button>
              )}
              <button type="button" onClick={() => void act(api.undoAgent, 'Restored')} disabled={busy || !canUndo}>
                Undo last run
              </button>
            </div>
          </form>
        </>
      )}
    </aside>
  )
}
