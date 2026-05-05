import type { BackdropItem, CanvasItem, ItemUpdate, NoteItem, VideoItem } from '../types'

export const DEFAULT_SELECTION_VIDEO_UI_COLOR = '#6366f1'

type ColorableCanvasItem = VideoItem | NoteItem | BackdropItem

function getItemsById(items: CanvasItem[]): Map<string, CanvasItem> {
  return new Map(items.map((item) => [item.id, item]))
}

export function isColorableCanvasItem(item: CanvasItem): item is ColorableCanvasItem {
  return item.type === 'video' || item.type === 'note' || item.type === 'backdrop'
}

export function getSelectedColorableIds(items: CanvasItem[], selectedIds: string[]): string[] {
  const byId = getItemsById(items)
  return selectedIds.filter((id) => {
    const item = byId.get(id)
    return !!item && isColorableCanvasItem(item)
  })
}

export function getContextColorableIds(
  items: CanvasItem[],
  selectedIds: string[],
  targetId?: string,
): string[] {
  const selectedColorableIds = getSelectedColorableIds(items, selectedIds)
  if (!targetId) return selectedColorableIds
  if (selectedIds.includes(targetId) && selectedColorableIds.length > 0) {
    return selectedColorableIds
  }
  const byId = getItemsById(items)
  const target = byId.get(targetId)
  return target && isColorableCanvasItem(target) ? [targetId] : []
}

export function getCanvasItemEffectiveColor(
  item: ColorableCanvasItem,
  defaults: { videoUiColor: string; noteColor: string },
): string {
  if (item.type === 'video') return item.uiColor ?? defaults.videoUiColor
  if (item.type === 'note') return item.color ?? defaults.noteColor
  return item.color
}

export function resolveSharedColorForIds(
  items: CanvasItem[],
  ids: string[],
  defaults: { videoUiColor: string; noteColor: string },
): string | null {
  if (!ids.length) return null
  const byId = getItemsById(items)
  let sharedColor: string | null = null

  for (const id of ids) {
    const item = byId.get(id)
    if (!item || !isColorableCanvasItem(item)) continue
    const current = getCanvasItemEffectiveColor(item, defaults).toLowerCase()
    if (sharedColor === null) {
      sharedColor = current
      continue
    }
    if (sharedColor !== current) return null
  }

  return sharedColor
}

export function buildColorUpdatesForIds(
  items: CanvasItem[],
  ids: string[],
  color: string,
): Array<{ id: string; updates: ItemUpdate }> {
  if (!ids.length) return []
  const targetSet = new Set(ids)
  return items.flatMap((item) => {
    if (!targetSet.has(item.id) || !isColorableCanvasItem(item)) return []
    return [
      {
        id: item.id,
        updates: item.type === 'video' ? { uiColor: color } : { color },
      },
    ]
  })
}
