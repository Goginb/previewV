import React from 'react'
import { useCanvasStore } from '../store/canvasStore'

export const ViewportHud: React.FC = () => {
  const scale = useCanvasStore((s) => s.viewport.scale)
  const resetViewport = useCanvasStore((s) => s.resetViewport)

  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-2 pointer-events-auto select-none z-50">
      <span className="text-xs text-zinc-500 tabular-nums">
        {Math.round(scale * 100)}%
      </span>
      <button
        onClick={resetViewport}
        title="Reset view  (double-click canvas)"
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded bg-zinc-900/80 border border-zinc-700/50 hover:border-zinc-600"
      >
        Reset view
      </button>
    </div>
  )
}
