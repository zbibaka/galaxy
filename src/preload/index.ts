import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, GalaxyApi, Vault } from '../shared/types'

const api: GalaxyApi = {
  lastVault: () => ipcRenderer.invoke('vault:last'),
  pickVault: () => ipcRenderer.invoke('vault:pick'),
  createNote: (path) => ipcRenderer.invoke('note:create', path),
  writeNote: (path, content) => ipcRenderer.invoke('note:write', path, content),
  writeNoteSync: (path, content) => {
    const error: string | null = ipcRenderer.sendSync('note:write-sync', path, content)
    if (error) throw new Error(error)
  },
  agentStatus: () => ipcRenderer.invoke('agent:status'),
  runAgent: (prompt) => ipcRenderer.invoke('agent:run', prompt),
  stopAgent: () => ipcRenderer.send('agent:stop'),
  undoAgent: () => ipcRenderer.invoke('agent:undo'),
  onAgentEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, e: AgentEvent): void => callback(e)
    ipcRenderer.on('agent:event', listener)
    return () => ipcRenderer.removeListener('agent:event', listener)
  },
  decideAgent: (id, allow) => ipcRenderer.send('agent:decide', id, allow),
  jevStatus: () => ipcRenderer.invoke('jev:status'),
  setJevKey: (key) => ipcRenderer.invoke('jev:set-key', key),
  suggestFiling: () => ipcRenderer.invoke('jev:suggest'),
  fileNotes: (moves) => ipcRenderer.invoke('jev:file', moves),
  n8nStatus: () => ipcRenderer.invoke('n8n:status'),
  connectN8n: (url, token) => ipcRenderer.invoke('n8n:connect', url, token),
  shareVault: (on) => ipcRenderer.invoke('n8n:share', on),
  onVaultChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, vault: Vault): void => callback(vault)
    ipcRenderer.on('vault:changed', listener)
    return () => ipcRenderer.removeListener('vault:changed', listener)
  }
}

contextBridge.exposeInMainWorld('galaxy', api)
