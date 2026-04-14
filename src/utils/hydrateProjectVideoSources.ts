import { useCanvasStore } from '../store/canvasStore'
import type { CanvasItem } from '../types'
import { localPathToMediaUrl, mediaUrlToLocalPath } from './projectSerializer'

const VIDEO_RESOLVE_CONCURRENCY = 6

function normalizePathKey(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

async function mapPool<T>(
  arr: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (true) {
      const idx = next++
      if (idx >= arr.length) break
      await mapper(arr[idx], idx)
    }
  }
  const n = Math.min(concurrency, Math.max(1, arr.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
}

async function resolveVideoSrcUrl(localPath: string): Promise<string | null> {
  const projectAPI = window.electronAPI?.projectAPI
  if (!projectAPI?.resolveVideoSource) {
    return localPathToMediaUrl(localPath)
  }
  try {
    const payload = await projectAPI.resolveVideoSource(localPath)
    return payload?.srcUrl || null
  } catch {
    return null
  }
}

export function hydrateProjectVideoSources(
  items: CanvasItem[],
  isRunCurrent: () => boolean,
): void {
  const queue = items
    .filter((item): item is Extract<CanvasItem, { type: 'video' }> => item.type === 'video')
    .map((item) => {
      const originalPath = item.sourceFilePath || mediaUrlToLocalPath(item.srcUrl)
      const currentLocalPath = mediaUrlToLocalPath(item.srcUrl)
      return {
        id: item.id,
        currentSrcUrl: item.srcUrl,
        originalPath,
        currentLocalPath,
      }
    })
    .filter((entry) => {
      if (!entry.originalPath) return false
      // If tile already points to a local proxy path, skip expensive re-resolve.
      if (
        entry.currentLocalPath &&
        normalizePathKey(entry.currentLocalPath) !== normalizePathKey(entry.originalPath)
      ) {
        return false
      }
      return true
    })

  if (queue.length === 0) return

  void mapPool(queue, VIDEO_RESOLVE_CONCURRENCY, async (entry) => {
    const resolvedSrcUrl = await resolveVideoSrcUrl(entry.originalPath)
    // Keep existing src when source file is unavailable on this machine.
    if (!isRunCurrent() || !resolvedSrcUrl || resolvedSrcUrl === entry.currentSrcUrl) return
    useCanvasStore.getState().updateItemsBatch(
      [{ id: entry.id, updates: { srcUrl: resolvedSrcUrl, sourceFilePath: entry.originalPath } }],
      { recordHistory: false, markDirty: false },
    )
  })
}
