import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  projectAPI: {
    openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
    openProjectByPath: (path: string) =>
      ipcRenderer.invoke('open-project-by-path', { path }),
    saveProject: (payload: { projectData: unknown; path: string | null }) =>
      ipcRenderer.invoke('save-project', payload),
    saveProjectAs: (payload: { projectData: unknown }) =>
      ipcRenderer.invoke('save-project-as', payload),
    getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
    showUnsavedDialog: (opts?: { fileLabel?: string }) =>
      ipcRenderer.invoke('show-unsaved-dialog', opts ?? {}),
    confirmCloseWindow: () => ipcRenderer.invoke('window:confirm-close'),
  },
})

// Menu actions: main process sends IPC -> preload dispatches DOM event.
ipcRenderer.on('project:menu-action', (_event, payload) => {
  window.dispatchEvent(
    new CustomEvent('project-menu-action', {
      detail: payload,
    }),
  )
})

ipcRenderer.on('app:edit-command', (_event, payload: { command: string }) => {
  window.dispatchEvent(
    new CustomEvent('app-edit-command', {
      detail: payload,
    }),
  )
})

ipcRenderer.on('app:show-help', () => {
  window.dispatchEvent(new CustomEvent('app-show-help'))
})

// Open a project by file path (Windows double click / file association)
ipcRenderer.on('app-open-project-by-path', (_event, payload: { path: string }) => {
  ;(window as any).__previewvPendingProjectPath = payload.path
  window.dispatchEvent(
    new CustomEvent('app-open-project-by-path', {
      detail: payload,
    }),
  )
})
