import { create } from 'zustand'
import type { CanvasItem, ItemUpdate } from '../types'
import type { DeserializedProject, ProjectMeta, ViewportState } from '../types/project'
import { requestMediaWarmup } from '../utils/warmupCanvasMedia'

export interface Viewport {
  x: number
  y: number
  scale: number
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 }

export const MIN_SCALE = 0.001
export const MAX_SCALE = 4
const MAX_HISTORY = 200
const ROW_GAP = 16
const LAYOUT_ROW_CAP = 20
const LAYOUT_SECTION_GAP = 48

interface BatchUpdateOptions {
  markDirty?: boolean
  recordHistory?: boolean
  clearFuture?: boolean
}

interface ReplaceItemsOptions extends BatchUpdateOptions {
  selectedIds?: string[]
  imageEditModeId?: string | null
}

function pushPast(items: CanvasItem[][], currentItems: CanvasItem[]): CanvasItem[][] {
  return [...items.slice(-(MAX_HISTORY - 1)), currentItems]
}

function sortByCanvasReadingOrder<T extends { x: number; y: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
}

interface CanvasState {
  items: CanvasItem[]
  selectedIds: string[]
  viewport: Viewport
  clipboard: CanvasItem[]
  currentProjectPath: string | null
  isDirty: boolean
  projectMeta: ProjectMeta | null
  imageEditModeId: string | null
  setImageEditModeId: (id: string | null) => void
  _past: CanvasItem[][]
  _future: CanvasItem[][]
  addItem: (item: CanvasItem) => void
  addItems: (items: CanvasItem[]) => void
  updateItem: (id: string, updates: ItemUpdate) => void
  updateItemsBatch: (
    updates: Array<{ id: string; updates: ItemUpdate }>,
    options?: BatchUpdateOptions,
  ) => void
  replaceItems: (items: CanvasItem[], options?: ReplaceItemsOptions) => void
  removeItem: (id: string) => void
  removeItems: (ids: string[]) => void
  clearSelection: () => void
  selectOne: (id: string) => void
  toggleSelect: (id: string) => void
  setSelection: (ids: string[]) => void
  setViewport: (v: Partial<Viewport>) => void
  resetViewport: () => void
  frameAllItemsInViewport: (containerWidth: number, containerHeight: number) => void
  layoutMediaRow: () => void
  packAllTilesGrid: () => void
  undo: () => void
  redo: () => void
  setClipboard: (items: CanvasItem[]) => void
  pasteClipboard: (atX: number, atY: number, offsetX?: number, offsetY?: number) => void
  duplicateSelection: () => void
  setCurrentProjectPath: (path: string | null) => void
  markDirty: () => void
  markSaved: (path?: string | null) => void
  syncSavedProjectState: (project: DeserializedProject, projectPath: string | null) => void
  loadProjectState: (project: DeserializedProject, projectPath: string | null) => void
  getProjectDataForSave: () => { items: CanvasItem[]; viewport: ViewportState; meta: ProjectMeta }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  items: [],
  selectedIds: [],
  viewport: DEFAULT_VIEWPORT,
  clipboard: [],
  currentProjectPath: null,
  isDirty: false,
  projectMeta: null,
  imageEditModeId: null,
  _past: [],
  _future: [],

  setImageEditModeId: (id) => set({ imageEditModeId: id }),

  addItem: (item) => {
    get().addItems([item])
  },

