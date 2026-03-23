import { useCanvasStore } from '../store/canvasStore'
import { localPathToMediaUrl } from './projectSerializer'
import { importImageFromAbsolutePath } from './imageImport'
import { isRasterFilePath, isVideoFilePath } from './mediaFileExtensions'
import { defaultVideoTileSizeForNew, maxVideoTileOuterSize } from './tileSizing'
import { setVideoPlaybackSuspended } from './videoGlobalPlayback'
import { requestVideoWarmupEarly } from './warmupCanvasMedia'
import type { ImageItem, VideoItem } from '../types'

/** Above this count, enable global “Stop all” so the machine is not flooded with decoders. */
const AUTO_SUSPEND_PLAYBACK_FILE_COUNT = 20

const ROW_CAP = 20
const SECTION_GAP = 48
const GAP = 16
/** Параллельное чтение картинок с диска — не блокирует конец импорта на сотнях файлов подряд. */
const IMAGE_IMPORT_CONCURRENCY = 6

async function mapPool<T, R>(
  arr: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(arr.length)
  let next = 0
  const worker = async () => {
    while (true) {
      const idx = next++
      if (idx >= arr.length) break
      results[idx] = await mapper(arr[idx], idx)
    }
  }
  const n = Math.min(concurrency, Math.max(1, arr.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

function pathBasename(p: string): string {
  const s = p.replace(/\\/g, '/')
  const i = s.lastIndexOf('/')
  return i >= 0 ? s.slice(i + 1) : s
}

function nextId(prefix: string, i: number): string {
  return `${prefix}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`
}

async function resolveVideoSrcUrl(localPath: string): Promise<string> {
  const projectAPI = (window as any).electronAPI?.projectAPI
  if (!projectAPI?.resolveVideoSource) {
    return localPathToMediaUrl(localPath)
  }
  try {
    const payload = await projectAPI.resolveVideoSource(localPath)
    return payload?.srcUrl || localPathToMediaUrl(localPath)
  } catch {
    return localPathToMediaUrl(localPath)
  }
}

/**
 * Add tiles from absolute file paths (videos + raster images). Used by “Add folder”.
 * Videos are placed on a fixed grid (max cell = worst-case video tile size) so metadata
 * resize does not overlap. Images are packed below in rows of ROW_CAP.
 */
export async function importMediaPathsToCanvas(
  rawPaths: string[],
  worldAnchor: { x: number; y: number },
): Promise<void> {
  const paths = [...rawPaths]
    .filter((p) => isVideoFilePath(p) || isRasterFilePath(p))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  if (paths.length > AUTO_SUSPEND_PLAYBACK_FILE_COUNT) {
    setVideoPlaybackSuspended(true)
  }

  const videoPaths = paths.filter((p) => isVideoFilePath(p))
  const imagePaths = paths.filter((p) => isRasterFilePath(p))

  const addItems = useCanvasStore.getState().addItems
  const setSelection = useCanvasStore.getState().setSelection

  const footprint = maxVideoTileOuterSize()
  const defaultVid = defaultVideoTileSizeForNew()
  const cellW = footprint.width + GAP
  const cellH = footprint.height + GAP

  /** Top-left of grid so worldAnchor stays the visual center of the first cell */
  const originX = worldAnchor.x - footprint.width / 2
  const originY = worldAnchor.y - footprint.height / 2

  const newIds: string[] = []
  const pendingItems: Array<VideoItem | ImageItem> = []

  for (let i = 0; i < videoPaths.length; i++) {
    const p = videoPaths[i]
    const srcUrl = await resolveVideoSrcUrl(p)
    const row = Math.floor(i / ROW_CAP)
    const col = i % ROW_CAP
    const tile: VideoItem = {
      type: 'video',
      id: nextId('tile', i),
      srcUrl,
      fileName: pathBasename(p),
      x: originX + col * cellW,
      y: originY + row * cellH,
      width: defaultVid.width,
      height: defaultVid.height,
    }
    pendingItems.push(tile)
    newIds.push(tile.id)
  }

  if (videoPaths.length > 0) {
    const earlyUrls = pendingItems
      .filter((i): i is VideoItem => i.type === 'video')
      .map((i) => i.srcUrl)
    queueMicrotask(() => requestVideoWarmupEarly(earlyUrls))
  }

  let imageStartY = originY
  if (videoPaths.length > 0) {
    const rows = Math.ceil(videoPaths.length / ROW_CAP)
    imageStartY = originY + rows * cellH + SECTION_GAP
  }

  type ImgRow = { item: ImageItem }[]
  const rows: ImgRow[] = []
  let currentRow: ImgRow = []

  const imageLoads = await mapPool(imagePaths, IMAGE_IMPORT_CONCURRENCY, async (p, ip) => {
    try {
      const payload = await importImageFromAbsolutePath(p)
      return { ok: true as const, ip, p, payload }
    } catch (err) {
      return { ok: false as const, ip, p, err }
    }
  })

  for (const r of imageLoads) {
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(r.err)
      alert(`${pathBasename(r.p)}: ${r.err instanceof Error ? r.err.message : String(r.err)}`)
      continue
    }
    const { payload, p, ip } = r
    const img: ImageItem = {
      type: 'image',
      id: nextId('img', ip),
      srcUrl: payload.srcUrl,
      storage: payload.storage,
      sourceVideoId: '',
      fileName: pathBasename(p),
      sourceFilePath: payload.sourceFilePath,
      ...(payload.projectAssetPath ? { projectAssetPath: payload.projectAssetPath } : {}),
      naturalWidth: payload.naturalWidth,
      naturalHeight: payload.naturalHeight,
      x: 0,
      y: 0,
      width: payload.width,
      height: payload.height,
    }
    currentRow.push({ item: img })
    if (currentRow.length >= ROW_CAP) {
      rows.push(currentRow)
      currentRow = []
    }
  }
  if (currentRow.length > 0) rows.push(currentRow)

  let y = imageStartY
  for (const row of rows) {
    let x = originX
    let rowH = 0
    for (const { item } of row) {
      item.x = x
      item.y = y
      rowH = Math.max(rowH, item.height)
      x += item.width + GAP
    }
    for (const { item } of row) {
      pendingItems.push(item)
      newIds.push(item.id)
    }
    y += rowH + GAP
  }

  if (pendingItems.length > 0) {
    addItems(pendingItems)
  }

  if (newIds.length > 0) {
    setSelection(newIds)
  }
}
