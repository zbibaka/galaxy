import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { constellationOf } from '../shared/galaxy'
import { noteName } from '../shared/links'
import type { AgentEvent, AgentResult, Filing, Vault } from '../shared/types'
import { claudeVersion, runAgent, stopAgent } from './agent'
import { approvalServer, type Decision, writeConcern } from './guard'
import { routeRequest, suggestFiling } from './jev'
import { snapshots } from './snapshot'
import { createNote, listNotes, moveNote, writeNote, writeNoteSync } from './vault'

// The open vault lives here, never in the page: the page only ever sends vault-relative paths.
let vaultRoot: string | null = null

type Settings = { lastVault?: string; jevKey?: string }
const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

async function readSettings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}

async function saveSettings(patch: Settings): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsFile(), JSON.stringify({ ...(await readSettings()), ...patch }), 'utf8')
}

async function openVault(root: string): Promise<Vault> {
  const notes = await listNotes(root)
  vaultRoot = root
  await saveSettings({ lastVault: root })
  return { root, notes }
}

// The Jev key is stored encrypted by the OS (safeStorage) and never leaves the main process.
async function jevKey(): Promise<string | null> {
  const { jevKey } = await readSettings()
  if (!jevKey) return null
  try {
    return safeStorage.decryptString(Buffer.from(jevKey, 'base64'))
  } catch {
    return null
  }
}

ipcMain.handle('jev:status', async () => (await jevKey()) !== null)
ipcMain.handle('jev:set-key', async (_event, key: unknown) => {
  if (key === null) return saveSettings({ jevKey: undefined })
  if (typeof key !== 'string' || !key.trim()) throw new Error('Paste a TypeSafe API key')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('This system cannot store the key securely')
  await saveSettings({ jevKey: safeStorage.encryptString(key.trim()).toString('base64') })
})

function requireVault(): string {
  if (!vaultRoot) throw new Error('No vault is open')
  return vaultRoot
}

ipcMain.handle('vault:last', async () => {
  const { lastVault } = await readSettings()
  if (!lastVault) return null
  const isDir = await stat(lastVault).then((s) => s.isDirectory(), () => false)
  return isDir ? openVault(lastVault) : null
})

ipcMain.handle('vault:pick', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const options: Electron.OpenDialogOptions = { title: 'Open vault folder', properties: ['openDirectory', 'createDirectory'] }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const root = result.filePaths[0]
  return result.canceled || !root ? null : openVault(root)
})

ipcMain.handle('note:create', (_event, path: unknown) => createNote(requireVault(), path))
ipcMain.handle('note:write', (_event, path: unknown, content: unknown) => writeNote(requireVault(), path, content))
ipcMain.on('note:write-sync', (event, path: unknown, content: unknown) => {
  try {
    writeNoteSync(requireVault(), path, content)
    event.returnValue = null
  } catch (error) {
    event.returnValue = String(error)
  }
})

