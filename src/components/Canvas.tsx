import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../store/canvasStore'
import { useCanvasPanZoom, spacePanActiveRef } from '../hooks/useCanvasPanZoom'
import { useVideoPlaybackManager } from '../hooks/useVideoPlaybackManager'
import { VideoTile } from './VideoTile'
import { NoteTile } from './NoteTile'
import { ImageTile } from './ImageTile'
import { videoRegistry } from '../utils/videoRegistry'
import { imageDrawUndoRegistry } from '../utils/imageDrawUndoRegistry'
import { imageDrawRedoRegistry } from '../utils/imageDrawRedoRegistry'
import { imageExportRegistry } from '../utils/imageExportRegistry'
import { flushImageAnnotations } from '../utils/flushImageAnnotations'
import { importImageFile, isRasterImportFile } from '../utils/imageImport'
import { defaultVideoTileSizeForNew, imageTileViewSize } from '../utils/tileSizing'
import { setVideoPlaybackSuspended } from '../utils/videoGlobalPlayback'
import { requestVideoWarmupEarly } from '../utils/warmupCanvasMedia'
import { BackdropTile, createBackdropItem } from './BackdropTile'
import { backdropHeaderHeight, computeAttachedVideoIds } from '../utils/backdrops'
import type { CanvasItem, ImageItem, NoteItem, VideoItem } from '../types'
import { useUiStore } from '../store/uiStore'
import logoGreenFx from '../assets/logo-greenfx.png'

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

async function resolveDroppedVideoUrl(file: File): Promise<string> {
  const nativePath = (file as File & { path?: string }).path
  if (!nativePath) return fileToUrl(file)
  const projectAPI = (window as any).electronAPI?.projectAPI
  if (!projectAPI?.resolveVideoSource) return fileToUrl(file)
  try {
    const resolved = await projectAPI.resolveVideoSource(nativePath)
    return resolved?.srcUrl || fileToUrl(file)
  } catch {
    return fileToUrl(file)
  }
}

const VIDEO_TILE_DEFAULT = defaultVideoTileSizeForNew()
const NOTE_W  = 220
const NOTE_H  = 160

const MARQUEE_CLICK_THRESHOLD = 4

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    // Sliders / toggles are not text fields — canvas shortcuts must still work
    if (
      type === 'range' ||
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'button' ||
      type === 'submit' ||
      type === 'reset' ||
      type === 'file' ||
      type === 'color'
    ) {
      return false
    }
    return true
  }
  return false
}

function captureVideoFrame(video: HTMLVideoElement): { dataUrl: string; width: number; height: number } {
  const maxDim = 1920
  const vw = video.videoWidth || 640
  const vh = video.videoHeight || 360
  const ratio = Math.min(1, maxDim / Math.max(vw, vh))
  const w = Math.round(vw * ratio)
  const h = Math.round(vh * ratio)

  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  off.getContext('2d')?.drawImage(video, 0, 0, w, h)
  return { dataUrl: off.toDataURL('image/png'), width: w, height: h }
}

