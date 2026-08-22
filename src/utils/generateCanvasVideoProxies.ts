import { useCanvasStore } from '../store/canvasStore'
import type { ItemUpdate, VideoItem } from '../types'
import { usePreloadStore } from '../store/preloadStore'
import { mediaUrlToLocalPath } from './projectSerializer'

let isGenerating = false

function normalizePathKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

function extractVideoSourcePath(item: VideoItem): string {
  return item.sourceFilePath || mediaUrlToLocalPath(item.srcUrl)
}

export async function generateCanvasVideoProxies(): Promise<void> {
  if (isGenerating) return
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

  isGenerating = true
  const preload = usePreloadStore.getState()
  preload.setOpen(true)
  preload.setProgress(0, 'Preparing proxy generation...', 'Generating Proxy')

  const onProgress = (event: Event) => {
    const detail = (event as CustomEvent).detail as {
      stage: 'start' | 'progress' | 'done'
      completed: number
      total: number
      line: string
    }
    const total = Math.max(1, detail.total || paths.length)
    const percent = Math.round((Math.max(0, detail.completed || 0) / total) * 100)
    usePreloadStore
      .getState()
      .setProgress(percent, detail.line || 'Generating proxy...', 'Generating Proxy')
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
    isGenerating = false
  }
}
