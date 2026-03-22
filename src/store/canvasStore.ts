import { create } from 'zustand'
import type { CanvasItem, ItemUpdate } from '../types'
import type { DeserializedProject, ProjectMeta, ViewportState } from '../types/project'
import { imageExportRegistry } from '../utils/imageExportRegistry'

export interface Viewport {
  x: number
  y: number
  scale: number
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 }

export const MIN_SCALE = 0.1
export const MAX_SCALE = 4

const MAX_HISTORY = 30

const ROW_GAP = 16

interface CanvasState {
  items: CanvasItem[]
  selectedIds: string[]
  viewport: Viewport
  clipboard: CanvasItem[]

  // Project model
  currentProjectPath: string | null
  isDirty: boolean
  projectMeta: ProjectMeta | null

  /** Режим рисования на плитке-картинке (F4) */
  imageEditModeId: string | null
  setImageEditModeId: (id: string | null) => void

  _past: CanvasItem[][]
  _future: CanvasItem[][]

  addItem:     (item: CanvasItem) => void
  updateItem:  (id: string, updates: ItemUpdate) => void
  removeItem:  (id: string) => void
  removeItems: (ids: string[]) => void

  clearSelection: () => void
  selectOne:      (id: string) => void
  toggleSelect:   (id: string) => void
  setSelection:   (ids: string[]) => void

  setViewport:   (v: Partial<Viewport>) => void
  resetViewport: () => void
  /** Zoom/pan so every item fits inside the canvas container (pass client width/height). */
  frameAllItemsInViewport: (containerWidth: number, containerHeight: number) => void

  /** Align selected video + image tiles in a horizontal row (left → right) */
  layoutMediaRow: () => void

  undo: () => void
  redo: () => void

  setClipboard: (items: CanvasItem[]) => void
  pasteClipboard: (atX: number, atY: number, offsetX?: number, offsetY?: number) => void
  /** Clone current selection with offset; selects the new items */
  duplicateSelection: () => void

  setCurrentProjectPath: (path: string | null) => void
  markDirty: () => void
  markSaved: (path?: string | null) => void

  loadProjectState: (project: DeserializedProject, projectPath: string | null) => void
  getProjectDataForSave: () => { items: CanvasItem[]; viewport: ViewportState; meta: ProjectMeta }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  items:        [],
  selectedIds:  [],
  viewport:     DEFAULT_VIEWPORT,
  clipboard:    [],
  currentProjectPath: null,
  isDirty: false,
  projectMeta: null,
  imageEditModeId: null,

  setImageEditModeId: (id) => set({ imageEditModeId: id }),

  _past:        [],
  _future:      [],

