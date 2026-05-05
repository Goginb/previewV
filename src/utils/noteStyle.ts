import type { NoteFontFamily } from '../types'

export const DEFAULT_NOTE_COLOR = '#b45309'
export const DEFAULT_NOTE_FONT_FAMILY: NoteFontFamily = 'system'

export const NOTE_FONT_FAMILY_OPTIONS: ReadonlyArray<{
  value: NoteFontFamily
  label: string
  css: string
}> = [
  {
    value: 'system',
    label: 'System UI',
    css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    value: 'segoe',
    label: 'Segoe UI',
    css: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  },
  {
    value: 'arial',
    label: 'Arial',
    css: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  },
  {
    value: 'georgia',
    label: 'Georgia',
    css: 'Georgia, "Times New Roman", serif',
  },
  {
    value: 'times',
    label: 'Times New Roman',
    css: '"Times New Roman", Times, serif',
  },
  {
    value: 'verdana',
    label: 'Verdana',
    css: 'Verdana, Geneva, sans-serif',
  },
  {
    value: 'trebuchet',
    label: 'Trebuchet MS',
    css: '"Trebuchet MS", Tahoma, sans-serif',
  },
  {
    value: 'courier',
    label: 'Courier New',
    css: '"Courier New", Courier, monospace',
  },
]

const NOTE_FONT_FAMILY_SET = new Set<NoteFontFamily>(
  NOTE_FONT_FAMILY_OPTIONS.map((option) => option.value),
)

export function isNoteFontFamily(value: unknown): value is NoteFontFamily {
  return typeof value === 'string' && NOTE_FONT_FAMILY_SET.has(value as NoteFontFamily)
}

export function getNoteFontFamilyCss(fontFamily?: NoteFontFamily): string {
  const option =
    NOTE_FONT_FAMILY_OPTIONS.find((entry) => entry.value === fontFamily) ??
    NOTE_FONT_FAMILY_OPTIONS[0]
  return option.css
}

export function getNoteColor(color?: string): string {
  return typeof color === 'string' && color.trim() ? color : DEFAULT_NOTE_COLOR
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim()
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized
  const value = Number.parseInt(full, 16)
  /* eslint-disable no-bitwise */
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  /* eslint-enable no-bitwise */
  return { r, g, b }
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHexColor(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function mixHexTowardWhite(hex: string, amount: number): string {
  const clamped = Math.max(0, Math.min(1, amount))
  const { r, g, b } = parseHexColor(hex)
  const mix = (channel: number) => clampChannel(channel + (255 - channel) * clamped)
  return `#${[mix(r), mix(g), mix(b)].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}
