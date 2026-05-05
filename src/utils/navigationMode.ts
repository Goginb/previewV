export const FAR_ZOOM_MODE_ENTER_SCALE = 0.12
export const FAR_ZOOM_MODE_EXIT_SCALE = 0.16

export function resolveFarZoomMode(currentMode: boolean, scale: number): boolean {
  if (!Number.isFinite(scale) || scale <= 0) return currentMode
  if (currentMode) return scale < FAR_ZOOM_MODE_EXIT_SCALE
  return scale <= FAR_ZOOM_MODE_ENTER_SCALE
}
