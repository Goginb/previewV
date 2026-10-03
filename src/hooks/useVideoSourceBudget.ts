import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { chooseVideoSources } from '../utils/videoSourceBudget'
import { resolveFarZoomMode } from '../utils/navigationMode'

export function useVideoSourceBudget(containerRef: RefObject<HTMLElement | null>): Set<string> {
  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let timer = 0
    let frame = 0
    let navigationMode = false
    const update = () => {
      frame = 0
      const state = useCanvasStore.getState()
      navigationMode = resolveFarZoomMode(navigationMode, state.viewport.scale)
      const rect = container.getBoundingClientRect()
      const next = new Set(chooseVideoSources({
        items: state.items, viewport: state.viewport, selectedIds: state.selectedIds,
        width: rect.width, height: rect.height, navigationMode,
      }))
      setLoadedIds((prev) => prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next)
    }
    const schedule = (delay = 0) => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      if (delay) timer = window.setTimeout(() => { frame = requestAnimationFrame(update) }, delay)
      else frame = requestAnimationFrame(update)
    }
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (state.viewport !== prev.viewport) schedule(140)
      else if (state.items !== prev.items || state.selectedIds !== prev.selectedIds) schedule()
    })
    const observer = new ResizeObserver(() => schedule())
    observer.observe(container)
    schedule()
    return () => { unsubscribe(); observer.disconnect(); window.clearTimeout(timer); cancelAnimationFrame(frame) }
  }, [containerRef])
  return loadedIds
}
