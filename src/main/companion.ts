import { BrowserWindow, desktopCapturer, screen } from 'electron'
import { join } from 'node:path'
import type { CompanionState } from '../shared/types'
import { askClaude } from './agent'
import { GUIDE_SYSTEM, guidePrompt, parseGuide } from './guide'

// Windows Galaxy never looks at: if one is open anywhere, guide mode refuses to take a screenshot.
const SENSITIVE = /1password|bitwarden|lastpass|keepass|dashlane|keeper|enpass|proton pass|password|bank|paypal|wallet|coinbase|binance|kraken/i
const MAX_WIDTH = 1280

let overlay: BrowserWindow | null = null
let state: CompanionState = { listening: false, guide: null }
let guide: { goal: string; steps: string[] } | null = null

/** The floating companion: a transparent, always-on-top window over the main display that clicks pass through. */
function ensureOverlay(): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) return overlay
  const { bounds } = screen.getPrimaryDisplay()
  overlay = new BrowserWindow({
    ...bounds,
    title: 'Galaxy companion',
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setIgnoreMouseEvents(true, { forward: true })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void overlay.loadURL(`${devUrl}#companion`)
  else void overlay.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'companion' })
  overlay.webContents.once('did-finish-load', () => overlay?.webContents.send('companion:state', state))
  return overlay
}

function update(next: Partial<CompanionState>): void {
  state = { ...state, ...next }
  // Back to click-through on every change, so the full-screen overlay can never be left swallowing clicks.
  overlay?.setIgnoreMouseEvents(true, { forward: true })
  if (!state.listening && !state.guide) {
    overlay?.hide()
    return
  }
  const win = ensureOverlay()
  if (!win.webContents.isLoading()) win.webContents.send('companion:state', state)
  win.showInactive()
}

/** Lets the overlay's buttons take clicks while the mouse is over them; everywhere else clicks pass through. */
export function setOverlayInteractive(on: boolean): void {
  overlay?.setIgnoreMouseEvents(!on, { forward: true })
}

export const setListening = (on: boolean): void => update({ listening: on })

/** Takes one screenshot of the main display, scaled down, unless a sensitive window is open. Kept in memory only. */
async function capture(): Promise<{ png: Buffer; width: number; height: number; scale: number }> {
  const windows = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
  const risky = windows.find((w) => SENSITIVE.test(w.name))
  if (risky) throw new Error(`"${risky.name}" is open. Galaxy never looks at your screen while a password manager or banking window is open.`)
  const display = screen.getPrimaryDisplay()
  const scale = Math.min(1, MAX_WIDTH / display.size.width)
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) }
  })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source) throw new Error('Could not see the screen')
  const { width, height } = source.thumbnail.getSize()
  return { png: source.thumbnail.toPNG(), width, height, scale: width / display.size.width }
}

/** Looks at the screen and asks Claude for the next step; the overlay shows an arrow and the instruction. */
export async function nextGuideStep(workDir: string): Promise<void> {
  if (!guide) return
  update({ guide: { mode: 'looking' } })
  overlay?.hide() // keep the previous arrow out of the screenshot
  await new Promise((r) => setTimeout(r, 250))
  try {
    const shot = await capture()
    if (!guide) return
    update({ guide: { mode: 'thinking' } })
    const answer = await askClaude(
      [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: shot.png.toString('base64') } },
        { type: 'text', text: guidePrompt(guide.goal, guide.steps, shot.width, shot.height) }
      ],
      GUIDE_SYSTEM,
      workDir
    )
    if (!guide) return
    const step = parseGuide(answer, shot.width, shot.height)
    guide.steps.push(step.say)
    update({ guide: step.done ? { mode: 'done', say: step.say } : { mode: 'step', say: step.say, x: step.x / shot.scale, y: step.y / shot.scale } })
  } catch (error) {
    if (guide) update({ guide: { mode: 'error', say: (error as Error).message } })
  }
}

export function startGuide(goal: string): void {
  guide = { goal, steps: [] }
}

export function stopGuide(): void {
  guide = null
  update({ guide: null })
}
