import type { NoteFontFamily, NoteFontSizeTier } from '../types'
import { DEFAULT_NOTE_FONT_FAMILY, getNoteFontFamilyCss } from './noteStyle'

const NOTE_W = 220
const NOTE_H = 160
const NOTE_MIN_W = 140
const NOTE_MIN_H = 80
const NOTE_HEADER_H = 24
const NOTE_BODY_PAD_X = 20
const NOTE_BODY_PAD_Y = 20
const NOTE_TEXT_LINE_HEIGHT = 1.625

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const MIN_NOTE_FONT_PX = 10
export const MAX_NOTE_FONT_PX = 100

/** Fixed px for note body text tiers (S / M / L). */
export const NOTE_FONT_TIER_PX: Record<NoteFontSizeTier, number> = { s: 10, m: 14, l: 28 }
export const NOTE_FONT_SIZE_OPTIONS: ReadonlyArray<number> = Array.from(
  { length: MAX_NOTE_FONT_PX - MIN_NOTE_FONT_PX + 1 },
  (_, index) => MIN_NOTE_FONT_PX + index,
)

export function nearestNoteFontTier(px: number): NoteFontSizeTier {
  let best: NoteFontSizeTier = 'm'
  let bestD = Infinity
  for (const t of ['s', 'm', 'l'] as const) {
    const d = Math.abs(px - NOTE_FONT_TIER_PX[t])
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best
}

export function getNoteFontPx(note: { fontSize?: number; fontSizeTier?: NoteFontSizeTier }): number {
  if (note.fontSizeTier !== undefined) return NOTE_FONT_TIER_PX[note.fontSizeTier]
  return Math.round(clampNumber(note.fontSize ?? NOTE_FONT_TIER_PX.m, MIN_NOTE_FONT_PX, MAX_NOTE_FONT_PX))
}

export function getNoteFontTier(note: { fontSize?: number; fontSizeTier?: NoteFontSizeTier }): NoteFontSizeTier {
  if (note.fontSizeTier !== undefined) return note.fontSizeTier
  return nearestNoteFontTier(note.fontSize ?? NOTE_FONT_TIER_PX.m)
}

export function getNoteCreationMetrics(scale: number): {
  width: number
  height: number
  fontSize: number
  fontSizeTier: NoteFontSizeTier
} {
  const effectiveScale = clampNumber(scale, 0.5, 2)
  const factor = 1 / effectiveScale
  const scaledTarget = Math.round(clampNumber(NOTE_FONT_TIER_PX.m * factor, MIN_NOTE_FONT_PX, 28))
  const fontSizeTier = nearestNoteFontTier(scaledTarget)
  const fontSize = NOTE_FONT_TIER_PX[fontSizeTier]
  return {
    width: Math.round(clampNumber(NOTE_W * factor, NOTE_MIN_W, 440)),
    height: Math.round(clampNumber(NOTE_H * factor, NOTE_MIN_H, 320)),
    fontSize,
    fontSizeTier,
  }
}

export function getNoteCreationMetricsForText(
  scale: number,
  text: string,
  fontFamily: NoteFontFamily = DEFAULT_NOTE_FONT_FAMILY,
): { width: number; height: number; fontSize: number; fontSizeTier: NoteFontSizeTier } {
  const base = getNoteCreationMetrics(scale)
  if (!text.trim() || typeof document === 'undefined') return base

  const resolvedFontFamily = getNoteFontFamilyCss(fontFamily)
  const minWidth = Math.round(clampNumber(base.width * 0.55, NOTE_MIN_W, 280))
  const maxWidth = Math.round(clampNumber(base.width * 2.2, 320, 920))

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let longestLineWidth = 0
  if (context) {
    context.font = `${base.fontSize}px ${resolvedFontFamily}`
    for (const line of lines) {
      longestLineWidth = Math.max(longestLineWidth, Math.ceil(context.measureText(line || ' ').width))
    }
  }

  const contentWidth = Math.round(
    clampNumber(longestLineWidth + 8, minWidth - NOTE_BODY_PAD_X, maxWidth - NOTE_BODY_PAD_X),
  )

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.rows = 1
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-99999px'
  textarea.style.top = '0'
  textarea.style.width = `${contentWidth}px`
  textarea.style.minWidth = `${contentWidth}px`
  textarea.style.maxWidth = `${contentWidth}px`
  textarea.style.height = '0'
  textarea.style.padding = '0'
  textarea.style.border = '0'
  textarea.style.outline = 'none'
  textarea.style.resize = 'none'
  textarea.style.overflow = 'hidden'
  textarea.style.boxSizing = 'content-box'
  textarea.style.background = 'transparent'
  textarea.style.fontFamily = resolvedFontFamily
  textarea.style.fontSize = `${base.fontSize}px`
  textarea.style.lineHeight = String(NOTE_TEXT_LINE_HEIGHT)
  textarea.style.whiteSpace = 'pre-wrap'
  textarea.style.wordBreak = 'break-word'
  textarea.style.overflowWrap = 'anywhere'
  textarea.style.pointerEvents = 'none'

  document.body.appendChild(textarea)
  textarea.style.height = 'auto'
  const textHeight = Math.max(
    Math.ceil(base.fontSize * NOTE_TEXT_LINE_HEIGHT),
    Math.ceil(textarea.scrollHeight),
  )
  document.body.removeChild(textarea)

  return {
    width: Math.round(clampNumber(contentWidth + NOTE_BODY_PAD_X, minWidth, maxWidth)),
    height: Math.round(
      Math.max(base.height, NOTE_HEADER_H + NOTE_BODY_PAD_Y + textHeight),
    ),
    fontSize: base.fontSize,
    fontSizeTier: base.fontSizeTier,
  }
}
