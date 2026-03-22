import type { CanvasItem } from './index'

export interface ViewportState {
  x: number
  y: number
  scale: number
}

export interface ProjectMeta {
  createdAt: string
  updatedAt: string
}

export interface ProjectFile {
  version: 1
  items: ProjectCanvasItem[]
  viewport: ViewportState
  meta: ProjectMeta
}

export type ProjectCanvasItem =
  | {
      type: 'video'
      id: string
      x: number
      y: number
      width: number
      height: number
      fileName: string
      /** local absolute path on disk */
      videoPath: string
    }
  | {
      type: 'image'
      id: string
      x: number
      y: number
      width: number
      height: number
      dataUrl: string
      sourceVideoId: string
      naturalWidth?: number
      naturalHeight?: number
      fileName?: string
    }
  | {
      type: 'note'
      id: string
      x: number
      y: number
      width: number
      height: number
      text: string
    }

export interface DeserializedProject {
  items: CanvasItem[]
  viewport: ViewportState
  meta: ProjectMeta
}

