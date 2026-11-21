import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentResult, Vault } from '../shared/types'
import { claudeVersion, runAgent, stopAgent } from './agent'
import { snapshots } from './snapshot'
import { createNote, listNotes, writeNote, writeNoteSync } from './vault'

// The open vault lives here, never in the page: the page only ever sends vault-relative paths.
let vaultRoot: string | null = null

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

async function readSettings(): Promise<{ lastVault?: string }> {
  try {
    return JSON.parse(await readFile(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}

async function openVault(root: string): Promise<Vault> {
  const notes = await listNotes(root)
  vaultRoot = root
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsFile(), JSON.stringify({ lastVault: root }), 'utf8')
  return { root, notes }
}

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

ipcMain.handle('agent:status', () => claudeVersion())
ipcMain.on('agent:stop', () => stopAgent())

ipcMain.handle('agent:run', async (event, prompt: unknown): Promise<AgentResult> => {
  const root = requireVault()
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Tell the agent what to do first')
  if (agentBusy) throw new Error('The agent is already running')
  agentBusy = true
  try {
    const snap = vaultSnapshots(root)
    const before = await snap.take(`before agent: ${prompt.slice(0, 72)}`)
    const tools: string[] = []
    let error: string | undefined
    try {
      await runAgent({
        root,
        prompt,
        workDir: userFile('agent'),
        mcpScript: join(__dirname, 'mcp.js'),
        onEvent: (e) => {
          if (e.kind === 'tool') tools.push(e.text)
          if (!event.sender.isDestroyed()) event.sender.send('agent:event', e)
        }
      })
    } catch (e) {
      error = (e as Error).message
    }
    // Snapshot even after a failure: the agent may have written some notes before it stopped.
    const after = await snap.take('after agent')
    const changed = await snap.changed(before, after)
    lastRun = changed.length ? { root, before, after } : null
    await logAgent({ vault: root, prompt, tools, changed, error, before, after })
    return { changed, error, vault: await openVault(root) }
  } finally {
    agentBusy = false
  }
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
