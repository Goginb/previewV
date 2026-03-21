import type {
  CanvasItem,
  ImageItem,
  NoteItem,
  VideoItem,
} from '../types'
import type {
  DeserializedProject,
  ProjectCanvasItem,
  ProjectFile,
  ProjectMeta,
  ViewportState,
} from '../types/project'

const PROJECT_VERSION = 1

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

function normalizeToForwardSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}

function localPathToMediaUrl(localPath: string): string {
  const normalized = normalizeToForwardSlashes(localPath).replace(/^\/+/, '')
  return `media:///${normalized}`
}

function mediaUrlToLocalPath(mediaUrl: string): string {
  if (!mediaUrl.startsWith('media:///')) return ''
  const rest = mediaUrl.slice('media:///'.length)
  let decoded = rest
  try {
    decoded = decodeURIComponent(rest)
  } catch {
    // If the media url contains '%' that isn't a valid escape sequence,
    // fall back to raw string.
    decoded = rest
  }
  return decoded.replace(/\//g, '\\')
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

function validateItem(raw: unknown): ProjectCanvasItem {
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
    return { type: 'video', id, x, y, width, height, fileName, videoPath }
  }

  if (type === 'image') {
    const dataUrl = mustBeString(raw.dataUrl, 'item.dataUrl')
    const sourceVideoId = mustBeString(raw.sourceVideoId, 'item.sourceVideoId')
    return { type: 'image', id, x, y, width, height, dataUrl, sourceVideoId }
  }

  if (type === 'note') {
    const text = mustBeString(raw.text, 'item.text')
    return { type: 'note', id, x, y, width, height, text }
  }

  throw new Error(`Invalid project: unknown item.type "${type}"`)
}

export function serializeProject(params: {
  version?: number
  items: CanvasItem[]
  viewport: ViewportState
  meta: ProjectMeta
}): ProjectFile {
  const version = params.version ?? PROJECT_VERSION
  if (version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${version}`)
  }

  const items: ProjectCanvasItem[] = params.items.map((item) => {
    if (item.type === 'video') {
      // We store only the local absolute path of the source video.
      const videoPath = mediaUrlToLocalPath(item.srcUrl)
      if (!videoPath) {
        throw new Error(
          `Can't serialize video "${item.fileName}": video source is not a local media:// URL`,
        )
      }
      const v: ProjectCanvasItem = {
        type: 'video',
        id: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        fileName: item.fileName,
        videoPath,
      }
      return v
    }

    if (item.type === 'image') {
      const v: ProjectCanvasItem = {
        type: 'image',
        id: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        dataUrl: item.dataUrl,
        sourceVideoId: item.sourceVideoId,
      }
      return v
    }

    // note
    const v: ProjectCanvasItem = {
      type: 'note',
      id: item.id,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      text: item.text,
    }
    return v
  })

  return {
    version: PROJECT_VERSION,
    items,
    viewport: params.viewport,
    meta: params.meta,
  }
}

export function deserializeProject(raw: unknown): DeserializedProject {
  if (!isRecord(raw)) throw new Error('Invalid project file: root must be an object')
  const version = raw.version
  if (version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${String(version)}`)
  }
  if (!Array.isArray(raw.items)) {
    throw new Error('Invalid project: items must be an array')
  }
  const viewport = validateViewport(raw.viewport)
  const meta = validateMeta(raw.meta)

  const items: CanvasItem[] = raw.items.map((i) => {
    const validated = validateItem(i)
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
        dataUrl: validated.dataUrl,
        sourceVideoId: validated.sourceVideoId,
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
    }
    return note
  })

  return { items, viewport, meta }
}

