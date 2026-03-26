import type { BackdropItem, VideoItem } from '../types'

export const BACKDROP_INNER_PAD = 8

/** Canvas stacking: header must paint above video/image/note tiles (see tile z-index in *Tile.tsx). */
export const BACKDROP_HEADER_Z = 400
/** Tinted body stays under tiles so clicks hit videos inside the backdrop. */
export const BACKDROP_BODY_Z = 1

/** Header row height in world px; scales with label size preset (large fonts need more vertical space). */
export function backdropHeaderHeight(labelSize: BackdropItem['labelSize'] | undefined): number {
  const sz = labelSize ?? 'md'
  if (sz === 'sm') return 88
  if (sz === 'lg') return 220
  return 160
}

type BackdropRectInput = Pick<BackdropItem, 'x' | 'y' | 'width' | 'height'> &
  Partial<Pick<BackdropItem, 'labelSize'>>

export function backdropInnerRect(backdrop: BackdropRectInput): {
  x: number
  y: number
  width: number
  height: number
} {
  const hh = backdropHeaderHeight(backdrop.labelSize)
  const x = backdrop.x + BACKDROP_INNER_PAD
  const y = backdrop.y + hh + BACKDROP_INNER_PAD
  const width = Math.max(1, backdrop.width - 2 * BACKDROP_INNER_PAD)
  const height = Math.max(1, backdrop.height - (hh + 2 * BACKDROP_INNER_PAD))
  return { x, y, width, height }
}

export function videoFullyInsideRect(rect: { x: number; y: number; width: number; height: number }, v: VideoItem): boolean {
  return (
    v.x >= rect.x &&
    v.y >= rect.y &&
    v.x + v.width <= rect.x + rect.width &&
    v.y + v.height <= rect.y + rect.height
  )
}

export function computeAttachedVideoIds(backdrop: BackdropRectInput, videos: VideoItem[]): string[] {
  const inner = backdropInnerRect(backdrop)
  return videos.filter((v) => videoFullyInsideRect(inner, v)).map((v) => v.id)
}

