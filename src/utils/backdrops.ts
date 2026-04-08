import type { BackdropItem, CanvasItem } from '../types'

export const BACKDROP_INNER_PAD = 8

/** Canvas stacking: header must paint above video/image/note tiles (see tile z-index in *Tile.tsx). */
export const BACKDROP_HEADER_Z = 400
/** Tinted body stays under tiles so clicks hit videos inside the backdrop. */
export const BACKDROP_BODY_Z = 1
export const BACKDROP_DEPTH_Z_STEP = 10

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

export function itemFullyInsideRect(rect: { x: number; y: number; width: number; height: number }, item: { x: number; y: number; width: number; height: number }): boolean {
  return (
    item.x >= rect.x &&
    item.y >= rect.y &&
    item.x + item.width <= rect.x + rect.width &&
    item.y + item.height <= rect.y + rect.height
  )
}

function rectArea(rect: { width: number; height: number }): number {
  return Math.max(1, rect.width) * Math.max(1, rect.height)
}

function fullRectContainsBackdrop(outer: BackdropRectInput, inner: Pick<BackdropItem, 'x' | 'y' | 'width' | 'height'>): boolean {
  const outerInner = backdropInnerRect(outer)
  return itemFullyInsideRect(outerInner, inner)
}

function sortBackdropCandidates(backdrops: BackdropItem[]): BackdropItem[] {
  return [...backdrops].sort((a, b) => {
    const areaDiff = rectArea(a) - rectArea(b)
    if (areaDiff !== 0) return areaDiff
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })
}

export function findContainingBackdropId(
  target: Pick<CanvasItem, 'id' | 'x' | 'y' | 'width' | 'height'>,
  backdrops: BackdropItem[],
): string | null {
  const candidates = sortBackdropCandidates(
    backdrops.filter((backdrop) => backdrop.id !== target.id && fullRectContainsBackdrop(backdrop, target)),
  )
  return candidates[0]?.id ?? null
}

export function computeBackdropDepthMap(backdrops: BackdropItem[]): Map<string, number> {
  const parentById = new Map<string, string | null>()
  for (const backdrop of backdrops) {
    parentById.set(backdrop.id, findContainingBackdropId(backdrop, backdrops))
  }

  const depthById = new Map<string, number>()
  const getDepth = (id: string): number => {
    const cached = depthById.get(id)
    if (cached !== undefined) return cached
    const parentId = parentById.get(id) ?? null
    const depth = parentId ? getDepth(parentId) + 1 : 0
    depthById.set(id, depth)
    return depth
  }

  for (const backdrop of backdrops) getDepth(backdrop.id)
  return depthById
}

export function sortBackdropsForRender(backdrops: BackdropItem[]): BackdropItem[] {
  const depthMap = computeBackdropDepthMap(backdrops)
  return [...backdrops].sort((a, b) => {
    const depthDiff = (depthMap.get(a.id) ?? 0) - (depthMap.get(b.id) ?? 0)
    if (depthDiff !== 0) return depthDiff
    const areaDiff = rectArea(b) - rectArea(a)
    if (areaDiff !== 0) return areaDiff
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })
}

export function findBackdropAtPoint(
  backdrops: BackdropItem[],
  worldX: number,
  worldY: number,
): BackdropItem | null {
  const hit = sortBackdropCandidates(
    backdrops.filter(
      (backdrop) =>
        worldX >= backdrop.x &&
        worldX <= backdrop.x + backdrop.width &&
        worldY >= backdrop.y &&
        worldY <= backdrop.y + backdrop.height,
    ),
  )
  return hit[0] ?? null
}

export function computeAttachedItemIds(backdrop: BackdropRectInput & Pick<BackdropItem, 'id'>, items: CanvasItem[]): string[] {
  const backdrops = [
    ...items.filter((item): item is BackdropItem => item.type === 'backdrop' && item.id !== backdrop.id),
    {
      type: 'backdrop' as const,
      id: backdrop.id,
      x: backdrop.x,
      y: backdrop.y,
      width: backdrop.width,
      height: backdrop.height,
      color: '#000000',
      brightness: 40,
      saturation: 100,
      label: '',
      labelSize: backdrop.labelSize ?? 'md',
      collapsed: false,
      displayMode: 'solid' as const,
      attachedVideoIds: [],
    },
  ]
  const ownerById = new Map<string, string | null>()
  for (const item of items) {
    if (item.id === backdrop.id) continue
    ownerById.set(item.id, findContainingBackdropId(item, backdrops))
  }

  const byId = new Map(items.map((item) => [item.id, item]))
  const orderedIds: string[] = []
  const visit = (item: CanvasItem) => {
    orderedIds.push(item.id)
    if (item.type !== 'backdrop') return
    for (const child of items) {
      if (child.id === item.id || child.id === backdrop.id) continue
      if (ownerById.get(child.id) === item.id) {
        visit(child)
      }
    }
  }

  for (const child of items) {
    if (child.id === backdrop.id) continue
    if (ownerById.get(child.id) !== backdrop.id) continue
    visit(child)
  }

  const seen = new Set<string>()
  return orderedIds.filter((id) => {
    if (seen.has(id) || !byId.has(id)) return false
    seen.add(id)
    return true
  })
}

