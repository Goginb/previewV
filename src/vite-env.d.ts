/// <reference types="vite/client" />

/** Синхронизация с main для диалога закрытия окна */
interface PreviewVProjectState {
  dirty: boolean
  path: string | null
}

interface Window {
  __previewvProjectState?: PreviewVProjectState
  __previewvPendingProjectPath?: string | undefined
  __previewvAutosaveSnapshot?: (() => { projectData: unknown; path: string | null } | null) | undefined
  electronAPI?: {
    platform: string
    projectAPI: import('./electron-api').ElectronProjectAPI
    windowAPI?: import('./electron-api').ElectronWindowAPI
  }
}
