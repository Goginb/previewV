import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  windowAPI: {
    getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
  },
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
    resolveImageSource: (path: string) =>
      ipcRenderer.invoke('resolve-image-source', path),
    pickFolderDialog: () => ipcRenderer.invoke('pick-folder-dialog'),
    enumerateFolderMedia: (folderPath: string) =>
      ipcRenderer.invoke('enumerate-folder-media', folderPath),
    duplicateMediaImportDialog: (payload: { count: number }) =>
      ipcRenderer.invoke('duplicate-media-import-dialog', payload),
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

ipcRenderer.on('window:always-on-top-changed', (_event, payload: { value: boolean }) => {
  window.dispatchEvent(
    new CustomEvent('previewv-always-on-top', {
      detail: payload,
    }),
  )
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
