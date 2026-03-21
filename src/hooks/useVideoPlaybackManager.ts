import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { videoRegistry } from '../utils/videoRegistry'
import { videoUserPausedIds } from '../utils/videoUserPausedRegistry'
import type { VideoItem } from '../types'

const UPDATE_MS = 400
/** Extra margin so tiles near the edge still count as visible (less “dead” previews). */
const BUFFER_PX = 96
/** Concurrent playing cap — raise carefully (CPU/GPU); still better than “stuck” off-screen logic. */
const MAX_PLAYING = 48

function isVideoItem(item: any): item is VideoItem {
  return item && item.type === 'video'
}

function computeDesiredPlayback(params: {
  containerWidth: number
  containerHeight: number
  viewportX: number
  viewportY: number
  scale: number
  selectedIds: string[]
  items: any[]
}): string[] {
  const {
    containerWidth,
    containerHeight,
    viewportX,
    viewportY,
    scale,
    selectedIds,
    items,
  } = params

  const selectedSet = new Set(selectedIds)
  const centerX = containerWidth / 2
  const centerY = containerHeight / 2

  const candidates: { id: string; distSq: number; selected: boolean }[] = []

  for (const raw of items) {
    if (!isVideoItem(raw)) continue
    const id = raw.id
    const left = raw.x * scale + viewportX
    const top = raw.y * scale + viewportY
    const w = raw.width * scale
    const h = raw.height * scale
    const right = left + w
    const bottom = top + h

    const visible =
      !(right < -BUFFER_PX || left > containerWidth + BUFFER_PX || bottom < -BUFFER_PX || top > containerHeight + BUFFER_PX)

    // Only viewport-visible tiles are candidates (no off-screen playback, even if selected).
    if (!visible) continue

    const selected = selectedSet.has(id)

    const tileCenterX = (left + right) / 2
    const tileCenterY = (top + bottom) / 2
    const dx = tileCenterX - centerX
    const dy = tileCenterY - centerY
    candidates.push({ id, distSq: dx * dx + dy * dy, selected })
  }

  if (candidates.length === 0) return []

  const selectedCandidates = candidates.filter((c) => c.selected).sort((a, b) => a.distSq - b.distSq)
  const otherCandidates = candidates.filter((c) => !c.selected).sort((a, b) => a.distSq - b.distSq)

  // Soft limit: selected always win, then fill with closest visible tiles.
  const chosen: string[] = []
  for (const c of selectedCandidates) {
    if (chosen.length >= MAX_PLAYING) break
    chosen.push(c.id)
  }
  if (chosen.length < MAX_PLAYING) {
    for (const c of otherCandidates) {
      if (chosen.length >= MAX_PLAYING) break
      chosen.push(c.id)
    }
  }
  return chosen
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

export function useVideoPlaybackManager(containerRef: React.RefObject<HTMLElement | null>) {
  const playingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const tick = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width))
      const h = Math.max(1, Math.floor(rect.height))
      if (w <= 0 || h <= 0) return

      const state = useCanvasStore.getState()
      const desiredIds = computeDesiredPlayback({
        containerWidth: w,
        containerHeight: h,
        viewportX: state.viewport.x,
        viewportY: state.viewport.y,
        scale: state.viewport.scale,
        selectedIds: state.selectedIds,
        items: state.items,
      })

      const desiredSet = new Set(desiredIds)
      const currentPlaying = playingRef.current

      /** Only ids whose <video> is mounted — otherwise we must retry play on the next tick */
      const nextPlaying = new Set<string>()

      // Pause videos no longer desired
      for (const id of currentPlaying) {
        if (desiredSet.has(id)) continue
        const video = videoRegistry.get(id)
        if (!video) continue
        try {
          video.pause()
        } catch {
          // ignore
        }
      }

      for (const id of desiredSet) {
        const video = videoRegistry.get(id)
        if (!video) {
          // Not registered yet (first paint / Rnd) — do not mark as "handled", retry soon.
          continue
        }

        const isNew = !currentPlaying.has(id)

        if (isNew) {
          if (!videoUserPausedIds.has(id)) {
            try {
              void video.play().catch(() => {})
            } catch {
              // ignore
            }
          }
        }

        nextPlaying.add(id)
      }

      if (setsEqual(nextPlaying, currentPlaying)) return

      playingRef.current = nextPlaying
    }

    let rafScheduled = 0
    const scheduleTick = () => {
      if (rafScheduled) return
      rafScheduled = requestAnimationFrame(() => {
        rafScheduled = 0
        tick()
      })
    }

    tick()
    const interval = window.setInterval(tick, UPDATE_MS)
    const unsub = useCanvasStore.subscribe(scheduleTick)

    return () => {
      window.clearInterval(interval)
      unsub()
      if (rafScheduled) cancelAnimationFrame(rafScheduled)
    }
  }, [containerRef])
}

