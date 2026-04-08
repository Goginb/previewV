import React, { useCallback, useEffect, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { useCanvasStore } from '../store/canvasStore'
import { tileDomRegistry } from '../utils/tileDomRegistry'
import type { NoteItem } from '../types'

interface NoteTileProps {
  note: NoteItem
  scale: number
  isSelected: boolean
  isHidden?: boolean
}

export const NoteTile: React.FC<NoteTileProps> = ({ note, scale, isSelected, isHidden }) => {
  const updateItem = useCanvasStore((s) => s.updateItem)
  const updateItemsBatch = useCanvasStore((s) => s.updateItemsBatch)
  const selectOne    = useCanvasStore((s) => s.selectOne)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }> | null>(null)

  // Smooth resize: while dragging resize handles, update store throttled to rAF.
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
          [{ id: note.id, updates: { x: p.x, y: p.y, width: p.width, height: p.height } }],
          { markDirty: false, recordHistory: false },
        )
      })
    },
    [note.id, updateItemsBatch],
  )

  // Auto-focus the textarea when the note is first created (empty text)
  useEffect(() => {
    if (note.text === '') {
      textareaRef.current?.focus()
    }
  }, [note.text])

  // Auto-resize textarea height to fit content for vertical centering
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.ceil(el.scrollHeight)}px`
  }, [])
  
  useEffect(() => {
    adjustHeight()
  }, [note.text, note.fontSize, note.width, note.height, adjustHeight])

  useEffect(() => {
    const el = rootRef.current
    if (el) tileDomRegistry.set(note.id, el)
    return () => {
      tileDomRegistry.delete(note.id)
    }
  }, [note.id])

  const handleSelect = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.ctrlKey || e.metaKey) toggleSelect(note.id)
    else if (!isSelected) selectOne(note.id)
  }, [isSelected, note.id, selectOne, toggleSelect])
  const dragHandleClassName = 'note-root-drag-handle'

  return (
    <Rnd
      position={{ x: note.x, y: note.y }}
      size={{ width: note.width, height: note.height }}
      scale={scale}
      minWidth={140}
      minHeight={80}
      cancel=".note-no-drag, textarea, button"
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
        const start = origins.get(note.id)
        if (!start) return
        const dx = d.x - start.x
        const dy = d.y - start.y
        for (const [id] of origins) {
          if (id === note.id) continue
          const el = tileDomRegistry.get(id)
          if (el) el.style.transform = `translate(${dx}px, ${dy}px)`
        }
      }}
      onDragStop={(_, d) => {
        const origins = dragOriginsRef.current
        if (!origins || origins.size <= 1) {
          updateItemsBatch([{ id: note.id, updates: { x: d.x, y: d.y } }], { recordHistory: true })
          return
        }
        const currentOrigin = origins.get(note.id)
        if (!currentOrigin) {
          updateItemsBatch([{ id: note.id, updates: { x: d.x, y: d.y } }], { recordHistory: true })
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
            if (id === note.id) continue
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
      onResizeStart={(e) => {
        if ('button' in e && typeof e.button === 'number' && e.button !== 0) return false
        resizeActiveRef.current = true
        updateItemsBatch([{ id: note.id, updates: {} }], { recordHistory: true })
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        if (!resizeActiveRef.current) return
        resizeActiveRef.current = false
        updateItemsBatch(
          [{
            id: note.id,
            updates: {
              x: position.x,
              y: position.y,
              width: parseInt(ref.style.width, 10),
              height: parseInt(ref.style.height, 10),
            },
          }],
          { recordHistory: false },
        )
      }}
      style={{ 
        zIndex: 20, 
        pointerEvents: isHidden ? 'none' : 'auto',
        visibility: isHidden ? 'hidden' : 'visible'
      }}
      dragHandleClassName={dragHandleClassName}
      onMouseDown={handleSelect}
      onDoubleClick={(e: any) => {
        e.stopPropagation()
        const root = document.getElementById('previewv-canvas-root')
        if (root) {
          const rect = root.getBoundingClientRect()
          useCanvasStore.getState().frameItemInViewport(note.id, rect.width, rect.height)
        }
      }}
    >
      <div
        ref={rootRef}
        className={[
          dragHandleClassName,
          'w-full h-full flex flex-col rounded-lg overflow-hidden shadow-2xl',
          'bg-amber-950/80 border',
          isSelected
            ? 'border-amber-300 ring-2 ring-amber-400/80 shadow-[0_0_0_1px_rgba(251,191,36,0.30),0_0_24px_rgba(251,191,36,0.22)]'
            : 'border-amber-800/60',
        ].join(' ')}
        onMouseDown={handleSelect}
      >
        {/* Drag handle */}
        <div className="flex items-center px-2 h-6 min-h-[24px] bg-amber-900/60 cursor-grab active:cursor-grabbing shrink-0">
          <svg className="w-3 h-3 text-amber-600 mr-1.5 shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
            <rect x="2" y="7" width="12" height="1.5" rx="0.75" />
            <rect x="2" y="11" width="12" height="1.5" rx="0.75" />
          </svg>
          <span className="text-[10px] text-amber-600/80 select-none leading-none">note</span>
          <div className="flex-1" />
          <button
            className="note-no-drag w-5 h-5 flex items-center justify-center rounded hover:bg-amber-800/80 text-[10px] text-amber-500/80 hover:text-amber-300 transition-colors pointer-events-auto"
            title="Decrease font size"
            onMouseDown={(e) => {
              e.stopPropagation()
              updateItem(note.id, { fontSize: Math.max(10, (note.fontSize || 14) - 2) })
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            A-
          </button>
          <button
            className="note-no-drag w-5 h-5 flex items-center justify-center rounded hover:bg-amber-800/80 text-[11px] font-medium text-amber-500/80 hover:text-amber-300 transition-colors pointer-events-auto ml-0.5"
            title="Increase font size"
            onMouseDown={(e) => {
              e.stopPropagation()
              updateItem(note.id, { fontSize: Math.min(64, (note.fontSize || 14) + 2) })
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            A+
          </button>
        </div>

        {/* Text area wrapper for vertical centering */}
        <div className="flex-1 w-full flex items-center justify-center p-2.5 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <textarea
            ref={textareaRef}
            className={[
              'note-no-drag w-full resize-none bg-transparent text-center',
              note.fontSize ? '' : 'text-sm',
              'text-amber-100/90 placeholder-amber-700/60',
              'outline-none leading-relaxed overflow-hidden',
            ].join(' ')}
            value={note.text}
            onChange={(e) => {
              updateItem(note.id, { text: e.target.value })
              adjustHeight()
            }}
            onFocus={() => selectOne(note.id)}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            placeholder="Type a note…"
            style={{
              fontSize: note.fontSize ? `${note.fontSize}px` : undefined,
              overflowWrap: 'anywhere',
            }}
            rows={1}
            spellCheck={false}
          />
        </div>
      </div>
    </Rnd>
  )
}
