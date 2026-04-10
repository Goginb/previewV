import { usePreloadStore } from '../store/preloadStore'

function closePreloadUi(): void {
  const store = usePreloadStore.getState()
  store.setOpen(false)
  store.reset()
}

let projectOpenSessionId = 0

export function beginProjectOpenProgress(line: string): number {
  projectOpenSessionId += 1
  const sessionId = projectOpenSessionId
  const store = usePreloadStore.getState()
  store.setOpen(true)
  store.setProgress(8, line)
  return sessionId
}

export function updateProjectOpenProgress(sessionId: number, pct: number, line: string): void {
  if (sessionId !== projectOpenSessionId) return
  const store = usePreloadStore.getState()
  store.setOpen(true)
  store.setProgress(pct, line)
}

export function finishProjectOpenProgress(sessionId: number, line = 'Project loaded'): void {
  if (sessionId !== projectOpenSessionId) return
  const store = usePreloadStore.getState()
  store.setOpen(true)
  store.setProgress(100, line)
  window.setTimeout(() => {
    if (sessionId !== projectOpenSessionId) return
    closePreloadUi()
  }, 220)
}

export function cancelProjectOpenProgress(sessionId: number): void {
  if (sessionId !== projectOpenSessionId) return
  closePreloadUi()
}

export function requestMediaWarmup(): void {
  const store = usePreloadStore.getState()
  if (!store.open) return
  store.setProgress(Math.max(store.pct, 86), store.line || 'Preparing media...')
}

export function requestVideoWarmupEarly(_videoSrcUrls: string[]): void {
  closePreloadUi()
}

export function requestImageWarmupAfterFolder(): void {
  closePreloadUi()
}
