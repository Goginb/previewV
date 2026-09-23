export type VideoColorCommand =
  | 'brightness-up'
  | 'brightness-down'
  | 'gamma-up'
  | 'gamma-down'
  | 'reset'

export interface VideoColorSettings {
  brightness: number
  gamma: number
}

export const DEFAULT_VIDEO_COLOR: VideoColorSettings = { brightness: 1, gamma: 1 }

const BRIGHTNESS_STEP = 0.05
const GAMMA_STEP = 0.1

export function videoColorCommandForKey(code: string): VideoColorCommand | null {
  switch (code) {
    case 'NumpadAdd': return 'brightness-up'
    case 'NumpadSubtract': return 'brightness-down'
    case 'NumpadMultiply': return 'gamma-up'
    case 'NumpadDivide': return 'gamma-down'
    case 'Numpad5': return 'reset'
    default: return null
  }
}

export function applyVideoColorCommand(
  current: VideoColorSettings,
  command: VideoColorCommand,
): VideoColorSettings {
  if (command === 'reset') return DEFAULT_VIDEO_COLOR
  if (command === 'brightness-up' || command === 'brightness-down') {
    const direction = command === 'brightness-up' ? 1 : -1
    const brightness = Math.round((current.brightness + direction * BRIGHTNESS_STEP) * 100) / 100
    return {
      ...current,
      brightness: Math.max(0.2, Math.min(3, brightness)),
    }
  }
  const direction = command === 'gamma-up' ? 1 : -1
  const gamma = Math.round((current.gamma + direction * GAMMA_STEP) * 10) / 10
  return {
    ...current,
    gamma: Math.max(0.4, Math.min(2.5, gamma)),
  }
}
