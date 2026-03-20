import { useEffect, useRef, useCallback } from 'react'
import { useCanvasStore, MIN_SCALE, MAX_SCALE } from '../store/canvasStore'

const ZOOM_SENSITIVITY = 0.001
const ZOOM_FACTOR_WHEEL = 0.12

/** Shared with Canvas so marquee selection does not start while Space-panning */
export const spacePanActiveRef = { current: false }

/**
 * Attaches pan (middle-mouse or Space+LMB) and zoom (wheel) behaviour
 * to the given container element.
 */
export function useCanvasPanZoom(containerRef: React.RefObject<HTMLElement | null>) {
  const setViewport = useCanvasStore((s) => s.setViewport)
  const viewportRef = useRef(useCanvasStore.getState().viewport)

  useEffect(() => {
    return useCanvasStore.subscribe((state) => {
      viewportRef.current = state.viewport
    })
  }, [])

  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const panOrigin = useRef({ x: 0, y: 0 })
  const spaceDown = useRef(false)

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()

      const { x, y, scale } = viewportRef.current
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top

      const delta = -e.deltaY * ZOOM_SENSITIVITY
      const factor = 1 + Math.sign(delta) * ZOOM_FACTOR_WHEEL
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))

      const worldX = (cx - x) / scale
      const worldY = (cy - y) / scale

      setViewport({
        scale: newScale,
        x: cx - worldX * newScale,
        y: cy - worldY * newScale,
      })
    },
    [containerRef, setViewport],
  )

  const startPan = useCallback((screenX: number, screenY: number) => {
    isPanning.current = true
    panStart.current = { x: screenX, y: screenY }
    panOrigin.current = { x: viewportRef.current.x, y: viewportRef.current.y }
    document.body.style.cursor = 'grabbing'
  }, [])

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault()
        startPan(e.clientX, e.clientY)
        return
      }
      if (e.button === 0 && spaceDown.current) {
        e.preventDefault()
        startPan(e.clientX, e.clientY)
      }
    },
    [startPan],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isPanning.current) return
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setViewport({
        x: panOrigin.current.x + dx,
        y: panOrigin.current.y + dy,
      })
    },
    [setViewport],
  )

  const stopPan = useCallback(() => {
    if (!isPanning.current) return
    isPanning.current = false
    document.body.style.cursor = ''
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault()
      spaceDown.current = true
      spacePanActiveRef.current = true
      if (containerRef.current) containerRef.current.style.cursor = 'grab'
    }
  }, [containerRef])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceDown.current = false
      spacePanActiveRef.current = false
      stopPan()
      if (containerRef.current) containerRef.current.style.cursor = ''
    }
  }, [containerRef, stopPan])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopPan)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopPan)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleWheel, handleMouseDown, handleMouseMove, stopPan, handleKeyDown, handleKeyUp, containerRef])
}
