import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../store/canvasStore'
import type { BackdropItem, VideoItem } from '../types'
import { tileDomRegistry } from '../utils/tileDomRegistry'
import {
  backdropHeaderHeight,
  BACKDROP_BODY_Z,
  BACKDROP_HEADER_Z,
  computeAttachedVideoIds,
} from '../utils/backdrops'

const COLLAPSED_STRIP_H = 48
const DEFAULT_W = 360
const DEFAULT_H = 220

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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const v = Number.parseInt(full, 16)
  /* eslint-disable no-bitwise */
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  /* eslint-enable no-bitwise */
  return { r, g, b }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamped = [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))))
  return `#${clamped.map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case rn:
        h = 60 * (((gn - bn) / d) % 6)
        break
      case gn:
        h = 60 * ((bn - rn) / d + 2)
        break
      default:
        h = 60 * ((rn - gn) / d + 4)
        break
    }
  }
  if (h < 0) h += 360
  return { h, s, l }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rp = 0
  let gp = 0
  let bp = 0
  if (h < 60) {
    rp = c
    gp = x
  } else if (h < 120) {
    rp = x
    gp = c
  } else if (h < 180) {
    gp = c
    bp = x
  } else if (h < 240) {
    gp = x
    bp = c
  } else if (h < 300) {
    rp = x
    bp = c
  } else {
    rp = c
    bp = x
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  }
}

function adjustSaturation(hex: string, saturationPct: number): string {
  const { r, g, b } = hexToRgb(hex)
  const { h, s, l } = rgbToHsl(r, g, b)
  const satMul = Math.max(0, Math.min(2, saturationPct / 100))
  const nextS = Math.max(0, Math.min(1, s * satMul))
  const rgb = hslToRgb(h, nextS, l)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

function hueToBaseHex(hueDeg: number): string {
  const h = ((hueDeg % 360) + 360) % 360
  // Dark/muted base tone; brightness/saturation sliders do the final shaping.
  const rgb = hslToRgb(h, 0.68, 0.36)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
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

interface BackdropTileProps {
  backdrop: BackdropItem
  scale: number
  isSelected: boolean
}

export const BackdropTile: React.FC<BackdropTileProps> = ({ backdrop, scale, isSelected }) => {
  const items = useCanvasStore((s) => s.items)
  const viewport = useCanvasStore((s) => s.viewport)
  const updateItem = useCanvasStore((s) => s.updateItem)
  const updateItemsBatch = useCanvasStore((s) => s.updateItemsBatch)
  const selectOne = useCanvasStore((s) => s.selectOne)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)

  const videos = useMemo(() => items.filter((i): i is VideoItem => i.type === 'video'), [items])

  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number }>(null)
  const [editingLabel, setEditingLabel] = useState(false)
  const labelInputRef = useRef<HTMLInputElement>(null)
  const bgRootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ctxMenu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-backdrop-ctx-menu="true"]')) return
      setCtxMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [ctxMenu])

  // Allow opening context menu by right-click anywhere over this backdrop bounds,
  // even when tiles are above it in z-order.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest?.('[data-backdrop-ctx-menu="true"]')) return
      const left = backdrop.x * viewport.scale + viewport.x
      const top = backdrop.y * viewport.scale + viewport.y
      const width = backdrop.width * viewport.scale
      const height = backdrop.height * viewport.scale
      const inside =
        e.clientX >= left &&
        e.clientX <= left + width &&
        e.clientY >= top &&
        e.clientY <= top + height
      if (!inside) return
      e.preventDefault()
      e.stopPropagation()
      if (!isSelected) selectOne(backdrop.id)
      setCtxMenu({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('contextmenu', onContextMenu, true)
    return () => window.removeEventListener('contextmenu', onContextMenu, true)
  }, [backdrop.id, backdrop.x, backdrop.y, backdrop.width, backdrop.height, viewport.x, viewport.y, viewport.scale, isSelected, selectOne])

  useEffect(() => {
    if (!editingLabel) return
    requestAnimationFrame(() => labelInputRef.current?.focus())
  }, [editingLabel])

  useEffect(() => {
    if (!editingLabel) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-backdrop-label-input="true"]')) return
      setEditingLabel(false)
      labelInputRef.current?.blur()
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [editingLabel])

  // Live drag group without re-rendering: move DOM nodes while dragging.
  const dragRef = useRef<null | {
    ctrl: boolean
    startBackdrop: { x: number; y: number }
    startVideos: Map<string, { x: number; y: number }>
  }>(null)

  const dragVisualRafRef = useRef(0)
  const pendingDragVisualRef = useRef<{ dx: number; dy: number } | null>(null)
  const clearDragVisualScheduling = useCallback(() => {
    if (dragVisualRafRef.current) {
      cancelAnimationFrame(dragVisualRafRef.current)
      dragVisualRafRef.current = 0
    }
  }, [])

  const clearLiveDragTransforms = useCallback(
    (session: { startVideos: Map<string, { x: number; y: number }> } | null) => {
      if (bgRootRef.current) {
        bgRootRef.current.style.transform = ''
        bgRootRef.current.style.willChange = ''
      }
      if (!session) return
      for (const id of session.startVideos.keys()) {
        const el = tileDomRegistry.get(id)
        if (el) {
          el.style.transform = ''
          el.style.willChange = ''
        }
      }
    },
    [],
  )

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
          [
            {
              id: backdrop.id,
              updates: { x: p.x, y: p.y, width: p.width, height: p.height },
            },
          ],
          { markDirty: false, recordHistory: false },
        )
      })
    },
    [backdrop.id, updateItemsBatch],
  )

  const startDrag = useCallback(
    (ev: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent, d: { x: number; y: number }) => {
      const ctrl = (ev as any)?.ctrlKey || (ev as any)?.metaKey
      const state = useCanvasStore.getState()
      const cur = state.items.find((i): i is BackdropItem => i.type === 'backdrop' && i.id === backdrop.id)
      const curVideos = state.items.filter((i): i is VideoItem => i.type === 'video')
      if (!cur) return
      // Recompute attachments on drag start to avoid using stale ids from previous renders/operations.
      const liveAttached = cur.collapsed
        ? cur.attachedVideoIds
        : computeAttachedVideoIds(
            { x: cur.x, y: cur.y, width: cur.width, height: cur.height, labelSize: cur.labelSize },
            curVideos,
          )
      const prevAttached = cur.attachedVideoIds ?? []
      const sameAttached =
        prevAttached.length === liveAttached.length &&
        prevAttached.every((id, idx) => id === liveAttached[idx])
      if (!sameAttached) {
        updateItemsBatch(
          [{ id: cur.id, updates: { attachedVideoIds: liveAttached } }],
          { markDirty: false, recordHistory: false },
        )
      }
      const startVideos = new Map<string, { x: number; y: number }>()
      for (const v of curVideos) {
        if (!liveAttached.includes(v.id)) continue
        startVideos.set(v.id, { x: v.x, y: v.y })
      }
      dragRef.current = {
        ctrl,
        startBackdrop: { x: d.x, y: d.y },
        startVideos,
      }
    },
    [backdrop.id, updateItemsBatch],
  )

  const onCollapseToggle = useCallback(() => {
    const state = useCanvasStore.getState()
    const cur = state.items.find((i): i is BackdropItem => i.type === 'backdrop' && i.id === backdrop.id)
    if (!cur) return

    if (!cur.collapsed) {
      updateItemsBatch(
        [
          {
            id: cur.id,
            updates: {
              collapsed: true,
              expandedHeight: cur.height,
              height: COLLAPSED_STRIP_H,
            },
          },
        ],
        { recordHistory: true },
      )
      return
    }

    const restoreH = cur.expandedHeight ?? DEFAULT_H
    const nextAttached = computeAttachedVideoIds(
      { x: cur.x, y: cur.y, width: cur.width, height: restoreH, labelSize: cur.labelSize },
      state.items.filter((i): i is VideoItem => i.type === 'video'),
    )
    updateItemsBatch(
      [
        {
          id: cur.id,
          updates: {
            collapsed: false,
            expandedHeight: restoreH,
            height: restoreH,
            attachedVideoIds: nextAttached,
          },
        },
      ],
      { recordHistory: true },
    )
  }, [backdrop.id, updateItem, updateItemsBatch])

  const fill = backdrop.color
  const { h: hueBase } = rgbToHsl(...Object.values(hexToRgb(fill)) as [number, number, number])
  const saturation = Math.max(0, Math.min(200, backdrop.saturation ?? 100))
  const fillSaturated = adjustSaturation(fill, saturation)
  const brightness01 = Math.max(0, Math.min(1, (backdrop.brightness ?? 40) / 100))
  const fillAdjusted = mixTowardWhite(fillSaturated, brightness01)
  const border = isSelected ? backdrop.color : '#334155'
  const selectedRing = isSelected
    ? `0 0 0 2px rgba(255,255,255,0.06), 0 0 0 4px ${hexToRgba(fillAdjusted, 0.55)}, 0 0 28px ${hexToRgba(fillAdjusted, 0.22)}`
    : undefined
  const labelSizeClass =
    (backdrop.labelSize ?? 'md') === 'sm'
      ? 'text-[32px]'
      : (backdrop.labelSize ?? 'md') === 'lg'
        ? 'text-[144px]'
        : 'text-[96px]'

  const headerH = backdropHeaderHeight(backdrop.labelSize)
  const headerBtnPx = Math.round(Math.min(64, Math.max(28, headerH * 0.28)))
  const headerBtnFontPx = Math.max(14, Math.round(headerBtnPx * 0.58))
  const headerIconPx = Math.round(headerBtnPx * 0.85)
  const collapseBtnPx = Math.round(headerBtnPx * 0.9)
  const collapseFontPx = Math.round(collapseBtnPx * 0.62)

  const enableResizing = backdrop.collapsed
    ? {
        top: false,
        topLeft: false,
        topRight: false,
        bottom: false,
        bottomLeft: false,
        bottomRight: false,
        left: true,
        right: true,
      }
    : true

  const minH = backdrop.collapsed ? COLLAPSED_STRIP_H : Math.max(120, headerH + 56)

  return (
    <>
      {/* Background / resize layer (below tiles) */}
      <Rnd
        position={{ x: backdrop.x, y: backdrop.y }}
        size={{ width: backdrop.width, height: backdrop.height }}
        scale={scale}
        minWidth={160}
        minHeight={minH}
        cancel=".backdrop-no-drag"
        enableResizing={enableResizing as any}
        disableDragging
        onResize={(_, __, ref, ___, position) => {
          const w = parseInt(ref.style.width, 10)
          const h = parseInt(ref.style.height, 10)
          if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
          scheduleResizeUpdate({ x: position.x, y: position.y, width: w, height: h })
        }}
        onResizeStop={(e, __, ref, ___, position) => {
          e.stopPropagation()
          const w = parseInt(ref.style.width, 10)
          const h = parseInt(ref.style.height, 10)
          if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return

          // During collapse we should not recompute attachment based on the tiny strip.
          if (backdrop.collapsed) {
            updateItemsBatch([{ id: backdrop.id, updates: { x: position.x, y: position.y, width: w, height: h } }], {
              recordHistory: true,
            })
            return
          }

          const nextRect = { x: position.x, y: position.y, width: w, height: h, labelSize: backdrop.labelSize }
          const nextAttached = computeAttachedVideoIds(nextRect, videos)

          updateItemsBatch(
            [
              {
                id: backdrop.id,
                updates: {
                  ...nextRect,
                  expandedHeight: h,
                  attachedVideoIds: nextAttached,
                },
              },
            ],
            { recordHistory: true },
          )
        }}
        // Enable resize handles only when selected; otherwise keep click-through to tiles.
        style={{ zIndex: BACKDROP_BODY_Z, pointerEvents: isSelected ? 'auto' : 'none' }}
      >
        <div
          ref={bgRootRef}
          className="relative w-full h-full rounded-md overflow-hidden border pointer-events-none"
          style={{
            borderColor: border,
            background: hexToRgba(fillAdjusted, 0.55),
            boxShadow: selectedRing,
          }}
        >
          <div className="absolute left-0 right-0 top-0 h-10 bg-black/20 border-b pointer-events-none" style={{ borderColor: hexToRgba(fillAdjusted, 0.35) }} />
        </div>
      </Rnd>

      {/* Header overlay layer (above tiles): drag / rename / context menu */}
      <Rnd
        position={{ x: backdrop.x, y: backdrop.y }}
        size={{ width: backdrop.width, height: headerH }}
        scale={scale}
        enableResizing={false}
        cancel=".backdrop-no-drag"
        onDragStart={(e, d) => {
          e.stopPropagation()
          clearDragVisualScheduling()
          pendingDragVisualRef.current = null
          startDrag(e, { x: d.x, y: d.y })
        }}
        onDrag={(_, d) => {
          const drag = dragRef.current
          if (!drag) return
          const dx = d.x - drag.startBackdrop.x
          const dy = d.y - drag.startBackdrop.y
          pendingDragVisualRef.current = { dx, dy }
          if (dragVisualRafRef.current) return
          dragVisualRafRef.current = requestAnimationFrame(() => {
            dragVisualRafRef.current = 0
            const dragNow = dragRef.current
            const p = pendingDragVisualRef.current
            if (!dragNow || !p) return
            const t = `translate3d(${p.dx}px, ${p.dy}px, 0)`
            if (bgRootRef.current) {
              bgRootRef.current.style.transform = t
              bgRootRef.current.style.willChange = 'transform'
            }
            if (!dragNow.ctrl) {
              for (const [id] of dragNow.startVideos) {
                const el = tileDomRegistry.get(id)
                if (el) {
                  el.style.transform = t
                  el.style.willChange = 'transform'
                }
              }
            }
          })
        }}
        onDragStop={(e, d) => {
          e.stopPropagation()
          clearDragVisualScheduling()
          pendingDragVisualRef.current = null
          const drag = dragRef.current
          dragRef.current = null

          const finish = () => requestAnimationFrame(() => clearLiveDragTransforms(drag))

          if (!drag) {
            updateItem(backdrop.id, { x: d.x, y: d.y })
            finish()
            return
          }

          if (drag.ctrl) {
            updateItemsBatch([{ id: backdrop.id, updates: { x: d.x, y: d.y } }], { recordHistory: true })
            finish()
            return
          }

          const dx = d.x - drag.startBackdrop.x
          const dy = d.y - drag.startBackdrop.y

          const videoUpdates = Array.from(drag.startVideos.entries()).map(([id, pos]) => ({
            id,
            updates: { x: pos.x + dx, y: pos.y + dy },
          }))

          updateItemsBatch(
            [
              { id: backdrop.id, updates: { x: d.x, y: d.y } },
              ...videoUpdates,
            ],
            { recordHistory: true },
          )

          finish()
        }}
        style={{ zIndex: BACKDROP_HEADER_Z, pointerEvents: 'auto' }}
        dragHandleClassName="backdrop-drag-handle"
      >
        <div
          className="backdrop-drag-handle w-full h-full flex items-center gap-2 px-2 bg-black/55 border cursor-grab active:cursor-grabbing select-none rounded-md"
          style={{
            borderColor: hexToRgba(fillAdjusted, 0.45),
            boxShadow: selectedRing,
          }}
          onMouseDown={(ev) => {
            if (ev.ctrlKey || (ev as any).metaKey) toggleSelect(backdrop.id)
            else if (!isSelected) selectOne(backdrop.id)
          }}
          onDoubleClick={(ev) => {
            ev.stopPropagation()
            if (!isSelected) selectOne(backdrop.id)
            setEditingLabel(true)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!isSelected) selectOne(backdrop.id)
            setCtxMenu({ x: e.clientX, y: e.clientY })
          }}
        >
          <div
            className="flex items-center justify-center text-zinc-200/35 select-none leading-none"
            style={{ width: headerIconPx, height: headerIconPx, fontSize: Math.round(headerBtnFontPx * 0.9) }}
          >
            ::
          </div>

          {!editingLabel ? (
            <div
              className={[
                'flex-1 min-w-0 font-medium text-zinc-50/95 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]',
                labelSizeClass,
              ].join(' ')}
              title="Double-click to rename"
            >
              {backdrop.label?.trim() ? backdrop.label : 'Backdrop'}
            </div>
          ) : (
            <input
              ref={labelInputRef}
              data-backdrop-label-input="true"
              value={backdrop.label}
              onChange={(ev) => updateItem(backdrop.id, { label: ev.target.value })}
              onBlur={() => setEditingLabel(false)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === 'Escape') {
                  ev.currentTarget.blur()
                  setEditingLabel(false)
                }
              }}
              onMouseDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => ev.stopPropagation()}
              className={[
                'backdrop-no-drag flex-1 min-w-0 bg-transparent outline-none font-medium text-zinc-50/95 placeholder:text-zinc-400',
                labelSizeClass,
              ].join(' ')}
              placeholder="Backdrop name"
              spellCheck={false}
            />
          )}

          {isSelected && (
            <div className="backdrop-no-drag flex items-center gap-1 mr-1" onMouseDown={(e) => e.stopPropagation()}>
              {(['sm', 'md', 'lg'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={[
                    'backdrop-no-drag shrink-0 rounded border text-zinc-200/90 hover:text-zinc-50 hover:bg-black/60',
                    'bg-black/30 border-zinc-700/60',
                    backdrop.labelSize === sz ? 'ring-1 ring-zinc-200/40' : '',
                  ].join(' ')}
                  style={{ width: headerBtnPx, height: headerBtnPx }}
                  title={`Label size: ${sz.toUpperCase()}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    const prevHeader = backdropHeaderHeight(backdrop.labelSize)
                    const nextHeader = backdropHeaderHeight(sz)
                    const dHeader = nextHeader - prevHeader
                    // Keep the content area top (inner rect) stable: grow header upwards, not downwards.
                    const nextY = backdrop.y - dHeader
                    const nextH = backdrop.height + dHeader
                    const minTotal = nextHeader + 56
                    updateItem(backdrop.id, {
                      labelSize: sz,
                      y: nextY,
                      height: Math.max(nextH, minTotal),
                    })
                  }}
                >
                  <span
                    className={['inline-flex items-center justify-center leading-none', sz === 'lg' ? 'font-semibold' : ''].join(' ')}
                    style={{ fontSize: headerBtnFontPx }}
                  >
                    {sz === 'sm' ? 'S' : sz === 'md' ? 'M' : 'L'}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onMouseDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => {
              ev.stopPropagation()
              onCollapseToggle()
            }}
            className="backdrop-no-drag shrink-0 flex items-center justify-center rounded bg-black/30 hover:bg-black/60 border border-zinc-700/60 text-zinc-100 leading-none"
            style={{ width: collapseBtnPx, height: collapseBtnPx, fontSize: collapseFontPx }}
            title={backdrop.collapsed ? 'Expand backdrop' : 'Collapse backdrop'}
          >
            {backdrop.collapsed ? '▴' : '▾'}
          </button>
        </div>
      </Rnd>

      {ctxMenu &&
        createPortal(
        <div
          data-backdrop-ctx-menu="true"
          className="fixed z-[10000] rounded-lg border border-zinc-700/70 bg-zinc-950/95 shadow-2xl p-2"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] text-zinc-400 mb-1 select-none">Hue</div>
          <div className="flex items-center gap-2">
            <input
              className="w-[160px] backdrop-no-drag"
              type="range"
              min={0}
              max={359}
              value={Math.round(hueBase)}
              onChange={(e) => {
                const v = Number(e.target.value)
                updateItem(backdrop.id, { color: hueToBaseHex(v) })
              }}
            />
            <span className="text-[11px] text-zinc-400 tabular-nums w-10 text-right">
              {Math.round(hueBase)}
            </span>
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-zinc-400 mb-1 select-none">Brightness</div>
            <div className="flex items-center gap-2">
              <input
                className="w-[160px] backdrop-no-drag"
                type="range"
                min={0}
                max={100}
                value={Math.round(backdrop.brightness ?? 40)}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  updateItem(backdrop.id, { brightness: v })
                }}
              />
              <span className="text-[11px] text-zinc-400 tabular-nums w-8 text-right">
                {Math.round(backdrop.brightness ?? 40)}
              </span>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-zinc-400 mb-1 select-none">Saturation</div>
            <div className="flex items-center gap-2">
              <input
                className="w-[160px] backdrop-no-drag"
                type="range"
                min={0}
                max={200}
                value={Math.round(backdrop.saturation ?? 100)}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  updateItem(backdrop.id, { saturation: v })
                }}
              />
              <span className="text-[11px] text-zinc-400 tabular-nums w-8 text-right">
                {Math.round(backdrop.saturation ?? 100)}
              </span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export function createBackdropItem(params: {
  id: string
  x: number
  y: number
  width?: number
  height?: number
  color?: string
  brightness?: number
  saturation?: number
  label?: string
  labelSize?: 'sm' | 'md' | 'lg'
  expandedHeight?: number
  attachedVideoIds?: string[]
}): BackdropItem {
  const width = params.width ?? DEFAULT_W
  const height = params.height ?? DEFAULT_H
  return {
    type: 'backdrop',
    id: params.id,
    x: params.x,
    y: params.y,
    width,
    height,
    color: params.color ?? hueToBaseHex(220),
    brightness: params.brightness ?? 40,
    saturation: params.saturation ?? 100,
    label: params.label ?? '',
    labelSize: params.labelSize ?? 'md',
    collapsed: false,
    expandedHeight: params.expandedHeight ?? height,
    attachedVideoIds: params.attachedVideoIds ?? [],
  }
}

