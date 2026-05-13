import React from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useUiStore } from '../store/uiStore'
import { videoRegistry } from '../utils/videoRegistry'
import type { ItemUpdate, VideoItem } from '../types'
import { mediaUrlToLocalPath } from '../utils/projectSerializer'
import { usePreloadStore } from '../store/preloadStore'
import { useEstimatingIntegrationStore } from '../integrations/estimating/store'

function fileNameFromPath(path: string | null): string {
  if (!path) return 'Untitled'
  const seg = path.split(/[/\\]/).filter(Boolean)
  return seg[seg.length - 1] ?? path
}

function normalizePathKey(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

function extractVideoSourcePath(item: VideoItem): string {
  return item.sourceFilePath || mediaUrlToLocalPath(item.srcUrl)
}

export const ProjectTitleBar: React.FC = () => {
  const path = useCanvasStore((s) => s.currentProjectPath)
  const isDirty = useCanvasStore((s) => s.isDirty)
  const alwaysOnTop = useUiStore((s) => s.alwaysOnTop)
  const useImageProxyMode = useUiStore((s) => s.useImageProxyMode)
  const estimatingIntegrationActive = useEstimatingIntegrationStore((s) => s.active)
  const name = fileNameFromPath(path)
  const isGeneratingProxyRef = React.useRef(false)

  const handleGenerateProxy = React.useCallback(async () => {
    if (isGeneratingProxyRef.current) return
    const api = window.electronAPI?.projectAPI
    if (!api?.generateVideoProxies) return

    const state = useCanvasStore.getState()
    const selectedIdSet = new Set(state.selectedIds)
    const selectedVideos = state.items.filter(
      (item): item is VideoItem => item.type === 'video' && selectedIdSet.has(item.id),
    )
    const targetVideos =
      selectedVideos.length > 0
        ? selectedVideos
        : state.items.filter((item): item is VideoItem => item.type === 'video')
    if (targetVideos.length === 0) {
      alert('No video tiles found for proxy generation.')
      return
    }

    const seen = new Set<string>()
    const paths: string[] = []
    for (const video of targetVideos) {
      const sourcePath = extractVideoSourcePath(video)
      if (!sourcePath) continue
      const key = normalizePathKey(sourcePath)
      if (seen.has(key)) continue
      seen.add(key)
      paths.push(sourcePath)
    }
    if (paths.length === 0) {
      alert('Selected videos have no source paths.')
      return
    }

    isGeneratingProxyRef.current = true
    const preload = usePreloadStore.getState()
    preload.setOpen(true)
    preload.setProgress(0, 'Preparing proxy generation...', 'Generating Proxy')

    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        stage: 'start' | 'progress' | 'done'
        completed: number
        total: number
        line: string
      }
      const total = Math.max(1, detail.total || paths.length)
      const pct = Math.round((Math.max(0, detail.completed || 0) / total) * 100)
      usePreloadStore.getState().setProgress(pct, detail.line || 'Generating proxy...', 'Generating Proxy')
    }
    window.addEventListener('video-proxy-progress', onProgress as EventListener)

    try {
      const resolved = await api.generateVideoProxies({
        paths,
        projectPath: state.currentProjectPath,
      })
      const bySourcePath = new Map(
        resolved.map((entry) => [normalizePathKey(entry.path), entry.resolved] as const),
      )
      const updates: Array<{ id: string; updates: ItemUpdate }> = []
      for (const item of state.items) {
        if (item.type !== 'video') continue
        const sourcePath = extractVideoSourcePath(item)
        if (!sourcePath) continue
        const match = bySourcePath.get(normalizePathKey(sourcePath))
        if (!match) continue
        updates.push({
          id: item.id,
          updates: {
            srcUrl: match.srcUrl,
            sourceFilePath: match.sourceFilePath,
            proxyFilePath: match.proxyFilePath,
            proxyForSourcePath: match.proxyForSourcePath,
          },
        })
      }
      if (updates.length > 0) {
        useCanvasStore.getState().updateItemsBatch(updates, {
          recordHistory: false,
          markDirty: false,
        })
      }
      usePreloadStore.getState().setProgress(100, 'Proxy generation finished.', 'Generating Proxy')
      window.setTimeout(() => usePreloadStore.getState().reset(), 260)
    } catch (error: any) {
      usePreloadStore.getState().reset()
      alert(error?.message ?? String(error))
    } finally {
      window.removeEventListener('video-proxy-progress', onProgress as EventListener)
      isGeneratingProxyRef.current = false
    }
  }, [])

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[2000] pointer-events-none select-none"
      aria-hidden
    >
      <div
        className="flex items-center justify-center px-4 py-2 backdrop-blur-sm border-b"
        style={{ background: 'color-mix(in oklab, var(--app-bg) 88%, black)', borderColor: 'var(--menu-border)' }}
      >
        <div
          className="text-xs sm:text-sm text-themeText-300 font-medium truncate max-w-[min(90vw,42rem)] text-center"
          title={path ?? 'Project not saved to disk'}
        >
          <span className="text-themeText-500 font-normal mr-2">Project:</span>
          <span className="font-mono text-themeText-100">{name}</span>
          {alwaysOnTop && (
            <span
              className="text-sky-400 ml-2 text-[10px] uppercase tracking-wide border border-sky-500/50 rounded px-1 py-0.5"
              title="Window pinned (always on top). Ctrl+Shift+A toggles pin."
            >
              Pinned
            </span>
          )}
          {estimatingIntegrationActive && (
            <span
              className="text-teal-300 ml-2 text-[10px] uppercase tracking-wide border border-teal-500/50 rounded px-1 py-0.5"
              title="Launched from Supervisor Estimating Tool"
            >
              Estimating Link
            </span>
          )}
          {isDirty && (
            <span className="text-amber-400 ml-1.5" title="Unsaved changes">
              •
            </span>
          )}
        </div>
        <button
           type="button"
           className="ml-4 px-3 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-xs font-semibold uppercase tracking-wider border border-indigo-500/40 pointer-events-auto transition-colors"
           onClick={() => useUiStore.getState().setDailiesModalOpen(true)}
        >
           Import Dailies
        </button>
        <button
           type="button"
           className="ml-2 px-3 py-1 rounded bg-teal-500/20 hover:bg-teal-500/40 text-teal-300 text-xs font-semibold uppercase tracking-wider border border-teal-500/40 pointer-events-auto transition-colors"
           onClick={() => useUiStore.getState().setPrmModalOpen(true)}
        >
           Import PRM
        </button>
        <button
           type="button"
           className="ml-2 px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 text-xs font-semibold uppercase tracking-wider border border-amber-500/40 pointer-events-auto transition-colors"
           onClick={() => {
             for (const video of videoRegistry.values()) {
               if (video.paused) continue
               video.currentTime = 0
             }
           }}
           title="Перемотать на начало только сейчас играющие видео"
        >
           ⟲ Restart All
        </button>
        {estimatingIntegrationActive ? (
          <>
            <button
              type="button"
              className="ml-2 px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider border pointer-events-auto transition-all"
              style={
                useImageProxyMode
                  ? {
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.34), rgba(34, 197, 94, 0.24))',
                      borderColor: 'rgba(134, 239, 172, 0.64)',
                      color: '#dcfce7',
                      boxShadow: '0 0 0 1px rgba(110, 231, 183, 0.12), 0 0 22px rgba(16, 185, 129, 0.24)',
                    }
                  : {
                      background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(56, 189, 248, 0.16))',
                      borderColor: 'rgba(125, 211, 252, 0.42)',
                      color: '#d1fae5',
                    }
              }
              onClick={() => {
                const state = useUiStore.getState()
                state.setUseImageProxyMode(!state.useImageProxyMode)
              }}
              title="Swap live videos for lightweight proxy pictures so pan/zoom stays fast"
            >
              {useImageProxyMode ? 'Proxy Pictures ON' : 'Proxy Pictures'}
            </button>
            <button
               type="button"
               className="ml-2 px-3 py-1 rounded bg-fuchsia-500/20 hover:bg-fuchsia-500/40 text-fuchsia-300 text-xs font-semibold uppercase tracking-wider border border-fuchsia-500/40 pointer-events-auto transition-colors"
               onClick={() => {
                 void handleGenerateProxy()
              }}
              title="Generate lightweight proxies for selected video tiles (or all videos if nothing selected)"
            >
              Generate Proxy
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
