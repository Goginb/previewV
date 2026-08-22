import React, { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { useCanvasStore } from '../store/canvasStore'
import { tileDomRegistry } from '../utils/tileDomRegistry'
import { collectLiveDragTargets } from '../utils/liveDragTargets'
import { MAX_NOTE_FONT_PX, MIN_NOTE_FONT_PX, getNoteFontPx } from '../utils/noteCreation'
import { getNoteColor, getNoteFontFamilyCss, hexToRgba, mixHexTowardWhite } from '../utils/noteStyle'
import type { NoteItem } from '../types'

interface NoteTileProps {
  note: NoteItem
  scale: number
  isSelected: boolean
  isHidden?: boolean
  isFarZoomMode?: boolean
}

function areNoteTilePropsEqual(a: NoteTileProps, b: NoteTileProps): boolean {
  return (
    a.note === b.note &&
    a.scale === b.scale &&
    a.isSelected === b.isSelected &&
    (a.isHidden ?? false) === (b.isHidden ?? false) &&
    (a.isFarZoomMode ?? false) === (b.isFarZoomMode ?? false)
  )
}

const CLICK_SUPPRESS_AFTER_DRAG_MS = 180
const NOTE_FONT_STEP_DEFAULT = 20
const NOTE_FONT_STEP_SHIFT = 10
const NOTE_FONT_STEP_CTRL = 5

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const NoteTile = memo(function NoteTile({ note, scale, isSelected, isHidden, isFarZoomMode }: NoteTileProps) {
  const updateItem = useCanvasStore((s) => s.updateItem)
  const updateItemsBatch = useCanvasStore((s) => s.updateItemsBatch)
  const selectOne    = useCanvasStore((s) => s.selectOne)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const canvasLocked = useCanvasStore((s) => s.canvasLocked)
  const interactionLocked = canvasLocked || !!note.locked
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }> | null>(null)
  const dragPeerElementsRef = useRef<HTMLElement[]>([])
  const suppressClickUntilRef = useRef(0)

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
    if (note.text === '' && !interactionLocked) {
      textareaRef.current?.focus()
    }
  }, [interactionLocked, note.text])

  const fontPx = getNoteFontPx(note)
  const canDecreaseFont = fontPx > MIN_NOTE_FONT_PX
  const canIncreaseFont = fontPx < MAX_NOTE_FONT_PX
  const noteColor = getNoteColor(note.color)
  const fontFamilyCss = getNoteFontFamilyCss(note.fontFamily)
  const noteTextColor = hexToRgba(mixHexTowardWhite(noteColor, 0.84), 0.95)
  const noteMutedTextColor = hexToRgba(mixHexTowardWhite(noteColor, 0.62), 0.82)
  const noteBorderColor = isSelected
    ? mixHexTowardWhite(noteColor, 0.38)
    : hexToRgba(noteColor, 0.6)
  const noteHeaderBackground = `linear-gradient(180deg, ${hexToRgba(noteColor, 0.58)} 0%, ${hexToRgba(noteColor, 0.34)} 100%)`
  const noteBackground = `linear-gradient(180deg, ${hexToRgba(noteColor, 0.18)} 0%, rgba(12, 12, 16, 0.92) 100%)`
  const noteShadow = isSelected
    ? `0 0 0 2px ${hexToRgba(noteColor, 0.44)}, 0 0 34px ${hexToRgba(noteColor, 0.28)}, 0 24px 48px rgba(0,0,0,0.4)`
    : '0 24px 48px rgba(0,0,0,0.32)'

  // Auto-resize textarea height within body; short text stays vertically centered via flex parent.
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    const body = bodyRef.current
    if (!el || !body) return
    const maxH = body.clientHeight
    el.style.maxHeight = `${maxH}px`
    el.style.height = 'auto'
    const sh = el.scrollHeight
    const h = Math.min(sh, maxH)
    el.style.height = `${Math.ceil(h)}px`
    el.style.overflowY = sh > maxH ? 'auto' : 'hidden'
  }, [])

  useLayoutEffect(() => {
    adjustHeight()
  }, [note.text, note.fontSize, note.fontSizeTier, note.fontFamily, note.width, note.height, adjustHeight])

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const ro = new ResizeObserver(() => adjustHeight())
    ro.observe(body)
    return () => ro.disconnect()
  }, [adjustHeight])

  useEffect(() => {
    const el = rootRef.current
    if (el) tileDomRegistry.set(note.id, el)
    return () => {
      tileDomRegistry.delete(note.id)
    }
  }, [note.id])

  const handleSelect = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if (e.ctrlKey || e.metaKey) toggleSelect(note.id)
    else if (!(isSelected && selectedIds.length > 1)) selectOne(note.id)
  }, [isSelected, note.id, selectOne, selectedIds.length, toggleSelect])
  const handleClickSelection = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.ctrlKey || e.metaKey) return
    if (Date.now() < suppressClickUntilRef.current) return
    if (isSelected && selectedIds.length > 1) {
      selectOne(note.id)
    }
  }, [isSelected, note.id, selectOne, selectedIds.length])
  const dragHandleClassName = 'note-root-drag-handle'
  const notePreviewText = note.text.trim() || 'Empty note'
  const showNavigationPreview = !!isFarZoomMode
  const getFontStep = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.ctrlKey || e.metaKey) return NOTE_FONT_STEP_CTRL
    if (e.shiftKey) return NOTE_FONT_STEP_SHIFT
    return NOTE_FONT_STEP_DEFAULT
  }, [])
  const updateFontByDelta = useCallback((delta: number) => {
    if (interactionLocked) return
    const nextFontPx = clampNumber(fontPx + delta, MIN_NOTE_FONT_PX, MAX_NOTE_FONT_PX)
    if (nextFontPx === fontPx) return
    updateItem(note.id, { fontSize: nextFontPx, fontSizeTier: undefined })
  }, [fontPx, interactionLocked, note.id, updateItem])

  return (
    <Rnd
      position={{ x: note.x, y: note.y }}
      size={{ width: note.width, height: note.height }}
      scale={scale}
      minWidth={140}
      minHeight={80}
      cancel=".note-no-drag, textarea, button"
      disableDragging={interactionLocked}
      enableResizing={!interactionLocked}
      onDragStart={() => {
        window.dispatchEvent(new CustomEvent('canvas-history-action'))
        const state = useCanvasStore.getState()
        if (!isSelected || state.selectedIds.length <= 1) {
          dragOriginsRef.current = null
          return
        }
        const origins = new Map<string, { x: number; y: number }>()
        for (const item of state.items) {
          if (state.selectedIds.includes(item.id) && !item.locked) {
            origins.set(item.id, { x: item.x, y: item.y })
          }
        }
        dragOriginsRef.current = origins
        dragPeerElementsRef.current = collectLiveDragTargets(origins.keys(), note.id)
      }}
      onDrag={(_, d) => {
        const origins = dragOriginsRef.current
        if (!origins || origins.size <= 1) return
        const start = origins.get(note.id)
        if (!start) return
        const dx = d.x - start.x
        const dy = d.y - start.y
        for (const el of dragPeerElementsRef.current) {
          el.style.transform = `translate(${dx}px, ${dy}px)`
        }
      }}
      onDragStop={(_, d) => {
        suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_AFTER_DRAG_MS
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
        const peers = dragPeerElementsRef.current
        dragPeerElementsRef.current = []

        requestAnimationFrame(() => {
          for (const el of peers) {
            el.style.transform = ''
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
        if (interactionLocked) return false
        if ('button' in e && typeof e.button === 'number' && e.button !== 0) return false
        window.dispatchEvent(new CustomEvent('canvas-history-action'))
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
      onClick={handleClickSelection}
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
        data-note-tile-root="true"
        data-item-id={note.id}
        className={[
          dragHandleClassName,
          'relative w-full h-full flex flex-col rounded-lg overflow-hidden border',
        ].join(' ')}
        style={{
          background: noteBackground,
          borderColor: noteBorderColor,
          boxShadow: noteShadow,
        }}
        onMouseDown={handleSelect}
        onClick={handleClickSelection}
      >
        {note.locked && (
          <div className="pointer-events-none absolute right-1.5 top-1.5 z-50 rounded border border-amber-400/40 bg-black/75 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-300">
            LOCK
          </div>
        )}
        {/* Drag handle */}
        <div
          className={[
            'flex items-center px-2 h-6 min-h-[24px] shrink-0',
            interactionLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
          ].join(' ')}
          style={{ background: noteHeaderBackground }}
        >
          <svg
            className="w-3 h-3 mr-1.5 shrink-0"
            style={{ color: noteMutedTextColor }}
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
            <rect x="2" y="7" width="12" height="1.5" rx="0.75" />
            <rect x="2" y="11" width="12" height="1.5" rx="0.75" />
          </svg>
          <span className="text-[10px] select-none leading-none" style={{ color: noteMutedTextColor }}>
            note
          </span>
          <div className="flex-1" />
          <button
            disabled={interactionLocked}
            className={[
              'note-no-drag h-5 min-w-[1.25rem] px-1 flex items-center justify-center rounded border text-[10px] font-semibold transition-opacity pointer-events-auto',
              canDecreaseFont && !interactionLocked ? 'opacity-100 hover:opacity-100' : 'opacity-40 cursor-default',
            ].join(' ')}
            title="Decrease text size (20px, Shift 10px, Ctrl 5px)"
            onMouseDown={(e) => {
              e.stopPropagation()
              if (!canDecreaseFont || interactionLocked) return
              updateFontByDelta(-getFontStep(e))
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
              color: noteMutedTextColor,
              background: hexToRgba(noteColor, 0.14),
              borderColor: hexToRgba(noteColor, 0.24),
            }}
          >
            -
          </button>
          <div
            className="note-no-drag min-w-[2.75rem] px-1.5 text-[9px] font-semibold text-center select-none"
            style={{ color: noteMutedTextColor }}
          >
            {fontPx}px
          </div>
          <button
            disabled={interactionLocked}
            className={[
              'note-no-drag h-5 min-w-[1.25rem] px-1 flex items-center justify-center rounded border text-[10px] font-semibold transition-opacity pointer-events-auto',
              canIncreaseFont && !interactionLocked ? 'opacity-100 hover:opacity-100' : 'opacity-40 cursor-default',
            ].join(' ')}
            title="Increase text size (20px, Shift 10px, Ctrl 5px)"
            onMouseDown={(e) => {
              e.stopPropagation()
              if (!canIncreaseFont || interactionLocked) return
              updateFontByDelta(getFontStep(e))
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
              color: noteMutedTextColor,
              background: hexToRgba(noteColor, 0.14),
              borderColor: hexToRgba(noteColor, 0.24),
            }}
          >
            +
          </button>
        </div>

        {/* Text area wrapper for vertical centering */}
        <div
          ref={bodyRef}
          className="flex-1 min-h-0 w-full flex items-center justify-center px-2.5 pb-2.5 overflow-hidden"
        >
          {showNavigationPreview && (
            <div className="w-full text-center select-none">
              <div
                className="mx-auto max-w-full whitespace-pre-wrap break-words"
                style={{
                  fontSize: `${Math.max(12, Math.min(fontPx, 20))}px`,
                  lineHeight: 1.45,
                  color: noteTextColor,
                  fontFamily: fontFamilyCss,
                }}
              >
                {notePreviewText}
              </div>
            </div>
          )}
          <textarea
            ref={textareaRef}
            readOnly={interactionLocked}
            className={[
              'note-no-drag w-full max-h-full resize-none bg-transparent text-center',
              'outline-none leading-relaxed',
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
              display: showNavigationPreview ? 'none' : undefined,
              fontSize: `${fontPx}px`,
              fontFamily: fontFamilyCss,
              color: noteTextColor,
              caretColor: noteTextColor,
              overflowWrap: 'anywhere',
            }}
            rows={1}
            spellCheck={false}
          />
        </div>
      </div>
    </Rnd>
  )
}, areNoteTilePropsEqual)
