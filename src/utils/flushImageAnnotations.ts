import { useCanvasStore } from '../store/canvasStore'
import { imageExportRegistry } from './imageExportRegistry'
import type { ImageItem } from '../types'

/**
 * Makes sure image tiles persist current drawing overlay into `item.srcUrl`.
 * Unsaved annotations are promoted to project-owned PNG assets on the next save.
 */
export function flushImageAnnotations() {
  const state = useCanvasStore.getState()
  const items = state.items
  const pendingUpdates: Array<{
    id: string
    updates: Partial<ImageItem>
  }> = []

  for (const item of items) {
    if (item.type !== 'image') continue
    const exporter = imageExportRegistry.get(item.id)
    if (!exporter) continue
    const next = exporter()
    const cur = (item as ImageItem).srcUrl
    if (next && next !== cur) {
      pendingUpdates.push({
        id: item.id,
        updates: {
          srcUrl: next,
          storage: 'asset',
          projectAssetPath: undefined,
        },
      })
    }
  }

  if (pendingUpdates.length > 0) {
    state.updateItemsBatch(pendingUpdates, { markDirty: true })
  }
}

