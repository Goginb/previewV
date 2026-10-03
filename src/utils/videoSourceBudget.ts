import type { CanvasItem } from '../types'
import type { ViewportState } from '../types/project'

export const MAX_LOADED_VIDEOS = 24
const BUFFER_PX = 240

/** Paused videos also hold media players/decoders, so loading needs its own cap. */
export function chooseVideoSources(params: {
  items: CanvasItem[]
  viewport: ViewportState
  selectedIds: string[]
  width: number
  height: number
  navigationMode: boolean
}): string[] {
  const { items, viewport, selectedIds, width, height, navigationMode } = params
  if (navigationMode || width <= 0 || height <= 0) return []
  const hidden = new Set<string>()
  for (const item of items) {
    if (item.type === 'backdrop' && item.collapsed) {
      for (const id of item.attachedVideoIds) hidden.add(id)
    }
  }
  const selected = new Set(selectedIds)
  return items.flatMap((item) => {
    if (item.type !== 'video' || hidden.has(item.id)) return []
    const left = item.x * viewport.scale + viewport.x
    const top = item.y * viewport.scale + viewport.y
    const right = left + item.width * viewport.scale
    const bottom = top + item.height * viewport.scale
    if (right < -BUFFER_PX || left > width + BUFFER_PX || bottom < -BUFFER_PX || top > height + BUFFER_PX) return []
    const dx = (left + right - width) / 2
    const dy = (top + bottom - height) / 2
    return [{ id: item.id, selected: selected.has(item.id), distance: dx * dx + dy * dy }]
  }).sort((a, b) => Number(b.selected) - Number(a.selected) || a.distance - b.distance)
    .slice(0, MAX_LOADED_VIDEOS).map((item) => item.id)
}
