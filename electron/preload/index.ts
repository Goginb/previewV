import { contextBridge } from 'electron'

// Minimal API surface — extend here as features grow (IPC, fs access, etc.)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
})
