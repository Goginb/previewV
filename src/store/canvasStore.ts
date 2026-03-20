import { create } from 'zustand'
import type { CanvasItem, ItemUpdate } from '../types'

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

  _past: CanvasItem[][]

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

  /** Align selected video + image tiles in a horizontal row (left → right) */
  layoutMediaRow: () => void

  undo: () => void

  setClipboard: (items: CanvasItem[]) => void
  pasteClipboard: (atX: number, atY: number, offsetX?: number, offsetY?: number) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  items:        [],
  selectedIds:  [],
  viewport:     DEFAULT_VIEWPORT,
  clipboard:    [],
  _past:        [],

  addItem: (item) =>
    set((state) => ({
      _past: [...state._past.slice(-(MAX_HISTORY - 1)), [...state.items]],
      items: [...state.items, item],
    })),

  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
    })),

  removeItem: (id) =>
    set((state) => ({
      _past:      [...state._past.slice(-(MAX_HISTORY - 1)), [...state.items]],
      items:      state.items.filter((item) => item.id !== id),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    })),

  removeItems: (ids) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    set((state) => ({
      _past:      [...state._past.slice(-(MAX_HISTORY - 1)), [...state.items]],
      items:      state.items.filter((item) => !idSet.has(item.id)),
      selectedIds: state.selectedIds.filter((sid) => !idSet.has(sid)),
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
    }))
  },

  undo: () =>
    set((state) => {
      if (state._past.length === 0) return {}
      const previous = state._past[state._past.length - 1]
      return {
        items:       previous,
        _past:       state._past.slice(0, -1),
        selectedIds: [],
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
    }))
  },
}))
