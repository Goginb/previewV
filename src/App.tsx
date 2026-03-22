import React, { useEffect, useState } from 'react'
import { Canvas } from './components/Canvas'
import { ViewportHud } from './components/ViewportHud'
import { ProjectTitleBar } from './components/ProjectTitleBar'
import { HelpGuideModal } from './components/HelpGuideModal'
import { useCanvasStore } from './store/canvasStore'
import { useUiStore } from './store/uiStore'
import { flushImageAnnotations } from './utils/flushImageAnnotations'
import { createEmptyProject } from './utils/emptyProject'
import { importMediaPathsToCanvas } from './utils/importMediaPaths'
import { collectExistingSourcePaths, normalizePathKey } from './utils/sourcePaths'
import type { ElectronProjectAPI } from './electron-api'

type ProjectAPI = ElectronProjectAPI

function fileLabelFromStore(): string {
  const { currentProjectPath } = useCanvasStore.getState()
  if (!currentProjectPath) return 'Untitled'
  const seg = currentProjectPath.split(/[/\\]/).filter(Boolean)
  return seg[seg.length - 1] ?? currentProjectPath
}

/** Before switching project: save / discard / cancel. false = stay. */
async function ensureCanLeaveProject(projectAPI: ProjectAPI): Promise<boolean> {
  const { isDirty } = useCanvasStore.getState()
  if (!isDirty) return true
  const choice = await projectAPI.showUnsavedDialog({ fileLabel: fileLabelFromStore() })
  if (choice === 'cancel') return false
  if (choice === 'discard') return true
  flushImageAnnotations()
  const projectData = useCanvasStore.getState().getProjectDataForSave()
  const path = useCanvasStore.getState().currentProjectPath
  try {
    const res = await projectAPI.saveProject({ projectData, path })
    if (!res) return false
    useCanvasStore.getState().syncSavedProjectState(res.project, res.path)
    return true
  } catch (err: any) {
    alert(err?.message ?? String(err))
    return false
  }
}

function syncWindowProjectState(): void {
  const s = useCanvasStore.getState()
  window.__previewvProjectState = {
    dirty: s.isDirty,
    path: s.currentProjectPath,
  }
}

function syncDocumentTitle(): void {
  const s = useCanvasStore.getState()
  const name = fileLabelFromStore()
  const star = s.isDirty ? ' *' : ''
  document.title = `${name}${star} — PreviewV`
}

