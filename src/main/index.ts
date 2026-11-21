import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Vault } from '../shared/types'
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
