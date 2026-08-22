import { clipboard, contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  windowAPI: {
    getRuntimeInfo: () => ipcRenderer.invoke('app:get-runtime-info'),
    getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
    getFullscreen: () => ipcRenderer.invoke('window:get-fullscreen'),
    setFullscreen: (enabled: boolean) => ipcRenderer.invoke('window:set-fullscreen', enabled),
    moveBy: (deltaX: number, deltaY: number) =>
      ipcRenderer.send('window:move-by', { deltaX, deltaY }),
  },
  projectAPI: {
    readClipboardText: () => clipboard.readText(),
    writeClipboardText: (text: string) => clipboard.writeText(text),
    revealFileInFolder: (path: string) => ipcRenderer.invoke('reveal-file-in-folder', { path }),
    openProxiesFolder: (projectPath: string | null) =>
      ipcRenderer.invoke('open-proxies-folder', { projectPath }),
    openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
    openProjectByPath: (path: string) =>
      ipcRenderer.invoke('open-project-by-path', { path }),
    saveProject: (payload: { projectData: unknown; path: string | null }) =>
      ipcRenderer.invoke('save-project', payload),
    saveProjectAs: (payload: { projectData: unknown; currentPath?: string | null }) =>
      ipcRenderer.invoke('save-project-as', payload),
    getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
    showUnsavedDialog: (opts?: { fileLabel?: string }) =>
      ipcRenderer.invoke('show-unsaved-dialog', opts ?? {}),
    confirmCloseWindow: () => ipcRenderer.invoke('window:confirm-close'),
    resolveImageSource: (path: string) =>
      ipcRenderer.invoke('resolve-image-source', path),
    resolveVideoSource: (
      path: string,
      options?: { projectPath?: string | null; existingProxyPath?: string | null; generateProxy?: boolean },
    ) =>
      ipcRenderer.invoke('resolve-video-source', { path, ...(options ?? {}) }),
    generateVideoProxies: (payload: { paths: string[]; projectPath?: string | null }) =>
      ipcRenderer.invoke('generate-video-proxies', payload),
    inspectVideoSources: (payload: { paths: string[]; projectPath?: string | null }) =>
      ipcRenderer.invoke('inspect-video-sources', payload),
    confirmGenerateProxies: (payload: { count: number; unsavedProject: boolean }) =>
      ipcRenderer.invoke('confirm-generate-proxies', payload),
    pickFolderDialog: () => ipcRenderer.invoke('pick-folder-dialog'),
    enumerateFolderMedia: (folderPath: string) =>
      ipcRenderer.invoke('enumerate-folder-media', folderPath),
    duplicateMediaImportDialog: (payload: { count: number }) =>
      ipcRenderer.invoke('duplicate-media-import-dialog', payload),
    scanDailies: (payload: { year: string; project: string; scene: string; priorities: string[] }) =>
      ipcRenderer.invoke('scan-dailies', payload),
    getDailiesYears: () => ipcRenderer.invoke('dailies:get-years'),
    getDailiesProjects: (year: string) => ipcRenderer.invoke('dailies:get-projects', { year }),
    getDailiesScenes: (year: string, project: string) => ipcRenderer.invoke('dailies:get-scenes', { year, project }),
    scanPrm: (payload: { year: string; project: string; scene: string; priorities: string[] }) =>
      ipcRenderer.invoke('scan-prm', payload),
    getPrmYears: () => ipcRenderer.invoke('prm:get-years'),
    getPrmProjects: (year: string) => ipcRenderer.invoke('prm:get-projects', { year }),
    getPrmScenes: (year: string, project: string) => ipcRenderer.invoke('prm:get-scenes', { year, project }),
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

ipcRenderer.on('app:open-settings', () => {
  window.dispatchEvent(new CustomEvent('app-open-settings'))
})

ipcRenderer.on('app:request-unsaved-close', (_event, payload: { fileLabel?: string }) => {
  window.dispatchEvent(
    new CustomEvent('app-request-unsaved-close', {
      detail: payload ?? {},
    }),
  )
})

ipcRenderer.on('window:always-on-top-changed', (_event, payload: { value: boolean }) => {
  window.dispatchEvent(
    new CustomEvent('previewv-always-on-top', {
      detail: payload,
    }),
  )
})

ipcRenderer.on('window:fullscreen-changed', (_event, payload: { value: boolean }) => {
  window.dispatchEvent(
    new CustomEvent('previewv-fullscreen-changed', {
      detail: payload,
    }),
  )
})

ipcRenderer.on(
  'video-proxy-progress',
  (
    _event,
    payload: { stage: 'start' | 'progress' | 'done'; completed: number; total: number; line: string },
  ) => {
    window.dispatchEvent(
      new CustomEvent('video-proxy-progress', {
        detail: payload,
      }),
    )
  },
)

// Open a project by file path (Windows double click / file association)
ipcRenderer.on('app-open-project-by-path', (_event, payload: { path: string }) => {
  ;(window as any).__previewvPendingProjectPath = payload.path
  window.dispatchEvent(
    new CustomEvent('app-open-project-by-path', {
      detail: payload,
    }),
  )
})
