import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { useCanvasStore } from '../store/canvasStore'
import { imageDrawUndoRegistry } from '../utils/imageDrawUndoRegistry'
import { imageExportRegistry } from '../utils/imageExportRegistry'
import { tileDomRegistry } from '../utils/tileDomRegistry'
import { imageDrawRedoRegistry } from '../utils/imageDrawRedoRegistry'
import { imageTileEditSize, imageTileViewSize } from '../utils/tileSizing'
import type { ImageItem } from '../types'

// ── Types & constants ─────────────────────────────────────────────────────────

type DrawTool = 'pencil' | 'line' | 'eraser'

const PALETTE = [
  '#ffffff', '#ef4444', '#fb923c', '#facc15',
  '#4ade80', '#60a5fa', '#c084fc', '#000000',
]

const SIZES: [number, string][] = [[2, 'S'], [5, 'M'], [12, 'L']]
const EDIT_VIEWPORT_FILL = 0.78

const CURSOR: Record<DrawTool, string> = {
  pencil: 'crosshair',
  line:   'crosshair',
  eraser: 'cell',
}

const MAX_UNDO = 30

// ── Component ─────────────────────────────────────────────────────────────────

interface ImageTileProps {
  item: ImageItem
  scale: number
  isSelected: boolean
}

export const ImageTile: React.FC<ImageTileProps> = ({ item, scale, isSelected }) => {
  const updateItem   = useCanvasStore((s) => s.updateItem)
  const updateItemsBatch = useCanvasStore((s) => s.updateItemsBatch)
  const selectOne    = useCanvasStore((s) => s.selectOne)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const imageEditModeId = useCanvasStore((s) => s.imageEditModeId)
  const setImageEditModeId = useCanvasStore((s) => s.setImageEditModeId)
  const isEditing = imageEditModeId === item.id

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const areaRef   = useRef<HTMLDivElement>(null)
  const rootRef   = useRef<HTMLDivElement>(null)
  const baseImgRef = useRef<HTMLImageElement>(null)
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }> | null>(null)
  const preEditRectRef = useRef<null | { x: number; y: number; width: number; height: number }>(null)

  // Smooth resize: keep store synced while dragging resize handles (throttled to rAF).
  const resizeRafRef = useRef<number>(0)
  const pendingResizeRef = useRef<null | { x: number; y: number; width: number; height: number }>(null)

  const scheduleResizeUpdate = useCallback(
    (next: { x: number; y: number; width: number; height: number }) => {
      pendingResizeRef.current = next
      if (resizeRafRef.current) return
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = 0
        const p = pendingResizeRef.current
        pendingResizeRef.current = null
        if (!p) return
        updateItemsBatch(
          [{ id: item.id, updates: { x: p.x, y: p.y, width: p.width, height: p.height } }],
          { markDirty: false, recordHistory: false },
        )
      })
    },
    [item.id, updateItemsBatch],
  )

  const [tool,  setTool]  = useState<DrawTool>('pencil')
  const [color, setColor] = useState('#ef4444')
  const [size,  setSize]  = useState(5)

  // Drawing refs — no state to avoid mid-stroke re-renders
  const drawing   = useRef(false)
  const lastPt    = useRef<{ x: number; y: number } | null>(null)
  const lineStart = useRef<{ x: number; y: number } | null>(null)
  const lineSnap  = useRef<ImageData | null>(null)
  const overlayDirtyRef = useRef(false)

  // Per-stroke undo: each entry is the canvas state BEFORE that stroke
  const undoStack = useRef<ImageData[]>([])
  // Per-stroke redo: each entry is the canvas state AFTER an undo (i.e. the state to restore on redo)
  const redoStack = useRef<ImageData[]>([])

  // ── Drawing undo (exposed via registry) ─────────────────────────────────
  const undoLastStroke = useCallback((): boolean => {
    const ctx    = canvasRef.current?.getContext('2d')
    const canvas = canvasRef.current
    const prev   = undoStack.current.pop()
    if (ctx && canvas && prev) {
      // For redo we need the current state (before applying `prev`)
      const cur = ctx.getImageData(0, 0, canvas.width, canvas.height)
      redoStack.current.push(cur)
      ctx.putImageData(prev, 0, 0)
      return true
    }
    return false
  }, [])

  const redoLastStroke = useCallback((): boolean => {
    const ctx    = canvasRef.current?.getContext('2d')
    const canvas = canvasRef.current
    const next   = redoStack.current.pop()
    if (ctx && canvas && next) {
      // For undo we need current state (before applying redo snapshot)
      const cur = ctx.getImageData(0, 0, canvas.width, canvas.height)
      undoStack.current.push(cur)
      ctx.putImageData(next, 0, 0)
      return true
    }
    return false
  }, [])

  // Register / unregister when mounted / unmounted or id changes
  useEffect(() => {
    imageDrawUndoRegistry.set(item.id, undoLastStroke)
    imageDrawRedoRegistry.set(item.id, redoLastStroke)
    return () => {
      imageDrawUndoRegistry.delete(item.id)
      imageDrawRedoRegistry.delete(item.id)
    }
  }, [item.id, undoLastStroke])

  const exportAnnotatedDataUrl = useCallback((): string | null => {
    if (!overlayDirtyRef.current) return null
    const canvas = canvasRef.current
    const img = baseImgRef.current
    if (!canvas || !img) return null
    try {
      const off = document.createElement('canvas')
      off.width = canvas.width
      off.height = canvas.height
      const ctx = off.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, off.width, off.height)
      ctx.drawImage(canvas, 0, 0)
      return off.toDataURL('image/png')
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    imageExportRegistry.set(item.id, exportAnnotatedDataUrl)
    return () => { imageExportRegistry.delete(item.id) }
  }, [item.id, exportAnnotatedDataUrl])

  useEffect(() => {
    overlayDirtyRef.current = false
  }, [item.id, item.srcUrl])

  useEffect(() => {
    const el = rootRef.current
    if (el) tileDomRegistry.set(item.id, el)
    return () => {
      tileDomRegistry.delete(item.id)
    }
  }, [item.id])

  const prevEditingRef = useRef(false)
  useEffect(() => {
    const nw = item.naturalWidth
    const nh = item.naturalHeight
    if (!nw || !nh) {
      prevEditingRef.current = isEditing
      return
    }
    if (isEditing && !prevEditingRef.current) {
      // Entering edit mode — snapshot current rect and enlarge
      const state = useCanvasStore.getState()
      const cur = state.items.find((i) => i.id === item.id)
      if (cur) {
        preEditRectRef.current = { x: cur.x, y: cur.y, width: cur.width, height: cur.height }
      }
      const base = imageTileEditSize(nw, nh)
      const root = document.getElementById('previewv-canvas-root')
      const rect = root?.getBoundingClientRect()
      const vp = state.viewport
      if (!rect) {
        updateItem(item.id, { width: base.width, height: base.height })
      } else {
        const toolbarScreenH = 32
        const maxScreenW = Math.max(420, Math.floor(rect.width * EDIT_VIEWPORT_FILL))
        const maxScreenH = Math.max(320, Math.floor(rect.height * EDIT_VIEWPORT_FILL) - toolbarScreenH)
        const ar = Math.max(1e-4, nw / nh)
        let contentScreenW = maxScreenW
        let contentScreenH = Math.round(contentScreenW / ar)
        if (contentScreenH > maxScreenH) {
          contentScreenH = maxScreenH
          contentScreenW = Math.round(contentScreenH * ar)
        }
        const nextW = Math.max(base.width, Math.round(contentScreenW / Math.max(0.001, vp.scale)))
        const nextH = Math.max(base.height, Math.round((contentScreenH + toolbarScreenH) / Math.max(0.001, vp.scale)))
        const centerX = (rect.width / 2 - vp.x) / vp.scale
        const centerY = (rect.height / 2 - vp.y) / vp.scale
        updateItem(item.id, {
          width: nextW,
          height: nextH,
          x: Math.round(centerX - nextW / 2),
          y: Math.round(centerY - nextH / 2),
        })
      }
    }
    if (!isEditing && prevEditingRef.current) {
      const restore = preEditRectRef.current
      if (restore) {
        updateItem(item.id, restore)
      } else {
        const box = imageTileViewSize(nw, nh)
        updateItem(item.id, { width: box.width, height: box.height })
      }
      preEditRectRef.current = null
    }
    prevEditingRef.current = isEditing
  }, [isEditing, item.id, item.naturalWidth, item.naturalHeight, updateItem])

  const naturalSyncRef = useRef(false)
  useEffect(() => {
    naturalSyncRef.current = false
  }, [item.id, item.srcUrl])

  const onBaseImageLoad = useCallback(
    (ev: React.SyntheticEvent<HTMLImageElement>) => {
      if (item.naturalWidth && item.naturalHeight) return
      const img = ev.currentTarget
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (!w || !h || naturalSyncRef.current) return
      naturalSyncRef.current = true
      const box = isEditing ? imageTileEditSize(w, h) : imageTileViewSize(w, h)
      updateItem(item.id, {
        naturalWidth: w,
        naturalHeight: h,
        width: box.width,
        height: box.height,
      })
    },
    [item.id, item.naturalWidth, item.naturalHeight, isEditing, updateItem],
  )

  // ── Keep canvas pixel dimensions in sync with CSS container ─────────────
  useEffect(() => {
    const area   = areaRef.current
    const canvas = canvasRef.current
    if (!area || !canvas) return

    const sync = () => {
      const w = Math.max(1, Math.floor(area.clientWidth))
      const h = Math.max(1, Math.floor(area.clientHeight))
      if (canvas.width !== w || canvas.height !== h) {
        const ctx  = canvas.getContext('2d')
        const data = ctx && canvas.width > 0 && canvas.height > 0
          ? ctx.getImageData(0, 0, canvas.width, canvas.height)
          : null
        canvas.width  = w
        canvas.height = h
        // Resize invalidates all snapshots — clear undo stack
        undoStack.current = []
        if (data) ctx!.putImageData(data, 0, 0)
      }
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(area)
    return () => ro.disconnect()
  }, [])

  // ── Coordinate helper ────────────────────────────────────────────────────
  const toCanvas = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const c    = canvasRef.current!
    const rect = c.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (c.width  / rect.width),
      y: (e.clientY - rect.top)  * (c.height / rect.height),
    }
  }, [])

  // ── Pointer handlers ─────────────────────────────────────────────────────
  const onDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey) toggleSelect(item.id)
    else selectOne(item.id)
    if (!isEditing) return

    const canvas = canvasRef.current
    const ctx    = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // New stroke: clear redo branch
    redoStack.current = []

    // Snapshot the canvas state BEFORE this stroke (for undo)
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height)
    undoStack.current.push(snap)
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()

    drawing.current = true
    const pt = toCanvas(e)
    lastPt.current = pt

    if (tool === 'line') {
      lineStart.current = pt
      lineSnap.current  = snap
    }
  }, [item.id, selectOne, toggleSelect, tool, toCanvas, isEditing])

  const onMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isEditing || !drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pt = toCanvas(e)

      if (tool === 'pencil') {
      overlayDirtyRef.current = true
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = color
      ctx.lineWidth   = size
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.beginPath()
      ctx.moveTo(lastPt.current!.x, lastPt.current!.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
      lastPt.current = pt

    } else if (tool === 'line') {
      overlayDirtyRef.current = true
      // Restore the pre-stroke snapshot so the preview line doesn't compound
      ctx.putImageData(lineSnap.current!, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = color
      ctx.lineWidth   = size
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.beginPath()
      ctx.moveTo(lineStart.current!.x, lineStart.current!.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()

    } else if (tool === 'eraser') {
      overlayDirtyRef.current = true
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth   = size * 4
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.beginPath()
      ctx.moveTo(lastPt.current!.x, lastPt.current!.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
      lastPt.current = pt
    }
  }, [tool, color, size, toCanvas, isEditing])

  const onUp = useCallback(() => {
    drawing.current   = false
    lastPt.current    = null
    lineStart.current = null
    lineSnap.current  = null
  }, [])

  // ── Bake ─────────────────────────────────────────────────────────────────
  const handleBake = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const bakeWithImage = (img: HTMLImageElement) => {
      const off = document.createElement('canvas')
      off.width = canvas.width
      off.height = canvas.height
      const ctx = off.getContext('2d')
      if (!ctx) return
      try {
        ctx.drawImage(img, 0, 0, off.width, off.height)
        ctx.drawImage(canvas, 0, 0)
        const nextSrc = off.toDataURL('image/png')
        overlayDirtyRef.current = false
        updateItem(item.id, {
          srcUrl: nextSrc,
          storage: 'asset',
          projectAssetPath: undefined,
        })
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
        undoStack.current = []
        redoStack.current = []
        setImageEditModeId(null)
      } catch (err: any) {
        alert(err?.message ?? String(err))
      }
    }

    const loaded = baseImgRef.current
    if (loaded && loaded.complete && loaded.naturalWidth > 0 && loaded.naturalHeight > 0) {
      bakeWithImage(loaded)
      return
    }

    const img = new Image()
    img.onload = () => bakeWithImage(img)
    img.src = item.srcUrl
  }, [item.id, item.srcUrl, updateItem, setImageEditModeId])

  const handleClearOverlay = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    overlayDirtyRef.current = false
    undoStack.current = []
    redoStack.current = []
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Rnd
      position={{ x: item.x, y: item.y }}
      size={{ width: item.width, height: item.height }}
      scale={scale}
      minWidth={isEditing ? 200 : 120}
      minHeight={isEditing ? 160 : 100}
      onDragStart={() => {
        const state = useCanvasStore.getState()
        if (!isSelected || state.selectedIds.length <= 1) {
          dragOriginsRef.current = null
          return
        }
        const origins = new Map<string, { x: number; y: number }>()
        for (const it of state.items) {
          if (state.selectedIds.includes(it.id)) {
            origins.set(it.id, { x: it.x, y: it.y })
          }
        }
        dragOriginsRef.current = origins
      }}
      onDrag={(_, d) => {
        const origins = dragOriginsRef.current
        if (!origins || origins.size <= 1) return
        const start = origins.get(item.id)
        if (!start) return
        const dx = d.x - start.x
        const dy = d.y - start.y
        for (const [id] of origins) {
          if (id === item.id) continue
          const el = tileDomRegistry.get(id)
          if (el) el.style.transform = `translate(${dx}px, ${dy}px)`
        }
      }}
      onDragStop={(_, d) => {
        const origins = dragOriginsRef.current
        if (!origins || origins.size <= 1) {
          updateItem(item.id, { x: d.x, y: d.y })
          return
        }
        const currentOrigin = origins.get(item.id)
        if (!currentOrigin) {
          updateItem(item.id, { x: d.x, y: d.y })
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
            if (id === item.id) continue
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
      onResizeStop={(_, __, ref, ___, pos) =>
        updateItem(item.id, {
          x: pos.x, y: pos.y,
          width:  parseInt(ref.style.width,  10),
          height: parseInt(ref.style.height, 10),
        })
      }
      style={{ zIndex: isEditing ? 30 : 15, pointerEvents: 'auto' }}
      dragHandleClassName="img-drag-handle"
      onMouseDown={(e) => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey) toggleSelect(item.id)
        else if (!isSelected) selectOne(item.id)
      }}
    >
      <div
        ref={rootRef}
        data-image-tile-root="true"
        data-item-id={item.id}
        className={[
          'w-full h-full flex flex-col rounded-lg overflow-hidden shadow-2xl bg-zinc-900 border',
          isSelected
            ? 'border-emerald-300 ring-2 ring-emerald-400/80 shadow-[0_0_0_1px_rgba(16,185,129,0.30),0_0_26px_rgba(16,185,129,0.22)]'
            : 'border-zinc-700/60',
        ].join(' ')}
      >

        {/* ── Toolbar / drag handle ──────────────────────────────────── */}
        <div className="img-drag-handle flex items-center gap-1 px-2 h-8 min-h-[32px] bg-zinc-800/90 cursor-grab active:cursor-grabbing shrink-0 select-none overflow-hidden">

          <span className="text-[10px] font-semibold text-emerald-500 shrink-0">IMG</span>
          <div className="w-px h-4 bg-zinc-700 mx-0.5 shrink-0" />

          {!isEditing && (
            <>
              <span className="text-[10px] text-zinc-400 truncate flex-1 min-w-0" title={item.fileName ?? 'Image'}>
                {item.fileName ?? (item.sourceVideoId ? 'Frame' : 'Image')}
              </span>
              <span className="text-[9px] text-zinc-500 shrink-0">F4 — draw</span>
            </>
          )}

          {isEditing && (['pencil', 'line', 'eraser'] as DrawTool[]).map((t) => (
            <button
              key={t}
              title={{ pencil: 'Pencil  (draw)', line: 'Line', eraser: 'Eraser' }[t]}
              onMouseDown={(e) => { e.stopPropagation(); setTool(t) }}
              className={[
                'w-6 h-6 flex items-center justify-center rounded text-sm shrink-0',
                tool === t ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
              ].join(' ')}
            >
              {t === 'pencil' ? '✎' : t === 'line' ? '╱' : 'E'}
            </button>
          ))}

          {isEditing && (
          <>
          <div className="w-px h-4 bg-zinc-700 mx-0.5 shrink-0" />

          {/* Colour palette */}
          <div className="flex gap-[3px] items-center shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            {PALETTE.map((c) => (
              <button
                key={c}
                title={c}
                onMouseDown={(e) => { e.stopPropagation(); setColor(c) }}
                className="w-3.5 h-3.5 rounded-full border border-zinc-600 hover:scale-125 transition-transform shrink-0"
                style={{
                  backgroundColor: c,
                  boxShadow: color === c ? '0 0 0 2px white' : 'none',
                }}
              />
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-700 mx-0.5 shrink-0" />

          {/* Stroke size */}
          <div className="flex gap-0.5 items-center shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            {SIZES.map(([s, label]) => (
              <button
                key={s}
                title={`Size ${label}`}
                onMouseDown={(e) => { e.stopPropagation(); setSize(s) }}
                className={[
                  'w-6 h-6 flex items-center justify-center rounded text-[10px] font-medium shrink-0',
                  size === s ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-700 mx-0.5 shrink-0" />

          {/* Bake */}
          <button
            title="Bake annotations into image"
            onMouseDown={(e) => { e.stopPropagation(); handleBake() }}
            className="h-6 px-2 rounded text-[10px] font-semibold bg-emerald-900/70 text-emerald-400 hover:bg-emerald-800 hover:text-emerald-200 shrink-0 transition-colors"
          >
            Bake
          </button>

          <button
            title="Clear all overlay strokes"
            onMouseDown={(e) => { e.stopPropagation(); handleClearOverlay() }}
            className="h-6 px-2 rounded text-[10px] font-semibold bg-rose-900/70 text-rose-300 hover:bg-rose-800 hover:text-rose-100 shrink-0 transition-colors"
          >
            Clear all
          </button>

          </>
          )}
        </div>

        {/* ── Image + drawing canvas ─────────────────────────────────── */}
        <div ref={areaRef} className="flex-1 relative overflow-hidden bg-black">
          <img
            ref={baseImgRef}
            src={item.srcUrl}
            onLoad={onBaseImageLoad}
            className="absolute inset-0 w-full h-full object-contain select-none"
            style={{ pointerEvents: isEditing ? 'none' : 'auto' }}
            draggable={false}
            alt=""
          />
          <canvas
            ref={canvasRef}
            className={['absolute inset-0 w-full h-full', !isEditing && 'pointer-events-none opacity-0'].filter(Boolean).join(' ')}
            style={{ cursor: isEditing ? CURSOR[tool] : 'default' }}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
          />
        </div>

      </div>
    </Rnd>
  )
}
