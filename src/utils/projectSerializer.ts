import type {
  CanvasItem,
  BackdropItem,
  ImageItem,
  NoteItem,
  VideoItem,
} from '../types'
import type {
  DeserializedProject,
  ProjectCanvasItemV1,
  ProjectCanvasItemV2,
  ProjectFileV2,
  ProjectMeta,
  ViewportState,
} from '../types/project'

export const PROJECT_VERSION = 2

interface DeserializeProjectOptions {
  resolveAssetPath?: (relativePath: string) => string | null
}

interface SerializeProjectOptions {
  items: CanvasItem[]
  viewport: ViewportState
  meta: ProjectMeta
  assetPathForImage: (item: ImageItem) => string
  previewAssetPathForImage?: (item: ImageItem) => string | undefined
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function mustBeNumber(v: unknown, field: string): number {
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`Invalid project: field "${field}" must be a number`)
  }
  return v
}

function mustBeString(v: unknown, field: string): string {
  if (typeof v !== 'string') {
    throw new Error(`Invalid project: field "${field}" must be a string`)
  }
  return v
}

function optionalNumber(v: unknown, field: string): number | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`Invalid project: field "${field}" must be a number`)
  }
  return v
}

function optionalString(v: unknown, _field: string): string | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'string') return undefined
  return v
}

function optionalBackdropLabelSize(v: unknown): 'sm' | 'md' | 'lg' | undefined {
  if (v === undefined) return undefined
  if (v === 'sm' || v === 'md' || v === 'lg') return v
  return undefined
}

function optionalBackdropDisplayMode(v: unknown): 'solid' | 'frame' | undefined {
  if (v === undefined) return undefined
  if (v === 'solid' || v === 'frame') return v
  return undefined
}

function optionalBackdropBrightness(v: unknown): number | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'number' || Number.isNaN(v)) return undefined
  return Math.max(0, Math.min(100, v))
}

function optionalBackdropSaturation(v: unknown): number | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'number' || Number.isNaN(v)) return undefined
  return Math.max(0, Math.min(200, v))
}

function normalizeToForwardSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}

export function localPathToMediaUrl(localPath: string): string {
  const normalized = normalizeToForwardSlashes(localPath).replace(/^\/+/, '')
  return `media:///${normalized}`
}

