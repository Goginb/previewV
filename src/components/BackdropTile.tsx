import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../store/canvasStore'
import { useUiStore } from '../store/uiStore'
import type { BackdropItem, NoteItem } from '../types'
import {
  CanvasCommonMenuSection,
  type CanvasProjectMenuAction,
} from './CanvasCommonMenuSection'
import { useClampedMenuPosition } from '../hooks/useClampedMenuPosition'
import { backdropDomRegistry } from '../utils/backdropDomRegistry'
import { tileDomRegistry } from '../utils/tileDomRegistry'
import { getNoteCreationMetrics } from '../utils/noteCreation'
import { DEFAULT_NOTE_COLOR, DEFAULT_NOTE_FONT_FAMILY } from '../utils/noteStyle'
import {
  DEFAULT_SELECTION_VIDEO_UI_COLOR,
  buildColorUpdatesForIds,
  getContextColorableIds,
  resolveSharedColorForIds,
} from '../utils/selectionColors'
import {
  backdropHeaderHeight,
  BACKDROP_BODY_Z,
  BACKDROP_DEPTH_Z_STEP,
  BACKDROP_HEADER_Z,
  computeAttachedItemIds,
  findBackdropAtPoint,
} from '../utils/backdrops'
import { videoRegistry } from '../utils/videoRegistry'
import {
  getVideoPlaybackSuspended,
  setVideoPlaybackSuspended,
  subscribeVideoPlaybackSuspended,
} from '../utils/videoGlobalPlayback'
import { generateCanvasVideoProxies } from '../utils/generateCanvasVideoProxies'

const COLLAPSED_STRIP_H = 48
const DEFAULT_W = 360
const DEFAULT_H = 220
const CLICK_SUPPRESS_AFTER_DRAG_MS = 180
export const BACKDROP_COLOR_PRESETS = [
  '#475569',
  '#1f4f46',
  '#3f6212',
  '#0f766e',
  '#1d4ed8',
  '#5b21b6',
  '#9d174d',
  '#b45309',
  '#7c2d12',
  '#374151',
] as const

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
  isHidden?: boolean
  nestingDepth?: number
  hiddenItemIds?: Set<string>
}

function attachedIdsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true
  const la = a?.length ?? 0
  const lb = b?.length ?? 0
  if (la !== lb) return false
  if (!a || !b) return true
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Compare fields that affect rendering — not only `backdrop` reference (avoids stale color UI). */
function areBackdropTilePropsEqual(a: BackdropTileProps, b: BackdropTileProps): boolean {
  const A = a.backdrop
  const B = b.backdrop
  return (
    A.id === B.id &&
    A.x === B.x &&
    A.y === B.y &&
    A.width === B.width &&
    A.height === B.height &&
    A.color === B.color &&
    (A.brightness ?? 40) === (B.brightness ?? 40) &&
    (A.saturation ?? 100) === (B.saturation ?? 100) &&
    A.label === B.label &&
    (A.labelSize ?? 'md') === (B.labelSize ?? 'md') &&
    A.collapsed === B.collapsed &&
    A.expandedHeight === B.expandedHeight &&
    A.displayMode === B.displayMode &&
    A.locked === B.locked &&
    attachedIdsEqual(A.attachedVideoIds, B.attachedVideoIds) &&
    a.scale === b.scale &&
    a.isSelected === b.isSelected &&
    (a.isHidden ?? false) === (b.isHidden ?? false) &&
    (a.nestingDepth ?? 0) === (b.nestingDepth ?? 0) &&
    a.hiddenItemIds === b.hiddenItemIds
  )
}

