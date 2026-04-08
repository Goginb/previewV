import type { CanvasItem } from '../types'
import { mediaUrlToLocalPath } from './projectSerializer'

/** Case-insensitive key for comparing absolute paths (Windows-safe). */
export function normalizePathKey(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

/** Paths already represented on the canvas (videos via media URL, images with sourceFilePath). */
export function collectExistingSourcePaths(items: CanvasItem[]): Set<string> {
  const set = new Set<string>()
  for (const it of items) {
    if (it.type === 'video') {
      const p = it.sourceFilePath ?? mediaUrlToLocalPath(it.srcUrl)
      if (p) set.add(normalizePathKey(p))
    }
    if (it.type === 'image' && it.sourceFilePath) {
      set.add(normalizePathKey(it.sourceFilePath))
    }
  }
  return set
}
