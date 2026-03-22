/**
 * Глобальная пауза всех видео (кнопка в HUD). Пока включено — менеджер
 * воспроизведения не запускает ролики и каждый тик ставит на паузу всё в registry.
 */

let suspended = false
const listeners = new Set<() => void>()

export function getVideoPlaybackSuspended(): boolean {
  return suspended
}

export function setVideoPlaybackSuspended(next: boolean): void {
  suspended = next
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // ignore
    }
  }
}

export function subscribeVideoPlaybackSuspended(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
