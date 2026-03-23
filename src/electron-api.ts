import type { ImageStorage } from './types'
import type { DeserializedProject } from './types/project'

/** Window-level helpers from main (always-on-top, etc.). */
export interface ElectronWindowAPI {
  getAlwaysOnTop: () => Promise<boolean>
}

/** Типы API, проброшенные из electron/preload (см. contextBridge). */
export interface ElectronProjectAPI {
  openProjectDialog: () => Promise<{ path: string; project: DeserializedProject } | null>
  openProjectByPath: (path: string) => Promise<{ path: string; project: DeserializedProject } | null>
  saveProject: (payload: {
    projectData: unknown
    path: string | null
  }) => Promise<{ path: string; project: DeserializedProject } | null>
  saveProjectAs: (payload: {
    projectData: unknown
  }) => Promise<{ path: string; project: DeserializedProject } | null>
  getRecentProjects: () => Promise<string[]>
  showUnsavedDialog: (opts?: { fileLabel?: string }) => Promise<'save' | 'discard' | 'cancel'>
  confirmCloseWindow: () => Promise<void>
  resolveImageSource: (path: string) => Promise<ResolvedImageImport>
  resolveVideoSource: (path: string) => Promise<ResolvedVideoImport>
  pickFolderDialog: () => Promise<string | null>
  enumerateFolderMedia: (folderPath: string) => Promise<string[]>
  duplicateMediaImportDialog: (payload: {
    count: number
  }) => Promise<'add' | 'skip' | 'cancel'>
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
}
