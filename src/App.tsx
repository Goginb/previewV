import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { ViewportHud } from './components/ViewportHud'
import { ProjectTitleBar } from './components/ProjectTitleBar'
import { HelpGuideModal } from './components/HelpGuideModal'
import { SettingsModal } from './components/SettingsModal'
import { DailiesImportModal } from './components/DailiesImportModal'
import { PrmImportModal } from './components/PrmImportModal'
import { ProjectLoadingOverlay } from './components/ProjectLoadingOverlay'
import { useCanvasStore } from './store/canvasStore'
import { useUiStore } from './store/uiStore'
import { flushImageAnnotations } from './utils/flushImageAnnotations'
import {
  hydrateProjectVideoSources,
  needsProjectVideoHydration,
} from './utils/hydrateProjectVideoSources'
import { createEmptyProject } from './utils/emptyProject'
import { importMediaPathsToCanvas } from './utils/importMediaPaths'
import { collectExistingSourcePaths, normalizePathKey } from './utils/sourcePaths'
import {
  beginProjectOpenProgress,
  cancelProjectOpenProgress,
  finishProjectOpenProgress,
  updateProjectOpenProgress,
} from './utils/warmupCanvasMedia'
import { setVideoPlaybackSuspended } from './utils/videoGlobalPlayback'
import type { ElectronProjectAPI, EstimatingLaunchContext } from './electron-api'
import type { DeserializedProject } from './types/project'
import { useEstimatingIntegrationStore } from './integrations/estimating/store'
import { importEstimatingGroupedMediaToCanvas } from './integrations/estimating/importGroupedMedia'

type ProjectAPI = ElectronProjectAPI
const LINKED_PROJECT_AUTOSAVE_DELAY_MS = 320

function fileLabelFromStore(): string {
  const { currentProjectPath } = useCanvasStore.getState()
  if (!currentProjectPath) return 'Untitled'
  const seg = currentProjectPath.split(/[/\\]/).filter(Boolean)
  return seg[seg.length - 1] ?? currentProjectPath
}

function fileLabelFromPath(path: string): string {
  const seg = path.split(/[/\\]/).filter(Boolean)
  return seg[seg.length - 1] ?? path
}

function linkedProjectPathFromContext(context: EstimatingLaunchContext | null): string {
  return context?.linkedProjectPath?.trim() || ''
}

function isMissingProjectPathError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error ?? '')
  return /ENOENT|no such file|cannot find/i.test(message)
}

function getCanvasCenterWorldAnchor(): { x: number; y: number } {
  const root = document.getElementById('previewv-canvas-root')
  const rect = root?.getBoundingClientRect()
  if (!rect) {
    return { x: 0, y: 0 }
  }

  const viewport = useCanvasStore.getState().viewport
  const screenCenterX = rect.width / 2
  const screenCenterY = rect.height / 2

  return {
    x: (screenCenterX - viewport.x) / viewport.scale,
    y: (screenCenterY - viewport.y) / viewport.scale,
  }
}

function dedupeNormalizedPaths(paths: string[]): string[] {
  const uniquePaths = new Map<string, string>()

  for (const path of paths) {
    const trimmed = path.trim()
    if (!trimmed) {
      continue
    }

    const normalized = normalizePathKey(trimmed)
    if (!uniquePaths.has(normalized)) {
      uniquePaths.set(normalized, trimmed)
    }
  }

  return [...uniquePaths.values()]
}

function findImportedVideoItemId(sourcePath: string | null): string | null {
  if (!sourcePath) {
    return null
  }

  const normalizedTarget = normalizePathKey(sourcePath)
  const matchingItem = useCanvasStore
    .getState()
    .items.find(
      (item) =>
        item.type === 'video' &&
        !!item.sourceFilePath &&
        normalizePathKey(item.sourceFilePath) === normalizedTarget,
    )

  return matchingItem?.id ?? null
}

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
  document.title = `${name}${star} - PreviewV`
}