const App: React.FC = () => {
  const [helpOpen, setHelpOpen] = useState(false)
  const loadProjectState = useCanvasStore((s) => s.loadProjectState)
  const getProjectDataForSave = useCanvasStore((s) => s.getProjectDataForSave)
  const syncSavedProjectState = useCanvasStore((s) => s.syncSavedProjectState)

  useEffect(() => {
    const onHelp = () => setHelpOpen(true)
    window.addEventListener('app-show-help', onHelp)
    return () => window.removeEventListener('app-show-help', onHelp)
  }, [])

  useEffect(() => {
    const wa = window.electronAPI?.windowAPI
    if (!wa) return
    void wa.getAlwaysOnTop().then((v) => useUiStore.getState().setAlwaysOnTop(v))
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { value: boolean }
      useUiStore.getState().setAlwaysOnTop(d.value)
    }
    window.addEventListener('previewv-always-on-top', onChange)
    return () => window.removeEventListener('previewv-always-on-top', onChange)
  }, [])

  useEffect(() => {
    syncWindowProjectState()
    syncDocumentTitle()
    let prevDirty = useCanvasStore.getState().isDirty
    let prevPath = useCanvasStore.getState().currentProjectPath
    const unsub = useCanvasStore.subscribe((state) => {
      if (state.isDirty === prevDirty && state.currentProjectPath === prevPath) return
      prevDirty = state.isDirty
      prevPath = state.currentProjectPath
      syncWindowProjectState()
      syncDocumentTitle()
    })
    return unsub
  }, [])

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string; path?: string }
      const projectAPI = window.electronAPI?.projectAPI
      if (!projectAPI) return

      try {
        if (detail.action === 'open') {
          const ok = await ensureCanLeaveProject(projectAPI)
          if (!ok) return
          const res = await projectAPI.openProjectDialog()
          if (!res) return
          loadProjectState(res.project, res.path)
          return
        }
        if (detail.action === 'add-folder') {
          if (!projectAPI.pickFolderDialog || !projectAPI.enumerateFolderMedia) {
            alert('Add folder is only available in the desktop app.')
            return
          }
          const folder = await projectAPI.pickFolderDialog()
          if (!folder) return
          const paths = await projectAPI.enumerateFolderMedia(folder)
          if (paths.length === 0) {
            alert('No supported video or image files in this folder.')
            return
          }
          const items = useCanvasStore.getState().items
          const existing = collectExistingSourcePaths(items)
          const duplicates = paths.filter((p) => existing.has(normalizePathKey(p)))
          let toImport = paths
          if (duplicates.length > 0) {
            const choice = await projectAPI.duplicateMediaImportDialog({
              count: duplicates.length,
            })
            if (choice === 'cancel') return
            if (choice === 'skip') {
              toImport = paths.filter((p) => !existing.has(normalizePathKey(p)))
              if (toImport.length === 0) {
                alert('Nothing new to add — all files were already on the canvas.')
                return
              }
            }
          }
          const el = document.getElementById('previewv-canvas-root')
          const rect = el?.getBoundingClientRect()
          const vp = useCanvasStore.getState().viewport
          const cw = rect?.width ?? 800
          const ch = rect?.height ?? 600
          const sx = cw / 2
          const sy = ch / 2
          const wx = (sx - vp.x) / vp.scale
          const wy = (sy - vp.y) / vp.scale
          await importMediaPathsToCanvas(toImport, { x: wx, y: wy })
          return
        }
        if (detail.action === 'save') {
          flushImageAnnotations()
          const projectData = getProjectDataForSave()
          const res = await projectAPI.saveProject({
            projectData,
            path: useCanvasStore.getState().currentProjectPath,
          })
          if (!res) return
          syncSavedProjectState(res.project, res.path)
          return
        }
        if (detail.action === 'save-as') {
          flushImageAnnotations()
          const projectData = getProjectDataForSave()
          const res = await projectAPI.saveProjectAs({ projectData })
          if (!res) return
          syncSavedProjectState(res.project, res.path)
          return
        }
        if (detail.action === 'save-and-close') {
          flushImageAnnotations()
          const projectData = getProjectDataForSave()
          const res = await projectAPI.saveProject({
            projectData,
            path: useCanvasStore.getState().currentProjectPath,
          })
          if (!res) return
          syncSavedProjectState(res.project, res.path)
          await projectAPI.confirmCloseWindow()
          return
        }
        if (detail.action === 'close-project') {
          const ok = await ensureCanLeaveProject(projectAPI)
          if (!ok) return
          loadProjectState(createEmptyProject(), null)
          return
        }
        if (detail.action === 'open-recent' && detail.path) {
          const ok = await ensureCanLeaveProject(projectAPI)
          if (!ok) return
          const res = await projectAPI.openProjectByPath(detail.path)
          if (!res) return
          loadProjectState(res.project, res.path)
          return
        }
      } catch (err: any) {
        alert(err?.message ?? String(err))
      }
    }

    window.addEventListener('project-menu-action', handler)
    return () => window.removeEventListener('project-menu-action', handler)
  }, [getProjectDataForSave, loadProjectState, syncSavedProjectState])

  // Open-on-launch / double-click flow:
  useEffect(() => {
    const openByPath = async (path: string) => {
      const projectAPI = window.electronAPI?.projectAPI
      if (!projectAPI) return
      try {
        const ok = await ensureCanLeaveProject(projectAPI)
        if (!ok) return
        const res = await projectAPI.openProjectByPath(path)
        if (!res) return
        loadProjectState(res.project, res.path)
      } catch (err: any) {
        alert(err?.message ?? String(err))
      }
    }

    const pending = window.__previewvPendingProjectPath
    if (pending) {
      window.__previewvPendingProjectPath = undefined
      void openByPath(pending)
    }

    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { path: string }
      if (detail?.path) void openByPath(detail.path)
    }

    window.addEventListener('app-open-project-by-path', onOpen as any)
    return () => window.removeEventListener('app-open-project-by-path', onOpen as any)
  }, [loadProjectState])

  return (
    <div className="relative w-full h-full min-h-[100dvh] bg-zinc-950">
      {helpOpen && <HelpGuideModal onClose={() => setHelpOpen(false)} />}
      <ProjectTitleBar />
      <div className="absolute inset-x-0 top-11 bottom-0 min-h-0">
        <Canvas />
      </div>
      <ViewportHud />
    </div>
  )
}

export default App
