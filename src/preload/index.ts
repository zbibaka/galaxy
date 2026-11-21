import { contextBridge, ipcRenderer } from 'electron'
import type { GalaxyApi } from '../shared/types'

const api: GalaxyApi = {
  lastVault: () => ipcRenderer.invoke('vault:last'),
  pickVault: () => ipcRenderer.invoke('vault:pick'),
  createNote: (path) => ipcRenderer.invoke('note:create', path),
  writeNote: (path, content) => ipcRenderer.invoke('note:write', path, content),
  writeNoteSync: (path, content) => {
    const error: string | null = ipcRenderer.sendSync('note:write-sync', path, content)
    if (error) throw new Error(error)
  }
}

contextBridge.exposeInMainWorld('galaxy', api)
