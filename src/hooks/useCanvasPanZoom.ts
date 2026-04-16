import { useEffect, useRef, useCallback } from 'react'
import { useCanvasStore, MIN_SCALE, MAX_SCALE } from '../store/canvasStore'
import { isTypingTarget } from '../utils/keyboard'

/**
 * Per wheel event: exponential zoom (no RAF queue — updates go straight to the store for low latency).
 * Slightly lower than batched mode because many trackpad events fire per frame.
 */
const WHEEL_EXP_K = 0.00052

/** Right-drag zoom: uses PointerEvent/MouseEvent movementY (screen px since last event) for 1:1 feel. */
const RMB_ZOOM_K = 0.0048
/** Pixels of vertical move before RMB gesture is treated as zoom (quick click still opens menu). */
const RMB_DRAG_THRESHOLD_PX = 5

const PAN_WHEEL_GUARD_MS = 280

/** Shared with Canvas so marquee selection does not start while Space-panning */
export const spacePanActiveRef = { current: false }

/** LMB marquee drag: wheel zoom must not run or world/screen mapping desyncs ("viewport jump"). */
export const marqueeSelectActiveRef = { current: false }

/**
 * Attaches pan (middle-mouse or Space+LMB), zoom (wheel), and zoom-by-drag (RMB + vertical move).
 * Viewport commits synchronously (no requestAnimationFrame batching) so the canvas tracks input immediately.
 */
export function useCanvasPanZoom(containerRef: React.RefObject<HTMLElement | null>) {
  const setViewport = useCanvasStore((s) => s.setViewport)
  const viewportRef = useRef(useCanvasStore.getState().viewport)

  useEffect(() => {
    return useCanvasStore.subscribe((state) => {
      viewportRef.current = state.viewport
    })
  }, [])

  const applyViewport = useCallback(
    (nextViewport: Partial<{ x: number; y: number; scale: number }>) => {
      const current = viewportRef.current
      const merged = {
        x: Number.isFinite(nextViewport.x) ? (nextViewport.x as number) : current.x,
        y: Number.isFinite(nextViewport.y) ? (nextViewport.y as number) : current.y,
        scale: Number.isFinite(nextViewport.scale) ? (nextViewport.scale as number) : current.scale,
      }
      viewportRef.current = merged
      setViewport(merged)
    },
    [setViewport],
  )

  const isPanning = useRef(false)
  const activePanButtonRef = useRef<number | null>(null)
  const panStart = useRef({ x: 0, y: 0 })
  const panOrigin = useRef({ x: 0, y: 0 })
  const spaceDown = useRef(false)
  const wheelGuardUntilRef = useRef(0)

  /** After RMB zoom drag, suppress the following contextmenu so the canvas menu does not pop under the cursor. */
  const suppressNextContextMenuRef = useRef(false)

  const rmbDownRef = useRef(false)
  const rmbZoomArmedRef = useRef(false)
  const rmbGestureStartYRef = useRef(0)

  const handleContextMenuCapture = useCallback((e: MouseEvent) => {
    if (!suppressNextContextMenuRef.current) return
    suppressNextContextMenuRef.current = false
    e.preventDefault()
    e.stopImmediatePropagation()
  }, [])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      if (isPanning.current || Date.now() < wheelGuardUntilRef.current) return
      if ((e.buttons & 4) !== 0) return
      if ((e.buttons & 2) !== 0) return
      if (marqueeSelectActiveRef.current) return

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const { x, y, scale } = viewportRef.current
      if (!Number.isFinite(scale) || scale <= 0) return

      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top

      let raw = -e.deltaY
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) raw *= 16
      else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) raw *= 120

      const factor = Math.exp(raw * WHEEL_EXP_K)
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
      const worldX = (cx - x) / scale
      const worldY = (cy - y) / scale
      applyViewport({
        scale: newScale,
        x: cx - worldX * newScale,
        y: cy - worldY * newScale,
      })
    },
    [containerRef, applyViewport],
  )

  const startPan = useCallback((screenX: number, screenY: number, button: 0 | 1) => {
    isPanning.current = true
    activePanButtonRef.current = button
    panStart.current = { x: screenX, y: screenY }
    panOrigin.current = { x: viewportRef.current.x, y: viewportRef.current.y }
    document.body.style.cursor = 'grabbing'
  }, [])

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault()
        wheelGuardUntilRef.current = Date.now() + PAN_WHEEL_GUARD_MS
        startPan(e.clientX, e.clientY, 1)
        return
      }
      if (e.button === 0 && spaceDown.current) {
        e.preventDefault()
        startPan(e.clientX, e.clientY, 0)
        return
      }
      if (e.button === 2) {
        if (marqueeSelectActiveRef.current) return
        if (isPanning.current) return
        e.preventDefault()
        rmbDownRef.current = true
        rmbZoomArmedRef.current = false
        rmbGestureStartYRef.current = e.clientY
      }
    },
    [startPan],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x
        const dy = e.clientY - panStart.current.y
        applyViewport({
          x: panOrigin.current.x + dx,
          y: panOrigin.current.y + dy,
        })
        return
      }

      if (!rmbDownRef.current) return
      if ((e.buttons & 2) === 0) return
      if (marqueeSelectActiveRef.current) return

      if (!rmbZoomArmedRef.current) {
        if (Math.abs(e.clientY - rmbGestureStartYRef.current) < RMB_DRAG_THRESHOLD_PX) return
        rmbZoomArmedRef.current = true
        wheelGuardUntilRef.current = Date.now() + PAN_WHEEL_GUARD_MS
      }

      const my = e.movementY
      if (my === 0) return

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const { x, y, scale } = viewportRef.current
      if (!Number.isFinite(scale) || scale <= 0) return

      const factor = Math.exp(-my * RMB_ZOOM_K)
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const worldX = (cx - x) / scale
      const worldY = (cy - y) / scale
      applyViewport({
        scale: newScale,
        x: cx - worldX * newScale,
        y: cy - worldY * newScale,
      })
    },
    [applyViewport],
  )

  const stopPan = useCallback((e?: MouseEvent) => {
    if (!isPanning.current) return
    if (e && activePanButtonRef.current !== null && e.button !== activePanButtonRef.current) return
    isPanning.current = false
    activePanButtonRef.current = null
    wheelGuardUntilRef.current = Math.max(wheelGuardUntilRef.current, Date.now() + PAN_WHEEL_GUARD_MS)
    document.body.style.cursor = ''
  }, [])

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      stopPan(e)
      if (e.button === 2) {
        if (rmbZoomArmedRef.current) suppressNextContextMenuRef.current = true
        rmbDownRef.current = false
        rmbZoomArmedRef.current = false
      }
    },
    [stopPan],
  )

  const handleBlur = useCallback(() => {
    stopPan()
    rmbDownRef.current = false
    rmbZoomArmedRef.current = false
  }, [stopPan])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTypingTarget(e)) {
        e.preventDefault()
        spaceDown.current = true
        spacePanActiveRef.current = true
        if (containerRef.current) containerRef.current.style.cursor = 'grab'
      }
    },
    [containerRef],
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false
        spacePanActiveRef.current = false
        stopPan()
        if (containerRef.current) containerRef.current.style.cursor = ''
      }
    },
    [containerRef, stopPan],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    window.addEventListener('contextmenu', handleContextMenuCapture, true)

    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('contextmenu', handleContextMenuCapture, true)
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleBlur,
    handleKeyDown,
    handleKeyUp,
    handleContextMenuCapture,
    containerRef,
  ])
}
