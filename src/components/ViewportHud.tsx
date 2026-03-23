import React, { useEffect, useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import {
  getVideoPlaybackSuspended,
  setVideoPlaybackSuspended,
  subscribeVideoPlaybackSuspended,
} from '../utils/videoGlobalPlayback'

/** Visible proof that the renderer bundle is the one Vite is serving / you rebuilt. */
const RENDERER_BUILD_ID = 'pv-0.2.0-en-ui'

export const ViewportHud: React.FC = () => {
  const scale = useCanvasStore((s) => s.viewport.scale)
  const resetViewport = useCanvasStore((s) => s.resetViewport)
  const frameAllItemsInViewport = useCanvasStore((s) => s.frameAllItemsInViewport)
  const packAllTilesGrid = useCanvasStore((s) => s.packAllTilesGrid)

  const runFrameAll = () => {
    const el = document.getElementById('previewv-canvas-root')
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    frameAllItemsInViewport(width, height)
  }

  const [playbackSuspended, setPlaybackSuspended] = useState(getVideoPlaybackSuspended)
  useEffect(() => {
    return subscribeVideoPlaybackSuspended(() => {
      setPlaybackSuspended(getVideoPlaybackSuspended())
    })
  }, [])

  const modeLabel = import.meta.env.DEV ? 'DEV' : 'PROD'

  return (
    <div className="fixed bottom-4 right-4 flex flex-col items-end gap-1 pointer-events-auto select-none z-[1000] max-w-[min(100vw-2rem,22rem)]">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-700/80 bg-zinc-900/90 text-zinc-400"
          title="If this line never changes after edits, you are not running this source tree / fresh build."
        >
          <span className={import.meta.env.DEV ? 'text-emerald-400' : 'text-amber-400'}>{modeLabel}</span>
          <span className="text-zinc-500"> · </span>
          <span className="text-zinc-500">{RENDERER_BUILD_ID}</span>
        </span>
        <span className="text-xs text-zinc-500 tabular-nums">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => setVideoPlaybackSuspended(!getVideoPlaybackSuspended())}
          title={
            playbackSuspended
              ? 'Resume auto-playback for visible videos'
              : 'Stop all videos (global pause)'
          }
          className={[
            'text-xs px-2 py-1 rounded border transition-colors',
            playbackSuspended
              ? 'text-amber-300 bg-amber-950/80 border-amber-700/60 hover:border-amber-500'
              : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900/80 border-zinc-700/50 hover:border-zinc-600',
          ].join(' ')}
        >
          {playbackSuspended ? '▶ Play all' : '⏹ Stop all'}
        </button>
        <button
          type="button"
          onClick={() => packAllTilesGrid()}
          title="Grid pack: shift non-overlapping videos (selected only if selected) (\)"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded bg-zinc-900/80 border border-zinc-700/50 hover:border-zinc-600"
        >
          Grid pack (\)
        </button>
        <button
          type="button"
          onClick={runFrameAll}
          title="Fit all tiles in view (A)"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded bg-zinc-900/80 border border-zinc-700/50 hover:border-zinc-600"
        >
          Fit all (A)
        </button>
        <button
          type="button"
          onClick={resetViewport}
          title="Reset view (double-click canvas)"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded bg-zinc-900/80 border border-zinc-700/50 hover:border-zinc-600"
        >
          Reset view
        </button>
      </div>
    </div>
  )
}
