import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { useCanvasStore } from '../store/canvasStore'
import { videoRegistry } from '../utils/videoRegistry'
import { tileDomRegistry } from '../utils/tileDomRegistry'
import { setVideoUserPausedByUser } from '../utils/videoUserPausedRegistry'
import { videoTileSizeFromVideo } from '../utils/tileSizing'
import { getVideoPlaybackSuspended } from '../utils/videoGlobalPlayback'
import { setManualPlaybackAllowedInSuspended } from '../utils/videoSuspendedManualAllowRegistry'
import type { VideoItem } from '../types'
import { computeAttachedItemIds } from '../utils/backdrops'
import { localPathToMediaUrl } from '../utils/projectSerializer'

interface VideoTileProps {
  tile: VideoItem
  scale: number
  isSelected: boolean
  isHidden?: boolean
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getVideoDuration(v: HTMLVideoElement, durationState: number): number {
  const d = v.duration
  if (Number.isFinite(d) && d > 0 && d !== Infinity) return d
  if (Number.isFinite(durationState) && durationState > 0) return durationState
  return 0
}

/** px sizes from store — avoids flex/% height collapse when canvas world layer is 0×0 */
const TITLE_H = 24
const CONTROLS_H = 34
const DEFAULT_VIDEO_UI_COLOR = '#6366f1'
const DEFAULT_FRAME_DURATION = 1 / 24
const MIN_FRAME_DURATION = 1 / 120
const MAX_FRAME_DURATION = 1 / 8

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const v = Number.parseInt(full, 16)
  /* eslint-disable no-bitwise */
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  /* eslint-enable no-bitwise */
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function mixTowardWhite(hex: string, amount01: number): string {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const v = Number.parseInt(full, 16)
  /* eslint-disable no-bitwise */
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  /* eslint-enable no-bitwise */
  const a = Math.max(0, Math.min(1, amount01))
  const nr = Math.round(r + (255 - r) * a)
  const ng = Math.round(g + (255 - g) * a)
  const nb = Math.round(b + (255 - b) * a)
  return `#${[nr, ng, nb].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

export const VideoTile: React.FC<VideoTileProps> = ({ tile, scale, isSelected, isHidden }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const scrubRef = useRef(false)
  const wasPlayingBeforeScrubRef = useRef(false)
  const endScrubRef = useRef<() => void>(() => {})
  const frameDurationRef = useRef(DEFAULT_FRAME_DURATION)
  const lastFrameSampleRef = useRef<null | { mediaTime: number; presentedFrames: number }>(null)
  const recoveryCooldownUntilRef = useRef(0)
  const recoveryTimeoutRef = useRef<number | null>(null)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(true)
  const [activeSrcUrl, setActiveSrcUrl] = useState(tile.srcUrl)
  const failedSrcUrlsRef = useRef<Set<string>>(new Set())

  const updateItem = useCanvasStore((s) => s.updateItem)
  const updateItemsBatch = useCanvasStore((s) => s.updateItemsBatch)
  const selectOne = useCanvasStore((s) => s.selectOne)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }> | null>(null)
  const durationRef = useRef(0)
  const srcCandidates = useMemo(() => {
    const out: string[] = []
    const pushUnique = (v: string | undefined) => {
      if (!v) return
      const normalized = v.trim()
      if (!normalized || out.includes(normalized)) return
      out.push(normalized)
    }
    pushUnique(tile.srcUrl)
    if (tile.sourceFilePath) {
      pushUnique(localPathToMediaUrl(tile.sourceFilePath))
    }
    return out
  }, [tile.sourceFilePath, tile.srcUrl])

  // Smooth resize: while user drags resize handles, keep store in sync (throttled to rAF).
  const resizeRafRef = useRef<number>(0)
  const pendingResizeRef = useRef<null | { x: number; y: number; width: number; height: number }>(null)
  const resizeActiveRef = useRef(false)

  const scheduleResizeUpdate = useCallback(
    (next: { x: number; y: number; width: number; height: number }) => {
      if (!resizeActiveRef.current) return
      pendingResizeRef.current = next
      if (resizeRafRef.current) return
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = 0
        const p = pendingResizeRef.current
        pendingResizeRef.current = null
        if (!p) return
        updateItemsBatch(
          [{ id: tile.id, updates: { x: p.x, y: p.y, width: p.width, height: p.height } }],
          { markDirty: false, recordHistory: false },
        )
      })
    },
    [tile.id, updateItemsBatch],
  )
  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    failedSrcUrlsRef.current.clear()
    setActiveSrcUrl(srcCandidates[0] ?? tile.srcUrl)
  }, [srcCandidates, tile.srcUrl])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const applyAspect = () => {
      // If we already applied aspect (or user resized manually), never auto-resize again.
      if (tile.aspectApplied) return
      
      const vw = v.videoWidth
      const vh = v.videoHeight
      if (!vw || !vh) return
      
      const next = videoTileSizeFromVideo(vw, vh)
      if (Math.abs(tile.width - next.width) > 2 || Math.abs(tile.height - next.height) > 2) {
        updateItem(tile.id, { width: next.width, height: next.height, aspectApplied: true })
      } else {
        updateItem(tile.id, { aspectApplied: true })
      }
    }

    v.addEventListener('loadedmetadata', applyAspect)
    v.addEventListener('loadeddata', applyAspect)
    if (!tile.aspectApplied) applyAspect()

    return () => {
      v.removeEventListener('loadedmetadata', applyAspect)
      v.removeEventListener('loadeddata', applyAspect)
    }
  }, [tile.id, tile.width, tile.height, tile.aspectApplied, updateItem])

  const syncFromVideo = useCallback(() => {
    const v = videoRef.current
    // Only guard: while user drags custom timeline (native range had seeking/React fights)
    if (!v || scrubRef.current) return

    const rawD = v.duration
    const dForState =
      Number.isFinite(rawD) && rawD > 0 && rawD !== Infinity ? rawD : 0

    setCurrentTime(v.currentTime)
    setDuration(dForState)
    setPaused(v.paused)
  }, [])

  useLayoutEffect(() => {
    const video = videoRef.current
    if (video) videoRegistry.set(tile.id, video)
    return () => {
      videoRegistry.delete(tile.id)
      setVideoUserPausedByUser(tile.id, false)
    }
  }, [tile.id])

  useEffect(() => {
    const el = rootRef.current
    if (el) tileDomRegistry.set(tile.id, el)
    return () => {
      tileDomRegistry.delete(tile.id)
    }
  }, [tile.id])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setPaused(false)
    const onPause = () => setPaused(true)
    const onTime = () => syncFromVideo()
    const onMeta = () => syncFromVideo()
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('durationchange', onMeta)
    syncFromVideo()
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('durationchange', onMeta)
    }
  }, [tile.id, syncFromVideo])

  useEffect(() => {
    const v = videoRef.current as (HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, metadata: { mediaTime: number; presentedFrames: number }) => void) => number
      cancelVideoFrameCallback?: (handle: number) => void
    }) | null
    if (!v || typeof v.requestVideoFrameCallback !== 'function') return

    let disposed = false
    let callbackHandle = 0

    const requestNext = () => {
      if (disposed || !v.requestVideoFrameCallback) return
      callbackHandle = v.requestVideoFrameCallback((_, metadata) => {
        const prev = lastFrameSampleRef.current
        if (prev && metadata.presentedFrames > prev.presentedFrames) {
          const frameCount = metadata.presentedFrames - prev.presentedFrames
          const mediaDelta = metadata.mediaTime - prev.mediaTime
          if (Number.isFinite(mediaDelta) && mediaDelta > 0 && frameCount > 0) {
            const nextDuration = mediaDelta / frameCount
            if (nextDuration >= MIN_FRAME_DURATION && nextDuration <= MAX_FRAME_DURATION) {
              frameDurationRef.current = nextDuration
            }
          }
        }
        lastFrameSampleRef.current = {
          mediaTime: metadata.mediaTime,
          presentedFrames: metadata.presentedFrames,
        }
        requestNext()
      })
    }

    requestNext()
    return () => {
      disposed = true
      lastFrameSampleRef.current = null
      if (callbackHandle && typeof v.cancelVideoFrameCallback === 'function') {
        try {
          v.cancelVideoFrameCallback(callbackHandle)
        } catch {
          // ignore
        }
      }
    }
  }, [tile.id])

  const scheduleSyncAfterSeek = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const run = () => {
      if (scrubRef.current) return
      syncFromVideo()
    }
    if (v.seeking) {
      v.addEventListener('seeked', run, { once: true })
    } else {
      requestAnimationFrame(run)
    }
  }, [syncFromVideo])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const clearRecoveryTimeout = () => {
      if (recoveryTimeoutRef.current !== null) {
        window.clearTimeout(recoveryTimeoutRef.current)
        recoveryTimeoutRef.current = null
      }
    }

    const attemptRecovery = (reason: string) => {
      if (isHidden) return
      if (scrubRef.current) return

      const now = Date.now()
      if (now < recoveryCooldownUntilRef.current) return

      const savedTime = Number.isFinite(v.currentTime) ? v.currentTime : 0
      const shouldResume = !v.paused
      recoveryCooldownUntilRef.current = now + 2000

      const restore = () => {
        v.removeEventListener('loadeddata', restore)
        v.removeEventListener('canplay', restore)
        clearRecoveryTimeout()

        if (savedTime > 0) {
          try {
            const maxTime =
              Number.isFinite(v.duration) && v.duration > 0
                ? Math.max(0, v.duration - 0.001)
                : savedTime
            v.currentTime = Math.min(savedTime, maxTime)
          } catch {
            // ignore seek restore failures
          }
        }

        scheduleSyncAfterSeek()

        if (shouldResume) {
          if (getVideoPlaybackSuspended()) {
            setManualPlaybackAllowedInSuspended(tile.id, true)
          }
          void v.play().catch(() => {})
        }
      }

      v.addEventListener('loadeddata', restore, { once: true })
      v.addEventListener('canplay', restore, { once: true })

      clearRecoveryTimeout()
      recoveryTimeoutRef.current = window.setTimeout(() => {
        recoveryTimeoutRef.current = null
        restore()
      }, 1200)

      try {
        v.load()
      } catch {
        restore()
      }

      console.warn(`[PreviewV] Recovering video tile "${tile.fileName}" after ${reason}`)
    }

    const onLoadedData = () => {
      clearRecoveryTimeout()
      syncFromVideo()
    }
    const onCanPlay = () => syncFromVideo()
    const onPlaying = () => {
      clearRecoveryTimeout()
      syncFromVideo()
    }
    const onStalled = () => attemptRecovery('stalled')
    const onEmptied = () => attemptRecovery('emptied')
    const onError = () => {
      const current = (v.currentSrc && v.currentSrc.trim()) || activeSrcUrl
      if (current) failedSrcUrlsRef.current.add(current)
      const fallback = srcCandidates.find((src) => !failedSrcUrlsRef.current.has(src))
      if (fallback && fallback !== activeSrcUrl) {
        console.warn(`[PreviewV] Video tile "${tile.fileName}" switching source fallback`)
        setActiveSrcUrl(fallback)
        return
      }
      attemptRecovery('error')
    }

    v.addEventListener('loadeddata', onLoadedData)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('playing', onPlaying)
    v.addEventListener('stalled', onStalled)
    v.addEventListener('emptied', onEmptied)
    v.addEventListener('error', onError)

    return () => {
      clearRecoveryTimeout()
      v.removeEventListener('loadeddata', onLoadedData)
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('playing', onPlaying)
      v.removeEventListener('stalled', onStalled)
      v.removeEventListener('emptied', onEmptied)
      v.removeEventListener('error', onError)
    }
  }, [activeSrcUrl, isHidden, scheduleSyncAfterSeek, srcCandidates, syncFromVideo, tile.fileName, tile.id])

  const beginScrub = useCallback(() => {
    const v = videoRef.current
    if (!v || scrubRef.current) return
    scrubRef.current = true
    wasPlayingBeforeScrubRef.current = !v.paused
    v.pause()
    setVideoUserPausedByUser(tile.id, true)
  }, [tile.id])

  const endScrub = useCallback(() => {
    const v = videoRef.current
    if (!v || !scrubRef.current) return
    scrubRef.current = false
    if (wasPlayingBeforeScrubRef.current) {
      setVideoUserPausedByUser(tile.id, false)
      if (getVideoPlaybackSuspended()) {
        setManualPlaybackAllowedInSuspended(tile.id, true)
      }
      void v.play().catch(() => {})
    }
    scheduleSyncAfterSeek()
  }, [scheduleSyncAfterSeek])

  endScrubRef.current = endScrub

  const seekFromClientX = useCallback((clientX: number) => {
    const v = videoRef.current
    const tr = trackRef.current
    if (!v || !tr) return
    const rect = tr.getBoundingClientRect()
    const tw = rect.width
    if (tw <= 0) return
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / tw))
    const dur = getVideoDuration(v, durationRef.current)
    if (dur <= 0) return
    const t = pct * dur
    v.currentTime = t
    setCurrentTime(t)
  }, [])

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    beginScrub()
    seekFromClientX(e.clientX)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    const move = (ev: PointerEvent) => {
      seekFromClientX(ev.clientX)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      try {
        ;(ev.target as HTMLElement).releasePointerCapture(ev.pointerId)
      } catch {
        // ignore
      }
      endScrubRef.current()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const togglePlayPause = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      setVideoUserPausedByUser(tile.id, false)
      if (getVideoPlaybackSuspended()) {
        setManualPlaybackAllowedInSuspended(tile.id, true)
      }
      void v.play().catch(() => {})
    } else {
      setManualPlaybackAllowedInSuspended(tile.id, false)
      setVideoUserPausedByUser(tile.id, true)
      v.pause()
    }
  }

  const stepFrame = useCallback((direction: -1 | 1) => {
    const v = videoRef.current
    if (!v || !v.paused) return

    const frameDuration = Math.min(
      MAX_FRAME_DURATION,
      Math.max(MIN_FRAME_DURATION, frameDurationRef.current || DEFAULT_FRAME_DURATION),
    )
    const totalDuration = getVideoDuration(v, durationRef.current)
    const epsilon = Math.min(frameDuration * 0.25, 0.001)
    const unclampedTarget =
      direction < 0
        ? v.currentTime - frameDuration - epsilon
        : v.currentTime + frameDuration
    const target =
      totalDuration > 0
        ? Math.max(0, Math.min(totalDuration, unclampedTarget))
        : Math.max(0, unclampedTarget)

    v.currentTime = target
    setCurrentTime(target)
    scheduleSyncAfterSeek()
  }, [scheduleSyncAfterSeek])

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const uiColor = tile.uiColor ?? DEFAULT_VIDEO_UI_COLOR
  const uiColorSoft = mixTowardWhite(uiColor, 0.18)
  const rootBorder = isSelected ? uiColorSoft : hexToRgba(uiColor, 0.42)
  const rootShadow = isSelected
    ? `0 0 0 1px ${hexToRgba(uiColor, 0.30)}, 0 0 0 3px ${hexToRgba(uiColor, 0.18)}, 0 0 28px ${hexToRgba(uiColor, 0.26)}`
    : undefined
  const headerBackground = `linear-gradient(180deg, ${hexToRgba(uiColor, 0.28)}, rgba(20, 24, 36, 0.92))`
  const controlsBackground = `linear-gradient(180deg, rgba(10, 14, 24, 0.97), ${hexToRgba(uiColor, 0.20)})`
  const handleSelect = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.ctrlKey || e.metaKey) toggleSelect(tile.id)
    else if (!isSelected) selectOne(tile.id)
  }, [isSelected, selectOne, tile.id, toggleSelect])
  const dragHandleClassName = 'video-root-drag-handle'

  return (
    <Rnd
      position={{ x: tile.x, y: tile.y }}
      size={{ width: tile.width, height: tile.height }}
      scale={scale}
      minWidth={200}
      minHeight={TITLE_H + 80 + CONTROLS_H}
      cancel=".video-no-drag, .video-controls, button, [role='slider']"
      onDragStart={() => {
        const state = useCanvasStore.getState()
        if (!isSelected || state.selectedIds.length <= 1) {
          dragOriginsRef.current = null
          return
        }
        const origins = new Map<string, { x: number; y: number }>()
        for (const item of state.items) {
          if (state.selectedIds.includes(item.id)) {
            origins.set(item.id, { x: item.x, y: item.y })
          }
        }
        dragOriginsRef.current = origins
      }}
      onDrag={(_, d) => {
        const origins = dragOriginsRef.current
        if (!origins || origins.size <= 1) return
        const start = origins.get(tile.id)
        if (!start) return
        const dx = d.x - start.x
        const dy = d.y - start.y

        for (const [id] of origins) {
          if (id === tile.id) continue
          const el = tileDomRegistry.get(id)
          if (el) el.style.transform = `translate(${dx}px, ${dy}px)`
        }
      }}
      onDragStop={(_, d) => {
        const origins = dragOriginsRef.current
        const state = useCanvasStore.getState()

        const moved = new Map<string, { x: number; y: number }>()
        if (!origins || origins.size <= 1) {
          moved.set(tile.id, { x: d.x, y: d.y })
        } else {
          const currentOrigin = origins.get(tile.id)
          if (!currentOrigin) {
            moved.set(tile.id, { x: d.x, y: d.y })
          } else {
            const dx = d.x - currentOrigin.x
            const dy = d.y - currentOrigin.y
            for (const [id, pos] of origins.entries()) {
              moved.set(id, { x: pos.x + dx, y: pos.y + dy })
            }
          }
        }

        // Apply moved positions to a snapshot so backdrop rules can be evaluated.
        const nextItems = state.items.map((it) => {
          const p = moved.get(it.id)
          return p ? { ...it, x: p.x, y: p.y } : it
        })
        const nextVideos = nextItems.filter((i): i is VideoItem => i.type === 'video')

        const backdropUpdates: Array<{ id: string; updates: any }> = []
        for (const it of nextItems) {
          if (it.type !== 'backdrop') continue
          if (it.collapsed) continue
          const nextAttached = computeAttachedItemIds(it, nextItems)
          const prev = it.attachedVideoIds ?? []
          const same = prev.length === nextAttached.length && prev.every((v, idx) => v === nextAttached[idx])
          if (!same) backdropUpdates.push({ id: it.id, updates: { attachedVideoIds: nextAttached } })
        }

        const movedUpdates = Array.from(moved.entries()).map(([id, pos]) => ({
          id,
          updates: { x: pos.x, y: pos.y },
        }))
        updateItemsBatch([...movedUpdates, ...backdropUpdates], { recordHistory: true })
        dragOriginsRef.current = null

        requestAnimationFrame(() => {
          if (!origins || origins.size <= 1) return
          for (const id of origins.keys()) {
            if (id === tile.id) continue
            const el = tileDomRegistry.get(id)
            if (el) el.style.transform = ''
          }
        })
      }}
      onResize={(_, __, ref, ___, position) => {
        const w = parseInt(ref.style.width, 10)
        const h = parseInt(ref.style.height, 10)
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
        scheduleResizeUpdate({ x: position.x, y: position.y, width: w, height: h })
      }}
      onResizeStart={(e) => {
        if ('button' in e && typeof e.button === 'number' && e.button !== 0) return false
        resizeActiveRef.current = true
        updateItemsBatch([{ id: tile.id, updates: {} }], { recordHistory: true })
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        if (!resizeActiveRef.current) return
        resizeActiveRef.current = false
        updateItemsBatch(
          [{
            id: tile.id,
            updates: {
              x: position.x,
              y: position.y,
              width: parseInt(ref.style.width, 10),
              height: parseInt(ref.style.height, 10),
              aspectApplied: true,
            },
          }],
          { recordHistory: false },
        )
      }}
      enableResizing={true}
      style={{
        zIndex: 10,
        pointerEvents: isHidden ? 'none' : 'auto',
        visibility: isHidden ? 'hidden' : 'visible',
      }}
      dragHandleClassName={dragHandleClassName}
      onMouseDown={handleSelect}
      onDoubleClick={(e: any) => {
        e.stopPropagation()
        const root = document.getElementById('previewv-canvas-root')
        if (root) {
          const rect = root.getBoundingClientRect()
          useCanvasStore.getState().frameItemInViewport(tile.id, rect.width, rect.height)
        }
      }}
    >
      <div
        ref={rootRef}
        data-video-tile-root="true"
        data-item-id={tile.id}
        className={[
          dragHandleClassName,
          'w-full h-full relative rounded-lg overflow-hidden shadow-2xl bg-zinc-900 border box-border',
        ].join(' ')}
        style={{
          borderColor: rootBorder,
          boxShadow: rootShadow,
        }}
        onMouseDown={handleSelect}
      >
        <div
          className="absolute left-0 right-0 top-0 z-20 flex items-center px-2 cursor-grab active:cursor-grabbing"
          style={{
            height: TITLE_H,
            background: headerBackground,
            borderBottom: `1px solid ${hexToRgba(uiColor, 0.26)}`,
          }}
        >
          <span className="text-[11px] truncate leading-none select-none" style={{ color: hexToRgba(uiColorSoft, 0.96) }}>
            {tile.fileName}
          </span>
        </div>

        <div
          className="absolute left-0 right-0 bg-black overflow-hidden"
          style={{
            top: TITLE_H,
            bottom: CONTROLS_H,
          }}
        >
          <video
            ref={videoRef}
            src={activeSrcUrl}
            className="absolute inset-0 w-full h-full object-contain"
            loop
            muted
            playsInline
            preload="metadata"
          />
        </div>

        <div
          className="video-controls absolute left-0 right-0 bottom-0 z-30 flex items-center gap-1.5 px-2 pointer-events-auto"
          style={{
            height: CONTROLS_H,
            background: controlsBackground,
            borderTop: `1px solid ${hexToRgba(uiColor, 0.30)}`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-xs transition-colors"
            disabled={!paused}
            title={paused ? 'Previous frame' : 'Pause video to step frames'}
            style={{
              background: hexToRgba(uiColor, paused ? 0.18 : 0.10),
              border: `1px solid ${hexToRgba(uiColorSoft, paused ? 0.32 : 0.18)}`,
              color: hexToRgba(uiColorSoft, paused ? 0.92 : 0.38),
              cursor: paused ? 'pointer' : 'default',
            }}
            onClick={(e) => {
              e.stopPropagation()
              stepFrame(-1)
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {'<'}
          </button>

          <button
            type="button"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-xs transition-colors"
            aria-label={paused ? 'Play' : 'Pause'}
            style={{
              background: hexToRgba(uiColor, paused ? 0.24 : 0.32),
              border: `1px solid ${hexToRgba(uiColorSoft, 0.42)}`,
              color: hexToRgba(uiColorSoft, 0.96),
            }}
            onClick={(e) => {
              e.stopPropagation()
              togglePlayPause()
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {paused ? '▶' : '❚❚'}
          </button>

          {/* Custom timeline (no <input type="range"> — avoids Electron/Chromium seek + React bugs) */}
          <button
            type="button"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-xs transition-colors"
            disabled={!paused}
            title={paused ? 'Next frame' : 'Pause video to step frames'}
            style={{
              background: hexToRgba(uiColor, paused ? 0.18 : 0.10),
              border: `1px solid ${hexToRgba(uiColorSoft, paused ? 0.32 : 0.18)}`,
              color: hexToRgba(uiColorSoft, paused ? 0.92 : 0.38),
              cursor: paused ? 'pointer' : 'default',
            }}
            onClick={(e) => {
              e.stopPropagation()
              stepFrame(1)
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {'>'}
          </button>

          <div
            ref={trackRef}
            className="flex-1 min-w-0 h-2.5 rounded-full relative cursor-pointer touch-none select-none"
            style={{
              background: hexToRgba(uiColor, 0.18),
              boxShadow: `inset 0 0 0 1px ${hexToRgba(uiColor, 0.24)}`,
            }}
            onPointerDown={onTrackPointerDown}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, duration)}
            aria-valuenow={currentTime}
            aria-label="Timeline"
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full pointer-events-none"
              style={{
                width: `${progressPct}%`,
                background: uiColor,
              }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow pointer-events-none"
              style={{
                left: `${progressPct}%`,
                background: uiColorSoft,
                boxShadow: `0 0 0 1px ${hexToRgba(uiColor, 0.24)}, 0 0 12px ${hexToRgba(uiColor, 0.28)}`,
              }}
            />
          </div>

          <span className="shrink-0 text-[10px] tabular-nums w-[56px] text-right select-none" style={{ color: hexToRgba(uiColorSoft, 0.9) }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </Rnd>
  )
}
