interface BaseItem {
  id: string
  x: number
  y: number
  width: number
  height: number
  aspectApplied?: boolean
}

export type ImageStorage = 'linked' | 'asset' | 'legacy-inline'

export interface VideoItem extends BaseItem {
  type: 'video'
  srcUrl: string
  fileName: string
  uiColor?: string
}

export interface NoteItem extends BaseItem {
  type: 'note'
  text: string
  fontSize?: number
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

export interface BackdropItem extends BaseItem {
  type: 'backdrop'
  /**
   * Dark fill color as hex (e.g. "#1f2937").
   * Used to render a semi-transparent backdrop.
   */
  color: string
  /**
   * 0..100: increases perceived brightness of the backdrop color.
   * Implemented as mix towards white for readability.
   */
  brightness: number
  /** 0..200: saturation multiplier (100 = original). */
  saturation: number
  /** Optional label shown on the backdrop header. */
  label: string
  /** Label font size preset for readability when zoomed out. */
  labelSize: 'sm' | 'md' | 'lg'
  /** When collapsed, hide attached videos inside the backdrop. */
  collapsed: boolean
  /** Height before collapse, used to restore on expand. */
  expandedHeight?: number
  /** Visual mode: solid fill or frame only. */
  displayMode: 'solid' | 'frame'
  /** Descendant item ids attached to this backdrop subtree (moved/hidden together). */
  attachedVideoIds: string[]
}

export type CanvasItem = VideoItem | NoteItem | ImageItem | BackdropItem

/** Fields that can be updated on any canvas item */
export type ItemUpdate = {
  x?: number
  y?: number
  width?: number
  height?: number
  // NoteItem
  text?: string
  fontSize?: number
  // ImageItem
  srcUrl?: string
  storage?: ImageStorage
  naturalWidth?: number
  naturalHeight?: number
  fileName?: string
  sourceVideoId?: string
  sourceFilePath?: string
  projectAssetPath?: string
  // BackdropItem
  color?: string
  uiColor?: string
  brightness?: number
  saturation?: number
  label?: string
  labelSize?: 'sm' | 'md' | 'lg'
  collapsed?: boolean
  expandedHeight?: number
  displayMode?: 'solid' | 'frame'
  attachedVideoIds?: string[]
  aspectApplied?: boolean
}

// Backward-compat alias
export type VideoTileData = VideoItem
