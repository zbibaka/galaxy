import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, GalaxyApi } from '../shared/types'

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
  onVaultChanged: (callback) => listen('vault:changed', callback),
  transcribe: (audio) => ipcRenderer.invoke('speech:transcribe', audio),
  saveVoiceNote: (text) => ipcRenderer.invoke('voice:save', text),
  setListening: (on) => ipcRenderer.send('companion:listening', on),
  onTalkToggle: (callback) => listen('talk:toggle', callback),
  startGuide: (goal) => ipcRenderer.invoke('guide:start', goal),
  nextGuide: () => ipcRenderer.invoke('guide:next'),
  stopGuide: () => ipcRenderer.send('guide:stop'),
  setOverlayInteractive: (on) => ipcRenderer.send('companion:interactive', on),
  onCompanion: (callback) => listen('companion:state', callback)
}

/** Subscribes to a main-process event; returns the unsubscribe function. */
function listen<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('galaxy', api)
