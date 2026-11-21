import { useEffect, useState } from 'react'
import type { CompanionState } from '../../shared/types'

const api = window.galaxy

/**
 * The floating companion, drawn in a transparent window over the whole screen. Clicks pass through it,
 * except on its own buttons. It only points: it never clicks or types anywhere.
 */
export function Companion() {
  const [state, setState] = useState<CompanionState>({ listening: false, guide: null })
  useEffect(() => api.onCompanion(setState), [])
  const g = state.guide
  const working = g?.mode === 'looking' || g?.mode === 'thinking'
  // While the mouse is over the pill its buttons take clicks; everywhere else clicks go to the apps below.
  const hover = { onMouseEnter: () => api.setOverlayInteractive(true), onMouseLeave: () => api.setOverlayInteractive(false) }

  return (
    <div className="companion">
      <div className="pill" role="status" aria-live="polite" {...hover}>
        {state.listening && (
          <span className="rec">
            <span className="rec-dot" aria-hidden="true" /> Listening. Press Ctrl+Shift+Space again to stop
          </span>
        )}
        {g && (
          <>
            <span className={g.mode === 'error' ? 'error-text' : undefined}>
              {g.mode === 'looking'
                ? 'Looking at your screen…'
                : g.mode === 'thinking'
                  ? 'Working out the next step…'
                  : g.mode === 'step'
                    ? 'Do the step by the ring, then press Next'
                    : g.say}
            </span>
            {g.mode !== 'done' && (
              <button onClick={() => void api.nextGuide()} disabled={working}>
                {g.mode === 'error' ? 'Try again' : 'Next'}
              </button>
            )}
            <button onClick={() => api.stopGuide()}>{g.mode === 'done' ? 'Close' : 'Stop'}</button>
          </>
        )}
      </div>
      {g?.mode === 'step' && (
        <div className="pointer" style={{ left: g.x, top: g.y }}>
          <div className="ring" aria-hidden="true" />
          <p className={`bubble${g.x > window.innerWidth - 340 ? ' left' : ''}`}>{g.say}</p>
        </div>
      )}
    </div>
  )
}
