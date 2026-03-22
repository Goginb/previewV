import { RASTER_IMPORT_EXT } from './imageImport'

const VIDEO_EXT = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.mkv',
  '.avi',
  '.m4v',
  '.ogv',
])

export function extOfFilePath(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i).toLowerCase() : ''
}

export function isVideoFilePath(p: string): boolean {
  return VIDEO_EXT.has(extOfFilePath(p))
}

export function isRasterFilePath(p: string): boolean {
  return RASTER_IMPORT_EXT.has(extOfFilePath(p))
}

export function isMediaFilePath(p: string): boolean {
  return isVideoFilePath(p) || isRasterFilePath(p)
}
