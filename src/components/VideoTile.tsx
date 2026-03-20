import React, { useCallback, useEffect, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { useCanvasStore } from '../store/canvasStore'
import { videoRegistry } from '../utils/videoRegistry'
import { tileDomRegistry } from '../utils/tileDomRegistry'
import type { VideoItem } from '../types'

interface VideoTileProps {
  tile: VideoItem
  scale: number
  isSelected: boolean
}

export const VideoTile: React.FC<VideoTileProps> = ({ tile, scale, isSelected }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const updateItem = useCanvasStore((s) => s.updateItem)
  const selectOne   = useCanvasStore((s) => s.selectOne)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }> | null>(null)

  // Register/unregister video element so F3 can capture the current frame
  useEffect(() => {
    const video = videoRef.current
    if (video) videoRegistry.set(tile.id, video)
    return () => { videoRegistry.delete(tile.id) }
  }, [tile.id])

  useEffect(() => {
    const el = rootRef.current
    if (el) tileDomRegistry.set(tile.id, el)
    return () => {
      tileDomRegistry.delete(tile.id)
    }
  }, [tile.id])

  const handleCanPlay = useCallback(() => {
    videoRef.current?.play().catch(() => {})
  }, [])

  return (
    <Rnd
      position={{ x: tile.x, y: tile.y }}
      size={{ width: tile.width, height: tile.height }}
      scale={scale}
      minWidth={160}
      minHeight={110}
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
        const start = origins.get(tile.id)
        if (!start) return
        const dx = d.x - start.x
        const dy = d.y - start.y

        for (const [id] of origins) {
          if (id === tile.id) continue
          const el = tileDomRegistry.get(id)
          if (el) el.style.transform = `translate(${dx}px, ${dy}px)`
        }
      }}
      onDragStop={(_, d) => {
        const origins = dragOriginsRef.current
        if (!origins || origins.size <= 1) {
          updateItem(tile.id, { x: d.x, y: d.y })
          return
        }
        const currentOrigin = origins.get(tile.id)
        if (!currentOrigin) {
          updateItem(tile.id, { x: d.x, y: d.y })
          return
        }
        const dx = d.x - currentOrigin.x
        const dy = d.y - currentOrigin.y
        for (const [id, pos] of origins) {
          updateItem(id, { x: pos.x + dx, y: pos.y + dy })
        }
        dragOriginsRef.current = null

        // Remove temporary transforms after store update applied.
        requestAnimationFrame(() => {
          for (const id of origins.keys()) {
            if (id === tile.id) continue
            const el = tileDomRegistry.get(id)
            if (el) el.style.transform = ''
          }
        })
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        updateItem(tile.id, {
          x: position.x,
          y: position.y,
          width: parseInt(ref.style.width, 10),
          height: parseInt(ref.style.height, 10),
        })
      }}
      style={{ zIndex: 10, pointerEvents: 'auto' }}
      dragHandleClassName="tile-drag-handle"
      onMouseDown={(e) => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey) toggleSelect(tile.id)
        else if (!isSelected) selectOne(tile.id)
      }}
    >
      <div
        ref={rootRef}
        className={[
          'w-full h-full flex flex-col rounded-lg overflow-hidden shadow-2xl bg-zinc-900 border',
          isSelected ? 'border-indigo-500' : 'border-zinc-700/60',
        ].join(' ')}
      >
        <div className="tile-drag-handle flex items-center px-2 h-6 min-h-[24px] bg-zinc-800/80 cursor-grab active:cursor-grabbing shrink-0">
          <span className="text-[11px] text-zinc-400 truncate leading-none select-none">
            {tile.fileName}
          </span>
        </div>
        <div className="flex-1 overflow-hidden bg-black">
          <video
            ref={videoRef}
            src={tile.srcUrl}
            className="w-full h-full object-contain"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={handleCanPlay}
          />
        </div>
      </div>
    </Rnd>
  )
}