/** AABB intersection in world space */
function rectsIntersect(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function cloneCanvasItemForClipboard(item: CanvasItem): CanvasItem {
  if (item.type !== 'image') return { ...item }
  const exporter = imageExportRegistry.get(item.id)
  const exportedSrcUrl = exporter ? exporter() : null
  if (exportedSrcUrl) {
    return {
      ...item,
      srcUrl: exportedSrcUrl,
      storage: 'asset',
      projectAssetPath: undefined,
    }
  }
  return { ...item }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Canvas: React.FC = () => {
  const items           = useCanvasStore((s) => s.items)
  const selectedIds     = useCanvasStore((s) => s.selectedIds)
  const viewport        = useCanvasStore((s) => s.viewport)
  const addItem         = useCanvasStore((s) => s.addItem)
  const addItems        = useCanvasStore((s) => s.addItems)
  const updateItemsBatch = useCanvasStore((s) => s.updateItemsBatch)
  const removeItems     = useCanvasStore((s) => s.removeItems)
  const clearSelection  = useCanvasStore((s) => s.clearSelection)
  const selectOne       = useCanvasStore((s) => s.selectOne)
  const setSelection    = useCanvasStore((s) => s.setSelection)
  const layoutMediaRow  = useCanvasStore((s) => s.layoutMediaRow)
  const gridAlignTiles = useCanvasStore((s) => s.gridAlignTiles)
  const resetViewport   = useCanvasStore((s) => s.resetViewport)
  const frameAllItemsInViewport = useCanvasStore((s) => s.frameAllItemsInViewport)
  const imageEditModeId = useCanvasStore((s) => s.imageEditModeId)
  const setImageEditModeId = useCanvasStore((s) => s.setImageEditModeId)
  const gridSizeX = useUiStore((s) => s.gridSizeX)
  const gridSizeY = useUiStore((s) => s.gridSizeY)
  const theme = useUiStore((s) => s.theme)
  const alwaysOnTop = useUiStore((s) => s.alwaysOnTop)
  const setAlwaysOnTop = useUiStore((s) => s.setAlwaysOnTop)

  const containerRef    = useRef<HTMLDivElement>(null)
  const lastMouseScreen = useRef({ x: 0, y: 0 })
  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; kind: 'canvas' | 'video' | 'image'; itemId?: string }>(null)

  // Ensure paste has a sane default position even if the user hasn't moved
  // the mouse after selecting items.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    lastMouseScreen.current = {
      x: rect.width / 2,
      y: rect.height / 2,
    }
  }, [])

  useEffect(() => {
    if (imageEditModeId && !selectedIds.includes(imageEditModeId)) {
      setImageEditModeId(null)
    }
  }, [selectedIds, imageEditModeId, setImageEditModeId])

  /** Screen-space marquee: relative to container top-left */
  const [marquee, setMarquee] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null)
  const marqueeDrag = useRef<{
    active: boolean
    ax: number
    ay: number
    additive: boolean
  } | null>(null)

  useCanvasPanZoom(containerRef)
  useVideoPlaybackManager(containerRef)
  const selectedIdSet = new Set(selectedIds)
  const hiddenVideoIds = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (it.type !== 'backdrop') continue
      if (!it.collapsed) continue
      for (const vid of it.attachedVideoIds) set.add(vid)
    }
    return set
  }, [items])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    lastMouseScreen.current = {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top  ?? 0),
    }
  }, [])

  // ── Edit menu commands ────────────────────────────────────────────────
  useEffect(() => {
    const onEditCommand = (e: Event) => {
      const detail = (e as CustomEvent).detail as { command: string }
      const state = useCanvasStore.getState()

      if (detail.command === 'undo') {
        const ids = state.selectedIds
        for (const id of ids) {
          const drawUndo = imageDrawUndoRegistry.get(id)
          if (drawUndo && drawUndo()) return
        }
        state.undo()
        return
      }

      if (detail.command === 'redo') {
        const ids = state.selectedIds
        for (const id of ids) {
          const drawRedo = imageDrawRedoRegistry.get(id)
          if (drawRedo && drawRedo()) return
        }
        state.redo()
        return
      }

      if (detail.command === 'delete') {
        if (state.selectedIds.length) state.removeItems(state.selectedIds)
        return
      }

      if (detail.command === 'copy') {
        const ids = state.selectedIds
        if (!ids.length) return
        const idSet = new Set(ids)
        const selected = state.items.filter((i) => idSet.has(i.id))
        const copies: CanvasItem[] = selected.map(cloneCanvasItemForClipboard)
        state.setClipboard(copies)
        return
      }

      if (detail.command === 'paste') {
        if (!state.clipboard.length) return
        const { x: sx, y: sy } = lastMouseScreen.current
        const { x: vx, y: vy, scale } = state.viewport
        const worldX = (sx - vx) / scale
        const worldY = (sy - vy) / scale
        state.pasteClipboard(worldX, worldY)
        return
      }

      if (detail.command === 'select-all') {
        const ae = document.activeElement as HTMLElement | null
        if (ae) {
          if (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') {
            const inp = ae as HTMLInputElement | HTMLTextAreaElement
            inp.focus()
            inp.select()
            return
          }
          if (ae.isContentEditable) {
            try {
              document.execCommand('selectAll')
            } catch {
              /* ignore */
            }
            return
          }
        }
        const { items, setSelection } = useCanvasStore.getState()
        setSelection(items.map((i) => i.id))
        return
      }
    }

    window.addEventListener('app-edit-command', onEditCommand)
    return () => window.removeEventListener('app-edit-command', onEditCommand)
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

      // ── Project hotkeys ──────────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO' && !e.shiftKey && !isTypingTarget(e)) {
        e.preventDefault()
        window.dispatchEvent(
          new CustomEvent('project-menu-action', { detail: { action: 'open' } }),
        )
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS' && e.shiftKey && !isTypingTarget(e)) {
        e.preventDefault()
        const projectAPI = (window as any).electronAPI?.projectAPI
        if (!projectAPI) return
        const state = useCanvasStore.getState()
        flushImageAnnotations()
        const projectData = state.getProjectDataForSave()
        projectAPI
          .saveProjectAs({ projectData })
          .then((res: any) => {
            if (!res) return
            state.syncSavedProjectState(res.project, res.path)
          })
          .catch((err: any) => alert(err?.message ?? String(err)))
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS' && !e.shiftKey && !isTypingTarget(e)) {
        e.preventDefault()
        const projectAPI = (window as any).electronAPI?.projectAPI
        if (!projectAPI) return
        const state = useCanvasStore.getState()
        flushImageAnnotations()
        const projectData = state.getProjectDataForSave()
        projectAPI
          .saveProject({ projectData, path: state.currentProjectPath })
          .then((res: any) => {
            if (!res) return
            state.syncSavedProjectState(res.project, res.path)
          })
          .catch((err: any) => alert(err?.message ?? String(err)))
        return
      }

      if (e.code === 'Delete' && !isTypingTarget(e)) {
        const ids = useCanvasStore.getState().selectedIds
        if (ids.length) removeItems(ids)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA' && !e.shiftKey && !isTypingTarget(e)) {
        e.preventDefault()
        const { items, setSelection } = useCanvasStore.getState()
        setSelection(items.map((i) => i.id))
        return
      }

      // A — zoom/pan to show every tile in the canvas area
      if (e.code === 'KeyA' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e)) {
        e.preventDefault()
        const el = containerRef.current
        if (!el) return
        const { width, height } = el.getBoundingClientRect()
        frameAllItemsInViewport(width, height)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey && !isTypingTarget(e)) {
        e.preventDefault()
        const ids = useCanvasStore.getState().selectedIds
        for (const id of ids) {
          const drawUndo = imageDrawUndoRegistry.get(id)
          if (drawUndo && drawUndo()) return
        }
        useCanvasStore.getState().undo()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && e.shiftKey && !isTypingTarget(e)) {
        e.preventDefault()
        const ids = useCanvasStore.getState().selectedIds
        for (const id of ids) {
          const drawRedo = imageDrawRedoRegistry.get(id)
          if (drawRedo && drawRedo()) return
        }
        useCanvasStore.getState().redo()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && !isTypingTarget(e)) {
        const state = useCanvasStore.getState()
        const ids = state.selectedIds
        e.preventDefault()
        if (ids.length) {
          const idSet = new Set(ids)
          const selected = state.items.filter((i) => idSet.has(i.id))
          const copies: CanvasItem[] = selected.map(cloneCanvasItemForClipboard)
          state.setClipboard(copies)
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && !e.shiftKey && !isTypingTarget(e)) {
        const state = useCanvasStore.getState()
        e.preventDefault()
        if (state.clipboard.length) {
          const { x: sx, y: sy } = lastMouseScreen.current
          const { x: vx, y: vy, scale } = state.viewport
          const worldX = (sx - vx) / scale
          const worldY = (sy - vy) / scale
          state.pasteClipboard(worldX, worldY)
        }
        return
      }

      // Shift+D — duplicate selection (offset copy, new ids)
      if (e.shiftKey && e.code === 'KeyD' && !e.ctrlKey && !e.metaKey && !isTypingTarget(e)) {
        e.preventDefault()
        const state = useCanvasStore.getState()
        const idSet = new Set(state.selectedIds)
        if (idSet.size === 0) return
        const toDup = state.items.filter((item) => idSet.has(item.id))
        if (!toDup.length) return
        const prefix = `dup-${Date.now()}`
        const offsetX = 32
        const offsetY = 32
        const newItems = toDup.map((item, idx) => ({
          ...cloneCanvasItemForClipboard(item),
          id: `${item.type}-${prefix}-${idx}`,
          x: item.x + offsetX,
          y: item.y + offsetY,
        }))
        useCanvasStore.getState().addItems(newItems)
        useCanvasStore.getState().setSelection(newItems.map((item) => item.id))
        return
      }

      // L — layout selected videos + images in a row
      if (e.code === 'KeyL' && !isTypingTarget(e)) {
        e.preventDefault()
        layoutMediaRow()
        return
      }

      // \ — align all tiles into a non-overlapping grid (Backslash; IntlBackslash on some layouts)
      if (
        (e.code === 'Backslash' || e.code === 'IntlBackslash') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTypingTarget(e)
      ) {
        e.preventDefault()
        gridAlignTiles()
        return
      }

      // B — create a new backdrop at cursor position
      if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e)) {
        e.preventDefault()
        const state = useCanvasStore.getState()
        const idSet = new Set(state.selectedIds)
        const selectedTiles = state.items.filter(
          (it) =>
            idSet.has(it.id) &&
            (it.type === 'video' || it.type === 'image' || it.type === 'note'),
        )

        const PAD_X = 28
        const PAD_BOTTOM = 28
        const PAD_TOP = 28 + backdropHeaderHeight('md') + 16 // padding + default header + label room
        let rect: { x: number; y: number; width: number; height: number }

        if (selectedTiles.length > 0) {
          let minX = Infinity
          let minY = Infinity
          let maxX = -Infinity
          let maxY = -Infinity
          for (const it of selectedTiles) {
            minX = Math.min(minX, it.x)
            minY = Math.min(minY, it.y)
            maxX = Math.max(maxX, it.x + it.width)
            maxY = Math.max(maxY, it.y + it.height)
          }
          rect = {
            x: minX - PAD_X,
            y: minY - PAD_TOP,
            width: Math.max(220, maxX - minX + 2 * PAD_X),
            height: Math.max(160, (maxY - minY) + PAD_TOP + PAD_BOTTOM),
          }
        } else {
          const { x: sx, y: sy } = lastMouseScreen.current
          const { x: vx, y: vy, scale } = state.viewport
          const worldX = (sx - vx) / scale
          const worldY = (sy - vy) / scale
          const w = 360
          const h = 220
          rect = { x: worldX - w / 2, y: worldY - h / 2, width: w, height: h }
        }

        const attachedVideoIds = computeAttachedVideoIds(
          rect,
          state.items.filter((i): i is VideoItem => i.type === 'video'),
        )

        const backdrop = createBackdropItem({
          id: `backdrop-${Date.now()}`,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          color:
            theme === 'light'
              ? '#64748b'
              : theme === 'pink'
                ? '#be185d'
                : theme === 'camouflage'
                  ? '#3f6212'
                  : theme === 'greenFx'
                    ? '#16a34a'
                    : '#1d4ed8',
          attachedVideoIds,
        })
        addItem(backdrop)
        selectOne(backdrop.id)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN' && !isTypingTarget(e)) {
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

        const cap = captureVideoFrame(video)
        const box = imageTileViewSize(cap.width, cap.height)

        const siblings = state.items.filter(
          (i): i is ImageItem =>
            i.type === 'image' && i.sourceVideoId === selected.id,
        )
        const anchor = siblings.length > 0
          ? siblings.reduce((a, b) =>
              a.x + a.width > b.x + b.width ? a : b)
          : selected

        const img: ImageItem = {
          type: 'image',
          id: `img-${Date.now()}`,
          srcUrl: cap.dataUrl,
          storage: 'asset',
          sourceVideoId: selected.id,
          naturalWidth: cap.width,
          naturalHeight: cap.height,
          x: anchor.x + anchor.width + 24,
          y: anchor.y,
          width: box.width,
          height: box.height,
        }
        addItem(img)
        selectOne(img.id)
      }

      if (e.code === 'F4' && !isTypingTarget(e)) {
        e.preventDefault()
        const state = useCanvasStore.getState()
        if (state.selectedIds.length !== 1) return
        const sid = state.selectedIds[0]
        const it = state.items.find((i) => i.id === sid)
        if (!it || it.type !== 'image') return
        state.setImageEditModeId(state.imageEditModeId === sid ? null : sid)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    addItem,
    removeItems,
    selectOne,
    layoutMediaRow,
    gridAlignTiles,
    frameAllItemsInViewport,
    theme,
  ])

  // ── Context menu (canvas + video tiles) ───────────────────────────────────
  useEffect(() => {
    if (!ctxMenu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-canvas-ctx-menu="true"]')) return
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

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest?.('[data-backdrop-ctx-menu="true"]')) return
      const videoRoot = t.closest?.('[data-video-tile-root="true"]') as HTMLElement | null
      const imageRoot = t.closest?.('[data-image-tile-root="true"]') as HTMLElement | null
      const isBg = t.getAttribute('data-canvas-bg') === 'true'
      if (!videoRoot && !imageRoot && !isBg) return
      e.preventDefault()
      e.stopPropagation()
      if (videoRoot) {
        const id = videoRoot.getAttribute('data-item-id') ?? undefined
        if (id) selectOne(id)
        setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'video', itemId: id })
        return
      }
      if (imageRoot) {
        const id = imageRoot.getAttribute('data-item-id') ?? undefined
        if (id) selectOne(id)
        setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'image', itemId: id })
        return
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'canvas' })
    }
    window.addEventListener('contextmenu', onContextMenu, true)
    return () => window.removeEventListener('contextmenu', onContextMenu, true)
  }, [selectOne])

  const contentBounds = useMemo(() => {
    if (!items.length) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const it of items) {
      minX = Math.min(minX, it.x)
      minY = Math.min(minY, it.y)
      maxX = Math.max(maxX, it.x + it.width)
      maxY = Math.max(maxY, it.y + it.height)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
    const pad = 420
    return {
      x: minX - pad,
      y: minY - pad,
      width: Math.max(1, maxX - minX + pad * 2),
      height: Math.max(1, maxY - minY + pad * 2),
    }
  }, [items])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      const sx   = e.clientX - (rect?.left ?? 0)
      const sy   = e.clientY - (rect?.top  ?? 0)
      const wx   = (sx - viewport.x) / viewport.scale
      const wy   = (sy - viewport.y) / viewport.scale

      const files = Array.from(e.dataTransfer.files)
      const videoFiles = files.filter(isVideoFile)
      const rasterFiles = files.filter(isRasterImportFile)

      const dropMediaCount = videoFiles.length + rasterFiles.filter((f) => !isVideoFile(f)).length
      if (dropMediaCount > 20) {
        setVideoPlaybackSuspended(true)
      }

      let i = 0
      const droppedVideoUrls: string[] = []
      const newItems: CanvasItem[] = []
      const deferredVideoResolves: Promise<{ id: string; srcUrl: string } | null>[] = []
      for (const file of videoFiles) {
        const dw = VIDEO_TILE_DEFAULT.width
        const dh = VIDEO_TILE_DEFAULT.height
        const srcUrl = fileToUrl(file)
        droppedVideoUrls.push(srcUrl)
        const tileId = `tile-${Date.now()}-${i}`
        const tile: VideoItem = {
          type:     'video',
          id:       tileId,
          srcUrl,
          fileName: file.name,
          x:        wx - dw / 2 + i * 24,
          y:        wy - dh / 2 + i * 24,
          width:    dw,
          height:   dh,
        }
        newItems.push(tile)
        deferredVideoResolves.push(
          resolveDroppedVideoUrl(file)
            .then((resolvedUrl) => {
              if (!resolvedUrl || resolvedUrl === srcUrl) return null
              return { id: tileId, srcUrl: resolvedUrl }
            })
            .catch(() => null),
        )
        i++
      }

      for (const file of rasterFiles) {
        if (isVideoFile(file)) continue
        try {
          const payload = await importImageFile(file)
          const img: ImageItem = {
            type: 'image',
            id: `img-${Date.now()}-${i}`,
            srcUrl: payload.srcUrl,
            storage: payload.storage,
            sourceVideoId: '',
            fileName: file.name,
            ...(payload.sourceFilePath ? { sourceFilePath: payload.sourceFilePath } : {}),
            ...(payload.projectAssetPath ? { projectAssetPath: payload.projectAssetPath } : {}),
            naturalWidth: payload.naturalWidth,
            naturalHeight: payload.naturalHeight,
            x: wx - payload.width / 2 + i * 24,
            y: wy - payload.height / 2 + i * 24,
            width: payload.width,
            height: payload.height,
          }
          newItems.push(img)
        } catch (err: any) {
          alert(err?.message ?? String(err))
        }
        i++
      }

      if (droppedVideoUrls.length > 0) {
        queueMicrotask(() => requestVideoWarmupEarly(droppedVideoUrls))
      }

      if (newItems.length > 0) {
        addItems(newItems)
      }

      if (deferredVideoResolves.length > 0) {
        void Promise.all(deferredVideoResolves).then((resolved) => {
          const updates = resolved
            .filter((r): r is { id: string; srcUrl: string } => !!r)
            .map((r) => ({ id: r.id, updates: { srcUrl: r.srcUrl } }))
          if (updates.length === 0) return
          updateItemsBatch(updates, { recordHistory: false, markDirty: false })
        })
      }
    },
    [addItems, updateItemsBatch, viewport],
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
      id="previewv-canvas-root"
      ref={containerRef}
      data-canvas-bg="true"
      className="relative w-full h-full overflow-hidden outline-none"
      style={{ background: 'var(--canvas-bg)' }}
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
          backgroundImage: [
            'linear-gradient(to right, var(--grid-major-color) 1px, transparent 1px)',
            'linear-gradient(to bottom, var(--grid-major-color) 1px, transparent 1px)',
            'linear-gradient(to right, var(--grid-minor-color) 1px, transparent 1px)',
            'linear-gradient(to bottom, var(--grid-minor-color) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: [
            `${gridSizeX * 5 * viewport.scale}px ${gridSizeY * 5 * viewport.scale}px`,
            `${gridSizeX * 5 * viewport.scale}px ${gridSizeY * 5 * viewport.scale}px`,
            `${gridSizeX * viewport.scale}px ${gridSizeY * viewport.scale}px`,
            `${gridSizeX * viewport.scale}px ${gridSizeY * viewport.scale}px`,
          ].join(','),
          backgroundPosition: [
            `${viewport.x}px ${viewport.y}px`,
            `${viewport.x}px ${viewport.y}px`,
            `${viewport.x}px ${viewport.y}px`,
            `${viewport.x}px ${viewport.y}px`,
          ].join(','),
        }}
      />

      {/* GreenFx theme watermark logo */}
      {theme === 'greenFx' && (
        <div
          data-canvas-bg="true"
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          style={{ zIndex: 0 }}
        >
          <img
            src={logoGreenFx}
            alt=""
            style={{
              width: '36vw',
              maxWidth: 480,
              minWidth: 200,
              opacity: 0.055,
              filter: 'saturate(0.7) brightness(1.4)',
              maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 40%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 40%, transparent 100%)',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}

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
        className="pointer-events-none absolute inset-0 overflow-visible"
        style={{
          transformOrigin: '0 0',
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        }}
      >
        {contentBounds && (
          <div
            className="absolute rounded-xl border"
            style={{
              left: contentBounds.x,
              top: contentBounds.y,
              width: contentBounds.width,
              height: contentBounds.height,
              background: 'var(--canvas-solid-bg)',
              borderColor: 'var(--canvas-solid-border)',
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Tiles first, backdrops last so backdrop headers stack above videos/images/notes (z-index + paint order). */}
        {[...items.filter((i) => i.type !== 'backdrop'), ...items.filter((i) => i.type === 'backdrop')].map((item: CanvasItem) => {
          const sel = selectedIdSet.has(item.id)
          if (item.type === 'video') {
            return (
              <VideoTile
                key={item.id}
                tile={item}
                scale={viewport.scale}
                isSelected={sel}
                isHidden={hiddenVideoIds.has(item.id)}
              />
            )
          }
          if (item.type === 'note') {
            return <NoteTile key={item.id} note={item} scale={viewport.scale} isSelected={sel} />
          }
          if (item.type === 'image') {
            return <ImageTile key={item.id} item={item} scale={viewport.scale} isSelected={sel} />
          }
          if (item.type === 'backdrop') {
            return <BackdropTile key={item.id} backdrop={item} scale={viewport.scale} isSelected={sel} />
          }
          return null
        })}
      </div>

      {items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <div className="text-center text-themeText-500">
            <div className="text-5xl mb-4 opacity-40">▶</div>
            <p className="text-base font-medium tracking-wide">Перетащите сюда видео или изображения</p>
            <p className="text-sm mt-1 opacity-60">
              Видео: MP4, WebM, MOV… · Изображения: JPEG, PNG, TIFF, EXR, DPX…
            </p>
            <p className="text-xs mt-3 opacity-40">
              Ctrl+A · A · Ctrl+O · L · B · \ · Ctrl+N / F3 · F4
            </p>
          </div>
        </div>
      )}

      {ctxMenu &&
        createPortal(
          <div
            data-canvas-ctx-menu="true"
            className="fixed z-[10000] rounded-lg border p-1.5 min-w-[220px]"
            style={{
              left: ctxMenu.x,
              top: ctxMenu.y,
              borderColor: 'var(--menu-border)',
              background: 'var(--menu-bg)',
              boxShadow: 'var(--menu-shadow)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[11px] font-semibold text-themeText-400 select-none uppercase tracking-wide">
              {ctxMenu.kind === 'video' ? 'Video tile' : ctxMenu.kind === 'image' ? 'Image tile' : 'Canvas'}
            </div>
            <div className="h-px my-1 mx-1" style={{ background: 'var(--theme-divider)' }} />

            {/* --- SELECTION ACTIONS --- */}
            {(ctxMenu.kind === 'video' || ctxMenu.kind === 'image') && ctxMenu.itemId && (
              <>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
                  onClick={() => {
                    const state = useCanvasStore.getState()
                    const ids = state.selectedIds.length ? state.selectedIds : [ctxMenu.itemId!]
                    removeItems(ids)
                    setCtxMenu(null)
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
                  onClick={() => {
                    const state = useCanvasStore.getState()
                    const ids = state.selectedIds.length ? state.selectedIds : [ctxMenu.itemId!]
                    const idSet = new Set(ids)
                    const selected = state.items.filter((i) => idSet.has(i.id))
                    const copies = selected.map(cloneCanvasItemForClipboard)
                    state.setClipboard(copies)
                    setCtxMenu(null)
                  }}
                >
                  Copy
                </button>
                {ctxMenu.kind === 'video' ? (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
                    onClick={() => {
                      const state = useCanvasStore.getState()
                      const vid = videoRegistry.get(ctxMenu.itemId!)
                      if (!vid) return
                      const cap = captureVideoFrame(vid)
                      const { x: sx, y: sy } = lastMouseScreen.current
                      const { x: vx, y: vy, scale } = state.viewport
                      const worldX = (sx - vx) / scale
                      const worldY = (sy - vy) / scale
                      const view = imageTileViewSize(cap.width, cap.height)
                      const img: ImageItem = {
                        type: 'image',
                        id: `image-${Date.now()}`,
                        x: worldX + 24,
                        y: worldY + 24,
                        width: view.width,
                        height: view.height,
                        srcUrl: cap.dataUrl,
                        storage: 'legacy-inline',
                        sourceVideoId: ctxMenu.itemId!,
                        naturalWidth: cap.width,
                        naturalHeight: cap.height,
                        fileName: 'Frame',
                      }
                      addItem(img)
                      setSelection([img.id])
                      setCtxMenu(null)
                    }}
                  >
                    Capture frame (F3)
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
                    onClick={() => {
                      setImageEditModeId(ctxMenu.itemId!)
                      setCtxMenu(null)
                    }}
                  >
                    Draw mode (F4)
                  </button>
                )}
                <div className="h-px my-1 mx-1" style={{ background: 'var(--theme-divider)' }} />
              </>
            )}

            {/* --- CREATION ACTIONS --- */}
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
              onClick={() => {
                const state = useCanvasStore.getState()
                const { x: sx, y: sy } = lastMouseScreen.current
                const { x: vx, y: vy, scale } = state.viewport
                const x = (sx - vx) / scale - NOTE_W / 2
                const y = (sy - vy) / scale - NOTE_H / 2
                const note: NoteItem = {
                  type: 'note',
                  id: `note-${Date.now()}`,
                  x,
                  y,
                  width: NOTE_W,
                  height: NOTE_H,
                  text: '',
                }
                addItem(note)
                selectOne(note.id)
                setCtxMenu(null)
              }}
            >
              New note (Ctrl+N)
            </button>
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
              onClick={() => {
                const state = useCanvasStore.getState()
                const { x: sx, y: sy } = lastMouseScreen.current
                const { x: vx, y: vy, scale } = state.viewport
                const worldX = (sx - vx) / scale
                const worldY = (sy - vy) / scale
                const backdrop = createBackdropItem({ id: `backdrop-${Date.now()}`, x: worldX - 400, y: worldY - 300, width: 800, height: 600 })
                addItem(backdrop)
                selectOne(backdrop.id)
                setCtxMenu(null)
              }}
            >
              Add backdrop (B)
            </button>
            <div className="h-px my-1 mx-1" style={{ background: 'var(--theme-divider)' }} />

            {/* --- VIEW & LAYOUT ACTIONS --- */}
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors disabled:opacity-40"
              disabled={useCanvasStore.getState().clipboard.length === 0}
              onClick={() => {
                const state = useCanvasStore.getState()
                const { x: sx, y: sy } = lastMouseScreen.current
                const { x: vx, y: vy, scale } = state.viewport
                state.pasteClipboard((sx - vx) / scale, (sy - vy) / scale)
                setCtxMenu(null)
              }}
            >
              Paste (Ctrl+V)
            </button>
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
              onClick={() => {
                gridAlignTiles()
                setCtxMenu(null)
              }}
            >
              Grid align (\)
            </button>
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
              onClick={() => {
                layoutMediaRow()
                setCtxMenu(null)
              }}
            >
              Layout media row (L)
            </button>
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
              onClick={() => {
                const el = containerRef.current
                if (!el) return
                const { width, height } = el.getBoundingClientRect()
                frameAllItemsInViewport(width, height)
                setCtxMenu(null)
              }}
            >
              Fit all (A)
            </button>
            <div className="h-px my-1 mx-1" style={{ background: 'var(--theme-divider)' }} />

            {/* --- APP CONTROL --- */}
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('app-open-settings'))
                setCtxMenu(null)
              }}
            >
              Settings
            </button>
            {ctxMenu.kind === 'canvas' && (
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
                onClick={async () => {
                  const next = !alwaysOnTop
                  setAlwaysOnTop(next)
                  setCtxMenu(null)
                }}
              >
                {alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
              </button>
            )}
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm text-red-500 hover:bg-red-500/10 rounded transition-colors font-medium mt-1"
              onClick={() => {
                window.electronAPI?.projectAPI.confirmCloseWindow()
                setCtxMenu(null)
              }}
            >
              Quit / Exit
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
