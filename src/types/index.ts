interface BaseItem {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type ImageStorage = 'linked' | 'asset' | 'legacy-inline'

export interface VideoItem extends BaseItem {
  type: 'video'
  srcUrl: string
  fileName: string
}

export interface NoteItem extends BaseItem {
  type: 'note'
  text: string
}

export interface ImageItem extends BaseItem {
  type: 'image'
  /** Render source for the image (media:// local file or data: URL for unsaved/generated assets). */
  srcUrl: string
  /** Backing storage mode used for project persistence. */
  storage: ImageStorage
  /** ID плитки-видео для кадра F3; пустая строка — импорт из файла */
  sourceVideoId: string
  /** Исходный размер пикселей (для пропорций плитки) */
  naturalWidth?: number
  naturalHeight?: number
  /** Имя файла при импорте */
  fileName?: string
  /** Абсолютный путь к исходному файлу на диске (импорт с диска; для поиска дубликатов) */
  sourceFilePath?: string
  /** Абсолютный путь к проектному ассету/preview PNG на диске (если уже сохранён). */
  projectAssetPath?: string
}

export type CanvasItem = VideoItem | NoteItem | ImageItem

/** Fields that can be updated on any canvas item */
export type ItemUpdate = {
  x?: number
  y?: number
  width?: number
  height?: number
  // NoteItem
  text?: string
  // ImageItem
  srcUrl?: string
  storage?: ImageStorage
  naturalWidth?: number
  naturalHeight?: number
  fileName?: string
  sourceVideoId?: string
  sourceFilePath?: string
  projectAssetPath?: string
}

// Backward-compat alias
export type VideoTileData = VideoItem