export function mediaUrlToLocalPath(mediaUrl: string): string {
  if (!mediaUrl.startsWith('media:///')) return ''
  const rest = mediaUrl.slice('media:///'.length)
  let decoded = rest
  try {
    decoded = decodeURIComponent(rest)
  } catch {
    decoded = rest
  }
  return decoded.replace(/\//g, '\\')
}

export function isDataUrl(value: string): boolean {
  return value.startsWith('data:')
}

function validateViewport(raw: unknown): ViewportState {
  if (!isRecord(raw)) throw new Error('Invalid project: viewport must be an object')
  const x = mustBeNumber(raw.x, 'viewport.x')
  const y = mustBeNumber(raw.y, 'viewport.y')
  const scale = mustBeNumber(raw.scale, 'viewport.scale')
  return { x, y, scale }
}

function validateMeta(raw: unknown): ProjectMeta {
  if (!isRecord(raw)) throw new Error('Invalid project: meta must be an object')
  return {
    createdAt: mustBeString(raw.createdAt, 'meta.createdAt'),
    updatedAt: mustBeString(raw.updatedAt, 'meta.updatedAt'),
  }
}

function validateItemV1(raw: unknown): ProjectCanvasItemV1 {
  if (!isRecord(raw)) throw new Error('Invalid project: item must be an object')
  const type = mustBeString(raw.type, 'item.type')

  const id = mustBeString(raw.id, 'item.id')
  const x = mustBeNumber(raw.x, 'item.x')
  const y = mustBeNumber(raw.y, 'item.y')
  const width = mustBeNumber(raw.width, 'item.width')
  const height = mustBeNumber(raw.height, 'item.height')

  if (type === 'video') {
    const fileName = mustBeString(raw.fileName, 'item.fileName')
    const videoPath = mustBeString(raw.videoPath, 'item.videoPath')
    const aspectApplied = raw.aspectApplied
    const uiColor = optionalString(raw.uiColor, 'item.uiColor')
    if (aspectApplied !== undefined && typeof aspectApplied !== 'boolean') {
      throw new Error('Invalid project: field "item.aspectApplied" must be a boolean')
    }
    return {
      type: 'video',
      id,
      x,
      y,
      width,
      height,
      fileName,
      videoPath,
      ...(aspectApplied !== undefined ? { aspectApplied } : {}),
      ...(uiColor !== undefined ? { uiColor } : {}),
    }
  }

  if (type === 'image') {
    const dataUrl = mustBeString(raw.dataUrl, 'item.dataUrl')
    const sourceVideoId =
      raw.sourceVideoId === undefined
        ? ''
        : mustBeString(raw.sourceVideoId, 'item.sourceVideoId')
    const naturalWidth = optionalNumber(raw.naturalWidth, 'item.naturalWidth')
    const naturalHeight = optionalNumber(raw.naturalHeight, 'item.naturalHeight')
    const fileName = optionalString(raw.fileName, 'item.fileName')
    const imageSourcePath = optionalString(raw.imageSourcePath, 'item.imageSourcePath')
    return {
      type: 'image',
      id,
      x,
      y,
      width,
      height,
      dataUrl,
      sourceVideoId,
      ...(naturalWidth !== undefined ? { naturalWidth } : {}),
      ...(naturalHeight !== undefined ? { naturalHeight } : {}),
      ...(fileName !== undefined ? { fileName } : {}),
      ...(imageSourcePath !== undefined ? { imageSourcePath } : {}),
    }
  }

  if (type === 'note') {
    const text = mustBeString(raw.text, 'item.text')
    const fontSize = optionalNumber(raw.fontSize, 'item.fontSize')
    return { type: 'note', id, x, y, width, height, text, ...(fontSize ? { fontSize } : {}) }
  }

  throw new Error(`Invalid project: unknown item.type "${type}"`)
}

function validateItemV2(raw: unknown): ProjectCanvasItemV2 {
  if (!isRecord(raw)) throw new Error('Invalid project: item must be an object')
  const type = mustBeString(raw.type, 'item.type')

  const id = mustBeString(raw.id, 'item.id')
  const x = mustBeNumber(raw.x, 'item.x')
  const y = mustBeNumber(raw.y, 'item.y')
  const width = mustBeNumber(raw.width, 'item.width')
  const height = mustBeNumber(raw.height, 'item.height')

  if (type === 'video') {
    const fileName = mustBeString(raw.fileName, 'item.fileName')
    const videoPath = mustBeString(raw.videoPath, 'item.videoPath')
    const aspectApplied = raw.aspectApplied
    const uiColor = optionalString(raw.uiColor, 'item.uiColor')
    if (aspectApplied !== undefined && typeof aspectApplied !== 'boolean') {
      throw new Error('Invalid project: field "item.aspectApplied" must be a boolean')
    }
    return {
      type: 'video',
      id,
      x,
      y,
      width,
      height,
      fileName,
      videoPath,
      ...(aspectApplied !== undefined ? { aspectApplied } : {}),
      ...(uiColor !== undefined ? { uiColor } : {}),
    }
  }

  if (type === 'image') {
    const storage = mustBeString(raw.storage, 'item.storage')
    const sourceVideoId =
      raw.sourceVideoId === undefined
        ? ''
        : mustBeString(raw.sourceVideoId, 'item.sourceVideoId')
    const naturalWidth = optionalNumber(raw.naturalWidth, 'item.naturalWidth')
    const naturalHeight = optionalNumber(raw.naturalHeight, 'item.naturalHeight')
    const fileName = optionalString(raw.fileName, 'item.fileName')

    if (storage === 'linked') {
      const imageSourcePath = mustBeString(raw.imageSourcePath, 'item.imageSourcePath')
      const previewAssetPath = optionalString(raw.previewAssetPath, 'item.previewAssetPath')
      return {
        type: 'image',
        storage: 'linked',
        id,
        x,
        y,
        width,
        height,
        sourceVideoId,
        ...(naturalWidth !== undefined ? { naturalWidth } : {}),
        ...(naturalHeight !== undefined ? { naturalHeight } : {}),
        ...(fileName !== undefined ? { fileName } : {}),
        imageSourcePath,
        ...(previewAssetPath !== undefined ? { previewAssetPath } : {}),
      }
    }

    if (storage === 'asset') {
      const assetPath = mustBeString(raw.assetPath, 'item.assetPath')
      return {
        type: 'image',
        storage: 'asset',
        id,
        x,
        y,
        width,
        height,
        sourceVideoId,
        ...(naturalWidth !== undefined ? { naturalWidth } : {}),
        ...(naturalHeight !== undefined ? { naturalHeight } : {}),
        ...(fileName !== undefined ? { fileName } : {}),
        assetPath,
      }
    }

    throw new Error(`Invalid project: unknown image storage "${storage}"`)
  }

  if (type === 'note') {
    const text = mustBeString(raw.text, 'item.text')
    const fontSize = optionalNumber(raw.fontSize, 'item.fontSize')
    return { type: 'note', id, x, y, width, height, text, ...(fontSize ? { fontSize } : {}) }
  }

  if (type === 'backdrop') {
    const color = mustBeString(raw.color, 'item.color')
    const label = mustBeString(raw.label, 'item.label')
    const labelSize = optionalBackdropLabelSize(raw.labelSize) ?? 'md'
    const displayMode = optionalBackdropDisplayMode(raw.displayMode) ?? 'solid'
    const brightness = optionalBackdropBrightness(raw.brightness) ?? 40
    const saturation = optionalBackdropSaturation(raw.saturation) ?? 100
    const collapsed = raw.collapsed
    if (typeof collapsed !== 'boolean') {
      throw new Error(`Invalid project: field "item.collapsed" must be a boolean`)
    }
    const expandedHeight = optionalNumber(raw.expandedHeight, 'item.expandedHeight')
    if (!Array.isArray(raw.attachedVideoIds)) {
      throw new Error(`Invalid project: field "item.attachedVideoIds" must be an array`)
    }
    const attachedVideoIds = raw.attachedVideoIds.map((v, idx) => {
      if (typeof v !== 'string') {
        throw new Error(`Invalid project: item.attachedVideoIds[${idx}] must be a string`)
      }
      return v
    })
    return {
      type: 'backdrop',
      id,
      x,
      y,
      width,
      height,
      color,
      brightness,
      saturation,
      label,
      labelSize,
      displayMode,
      collapsed,
      ...(expandedHeight !== undefined ? { expandedHeight } : {}),
      attachedVideoIds,
    }
  }

  throw new Error(`Invalid project: unknown item.type "${type}"`)
}

function resolveAssetMediaUrl(
  relativePath: string,
  options: DeserializeProjectOptions,
): { srcUrl: string; absolutePath: string } {
  const absolutePath = options.resolveAssetPath?.(relativePath)
  if (!absolutePath) {
    throw new Error(`Invalid project: unable to resolve asset "${relativePath}"`)
  }
  return {
    srcUrl: localPathToMediaUrl(absolutePath),
    absolutePath,
  }
}

export function serializeProject(params: SerializeProjectOptions): ProjectFileV2 {
  const items: ProjectCanvasItemV2[] = params.items.map((item) => {
    if (item.type === 'video') {
      const videoPath = mediaUrlToLocalPath(item.srcUrl)
      if (!videoPath) {
        throw new Error(
          `Can't serialize video "${item.fileName}": video source is not a local media:// URL`,
        )
      }
      return {
        type: 'video',
        id: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        fileName: item.fileName,
        videoPath,
        ...(item.aspectApplied !== undefined ? { aspectApplied: item.aspectApplied } : {}),
        ...(item.uiColor !== undefined ? { uiColor: item.uiColor } : {}),
      }
    }

    if (item.type === 'image') {
      if (item.storage === 'linked' && item.sourceFilePath) {
        const previewAssetPath = params.previewAssetPathForImage?.(item)
        return {
          type: 'image',
          storage: 'linked',
          id: item.id,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          sourceVideoId: item.sourceVideoId,
          ...(item.naturalWidth !== undefined ? { naturalWidth: item.naturalWidth } : {}),
          ...(item.naturalHeight !== undefined ? { naturalHeight: item.naturalHeight } : {}),
          ...(item.fileName !== undefined ? { fileName: item.fileName } : {}),
          imageSourcePath: item.sourceFilePath,
          ...(previewAssetPath ? { previewAssetPath } : {}),
        }
      }

      const assetPath = params.assetPathForImage(item)
      return {
        type: 'image',
        storage: 'asset',
        id: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        sourceVideoId: item.sourceVideoId,
        ...(item.naturalWidth !== undefined ? { naturalWidth: item.naturalWidth } : {}),
        ...(item.naturalHeight !== undefined ? { naturalHeight: item.naturalHeight } : {}),
        ...(item.fileName !== undefined ? { fileName: item.fileName } : {}),
        assetPath,
      }
    }

    if (item.type === 'backdrop') {
      const expandedHeight = item.expandedHeight
      return {
        type: 'backdrop',
        id: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        color: item.color,
        brightness: typeof item.brightness === 'number' ? Math.max(0, Math.min(100, item.brightness)) : 40,
        saturation: typeof item.saturation === 'number' ? Math.max(0, Math.min(200, item.saturation)) : 100,
        label: item.label,
        labelSize: item.labelSize ?? 'md',
        displayMode: item.displayMode ?? 'solid',
        collapsed: item.collapsed,
        ...(expandedHeight !== undefined ? { expandedHeight } : {}),
        attachedVideoIds: item.attachedVideoIds,
      }
    }

    return {
      type: 'note',
      id: item.id,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      text: item.text,
      ...(item.fontSize ? { fontSize: item.fontSize } : {}),
    }
  })

  return {
    version: PROJECT_VERSION,
    items,
    viewport: params.viewport,
    meta: params.meta,
  }
}

export function deserializeProject(
  raw: unknown,
  options: DeserializeProjectOptions = {},
): DeserializedProject {
  if (!isRecord(raw)) throw new Error('Invalid project file: root must be an object')
  const version = raw.version
  if (version !== 1 && version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${String(version)}`)
  }
  if (!Array.isArray(raw.items)) {
    throw new Error('Invalid project: items must be an array')
  }

  const viewport = validateViewport(raw.viewport)
  const meta = validateMeta(raw.meta)

  if (version === 1) {
    const items: CanvasItem[] = raw.items.map((i) => {
      const validated = validateItemV1(i)
      if (validated.type === 'video') {
        const video: VideoItem = {
          type: 'video',
          id: validated.id,
          x: validated.x,
          y: validated.y,
          width: validated.width,
          height: validated.height,
          fileName: validated.fileName,
          srcUrl: localPathToMediaUrl(validated.videoPath),
          ...(validated.aspectApplied !== undefined ? { aspectApplied: validated.aspectApplied } : {}),
          ...(validated.uiColor !== undefined ? { uiColor: validated.uiColor } : {}),
        }
        return video
      }
      if (validated.type === 'image') {
        const img: ImageItem = {
          type: 'image',
          id: validated.id,
          x: validated.x,
          y: validated.y,
          width: validated.width,
          height: validated.height,
          srcUrl: validated.dataUrl,
          storage: 'legacy-inline',
          sourceVideoId: validated.sourceVideoId,
          ...(validated.naturalWidth !== undefined ? { naturalWidth: validated.naturalWidth } : {}),
          ...(validated.naturalHeight !== undefined ? { naturalHeight: validated.naturalHeight } : {}),
          ...(validated.fileName !== undefined ? { fileName: validated.fileName } : {}),
          ...(validated.imageSourcePath !== undefined
            ? { sourceFilePath: validated.imageSourcePath }
            : {}),
        }
        return img
      }

      const note: NoteItem = {
        type: 'note',
        id: validated.id,
        x: validated.x,
        y: validated.y,
        width: validated.width,
        height: validated.height,
        text: validated.text,
        ...(validated.fontSize ? { fontSize: validated.fontSize } : {}),
      }
      return note
    })

    return { items, viewport, meta }
  }

  const items: CanvasItem[] = raw.items.map((i) => {
    const validated = validateItemV2(i)
    if (validated.type === 'video') {
      const video: VideoItem = {
        type: 'video',
        id: validated.id,
        x: validated.x,
        y: validated.y,
        width: validated.width,
        height: validated.height,
        fileName: validated.fileName,
        srcUrl: localPathToMediaUrl(validated.videoPath),
        ...(validated.aspectApplied !== undefined ? { aspectApplied: validated.aspectApplied } : {}),
        ...(validated.uiColor !== undefined ? { uiColor: validated.uiColor } : {}),
      }
      return video
    }

    if (validated.type === 'image') {
      if (validated.storage === 'linked') {
        const preview = validated.previewAssetPath
          ? resolveAssetMediaUrl(validated.previewAssetPath, options)
          : null
        const img: ImageItem = {
          type: 'image',
          id: validated.id,
          x: validated.x,
          y: validated.y,
          width: validated.width,
          height: validated.height,
          srcUrl: preview ? preview.srcUrl : localPathToMediaUrl(validated.imageSourcePath),
          storage: 'linked',
          sourceVideoId: validated.sourceVideoId,
          sourceFilePath: validated.imageSourcePath,
          ...(validated.naturalWidth !== undefined ? { naturalWidth: validated.naturalWidth } : {}),
          ...(validated.naturalHeight !== undefined ? { naturalHeight: validated.naturalHeight } : {}),
          ...(validated.fileName !== undefined ? { fileName: validated.fileName } : {}),
          ...(preview ? { projectAssetPath: preview.absolutePath } : {}),
        }
        return img
      }

      const asset = resolveAssetMediaUrl(validated.assetPath, options)
      const img: ImageItem = {
        type: 'image',
        id: validated.id,
        x: validated.x,
        y: validated.y,
        width: validated.width,
        height: validated.height,
        srcUrl: asset.srcUrl,
        storage: 'asset',
        sourceVideoId: validated.sourceVideoId,
        ...(validated.naturalWidth !== undefined ? { naturalWidth: validated.naturalWidth } : {}),
        ...(validated.naturalHeight !== undefined ? { naturalHeight: validated.naturalHeight } : {}),
        ...(validated.fileName !== undefined ? { fileName: validated.fileName } : {}),
        projectAssetPath: asset.absolutePath,
      }
      return img
    }

    if (validated.type === 'backdrop') {
      const backdrop: BackdropItem = {
        type: 'backdrop',
        id: validated.id,
        x: validated.x,
        y: validated.y,
        width: validated.width,
        height: validated.height,
        color: validated.color,
        brightness: validated.brightness ?? 40,
        saturation: validated.saturation ?? 100,
        label: validated.label,
        labelSize: validated.labelSize ?? 'md',
        displayMode: validated.displayMode ?? 'solid',
        collapsed: validated.collapsed,
        ...(validated.expandedHeight !== undefined ? { expandedHeight: validated.expandedHeight } : {}),
        attachedVideoIds: validated.attachedVideoIds,
      }
      return backdrop
    }

    const note: NoteItem = {
      type: 'note',
      id: validated.id,
      x: validated.x,
      y: validated.y,
      width: validated.width,
      height: validated.height,
      text: validated.text,
      ...(validated.fontSize ? { fontSize: validated.fontSize } : {}),
    }
    return note
  })

  return { items, viewport, meta }
}
