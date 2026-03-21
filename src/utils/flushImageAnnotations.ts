import { useCanvasStore } from '../store/canvasStore'
import { imageExportRegistry } from './imageExportRegistry'
import type { ImageItem } from '../types'

/**
 * Makes sure image tiles persist current drawing overlay into `item.dataUrl`.
 * Without this, Save would serialize only the baked base image.
 */
export function flushImageAnnotations() {
  const state = useCanvasStore.getState()
  const updateItem = state.updateItem
  const items = state.items

  for (const item of items) {
    if (item.type !== 'image') continue
    const exporter = imageExportRegistry.get(item.id)
    if (!exporter) continue
    const next = exporter()
    const cur = (item as ImageItem).dataUrl
    if (next && next !== cur) {
      updateItem(item.id, { dataUrl: next })
    }
  }
}

