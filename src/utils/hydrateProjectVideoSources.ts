import { useCanvasStore } from '../store/canvasStore'
import { usePreloadStore } from '../store/preloadStore'
import type { CanvasItem } from '../types'
import { mediaUrlToLocalPath } from './projectSerializer'

const HYDRATE_VIDEO_RESOLVE_CONCURRENCY = 4
const HYDRATE_ALWAYS_RESOLVE_EXT = new Set(['.mkv', '.avi', '.m4v'])

function normalizePathKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

function getFileExt(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const dot = normalized.lastIndexOf('.')
  if (dot < 0) return ''
  return normalized.slice(dot).toLowerCase()
}

function getFileLabel(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function needsProjectVideoHydration(items: CanvasItem[]): boolean {
  // This helper is intentionally conservative for linked Estimating projects:
  // skip expensive reopen hydration only when saved source/proxy state already
  // looks valid. If this returns false incorrectly, linked PreviewV may reopen
  // fast but lose playable video sources.
  return items.some((item) => {
    if (item.type !== 'video') {
      return false
    }

    const srcPathFromSrc = mediaUrlToLocalPath(item.srcUrl)
    const sourcePath = item.sourceFilePath || srcPathFromSrc

    if (!sourcePath || !srcPathFromSrc) {
      return true
    }

    const normalizedSource = normalizePathKey(sourcePath)
    const normalizedSrc = normalizePathKey(srcPathFromSrc)
    const proxyPath = item.proxyFilePath?.trim()
    const proxyForSourcePath = item.proxyForSourcePath?.trim()
    const hasMatchingProxy =
      !!proxyPath &&
      !!proxyForSourcePath &&
      normalizePathKey(proxyForSourcePath) === normalizedSource &&
      normalizePathKey(proxyPath) === normalizedSrc

    const ext = getFileExt(sourcePath)
    if (HYDRATE_ALWAYS_RESOLVE_EXT.has(ext)) {
      return !hasMatchingProxy
    }

    if (normalizedSrc === normalizedSource) {
      return false
    }

    if (hasMatchingProxy) {
      return false
    }

    return true
  })
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
      const hasUsableProxy =
        !!item.proxyFilePath &&
        !!item.proxyForSourcePath &&
        normalizePathKey(item.proxyForSourcePath) === normalizePathKey(originalPath)
      const srcMatchesSource =
        !!sourcePathFromSrc && normalizePathKey(sourcePathFromSrc) === normalizePathKey(originalPath)
      const srcMatchesProxy =
        !!sourcePathFromSrc &&
        !!item.proxyFilePath &&
        normalizePathKey(sourcePathFromSrc) === normalizePathKey(item.proxyFilePath)
      const ext = getFileExt(originalPath)
      const shouldSkipResolve =
        // Fast path for non-proxy formats: avoid thousands of no-op IPC resolves on large projects.
        (!HYDRATE_ALWAYS_RESOLVE_EXT.has(ext) && !hasUsableProxy && srcMatchesSource) ||
        // If tile already points at a matched proxy, keep as-is.
        (hasUsableProxy && srcMatchesProxy)
      return {
        id: item.id,
        sourceFilePath: originalPath,
        proxyFilePath: item.proxyFilePath,
        proxyForSourcePath: item.proxyForSourcePath,
        changed: item.sourceFilePath !== originalPath,
        shouldSkipResolve,
      }
    })
    .filter((entry): entry is {
      id: string
      sourceFilePath: string
      proxyFilePath?: string
      proxyForSourcePath?: string
      changed: boolean
      shouldSkipResolve: boolean
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

  const queueBySource = new Map<
    string,
    {
      sourceFilePath: string
      existingProxyPath: string | null
      itemIds: string[]
      ext: string
      hasUsableProxy: boolean
      srcMatchesProxy: boolean
      srcMatchesSource: boolean
    }
  >()
  for (const entry of pending) {
    const sourceKey = normalizePathKey(entry.sourceFilePath)
    const existing = queueBySource.get(sourceKey)
    const hasUsableProxy =
      !!entry.proxyFilePath &&
      !!entry.proxyForSourcePath &&
      normalizePathKey(entry.proxyForSourcePath) === sourceKey
    const sourcePathFromSrc = mediaUrlToLocalPath(
      items.find((item): item is Extract<CanvasItem, { type: 'video' }> => item.type === 'video' && item.id === entry.id)
        ?.srcUrl ?? '',
    )
    const srcMatchesProxy =
      !!sourcePathFromSrc && !!entry.proxyFilePath && normalizePathKey(sourcePathFromSrc) === normalizePathKey(entry.proxyFilePath)
    const srcMatchesSource =
      !!sourcePathFromSrc && normalizePathKey(sourcePathFromSrc) === sourceKey
    const existingProxyPath = hasUsableProxy ? entry.proxyFilePath ?? null : null
    const ext = getFileExt(entry.sourceFilePath)
    if (existing) {
      existing.itemIds.push(entry.id)
      if (!existing.existingProxyPath && existingProxyPath) existing.existingProxyPath = existingProxyPath
      existing.hasUsableProxy = existing.hasUsableProxy || hasUsableProxy
      existing.srcMatchesProxy = existing.srcMatchesProxy || srcMatchesProxy
      existing.srcMatchesSource = existing.srcMatchesSource || srcMatchesSource
      continue
    }
    queueBySource.set(sourceKey, {
      sourceFilePath: entry.sourceFilePath,
      existingProxyPath,
      itemIds: [entry.id],
      ext,
      hasUsableProxy,
      srcMatchesProxy,
      srcMatchesSource,
    })
  }

  const uniqueSources = Array.from(queueBySource.values())
  if (uniqueSources.length === 0) return

  void (async () => {
    const inspectMap = new Map<string, { isProres: boolean; isMjpeg: boolean; hasProxy: boolean }>()
    if (projectAPI.inspectVideoSources) {
      const inspectPaths = uniqueSources
        .filter((s) => s.ext === '.mov')
        .map((s) => s.sourceFilePath)
      if (inspectPaths.length > 0) {
        usePreloadStore.getState().setOpen(true)
        usePreloadStore
          .getState()
          .setProgress(2, `Inspecting ${inspectPaths.length} MOV sources...`, 'Loading project media')
      }
      try {
        const rows = await projectAPI.inspectVideoSources({
          paths: inspectPaths,
          projectPath: useCanvasStore.getState().currentProjectPath,
        })
        for (const row of rows) {
          inspectMap.set(normalizePathKey(row.path), {
            isProres: row.isProres,
            isMjpeg: row.isMjpeg,
            hasProxy: row.hasProxy,
          })
        }
      } catch {
        // inspection is optional optimization
      }
    }

    const resolveQueue = uniqueSources.filter((s) => {
      const inspected = inspectMap.get(normalizePathKey(s.sourceFilePath))
      if (inspected) {
        if (inspected.isProres) {
          if (s.hasUsableProxy && s.srcMatchesProxy) return false
          if (!inspected.hasProxy && !s.hasUsableProxy) return false
          return true
        }
        if (inspected.isMjpeg) {
          if (s.hasUsableProxy && s.srcMatchesProxy) return false
          if (!inspected.hasProxy && !s.hasUsableProxy) return false
          return true
        }
        // Other MOV: normalize stale src once (e.g. old temp proxies).
        if (s.ext === '.mov') return true
        return false
      }
      // Fallback when inspection is unavailable: keep old behavior for formats that historically needed resolve.
      if (HYDRATE_ALWAYS_RESOLVE_EXT.has(s.ext)) return true
      if (s.ext === '.mov') return true
      if (s.hasUsableProxy && !s.srcMatchesProxy) return true
      return false
    })
    if (resolveQueue.length === 0) return

    const bySource = new Map<
      string,
      {
        sourceFilePath: string
        existingProxyPath: string | null
        itemIds: string[]
      }
    >()
    for (const source of resolveQueue) {
      bySource.set(normalizePathKey(source.sourceFilePath), {
        sourceFilePath: source.sourceFilePath,
        existingProxyPath: source.existingProxyPath,
        itemIds: source.itemIds,
      })
    }
    const dedupedResolveQueue = Array.from(bySource.values())
    if (dedupedResolveQueue.length === 0) return

    const preload = usePreloadStore.getState()
    preload.setOpen(true)
    preload.setProgress(8, `Preparing ${dedupedResolveQueue.length} video sources...`, 'Loading project media')

    let completed = 0
    let failed = 0
    const total = dedupedResolveQueue.length
    const pendingUpdates = new Map<string, {
      srcUrl: string
      sourceFilePath: string
      proxyFilePath?: string
      proxyForSourcePath?: string
    }>()
    const flushUpdates = () => {
      if (pendingUpdates.size === 0) return
      const updates = Array.from(pendingUpdates.entries()).map(([id, updates]) => ({ id, updates }))
      pendingUpdates.clear()
      useCanvasStore.getState().updateItemsBatch(updates, { recordHistory: false, markDirty: false })
    }

    await mapPool(dedupedResolveQueue, HYDRATE_VIDEO_RESOLVE_CONCURRENCY, async (task) => {
      if (!isRunCurrent()) return
      const inProgressPct = Math.min(99, Math.round((completed / Math.max(1, total)) * 100))
      usePreloadStore.getState().setOpen(true)
      usePreloadStore
        .getState()
        .setProgress(inProgressPct, `Loading: ${getFileLabel(task.sourceFilePath)}`, 'Loading project media')

      try {
        const doResolve = async () =>
          projectAPI.resolveVideoSource(task.sourceFilePath, {
            projectPath: useCanvasStore.getState().currentProjectPath,
            existingProxyPath: task.existingProxyPath,
          })
        let resolved = await doResolve()
        if (!resolved?.srcUrl) {
          // One safe retry for transient FS/IPC hiccups on network paths.
          resolved = await doResolve()
        }
        if (!isRunCurrent()) return

        const state = useCanvasStore.getState()

        const nextSrc = (resolved.srcUrl || '').trim()
        const nextSource = (resolved.sourceFilePath || task.sourceFilePath).trim()
        if (!nextSrc || !nextSource) {
          failed += 1
          return
        }
        const nextProxy = resolved.proxyFilePath?.trim()
        const nextProxySource = resolved.proxyForSourcePath?.trim()
        const sourceKey = normalizePathKey(task.sourceFilePath)
        const taskIdSet = new Set(task.itemIds)
        const updates = state.items
          .filter(
            (item): item is Extract<CanvasItem, { type: 'video' }> =>
              item.type === 'video' && taskIdSet.has(item.id),
          )
          .filter((item) => {
            const currentSource = item.sourceFilePath || mediaUrlToLocalPath(item.srcUrl)
            return !!currentSource && normalizePathKey(currentSource) === sourceKey
          })
          .filter((item) => {
            return !(
              item.srcUrl === nextSrc &&
              item.sourceFilePath === nextSource &&
              item.proxyFilePath === nextProxy &&
              item.proxyForSourcePath === nextProxySource
            )
          })
          .map((item) => ({
            id: item.id,
            updates: {
              srcUrl: nextSrc,
              sourceFilePath: nextSource,
              proxyFilePath: nextProxy,
              proxyForSourcePath: nextProxySource,
            },
          }))
        if (updates.length > 0) {
          for (const update of updates) {
            pendingUpdates.set(update.id, update.updates)
          }
          // Keep UI responsive: push batched updates instead of per-source re-render storms.
          if (pendingUpdates.size >= 64) flushUpdates()
        }
        console.info(
          `[PreviewV][video-hydrate] source="${task.sourceFilePath}" tiles=${task.itemIds.length} src="${nextSrc}" transcoded=${String(resolved.transcoded)}`,
        )
      } catch (error) {
        console.warn(
          `[PreviewV][video-hydrate] resolve failed for "${task.sourceFilePath}" (tiles=${task.itemIds.length}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        failed += 1
      } finally {
        completed += 1
        if (!isRunCurrent()) return
        const donePct = Math.min(99, Math.round((completed / Math.max(1, total)) * 100))
        usePreloadStore.getState().setOpen(true)
        usePreloadStore
          .getState()
          .setProgress(donePct, `Loaded ${completed}/${total} sources`, 'Loading project media')
      }
    })
    flushUpdates()
    if (!isRunCurrent()) return
    const store = usePreloadStore.getState()
    const line =
      failed > 0
        ? `Loaded ${completed}/${total} sources (${failed} failed)`
        : `Loaded ${completed}/${total} sources`
    store.setOpen(true)
    store.setProgress(100, line, 'Loading project media')
    window.setTimeout(() => {
      if (!isRunCurrent()) return
      usePreloadStore.getState().reset()
    }, 320)
  })()
}
