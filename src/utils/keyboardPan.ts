export type ArrowPanCode = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

export function isArrowPanCode(code: string): code is ArrowPanCode {
  return code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown'
}

export function getArrowPanTarget(keys: ReadonlySet<string>, speed: number): { x: number; y: number } {
  // Viewport coordinates move opposite to camera travel on each axis.
  let x = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)
  let y = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)
  const length = Math.hypot(x, y)
  if (length > 0) {
    x = (x / length) * speed
    y = (y / length) * speed
  }
  return { x, y }
}

export function easePanVelocity(
  current: { x: number; y: number },
  target: { x: number; y: number },
  deltaSeconds: number,
  response: number,
): { x: number; y: number } {
  const amount = 1 - Math.exp(-Math.max(0, response) * Math.max(0, deltaSeconds))
  return {
    x: current.x + (target.x - current.x) * amount,
    y: current.y + (target.y - current.y) * amount,
  }
}
