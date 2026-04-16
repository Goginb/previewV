import { useCanvasStore } from '../store/canvasStore'
import type { CanvasItem } from '../types'
import { mediaUrlToLocalPath } from './projectSerializer'

const HYDRATE_VIDEO_RESOLVE_CONCURRENCY = 2

function normalizePathKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
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
  const n = Math.min(Math.max(1, concurrency), Math.max(1, arr.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
}

export function hydrateProjectVideoSources(
  items: CanvasItem[],
  isRunCurrent: () => boolean,
): void {
  const pending = items
    .filter((item): item is Extract<CanvasItem, { type: 'video' }> => item.type === 'video')
    .map((item) => {
      const sourcePathFromSrc = mediaUrlToLocalPath(item.srcUrl)
      const originalPath = item.sourceFilePath || sourcePathFromSrc
      if (!originalPath) return null
      return {
        id: item.id,
        sourceFilePath: originalPath,
        proxyFilePath: item.proxyFilePath,
        proxyForSourcePath: item.proxyForSourcePath,
        changed: item.sourceFilePath !== originalPath,
      }
    })
    .filter((entry): entry is {
      id: string
      sourceFilePath: string
      proxyFilePath?: string
      proxyForSourcePath?: string
      changed: boolean
    } => !!entry)
  if (pending.length === 0) return
  if (!isRunCurrent()) return

  const sourceOnlyUpdates = pending
    .filter((entry) => entry.changed)
    .map((entry) => ({
      id: entry.id,
      updates: {
        sourceFilePath: entry.sourceFilePath,
      },
    }))
  if (sourceOnlyUpdates.length > 0) {
    useCanvasStore.getState().updateItemsBatch(sourceOnlyUpdates, { recordHistory: false, markDirty: false })
  }

  const projectAPI = window.electronAPI?.projectAPI
  if (!projectAPI?.resolveVideoSource) return

  void mapPool(pending, HYDRATE_VIDEO_RESOLVE_CONCURRENCY, async (entry) => {
    if (!isRunCurrent()) return
    let resolved: {
      srcUrl: string
      sourceFilePath: string
      transcoded: boolean
      proxyFilePath?: string
      proxyForSourcePath?: string
    }
    try {
      resolved = await projectAPI.resolveVideoSource(entry.sourceFilePath, {
        projectPath: useCanvasStore.getState().currentProjectPath,
        existingProxyPath:
          entry.proxyFilePath &&
          entry.proxyForSourcePath &&
          normalizePathKey(entry.proxyForSourcePath) === normalizePathKey(entry.sourceFilePath)
            ? entry.proxyFilePath
            : null,
      })
    } catch (error) {
      console.warn(
        `[PreviewV][video-hydrate] tile=${entry.id} resolve failed for "${entry.sourceFilePath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return
    }
    if (!isRunCurrent()) return

    const state = useCanvasStore.getState()
    const current = state.items.find((item): item is Extract<CanvasItem, { type: 'video' }> =>
      item.type === 'video' && item.id === entry.id,
    )
    if (!current) return

    const currentSource = current.sourceFilePath || mediaUrlToLocalPath(current.srcUrl)
    if (currentSource && normalizePathKey(currentSource) !== normalizePathKey(entry.sourceFilePath)) {
      // Tile was updated by a newer hydration run or user action; avoid stale overwrite.
      return
    }

    const nextSrc = (resolved.srcUrl || '').trim()
    const nextSource = (resolved.sourceFilePath || entry.sourceFilePath).trim()
    if (!nextSrc || !nextSource) return
    const nextProxy = resolved.proxyFilePath?.trim()
    const nextProxySource = resolved.proxyForSourcePath?.trim()
    if (
      current.srcUrl === nextSrc &&
      current.sourceFilePath === nextSource &&
      current.proxyFilePath === nextProxy &&
      current.proxyForSourcePath === nextProxySource
    ) return

    state.updateItemsBatch(
      [
        {
          id: entry.id,
          updates: {
            srcUrl: nextSrc,
            sourceFilePath: nextSource,
            proxyFilePath: nextProxy,
            proxyForSourcePath: nextProxySource,
          },
        },
      ],
      { recordHistory: false, markDirty: false },
    )
    console.info(
      `[PreviewV][video-hydrate] tile=${entry.id} source="${entry.sourceFilePath}" src="${nextSrc}" transcoded=${String(resolved.transcoded)}`,
    )
  })
}
