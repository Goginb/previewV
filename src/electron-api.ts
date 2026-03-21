import type { DeserializedProject } from './types/project'

/** Типы API, проброшенные из electron/preload (см. contextBridge). */
export interface ElectronProjectAPI {
  openProjectDialog: () => Promise<{ path: string; project: DeserializedProject } | null>
  openProjectByPath: (path: string) => Promise<{ path: string; project: DeserializedProject } | null>
  saveProject: (payload: { projectData: unknown; path: string | null }) => Promise<{ path: string } | null>
  saveProjectAs: (payload: { projectData: unknown }) => Promise<{ path: string } | null>
  getRecentProjects: () => Promise<string[]>
  showUnsavedDialog: (opts?: { fileLabel?: string }) => Promise<'save' | 'discard' | 'cancel'>
  confirmCloseWindow: () => Promise<void>
}
