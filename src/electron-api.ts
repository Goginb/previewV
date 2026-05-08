import type { ImageStorage } from './types'
import type { DeserializedProject } from './types/project'

/** Window-level helpers from main (always-on-top, etc.). */
export interface ElectronWindowAPI {
  getRuntimeInfo: () => Promise<AppRuntimeInfo>
  getAlwaysOnTop: () => Promise<boolean>
}

export interface AppRuntimeInfo {
  version: string
  isPackaged: boolean
  installDirectory: string | null
  versionMarkerPath: string | null
}

export interface EstimatingLaunchContext {
  helperBaseUrl: string
  sessionId: string
  selectedShotId: string
  saveDirectory: string
  linkedProjectPath: string
  writableTaskKeys: string[]
  language: 'en' | 'ru'
}

export interface ElectronIntegrationAPI {
  getEstimatingLaunchContext: () => Promise<EstimatingLaunchContext | null>
}

/** Типы API, проброшенные из electron/preload (см. contextBridge). */
export interface ElectronProjectAPI {
  readClipboardText: () => string
  writeClipboardText: (text: string) => void
  revealFileInFolder: (path: string) => Promise<boolean>
  /** Opens `Prores_proxy_temp` next to the project, or on the Desktop if the project is unsaved. */
  openProxiesFolder: (projectPath: string | null) => Promise<boolean>
  openProjectDialog: () => Promise<{ path: string; project: DeserializedProject } | null>
  openProjectByPath: (path: string) => Promise<{ path: string; project: DeserializedProject } | null>
  saveProject: (payload: {
    projectData: unknown
    path: string | null
  }) => Promise<{ path: string; project: DeserializedProject } | null>
  saveProjectAs: (payload: {
    projectData: unknown
    currentPath?: string | null
  }) => Promise<{ path: string; project: DeserializedProject } | null>
  getRecentProjects: () => Promise<string[]>
  showUnsavedDialog: (opts?: { fileLabel?: string }) => Promise<'save' | 'discard' | 'cancel'>
  confirmCloseWindow: () => Promise<void>
  resolveImageSource: (path: string) => Promise<ResolvedImageImport>
  resolveVideoSource: (
    path: string,
    options?: { projectPath?: string | null; existingProxyPath?: string | null; generateProxy?: boolean },
  ) => Promise<ResolvedVideoImport>
  generateVideoProxies: (payload: {
    paths: string[]
    projectPath?: string | null
  }) => Promise<Array<{ path: string; resolved: ResolvedVideoImport }>>
  inspectVideoSources: (payload: {
    paths: string[]
    projectPath?: string | null
  }) => Promise<Array<{ path: string; isProres: boolean; isMjpeg: boolean; hasProxy: boolean }>>
  confirmGenerateProxies: (payload: { count: number; unsavedProject: boolean }) => Promise<boolean>
  pickFolderDialog: () => Promise<string | null>
  enumerateFolderMedia: (folderPath: string) => Promise<string[]>
  duplicateMediaImportDialog: (payload: {
    count: number
  }) => Promise<'add' | 'skip' | 'cancel'>
  scanDailies: (payload: {
    year: string
    project: string
    scene: string
    priorities: string[]
    lastVersionOnly?: boolean
  }) => Promise<string[]>
  getDailiesYears: () => Promise<string[]>
  getDailiesProjects: (year: string) => Promise<string[]>
  getDailiesScenes: (year: string, project: string) => Promise<string[]>
  scanPrm: (payload: {
    year: string
    project: string
    scene: string
    priorities: string[]
  }) => Promise<string[]>
  getPrmYears: () => Promise<string[]>
  getPrmProjects: (year: string) => Promise<string[]>
  getPrmScenes: (year: string, project: string) => Promise<string[]>
}

export interface ResolvedImageImport {
  srcUrl: string
  storage: ImageStorage
  naturalWidth: number
  naturalHeight: number
  width: number
  height: number
  sourceFilePath?: string
  projectAssetPath?: string
}

export interface ResolvedVideoImport {
  srcUrl: string
  sourceFilePath: string
  transcoded: boolean
  proxyFilePath?: string
  proxyForSourcePath?: string
}
