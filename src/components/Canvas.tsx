import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useCanvasPanZoom, spacePanActiveRef } from '../hooks/useCanvasPanZoom'
import { VideoTile } from './VideoTile'
import { NoteTile } from './NoteTile'
import { ImageTile } from './ImageTile'
import { videoRegistry } from '../utils/videoRegistry'
import { imageDrawUndoRegistry } from '../utils/imageDrawUndoRegistry'
import { imageExportRegistry } from '../utils/imageExportRegistry'
import type { CanvasItem, ImageItem, NoteItem, VideoItem } from '../types'

// ── File helpers ──────────────────────────────────────────────────────────────

const ACCEPTED_VIDEO_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/ogg',
  'video/quicktime', 'video/x-matroska', 'video/x-msvideo', 'video/x-m4v',
])
const ACCEPTED_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv',
])

function isVideoFile(file: File): boolean {
  if (ACCEPTED_VIDEO_TYPES.has(file.type)) return true
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  return ACCEPTED_EXTENSIONS.has(ext)
}

function fileToUrl(file: File): string {
  const nativePath = (file as File & { path?: string }).path
  if (nativePath) {
    const normalized = nativePath.replace(/\\/g, '/').replace(/^\//, '')
    return `media:///${normalized}`
  }
  return URL.createObjectURL(file)
}

const TILE_W  = 320
const TILE_H  = 210
const NOTE_W  = 220
const NOTE_H  = 160

const MARQUEE_CLICK_THRESHOLD = 4

function isTypingTarget(e: KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement)?.tagName
  return tag === 'TEXTAREA' || tag === 'INPUT'
}

function captureVideoFrame(video: HTMLVideoElement): string {
  const maxDim = 1920
  const vw = video.videoWidth  || 640
  const vh = video.videoHeight || 360
  const ratio = Math.min(1, maxDim / Math.max(vw, vh))
  const w = Math.round(vw * ratio)
  const h = Math.round(vh * ratio)

  const off = document.createElement('canvas')
  off.width  = w
  off.height = h
  off.getContext('2d')?.drawImage(video, 0, 0, w, h)
  return off.toDataURL('image/png')
}

