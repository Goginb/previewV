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

export interface ProjectFileV1 {
  version: 1
  items: ProjectCanvasItemV1[]
  viewport: ViewportState
  meta: ProjectMeta
}

export interface ProjectFileV2 {
  version: 2
  items: ProjectCanvasItemV2[]
  viewport: ViewportState
  meta: ProjectMeta
}

export type ProjectFile = ProjectFileV1 | ProjectFileV2

export type ProjectCanvasItemV1 =
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
      aspectApplied?: boolean
      uiColor?: string
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
      /** Absolute path when image was imported from a file (folder/drag) */
      imageSourcePath?: string
    }
  | {
      type: 'note'
      id: string
      x: number
      y: number
      width: number
      height: number
      text: string
      fontSize?: number
    }

export type ProjectCanvasItemV2 =
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
      aspectApplied?: boolean
      uiColor?: string
    }
  | {
      type: 'image'
      storage: 'linked'
      id: string
      x: number
      y: number
      width: number
      height: number
      sourceVideoId: string
      naturalWidth?: number
      naturalHeight?: number
      fileName?: string
      /** Absolute path to the linked source image */
      imageSourcePath: string
      /** Optional relative preview PNG path inside <project>.previewv.assets */
      previewAssetPath?: string
    }
  | {
      type: 'image'
      storage: 'asset'
      id: string
      x: number
      y: number
      width: number
      height: number
      sourceVideoId: string
      naturalWidth?: number
      naturalHeight?: number
      fileName?: string
      /** Relative asset path inside <project>.previewv.assets */
      assetPath: string
    }
  | {
      type: 'note'
      id: string
      x: number
      y: number
      width: number
      height: number
      text: string
      fontSize?: number
    }
  | {
      type: 'backdrop'
      id: string
      x: number
      y: number
      width: number
      height: number
      color: string
      brightness: number
      saturation: number
      label: string
      labelSize: 'sm' | 'md' | 'lg'
      collapsed: boolean
      expandedHeight?: number
      displayMode?: 'solid' | 'frame'
      attachedVideoIds: string[]
    }

export type ProjectCanvasItem = ProjectCanvasItemV1 | ProjectCanvasItemV2

export interface DeserializedProject {
  items: CanvasItem[]
  viewport: ViewportState
  meta: ProjectMeta
}