  addItems: (items) => {
    if (!items.length) return
    set((state) => ({
      _past: pushPast(state._past, state.items),
      items: [...state.items, ...items],
      isDirty: true,
      _future: [],
    }))
  },

  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
      isDirty: true,
    })),

  updateItemsBatch: (updates, options) => {
    if (!updates.length) return
    const {
      markDirty = true,
      recordHistory = false,
      clearFuture = recordHistory,
    } = options ?? {}
    const updateMap = new Map(updates.map((entry) => [entry.id, entry.updates]))
    set((state) => ({
      ...(recordHistory ? { _past: pushPast(state._past, state.items) } : {}),
      items: state.items.map((item) => {
        const next = updateMap.get(item.id)
        return next ? { ...item, ...next } : item
      }),
      ...(markDirty ? { isDirty: true } : {}),
      ...(clearFuture ? { _future: [] } : {}),
    }))
  },

  replaceItems: (items, options) => {
    const {
      markDirty = true,
      recordHistory = false,
      clearFuture = recordHistory,
      selectedIds,
      imageEditModeId,
    } = options ?? {}
    set((state) => ({
      ...(recordHistory ? { _past: pushPast(state._past, state.items) } : {}),
      items,
      ...(selectedIds !== undefined ? { selectedIds } : {}),
      ...(imageEditModeId !== undefined ? { imageEditModeId } : {}),
      ...(markDirty ? { isDirty: true } : {}),
      ...(clearFuture ? { _future: [] } : {}),
    }))
  },

  removeItem: (id) =>
    set((state) => ({
      _past: pushPast(state._past, state.items),
      items: state.items.filter((item) => item.id !== id),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
      imageEditModeId: state.imageEditModeId === id ? null : state.imageEditModeId,
      isDirty: true,
      _future: [],
    })),

  removeItems: (ids) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    set((state) => ({
      _past: pushPast(state._past, state.items),
      items: state.items.filter((item) => !idSet.has(item.id)),
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
    set((state) => ({ viewport: { ...state.viewport, ...v } })),

  resetViewport: () =>
    set({ viewport: DEFAULT_VIEWPORT }),

  frameAllItemsInViewport: (containerWidth, containerHeight) => {
    const state = get()
    const { items } = state
    if (items.length === 0) return

    const pad = 56
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

    set({ viewport: { x, y, scale } })
  },

  layoutMediaRow: () => {
    const state = get()
    const videos = state.items.filter((i): i is Extract<CanvasItem, { type: 'video' }> => i.type === 'video')
    const images = state.items.filter((i): i is Extract<CanvasItem, { type: 'image' }> => i.type === 'image')
    if (videos.length === 0 && images.length === 0) return

    const media = [...videos, ...images]
    const anchorX = Math.min(...media.map((m) => m.x))
    const anchorY = Math.min(...media.map((m) => m.y))

    const pos = new Map<string, { x: number; y: number }>()

    const packRows = (tiles: typeof media, startY: number): number => {
      const sorted = sortByCanvasReadingOrder(tiles)
      let y = startY
      for (let i = 0; i < sorted.length; i += LAYOUT_ROW_CAP) {
        const row = sorted.slice(i, i + LAYOUT_ROW_CAP)
        let x = anchorX
        let rowH = 0
        for (const t of row) {
          pos.set(t.id, { x, y })
          rowH = Math.max(rowH, t.height)
          x += t.width + ROW_GAP
        }
        y += rowH + ROW_GAP
      }
      return y
    }

    let nextY = anchorY
    if (videos.length > 0) {
      nextY = packRows(videos, anchorY)
    }
    if (images.length > 0) {
      const imageStartY = videos.length > 0 ? nextY + LAYOUT_SECTION_GAP : anchorY
      packRows(images, imageStartY)
    }

    set((state) => ({
      _past: pushPast(state._past, state.items),
      items: state.items.map((item) => {
        const next = pos.get(item.id)
        return next ? { ...item, x: next.x, y: next.y } : item
      }),
      isDirty: true,
      _future: [],
    }))
  },

  packAllTilesGrid: () => {
    const state = get()
    const tiles = state.items
    if (tiles.length === 0) return

    const anchorX = Math.min(...tiles.map((m) => m.x))
    const anchorY = Math.min(...tiles.map((m) => m.y))
    const sorted = sortByCanvasReadingOrder(tiles)
    const pos = new Map<string, { x: number; y: number }>()

    let y = anchorY
    for (let i = 0; i < sorted.length; i += LAYOUT_ROW_CAP) {
      const row = sorted.slice(i, i + LAYOUT_ROW_CAP)
      let x = anchorX
      let rowH = 0
      for (const t of row) {
        pos.set(t.id, { x, y })
        rowH = Math.max(rowH, t.height)
        x += t.width + ROW_GAP
      }
      y += rowH + ROW_GAP
    }

    set((state) => ({
      _past: pushPast(state._past, state.items),
      items: state.items.map((item) => {
        const next = pos.get(item.id)
        return next ? { ...item, x: next.x, y: next.y } : item
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
        items: previous,
        _past: state._past.slice(0, -1),
        _future: [...state._future, current],
        selectedIds: [],
        imageEditModeId: null,
        isDirty: true,
      }
    }),

  redo: () =>
    set((state) => {
      if (state._future.length === 0) return {}
      const next = state._future[state._future.length - 1]
      const current = state.items
      return {
        items: next,
        _future: state._future.slice(0, -1),
        _past: [...state._past, current],
        selectedIds: [],
        imageEditModeId: null,
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

    const pastedItems: CanvasItem[] = clipboard.map((src, idx) => ({
      ...src,
      id: `${src.type}-${pasteIdPrefix}-${idx}`,
      x: atX + offsetX + (src.x - originX),
      y: atY + offsetY + (src.y - originY),
    }))
    const pastedIds = pastedItems.map((item) => item.id)

    set((state) => ({
      _past: pushPast(state._past, state.items),
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

    const newItems: CanvasItem[] = toDup.map((src, idx) => ({
      ...src,
      id: `${src.type}-${prefix}-${idx}`,
      x: src.x + offsetX,
      y: src.y + offsetY,
    }))
    const newIds = newItems.map((item) => item.id)

    set((state) => ({
      _past: pushPast(state._past, state.items),
      items: [...state.items, ...newItems],
      selectedIds: newIds,
      isDirty: true,
      _future: [],
    }))
  },

  setCurrentProjectPath: (path) => set({ currentProjectPath: path }),

  markDirty: () =>
    set((state) => (state.isDirty ? state : { isDirty: true })),

  markSaved: (path) =>
    set((state) => ({
      currentProjectPath: path !== undefined ? path : state.currentProjectPath,
      isDirty: false,
    })),

  syncSavedProjectState: (project, projectPath) =>
    set((state) => {
      const nextIdSet = new Set(project.items.map((item) => item.id))
      const selectedIds = state.selectedIds.filter((id) => nextIdSet.has(id))
      const imageEditModeId =
        state.imageEditModeId && nextIdSet.has(state.imageEditModeId)
          ? state.imageEditModeId
          : null

      return {
        items: project.items,
        viewport: project.viewport,
        selectedIds,
        currentProjectPath: projectPath,
        projectMeta: project.meta,
        imageEditModeId,
        isDirty: false,
      }
    }),

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
    queueMicrotask(() => {
      requestMediaWarmup()
    })
  },

  getProjectDataForSave: () => {
    const state = get()
    const now = new Date().toISOString()
    const createdAt = state.projectMeta?.createdAt ?? now
    const meta: ProjectMeta = {
      createdAt,
      updatedAt: now,
    }
    set({ projectMeta: meta })
    return { items: state.items, viewport: state.viewport, meta }
  },
}))
