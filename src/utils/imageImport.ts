import { imageTileViewSize } from './tileSizing'

/** Ленивая загрузка utif — иначе при проблемах с бандлом падает весь интерфейс при старте */
async function getUtif() {
  const mod = await import('utif')
  return (mod as { default?: typeof mod }).default ?? mod
}

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

function needsFfmpeg(name: string): boolean {
  const e = extOf(name)
  return e === '.dpx' || e === '.exr'
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

async function decodeTiffArrayBuffer(ab: ArrayBuffer): Promise<{ dataUrl: string; w: number; h: number }> {
  const UTIF = await getUtif()
  const ifds = UTIF.decode(ab)
  if (!ifds.length) throw new Error('TIFF: no frames')
  UTIF.decodeImage(ab, ifds[0])
  const ifd = ifds[0]
  const w = ifd.width
  const h = ifd.height
  if (!w || !h) throw new Error('TIFF: invalid dimensions')
  const rgba = UTIF.toRGBA8(ifd)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('TIFF: canvas')
  const imgData = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), w, h)
  ctx.putImageData(imgData, 0, 0)
  return { dataUrl: canvas.toDataURL('image/png'), w, h }
}

async function decodeWithImageElement(dataUrl: string): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ dataUrl, w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

export interface ImportedImagePayload {
  dataUrl: string
  naturalWidth: number
  naturalHeight: number
  width: number
  height: number
}

/**
 * Импорт файла изображения (jpeg/png/webp в рендерере; tiff через UTIF; exr/dpx через ffmpeg в main).
 */
export async function importImageFile(file: File): Promise<ImportedImagePayload> {
  const name = file.name
  const ext = extOf(name)
  const nativePath = (file as File & { path?: string }).path

  let dataUrl: string
  let w: number
  let h: number

  if (needsFfmpeg(name)) {
    if (!nativePath) {
      throw new Error('EXR/DPX: drag a file from disk (local path required).')
    }
    const api = window.electronAPI?.projectAPI
    if (!api?.decodeRasterImagePath) {
      throw new Error('EXR/DPX import requires the Electron app.')
    }
    const res = await api.decodeRasterImagePath(nativePath)
    dataUrl = res.dataUrl
    w = res.width
    h = res.height
  } else if (ext === '.tif' || ext === '.tiff') {
    const ab = await file.arrayBuffer()
    const dec = await decodeTiffArrayBuffer(ab)
    dataUrl = dec.dataUrl
    w = dec.w
    h = dec.h
  } else if (canDecodeWithImageElement(ext)) {
    const raw = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('Failed to read file'))
      r.readAsDataURL(file)
    })
    const loaded = await decodeWithImageElement(raw)
    dataUrl = loaded.dataUrl
    w = loaded.w
    h = loaded.h
  } else {
    throw new Error(`Unsupported format: ${ext || 'unknown'}`)
  }

  const box = imageTileViewSize(w, h)
  return {
    dataUrl,
    naturalWidth: w,
    naturalHeight: h,
    width: box.width,
    height: box.height,
  }
}

export function isRasterImportFile(file: File): boolean {
  return RASTER_IMPORT_EXT.has(extOf(file.name))
}