export const BackdropTile = memo(function BackdropTile({
  backdrop,
  scale,
  isSelected,
  isHidden,
  nestingDepth = 0,
  hiddenItemIds,
}: BackdropTileProps) {
  const items = useCanvasStore((s) => s.items)
  const addItem = useCanvasStore((s) => s.addItem)
  const updateItem = useCanvasStore((s) => s.updateItem)
  const updateItemsBatch = useCanvasStore((s) => s.updateItemsBatch)
  const gridAlignTiles = useCanvasStore((s) => s.gridAlignTiles)
  const layoutMediaRow = useCanvasStore((s) => s.layoutMediaRow)
  const frameAllItemsInViewport = useCanvasStore((s) => s.frameAllItemsInViewport)
  const resetViewport = useCanvasStore((s) => s.resetViewport)
  const selectOne = useCanvasStore((s) => s.selectOne)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const canvasLocked = useCanvasStore((s) => s.canvasLocked)
  const setCanvasLocked = useCanvasStore((s) => s.setCanvasLocked)
  const setItemsLocked = useCanvasStore((s) => s.setItemsLocked)
  const clipboardCount = useCanvasStore((s) => s.clipboard.length)
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard)
  const alwaysOnTop = useUiStore((s) => s.alwaysOnTop)
  const setAlwaysOnTop = useUiStore((s) => s.setAlwaysOnTop)
  const showStudioImport = window.electronAPI?.platform === 'win32'
  const interactionLocked = canvasLocked || !!backdrop.locked

  const selectionLockState = useMemo<'none' | 'locked' | 'unlocked' | 'mixed'>(() => {
    const selected = items.filter((item) => selectedIds.includes(item.id))
    if (selected.length === 0) return 'none'
    const lockedCount = selected.filter((item) => item.locked).length
    if (lockedCount === 0) return 'unlocked'
    if (lockedCount === selected.length) return 'locked'
    return 'mixed'
  }, [items, selectedIds])

  const backdrops = useMemo(() => items.filter((item): item is BackdropItem => item.type === 'backdrop'), [items])
  const selectionColorTargetIds = useMemo(
    () => getContextColorableIds(items, selectedIds, backdrop.id),
    [backdrop.id, items, selectedIds],
  )
  const selectionSharedColor = useMemo(
    () =>
      resolveSharedColorForIds(items, selectionColorTargetIds, {
        videoUiColor: DEFAULT_SELECTION_VIDEO_UI_COLOR,
        noteColor: DEFAULT_NOTE_COLOR,
      }),
    [items, selectionColorTargetIds],
  )
  const applySelectionColor = useCallback((color: string) => {
    if (canvasLocked) return
    const ids = selectionColorTargetIds.filter((id) =>
      items.some((item) => item.id === id && !item.locked),
    )
    const updates = buildColorUpdatesForIds(items, ids, color)
    if (!updates.length) return
    updateItemsBatch(updates, { recordHistory: true })
  }, [canvasLocked, items, selectionColorTargetIds, updateItemsBatch])
  const previewSelectionColor = useCallback((color: string) => {
    if (canvasLocked) return
    const ids = selectionColorTargetIds.filter((id) =>
      items.some((item) => item.id === id && !item.locked),
    )
    const updates = buildColorUpdatesForIds(items, ids, color)
    if (!updates.length) return
    updateItemsBatch(updates)
  }, [canvasLocked, items, selectionColorTargetIds, updateItemsBatch])

  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number }>(null)
  const { menuRef: backdropMenuRef, menuPosition: backdropMenuPosition } = useClampedMenuPosition(
    ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null,
  )
  const [editingLabel, setEditingLabel] = useState(false)
  const [playbackSuspended, setPlaybackSuspendedState] = useState(getVideoPlaybackSuspended)
  const labelInputRef = useRef<HTMLInputElement>(null)
  const bgRootRef = useRef<HTMLDivElement>(null)
  const headerRootRef = useRef<HTMLDivElement>(null)
  const suppressClickUntilRef = useRef(0)
  useEffect(() => {
    return subscribeVideoPlaybackSuspended(() => {
      setPlaybackSuspendedState(getVideoPlaybackSuspended())
    })
  }, [])
  useEffect(() => {
    if (isHidden) return
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
  }, [ctxMenu, isHidden])

  // Allow opening context menu by right-click anywhere over this backdrop bounds,
  // even when tiles are above it in z-order.
  useEffect(() => {
    if (isHidden) return
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      const target = e.target as HTMLElement | null
      if (target?.closest?.('[data-backdrop-ctx-menu="true"]')) return
      const { x: vx, y: vy, scale: vpScale } = useCanvasStore.getState().viewport
      const worldX = (e.clientX - vx) / vpScale
      const worldY = (e.clientY - vy) / vpScale
      const hitBackdrop = findBackdropAtPoint(
        backdrops.filter((item) => !hiddenItemIds?.has(item.id)),
        worldX,
        worldY,
      )
      if (hitBackdrop?.id !== backdrop.id) return
      e.preventDefault()
      e.stopPropagation()
      if (!isSelected) selectOne(backdrop.id)
      setCtxMenu({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('contextmenu', onContextMenu, true)
    return () => window.removeEventListener('contextmenu', onContextMenu, true)
  }, [backdrop.id, isSelected, selectOne, backdrops, isHidden, hiddenItemIds])

  useEffect(() => {
    if (isHidden) return
    if (!editingLabel) return
    requestAnimationFrame(() => labelInputRef.current?.focus())
  }, [editingLabel, isHidden])

  useEffect(() => {
    if (interactionLocked) setEditingLabel(false)
  }, [interactionLocked])

  useEffect(() => {
    if (isHidden) return
    if (!editingLabel) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-backdrop-label-input="true"]')) return
      setEditingLabel(false)
      labelInputRef.current?.blur()
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [editingLabel, isHidden])

  const runCommonMenuNewNote = useCallback(() => {
    if (!ctxMenu) return
    const state = useCanvasStore.getState()
    if (state.canvasLocked) return
    const { x: vx, y: vy, scale: vpScale } = state.viewport
    const noteMetrics = getNoteCreationMetrics(vpScale)
    const note: NoteItem = {
      type: 'note',
      id: `note-${Date.now()}`,
      x: (ctxMenu.x - vx) / vpScale - noteMetrics.width / 2,
      y: (ctxMenu.y - vy) / vpScale - noteMetrics.height / 2,
      width: noteMetrics.width,
      height: noteMetrics.height,
      fontSize: noteMetrics.fontSize,
      fontSizeTier: noteMetrics.fontSizeTier,
      color: DEFAULT_NOTE_COLOR,
      fontFamily: DEFAULT_NOTE_FONT_FAMILY,
      text: '',
    }
    addItem(note)
    selectOne(note.id)
    setCtxMenu(null)
  }, [addItem, ctxMenu, selectOne])

  const runCommonMenuAddBackdrop = useCallback(() => {
    if (!ctxMenu) return
    const state = useCanvasStore.getState()
    if (state.canvasLocked) return
    const { x: vx, y: vy, scale: vpScale } = state.viewport
    const worldX = (ctxMenu.x - vx) / vpScale
    const worldY = (ctxMenu.y - vy) / vpScale
    const nextBackdrop = createBackdropItem({
      id: `backdrop-${Date.now()}`,
      x: worldX - 400,
      y: worldY - 300,
      width: 800,
      height: 600,
    })
    addItem(nextBackdrop)
    selectOne(nextBackdrop.id)
    setCtxMenu(null)
  }, [addItem, ctxMenu, selectOne])

  const runCommonMenuPaste = useCallback(() => {
    if (!ctxMenu) return
    const state = useCanvasStore.getState()
    if (state.canvasLocked) return
    const { x: vx, y: vy, scale: vpScale } = state.viewport
    pasteClipboard((ctxMenu.x - vx) / vpScale, (ctxMenu.y - vy) / vpScale)
    setCtxMenu(null)
  }, [ctxMenu, pasteClipboard])

  const runCommonMenuGridAlign = useCallback(() => {
    gridAlignTiles()
    setCtxMenu(null)
  }, [gridAlignTiles])

  const runCommonMenuLayoutMediaRow = useCallback(() => {
    layoutMediaRow()
    setCtxMenu(null)
  }, [layoutMediaRow])

  const runCommonMenuFitAll = useCallback(() => {
    const root = document.getElementById('previewv-canvas-root')
    if (!root) return
    const rect = root.getBoundingClientRect()
    frameAllItemsInViewport(rect.width, rect.height)
    setCtxMenu(null)
  }, [frameAllItemsInViewport])

  const runCommonMenuResetView = useCallback(() => {
    resetViewport()
    setCtxMenu(null)
  }, [resetViewport])

  const runCommonMenuToggleSelectionLock = useCallback(() => {
    const state = useCanvasStore.getState()
    const selected = state.items.filter((item) => state.selectedIds.includes(item.id))
    if (selected.length === 0) return
    setItemsLocked(
      selected.map((item) => item.id),
      !selected.every((item) => item.locked),
    )
    setCtxMenu(null)
  }, [setItemsLocked])

  const runCommonMenuToggleCanvasLock = useCallback(() => {
    setCanvasLocked(!canvasLocked)
    setCtxMenu(null)
  }, [canvasLocked, setCanvasLocked])

  const runCommonMenuImportDailies = useCallback(() => {
    useUiStore.getState().setDailiesModalOpen(true)
    setCtxMenu(null)
  }, [])

  const runCommonMenuImportPrm = useCallback(() => {
    useUiStore.getState().setPrmModalOpen(true)
    setCtxMenu(null)
  }, [])

  const runCommonMenuRestartPlayingVideos = useCallback(() => {
    for (const video of videoRegistry.values()) {
      if (video.paused) continue
      video.currentTime = 0
    }
    setCtxMenu(null)
  }, [])

  const runCommonMenuTogglePlayback = useCallback(() => {
    setVideoPlaybackSuspended(!getVideoPlaybackSuspended())
    setCtxMenu(null)
  }, [])

  const runCommonMenuGenerateProxies = useCallback(() => {
    setCtxMenu(null)
    void generateCanvasVideoProxies()
  }, [])

  const runCommonMenuProjectAction = useCallback(
    (action: CanvasProjectMenuAction, path?: string) => {
      window.dispatchEvent(
        new CustomEvent('project-menu-action', {
          detail: { action, ...(path ? { path } : {}) },
        }),
      )
      setCtxMenu(null)
    },
    [],
  )

  const runCommonMenuSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent('app-open-settings'))
    setCtxMenu(null)
  }, [])

  const runCommonMenuToggleAlwaysOnTop = useCallback(() => {
    setAlwaysOnTop(!alwaysOnTop)
    setCtxMenu(null)
  }, [alwaysOnTop, setAlwaysOnTop])

  const runCommonMenuQuit = useCallback(() => {
    window.electronAPI?.projectAPI.confirmCloseWindow()
    setCtxMenu(null)
  }, [])

  useEffect(() => {
    backdropDomRegistry.set(backdrop.id, {
      body: bgRootRef.current,
      header: headerRootRef.current,
    })
    return () => {
      backdropDomRegistry.delete(backdrop.id)
    }
  }, [backdrop.id])

  // Live drag group without re-rendering: move DOM nodes while dragging.
  const dragRef = useRef<null | {
    ctrl: boolean
    startBackdrop: { x: number; y: number }
    startItems: Map<string, { x: number; y: number }>
    liveTargets: HTMLElement[]
  }>(null)

  const clearLiveDragTransforms = useCallback(
    (session: { liveTargets: HTMLElement[] } | null) => {
      if (!session) return
      for (const el of session.liveTargets) {
        el.style.transform = ''
        el.style.willChange = ''
      }
    },
    [],
  )

  const applyLiveDragTransforms = useCallback(
    (session: { liveTargets: HTMLElement[] } | null, dx: number, dy: number) => {
      if (!session) return
      const t = `translate3d(${dx}px, ${dy}px, 0)`
      for (const el of session.liveTargets) {
        el.style.transform = t
        el.style.willChange = 'transform'
      }
    },
    [],
  )

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

  const startDrag = useCallback((ev: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const ctrl = (ev as any)?.ctrlKey || (ev as any)?.metaKey
    const state = useCanvasStore.getState()
    const movingIdSet = new Set<string>()
    if (state.selectedIds.includes(backdrop.id) && state.selectedIds.length > 1) {
      for (const id of state.selectedIds) movingIdSet.add(id)
    } else {
      movingIdSet.add(backdrop.id)
      const movingBackdrop = state.items.find(
        (item): item is BackdropItem => item.type === 'backdrop' && item.id === backdrop.id,
      )
      if (movingBackdrop && !ctrl) {
        const liveAttached = movingBackdrop.collapsed
          ? movingBackdrop.attachedVideoIds
          : computeAttachedItemIds(
              {
                id: movingBackdrop.id,
                x: movingBackdrop.x,
                y: movingBackdrop.y,
                width: movingBackdrop.width,
                height: movingBackdrop.height,
                labelSize: movingBackdrop.labelSize,
              },
              state.items.filter((item) => item.id !== movingBackdrop.id),
            )
        for (const id of liveAttached) movingIdSet.add(id)
      }
    }

    const startItems = new Map<string, { x: number; y: number }>()
    for (const item of state.items) {
      if (!movingIdSet.has(item.id) || item.locked) continue
      startItems.set(item.id, { x: item.x, y: item.y })
    }
    const liveTargetsSet = new Set<HTMLElement>()
    for (const id of startItems.keys()) {
      const backdropDom = backdropDomRegistry.get(id)
      // The dragged backdrop header is moved by react-rnd itself; do not live-transform it.
      // But its body must follow during drag to avoid "header/content move now, body catches up on drop".
      if (backdropDom?.body) liveTargetsSet.add(backdropDom.body)
      if (id !== backdrop.id && backdropDom?.header) liveTargetsSet.add(backdropDom.header)
      const tileDom = tileDomRegistry.get(id)
      if (tileDom) liveTargetsSet.add(tileDom)
    }
    const draggedBackdrop = state.items.find(
      (item): item is BackdropItem => item.type === 'backdrop' && item.id === backdrop.id,
    )
    // Must match react-rnd onDrag coordinates (offset-adjusted), not raw onDragStart data — otherwise
    // live translate on the body splits from the header Rnd during drag.
    const startBackdrop = draggedBackdrop
      ? { x: draggedBackdrop.x, y: draggedBackdrop.y }
      : { x: backdrop.x, y: backdrop.y }
    dragRef.current = {
      ctrl,
      startBackdrop,
      startItems,
      liveTargets: Array.from(liveTargetsSet),
    }
  }, [backdrop.id, backdrop.x, backdrop.y])

  const handleSelect = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if (e.ctrlKey || e.metaKey) toggleSelect(backdrop.id)
    else if (!(isSelected && selectedIds.length > 1)) selectOne(backdrop.id)
  }, [backdrop.id, isSelected, selectOne, selectedIds.length, toggleSelect])

  const handleClickSelection = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.ctrlKey || e.metaKey) return
    if (Date.now() < suppressClickUntilRef.current) return
    if (isSelected && selectedIds.length > 1) {
      selectOne(backdrop.id)
    }
  }, [backdrop.id, isSelected, selectOne, selectedIds.length])

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
    const nextAttached = computeAttachedItemIds(
      { id: cur.id, x: cur.x, y: cur.y, width: cur.width, height: restoreH, labelSize: cur.labelSize },
      state.items.filter((i) => i.id !== cur.id),
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
  const isFrameMode = backdrop.displayMode === 'frame'
  const border = isFrameMode
    ? hexToRgba(fillAdjusted, isSelected ? 0.98 : 0.88)
    : isSelected
      ? backdrop.color
      : '#334155'
  const selectedRing = isSelected
    ? `0 0 0 2px rgba(255,255,255,0.12), 0 0 0 5px ${hexToRgba(fillAdjusted, 0.72)}, 0 0 36px ${hexToRgba(fillAdjusted, 0.35)}`
    : undefined
  const frameShadow = isFrameMode
    ? `inset 0 0 0 1px ${hexToRgba(fillAdjusted, isSelected ? 0.92 : 0.78)}${selectedRing ? `, ${selectedRing}` : ''}`
    : selectedRing
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

  const enableResizing = interactionLocked
    ? false
    : backdrop.collapsed
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
        className="backdrop-body-hit-area"
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
        onResizeStart={(e) => {
          if ('button' in e && typeof e.button === 'number' && e.button !== 0) return false
          window.dispatchEvent(new CustomEvent('canvas-history-action'))
          resizeActiveRef.current = true
          updateItemsBatch([{ id: backdrop.id, updates: {} }], { recordHistory: true })
        }}
        onResizeStop={(e, __, ref, ___, position) => {
          e.stopPropagation()
          if (!resizeActiveRef.current) return
          resizeActiveRef.current = false
          const w = parseInt(ref.style.width, 10)
          const h = parseInt(ref.style.height, 10)
          if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return

          // During collapse we should not recompute attachment based on the tiny strip.
          if (backdrop.collapsed) {
            updateItemsBatch([{ id: backdrop.id, updates: { x: position.x, y: position.y, width: w, height: h } }], {
              recordHistory: false,
            })
            return
          }

          const nextRect = { id: backdrop.id, x: position.x, y: position.y, width: w, height: h, labelSize: backdrop.labelSize }
          const nextAttached = computeAttachedItemIds(nextRect, items.filter((item) => item.id !== backdrop.id))

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
            { recordHistory: false },
          )
        }}
        // Enable resize handles only when selected; otherwise keep click-through to tiles.
        style={{
          zIndex: BACKDROP_BODY_Z,
          pointerEvents: isHidden ? 'none' : 'auto',
          visibility: isHidden ? 'hidden' : 'visible',
        }}
      >
        <div
          ref={bgRootRef}
          className="relative w-full h-full rounded-md overflow-hidden border pointer-events-none"
          style={{
            borderColor: border,
            background: isFrameMode ? 'transparent' : hexToRgba(fillAdjusted, 0.55),
            boxShadow: frameShadow,
          }}
        >
          {!isFrameMode && (
            <div className="absolute left-0 right-0 top-0 h-10 bg-black/20 border-b pointer-events-none" style={{ borderColor: hexToRgba(fillAdjusted, 0.35) }} />
          )}
        </div>
      </Rnd>

      {/* Header overlay layer (above tiles): drag / rename / context menu */}
      <Rnd
        position={{ x: backdrop.x, y: backdrop.y }}
        size={{ width: backdrop.width, height: headerH }}
        scale={scale}
        enableResizing={false}
        disableDragging={interactionLocked}
        cancel=".backdrop-no-drag"
        onDragStart={(e) => {
          e.stopPropagation()
          window.dispatchEvent(new CustomEvent('canvas-history-action'))
          startDrag(e)
        }}
        onDrag={(_, d) => {
          const drag = dragRef.current
          if (!drag) return
          const dx = d.x - drag.startBackdrop.x
          const dy = d.y - drag.startBackdrop.y
          applyLiveDragTransforms(drag, dx, dy)
        }}
        onDragStop={(e, d) => {
          e.stopPropagation()
          suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_AFTER_DRAG_MS
          const drag = dragRef.current
          dragRef.current = null
          const finish = () => requestAnimationFrame(() => clearLiveDragTransforms(drag))

          if (!drag) {
            updateItem(backdrop.id, { x: d.x, y: d.y })
            finish()
            return
          }

          const dx = d.x - drag.startBackdrop.x
          const dy = d.y - drag.startBackdrop.y
          if (dx === 0 && dy === 0) {
            finish()
            return
          }

          const movedUpdates = Array.from(drag.startItems.entries()).map(([id, pos]) => ({
            id,
            updates: { x: pos.x + dx, y: pos.y + dy },
          }))

          const movedIdSet = new Set(drag.startItems.keys())
          const nextItems = useCanvasStore.getState().items.map((item) => {
            const start = drag.startItems.get(item.id)
            return start ? { ...item, x: start.x + dx, y: start.y + dy } : item
          })
          const backdropAttachmentUpdates: Array<{ id: string; updates: { attachedVideoIds: string[] } }> = []
          for (const item of nextItems) {
            if (item.type !== 'backdrop' || item.collapsed) continue
            const nextAttached = computeAttachedItemIds(
              {
                id: item.id,
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
                labelSize: item.labelSize,
              },
              nextItems.filter((candidate) => candidate.id !== item.id),
            )
            const prevAttached = item.attachedVideoIds ?? []
            const same = prevAttached.length === nextAttached.length && prevAttached.every((value, idx) => value === nextAttached[idx])
            if (!same || movedIdSet.has(item.id)) {
              backdropAttachmentUpdates.push({ id: item.id, updates: { attachedVideoIds: nextAttached } })
            }
          }

          const merged = new Map<string, Record<string, unknown>>()
          for (const update of [...movedUpdates, ...backdropAttachmentUpdates]) {
            merged.set(update.id, { ...(merged.get(update.id) ?? {}), ...update.updates })
          }

          updateItemsBatch(
            Array.from(merged.entries()).map(([id, updates]) => ({ id, updates })),
            { recordHistory: true },
          )

          finish()
        }}
        style={{
          zIndex: BACKDROP_HEADER_Z + nestingDepth * BACKDROP_DEPTH_Z_STEP,
          pointerEvents: isHidden ? 'none' : 'auto',
          visibility: isHidden ? 'hidden' : 'visible',
        }}
        dragHandleClassName="backdrop-drag-handle"
      >
        <div
          ref={headerRootRef}
          className={[
            'backdrop-drag-handle w-full h-full flex items-center gap-2 px-2 bg-black/55 border select-none rounded-md',
            interactionLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
          ].join(' ')}
          style={{
            borderColor: hexToRgba(fillAdjusted, 0.45),
            boxShadow: selectedRing,
          }}
          onMouseDown={handleSelect}
          onClick={handleClickSelection}
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

          {backdrop.locked && (
            <div
              className="pointer-events-none shrink-0 rounded border border-amber-400/40 bg-black/60 px-1.5 py-0.5 font-bold tracking-wide text-amber-300"
              style={{ fontSize: Math.max(9, Math.round(headerBtnFontPx * 0.38)) }}
            >
              LOCK
            </div>
          )}

          {!editingLabel ? (
            <div
              className={[
                'flex-1 min-w-0 font-medium text-zinc-50/95 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]',
                labelSizeClass,
              ].join(' ')}
              title="Double-click to rename"
              onDoubleClick={(ev) => {
                ev.stopPropagation()
                if (interactionLocked) return
                if (!isSelected) selectOne(backdrop.id)
                setEditingLabel(true)
              }}
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
              onDoubleClick={(ev) => ev.stopPropagation()}
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
                  disabled={interactionLocked}
                  className={[
                    'backdrop-no-drag shrink-0 rounded border text-zinc-200/90 hover:text-zinc-50 hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-35',
                    'bg-black/30 border-zinc-700/60',
                    backdrop.labelSize === sz ? 'ring-1 ring-zinc-200/40' : '',
                  ].join(' ')}
                  style={{ width: headerBtnPx, height: headerBtnPx }}
                  title={`Label size: ${sz.toUpperCase()}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (interactionLocked) return
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
            disabled={interactionLocked}
            onMouseDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => {
              ev.stopPropagation()
              if (interactionLocked) return
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
          ref={backdropMenuRef}
          data-backdrop-ctx-menu="true"
          className="fixed z-[10000] overflow-y-auto rounded-lg border border-zinc-700/70 bg-zinc-950/95 shadow-2xl p-2"
          style={{
            left: backdropMenuPosition?.left ?? ctxMenu.x,
            top: backdropMenuPosition?.top ?? ctxMenu.y,
            maxHeight: 'calc(100vh - 16px)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={interactionLocked}
            className="w-full text-left px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800/80 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-35"
            onClick={() => {
              updateItem(backdrop.id, {
                displayMode: backdrop.displayMode === 'frame' ? 'solid' : 'frame',
              })
              setCtxMenu(null)
            }}
          >
            {backdrop.displayMode === 'frame' ? 'Solid fill mode' : 'Frame mode'}
          </button>
          <div className="h-px my-2 bg-zinc-800/80" />
          <div className="text-[11px] text-zinc-400 mb-1 select-none">
            {selectionColorTargetIds.length > 1 ? 'Selection palette' : 'Palette'}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {BACKDROP_COLOR_PRESETS.map((color) => {
              const isActive = selectionSharedColor?.toLowerCase() === color.toLowerCase()
              return (
                <button
                  key={color}
                  type="button"
                  disabled={canvasLocked || selectionLockState === 'locked'}
                  className={[
                    'h-7 w-7 rounded-md border transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100',
                    isActive ? 'ring-2 ring-zinc-100/70' : '',
                  ].join(' ')}
                  style={{
                    background: color,
                    borderColor: isActive ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.12)',
                  }}
                  title={color}
                  onClick={() => {
                    applySelectionColor(color)
                  }}
                />
              )
            })}
          </div>
          <div className="h-px my-2 bg-zinc-800/80" />
          <div className="text-[11px] text-zinc-400 mb-1 select-none">Hue</div>
          <div className="flex items-center gap-2">
            <input
              className="w-[160px] backdrop-no-drag"
              type="range"
              disabled={canvasLocked || selectionLockState === 'locked'}
              min={0}
              max={359}
              value={Math.round(hueBase)}
              onChange={(e) => {
                const v = Number(e.target.value)
                previewSelectionColor(hueToBaseHex(v))
              }}
            />
            <span className="text-[11px] text-zinc-400 tabular-nums w-10 text-right">
              {Math.round(hueBase)}
            </span>
          </div>
          <div className="h-px my-2 bg-zinc-800/80" />
          <div className="mt-2">
            <div className="text-[11px] text-zinc-400 mb-1 select-none">Brightness</div>
            <div className="flex items-center gap-2">
              <input
                className="w-[160px] backdrop-no-drag"
                type="range"
                disabled={interactionLocked}
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
                disabled={interactionLocked}
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
          <div className="h-px my-2 bg-zinc-800/80" />
          <CanvasCommonMenuSection
            clipboardAvailable={clipboardCount > 0}
            alwaysOnTop={alwaysOnTop}
            playbackSuspended={playbackSuspended}
            canvasLocked={canvasLocked}
            selectionLockState={selectionLockState}
            showStudioImport={showStudioImport}
            onImportDailies={runCommonMenuImportDailies}
            onImportPrm={runCommonMenuImportPrm}
            onRestartPlayingVideos={runCommonMenuRestartPlayingVideos}
            onTogglePlayback={runCommonMenuTogglePlayback}
            onGenerateProxies={runCommonMenuGenerateProxies}
            onNewNote={runCommonMenuNewNote}
            onAddBackdrop={runCommonMenuAddBackdrop}
            onPaste={runCommonMenuPaste}
            onGridAlign={runCommonMenuGridAlign}
            onLayoutMediaRow={runCommonMenuLayoutMediaRow}
            onFitAll={runCommonMenuFitAll}
            onResetView={runCommonMenuResetView}
            onToggleSelectionLock={runCommonMenuToggleSelectionLock}
            onToggleCanvasLock={runCommonMenuToggleCanvasLock}
            onProjectAction={runCommonMenuProjectAction}
            onSettings={runCommonMenuSettings}
            onToggleAlwaysOnTop={runCommonMenuToggleAlwaysOnTop}
            onQuit={runCommonMenuQuit}
          />
        </div>,
        document.body,
      )}
    </>
  )
}, areBackdropTilePropsEqual)

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
  displayMode?: 'solid' | 'frame'
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
    displayMode: params.displayMode ?? 'solid',
    collapsed: false,
    expandedHeight: params.expandedHeight ?? height,
    attachedVideoIds: params.attachedVideoIds ?? [],
  }
}

