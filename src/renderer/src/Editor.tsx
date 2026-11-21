import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { minimalSetup } from 'codemirror'
import { useEffect, useRef } from 'react'
import { linkAt } from '../../shared/links'

type Props = {
  path: string
  doc: string
  onChange: (text: string) => void
  onOpenLink: (target: string) => void
}

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'transparent', fontSize: '16px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.7' },
    '.cm-content': { maxWidth: '760px', margin: '0 auto', padding: '8px 32px 120px' }
  },
  { dark: true }
)

/** CodeMirror Markdown editor. Ctrl+click (Cmd+click on Mac) on a [[link]] follows it. */
export function Editor({ path, doc, onChange, onOpenLink }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Keep the latest callbacks without rebuilding the editor on every render.
  const callbacks = useRef({ onChange, onOpenLink })
  callbacks.current = { onChange, onOpenLink }

  useEffect(() => {
    view.current = new EditorView({ parent: host.current! })
    return () => view.current?.destroy()
  }, [])

  // A new note gets a fresh editor state (and undo history). `doc` is read only here on purpose:
  // after loading, the editor owns the text and reports changes up.
  useEffect(() => {
    view.current!.setState(
      EditorState.create({
        doc,
        extensions: [
          minimalSetup,
          markdown(),
          theme,
          oneDark,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Note text' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            mousedown(event, v) {
              if (!(event.ctrlKey || event.metaKey)) return false
              const pos = v.posAtCoords({ x: event.clientX, y: event.clientY })
              if (pos === null) return false
              const line = v.state.doc.lineAt(pos)
              const target = linkAt(line.text, pos - line.from)
              if (!target) return false
              event.preventDefault()
              callbacks.current.onOpenLink(target)
              return true
            }
          })
        ]
      })
    )
    view.current!.focus()
  }, [path])

  return <div className="cm-host" ref={host} />
}
