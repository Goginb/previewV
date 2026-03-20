import React, { useEffect, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { useCanvasStore } from '../store/canvasStore'
import type { NoteItem } from '../types'

interface NoteTileProps {
  note: NoteItem
  scale: number
  isSelected: boolean
}

export const NoteTile: React.FC<NoteTileProps> = ({ note, scale, isSelected }) => {
  const updateItem = useCanvasStore((s) => s.updateItem)
  const selectOne    = useCanvasStore((s) => s.selectOne)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }> | null>(null)

  // Auto-focus the textarea when the note is first created (empty text)
  useEffect(() => {
    if (note.text === '') {
      textareaRef.current?.focus()
    }
  }, [note.text])

  return (
    <Rnd
      position={{ x: note.x, y: note.y }}
      size={{ width: note.width, height: note.height }}
      scale={scale}
      minWidth={140}
      minHeight={80}
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
      onDragStop={(_, d) => {
        const origins = dragOriginsRef.current
        if (!origins || origins.size <= 1) {
          updateItem(note.id, { x: d.x, y: d.y })
          return
        }
        const currentOrigin = origins.get(note.id)
        if (!currentOrigin) {
          updateItem(note.id, { x: d.x, y: d.y })
          return
        }
        const dx = d.x - currentOrigin.x
        const dy = d.y - currentOrigin.y
        for (const [id, pos] of origins) {
          updateItem(id, { x: pos.x + dx, y: pos.y + dy })
        }
        dragOriginsRef.current = null
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        updateItem(note.id, {
          x: position.x,
          y: position.y,
          width: parseInt(ref.style.width, 10),
          height: parseInt(ref.style.height, 10),
        })
      }}
      style={{ zIndex: 20, pointerEvents: 'auto' }}
      dragHandleClassName="note-drag-handle"
      onMouseDown={(e) => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey) toggleSelect(note.id)
        else if (!isSelected) selectOne(note.id)
      }}
    >
      <div
        className={[
          'w-full h-full flex flex-col rounded-lg overflow-hidden shadow-2xl',
          'bg-amber-950/80 border',
          isSelected ? 'border-amber-400' : 'border-amber-800/60',
        ].join(' ')}
      >
        {/* Drag handle */}
        <div className="note-drag-handle flex items-center px-2 h-6 min-h-[24px] bg-amber-900/60 cursor-grab active:cursor-grabbing shrink-0">
          <svg className="w-3 h-3 text-amber-600 mr-1.5 shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
            <rect x="2" y="7" width="12" height="1.5" rx="0.75" />
            <rect x="2" y="11" width="12" height="1.5" rx="0.75" />
          </svg>
          <span className="text-[10px] text-amber-600/80 select-none leading-none">note</span>
        </div>

        {/* Text area */}
        <textarea
          ref={textareaRef}
          value={note.text}
          onChange={(e) => updateItem(note.id, { text: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Type a note…"
          className={[
            'flex-1 w-full resize-none bg-transparent px-2.5 py-2',
            'text-sm text-amber-100/90 placeholder-amber-700/60',
            'outline-none leading-relaxed',
          ].join(' ')}
          spellCheck={false}
        />
      </div>
    </Rnd>
  )
}
