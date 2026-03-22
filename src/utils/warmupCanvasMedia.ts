import { usePreloadStore } from '../store/preloadStore'

function closePreloadUi(): void {
  const store = usePreloadStore.getState()
  store.setOpen(false)
  store.reset()
}

export function requestMediaWarmup(): void {
  closePreloadUi()
}

export function requestVideoWarmupEarly(_videoSrcUrls: string[]): void {
  closePreloadUi()
}

export function requestImageWarmupAfterFolder(): void {
  closePreloadUi()
}
