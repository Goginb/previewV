import type { DeserializedProject } from '../types/project'

/** Пустой холст без привязки к файлу (после «Закрыть проект»). */
export function createEmptyProject(): DeserializedProject {
  const now = new Date().toISOString()
  return {
    items: [],
    viewport: { x: 0, y: 0, scale: 1 },
    meta: { createdAt: now, updatedAt: now },
  }
}
