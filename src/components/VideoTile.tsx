import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { useCanvasStore } from '../store/canvasStore'
import { videoRegistry } from '../utils/videoRegistry'
import { tileDomRegistry } from '../utils/tileDomRegistry'
import { setVideoUserPausedByUser } from '../utils/videoUserPausedRegistry'
import { videoTileSizeFromVideo } from '../utils/tileSizing'
import type { VideoItem } from '../types'

interface VideoTileProps {
  tile: VideoItem
  scale: number
  isSelected: boolean
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

export const VideoTile: React.FC<VideoTileProps> = ({ tile, scale, isSelected }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const scrubRef = useRef(false)
  const wasPlayingBeforeScrubRef = useRef(false)
  const endScrubRef = useRef<() => void>(() => {})

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(true)

  const updateItem = useCanvasStore((s) => s.updateItem)
  const updateItemsBatch = useCanvasStore((s) => s.updateItemsBatch)
  const selectOne = useCanvasStore((s) => s.selectOne)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }> | null>(null)
  const durationRef = useRef(0)
  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  const aspectAppliedRef = useRef(false)
  useEffect(() => {
    aspectAppliedRef.current = false
  }, [tile.id])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const applyAspect = () => {
      if (aspectAppliedRef.current) return
      const vw = v.videoWidth
      const vh = v.videoHeight
      if (!vw || !vh) return
      aspectAppliedRef.current = true
      const next = videoTileSizeFromVideo(vw, vh)
      if (Math.abs(tile.width - next.width) > 2 || Math.abs(tile.height - next.height) > 2) {
        updateItem(tile.id, { width: next.width, height: next.height })
      }
    }
    v.addEventListener('loadedmetadata', applyAspect)
    v.addEventListener('loadeddata', applyAspect)
    applyAspect()
    return () => {
      v.removeEventListener('loadedmetadata', applyAspect)
      v.removeEventListener('loadeddata', applyAspect)
    }
  }, [tile.id, updateItem])

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
      void v.play().catch(() => {})
    } else {
      setVideoUserPausedByUser(tile.id, true)
      v.pause()
    }
  }

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0

  return (
    <Rnd
      position={{ x: tile.x, y: tile.y }}
      size={{ width: tile.width, height: tile.height }}
      scale={scale}
      minWidth={200}
      minHeight={TITLE_H + 80 + CONTROLS_H}
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
        if (!origins || origins.size <= 1) {
          updateItem(tile.id, { x: d.x, y: d.y })
          return
        }
        const currentOrigin = origins.get(tile.id)
        if (!currentOrigin) {
          updateItem(tile.id, { x: d.x, y: d.y })
          return
        }
        const dx = d.x - currentOrigin.x
        const dy = d.y - currentOrigin.y
        updateItemsBatch(
          Array.from(origins.entries()).map(([id, pos]) => ({
            id,
            updates: { x: pos.x + dx, y: pos.y + dy },
          })),
          { recordHistory: true },
        )
        dragOriginsRef.current = null

        requestAnimationFrame(() => {
          for (const id of origins.keys()) {
            if (id === tile.id) continue
            const el = tileDomRegistry.get(id)
            if (el) el.style.transform = ''
          }
        })
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        updateItem(tile.id, {
          x: position.x,
          y: position.y,
          width: parseInt(ref.style.width, 10),
          height: parseInt(ref.style.height, 10),
        })
      }}
      style={{ zIndex: 10, pointerEvents: 'auto' }}
      dragHandleClassName="tile-drag-handle"
      onMouseDown={(e) => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey) toggleSelect(tile.id)
        else if (!isSelected) selectOne(tile.id)
      }}
    >
      <div
        ref={rootRef}
        className={[
          'relative rounded-lg overflow-hidden shadow-2xl bg-zinc-900 border box-border',
          isSelected ? 'border-indigo-500' : 'border-zinc-700/60',
        ].join(' ')}
        style={{ width: tile.width, height: tile.height }}
      >
        <div
          className="tile-drag-handle absolute left-0 right-0 top-0 z-20 flex items-center px-2 bg-zinc-800/90 cursor-grab active:cursor-grabbing"
          style={{ height: TITLE_H }}
        >
          <span className="text-[11px] text-zinc-400 truncate leading-none select-none">
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
            src={tile.srcUrl}
            className="absolute inset-0 w-full h-full object-contain"
            loop
            muted
            playsInline
            preload="none"
          />
        </div>

        <div
          className="video-controls absolute left-0 right-0 bottom-0 z-30 flex items-center gap-1.5 px-2 bg-zinc-950/95 border-t border-zinc-800/80 pointer-events-auto"
          style={{ height: CONTROLS_H }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
            aria-label={paused ? 'Play' : 'Pause'}
            onClick={(e) => {
              e.stopPropagation()
              togglePlayPause()
            }}
          >
            {paused ? '▶' : '❚❚'}
          </button>

          {/* Custom timeline (no <input type="range"> — avoids Electron/Chromium seek + React bugs) */}
          <div
            ref={trackRef}
            className="flex-1 min-w-0 h-2.5 rounded-full bg-zinc-800 relative cursor-pointer touch-none select-none"
            onPointerDown={onTrackPointerDown}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, duration)}
            aria-valuenow={currentTime}
            aria-label="Timeline"
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-indigo-500 pointer-events-none"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400 shadow pointer-events-none"
              style={{ left: `${progressPct}%` }}
            />
          </div>

          <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums w-[56px] text-right select-none">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </Rnd>
  )
}
