import { useEffect, useRef, useCallback } from 'react'
import { useCanvasStore, MIN_SCALE, MAX_SCALE } from '../store/canvasStore'
import { isTypingTarget } from '../utils/keyboard'
import { easePanVelocity, getArrowPanTarget, isArrowPanCode } from '../utils/keyboardPan'

/** Exponential zoom speed for wheel input. Events are coalesced per animation frame. */
const WHEEL_EXP_K = 0.00156

const PAN_WHEEL_GUARD_MS = 280
const KEYBOARD_PAN_SPEED_PX_PER_SECOND = 760
const KEYBOARD_PAN_ACCELERATION = 11
const KEYBOARD_PAN_DECELERATION = 14
const KEYBOARD_PAN_STOP_EPSILON = 2
const KEYBOARD_PAN_MAX_FRAME_SECONDS = 0.05

/** Shared with Canvas so marquee selection does not start while Space-panning */
export const spacePanActiveRef = { current: false }

/** LMB marquee drag: wheel zoom must not run or world/screen mapping desyncs ("viewport jump"). */
export const marqueeSelectActiveRef = { current: false }

/**
 * Attaches pan (middle-mouse or Space+LMB) and wheel zoom.
 * Pan/zoom commits are coalesced per animation frame to keep navigation smooth under heavy scenes.
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
  const pendingPanViewportRef = useRef<null | { x: number; y: number }>(null)
  const panFrameRef = useRef(0)
  const pendingWheelRawRef = useRef(0)
  const pendingWheelCursorRef = useRef<null | { x: number; y: number }>(null)
  const wheelFrameRef = useRef(0)
  const spaceDown = useRef(false)
  const wheelGuardUntilRef = useRef(0)
  const keyboardPanKeysRef = useRef<Set<string>>(new Set())
  const keyboardPanVelocityRef = useRef({ x: 0, y: 0 })
  const keyboardPanFrameRef = useRef(0)
  const keyboardPanLastFrameRef = useRef(0)

  const applyPendingWheelZoom = useCallback(() => {
    wheelFrameRef.current = 0
    const raw = pendingWheelRawRef.current
    const cursor = pendingWheelCursorRef.current
    pendingWheelRawRef.current = 0
    pendingWheelCursorRef.current = null
    if (!raw || !cursor) return

    const { x, y, scale } = viewportRef.current
    if (!Number.isFinite(scale) || scale <= 0) return

    const factor = Math.exp(raw * WHEEL_EXP_K)
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
    const worldX = (cursor.x - x) / scale
    const worldY = (cursor.y - y) / scale
    applyViewport({
      scale: newScale,
      x: cursor.x - worldX * newScale,
      y: cursor.y - worldY * newScale,
    })
  }, [applyViewport])

  const flushPendingWheelZoom = useCallback(() => {
    if (wheelFrameRef.current) {
      cancelAnimationFrame(wheelFrameRef.current)
    }
    applyPendingWheelZoom()
  }, [applyPendingWheelZoom])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      if (isPanning.current || Date.now() < wheelGuardUntilRef.current) return
      if ((e.buttons & 4) !== 0) return
      if ((e.buttons & 2) !== 0) return
      if (marqueeSelectActiveRef.current) return

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const { scale } = viewportRef.current
      if (!Number.isFinite(scale) || scale <= 0) return

      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top

      let raw = -e.deltaY
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) raw *= 16
      else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) raw *= 120

      pendingWheelRawRef.current += raw
      pendingWheelCursorRef.current = { x: cx, y: cy }
      if (!wheelFrameRef.current) {
        wheelFrameRef.current = requestAnimationFrame(applyPendingWheelZoom)
      }
    },
    [applyPendingWheelZoom, containerRef],
  )

  const startPan = useCallback((screenX: number, screenY: number, button: 0 | 1) => {
    isPanning.current = true
    activePanButtonRef.current = button
    panStart.current = { x: screenX, y: screenY }
    panOrigin.current = { x: viewportRef.current.x, y: viewportRef.current.y }
    document.body.style.cursor = 'grabbing'
  }, [])

  const flushPendingPanViewport = useCallback(() => {
    if (panFrameRef.current) {
      cancelAnimationFrame(panFrameRef.current)
      panFrameRef.current = 0
    }
    const pending = pendingPanViewportRef.current
    pendingPanViewportRef.current = null
    if (!pending) return
    applyViewport(pending)
  }, [applyViewport])

  const schedulePanViewport = useCallback(
    (next: { x: number; y: number }) => {
      pendingPanViewportRef.current = next
      if (panFrameRef.current) return
      panFrameRef.current = requestAnimationFrame(() => {
        panFrameRef.current = 0
        const pending = pendingPanViewportRef.current
        pendingPanViewportRef.current = null
        if (!pending) return
        applyViewport(pending)
      })
    },
    [applyViewport],
  )

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault()
        flushPendingWheelZoom()
        wheelGuardUntilRef.current = Date.now() + PAN_WHEEL_GUARD_MS
        startPan(e.clientX, e.clientY, 1)
        return
      }
      if (e.button === 0 && spaceDown.current) {
        e.preventDefault()
        flushPendingWheelZoom()
        startPan(e.clientX, e.clientY, 0)
        return
      }
    },
    [flushPendingWheelZoom, startPan],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x
        const dy = e.clientY - panStart.current.y
        schedulePanViewport({
          x: panOrigin.current.x + dx,
          y: panOrigin.current.y + dy,
        })
        return
      }
    },
    [schedulePanViewport],
  )

  const stopPan = useCallback((e?: MouseEvent) => {
    if (!isPanning.current) return
    if (e && activePanButtonRef.current !== null && e.button !== activePanButtonRef.current) return
    flushPendingPanViewport()
    isPanning.current = false
    activePanButtonRef.current = null
    wheelGuardUntilRef.current = Math.max(wheelGuardUntilRef.current, Date.now() + PAN_WHEEL_GUARD_MS)
    document.body.style.cursor = ''
  }, [flushPendingPanViewport])

  const handleMouseUp = useCallback((e: MouseEvent) => {
    stopPan(e)
  }, [stopPan])

  const startKeyboardPan = useCallback(() => {
    if (keyboardPanFrameRef.current) return
    keyboardPanLastFrameRef.current = performance.now()

    const step = (now: number) => {
      keyboardPanFrameRef.current = 0
      const deltaSeconds = Math.min(
        KEYBOARD_PAN_MAX_FRAME_SECONDS,
        Math.max(0, (now - keyboardPanLastFrameRef.current) / 1000),
      )
      keyboardPanLastFrameRef.current = now

      const target = getArrowPanTarget(keyboardPanKeysRef.current, KEYBOARD_PAN_SPEED_PX_PER_SECOND)
      const hasPressedKey = target.x !== 0 || target.y !== 0
      const velocity = easePanVelocity(
        keyboardPanVelocityRef.current,
        target,
        deltaSeconds,
        hasPressedKey ? KEYBOARD_PAN_ACCELERATION : KEYBOARD_PAN_DECELERATION,
      )
      keyboardPanVelocityRef.current = velocity

      if (deltaSeconds > 0) {
        const current = viewportRef.current
        applyViewport({
          x: current.x + velocity.x * deltaSeconds,
          y: current.y + velocity.y * deltaSeconds,
        })
      }

      const stillMoving =
        hasPressedKey ||
        Math.abs(velocity.x) > KEYBOARD_PAN_STOP_EPSILON ||
        Math.abs(velocity.y) > KEYBOARD_PAN_STOP_EPSILON
      if (stillMoving) {
        keyboardPanFrameRef.current = requestAnimationFrame(step)
      } else {
        keyboardPanVelocityRef.current = { x: 0, y: 0 }
      }
    }

    keyboardPanFrameRef.current = requestAnimationFrame(step)
  }, [applyViewport])

  const stopKeyboardPan = useCallback(() => {
    keyboardPanKeysRef.current.clear()
    keyboardPanVelocityRef.current = { x: 0, y: 0 }
    if (keyboardPanFrameRef.current) cancelAnimationFrame(keyboardPanFrameRef.current)
    keyboardPanFrameRef.current = 0
  }, [])

  const handleBlur = useCallback(() => {
    stopPan()
    flushPendingWheelZoom()
    stopKeyboardPan()
  }, [flushPendingWheelZoom, stopKeyboardPan, stopPan])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (document.querySelector('[data-previewv-modal="true"]')) return
      if (
        isArrowPanCode(e.code) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTypingTarget(e)
      ) {
        e.preventDefault()
        keyboardPanKeysRef.current.add(e.code)
        startKeyboardPan()
        return
      }
      if (e.code === 'Space' && !e.repeat && !isTypingTarget(e)) {
        e.preventDefault()
        spaceDown.current = true
        spacePanActiveRef.current = true
        if (containerRef.current) containerRef.current.style.cursor = 'grab'
      }
    },
    [containerRef, startKeyboardPan],
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (isArrowPanCode(e.code)) {
        const wasActive = keyboardPanKeysRef.current.delete(e.code)
        if (wasActive) {
          e.preventDefault()
          if (keyboardPanKeysRef.current.size > 0) startKeyboardPan()
        }
      }
      if (e.code === 'Space') {
        spaceDown.current = false
        spacePanActiveRef.current = false
        stopPan()
        if (containerRef.current) containerRef.current.style.cursor = ''
      }
    },
    [containerRef, startKeyboardPan, stopPan],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      flushPendingPanViewport()
      flushPendingWheelZoom()
      stopKeyboardPan()
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
    flushPendingPanViewport,
    flushPendingWheelZoom,
    stopKeyboardPan,
    containerRef,
  ])
}