// Agent runs: every run is wrapped in git snapshots (kept in app data, one repo per vault) so it can be undone,
// and logged to agent-log.jsonl so there is a record of everything the agent did.
const userFile = (...parts: string[]): string => join(app.getPath('userData'), ...parts)
const vaultSnapshots = (root: string) => snapshots(root, userFile('snapshots', createHash('sha1').update(root).digest('hex').slice(0, 16)))
const logAgent = (entry: object): Promise<void> => appendFile(userFile('agent-log.jsonl'), JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n')
let agentBusy = false
let lastRun: { root: string; before: string; after: string } | null = null

/** Runs `work` between two snapshots so it can be undone, logs it, and returns the reloaded vault. */
async function withSnapshots(root: string, label: string, log: object, work: () => Promise<void>): Promise<AgentResult> {
  if (agentBusy) throw new Error('The agent is already running')
  agentBusy = true
  try {
    const snap = vaultSnapshots(root)
    const before = await snap.take(`before ${label}`)
    let error: string | undefined
    try {
      await work()
    } catch (e) {
      error = (e as Error).message
    }
    // Snapshot even after a failure: some notes may have changed before it stopped.
    const after = await snap.take(`after ${label}`)
    const changed = await snap.changed(before, after)
    lastRun = changed.length ? { root, before, after } : null
    await logAgent({ vault: root, ...log, changed, error, before, after })
    return { changed, error, vault: await openVault(root) }
  } finally {
    agentBusy = false
  }
}

// Changes the guardrail paused, waiting for the user's Allow or Deny in the agent panel.
const pendingAsks = new Map<number, (allow: boolean) => void>()
let lastAsk = 0

ipcMain.handle('agent:status', () => claudeVersion())
ipcMain.on('agent:stop', () => stopAgent())
ipcMain.on('agent:decide', (_event, id: unknown, allow: unknown) => {
  pendingAsks.get(Number(id))?.(allow === true)
  pendingAsks.delete(Number(id))
})

ipcMain.handle('agent:run', async (event, prompt: unknown): Promise<AgentResult> => {
  const root = requireVault()
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Tell the agent what to do first')
  const send = (e: AgentEvent): void => {
    if (!event.sender.isDestroyed()) event.sender.send('agent:event', e)
  }
  const key = await jevKey()
  const log = { prompt, model: undefined as string | undefined, tools: [] as string[] }

  // The guardrail: Claude asks this before every write_note. Anything else is refused.
  const decide = async (tool: string, input: Record<string, unknown>): Promise<Decision> => {
    if (tool !== 'mcp__vault__write_note') return { behavior: 'deny', message: `${tool} is not allowed in Galaxy` }
    const concern = await writeConcern(root, prompt, input, key)
    if (!concern) return { behavior: 'allow', updatedInput: input }
    if (event.sender.isDestroyed()) return { behavior: 'deny', message: 'Nobody is there to approve this change' }
    const id = ++lastAsk
    log.tools.push(`asked: ${String(input['path'])} (${concern})`)
    const allowed = await new Promise<boolean>((done) => {
      pendingAsks.set(id, done)
      send({ kind: 'approve', id, text: `Replace ${String(input['path'])}? Jev paused this because ${concern}.` })
    })
    log.tools.push(`${allowed ? 'allowed' : 'denied'}: ${String(input['path'])}`)
    return allowed ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'The user declined this change. Do not try it again.' }
  }

  return withSnapshots(root, `agent: ${prompt.slice(0, 72)}`, log, async () => {
    if (key) {
      try {
        const route = await routeRequest(key, prompt)
        log.model = route.model
        send({ kind: 'tool', text: route.note })
      } catch (e) {
        send({ kind: 'tool', text: `Jev could not size this request (${(e as Error).message}), using your default model` })
      }
    }
    const approvals = await approvalServer(decide)
    try {
      await runAgent({
        root,
        prompt,
        workDir: userFile('agent'),
        mcpScript: join(__dirname, 'mcp.js'),
        approveEnv: approvals.env,
        model: log.model,
        onEvent: (e) => {
          if (e.kind === 'tool') log.tools.push(e.text)
          send(e)
        }
      })
    } finally {
      approvals.close()
      for (const done of pendingAsks.values()) done(false)
      pendingAsks.clear()
    }
  })
})

ipcMain.handle('jev:suggest', async (): Promise<Filing[]> => {
  const root = requireVault()
  const key = await jevKey()
  if (!key) throw new Error('Add a Jev API key first')
  const notes = await listNotes(root)
  const folders: Record<string, string[]> = {}
  for (const n of notes) if (n.path.includes('/')) (folders[constellationOf(n.path)] ??= []).push(noteName(n.path))
  if (!Object.keys(folders).length) throw new Error('Loose notes are filed into your constellations, which are top-level folders. Make one first.')
  // shortcut: looks at the first 40 loose notes per click; page through them if vaults have more.
  return suggestFiling(key, notes.filter((n) => !n.path.includes('/')).slice(0, 40), folders)
})

ipcMain.handle('jev:file', async (_event, moves: unknown): Promise<AgentResult> => {
  const root = requireVault()
  if (!Array.isArray(moves) || !moves.length) throw new Error('Pick notes to move first')
  const folders = new Set((await listNotes(root)).filter((n) => n.path.includes('/')).map((n) => constellationOf(n.path)))
  // Only loose notes, only into folders that already exist: the page cannot pick arbitrary paths.
  const plan = moves.map((m) => {
    const { path, folder } = (m ?? {}) as Record<string, unknown>
    if (typeof path !== 'string' || path.includes('/') || typeof folder !== 'string' || !folders.has(folder)) {
      throw new Error(`Cannot move ${String(path)} to ${String(folder)}`)
    }
    return [path, `${folder}/${path}`] as const
  })
  return withSnapshots(root, 'filing', { filed: plan.map(([from, to]) => `${from} -> ${to}`) }, async () => {
    for (const [from, to] of plan) await moveNote(root, from, to)
  })
})

ipcMain.handle('agent:undo', async (): Promise<AgentResult> => {
  const root = requireVault()
  if (agentBusy) throw new Error('Wait for the agent to finish first')
  if (!lastRun || lastRun.root !== root) throw new Error('Nothing to undo')
  const changed = await vaultSnapshots(root).undo(lastRun.before, lastRun.after)
  await logAgent({ vault: root, undo: lastRun.after, changed })
  lastRun = null
  return { changed, vault: await openVault(root) }
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Galaxy',
    backgroundColor: '#05060a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Links open in the user's browser, never inside the app, and only for web URLs.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
