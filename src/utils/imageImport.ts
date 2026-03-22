import type { ImageStorage } from '../types'
import { imageTileViewSize } from './tileSizing'

export const RASTER_IMPORT_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.dpx',
  '.exr',
])

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function needsFileSystemPath(name: string): boolean {
  const ext = extOf(name)
  return ext === '.tif' || ext === '.tiff' || ext === '.dpx' || ext === '.exr'
}

function canDecodeWithImageElement(ext: string): boolean {
  return (
    ext === '.jpg' ||
    ext === '.jpeg' ||
    ext === '.png' ||
    ext === '.webp' ||
    ext === '.gif' ||
    ext === '.bmp'
  )
}

async function decodeWithImageElement(srcUrl: string): Promise<{ srcUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ srcUrl, w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = srcUrl
  })
}

export interface ImportedImagePayload {
  srcUrl: string
  storage: ImageStorage
  naturalWidth: number
  naturalHeight: number
  width: number
  height: number
  sourceFilePath?: string
  projectAssetPath?: string
}

export async function importImageFile(file: File): Promise<ImportedImagePayload> {
  const name = file.name
  const ext = extOf(name)
  const nativePath = (file as File & { path?: string }).path
  const api = window.electronAPI?.projectAPI

  if (nativePath && api?.resolveImageSource) {
    return api.resolveImageSource(nativePath)
  }

  if (needsFileSystemPath(name)) {
    throw new Error('This format requires a local file path in the desktop app.')
  }

  if (!canDecodeWithImageElement(ext)) {
    throw new Error(`Unsupported format: ${ext || 'unknown'}`)
  }

  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Failed to read file'))
    r.readAsDataURL(file)
  })

  const loaded = await decodeWithImageElement(raw)
  const box = imageTileViewSize(loaded.w, loaded.h)
  return {
    srcUrl: loaded.srcUrl,
    storage: 'asset',
    naturalWidth: loaded.w,
    naturalHeight: loaded.h,
    width: box.width,
    height: box.height,
  }
}

export function isRasterImportFile(file: File): boolean {
  return RASTER_IMPORT_EXT.has(extOf(file.name))
}

export type ImportedImageWithSource = ImportedImagePayload & { sourceFilePath: string }

export async function importImageFromAbsolutePath(nativePath: string): Promise<ImportedImageWithSource> {
  const api = window.electronAPI?.projectAPI
  if (!api?.resolveImageSource) {
    throw new Error('Folder import requires the Electron app.')
  }

  const resolved = await api.resolveImageSource(nativePath)
  return {
    ...resolved,
    sourceFilePath: resolved.sourceFilePath ?? nativePath,
  }
}