const App: React.FC = () => {
  const [helpOpen, setHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [closePrompt, setClosePrompt] = useState<null | { fileLabel: string; busy: boolean }>(
    null,
  )
  const [proxyPrompt, setProxyPrompt] = useState<null | {
    count: number
    unsavedProject: boolean
    resolve: (value: boolean) => void
  }>(null)
  const projectVideoHydrationRunRef = useRef(0)
  const estimatingLaunchContextRef = useRef<EstimatingLaunchContext | null>(null)
  const linkedProjectAutosaveEnabledRef = useRef(false)
  const linkedProjectAutosaveTimerRef = useRef<number | null>(null)
  const linkedProjectSaveInFlightRef = useRef<Promise<boolean> | null>(null)
  const scheduleLinkedProjectAutosaveRef = useRef<() => void>(() => {})

  const isDailiesModalOpen = useUiStore((s) => s.isDailiesModalOpen)
  const isPrmModalOpen = useUiStore((s) => s.isPrmModalOpen)
  const loadProjectState = useCanvasStore((s) => s.loadProjectState)
  const getProjectDataForSave = useCanvasStore((s) => s.getProjectDataForSave)
  const syncSavedProjectState = useCanvasStore((s) => s.syncSavedProjectState)
  const theme = useUiStore((s) => s.theme)

  const waitForUiPaint = useCallback((maxDelayMs = 48) => {
    return new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const timeoutId = window.setTimeout(finish, maxDelayMs)
      requestAnimationFrame(() => {
        window.clearTimeout(timeoutId)
        finish()
      })
    })
  }, [])

  const completeProjectOpenProgress = useCallback((sessionId: number) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      finishProjectOpenProgress(sessionId)
    }
    const timeoutId = window.setTimeout(finish, 320)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.clearTimeout(timeoutId)
        finish()
      })
    })
  }, [])

  const startProjectVideoHydration = useCallback((project: DeserializedProject) => {
    projectVideoHydrationRunRef.current += 1
    const runId = projectVideoHydrationRunRef.current
    hydrateProjectVideoSources(project.items, () => projectVideoHydrationRunRef.current === runId)
  }, [])

  const cancelProjectVideoHydration = useCallback(() => {
    projectVideoHydrationRunRef.current += 1
  }, [])

  const openProjectWithProgress = useCallback(
    async (
      initialLine: string,
      action: () => Promise<{ path: string; project: DeserializedProject } | null>,
    ) => {
      const sessionId = beginProjectOpenProgress(initialLine)
      try {
        updateProjectOpenProgress(sessionId, 24, 'Reading project file...')
        await waitForUiPaint()
        const res = await action()
        if (!res) {
          cancelProjectOpenProgress(sessionId)
          return null
        }
        updateProjectOpenProgress(sessionId, 60, 'Restoring canvas...')
        await waitForUiPaint()
        updateProjectOpenProgress(sessionId, 88, 'Preparing media...')
        await waitForUiPaint()
        // Heavy projects should open in "Stop all" mode by default to avoid startup playback spikes.
        setVideoPlaybackSuspended(true)
        loadProjectState(res.project, res.path)
        startProjectVideoHydration(res.project)
        completeProjectOpenProgress(sessionId)
        return res
      } catch (error) {
        cancelProjectOpenProgress(sessionId)
        throw error
      }
    },
    [completeProjectOpenProgress, loadProjectState, startProjectVideoHydration, waitForUiPaint],
  )

  const saveLinkedProjectSnapshot = useCallback(
    async (options?: { force?: boolean; alertOnError?: boolean }) => {
      const projectAPI = window.electronAPI?.projectAPI
      const linkedProjectPath = linkedProjectPathFromContext(estimatingLaunchContextRef.current)

      if (!projectAPI || !linkedProjectPath) {
        return true
      }

      if (linkedProjectAutosaveTimerRef.current !== null && options?.force) {
        window.clearTimeout(linkedProjectAutosaveTimerRef.current)
        linkedProjectAutosaveTimerRef.current = null
      }

      if (linkedProjectSaveInFlightRef.current) {
        const inFlightResult = await linkedProjectSaveInFlightRef.current.catch(() => false)
        if (!inFlightResult) {
          return false
        }
        if (options?.force || useCanvasStore.getState().isDirty) {
          return saveLinkedProjectSnapshot(options)
        }
        return true
      }

      if (!options?.force && !useCanvasStore.getState().isDirty) {
        return true
      }

      const savePromise = (async () => {
        flushImageAnnotations()
        const snapshotState = useCanvasStore.getState()
        const snapshotItems = snapshotState.items
        const projectData = snapshotState.getProjectDataForSave()
        const res = await projectAPI.saveProject({
          projectData,
          path: linkedProjectPath,
        })

        if (!res) {
          return false
        }

        const latestState = useCanvasStore.getState()
        const itemsUnchanged = latestState.items === snapshotItems

        if (itemsUnchanged || options?.force) {
          useCanvasStore.setState((state) => ({
            currentProjectPath: res.path,
            projectMeta: res.project.meta,
            isDirty: state.items === snapshotItems ? false : state.isDirty,
          }))
        } else {
          useCanvasStore.setState({
            currentProjectPath: res.path,
            projectMeta: res.project.meta,
          })
          scheduleLinkedProjectAutosaveRef.current()
        }

        return true
      })()
        .catch((error: any) => {
          if (options?.alertOnError) {
            alert(error?.message ?? String(error))
          }
          return false
        })
        .finally(() => {
          linkedProjectSaveInFlightRef.current = null
        })

      linkedProjectSaveInFlightRef.current = savePromise
      return savePromise
    },
    [],
  )

  const scheduleLinkedProjectAutosave = useCallback(() => {
    if (!linkedProjectAutosaveEnabledRef.current) {
      return
    }

    if (!linkedProjectPathFromContext(estimatingLaunchContextRef.current)) {
      return
    }

    if (linkedProjectAutosaveTimerRef.current !== null) {
      window.clearTimeout(linkedProjectAutosaveTimerRef.current)
    }

    linkedProjectAutosaveTimerRef.current = window.setTimeout(() => {
      linkedProjectAutosaveTimerRef.current = null
      void saveLinkedProjectSnapshot()
    }, LINKED_PROJECT_AUTOSAVE_DELAY_MS)
  }, [saveLinkedProjectSnapshot])

  scheduleLinkedProjectAutosaveRef.current = scheduleLinkedProjectAutosave

  useEffect(() => {
    const onHelp = () => setHelpOpen(true)
    window.addEventListener('app-show-help', onHelp)
    return () => window.removeEventListener('app-show-help', onHelp)
  }, [])

  useEffect(() => {
    const onSettings = () => setSettingsOpen(true)
    window.addEventListener('app-open-settings', onSettings)
    return () => window.removeEventListener('app-open-settings', onSettings)
  }, [])

  useEffect(() => {
    const onRequestUnsavedClose = (e: Event) => {
      const d = (e as CustomEvent).detail as { fileLabel?: string }
      setClosePrompt({ fileLabel: d?.fileLabel ?? fileLabelFromStore(), busy: false })
    }
    window.addEventListener('app-request-unsaved-close', onRequestUnsavedClose)
    return () => window.removeEventListener('app-request-unsaved-close', onRequestUnsavedClose)
  }, [])

  useEffect(() => {
    const onRequestProxyPrompt = (
      e: CustomEvent<{ count: number; unsavedProject: boolean; resolve: (value: boolean) => void }>,
    ) => {
      setProxyPrompt(e.detail)
    }
    window.addEventListener(
      'previewv-request-generate-proxy-confirmation',
      onRequestProxyPrompt as EventListener,
    )
    return () =>
      window.removeEventListener(
        'previewv-request-generate-proxy-confirmation',
        onRequestProxyPrompt as EventListener,
      )
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
    return () => {
      window.removeEventListener('previewv-always-on-top', onChange)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

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
    let prevDirty = useCanvasStore.getState().isDirty
    const unsub = useCanvasStore.subscribe((state) => {
      if (state.isDirty && !prevDirty) {
        scheduleLinkedProjectAutosave()
      }
      prevDirty = state.isDirty
    })

    return () => {
      unsub()
      if (linkedProjectAutosaveTimerRef.current !== null) {
        window.clearTimeout(linkedProjectAutosaveTimerRef.current)
        linkedProjectAutosaveTimerRef.current = null
      }
    }
  }, [scheduleLinkedProjectAutosave])

  useEffect(() => {
    window.__previewvLinkedAutosave = async () => {
      try {
        const integration = useEstimatingIntegrationStore.getState()
        if (integration.active) {
          await integration.flushPendingShotSync()
        }
        return saveLinkedProjectSnapshot({
          force: true,
          alertOnError: true,
        })
      } catch (error: any) {
        alert(error?.message ?? String(error))
        return false
      }
    }

    return () => {
      window.__previewvLinkedAutosave = undefined
    }
  }, [saveLinkedProjectSnapshot])

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string; path?: string }
      const projectAPI = window.electronAPI?.projectAPI
      if (!projectAPI) return

      try {
        if (detail.action === 'open') {
          const ok = await ensureCanLeaveProject(projectAPI)
          if (!ok) return
          const res = await openProjectWithProgress('Opening project...', () =>
            projectAPI.openProjectDialog(),
          )
          if (!res) return
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
                alert('Nothing new to add - all files were already on the canvas.')
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
          const res = await projectAPI.saveProjectAs({
            projectData,
            currentPath: useCanvasStore.getState().currentProjectPath,
          })
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
          cancelProjectVideoHydration()
          loadProjectState(createEmptyProject(), null)
          return
        }
        if (detail.action === 'open-recent' && detail.path) {
          const ok = await ensureCanLeaveProject(projectAPI)
          if (!ok) return
          const res = await openProjectWithProgress(
            `Opening ${fileLabelFromPath(detail.path)}...`,
            () => projectAPI.openProjectByPath(detail.path!),
          )
          if (!res) return
          return
        }
      } catch (err: any) {
        alert(err?.message ?? String(err))
      }
    }

    window.addEventListener('project-menu-action', handler)
    return () => window.removeEventListener('project-menu-action', handler)
  }, [
    cancelProjectVideoHydration,
    getProjectDataForSave,
    loadProjectState,
    openProjectWithProgress,
    startProjectVideoHydration,
    syncSavedProjectState,
  ])

  useEffect(() => {
    const openByPath = async (path: string) => {
      const projectAPI = window.electronAPI?.projectAPI
      if (!projectAPI) return
      try {
        const ok = await ensureCanLeaveProject(projectAPI)
        if (!ok) return
        const res = await openProjectWithProgress(
          `Opening ${fileLabelFromPath(path)}...`,
          () => projectAPI.openProjectByPath(path),
        )
        if (!res) return
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
  }, [openProjectWithProgress])

  useEffect(() => {
    let cancelled = false

    const bootstrapEstimatingIntegration = async () => {
      // Guardrails for this linked flow live in:
      // src/integrations/estimating/INTEGRATION_GUARDRAILS.md
      //
      // Important: this bootstrap must stay Estimating-specific and must not
      // change the behavior of a normal standalone PreviewV launch.
      const context =
        await window.electronAPI?.integrationAPI?.getEstimatingLaunchContext?.().catch(() => null)
      if (!context || cancelled) {
        return
      }

      estimatingLaunchContextRef.current = context
      linkedProjectAutosaveEnabledRef.current = false

      const projectAPI = window.electronAPI?.projectAPI
      const linkedProjectPath = linkedProjectPathFromContext(context)
      const progressTitle =
        context.language === 'ru' ? 'Открываем linked PreviewV' : 'Opening linked PreviewV'
      const progressLine = {
        preparing:
          context.language === 'ru' ? 'Готовим linked-проект...' : 'Preparing linked project...',
        readingSession:
          context.language === 'ru' ? 'Читаем estimating session...' : 'Reading estimating session...',
        openingLinked:
          context.language === 'ru' ? 'Открываем сохранённый layout...' : 'Opening saved layout...',
        preparingCanvas:
          context.language === 'ru' ? 'Подготавливаем linked canvas...' : 'Preparing linked canvas...',
        scanningFolders:
          context.language === 'ru' ? 'Сканируем папки проекта...' : 'Scanning project folders...',
        groupingBriefs:
          context.language === 'ru' ? 'Группируем медиа по ТЗ...' : 'Grouping media by brief...',
        framing:
          context.language === 'ru' ? 'Готовим раскладку...' : 'Framing linked board...',
        saving:
          context.language === 'ru' ? 'Сохраняем linked layout...' : 'Saving linked layout...',
        hydrating:
          context.language === 'ru' ? 'Восстанавливаем video previews...' : 'Restoring video previews...',
        ready:
          context.language === 'ru' ? 'PreviewV готов.' : 'PreviewV is ready.',
      }
      const progressSessionId = beginProjectOpenProgress(progressLine.preparing)
      updateProjectOpenProgress(progressSessionId, 10, progressLine.readingSession, progressTitle)

      try {
        const result =
          await useEstimatingIntegrationStore.getState().initializeFromLaunchContext(context)
        if (cancelled) {
          cancelProjectOpenProgress(progressSessionId)
          return
        }

        if (!projectAPI?.enumerateFolderMedia) {
          throw new Error('PreviewV desktop media import API is unavailable.')
        }

        setVideoPlaybackSuspended(true)
        let loadedLinkedProject = false
        let pendingHydrationProject: DeserializedProject | null = null

        if (linkedProjectPath && projectAPI?.openProjectByPath) {
          try {
            updateProjectOpenProgress(progressSessionId, 22, progressLine.openingLinked, progressTitle)
            const linkedProject = await projectAPI.openProjectByPath(linkedProjectPath)
            if (cancelled) {
              cancelProjectOpenProgress(progressSessionId)
              return
            }
            if (linkedProject) {
              loadedLinkedProject = true
              updateProjectOpenProgress(progressSessionId, 34, progressLine.preparingCanvas, progressTitle)
              loadProjectState(linkedProject.project, linkedProject.path)
              // Reopen performance matters here: linked sidecars should reuse
              // already-saved source/proxy state and only hydrate when needed.
              if (needsProjectVideoHydration(linkedProject.project.items)) {
                pendingHydrationProject = linkedProject.project
              } else {
                cancelProjectVideoHydration()
              }
            }
          } catch (error) {
            if (!isMissingProjectPathError(error)) {
              throw error
            }
          }
        }

        if (!loadedLinkedProject) {
          cancelProjectVideoHydration()
          updateProjectOpenProgress(progressSessionId, 34, progressLine.preparingCanvas, progressTitle)
          loadProjectState(createEmptyProject(), linkedProjectPath || null)
        }

        const shouldEnumerateProjectFolders =
          !loadedLinkedProject || useCanvasStore.getState().items.length === 0

        updateProjectOpenProgress(progressSessionId, 44, progressLine.scanningFolders, progressTitle)
        const folderMediaRows = shouldEnumerateProjectFolders
          ? await Promise.all(
              result.folderPaths.map((folderPath) =>
                projectAPI.enumerateFolderMedia(folderPath).catch(() => []),
              ),
            )
          : []
        if (cancelled) {
          cancelProjectOpenProgress(progressSessionId)
          return
        }

        const importPaths = dedupeNormalizedPaths([
          ...folderMediaRows.flat(),
          ...result.mediaPaths,
        ])
        if (importPaths.length === 0) {
          throw new Error(
            context.language === 'ru'
              ? 'Ne udalos nayti media v papkah proekta dlya PreviewV.'
              : 'No project media folders could be imported into PreviewV.',
          )
        }

        const existingSourcePaths = collectExistingSourcePaths(useCanvasStore.getState().items)
        const missingImportPaths = importPaths.filter(
          (path) => !existingSourcePaths.has(normalizePathKey(path)),
        )

        if (missingImportPaths.length > 0) {
          updateProjectOpenProgress(progressSessionId, 56, progressLine.groupingBriefs, progressTitle)
          // Estimating imports are intentionally not the same as generic
          // "Add folder": first-time linked media is grouped by brief and
          // wrapped into backdrop/note structure.
          await importEstimatingGroupedMediaToCanvas(
            missingImportPaths,
            getCanvasCenterWorldAnchor(),
            {
              startPct: 60,
              endPct: 84,
              onProgress: (pct, line) =>
                updateProjectOpenProgress(progressSessionId, pct, line, progressTitle),
            },
          )
        }
        if (cancelled) {
          cancelProjectOpenProgress(progressSessionId)
          return
        }

        const shouldFrameImportedMedia = !loadedLinkedProject

        if (shouldFrameImportedMedia) {
          updateProjectOpenProgress(progressSessionId, 88, progressLine.framing, progressTitle)
          await waitForUiPaint(96)

          const root = document.getElementById('previewv-canvas-root')
          const rect = root?.getBoundingClientRect()

          if (rect) {
            const preferredItemId = findImportedVideoItemId(result.preferredMediaPath)

            if (preferredItemId) {
              useCanvasStore.getState().setSelection([preferredItemId])
              useCanvasStore.getState().frameItemInViewport(
                preferredItemId,
                rect.width,
                rect.height,
                48,
              )
            } else {
              useCanvasStore.getState().frameAllItemsInViewport(rect.width, rect.height)
            }
          }
        }

        if (linkedProjectPath) {
          const shouldSaveLinkedProject = !loadedLinkedProject || missingImportPaths.length > 0
          if (shouldSaveLinkedProject) {
            updateProjectOpenProgress(progressSessionId, 94, progressLine.saving, progressTitle)
            await waitForUiPaint(96)
            const saved = await saveLinkedProjectSnapshot({
              force: true,
              alertOnError: true,
            })
            if (!saved) {
              throw new Error('Failed to initialize linked PreviewV project.')
            }
          }
        } else if (!loadedLinkedProject) {
          loadProjectState(getProjectDataForSave(), null)
        }

        linkedProjectAutosaveEnabledRef.current = true
        if (pendingHydrationProject) {
          updateProjectOpenProgress(progressSessionId, 96, progressLine.hydrating, progressTitle)
          startProjectVideoHydration(pendingHydrationProject)
        } else {
          finishProjectOpenProgress(progressSessionId, progressLine.ready, progressTitle)
        }
      } catch (error: any) {
        cancelProjectOpenProgress(progressSessionId)
        alert(error?.message ?? String(error))
      }
    }

    void bootstrapEstimatingIntegration()

    return () => {
      cancelled = true
      linkedProjectAutosaveEnabledRef.current = false
    }
  }, [
    cancelProjectVideoHydration,
    getProjectDataForSave,
    loadProjectState,
    saveLinkedProjectSnapshot,
    startProjectVideoHydration,
    waitForUiPaint,
  ])

  useEffect(() => {
    const flushEstimatingDrafts = () => {
      const integration = useEstimatingIntegrationStore.getState()
      if (!integration.active) {
        return
      }
      void integration.flushPendingShotSync()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushEstimatingDrafts()
      }
    }

    window.addEventListener('beforeunload', flushEstimatingDrafts)
    window.addEventListener('pagehide', flushEstimatingDrafts)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', flushEstimatingDrafts)
      window.removeEventListener('pagehide', flushEstimatingDrafts)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return (
    <div className="relative w-full h-full min-h-[100dvh]" style={{ background: 'var(--app-bg)' }}>
      <ProjectLoadingOverlay />
      {helpOpen && <HelpGuideModal onClose={() => setHelpOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {isDailiesModalOpen && <DailiesImportModal />}
      {isPrmModalOpen && <PrmImportModal />}
      {closePrompt && (
        <div className="fixed inset-0 z-[6500] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-[min(92vw,500px)] rounded-xl border p-4"
            style={{ background: 'var(--menu-bg)', borderColor: 'var(--menu-border)' }}
          >
            <h3 className="text-base font-semibold text-themeText-100">
              Save changes before closing?
            </h3>
            <p className="mt-1 text-sm text-themeText-300">{closePrompt.fileLabel}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={closePrompt.busy}
                className="rounded border border-[var(--menu-border)] px-3 py-1.5 text-themeText-200 hover:bg-themeBg-hover disabled:opacity-50"
                onClick={() => setClosePrompt(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={closePrompt.busy}
                className="rounded border border-[var(--menu-border)] px-3 py-1.5 text-themeText-100 hover:bg-themeBg-hover disabled:opacity-50"
                onClick={async () => {
                  const projectAPI = window.electronAPI?.projectAPI
                  if (!projectAPI) return
                  setClosePrompt((p) => (p ? { ...p, busy: true } : p))
                  try {
                    await projectAPI.confirmCloseWindow()
                  } catch {
                    setClosePrompt((p) => (p ? { ...p, busy: false } : p))
                  }
                }}
              >
                Don't save
              </button>
              <button
                type="button"
                disabled={closePrompt.busy}
                className="rounded bg-emerald-700 px-3 py-1.5 text-white hover:bg-emerald-600 disabled:opacity-50"
                onClick={async () => {
                  const projectAPI = window.electronAPI?.projectAPI
                  if (!projectAPI) return
                  setClosePrompt((p) => (p ? { ...p, busy: true } : p))
                  try {
                    flushImageAnnotations()
                    const projectData = useCanvasStore.getState().getProjectDataForSave()
                    const path = useCanvasStore.getState().currentProjectPath
                    const res = await projectAPI.saveProject({ projectData, path })
                    if (!res) {
                      setClosePrompt((p) => (p ? { ...p, busy: false } : p))
                      return
                    }
                    useCanvasStore.getState().syncSavedProjectState(res.project, res.path)
                    await projectAPI.confirmCloseWindow()
                  } catch (err: any) {
                    alert(err?.message ?? String(err))
                    setClosePrompt((p) => (p ? { ...p, busy: false } : p))
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {proxyPrompt && (
        <div className="fixed inset-0 z-[6600] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-[min(92vw,540px)] rounded-xl border p-4"
            style={{ background: 'var(--menu-bg)', borderColor: 'var(--menu-border)' }}
          >
            <h3 className="text-base font-semibold text-themeText-100">
              Generate lightweight proxies?
            </h3>
            <p className="mt-2 text-sm text-themeText-300">
              {proxyPrompt.count > 1
                ? `${proxyPrompt.count} imported files are ProRes or MJPEG-in-MOV (e.g. Nuke proxies). Chromium often cannot play them and shows a black frame.`
                : 'This file is ProRes or MJPEG-in-MOV. It may not play in the viewer without a lightweight proxy.'}
            </p>
            <p className="mt-2 text-sm text-themeText-300">
              {proxyPrompt.unsavedProject
                ? 'The project is not saved yet, so generated proxies will be stored on the Desktop in `Prores_proxy_temp`.'
                : 'Proxies are saved next to your project file in `Prores_proxy_temp`. Generate them now?'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-[var(--menu-border)] px-3 py-1.5 text-themeText-200 hover:bg-themeBg-hover"
                onClick={() => {
                  proxyPrompt.resolve(false)
                  setProxyPrompt(null)
                }}
              >
                Import without proxies
              </button>
              <button
                type="button"
                className="rounded bg-fuchsia-700 px-3 py-1.5 text-white hover:bg-fuchsia-600"
                onClick={() => {
                  proxyPrompt.resolve(true)
                  setProxyPrompt(null)
                }}
              >
                Generate proxies
              </button>
            </div>
          </div>
        </div>
      )}
      <ProjectTitleBar />
      <div className="absolute inset-x-0 bottom-0 top-11 min-h-0">
        <Canvas />
      </div>
      <ViewportHud />
    </div>
  )
}

export default App