/** AABB intersection in world space */
function rectsIntersect(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Canvas: React.FC = () => {
  const items           = useCanvasStore((s) => s.items)
  const selectedIds     = useCanvasStore((s) => s.selectedIds)
  const viewport        = useCanvasStore((s) => s.viewport)
  const addItem         = useCanvasStore((s) => s.addItem)
  const removeItems     = useCanvasStore((s) => s.removeItems)
  const clearSelection  = useCanvasStore((s) => s.clearSelection)
  const selectOne       = useCanvasStore((s) => s.selectOne)
  const setSelection    = useCanvasStore((s) => s.setSelection)
  const layoutMediaRow  = useCanvasStore((s) => s.layoutMediaRow)
  const resetViewport   = useCanvasStore((s) => s.resetViewport)

  const containerRef    = useRef<HTMLDivElement>(null)
  const lastMouseScreen = useRef({ x: 0, y: 0 })

  /** Screen-space marquee: relative to container top-left */
  const [marquee, setMarquee] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null)
  const marqueeDrag = useRef<{
    active: boolean
    ax: number
    ay: number
    additive: boolean
  } | null>(null)

  useCanvasPanZoom(containerRef)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    lastMouseScreen.current = {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top  ?? 0),
    }
  }, [])

  // ── Marquee: window listeners while dragging ─────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = marqueeDrag.current
      if (!d?.active || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const bx = e.clientX - rect.left
      const by = e.clientY - rect.top
      setMarquee({ ax: d.ax, ay: d.ay, bx, by })
    }
    const onUp = (e: MouseEvent) => {
      const d = marqueeDrag.current
      if (!d?.active || !containerRef.current) {
        marqueeDrag.current = null
        setMarquee(null)
        return
      }
      marqueeDrag.current = null
      const rect = containerRef.current.getBoundingClientRect()
      const bx = e.clientX - rect.left
      const by = e.clientY - rect.top

      const dx = Math.abs(bx - d.ax)
      const dy = Math.abs(by - d.ay)
      setMarquee(null)

      if (dx < MARQUEE_CLICK_THRESHOLD && dy < MARQUEE_CLICK_THRESHOLD) {
        clearSelection()
        return
      }

      const ax = Math.min(d.ax, bx)
      const ay = Math.min(d.ay, by)
      const aw = Math.abs(bx - d.ax)
      const ah = Math.abs(by - d.ay)

      const { x: vx, y: vy, scale } = useCanvasStore.getState().viewport
      const wx1 = (ax - vx) / scale
      const wy1 = (ay - vy) / scale
      const wx2 = (ax + aw - vx) / scale
      const wy2 = (ay + ah - vy) / scale
      const rx = Math.min(wx1, wx2)
      const ry = Math.min(wy1, wy2)
      const rw = Math.abs(wx2 - wx1)
      const rh = Math.abs(wy2 - wy1)

      const picked = useCanvasStore.getState().items
        .filter((item) =>
          rectsIntersect(rx, ry, rw, rh, item.x, item.y, item.width, item.height),
        )
        .map((i) => i.id)

      if (picked.length === 0) {
        if (!d.additive) clearSelection()
        return
      }

      if (d.additive) {
        const prev = useCanvasStore.getState().selectedIds
        setSelection([...new Set([...prev, ...picked])])
      } else {
        setSelection(picked)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [clearSelection, setSelection])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {

      if (e.code === 'Delete' && !isTypingTarget(e)) {
        const ids = useCanvasStore.getState().selectedIds
        if (ids.length) removeItems(ids)
        return
      }

      if (e.ctrlKey && e.code === 'KeyZ' && !isTypingTarget(e)) {
        e.preventDefault()
        const ids = useCanvasStore.getState().selectedIds
        for (const id of ids) {
          const drawUndo = imageDrawUndoRegistry.get(id)
          if (drawUndo && drawUndo()) return
        }
        useCanvasStore.getState().undo()
        return
      }

      if (e.ctrlKey && e.code === 'KeyC' && !isTypingTarget(e)) {
        const state = useCanvasStore.getState()
        const ids = state.selectedIds
        if (ids.length) {
          e.preventDefault()
          const selected = state.items.filter((i) => ids.includes(i.id))
          const copies: CanvasItem[] = selected.map((item) => {
            if (item.type === 'image') {
              const exporter = imageExportRegistry.get(item.id)
              const dataUrl = exporter ? exporter() : item.dataUrl
              return { ...item, dataUrl }
            }
            return { ...item }
          })
          state.setClipboard(copies)
        }
        return
      }

      if (e.ctrlKey && e.code === 'KeyV' && !isTypingTarget(e)) {
        const state = useCanvasStore.getState()
        if (state.clipboard.length) {
          e.preventDefault()
          const { x: sx, y: sy } = lastMouseScreen.current
          const { x: vx, y: vy, scale } = state.viewport
          const worldX = (sx - vx) / scale
          const worldY = (sy - vy) / scale
          state.pasteClipboard(worldX, worldY)
        }
        return
      }

      // L — layout selected videos + images in a row
      if (e.code === 'KeyL' && !isTypingTarget(e)) {
        e.preventDefault()
        layoutMediaRow()
        return
      }

      if (e.ctrlKey && e.code === 'KeyN' && !isTypingTarget(e)) {
        e.preventDefault()
        const { x: sx, y: sy } = lastMouseScreen.current
        const { x: vx, y: vy, scale } = useCanvasStore.getState().viewport
        const note: NoteItem = {
          type: 'note',
          id:   `note-${Date.now()}`,
          text: '',
          x: (sx - vx) / scale - NOTE_W / 2,
          y: (sy - vy) / scale - NOTE_H / 2,
          width:  NOTE_W,
          height: NOTE_H,
        }
        addItem(note)
        selectOne(note.id)
        return
      }

      if (e.code === 'F3') {
        e.preventDefault()
        const state = useCanvasStore.getState()
        const ids   = new Set(state.selectedIds)
        const selected = state.items.find(
          (i) => i.type === 'video' && ids.has(i.id),
        ) as VideoItem | undefined
        if (!selected) return

        const video = videoRegistry.get(selected.id)
        if (!video) return

        const dataUrl = captureVideoFrame(video)

        const siblings = state.items.filter(
          (i): i is ImageItem =>
            i.type === 'image' && i.sourceVideoId === selected.id,
        )
        const anchor = siblings.length > 0
          ? siblings.reduce((a, b) =>
              a.x + a.width > b.x + b.width ? a : b)
          : selected

        const img: ImageItem = {
          type:          'image',
          id:            `img-${Date.now()}`,
          dataUrl,
          sourceVideoId: selected.id,
          x:      anchor.x + anchor.width + 24,
          y:      anchor.y,
          width:  selected.width,
          height: selected.height,
        }
        addItem(img)
        selectOne(img.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addItem, removeItems, selectOne, layoutMediaRow])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      const sx   = e.clientX - (rect?.left ?? 0)
      const sy   = e.clientY - (rect?.top  ?? 0)
      const wx   = (sx - viewport.x) / viewport.scale
      const wy   = (sy - viewport.y) / viewport.scale

      const videoFiles = Array.from(e.dataTransfer.files).filter(isVideoFile)
      if (!videoFiles.length) return

      videoFiles.forEach((file, i) => {
        const tile: VideoItem = {
          type:     'video',
          id:       `tile-${Date.now()}-${i}`,
          srcUrl:   fileToUrl(file),
          fileName: file.name,
          x:        wx - TILE_W / 2 + i * 24,
          y:        wy - TILE_H / 2 + i * 24,
          width:    TILE_W,
          height:   TILE_H,
        }
        addItem(tile)
      })
    },
    [addItem, viewport],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      if (spacePanActiveRef.current) return

      const t = e.target as HTMLElement
      const isBg =
        t === containerRef.current ||
        t.getAttribute('data-canvas-bg') === 'true'

      if (!isBg) return

      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const ax = e.clientX - rect.left
      const ay = e.clientY - rect.top

      marqueeDrag.current = {
        active: true,
        ax,
        ay,
        additive: e.ctrlKey || e.metaKey,
      }
      setMarquee({ ax, ay, bx: ax, by: ay })
    },
    [],
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const t = e.target as HTMLElement
      const isBg =
        t === containerRef.current ||
        t.getAttribute('data-canvas-bg') === 'true'
      if (isBg) resetViewport()
    },
    [resetViewport],
  )

  return (
    <div
      ref={containerRef}
      data-canvas-bg="true"
      className="relative w-full h-full overflow-hidden bg-zinc-950 outline-none"
      tabIndex={-1}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        data-canvas-bg="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #3f3f46 1px, transparent 1px)',
          backgroundSize:     `${32 * viewport.scale}px ${32 * viewport.scale}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      />

      {marquee && (
        <div
          className="absolute z-[100] border border-indigo-400/90 bg-indigo-500/15 pointer-events-none rounded-sm"
          style={{
            left:   Math.min(marquee.ax, marquee.bx),
            top:    Math.min(marquee.ay, marquee.by),
            width:  Math.abs(marquee.bx - marquee.ax),
            height: Math.abs(marquee.by - marquee.ay),
          }}
        />
      )}

      <div
        className="pointer-events-none"
        style={{
          position:       'absolute',
          top: 0, left: 0,
          width: 0, height: 0,
          transformOrigin: '0 0',
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        }}
      >
        {items.map((item: CanvasItem) => {
          const sel = selectedIds.includes(item.id)
          if (item.type === 'video') {
            return <VideoTile key={item.id} tile={item} scale={viewport.scale} isSelected={sel} />
          }
          if (item.type === 'note') {
            return <NoteTile key={item.id} note={item} scale={viewport.scale} isSelected={sel} />
          }
          if (item.type === 'image') {
            return <ImageTile key={item.id} item={item} scale={viewport.scale} isSelected={sel} />
          }
          return null
        })}
      </div>

      {items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <div className="text-center text-zinc-600">
            <div className="text-5xl mb-4 opacity-40">▶</div>
            <p className="text-base font-medium tracking-wide">Drop video files here</p>
            <p className="text-sm mt-1 opacity-60">MP4 · WebM · MOV · MKV and more</p>
            <p className="text-xs mt-3 opacity-40">
              Drag to select · Ctrl+drag add · L — row · Ctrl+N / F3
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
