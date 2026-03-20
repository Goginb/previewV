interface BaseItem {
  id: string
  x: number
  y: number
  width: number
  height: number
}

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
  /** Base image as data URL (updated in-place when baking) */
  dataUrl: string
  /** ID of the source video tile, for reference */
  sourceVideoId: string
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
  dataUrl?: string
}

// Backward-compat alias
export type VideoTileData = VideoItem
