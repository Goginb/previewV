/** Макс. длинная сторона области контента (видео / картинка) в обычном режиме */
export const MAX_MEDIA_LONG_SIDE = 640
/** В режиме рисования (F4) — чуть крупнее */
export const MAX_EDIT_LONG_SIDE = 800

export const VIDEO_TITLE_H = 24
export const VIDEO_CONTROLS_H = 34
export const IMAGE_TOOLBAR_H = 32

/**
 * Размер плитки видео: полоса заголовка + область видео с сохранением aspect + таймлайн.
 */
export function videoTileSizeFromVideo(videoWidth: number, videoHeight: number): {
  width: number
  height: number
} {
  const vw = Math.max(1, videoWidth)
  const vh = Math.max(1, videoHeight)
  const ar = vw / vh
  let contentW = Math.min(vw, MAX_MEDIA_LONG_SIDE)
  let contentH = Math.round(contentW / ar)
  if (contentH > MAX_MEDIA_LONG_SIDE) {
    contentH = MAX_MEDIA_LONG_SIDE
    contentW = Math.round(contentH * ar)
  }
  contentW = Math.max(200, contentW)
  contentH = Math.max(80, contentH)
  return {
    width: contentW,
    height: VIDEO_TITLE_H + VIDEO_CONTROLS_H + contentH,
  }
}

/**
 * Плитка картинки: тулбар + область изображения с сохранением aspect.
 */
export function imageTileSizeFromNatural(
  naturalW: number,
  naturalH: number,
  maxLong: number,
): { width: number; height: number } {
  const nw = Math.max(1, naturalW)
  const nh = Math.max(1, naturalH)
  const ar = nw / nh
  let contentW = Math.min(nw, maxLong)
  let contentH = Math.round(contentW / ar)
  if (contentH > maxLong) {
    contentH = maxLong
    contentW = Math.round(contentH * ar)
  }
  contentW = Math.max(120, contentW)
  contentH = Math.max(80, contentH)
  return {
    width: contentW,
    height: IMAGE_TOOLBAR_H + contentH,
  }
}

export function imageTileViewSize(naturalW: number, naturalH: number) {
  return imageTileSizeFromNatural(naturalW, naturalH, MAX_MEDIA_LONG_SIDE)
}

export function imageTileEditSize(naturalW: number, naturalH: number) {
  return imageTileSizeFromNatural(naturalW, naturalH, MAX_EDIT_LONG_SIDE)
}
