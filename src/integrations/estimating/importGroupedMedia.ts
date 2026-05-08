import { BACKDROP_COLOR_PRESETS, createBackdropItem } from '../../components/BackdropTile'
import { useCanvasStore } from '../../store/canvasStore'
import type { BackdropItem, CanvasItem, ImageItem, NoteItem, VideoItem } from '../../types'
import { importImageFromAbsolutePath } from '../../utils/imageImport'
import { isRasterFilePath, isVideoFilePath } from '../../utils/mediaFileExtensions'
import { getNoteCreationMetricsForText } from '../../utils/noteCreation'
import { localPathToMediaUrl } from '../../utils/projectSerializer'
import { normalizePathKey } from '../../utils/sourcePaths'
import { defaultVideoTileSizeForNew } from '../../utils/tileSizing'
import { backdropHeaderHeight } from '../../utils/backdrops'
import { getEstimatingVideoMinimumWidth, getEstimatingVideoPanelHeight } from './EstimatingVideoFields'
import { useEstimatingIntegrationStore } from './store'
import type { EstimatingSessionShot } from './types'

/**
 * Estimating-linked import rules:
 * - used only for missing media arriving from Estimating Tool
 * - preserves normal PreviewV "Add folder" behavior elsewhere
 * - first import groups by brief, creates backdrops, and adds note tiles
 * - later reopen must restore saved linked canvas instead of rebuilding it
 *
 * See also: INTEGRATION_GUARDRAILS.md in this folder.
 */
const TILE_GAP = 16
const GROUP_GAP = 72
const GROUP_NOTE_GAP = 24
const GROUP_ROW_CAP = 5
const IMAGE_IMPORT_CONCURRENCY = 6
const VIDEO_RESOLVE_CONCURRENCY = 3
const BACKDROP_PAD = 28
const BACKDROP_LABEL_SIZE: BackdropItem['labelSize'] = 'sm'
const NOTE_COLOR = '#0f766e'
const MIXED_NOTE_PREVIEW_LIMIT = 12
const TITLE_H = 24
const CONTROLS_H = 34
const VIDEO_BODY_MIN_H = 80

interface ImportEntry {
  path: string
  fileName: string
  shot: EstimatingSessionShot | null
}

interface GroupDefinition {
  id: string
  title: string
  noteText: string
  entries: ImportEntry[]
  color: string
}

type ImportedTile =
  | {
      kind: 'video'
      id: string
      item: VideoItem
      resolvePath: string
      currentSrcUrl: string
    }
  | {
      kind: 'image'
      id: string
      item: ImageItem
    }

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
  const count = Math.min(concurrency, Math.max(1, arr.length))
  await Promise.all(Array.from({ length: count }, () => worker()))
  return results
}

function pathBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function nextId(prefix: string, index: number): string {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeBriefKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function toSingleLine(value: string, maxLength = 52): string {
  const compact = value.trim().replace(/\s+/g, ' ')
  if (!compact) return ''
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trimEnd()}…` : compact
}

function labelForEntry(entry: ImportEntry): string {
  return (
    entry.shot?.shotCode?.trim() ||
    entry.shot?.sceneName?.trim() ||
    entry.fileName
  )
}

function buildMixedNoteText(entries: ImportEntry[], language: 'en' | 'ru'): string {
  if (entries.length === 0) {
    return language === 'ru' ? 'Разные ТЗ' : 'Mixed briefs'
  }

  const rows = entries.slice(0, MIXED_NOTE_PREVIEW_LIMIT).map((entry) => {
    const title = labelForEntry(entry)
    const brief = entry.shot?.brief?.trim() || (language === 'ru' ? 'Без ТЗ' : 'No brief')
    return `${title}\n${brief}`
  })

  if (entries.length > MIXED_NOTE_PREVIEW_LIMIT) {
    rows.push(
      language === 'ru'
        ? `+ ещё ${entries.length - MIXED_NOTE_PREVIEW_LIMIT}`
        : `+ ${entries.length - MIXED_NOTE_PREVIEW_LIMIT} more`,
    )
  }

  return rows.join('\n\n')
}

function buildBackdropTitle(
  brief: string,
  count: number,
  language: 'en' | 'ru',
): string {
  const summary = toSingleLine(brief)
  const prefix = language === 'ru' ? `ТЗ · ${count}` : `Brief · ${count}`
  return summary ? `${prefix} · ${summary}` : prefix
}

function buildMixedGroupTitle(count: number, language: 'en' | 'ru'): string {
  return language === 'ru' ? `Разные ТЗ · ${count}` : `Mixed briefs · ${count}`
}

async function resolveVideoSrcUrl(
  localPath: string,
  projectPath: string | null,
): Promise<{ srcUrl: string; proxyFilePath?: string; proxyForSourcePath?: string }> {
  const projectAPI = window.electronAPI?.projectAPI
  if (!projectAPI?.resolveVideoSource) {
    return { srcUrl: localPathToMediaUrl(localPath) }
  }

  try {
    const payload = await projectAPI.resolveVideoSource(localPath, {
      projectPath,
      generateProxy: false,
    })
    return {
      srcUrl: payload?.srcUrl || localPathToMediaUrl(localPath),
      ...(payload?.proxyFilePath ? { proxyFilePath: payload.proxyFilePath } : {}),
      ...(payload?.proxyForSourcePath ? { proxyForSourcePath: payload.proxyForSourcePath } : {}),
    }
  } catch {
    return { srcUrl: localPathToMediaUrl(localPath) }
  }
}

function buildGroups(entries: ImportEntry[], language: 'en' | 'ru'): GroupDefinition[] {
  const repeatedBriefBuckets = new Map<
    string,
    { brief: string; entries: ImportEntry[]; firstIndex: number }
  >()
  const mixedEntries: ImportEntry[] = []

  entries.forEach((entry, index) => {
    const brief = entry.shot?.brief?.trim() || ''
    const briefKey = normalizeBriefKey(brief)
    if (!briefKey) {
      mixedEntries.push(entry)
      return
    }

    const bucket = repeatedBriefBuckets.get(briefKey)
    if (bucket) {
      bucket.entries.push(entry)
      return
    }

    repeatedBriefBuckets.set(briefKey, {
      brief,
      entries: [entry],
      firstIndex: index,
    })
  })

  const repeatedGroups = [...repeatedBriefBuckets.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .filter((bucket) => bucket.entries.length >= 2)

  const uniqueBriefEntries = [...repeatedBriefBuckets.values()]
    .filter((bucket) => bucket.entries.length < 2)
    .flatMap((bucket) => bucket.entries)

  const mixedGroupEntries = [...uniqueBriefEntries, ...mixedEntries]

  const groups: GroupDefinition[] = repeatedGroups.map((bucket, index) => ({
    id: `brief-group-${index}`,
    title: buildBackdropTitle(bucket.brief, bucket.entries.length, language),
    noteText: bucket.brief,
    entries: [...bucket.entries].sort((a, b) =>
      labelForEntry(a).localeCompare(labelForEntry(b), undefined, { sensitivity: 'base' }),
    ),
    color: BACKDROP_COLOR_PRESETS[index % BACKDROP_COLOR_PRESETS.length],
  }))

  if (mixedGroupEntries.length > 0) {
    groups.push({
      id: 'mixed-brief-group',
      title: buildMixedGroupTitle(mixedGroupEntries.length, language),
      noteText: buildMixedNoteText(mixedGroupEntries, language),
      entries: [...mixedGroupEntries].sort((a, b) =>
        labelForEntry(a).localeCompare(labelForEntry(b), undefined, { sensitivity: 'base' }),
      ),
      color: BACKDROP_COLOR_PRESETS[groups.length % BACKDROP_COLOR_PRESETS.length],
    })
  }

  return groups
}

function computeBaseOrigin(worldAnchor: { x: number; y: number }): { x: number; y: number } {
  const items = useCanvasStore.getState().items
  if (items.length === 0) {
    return { x: worldAnchor.x, y: worldAnchor.y }
  }

  let minX = Infinity
  let maxY = -Infinity
  for (const item of items) {
    minX = Math.min(minX, item.x)
    maxY = Math.max(maxY, item.y + item.height)
  }

  return { x: minX, y: maxY + GROUP_GAP }
}

async function importEntryTile(entry: ImportEntry, index: number): Promise<ImportedTile | null> {
  if (isVideoFilePath(entry.path)) {
    const srcUrl = localPathToMediaUrl(entry.path)
    const item: VideoItem = {
      type: 'video',
      id: nextId('tile', index),
      srcUrl,
      fileName: entry.fileName,
      sourceFilePath: entry.path,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }
    return {
      kind: 'video',
      id: item.id,
      item,
      resolvePath: entry.path,
      currentSrcUrl: srcUrl,
    }
  }

  if (!isRasterFilePath(entry.path)) {
    return null
  }

  try {
    const payload = await importImageFromAbsolutePath(entry.path)
    const item: ImageItem = {
      type: 'image',
      id: nextId('img', index),
      srcUrl: payload.srcUrl,
      storage: payload.storage,
      sourceVideoId: '',
      fileName: entry.fileName,
      sourceFilePath: payload.sourceFilePath,
      ...(payload.projectAssetPath ? { projectAssetPath: payload.projectAssetPath } : {}),
      naturalWidth: payload.naturalWidth,
      naturalHeight: payload.naturalHeight,
      x: 0,
      y: 0,
      width: payload.width,
      height: payload.height,
    }
    return { kind: 'image', id: item.id, item }
  } catch (error) {
    console.error(error)
    alert(
      `${entry.fileName}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

export async function importEstimatingGroupedMediaToCanvas(
  rawPaths: string[],
  worldAnchor: { x: number; y: number },
): Promise<void> {
  const store = useEstimatingIntegrationStore.getState()
  const language = store.context?.language ?? 'en'
  const shotsBySourceKey = store.shotsBySourceKey
  const writableTaskCount = store.writableTasks.length
  const baseOrigin = computeBaseOrigin(worldAnchor)
  const supportedPaths = rawPaths.filter((path) => isVideoFilePath(path) || isRasterFilePath(path))

  if (supportedPaths.length === 0) {
    return
  }

  const uniquePaths = new Map<string, string>()
  for (const path of supportedPaths) {
    const normalized = normalizePathKey(path)
    if (!uniquePaths.has(normalized)) {
      uniquePaths.set(normalized, path)
    }
  }

  const entries = [...uniquePaths.values()].map((path) => ({
    path,
    fileName: pathBasename(path),
    shot: shotsBySourceKey[normalizePathKey(path)] ?? null,
  }))

  const groups = buildGroups(entries, language)
  if (groups.length === 0) {
    return
  }

  const importedTiles = await mapPool(entries, IMAGE_IMPORT_CONCURRENCY, (entry, index) =>
    importEntryTile(entry, index),
  )
  const tileByPathKey = new Map<string, ImportedTile>()
  for (const tile of importedTiles) {
    if (!tile) continue
    const sourcePath =
      tile.kind === 'video'
        ? tile.resolvePath
        : tile.item.sourceFilePath
    if (!sourcePath) continue
    tileByPathKey.set(normalizePathKey(sourcePath), tile)
  }

  const defaultVideoSize = defaultVideoTileSizeForNew()
  const tileMinWidth = Math.max(defaultVideoSize.width, getEstimatingVideoMinimumWidth(writableTaskCount))
  const estimatingPanelHeight = getEstimatingVideoPanelHeight(writableTaskCount, tileMinWidth)
  const tileMinHeight = Math.max(
    defaultVideoSize.height,
    TITLE_H + VIDEO_BODY_MIN_H + CONTROLS_H + estimatingPanelHeight,
  )
  const headerHeight = backdropHeaderHeight(BACKDROP_LABEL_SIZE)

  const canvasItems: CanvasItem[] = []
  const selectionIds: string[] = []
  const videoResolveQueue: Array<{ id: string; originalPath: string; currentSrcUrl: string }> = []

  let cursorY = 0
  const contentBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  }

  groups.forEach((group, groupIndex) => {
    const groupTiles = group.entries
      .map((entry) => tileByPathKey.get(normalizePathKey(entry.path)) ?? null)
      .filter((tile): tile is ImportedTile => !!tile)

    if (groupTiles.length === 0) {
      return
    }

    const noteMetrics = getNoteCreationMetricsForText(1, group.noteText)
    const noteWidth = noteMetrics.width
    const noteHeight = noteMetrics.height

    let rowWidth = 0
    let rowHeight = 0
    let gridWidth = 0
    let gridHeight = 0

    groupTiles.forEach((tile, index) => {
      const column = index % GROUP_ROW_CAP
      const row = Math.floor(index / GROUP_ROW_CAP)
      const width = tile.kind === 'video' ? tileMinWidth : tile.item.width
      const height = tile.kind === 'video' ? tileMinHeight : tile.item.height

      if (column === 0) {
        rowWidth = 0
        rowHeight = 0
      }

      rowWidth += (column === 0 ? 0 : TILE_GAP) + width
      rowHeight = Math.max(rowHeight, height)
      gridWidth = Math.max(gridWidth, rowWidth)

      const isRowEnd = column === GROUP_ROW_CAP - 1 || index === groupTiles.length - 1
      if (isRowEnd) {
        gridHeight += (row === 0 ? 0 : TILE_GAP) + rowHeight
      }
    })

    const groupContentWidth = gridWidth + GROUP_NOTE_GAP + noteWidth
    const groupContentHeight = Math.max(gridHeight, noteHeight)
    const backdropWidth = BACKDROP_PAD * 2 + groupContentWidth
    const backdropHeight = headerHeight + BACKDROP_PAD * 2 + groupContentHeight
    const innerX = BACKDROP_PAD
    const innerY = headerHeight + BACKDROP_PAD
    const noteX = innerX + gridWidth + GROUP_NOTE_GAP
    const noteY = innerY
    const backdropX = 0
    const backdropY = cursorY

    const note: NoteItem = {
      type: 'note',
      id: nextId('note', groupIndex),
      x: backdropX + noteX,
      y: backdropY + noteY,
      width: noteWidth,
      height: noteHeight,
      text: group.noteText,
      color: NOTE_COLOR,
      fontSizeTier: noteMetrics.fontSizeTier,
      fontFamily: 'segoe',
    }

    const attachedIds = groupTiles.map((tile) => tile.id).concat(note.id)
    const backdrop = createBackdropItem({
      id: nextId('backdrop', groupIndex),
      x: backdropX,
      y: backdropY,
      width: backdropWidth,
      height: backdropHeight,
      color: group.color,
      brightness: 36,
      saturation: 92,
      label: group.title,
      labelSize: BACKDROP_LABEL_SIZE,
      attachedVideoIds: attachedIds,
    })

    canvasItems.push(note)
    canvasItems.push(backdrop)

    let tileCursorY = backdropY + innerY
    let tileCursorX = backdropX + innerX
    let currentRowHeight = 0

    groupTiles.forEach((tile, index) => {
      const isVideo = tile.kind === 'video'
      const width = isVideo ? tileMinWidth : tile.item.width
      const height = isVideo ? tileMinHeight : tile.item.height
      const column = index % GROUP_ROW_CAP

      if (column === 0 && index > 0) {
        tileCursorY += currentRowHeight + TILE_GAP
        tileCursorX = backdropX + innerX
        currentRowHeight = 0
      }

      tile.item.x = tileCursorX
      tile.item.y = tileCursorY
      tile.item.width = width
      tile.item.height = height
      canvasItems.push(tile.item)
      selectionIds.push(tile.id)

      if (isVideo) {
        videoResolveQueue.push({
          id: tile.id,
          originalPath: tile.resolvePath,
          currentSrcUrl: tile.currentSrcUrl,
        })
      }

      tileCursorX += width + TILE_GAP
      currentRowHeight = Math.max(currentRowHeight, height)
    })

    contentBounds.minX = Math.min(contentBounds.minX, backdrop.x)
    contentBounds.minY = Math.min(contentBounds.minY, backdrop.y)
    contentBounds.maxX = Math.max(contentBounds.maxX, backdrop.x + backdrop.width)
    contentBounds.maxY = Math.max(contentBounds.maxY, backdrop.y + backdrop.height)

    cursorY += backdropHeight + GROUP_GAP
  })

  if (canvasItems.length === 0) {
    return
  }

  const offsetX =
    baseOrigin.x -
    ((contentBounds.minX + contentBounds.maxX) / 2)
  const offsetY = baseOrigin.y - contentBounds.minY

  const positionedItems = canvasItems.map((item) => ({
    ...item,
    x: item.x + offsetX,
    y: item.y + offsetY,
  }))

  const addItems = useCanvasStore.getState().addItems
  const setSelection = useCanvasStore.getState().setSelection
  const updateItemsBatch = useCanvasStore.getState().updateItemsBatch
  const currentProjectPath = useCanvasStore.getState().currentProjectPath

  addItems(positionedItems)
  if (selectionIds.length > 0) {
    setSelection(selectionIds)
  }

  if (videoResolveQueue.length === 0) {
    return
  }

  void mapPool(videoResolveQueue, VIDEO_RESOLVE_CONCURRENCY, async (entry) => {
    const resolved = await resolveVideoSrcUrl(entry.originalPath, currentProjectPath)
    if (!resolved.srcUrl || resolved.srcUrl === entry.currentSrcUrl) {
      return null
    }

    return {
      id: entry.id,
      updates: {
        srcUrl: resolved.srcUrl,
        ...(resolved.proxyFilePath ? { proxyFilePath: resolved.proxyFilePath } : {}),
        ...(resolved.proxyForSourcePath ? { proxyForSourcePath: resolved.proxyForSourcePath } : {}),
      },
    }
  }).then((updates) => {
    const batch = updates.filter(
      (update): update is { id: string; updates: { srcUrl: string } } => !!update,
    )
    if (batch.length === 0) {
      return
    }
    updateItemsBatch(batch, { recordHistory: false, markDirty: false })
  })
}