  addItem: (item) =>
    set((state) => ({
      _past: [...state._past.slice(-(MAX_HISTORY - 1)), [...state.items]],
      items: [...state.items, item],
      isDirty: true,
      _future: [],
    })),

  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
      isDirty: true,
    })),

  removeItem: (id) =>
    set((state) => ({
      _past:      [...state._past.slice(-(MAX_HISTORY - 1)), [...state.items]],
      items:      state.items.filter((item) => item.id !== id),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
      imageEditModeId: state.imageEditModeId === id ? null : state.imageEditModeId,
      isDirty: true,
      _future: [],
    })),

  removeItems: (ids) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    set((state) => ({
      _past:      [...state._past.slice(-(MAX_HISTORY - 1)), [...state.items]],
      items:      state.items.filter((item) => !idSet.has(item.id)),
      selectedIds: state.selectedIds.filter((sid) => !idSet.has(sid)),
      imageEditModeId:
        state.imageEditModeId && idSet.has(state.imageEditModeId) ? null : state.imageEditModeId,
      isDirty: true,
      _future: [],
    }))
  },

  clearSelection: () => set({ selectedIds: [] }),

  selectOne: (id) => set({ selectedIds: [id] }),

  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((sid) => sid !== id)
        : [...state.selectedIds, id],
    })),

  setSelection: (ids) => set({ selectedIds: [...ids] }),

  setViewport: (v) =>
    set((state) => ({ viewport: { ...state.viewport, ...v }, isDirty: true })),

  resetViewport: () =>
    set({ viewport: DEFAULT_VIEWPORT, isDirty: true }),

  frameAllItemsInViewport: (containerWidth, containerHeight) => {
    const state = get()
    const { items } = state
    if (items.length === 0) return

    const pad = 48
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

    const bw = Math.max(1, maxX - minX)
    const bh = Math.max(1, maxY - minY)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    const cw = Math.max(1, containerWidth)
    const ch = Math.max(1, containerHeight)
    const availW = Math.max(1, cw - 2 * pad)
    const availH = Math.max(1, ch - 2 * pad)

    let scale = Math.min(availW / bw, availH / bh)
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

    const x = cw / 2 - cx * scale
    const y = ch / 2 - cy * scale

    set({ viewport: { x, y, scale }, isDirty: true })
  },

  layoutMediaRow: () => {
    const state = get()
    const media = state.items.filter(
      (i): i is Extract<CanvasItem, { type: 'video' | 'image' }> =>
        state.selectedIds.includes(i.id) && (i.type === 'video' || i.type === 'image'),
    )
    if (media.length === 0) return

    const sorted = [...media].sort((a, b) => a.x - b.x)
    const minY = Math.min(...sorted.map((m) => m.y))
    let cursorX = sorted[0].x
    const pos = new Map<string, { x: number; y: number }>()
    for (const m of sorted) {
      pos.set(m.id, { x: cursorX, y: minY })
      cursorX += m.width + ROW_GAP
    }

    set((s) => ({
      _past: [...s._past.slice(-(MAX_HISTORY - 1)), [...s.items]],
      items: s.items.map((item) => {
        const p = pos.get(item.id)
        return p ? { ...item, x: p.x, y: p.y } : item
      }),
      isDirty: true,
      _future: [],
    }))
  },

  undo: () =>
    set((state) => {
      if (state._past.length === 0) return {}
      const previous = state._past[state._past.length - 1]
      const current = state.items
      return {
        items:       previous,
        _past:       state._past.slice(0, -1),
        _future:     [...state._future, current],
        selectedIds: [],
        isDirty: true,
      }
    }),

  redo: () =>
    set((state) => {
      if (state._future.length === 0) return {}
      const next = state._future[state._future.length - 1]
      const current = state.items
      return {
        items:       next,
        _future:     state._future.slice(0, -1),
        _past:       [...state._past, current],
        selectedIds: [],
        isDirty: true,
      }
    }),

  setClipboard: (items) => set({ clipboard: items }),

  pasteClipboard: (atX, atY, offsetX = 30, offsetY = 30) => {
    const { clipboard } = get()
    if (!clipboard.length) return

    const originX = Math.min(...clipboard.map((i) => i.x))
    const originY = Math.min(...clipboard.map((i) => i.y))
    const pasteIdPrefix = `paste-${Date.now()}`

    const pastedIds: string[] = []
    const pastedItems: CanvasItem[] = clipboard.map((src, idx) => {
      const newId = `${src.type}-${pasteIdPrefix}-${idx}`
      pastedIds.push(newId)
      return {
        ...src,
        id: newId,
        x: atX + offsetX + (src.x - originX),
        y: atY + offsetY + (src.y - originY),
      } as CanvasItem
    })

    set((state) => ({
      _past: [...state._past.slice(-(MAX_HISTORY - 1)), [...state.items]],
      items: [...state.items, ...pastedItems],
      selectedIds: pastedIds,
      isDirty: true,
      _future: [],
    }))
  },

  duplicateSelection: () => {
    const state = get()
    const idSet = new Set(state.selectedIds)
    if (idSet.size === 0) return
    const toDup = state.items.filter((i) => idSet.has(i.id))
    if (toDup.length === 0) return

    const prefix = `dup-${Date.now()}`
    const offsetX = 32
    const offsetY = 32

    const newItems: CanvasItem[] = toDup.map((src, idx) => {
      const newId = `${src.type}-${prefix}-${idx}`
      if (src.type === 'image') {
        const exporter = imageExportRegistry.get(src.id)
        const dataUrl = exporter ? exporter() : src.dataUrl
        return {
          ...src,
          id: newId,
          dataUrl,
          x: src.x + offsetX,
          y: src.y + offsetY,
        }
      }
      return { ...src, id: newId, x: src.x + offsetX, y: src.y + offsetY } as CanvasItem
    })
    const newIds = newItems.map((i) => i.id)

    set((s) => ({
      _past: [...s._past.slice(-(MAX_HISTORY - 1)), [...s.items]],
      items: [...s.items, ...newItems],
      selectedIds: newIds,
      isDirty: true,
      _future: [],
    }))
  },

  setCurrentProjectPath: (path) => set({ currentProjectPath: path }),

  markDirty: () =>
    set((s) => (s.isDirty ? s : { isDirty: true })),

  markSaved: (path) =>
    set((s) => ({
      currentProjectPath: path !== undefined ? path : s.currentProjectPath,
      isDirty: false,
    })),

  loadProjectState: (project, projectPath) => {
    set({
      items: project.items,
      viewport: project.viewport,
      selectedIds: [],
      clipboard: [],
      _past: [],
      _future: [],
      currentProjectPath: projectPath,
      projectMeta: project.meta,
      imageEditModeId: null,
      isDirty: false,
    })
  },

  getProjectDataForSave: () => {
    const state = get()
    const now = new Date().toISOString()
    const createdAt = state.projectMeta?.createdAt ?? now
    const itemsForSave = state.items.map((item) => {
      if (item.type !== 'image') return item
      const exporter = imageExportRegistry.get(item.id)
      if (!exporter) return item
      const next = exporter()
      // Only replace if export produced something (best-effort)
      if (typeof next === 'string' && next.length > 0 && next !== item.dataUrl) {
        return { ...item, dataUrl: next }
      }
      return item
    })
    const meta: ProjectMeta = {
      createdAt,
      updatedAt: now,
    }
    set({ projectMeta: meta })
    return { items: itemsForSave, viewport: state.viewport, meta }
  },
}))
